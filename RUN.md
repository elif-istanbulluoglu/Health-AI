# Nasıl Çalıştırılır

## Gereksinimler

- **Python 3.8+** (tercihen 3.10 veya 3.11)
- Tarayıcı (Chrome, Firefox, Edge)

---

## 1. Python Bağımlılıklarını Yükle

Proje kök dizininde:

```bash
pip install -r api/requirements.txt
```

Bağımlılıklar: `fastapi`, `uvicorn`, `pandas`, `scikit-learn`, `imbalanced-learn`, `pydantic`

---

## 2. Python Backend’i Başlat

Ayrı bir terminal açın:

```bash
cd api
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

veya proje kökünden:

```bash
uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

Backend `http://127.0.0.1:8000` adresinde çalışacak.

---

## 3. Frontend’i Başlat

Frontend’i HTTP üzerinden sunmanız gerekir (doğrudan `file://` ile açarsanız CORS hatası alabilirsiniz).

**Seçenek A — Python HTTP sunucusu:**

Proje kök dizininde yeni bir terminal açın:

```bash
python -m http.server 8080
```

Tarayıcıda açın:
- **http://localhost:8080/step1-clinical-context.html** (başlangıç)
- veya **http://localhost:8080/step2-data-exploration.html** (veri yükleme)
- veya **http://localhost:8080/step3-data-preparation.html** (data preparation – Step 3–7)

**Seçenek B — VS Code Live Server:**

- `step3-data-preparation.html` dosyasına sağ tıklayıp “Open with Live Server” seçin.

**Seçenek C — Başka bir HTML dosyası:**

Adımlar step 1–7 tek sayfada ise, ana HTML dosyasını açın (ör. `index.html` veya `step2-data-exploration.html`) ve adımlar arasında geçiş yapın.

---

## 4. Akış Özeti

1. **Step 1:** Clinical Context  
2. **Step 2:** Data Exploration  
   - Domain seç (örn. Cardiology)  
   - Dataset otomatik yüklenir veya CSV yükle  
   - Column Mapper ile target ve feature rollerini ayarla, kaydet  
3. **Step 3:** Data Preparation  
   - **Train/Test Split:** Slider ile %60–90 arası (varsayılan %80)  
   - **Missing values:** Median / mode / drop  
   - **Normalisation:** Z-score / Min-max / None  
   - **Class imbalance:** SMOTE / Class weights / None  
   - **Apply Preparation Settings** butonuna tıkla  
   - Python backend veriyi işler, sağ panelde Before/After grafikleri güncellenir  
4. **Step 4+:** Model seçimi, eğitim, sonuçlar

---

## Önemli Notlar

- Backend mutlaka çalışıyor olmalı, yoksa Step 3’te “Apply Preparation Settings” hata verir.
- Dataset Step 2’de yüklenmeli ve Column Mapper ile onaylanmalı.
- CORS hataları alırsanız, frontend mutlaka HTTP üzerinden (örn. `http://localhost:8080`) açılmalı.
