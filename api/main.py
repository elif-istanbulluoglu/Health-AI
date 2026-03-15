from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from imblearn.over_sampling import SMOTE
import json

app = FastAPI(title="Health-AI Data Preparation API")

# Allow requests from the local UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to the specific UI origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from typing import List, Dict, Any

class PreparationSettings(BaseModel):
    missingValueStrategy: str  # 'median', 'mode', 'drop'
    normalisation: str         # 'zscore', 'minmax', 'none'
    smote: bool
    classWeights: bool = False  # used in Step 4 model training
    testSize: float            # e.g., 0.2

class PrepareRequest(BaseModel):
    rawRows: List[Dict[str, Any]]
    columns: List[Dict[str, Any]]        # Contains {name: str, type: str, role: str}
    targetColumn: str
    settings: PreparationSettings

def get_stats(df, col_name, col_type):
    # Returns statistics for the "Before & After" visualization
    if col_type in ['numeric'] and col_name in df.columns:
        series = pd.to_numeric(df[col_name], errors='coerce')
        valid_data = series.dropna()
        if len(valid_data) == 0:
            return None
        return {
            "min": float(valid_data.min()),
            "max": float(valid_data.max()),
            "mean": float(valid_data.mean())
        }
    return None

def get_class_balance(df, target_col):
    if target_col not in df.columns:
        return {}
    counts = df[target_col].value_counts(dropna=True)
    total = len(df[target_col].dropna())
    if total == 0:
        return {}
    return {str(k): {"count": int(v), "pct": round((int(v)/total)*100, 1)} for k, v in counts.items()}

@app.post("/api/prepare")
async def prepare_data(req: PrepareRequest):
    try:
        # 1. Convert to DataFrame
        df = pd.DataFrame(req.rawRows)
        if df.empty:
            raise HTTPException(status_code=400, detail="Empty dataset provided")

        if req.targetColumn not in df.columns:
            raise HTTPException(status_code=400, detail=f"Target column '{req.targetColumn}' not found in data")

        # Organize columns by role
        feature_cols = [c['name'] for c in req.columns if c['role'] in ['numeric', 'category'] and c['name'] in df.columns]
        num_cols = [c['name'] for c in req.columns if c['role'] == 'numeric' and c['name'] in df.columns]
        cat_cols = [c['name'] for c in req.columns if c['role'] == 'category' and c['name'] in df.columns]

        # Calculate "Before" stats for visual comparisons
        before_stats = {
            "class_balance": get_class_balance(df, req.targetColumn),
            "features": {}
        }
        for col in num_cols:
            before_stats["features"][col] = get_stats(df, col, 'numeric')

        # Drop ignored/identifier columns
        keep_cols = feature_cols + [req.targetColumn]
        df = df[keep_cols]

        # 2. Handle missing target values (drop rows where target is NaN)
        df = df.dropna(subset=[req.targetColumn])
        
        # Split features (X) and target (y)
        X = df[feature_cols].copy()
        y = df[req.targetColumn]

        # Force numeric columns to float (raw CSV often has string dtype)
        for col in num_cols:
            X[col] = pd.to_numeric(X[col], errors='coerce').astype(np.float64)

        # 3. Train / Test Split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=req.settings.testSize, random_state=42, stratify=y if len(y.unique()) > 1 else None
        )

        # Exclude all-NaN columns (SimpleImputer skips them, causing IndexError)
        num_cols_valid = [c for c in num_cols if X_train[c].notna().any()]
        cat_cols_valid = [c for c in cat_cols if X_train[c].notna().any()]
        # Drop all-NaN columns from data
        drop_cols = [c for c in num_cols + cat_cols if c not in num_cols_valid and c not in cat_cols_valid]
        if drop_cols:
            X_train = X_train.drop(columns=drop_cols)
            X_test = X_test.drop(columns=drop_cols)
            feature_cols = [c for c in feature_cols if c not in drop_cols]
        num_cols = num_cols_valid
        cat_cols = cat_cols_valid

        # 4. Handle Missing Values
        if req.settings.missingValueStrategy == 'drop':
            # Drop rows with any NaN in training
            train_mask = X_train.notna().all(axis=1)
            X_train = X_train[train_mask]
            y_train = y_train[train_mask]
            # Drop rows with any NaN in testing
            test_mask = X_test.notna().all(axis=1)
            X_test = X_test[test_mask]
            y_test = y_test[test_mask]
        else:
            # Imputation
            strategy = 'median' if req.settings.missingValueStrategy == 'median' else 'most_frequent'
            if num_cols:
                num_imputer = SimpleImputer(strategy=strategy)
                arr_train = num_imputer.fit_transform(X_train[num_cols])
                arr_test = num_imputer.transform(X_test[num_cols]) if not X_test.empty else None
                for i, col in enumerate(num_cols):
                    X_train[col] = arr_train[:, i].astype(np.float64)
                    if arr_test is not None:
                        X_test[col] = arr_test[:, i].astype(np.float64)
            if cat_cols:
                cat_imputer = SimpleImputer(strategy='most_frequent')
                arr_train = cat_imputer.fit_transform(X_train[cat_cols])
                arr_test = cat_imputer.transform(X_test[cat_cols]) if not X_test.empty else None
                for i, col in enumerate(cat_cols):
                    X_train[col] = arr_train[:, i]
                    if arr_test is not None:
                        X_test[col] = arr_test[:, i]

        # 5. Normalisation
        if req.settings.normalisation != 'none' and num_cols:
            scaler = StandardScaler() if req.settings.normalisation == 'zscore' else MinMaxScaler()
            arr_train = scaler.fit_transform(X_train[num_cols])
            arr_test = scaler.transform(X_test[num_cols]) if not X_test.empty else None
            for i, col in enumerate(num_cols):
                X_train[col] = arr_train[:, i].astype(np.float64)
                if arr_test is not None:
                    X_test[col] = arr_test[:, i].astype(np.float64)

        # Calculate "After" stats (without SMOTE) to reflect normalisation transformations
        after_stats = {
            "class_balance_before_smote": get_class_balance(pd.DataFrame({req.targetColumn: y_train}), req.targetColumn),
            "features": {}
        }
        for col in num_cols:
            after_stats["features"][col] = get_stats(X_train, col, 'numeric')

        # 6. Apply SMOTE (only on training data)
        applied_smote = False
        if req.settings.smote and len(y_train.unique()) > 1:
            try:
                min_class_count = int(y_train.value_counts().min())
                if min_class_count > 5:
                    col_names = X_train.columns.tolist()
                    encoders = {}
                    X_train_encoded = X_train.copy()
                    for col in cat_cols:
                        encoded, uniques = pd.factorize(X_train_encoded[col])
                        encoders[col] = np.array(uniques)
                        X_train_encoded[col] = encoded.astype(float)
                    
                    smote = SMOTE(random_state=42)
                    X_res, y_res = smote.fit_resample(X_train_encoded, y_train)
                    
                    # Rebuild DataFrame: SMOTE returns numpy array, decode categoricals
                    X_train = pd.DataFrame(X_res, columns=col_names)
                    y_train = y_res
                    for col in cat_cols:
                        labels = encoders[col]
                        raw = X_train[col].values
                        decoded = []
                        for v in raw:
                            idx = int(round(float(v)))
                            if 0 <= idx < len(labels):
                                decoded.append(labels[idx])
                            else:
                                decoded.append(labels[0] if len(labels) > 0 else None)
                        X_train[col] = decoded
                    
                    applied_smote = True
            except Exception as e:
                print(f"SMOTE failed, continuing without it: {str(e)}")
                # SMOTE fails e.g if there are missing values (which we handled) or very small minority samples

        after_stats["class_balance"] = get_class_balance(pd.DataFrame({req.targetColumn: y_train}), req.targetColumn)
        after_stats["applied_smote"] = applied_smote

        # Reconstruct full DataFrames to send back to JS
        train_df = X_train.copy()
        train_df[req.targetColumn] = y_train.values

        test_df = X_test.copy()
        test_df[req.targetColumn] = y_test.values

        # Convert NaNs back to None for JSON serialization
        train_df = train_df.fillna("None").replace({np.nan: "None"})
        test_df = test_df.fillna("None").replace({np.nan: "None"})

        return {
            "ok": True,
            "trainRows": train_df.to_dict(orient="records"),
            "testRows": test_df.to_dict(orient="records"),
            "beforeStats": before_stats,
            "afterStats": after_stats
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
