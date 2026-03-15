// step3_backend.js
// Handles Data Preparation (Handling Missing Values, Normalisation, Train/Test Split, SMOTE)
// Communicates with FastAPI backend running on http://localhost:8000/api/prepare

const API_BASE = 'http://127.0.0.1:8000';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialise dynamic texts (Slider values, record counts)
    initStep3UI();

    // 2. Bind the "Apply Preparation Settings" button
    const applyBtn = document.querySelector('#step-3 .btn.teal');
    if (applyBtn) {
        applyBtn.addEventListener('click', onApplyPreparation);
    }
});

function initStep3UI() {
    const ds = loadDataset();
    if (!ds) return; // Not reached step 2 yet

    const slider = document.getElementById('splitSlider');
    const splitVal = document.getElementById('splitVal');
    const splitHint = document.getElementById('splitHint');
    
    // Default 80% split
    const updateHint = () => {
        let pct = parseInt(slider.value, 10);
        splitVal.textContent = pct + '%';
        let trainCount = Math.floor(ds.rows * (pct / 100));
        let testCount = ds.rows - trainCount;
        if (splitHint) {
            splitHint.innerHTML = `Training: <b>${trainCount.toLocaleString()}</b> patients · Testing: <b>${testCount.toLocaleString()}</b> patients`;
        }
    };

    if (slider) {
        slider.addEventListener('input', updateHint);
        updateHint(); // Run once
    }

    // Dynamic warning texts: Target class balance and missing pct hints
    updateHintsWarning(ds);

    // Before user clicks "Apply Settings", show placeholder text instead of charts
    resetTransformStatsPlaceholder();
}

function updateHintsWarning(ds) {
    if (!ds) return;
    const missingWrap = document.getElementById('missingDropdownWrap');
    const missingMsg = document.getElementById('missingNoValuesMsg');
    const missingHint = document.getElementById('missingHint');
    const hasMissing = ds.totalMissingPct > 0;
    if (missingWrap) missingWrap.style.display = hasMissing ? 'block' : 'none';
    if (missingMsg) missingMsg.style.display = hasMissing ? 'none' : 'block';
    if (missingHint && hasMissing) {
        missingHint.innerHTML = `Dataset has <b>${ds.totalMissingPct}%</b> missing values. Filling with median/mode preserves all ${ds.rows} patients.`;
    }

    // SMOTE: show dropdown when imbalanced; show message when balanced (50/50)
    const smoteWrap = document.getElementById('smoteDropdownWrap');
    const smoteMsg = document.getElementById('smoteBalancedMsg');
    const smoteSel = document.getElementById('smoteSelect');
    const isBalanced = !ds.imbalanceRatio || ds.imbalanceRatio <= 1.25;
    if (smoteWrap) smoteWrap.style.display = isBalanced ? 'none' : 'block';
    if (smoteMsg) smoteMsg.style.display = isBalanced ? 'block' : 'none';
    const smoteHint = document.getElementById('smoteHint');
    if (smoteHint && !isBalanced) {
        if (ds.imbalanceRatio && ds.imbalanceRatio > 1.5) {
            const minorityPct = Math.round(100 / (ds.imbalanceRatio + 1));
            smoteHint.innerHTML = `Because only ~<b>${minorityPct}%</b> belong to the minority class, SMOTE will create extra examples so the model learns both groups equally well.`;
        } else {
            smoteHint.innerHTML = `Dataset has some imbalance. SMOTE is optional — apply it to balance the classes.`;
        }
    }
}

async function onApplyPreparation() {
    const ds = loadDataset();
    if (!ds || !ds.rawRows || ds.rawRows.length === 0) {
        alert("No dataset loaded. Please go back to Step 2 and load a dataset.");
        return;
    }

    const btn = document.querySelector('#step-3 .btn.teal');
    const origText = btn.innerHTML;
    btn.innerHTML = '⏳ Processing in Python Backend...';
    btn.disabled = true;

    // Collect settings
    const slider = document.getElementById('splitSlider');
    const testSize = 1.0 - (parseInt(slider.value, 10) / 100);

    const missingSel = document.getElementById('missingSelect');
    const missingStr = (missingSel ? missingSel.options[missingSel.selectedIndex].text : '').toLowerCase();
    let strat = 'median';
    if (missingStr.includes('mode')) strat = 'mode';
    if (missingStr.includes('remove')) strat = 'drop';

    const normSel = document.getElementById('normSelect');
    const normStr = (normSel ? normSel.options[normSel.selectedIndex].text : '').toLowerCase();
    let norm = 'zscore';
    if (normStr.includes('min-max') || normStr.includes('minmax')) norm = 'minmax';
    if (normStr.includes('none')) norm = 'none';

    const isBalanced = !ds.imbalanceRatio || ds.imbalanceRatio <= 1.25;
    let smote = false;
    let classWeights = false;
    const smoteSel = document.getElementById('smoteSelect');
    if (!isBalanced && smoteSel) {
        const smoteStr = smoteSel.options[smoteSel.selectedIndex].text.toLowerCase();
        smote = smoteStr.includes('smote');
        classWeights = smoteStr.includes('class weight');
    }

    // Merge column roles from mapper (loadColumnRoles) and resolve 'feature' -> numeric/category
    const savedRoles = typeof loadColumnRoles === 'function' ? loadColumnRoles() : {};
    const resolvedColumns = ds.columns.map(c => {
      const role = savedRoles[c.name] || c.role;
      let apiRole = role;
      if (role === 'feature') {
        apiRole = (c.type === 'numeric' || c.type === 'binary') ? 'numeric' : 'category';
      } else if (role === 'target' || role === 'ignore') {
        apiRole = role;
      } else if (role !== 'numeric' && role !== 'category') {
        apiRole = (c.type === 'numeric' || c.type === 'binary') ? 'numeric' : 'category';
      }
      return { ...c, role: apiRole };
    });

    const payload = {
        rawRows: ds.rawRows,
        columns: resolvedColumns,
        targetColumn: ds.targetColumn,
        settings: {
            missingValueStrategy: strat,
            normalisation: norm,
            smote: smote,
            classWeights: classWeights,
            testSize: testSize
        }
    };

    try {
        const res = await fetch(API_BASE + '/api/prepare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'API Error');
        }

        const data = await res.json();
        
        // Save preprocessed split data to sessionStorage for Step 4
        savePreprocessedData({
            trainRows: data.trainRows,
            testRows: data.testRows,
            features: resolvedColumns.filter(c => c.role === 'numeric' || c.role === 'category').map(c => c.name),
            target: ds.targetColumn,
            settings: { ...payload.settings, classWeights: classWeights }
        });

        // Update the Before / After visualisations
        renderTransformStats(data.beforeStats, data.afterStats, resolvedColumns, { normalisation: norm });

        // Advance to next step flag
        step3Complete = true; // Flag for app.js if needed
        const reqReadyBanner = document.getElementById('step3ReadyBanner');
        if (reqReadyBanner) reqReadyBanner.style.display = 'flex';

    } catch (e) {
        console.error(e);
        alert('Failed to process data. Is the Python backend running?\n\n' + e.message);
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
    }
}

// Memory persistence
function savePreprocessedData(data) {
    try {
        const zip = JSON.stringify(data);
        sessionStorage.setItem('healthai_preprocessed', zip);
    } catch(e) {
        console.warn("Could not save to sessionStorage (quota exceeded?):", e);
    }
}

function loadPreprocessedData() {
    try {
        const d = sessionStorage.getItem('healthai_preprocessed');
        return d ? JSON.parse(d) : null;
    } catch(e) { return null; }
}

function resetTransformStatsPlaceholder() {
    const grid2s = document.querySelectorAll('#step-3 .grid2');
    if (!grid2s || grid2s.length === 0) return;

    const placeholderHTML = `
        <div style="
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            height: 120px;
            border: 1.5px dashed var(--color-border-tertiary, #e0e0e0);
            border-radius: 10px;
            background: var(--color-background-secondary, #f9f9f9);
        ">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="20" width="6" height="9" rx="2" fill="var(--color-border-secondary, #ccc)"/>
                <rect x="13" y="13" width="6" height="16" rx="2" fill="var(--color-border-secondary, #ccc)"/>
                <rect x="23" y="7" width="6" height="22" rx="2" fill="var(--color-border-secondary, #ccc)"/>
            </svg>
            <span style="font-size: 13px; color: var(--color-text-tertiary, #aaa); letter-spacing: 0.01em;">
                It will appear here once you apply the settings.
            </span>
        </div>
    `;

    grid2s.forEach(viz => {
        viz.innerHTML = placeholderHTML;
    });
}

function renderTransformStats(before, after, columns, opts) {
    opts = opts || {};
    const normLabel = opts.normalisation === 'none' ? 'AFTER (imputed only)' : 'AFTER (normalised)';
    const grid2s = document.querySelectorAll('#step-3 .grid2');
    if (grid2s.length < 2) return;

    // 1. Normalisation Visualisation
    const normViz = grid2s[0];
    const numCols = columns.filter(c => c.role === 'numeric');
    if (numCols.length > 0) {
        const exampleCol = numCols[0].name;
        const b = before.features[exampleCol];
        const a = after.features[exampleCol];
        
        const title = normViz.previousElementSibling;
        if (title && title.classList.contains('card-title')) {
            title.innerHTML = `Before & After Normalisation`;
        }

        if (b && a) {
            normViz.innerHTML = `
            <div>
              <div style="font-size:11px;font-weight:600;color:var(--muted);text-align:center;margin-bottom:8px;">BEFORE (raw values)</div>
              <div class="bars">
                <div class="bar-row"><div class="bar-lbl">Minimum</div><div class="bar-track"><div class="bar-fill bad" style="width:10%"></div></div><div class="bar-val">${typeof b.min === 'number' ? b.min.toFixed(1) : b.min}</div></div>
                <div class="bar-row"><div class="bar-lbl">Average</div><div class="bar-track"><div class="bar-fill" style="width:50%"></div></div><div class="bar-val">${typeof b.mean === 'number' ? b.mean.toFixed(1) : b.mean}</div></div>
                <div class="bar-row"><div class="bar-lbl">Maximum</div><div class="bar-track"><div class="bar-fill teal" style="width:100%"></div></div><div class="bar-val">${typeof b.max === 'number' ? b.max.toFixed(1) : b.max}</div></div>
              </div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:600;color:var(--muted);text-align:center;margin-bottom:8px;">${normLabel}</div>
              <div class="bars">
                <div class="bar-row"><div class="bar-lbl">Minimum</div><div class="bar-track"><div class="bar-fill bad" style="width:${a.min < 0 ? '0' : '10'}%"></div></div><div class="bar-val">${typeof a.min === 'number' ? a.min.toFixed(2) : a.min}</div></div>
                <div class="bar-row"><div class="bar-lbl">Average</div><div class="bar-track"><div class="bar-fill" style="width:50%"></div></div><div class="bar-val">${typeof a.mean === 'number' ? a.mean.toFixed(2) : a.mean}</div></div>
                <div class="bar-row"><div class="bar-lbl">Maximum</div><div class="bar-track"><div class="bar-fill teal" style="width:100%"></div></div><div class="bar-val">${typeof a.max === 'number' ? a.max.toFixed(2) : a.max}</div></div>
              </div>
            </div>`;
        }
    }

    // 2. Class Balance / SMOTE Visualisation (BEFORE = train split before SMOTE, AFTER = train after SMOTE)
    const smoteViz = grid2s[1];
    const cb_before = after.class_balance_before_smote || before.class_balance || {};
    const cb_after = after.class_balance || {};
    
    // Sort logic
    const keysB = Object.keys(cb_before).sort((k1, k2) => cb_before[k2].pct - cb_before[k1].pct);
    let beforeHtml = keysB.map((k, i) => `
        <div class="bar-row">
            <div class="bar-lbl">${k}</div>
            <div class="bar-track"><div class="bar-fill ${i>0 ? 'warn' : ''}" style="width:${cb_before[k].pct}%"></div></div>
            <div class="bar-val">${cb_before[k].pct}%</div>
        </div>`).join('');
        
    const keysA = Object.keys(cb_after).sort((k1, k2) => cb_after[k2].pct - cb_after[k1].pct);
    let afterHtml = keysA.map((k, i) => `
        <div class="bar-row">
            <div class="bar-lbl">${k}</div>
            <div class="bar-track"><div class="bar-fill ${i>0 ? 'teal' : ''}" style="width:${cb_after[k].pct}%"></div></div>
            <div class="bar-val">${cb_after[k].pct}%</div>
        </div>`).join('');

    // Update ONLY the Class Balance card title (smoteViz.previousElementSibling), not the Normalisation title
    const classBalanceTitle = smoteViz.previousElementSibling;
    if (classBalanceTitle && classBalanceTitle.classList.contains('card-title')) {
        classBalanceTitle.textContent = after.applied_smote
            ? 'Class Balance — Before & After SMOTE'
            : 'Class Balance — Train Split (SMOTE not applied)';
    }

    smoteViz.innerHTML = `
        <div>
            <div style="font-size:11px;font-weight:600;color:var(--muted);text-align:center;margin-bottom:8px;">BEFORE (train split)</div>
            <div class="bars">${beforeHtml}</div>
        </div>
        <div>
            <div style="font-size:11px;font-weight:600;color:var(--muted);text-align:center;margin-bottom:8px;">AFTER ${after.applied_smote ? 'SMOTE' : '(no SMOTE)'}</div>
            <div class="bars">${afterHtml}</div>
        </div>
    `;
}
