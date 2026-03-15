// ═══════════════════════════════════════════════════════════════════
//  DOMAIN DATASETS
//  One entry per clinical domain. Keys must match data-domain attributes
//  and domainData keys in app.js.
//  Load this file BEFORE step2_backend.js in your HTML.
// ═══════════════════════════════════════════════════════════════════

const DOMAIN_DATASETS = {

  'Cardiology': {
    name: 'Heart Failure Clinical Records',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/Cardiology.csv',
    defaultTarget: 'DEATH_EVENT'
  },
  
  'Radiology': {
    name: 'Radiology Features Dataset',
    source: 'Local Hospital Extract',
    localFile: 'datasets2/Radiology.csv',
    defaultTarget: 'Diagnosis'
  },

  'Nephrology': { // Fallback as no specific file provided
    name: 'Chronic Kidney Disease Dataset',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/Cardiology.csv', 
    defaultTarget: 'classification'
  },

  'Oncology': {
    name: 'Breast Cancer Wisconsin',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/OncologyBreast.csv',
    defaultTarget: 'diagnosis'
  },

  'Neurology': {
    name: "Parkinson's Disease Dataset",
    source: 'UCI Machine Learning Repository',
    localFile: "datasets2/NeurologyParkinson's.csv",
    defaultTarget: 'status'
  },

  'Endocrinology': {
    name: 'Pima Indians Diabetes Dataset',
    source: 'National Institute of Diabetes',
    localFile: 'datasets2/EndocrinologyDiabetes.csv',
    defaultTarget: 'Outcome'
  },

  'Hepatology': {
    name: 'Indian Liver Patient Dataset',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/HepatologyLiver.csv',
    defaultTarget: 'Dataset'
  },

  'Mental Health': {
    name: 'Depression Severity Dataset',
    source: 'Kaggle',
    localFile: 'datasets2/MentalHealth.csv',
    defaultTarget: 'severity_class'
  },

  'Pulmonology': {
    name: 'COPD Exacerbation Dataset',
    source: 'PhysioNet',
    localFile: 'datasets2/PulmonologyCOPD.csv',
    defaultTarget: 'exacerbation'
  },

  'Haematology — Anaemia': {
    name: 'Anaemia Type Classification',
    source: 'Kaggle',
    localFile: 'datasets2/HaematologyAnaemia.csv',
    defaultTarget: 'anemia_type'
  },

  'Dermatology': {
    name: 'HAM10000 Skin Lesion Metadata',
    source: 'ISIC Archive',
    localFile: 'datasets2/Dermatology.csv',
    defaultTarget: 'dx_type'
  },

  'Ophthalmology': {
    name: 'Diabetic Retinopathy Debrecen',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/Ophthalmology.csv',
    defaultTarget: 'severity_grade'
  },

  'Orthopaedics': {
    name: 'Vertebral Column Dataset',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/OrthopaedicsSpine.csv',
    defaultTarget: 'class'
  },

  'ICU / Sepsis': {
    name: 'Sepsis Prediction Dataset',
    source: 'PhysioNet',
    localFile: 'datasets2/ICUSepsis.csv',
    defaultTarget: 'SepsisLabel'
  },

  'Obstetrics — Fetal Health': {
    name: 'Fetal Health CTG Dataset',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/ObstetricsFetalHealth.csv',
    defaultTarget: 'fetal_health'
  },

  'Cardiology — Arrhythmia': {
    name: 'Arrhythmia Dataset',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/CardiologyArrhythmia.data',
    defaultTarget: 'arrhythmia'
  },

  'Oncology — Cervical': {
    name: 'Cervical Cancer Risk Factors',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/OncologyCervical.csv',
    defaultTarget: 'Biopsy'
  },

  'Thyroid / Endocrinology': {
    name: 'Thyroid Disease Dataset',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/ThyroidEndocrinology.csv',
    defaultTarget: 'class'
  },

  'Pharmacy': {
    name: 'Diabetes 130-US Hospitals Readmission',
    source: 'UCI Machine Learning Repository',
    localFile: 'datasets2/PharmacyReadmission.csv',
    defaultTarget: 'readmitted'
  }

};

// ── ACTIVE DOMAIN RESOLUTION ──────────────────────────────────────
// Returns the dataset for the current domain, falling back to Cardiology
function getDatasetForDomain(domainName) {
  if (!domainName) return DOMAIN_DATASETS['Cardiology'];
  // Direct match
  if (DOMAIN_DATASETS[domainName]) return DOMAIN_DATASETS[domainName];
  // Fuzzy match — partial key match
  const key = Object.keys(DOMAIN_DATASETS).find(k =>
    domainName.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(domainName.toLowerCase())
  );
  return key ? DOMAIN_DATASETS[key] : DOMAIN_DATASETS['Cardiology'];
}

// Read domain from URL param or sessionStorage
function getCurrentDomain() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlDomain = urlParams.get('domain');
    if (urlDomain) {
      sessionStorage.setItem('healthai_domain', urlDomain);
      return urlDomain;
    }
    return sessionStorage.getItem('healthai_domain') || 'Cardiology';
  } catch(e) {
    return 'Cardiology';
  }
}