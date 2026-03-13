// ═══════════════════════════════════════════════════════════════════
//  STEP 2 — DATA EXPLORATION LOGIC
//  Handles: default dataset, CSV upload, analysis, sessionStorage
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
//  DOMAIN DATASETS — one entry per clinical domain
//  Keys must match data-domain attributes on .domain-pill elements
//  and the domainData keys in app.js
// ═══════════════════════════════════════════════════════════════════

// ── DOMAIN DATASETS — loaded from domain_datasets.js ──────────
// Ensure domain_datasets.js is loaded BEFORE this script.
// Backwards-compatible alias — always points to current domain's dataset
const DEFAULT_DATASET = getDatasetForDomain(getCurrentDomain());


// ── SESSION STORAGE KEYS ─────────────────────────────────────────
const SS = {
  DATASET:       'healthai_dataset',       // parsed dataset object
  SCHEMA_OK:     'healthai_schemaOK',      // '1' when mapper confirmed
  COLUMN_ROLES:  'healthai_columnRoles',   // {colName: role} map
  TARGET_COL:    'healthai_targetCol',     // selected target column name
  DATA_SOURCE:   'healthai_dataSource',    // 'default' | 'upload'
};

// ── SAVE / LOAD SESSION ──────────────────────────────────────────
function saveDataset(ds) {
  try { sessionStorage.setItem(SS.DATASET, JSON.stringify(ds)); } catch(e) { console.warn('sessionStorage full', e); }
}
function loadDataset() {
  try { const v = sessionStorage.getItem(SS.DATASET); return v ? JSON.parse(v) : null; } catch(e) { return null; }
}
function saveSchemaOK(ok) {
  try {
    if (ok) { sessionStorage.setItem(SS.SCHEMA_OK, '1'); localStorage.setItem('heathAI_schemaOK', '1'); }
    else    { sessionStorage.removeItem(SS.SCHEMA_OK); localStorage.removeItem('heathAI_schemaOK'); }
  } catch(e) {}
}
function isSchemaOK() {
  try { return sessionStorage.getItem(SS.SCHEMA_OK) === '1'; } catch(e) { return false; }
}
function saveColumnRoles(roles) {
  try { sessionStorage.setItem(SS.COLUMN_ROLES, JSON.stringify(roles)); } catch(e) {}
}
function loadColumnRoles() {
  try { const v = sessionStorage.getItem(SS.COLUMN_ROLES); return v ? JSON.parse(v) : {}; } catch(e) { return {}; }
}
function saveTargetCol(col) {
  try { sessionStorage.setItem(SS.TARGET_COL, col); } catch(e) {}
}
function loadTargetCol() {
  try { return sessionStorage.getItem(SS.TARGET_COL) || ''; } catch(e) { return ''; }
}

// ── CSV ANALYSIS ─────────────────────────────────────────────────
function analyseCSV(parsedData) {
  // parsedData: { data: [{col:val,...},...], meta: {fields:[...]} }
  const fields = parsedData.meta.fields || [];
  const rows = parsedData.data.filter(r => Object.values(r).some(v => v !== '' && v !== null && v !== undefined));

  if (rows.length < 10) throw new Error(`File has only ${rows.length} data rows. Minimum is 10.`);

  const columns = fields.map(name => {
    const values = rows.map(r => r[name]);
    const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
    const missingCount = values.length - nonEmpty.length;
    const missingPct = +(missingCount / values.length * 100).toFixed(1);

    // Detect type
    const numericValues = nonEmpty.map(v => parseFloat(v)).filter(v => !isNaN(v));
    const isNumeric = numericValues.length / nonEmpty.length > 0.9;
    const uniqueValues = [...new Set(nonEmpty.map(v => String(v).trim()))];
    const isBinary = uniqueValues.length === 2;
    const isIdentifier = (
      uniqueValues.length === rows.length ||
      (name.toLowerCase().includes('id') && uniqueValues.length > rows.length * 0.8)
    );

    let type = 'text';
    if (isIdentifier) type = 'identifier';
    else if (isNumeric && isBinary) type = 'binary';
    else if (isNumeric) type = 'numeric';
    else if (isBinary) type = 'binary';

    // Suggest role
    const lname = name.toLowerCase();
    let role = 'feature';
    if (isIdentifier) role = 'ignore';
    else if (lname.includes('death') || lname.includes('readmit') || lname.includes('outcome') || lname.includes('target') || lname.includes('label')) role = 'target';

    // Stats for numeric
    let stats = {};
    if (isNumeric && numericValues.length > 0) {
      const sorted = [...numericValues].sort((a, b) => a - b);
      stats = {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: +(numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(2),
      };
    }

    return { name, type, role, missingPct, missingCount, uniqueCount: uniqueValues.length, stats, values: nonEmpty };
  });

  // Must have at least one numeric column
  const hasNumeric = columns.some(c => c.type === 'numeric' || c.type === 'binary');
  if (!hasNumeric) throw new Error('File has no numeric measurement columns. At least one is required.');

  // Compute class balance for suggested target
  const targetCol = columns.find(c => c.role === 'target') || columns[columns.length - 1];
  const classBalance = computeClassBalance(rows, targetCol.name);
  const totalMissingPct = +(columns.reduce((s, c) => s + c.missingPct, 0) / columns.length).toFixed(1);
  const imbalanceRatio = classBalance ? computeImbalanceRatio(classBalance) : null;

  return {
    name: 'Uploaded CSV',
    source: 'User Upload',
    rows: rows.length,
    columns,
    targetColumn: targetCol.name,
    classBalance,
    imbalanceRatio,
    totalMissingPct,
    rawRows: rows,  // kept in session for downstream steps
  };
}

function computeClassBalance(rows, targetColName) {
  if (!targetColName) return null;
  const counts = {};
  rows.forEach(r => {
    const v = String(r[targetColName] ?? '').trim();
    if (v === '') return;
    counts[v] = (counts[v] || 0) + 1;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const result = {};
  Object.entries(counts).forEach(([k, v]) => {
    result[k] = { count: v, pct: +(v / total * 100).toFixed(1) };
  });
  return result;
}

function computeImbalanceRatio(balance) {
  const pcts = Object.values(balance).map(b => b.pct);
  if (pcts.length < 2) return null;
  return +(Math.max(...pcts) / Math.min(...pcts)).toFixed(2);
}

// ── UI RENDERING ─────────────────────────────────────────────────
function renderDataset(ds) {
  // 1. KPI summary
  const kpiPatients = document.getElementById('kpiPatients');
  const kpiMeasurements = document.getElementById('kpiMeasurements');
  const kpiMissing = document.getElementById('kpiMissing');
  const kpiMissingWrap = document.getElementById('kpiMissingWrap');

  if (kpiPatients)     kpiPatients.textContent = ds.rows.toLocaleString();
  if (kpiMeasurements) kpiMeasurements.textContent = ds.columns.filter(c => c.role !== 'ignore' && c.name !== ds.targetColumn).length;
  if (kpiMissing)      kpiMissing.textContent = ds.totalMissingPct + '%';
  if (kpiMissingWrap) {
    kpiMissingWrap.className = 'kpi' + (ds.totalMissingPct > 10 ? ' warn' : ds.totalMissingPct > 0 ? '' : ' good');
  }

  // 2. Dataset source label
  const sourceLabel = document.getElementById('datasetSourceLabel');
  if (sourceLabel) sourceLabel.textContent = ds.name + ' · ' + ds.source;

  // 3. Class balance bars
  renderClassBalance(ds);

  // 4. Features table
  renderFeaturesTable(ds);

  // 5. Target column selector
  renderTargetSelector(ds);

  // 6. dataResultsSection is always visible (display:flex in HTML)
}

function renderClassBalance(ds) {
  const wrap = document.getElementById('classBalanceBars');
  const bannerWrap = document.getElementById('classBalanceBanner');
  if (!wrap || !ds.classBalance) return;

  const entries = Object.entries(ds.classBalance).sort((a, b) => b[1].pct - a[1].pct);
  const colors = ['', 'teal', 'warn', 'bad'];

  wrap.innerHTML = entries.map(([label, info], i) => `
    <div class="bar-row">
      <div class="bar-lbl">${label}</div>
      <div class="bar-track"><div class="bar-fill ${colors[i] || ''}" style="width:${info.pct}%"></div></div>
      <div class="bar-val">${info.pct}%</div>
    </div>`).join('');

  // Imbalance warning
  if (bannerWrap) {
    const ratio = ds.imbalanceRatio;
    if (ratio && ratio > 2) {
      const minority = entries[entries.length - 1];
      bannerWrap.className = 'banner warn';
      bannerWrap.style.display = 'flex';
      bannerWrap.innerHTML = `<div class="banner-icon">⚠️</div><div><b>Imbalance detected:</b> Only ${minority[1].pct}% of patients fall in the minority class ("${minority[0]}"). A model could be misleadingly accurate by always predicting the majority class. This will be handled with SMOTE in Step 3.</div>`;
    } else {
      bannerWrap.className = 'banner good';
      bannerWrap.style.display = 'flex';
      bannerWrap.innerHTML = `<div class="banner-icon">✅</div><div><b>Balanced dataset:</b> Class distribution is well balanced. No special handling required.</div>`;
    }
  }
}

function renderFeaturesTable(ds) {
  const tbody = document.getElementById('featuresTableBody');
  if (!tbody) return;

  const actionTag = (col) => {
    if (col.role === 'ignore' || col.type === 'identifier')
      return '<span class="tag bad">Exclude — Not a measurement</span>';
    if (col.missingPct > 20)
      return `<span class="tag bad">Fill Missing (${col.missingPct}%)</span>`;
    if (col.missingPct > 0)
      return `<span class="tag warn">Fill Missing (${col.missingPct}%)</span>`;
    if (col.name === ds.targetColumn)
      return '<span class="tag info">Target (outcome)</span>';
    return '<span class="tag good">Ready</span>';
  };

  const typeLabel = (t) => ({ numeric: 'Number', binary: 'Binary (0/1)', text: 'Text', identifier: 'Identifier' }[t] || t);

  tbody.innerHTML = ds.columns.map(col => `
    <tr>
      <td style="font-family:var(--mono);font-size:12px;">${col.name}</td>
      <td>${typeLabel(col.type)}</td>
      <td>${col.missingPct > 0 ? col.missingPct + '%' : '0%'}</td>
      <td>${actionTag(col)}</td>
    </tr>`).join('');
}

function renderTargetSelector(ds) {
  const sel = document.getElementById('targetCol');
  if (!sel) return;
  // Destroy stale custom dropdown UI if it exists from previous dataset
  if (sel.nextElementSibling && sel.nextElementSibling.classList.contains('custom-select-wrapper')) {
    sel.nextElementSibling.remove();
  }

  // Populate with actual columns from dataset (excluding identifiers)
  sel.innerHTML = ds.columns
    .filter(c => c.type !== 'identifier')
    .map(c => `<option value="${c.name}" ${c.name === ds.targetColumn ? 'selected' : ''}>${c.name}${c.name === ds.targetColumn ? ' (recommended)' : ''}</option>`)
    .join('');

  // Save choice
  sel.addEventListener('change', () => { 
    saveTargetCol(sel.value); 
    ds.targetColumn = sel.value;
    
    // Sync roles to avoid duplicate targets
    const roles = loadColumnRoles();
    Object.keys(roles).forEach(k => {
      if (roles[k] === 'target' && k !== sel.value) {
        const cInfo = ds.columns.find(c => c.name === k);
        roles[k] = (cInfo && cInfo.type === 'binary') ? 'category' : 'numeric';
      }
    });
    roles[sel.value] = 'target';
    saveColumnRoles(roles);

    saveDataset(ds);
    renderFeaturesTable(ds);
    renderClassBalance(ds); // Class balance depends on target
  });
  saveTargetCol(ds.targetColumn);

  // Re-init custom dropdowns if present
  if (typeof initPremiumDropdowns === 'function') setTimeout(initPremiumDropdowns, 50);
}

// ── MAPPER POPULATION ────────────────────────────────────────────
function populateMapper(ds) {
  const tbody = document.getElementById('mapperTableBody');
  if (!tbody || !ds) return;

  // Update preview table headers to show column count
  const previewHead = document.getElementById('mapperPreviewHead');
  if (previewHead) {
    if (ds.rawRows && ds.rawRows.length > 0) {
      const n = Math.min(5, ds.rawRows.length);
      previewHead.innerHTML = '<tr><th>Column</th>' + Array.from({length:n},(_,i)=>`<th>Row ${i+1}</th>`).join('') + '</tr>';
    } else {
      previewHead.innerHTML = '<tr><th>Column</th><th>Sample Value</th></tr>';
    }
  }

  const roleOptions = (currentRole, colName, isTarget) => {
    const roles = [
      { value: 'target',   label: 'Target (what we predict)' },
      { value: 'numeric',  label: 'Number (measurement)' },
      { value: 'category', label: 'Category' },
      { value: 'ignore',   label: 'Ignore (not a measurement)' },
    ];
    return roles.map(r =>
      `<option value="${r.value}" ${currentRole === r.value ? 'selected' : ''}>${r.label}</option>`
    ).join('');
  };

  const typeTag = (col) => {
    if (col.type === 'identifier') return '<span class="tag bad">Identifier-like</span>';
    if (col.missingPct > 0)        return `<span class="tag warn">Number · ${col.missingPct}% missing</span>`;
    if (col.type === 'binary')     return '<span class="tag good">Binary (0/1)</span>';
    if (col.type === 'numeric')    return '<span class="tag good">Number</span>';
    return '<span class="tag info">Text / Category</span>';
  };

  const savedRoles = loadColumnRoles();
  // Ensure the target column selected outside the mapper overrides stale cached roles
  if (ds.targetColumn) {
    ds.columns.forEach(col => {
      const currentRole = savedRoles[col.name] || col.role;
      if (currentRole === 'target' && col.name !== ds.targetColumn) {
        // Demote stale target back to normal
        savedRoles[col.name] = (col.type === 'binary') ? 'category' : 'numeric';
      }
    });
    savedRoles[ds.targetColumn] = 'target';
    saveColumnRoles(savedRoles); // persist correction
  }

  tbody.innerHTML = ds.columns.map(col => {
    const role = savedRoles[col.name] || col.role;
    const roleForSelect = role === 'target' ? 'target' : role === 'ignore' ? 'ignore' : col.type === 'binary' ? 'category' : 'numeric';
    return `<tr>
      <td>${col.name}</td>
      <td>${typeTag(col)}</td>
      <td>
        <select class="sel" data-col="${col.name}" onchange="onMapperRoleChange(this)">
          ${roleOptions(roleForSelect, col.name)}
        </select>
      </td>
    </tr>`;
  }).join('');

  // Preview table
  const previewBody = document.getElementById('mapperPreviewBody');
  if (previewBody) {
    if (ds.rawRows && ds.rawRows.length > 0) {
      const previewRows = ds.rawRows.slice(0, 5);
      previewBody.innerHTML = ds.columns.map(col => {
        const vals = previewRows.map(r => r[col.name] !== undefined ? String(r[col.name]) : '—').join('</td><td>');
        return `<tr><td style="font-family:var(--mono);font-size:12px;font-weight:600;">${col.name}</td><td>${vals}</td></tr>`;
      }).join('');
    } else {
      // Default dataset without raw rows: show 5 empty sample slots
      previewBody.innerHTML = ds.columns.map(col => {
        const vals = Array(5).fill('—').join('</td><td>');
        return `<tr><td style="font-family:var(--mono);font-size:12px;font-weight:600;">${col.name}</td><td>${vals}</td></tr>`;
      }).join('');
    }
  }

  // Target/problem type selector — show ALL columns so user can choose
  const targetSel = document.getElementById('mapperTargetCol');
  if (targetSel) {
    if (targetSel.nextElementSibling && targetSel.nextElementSibling.classList.contains('custom-select-wrapper')) {
      targetSel.nextElementSibling.remove();
    }
    
    targetSel.innerHTML = ds.columns
      .map(c => {
        const hint = c.type === 'binary' ? ' (binary — recommended)' : c.type === 'numeric' ? ' (numeric)' : c.type === 'identifier' ? ' (identifier — not recommended)' : ' (text)';
        return `<option value="${c.name}" ${c.name === ds.targetColumn ? 'selected' : ''}>${c.name}${hint}</option>`;
      })
      .join('');
    // When user changes target in mapper, update the column roles table
    targetSel.onchange = function() {
      const newTarget = this.value;
      // Update role selects in the mapper table
      document.querySelectorAll('#mapperTableBody select[data-col]').forEach(sel => {
        const currentVal = sel.value;
        let changed = false;
        if (sel.dataset.col === newTarget && currentVal !== 'target') {
          sel.value = 'target';
          onMapperRoleChange(sel);
          changed = true;
        } else if (sel.dataset.col !== newTarget && currentVal === 'target') {
          // demote old target to its natural type
          const col = ds.columns.find(c => c.name === sel.dataset.col);
          sel.value = col && col.type === 'binary' ? 'category' : 'numeric';
          onMapperRoleChange(sel);
          changed = true;
        }
        
        if (changed && sel.nextElementSibling && sel.nextElementSibling.classList.contains('custom-select-wrapper')) {
          const wrapper = sel.nextElementSibling;
          const textSpan = wrapper.querySelector('.custom-select-text');
          if (textSpan && sel.options[sel.selectedIndex]) {
            textSpan.textContent = sel.options[sel.selectedIndex].text;
          }
          wrapper.querySelectorAll('.custom-option').forEach((opt, idx) => {
            if (idx === sel.selectedIndex) opt.classList.add('selected');
            else opt.classList.remove('selected');
          });
        }
      });
    };
  }

  // Re-init dropdowns
  if (typeof initPremiumDropdowns === 'function') setTimeout(initPremiumDropdowns, 80);
}

function onMapperRoleChange(sel) {
  const roles = loadColumnRoles();
  const ds = loadDataset();
  const newRole = sel.value;
  const colName = sel.dataset.col;

  // If the user selects "target", we need to demote any existing target
  if (newRole === 'target' && ds) {
    ds.targetColumn = colName;
    
    // 1. Demote in savedRoles
    Object.keys(roles).forEach(k => {
      if (roles[k] === 'target' && k !== colName) {
        const cInfo = ds.columns.find(c => c.name === k);
        const naturalRole = (cInfo && (cInfo.type === 'binary' || cInfo.type === 'category' || cInfo.type === 'text')) ? 'category' : 'numeric';
        roles[k] = naturalRole;
        
        // 2. Update the UI for the demoted column
        const otherSel = document.querySelector(`#mapperTableBody select[data-col="${k}"]`);
        if (otherSel) {
          otherSel.value = naturalRole;
          // Update custom select UI if present
          if (otherSel.nextElementSibling && otherSel.nextElementSibling.classList.contains('custom-select-wrapper')) {
            const wrapper = otherSel.nextElementSibling;
            const textSpan = wrapper.querySelector('.custom-select-text');
            if (textSpan && otherSel.options[otherSel.selectedIndex]) {
              textSpan.textContent = otherSel.options[otherSel.selectedIndex].text;
            }
            wrapper.querySelectorAll('.custom-option').forEach((opt, idx) => {
              if (idx === otherSel.selectedIndex) opt.classList.add('selected');
              else opt.classList.remove('selected');
            });
          }
        }
      }
    });

    // 3. Update the main Target dropdown at the top of the mapper
    const mainTargetSel = document.getElementById('mapperTargetCol');
    if (mainTargetSel && mainTargetSel.value !== colName) {
      mainTargetSel.value = colName;
      if (mainTargetSel.nextElementSibling && mainTargetSel.nextElementSibling.classList.contains('custom-select-wrapper')) {
        const wrapper = mainTargetSel.nextElementSibling;
        const textSpan = wrapper.querySelector('.custom-select-text');
        if (textSpan && mainTargetSel.options[mainTargetSel.selectedIndex]) {
          textSpan.textContent = mainTargetSel.options[mainTargetSel.selectedIndex].text;
        }
        wrapper.querySelectorAll('.custom-option').forEach((opt, idx) => {
          if (idx === mainTargetSel.selectedIndex) opt.classList.add('selected');
          else opt.classList.remove('selected');
        });
      }
    }
  }

  roles[colName] = newRole;
  saveColumnRoles(roles);
}

// ── MAPPER VALIDATION ────────────────────────────────────────────
function validateMapper() {
  const ds = loadDataset();
  if (!ds) return { ok: false, msg: 'No dataset loaded.' };

  const roles = loadColumnRoles();

  // Assign defaults for columns without explicit roles
  ds.columns.forEach(col => {
    if (!roles[col.name]) roles[col.name] = col.role;
  });

  const targetCols = Object.entries(roles).filter(([, r]) => r === 'target');
  const featureCols = Object.entries(roles).filter(([, r]) => r === 'numeric' || r === 'category');
  const ignoreCols = Object.entries(roles).filter(([, r]) => r === 'ignore');

  if (targetCols.length === 0) return { ok: false, msg: 'No target column assigned. Set one column as "Target".' };
  if (targetCols.length > 1)  return { ok: false, msg: 'More than one target column assigned. Keep exactly one.' };
  if (featureCols.length === 0) return { ok: false, msg: 'No feature columns assigned. At least one "Number" or "Category" column is required.' };

  const targetName = targetCols[0][0];
  const targetColInfo = ds.columns.find(c => c.name === targetName);
  if (targetColInfo && targetColInfo.missingPct > 20) {
    return { ok: false, msg: `Target column "${targetName}" has ${targetColInfo.missingPct}% missing values. This is too high.` };
  }

  saveTargetCol(targetName);
  saveColumnRoles(roles);

  const warnings = [];
  if (ignoreCols.length === 0 && ds.columns.some(c => c.type === 'identifier')) {
    warnings.push('Identifier-like columns should be set to "Ignore".');
  }

  return { ok: true, warnings, targetName, featureCount: featureCols.length, ignoreCount: ignoreCols.length };
}

// ── MAIN INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {

  // ── Restore state ──
  const existingDS = loadDataset();
  if (existingDS) {
    renderDataset(existingDS);
    const source = sessionStorage.getItem(SS.DATA_SOURCE) || 'default';
    if (source === 'upload') {
      document.getElementById('uploadArea')?.style && (document.getElementById('uploadArea').style.display = 'block');
      highlightSourceBtn('upload');
    } else {
      highlightSourceBtn('default');
    }
  } else {
    // Load default on first visit
    loadDefaultDataset(false);
  }

  // If domain changed (URL param differs from stored dataset's source), reload
  const currentDomain = getCurrentDomain();
  if (existingDS) {
    const domainDS = getDatasetForDomain(currentDomain);
    // If stored dataset name doesn't match this domain's dataset, reload
    if (existingDS.name !== domainDS.name && sessionStorage.getItem(SS.DATA_SOURCE) !== 'upload') {
      loadDefaultDataset(true); // new domain = reset schema
    }
  }

  // Update schema banner based on current state
  updateSchemaBanner();

  // ── Use Default button ──
  document.getElementById('useDefault')?.addEventListener('click', function () {
    highlightSourceBtn('default');
    document.getElementById('uploadArea').style.display = 'none';
    sessionStorage.setItem(SS.DATA_SOURCE, 'default');
    loadDefaultDataset(true); // reset schema since user switched dataset
  });

  // ── Use Upload button ──
  document.getElementById('useUpload')?.addEventListener('click', function () {
    highlightSourceBtn('upload');
    document.getElementById('uploadArea').style.display = 'block';
    sessionStorage.setItem(SS.DATA_SOURCE, 'upload');
  });

  // ── Drop zone ──
  const dz = document.getElementById('dropZone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); handleFile(e.dataTransfer.files[0]); });
    document.getElementById('csvInput')?.addEventListener('change', e => handleFile(e.target.files[0]));
  }

  // ── Mapper: Save & Close — delegate to app.js markSchemaSaved, also persist ──
  // app.js handles openMapper / closeMapper / cancelMapper / validateSchema / saveMapping / saveAndClose
  // step2-data.js only hooks saveMapping/saveAndClose to also call saveSchemaOK (localStorage + sessionStorage)
  const _origSaveMapping = document.getElementById('saveMapping');
  const _origSaveAndClose = document.getElementById('saveAndClose');

  function _doSave() {
    const result = validateMapper();
    if (!result.ok) return false;
    saveSchemaOK(true);
    updateSchemaBanner();
    
    // Also update target column and refresh dataset UI
    const ds = loadDataset();
    if (ds && result.targetName) {
      ds.targetColumn = result.targetName;
      saveDataset(ds);
      renderFeaturesTable(ds);
      renderClassBalance(ds);
      
      const sel = document.getElementById('targetCol');
      if (sel) {
        sel.value = result.targetName;
        // Also update custom select visually if present
        if (sel.nextElementSibling && sel.nextElementSibling.classList.contains('custom-select-wrapper')) {
          const textSpan = sel.nextElementSibling.querySelector('.custom-select-text');
          if (textSpan && sel.options[sel.selectedIndex]) {
            textSpan.textContent = sel.options[sel.selectedIndex].text;
          }
          sel.nextElementSibling.querySelectorAll('.custom-option').forEach((opt, idx) => {
            if (idx === sel.selectedIndex) opt.classList.add('selected');
            else opt.classList.remove('selected');
          });
        }
      }
    }
    
    // Dispatch event so app.js schemaOK variable syncs
    try { window.dispatchEvent(new CustomEvent('schemaValidated', { detail: { ok: true } })); } catch(e) {}
    return true;
  }

  if (_origSaveMapping) {
    _origSaveMapping.addEventListener('click', function() { _doSave(); });
  }
  if (_origSaveAndClose) {
    _origSaveAndClose.addEventListener('click', function() { _doSave(); });
  }

});

// ── LOAD DEFAULT DATASET ─────────────────────────────────────────
function generateMockRows(ds, count = 5) {
  const rows = [];
  const targetKeys = ds.classBalance ? Object.keys(ds.classBalance) : ['Class A', 'Class B'];
  for (let i = 0; i < count; i++) {
    const row = {};
    ds.columns.forEach(col => {
      if (col.role === 'target' || col.name === ds.targetColumn) {
        // Remove prefixes like "1 — " if they exist
        const key = targetKeys[Math.floor(Math.random() * targetKeys.length)];
        row[col.name] = key.replace(/^[0-9]+\s*—\s*/, '');
      } else if (col.type === 'binary') {
        row[col.name] = Math.random() > 0.5 ? 1 : 0;
      } else if (col.type === 'numeric') {
        const val = Math.random() * (col.name.toLowerCase().includes('age') ? 80 : 150);
        row[col.name] = col.name.toLowerCase().includes('age') ? Math.floor(val + 20) : val.toFixed(1);
      } else if (col.type === 'category') {
        row[col.name] = 'Cat_' + String.fromCharCode(65 + Math.floor(Math.random() * 4));
      } else {
        row[col.name] = 'Val_' + Math.floor(Math.random() * 100);
      }
    });
    rows.push(row);
  }
  return rows;
}

function loadDefaultDataset(resetSchema) {
  const domainName = getCurrentDomain();
  const baseDs = getDatasetForDomain(domainName);
  const ds = Object.assign({}, baseDs, { rawRows: generateMockRows(baseDs, 5) });
  saveDataset(ds);
  renderDataset(ds);
  if (resetSchema) {
    saveSchemaOK(false);
  }
  updateSchemaBanner();
  // Update page title/label if element exists
  const domainLabelEl = document.getElementById('domainLabel');
  if (domainLabelEl && !domainLabelEl.textContent) {
    domainLabelEl.textContent = domainName;
  }
}

// ── FILE HANDLER ─────────────────────────────────────────────────
function handleFile(file) {
  const statusEl = document.getElementById('uploadStatus');
  const errorEl  = document.getElementById('uploadError');
  const msgEl    = document.getElementById('uploadMsg');
  const errMsgEl = document.getElementById('uploadErrMsg');
  const dz       = document.getElementById('dropZone');

  if (statusEl) statusEl.style.display = 'none';
  if (errorEl)  errorEl.style.display  = 'none';
  if (!file) return;

  // Validate extension
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showUploadError(errMsgEl, errorEl, dz, 'This file is not a CSV. Please export your data as a .csv file.');
    return;
  }
  // Validate size (50 MB)
  if (file.size > 52428800) {
    showUploadError(errMsgEl, errorEl, dz, 'File exceeds 50 MB. Please reduce the file to 50,000 rows or fewer.');
    return;
  }

  dz?.classList.remove('error');

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      if (typeof Papa === 'undefined') {
        showUploadError(errMsgEl, errorEl, dz, 'CSV parser not loaded. Please check your internet connection.');
        return;
      }
      const parsed = Papa.parse(e.target.result, { header: true, skipEmptyLines: true, dynamicTyping: false });

      if (!parsed.data || parsed.data.length === 0) {
        showUploadError(errMsgEl, errorEl, dz, 'The CSV file appears to be empty or could not be parsed.');
        return;
      }

      const ds = analyseCSV(parsed);
      saveDataset(ds);
      sessionStorage.setItem(SS.DATA_SOURCE, 'upload');
      saveSchemaOK(false); // must re-confirm after new upload

      dz?.classList.add('has-file');
      if (statusEl) statusEl.style.display = 'block';
      if (msgEl) msgEl.textContent = `✓ "${file.name}" loaded — ${ds.rows.toLocaleString()} patients, ${ds.columns.length} columns detected.`;

      renderDataset(ds);
      updateSchemaBanner();

    } catch(err) {
      showUploadError(errMsgEl, errorEl, dz, err.message || 'Could not parse the CSV file.');
    }
  };
  reader.onerror = () => showUploadError(errMsgEl, errorEl, dz, 'Could not read the file. Please try again.');
  reader.readAsText(file);
}

function showUploadError(msgEl, errorEl, dz, msg) {
  if (msgEl)   msgEl.textContent = msg;
  if (errorEl) errorEl.style.display = 'block';
  if (dz)      dz.classList.add('error');
}

// ── SCHEMA BANNER ────────────────────────────────────────────────
function updateSchemaBanner() {
  const ok = isSchemaOK();
  const banner = document.getElementById('schemaBanner');
  if (!banner) return;
  if (ok) {
    showSchemaBanner('good', '<b>Mapping saved.</b> Schema validated. You can now proceed to Step 3.');
  } else {
    showSchemaBanner('warn', '<b>Action needed:</b> Open the Column Mapper to confirm your data structure before continuing to Step 3.');
  }
}

function showSchemaBanner(type, html) {
  const banner = document.getElementById('schemaBanner');
  if (!banner) return;
  const icons = {
    good: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--good);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    warn: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--warn);"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>`,
    bad:  `<span>🚫</span>`,
  };
  banner.className = `banner ${type}`;
  banner.innerHTML = `<div class="banner-icon">${icons[type] || ''}</div><div>${html}</div>`;
}

// ── HELPER: highlight source button ─────────────────────────────
function highlightSourceBtn(which) {
  const defBtn = document.getElementById('useDefault');
  const upBtn  = document.getElementById('useUpload');
  if (!defBtn || !upBtn) return;
  if (which === 'default') {
    defBtn.style.borderColor = 'var(--primary)'; defBtn.style.color = 'var(--primary)';
    upBtn.style.borderColor  = ''; upBtn.style.color = '';
  } else {
    upBtn.style.borderColor  = 'var(--primary)'; upBtn.style.color = 'var(--primary)';
    defBtn.style.borderColor = ''; defBtn.style.color = '';
  }
}