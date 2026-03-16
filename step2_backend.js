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

// ── IDENTIFIER & TARGET HEURISTICS ───────────────────────────────
function _looksLikeId(name) {
  const n = name.toLowerCase().replace(/[_\s\-]/g, '');
  const exact = ['id','pid','uid','sid','cid','rid','eid','mrn','ssn','nhs','accession'];
  return exact.includes(n) || n.endsWith('id');
}

function _looksLikeTarget(name) {
  const n = name.toLowerCase().replace(/[_\s\-]/g, '');
  const keywords = [
    'death','died','mortality','survive','survival',
    'readmit','admission','rehospital',
    'outcome','result','label','target','class','status','condition',
    'disease','disorder','diagnosis','diagnosed',
    'event','failure','stroke','attack','cancer','tumor','positive',
    'heartdisease','heartfailure','chd','mi','cvd',
  ];
  return keywords.some(k => n.includes(k));
}

// ── CSV ANALYSIS ─────────────────────────────────────────────────
function analyseCSV(parsedData) {
  const fields = parsedData.meta.fields || [];
  const rows = parsedData.data.filter(r => Object.values(r).some(v => v !== '' && v !== null && v !== undefined));

  if (rows.length < 10) throw new Error(`File has only ${rows.length} data rows. Minimum is 10.`);

  const columns = fields.map(name => {
    const values = rows.map(r => r[name]);
    const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
    const missingCount = values.length - nonEmpty.length;
    const missingPct = +(missingCount / values.length * 100).toFixed(1);

    const strValues = nonEmpty.map(v => String(v).trim());
    const uniqueValues = [...new Set(strValues)];

    // Numeric detection
    const numericValues = strValues.map(v => parseFloat(v)).filter(v => !isNaN(v));
    const isNumeric = nonEmpty.length > 0 && (numericValues.length / nonEmpty.length) > 0.9;

    // Identifier = non-numeric text column where every value is unique.
    // Numeric columns (age, score, frequency) are NEVER identifiers even if all unique.
    // For small datasets (<30 rows) require the column name to look like an ID,
    // because coincidental all-unique is common in small data.
    const isIdentifier = (
      !isNumeric &&
      uniqueValues.length === rows.length &&
      (rows.length >= 30 || _looksLikeId(name))
    );

    // Type classification
    let type;
    if (isIdentifier)                   type = 'identifier';
    else if (uniqueValues.length === 2) type = 'binary';    // 0/1, Yes/No, Male/Female …
    else if (isNumeric)                 type = 'numeric';
    else if (uniqueValues.length <= 20) type = 'category';  // manageable text cardinality
    else                                type = 'text';      // high-cardinality free text

    // Role suggestion
    let role;
    if (isIdentifier)              role = 'ignore';
    else if (_looksLikeTarget(name)) role = 'target';
    else                           role = 'feature';

    // Stats
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

  // At least one numeric or binary column required
  const hasNumeric = columns.some(c => c.type === 'numeric' || c.type === 'binary');
  if (!hasNumeric) throw new Error('File has no numeric or binary measurement columns. At least one is required.');

  // ── Resolve exactly ONE target ───────────────────────────────────
  const targetMatches = columns.filter(c => c.role === 'target');

  if (targetMatches.length === 0) {
    // Fallback: last non-ignored column (outcome is almost always last by convention)
    const eligible = columns.filter(c => c.role !== 'ignore');
    if (eligible.length > 0) eligible[eligible.length - 1].role = 'target';
  } else if (targetMatches.length > 1) {
    // Keep best match: binary > numeric > category; last wins among ties
    let best = null;
    for (const pref of ['binary', 'numeric', 'category']) {
      const typed = targetMatches.filter(c => c.type === pref);
      if (typed.length > 0) { best = typed[typed.length - 1]; break; }
    }
    if (!best) best = targetMatches[targetMatches.length - 1];
    targetMatches.forEach(c => { if (c !== best) c.role = 'feature'; });
  }

  const finalTarget = columns.find(c => c.role === 'target');
  const classBalance = finalTarget ? computeClassBalance(rows, finalTarget.name) : null;
  const totalMissingPct = +(columns.reduce((s, c) => s + c.missingPct, 0) / columns.length).toFixed(1);
  const imbalanceRatio = classBalance ? computeImbalanceRatio(classBalance) : null;

  return {
    name: 'Uploaded CSV',
    source: 'User Upload',
    rows: rows.length,
    columns,
    targetColumn: finalTarget ? finalTarget.name : columns[columns.length - 1].name,
    classBalance,
    imbalanceRatio,
    totalMissingPct,
    rawRows: rows,
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

  const typeLabel = (col) => ({ numeric: 'Number', binary: `Binary (${col.uniqueCount} values)`, category: `Category (${col.uniqueCount})`, text: 'Text', identifier: 'Identifier' }[col.type] || col.type);

  tbody.innerHTML = ds.columns.map(col => `
    <tr>
      <td style="font-family:var(--mono);font-size:12px;">${col.name}</td>
      <td>${typeLabel(col)}</td>
      <td>${col.missingPct > 0 ? col.missingPct + '%' : '0%'}</td>
      <td>${actionTag(col)}</td>
    </tr>`).join('');
}

// ── SYNC CUSTOM DROPDOWN TEXT ────────────────────────────────────
// After programmatically changing a <select>'s value, the custom
// premium dropdown overlay won't update on its own — this forces it.
function _syncTargetSelUI(targetName) {
  const sel = document.getElementById('targetCol');
  if (!sel) return;
  // Update the native select
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === targetName) {
      sel.selectedIndex = i;
      break;
    }
  }
  // Update the custom wrapper overlay if present
  const wrapper = sel.nextElementSibling;
  if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
    const textSpan = wrapper.querySelector('.custom-select-text');
    if (textSpan) textSpan.textContent = sel.options[sel.selectedIndex]?.text || targetName;
    wrapper.querySelectorAll('.custom-option').forEach((opt, idx) => {
      opt.classList.toggle('selected', idx === sel.selectedIndex);
    });
  }
}

function renderTargetSelector(ds) {
  const sel = document.getElementById('targetCol');
  if (!sel) return;
  // Destroy stale custom dropdown UI if it exists from previous dataset
  if (sel.nextElementSibling && sel.nextElementSibling.classList.contains('custom-select-wrapper')) {
    sel.nextElementSibling.remove();
  }

  // Populate with actual columns from dataset (excluding identifiers and free text)
  sel.innerHTML = ds.columns
    .filter(c => c.type !== 'identifier' && c.type !== 'text')
    .map(c => `<option value="${c.name}" ${c.name === ds.targetColumn ? 'selected' : ''}>${c.name}${c.name === ds.targetColumn ? ' (recommended)' : ''}</option>`)
    .join('');

  // IMPORTANT: Remove any old change listeners before adding a new one to prevent duplicate triggers
  const newSel = sel.cloneNode(true);
  sel.parentNode.replaceChild(newSel, sel);

  // Save choice
  newSel.addEventListener('change', () => { 
    saveTargetCol(newSel.value); 
    ds.targetColumn = newSel.value;
    
    // Sync roles to avoid duplicate targets
    const roles = loadColumnRoles();
    Object.keys(roles).forEach(k => {
      if (roles[k] === 'target' && k !== newSel.value) {
        const cInfo = ds.columns.find(c => c.name === k);
        roles[k] = (cInfo && cInfo.type === 'binary') ? 'category' : 'numeric';
      }
    });
    roles[newSel.value] = 'target';
    saveColumnRoles(roles);

    saveDataset(ds);
    renderFeaturesTable(ds);
    renderClassBalance(ds); // Class balance depends on target

    // Target değiştiğinde, kullanıcıyı Column Mapper'ı tekrar açıp kaydetmeye zorla
    // Böylece Step 3'e geçmeden önce şema yeniden doğrulanmış olur.
    saveSchemaOK(false);
    updateSchemaBanner();
  });
  saveTargetCol(ds.targetColumn);

  // Re-init custom dropdowns then force correct text
  if (typeof initPremiumDropdowns === 'function') {
    newSel.style.removeProperty('display');
    initPremiumDropdowns();
  }
  // Belt-and-suspenders: directly set the wrapper text to the selected option
  setTimeout(() => {
    const wrapper = newSel.nextElementSibling;
    if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
      const textSpan = wrapper.querySelector('.custom-select-text');
      if (textSpan) textSpan.textContent = newSel.options[newSel.selectedIndex]?.text || ds.targetColumn;
      wrapper.querySelectorAll('.custom-option').forEach((opt, idx) => {
        opt.classList.toggle('selected', idx === newSel.selectedIndex);
      });
    }
  }, 0);
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
    if (col.type === 'identifier')  return '<span class="tag bad">Identifier-like</span>';
    if (col.type === 'binary'   && col.missingPct > 0) return `<span class="tag warn">Binary · ${col.missingPct}% missing</span>`;
    if (col.type === 'numeric'  && col.missingPct > 0) return `<span class="tag warn">Number · ${col.missingPct}% missing</span>`;
    if (col.type === 'category' && col.missingPct > 0) return `<span class="tag warn">Category · ${col.missingPct}% missing</span>`;
    if (col.type === 'binary')      return `<span class="tag good">Binary (${col.uniqueCount} values)</span>`;
    if (col.type === 'numeric')     return '<span class="tag good">Number</span>';
    if (col.type === 'category')    return `<span class="tag info">Category (${col.uniqueCount} values)</span>`;
    return '<span class="tag info">Text</span>';
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
    let roleForSelect;
    if (role === 'target') roleForSelect = 'target';
    else if (role === 'ignore') roleForSelect = 'ignore';
    else if (col.type === 'category' || col.type === 'text' || col.type === 'binary') roleForSelect = 'category';
    else roleForSelect = 'numeric';
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

  // User's current choice in mapper overrides stale stored ds.targetColumn
  const mapperTargetEl = document.getElementById('mapperTargetCol');
  const effectiveTarget = (mapperTargetEl && mapperTargetEl.value && ds.columns.some(c => c.name === mapperTargetEl.value))
    ? mapperTargetEl.value
    : ds.targetColumn;

  // Assign defaults for columns without explicit roles
  const activeRoles = {};
  ds.columns.forEach(col => {
    let role = roles[col.name] || col.role;
    // Resolve abstract 'feature' role (from analyseCSV) into specific dropdown equivalents
    if (role === 'feature') {
      role = (col.type === 'binary' || col.type === 'category' || col.type === 'text') ? 'category' : 'numeric';
    }
    // Enforce exclusivity: use effectiveTarget (mapper choice) as single source of truth
    if (role === 'target' && col.name !== effectiveTarget) {
      role = (col.type === 'binary' || col.type === 'category' || col.type === 'text') ? 'category' : 'numeric';
    }
    if (col.name === effectiveTarget) {
      role = 'target';
    }
    activeRoles[col.name] = role;
  });

  const targetCols = Object.entries(activeRoles).filter(([, r]) => r === 'target');
  const featureCols = Object.entries(activeRoles).filter(([, r]) => r === 'numeric' || r === 'category');
  const ignoreCols = Object.entries(activeRoles).filter(([, r]) => r === 'ignore');

  if (targetCols.length === 0) return { ok: false, msg: 'No target column assigned. Set one column as "Target".' };
  if (targetCols.length > 1)  return { ok: false, msg: 'More than one target column assigned. Keep exactly one.' };
  if (featureCols.length === 0) return { ok: false, msg: 'No feature columns assigned. At least one "Number" or "Category" column is required.' };

  const targetName = targetCols[0][0];
  const targetColInfo = ds.columns.find(c => c.name === targetName);
  if (targetColInfo && targetColInfo.missingPct > 20) {
    return { ok: false, msg: `Target column "${targetName}" has ${targetColInfo.missingPct}% missing values. This is too high.` };
  }

  ds.targetColumn = targetName;
  saveTargetCol(targetName);
  saveColumnRoles(activeRoles);
  saveDataset(ds);

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

  function _doSave(closeAfter) {
    // Require an explicit click on "Validate Schema" after opening the mapper.
    // (Even though we can validate programmatically, UX requirement is to force the user to press it.)
    if (!window.__healthai_mapperValidateClicked) {
      const mb = document.getElementById('mapBanner');
      if (mb) {
        mb.className = 'banner warn';
        mb.innerHTML = '<div class="banner-icon">⚠️</div><div><b>Action required:</b> You should validate the schema before saving.</div>';
      } else {
        alert('You should validate the schema before saving.');
      }
      return false;
    }
    const result = validateMapper();
    if (!result.ok) {
      document.getElementById('validateSchema')?.click(); // trigger error UI
      return false;
    }
    saveSchemaOK(true);
    updateSchemaBanner();
    
    // Update target column and refresh all UI
    const ds = loadDataset();
    if (ds && result.targetName) {
      // Update column roles to match validated target
      ds.columns.forEach(c => {
        if (c.name === result.targetName) c.role = 'target';
        else if (c.role === 'target')     c.role = 'feature';
      });
      ds.targetColumn = result.targetName;
      // Recompute class balance for the new target
      if (ds.rawRows && ds.rawRows.length > 0) {
        ds.classBalance = computeClassBalance(ds.rawRows, result.targetName);
        ds.imbalanceRatio = ds.classBalance ? computeImbalanceRatio(ds.classBalance) : null;
      }
      saveDataset(ds);
      renderFeaturesTable(ds);
      renderClassBalance(ds);
      // Force the main page targetCol select to show the new target
      _syncTargetSelUI(ds.targetColumn);
      renderTargetSelector(ds);
    }
    
    // Dispatch event so app.js schemaOK variable syncs
    try { window.dispatchEvent(new CustomEvent('schemaValidated', { detail: { ok: true } })); } catch(e) {}
    
    // Emulate app.js markSchemaSaved logic
    try { localStorage.setItem('heathAI_schemaOK', '1'); } catch(e) {}
    try { sessionStorage.setItem('healthai_schemaOK', '1'); } catch(e) {}
    const sb = document.getElementById('schemaBanner');
    if (sb) {
      sb.className = 'banner good';
      sb.innerHTML = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--good);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><div><b>Mapping saved.</b> Schema validated. You can now proceed to Step 3.</div>';
    }

    if (closeAfter) {
      document.getElementById('mapperBack')?.classList.remove('open');
    }
    if (typeof initStep3UI === 'function') initStep3UI();
    return true;
  }

  // Override ALL existing click listeners from app.js by replacing the buttons with clean clones
  if (_origSaveMapping) {
    const freshBtn = _origSaveMapping.cloneNode(true);
    _origSaveMapping.parentNode.replaceChild(freshBtn, _origSaveMapping);
    freshBtn.addEventListener('click', function() { _doSave(false); });
  }
  if (_origSaveAndClose) {
    const freshBtn = _origSaveAndClose.cloneNode(true);
    _origSaveAndClose.parentNode.replaceChild(freshBtn, _origSaveAndClose);
    freshBtn.addEventListener('click', function() { _doSave(true); });
  }

});

// ── LOAD DEFAULT DATASET ─────────────────────────────────────────
function loadDefaultDataset(resetSchema) {
  const domainName = getCurrentDomain();
  const meta = getDatasetForDomain(domainName);
  
  if (!meta || !meta.localFile) {
    console.warn("No localFile mapping for " + domainName);
    return;
  }
  
  // Update name immediately
  const domainLabelEl = document.getElementById('domainLabel');
  if (domainLabelEl && !domainLabelEl.textContent) {
    domainLabelEl.textContent = domainName;
  }

  // Show loading state in the features table
  const tbody = document.getElementById('featuresTableBody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 30px; font-style: italic; color: var(--text-muted);">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-bottom: 8px;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg><br>
      Downloading and analyzing realistic dataset (${meta.localFile})...
    </td></tr>`;
  }
  
  // Inject a quick CSS spin animation if not present
  if (!document.getElementById('spinStyle')) {
    const style = document.createElement('style');
    style.id = 'spinStyle';
    style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  // Use Papa.parse to stream/download the CSV file
  Papa.parse(meta.localFile, {
    download: true,
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // Types handled in analyseCSV
    complete: function(results) {
      if (!results.data || results.data.length === 0) {
        console.error("Empty CSV or parse error", results.errors);
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="color:var(--bad); text-align:center;">Empty or invalid CSV file.</td></tr>';
        return;
      }
      
      try {
        const ds = analyseCSV(results);
        
        // Override properties with metadata from domain_datasets.js
        ds.name = meta.name || domainName;
        ds.source = meta.source || "Local CSV";
        
        // Force target column if specified in metadata
        if (meta.defaultTarget) {
          const tCol = ds.columns.find(c => c.name === meta.defaultTarget);
          if (tCol) {
            ds.targetColumn = meta.defaultTarget;
            // Ensure roles reflect this forced target
            ds.columns.forEach(c => {
              if (c.name === meta.defaultTarget) c.role = 'target';
              else if (c.role === 'target') c.role = 'feature';
            });
            // Recompute class balance for forced target
            ds.classBalance = computeClassBalance(results.data, meta.defaultTarget);
            ds.imbalanceRatio = ds.classBalance ? computeImbalanceRatio(ds.classBalance) : null;
          }
        }
        
        saveDataset(ds);
        renderDataset(ds);
        if (resetSchema) {
          saveSchemaOK(false);
        }
        updateSchemaBanner();
        if (typeof initStep3UI === 'function') initStep3UI();
      } catch (e) {
        console.error("Error analyzing CSV data:", e);
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="color:var(--bad); text-align:center;">Failed to analyze dataset. See console.</td></tr>';
      }
    },
    error: function(err) {
      console.error("Failed to load local dataset CSV:", err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="color:var(--bad); text-align:center;">Failed to load dataset file: ' + err.message + '</td></tr>';
    }
  });
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
      if (typeof initStep3UI === 'function') initStep3UI();

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