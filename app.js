// ── STEP NAVIGATION ──────────────────────────────────────────────
    let schemaOK = (function(){ try { return localStorage.getItem('heathAI_schemaOK') === '1'; } catch(e){ return false; } })();
    let currentStep = 1;
    const steps = [...document.querySelectorAll('.step-btn')];
    const screens = [...document.querySelectorAll('.screen')];

    var stepNames = { 1: 'Clinical Context', 2: 'Data Exploration', 3: 'Data Preparation', 4: 'Model & Parameters', 5: 'Results', 6: 'Explainability', 7: 'Ethics & Bias' };
    function showStep(n) {
      currentStep = n;
      steps.forEach(s => {
        const sn = Number(s.dataset.step);
        s.classList.toggle('active', sn === n);
        if (sn < n) s.classList.add('done'); else s.classList.remove('done');
      });
      screens.forEach(s => s.classList.toggle('active', s.id === `step-${n}`));
      var ind = document.getElementById('stepIndicator');
      if (ind) { ind.innerHTML = '<span style="font-weight:700;color:var(--primary);">Step ' + n + ' / 7</span> · ' + (stepNames[n] || ''); }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (n === 4 && typeof _redrawActive === 'function') {
        setTimeout(function(){ requestAnimationFrame(_redrawActive); }, 80);
      }
    }

    function gate(n) {
      if (typeof isSchemaOK === 'function') {
        schemaOK = isSchemaOK();
      } else {
        try { schemaOK = sessionStorage.getItem('healthai_schemaOK') === '1' || localStorage.getItem('heathAI_schemaOK') === '1'; } catch(e) {}
      }
      
      if (n >= 3 && !schemaOK) {
        showStep(2);
        var sb = document.getElementById('schemaBanner');
        if (sb) {
          sb.className = 'banner bad';
          sb.innerHTML = '<div class="banner-icon">🚫</div><div><b>Action required:</b> You must open the Column Mapper, validate the schema, and save before continuing to Step 3.</div>';
        }
        return true;
      }
      return false;
    }

    steps.forEach(b => b.addEventListener('click', () => {
      const n = Number(b.dataset.step);
      if (gate(n)) return;
      showStep(n);
    }));

    document.body.addEventListener('click', e => {
      const nx = e.target.closest('[data-next]');
      const pv = e.target.closest('[data-prev]');
      if (nx) { 
        const n = Number(nx.dataset.next); 
        
        // Custom logic for jumping between HTML pages for step 1 -> 2
        const isStep2Page = window.location.href.includes('step2');
        if (n === 2 && !isStep2Page) {
          const currentDomain = document.getElementById('domainLabel').textContent;
          window.location.href = `step2-data-exploration.html?domain=${encodeURIComponent(currentDomain)}`;
          return;
        }

        if (!gate(n)) showStep(n); 
      }
      if (pv) {
        const n = Number(pv.dataset.prev);
        if (n === 1 && window.location.pathname.includes('step2')) {
          const currentDomain = document.getElementById('domainLabel').textContent;
          window.location.href = `step1-clinical-context.html?domain=${encodeURIComponent(currentDomain)}`;
          return;
        }
        showStep(n);
      }
    });

    // ── DOMAIN SWITCHER ───────────────────────────────────────────────
    const domainData = {
      'Cardiology': 'Will this patient be readmitted to hospital within 30 days of discharge following a heart failure episode?',
      'Nephrology': 'Does this patient have chronic kidney disease based on their routine blood and urine test results?',
      'Oncology': 'Is this breast tissue biopsy malignant (cancerous) or benign (non-cancerous)?',
      'Neurology': 'Does this patient show voice-based biomarkers consistent with Parkinson\'s disease?',
      'Diabetes': 'Will this patient develop Type 2 diabetes within the next 5 years based on current metabolic measurements?',
      'Pulmonology': 'Is this COPD patient at high risk of a severe exacerbation requiring hospitalisation in the next 3 months?',
      'Sepsis / ICU': 'Will this ICU patient develop sepsis in the next 6 hours based on current vital signs and lab results?',
      'Fetal Health': 'Is this fetal cardiotocography reading normal, suspicious, or pathological?',
      'Dermatology': 'Is this skin lesion likely benign (harmless) or malignant (potentially cancerous)?',
      'Stroke Risk': 'Is this patient at high risk of having a stroke within the next 10 years?',
    };

    document.querySelectorAll('.domain-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const d = pill.dataset.domain;
        const prevDomain = document.getElementById('domainLabel').textContent;
        // If triggered programmatically (e.g. from URL param), skip confirm
        if (d === prevDomain && !e.isTrusted) {
          // just force UI update if needed, but usually it's already set
        } else if (d === prevDomain) {
          return;
        }
        const doSwitch = () => {
          schemaOK = false;
          try { localStorage.removeItem('heathAI_schemaOK'); } catch(err) {}
          window.location.href = `step1-clinical-context.html?domain=${encodeURIComponent(d)}`;
        };

        if (e.isTrusted && d !== prevDomain) {
          elegantConfirm(
            'Switch Clinical Domain?',
            `Are you sure you want to switch the domain to ${d}? This will reset your current progress and return you to Step 1.`,
            doSwitch,
            () => {
              document.querySelectorAll('.domain-pill').forEach(p => p.classList.remove('active'));
              var prevPill = document.querySelector('.domain-pill[data-domain="' + prevDomain + '"]');
              if (prevPill) prevPill.classList.add('active');
            }
          );
        } else {
          // Trusted init or auto-init: do DOM updates directly to avoid reload loop
          document.querySelectorAll('.domain-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          document.getElementById('domainLabel').textContent = d;
          
          const step1Domain = document.getElementById('step1-domain');
          if (step1Domain) step1Domain.textContent = d;
          
          const step1Question = document.getElementById('step1-question');
          if (step1Question && domainData[d]) step1Question.textContent = domainData[d];
          
          const step1Desc = document.getElementById('step1-desc');
          if (step1Desc) step1Desc.innerHTML = `Before we look at any data, we define the clinical problem. In <b>${d}</b>, we want to ${pill.dataset.use || 'solve this clinical challenge'}.`;
        }
      });
    });

    // Check URL for domain parameter and auto-select
    window.addEventListener('DOMContentLoaded', () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlDomain = urlParams.get('domain');
      if (urlDomain) {
        const targetPill = document.querySelector(`.domain-pill[data-domain="${urlDomain}"]`);
        if (targetPill) {
          // Trigger non-trusted click to bypass confirmation
          targetPill.dispatchEvent(new Event('click'));
        }
      }
    });

    // ── UPLOAD TOGGLE ─────────────────────────────────────────────────
    document.getElementById('useDefault').addEventListener('click', function () {
      document.getElementById('uploadArea').style.display = 'none';
      this.style.borderColor = 'var(--navy)'; this.style.color = 'var(--navy)';
      document.getElementById('useUpload').style.borderColor = '';
      document.getElementById('useUpload').style.color = '';
    });
    document.getElementById('useUpload').addEventListener('click', function () {
      document.getElementById('uploadArea').style.display = 'block';
      this.style.borderColor = 'var(--navy)'; this.style.color = 'var(--navy)';
      document.getElementById('useDefault').style.borderColor = '';
      document.getElementById('useDefault').style.color = '';
    });

    // Drop zone
    const dz = document.getElementById('dropZone');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); handleFile(e.dataTransfer.files[0]); });
    document.getElementById('csvInput').addEventListener('change', e => handleFile(e.target.files[0]));

    function handleFile(file) {
      const status = document.getElementById('uploadStatus');
      const error = document.getElementById('uploadError');
      status.style.display = 'none'; error.style.display = 'none';
      if (!file) return;
      if (!file.name.endsWith('.csv')) {
        error.style.display = 'block';
        document.getElementById('uploadErrMsg').textContent = 'This file is not a CSV. Please export your data as a .csv file.';
        dz.classList.add('error'); return;
      }
      if (file.size > 52428800) {
        error.style.display = 'block';
        document.getElementById('uploadErrMsg').textContent = 'File exceeds 50 MB. Please reduce the file to 50,000 rows or fewer.';
        dz.classList.add('error'); return;
      }
      dz.classList.remove('error'); dz.classList.add('has-file');
      status.style.display = 'block';
      document.getElementById('uploadMsg').textContent = `✓ "${file.name}" loaded (${(file.size / 1024).toFixed(0)} KB). Detecting columns…`;
    }

    // ── COLUMN MAPPER MODAL ───────────────────────────────────────────
    const mapBack = document.getElementById('mapperBack');
    document.getElementById('openMapper').addEventListener('click', () => {
      if (typeof populateMapper === 'function') {
        var ds = typeof loadDataset === 'function' ? loadDataset() : null;
        if (ds) populateMapper(ds);
      }
      mapBack.classList.add('open');
    });
    document.getElementById('closeMapper').addEventListener('click', () => mapBack.classList.remove('open'));
    document.getElementById('cancelMapper').addEventListener('click', () => mapBack.classList.remove('open'));
    mapBack.addEventListener('click', e => { if (e.target === mapBack) mapBack.classList.remove('open'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') mapBack.classList.remove('open'); });

    document.getElementById('validateSchema').addEventListener('click', () => {
      if (typeof validateMapper === 'function') {
        // Handled by step2-data.js
        var result = validateMapper();
        var dot = document.getElementById('schDot');
        var status = document.getElementById('schStatus');
        var mb = document.getElementById('mapBanner');
        if (result.ok) {
          if (dot) dot.className = 's-pill-dot ok';
          if (status) status.textContent = 'Valid';
          if (mb) { mb.className = 'banner good'; mb.innerHTML = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--good);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><div><b>Valid:</b> Target is "' + result.targetName + '", ' + result.featureCount + ' feature columns ready.</div>'; }
        } else {
          if (dot) dot.className = 's-pill-dot bad';
          if (status) status.textContent = 'Invalid';
          if (mb) { mb.className = 'banner bad'; mb.innerHTML = '<div class="banner-icon">🚫</div><div><b>Error:</b> ' + result.msg + '</div>'; }
        }
      } else {
        document.getElementById('schDot').className = 's-pill-dot ok';
        document.getElementById('schStatus').textContent = 'Valid';
        var mb = document.getElementById('mapBanner');
        mb.className = 'banner good';
        mb.innerHTML = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--good);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><div><b>Valid:</b> Target is binary, has no missing values, and identifier column is excluded.</div>';
      }
    });

    function markSchemaSaved() {
      // Must validate before saving
      if (typeof validateMapper === 'function') {
        var result = validateMapper();
        if (!result.ok) {
          // Trigger validate UI to show the error
          document.getElementById('validateSchema').click();
          return false;
        }
      }
      schemaOK = true;
      try { localStorage.setItem('heathAI_schemaOK', '1'); } catch(e) {}
      try { sessionStorage.setItem('healthai_schemaOK', '1'); } catch(e) {}
      const sb = document.getElementById('schemaBanner');
      if (sb) {
        sb.className = 'banner good';
        sb.innerHTML = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--good);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><div><b>Mapping saved.</b> Schema validated. You can now proceed to Step 3.</div>';
      }
      return true;
    }
    document.getElementById('saveMapping').addEventListener('click', markSchemaSaved);
    document.getElementById('saveAndClose').addEventListener('click', () => {
      if (markSchemaSaved()) mapBack.classList.remove('open');
    });

    // Sync schemaOK when step2_backend validates independently
    window.addEventListener('schemaValidated', function(e) {
      if (e.detail && e.detail.ok) {
        schemaOK = true;
        try { localStorage.setItem('heathAI_schemaOK', '1'); } catch(ex) {}
      }
    });





    // == MODEL TABS + VISUALIZATIONS (Phase 8 Final) ==
    const _modelDescs = {
      knn: '<b>K-Nearest Neighbors (KNN)</b> — Finds the <b>K most similar past patients</b> and predicts based on their outcomes. Adjust K to see how the neighbourhood radius changes.',
      svm: '<b>Support Vector Machine (SVM)</b> — Draws the <b>widest margin boundary</b> between readmitted and non-readmitted patients. C controls strictness; kernel controls boundary shape.',
      dt:  '<b>Decision Tree</b> — Asks a sequence of Yes/No questions about patient measurements. More depth = more questions = potentially overfitting the training data.',
      rf:  '<b>Random Forest</b> — A committee of many independent decision trees. Each votes; the majority wins. More trees = more stable predictions.',
      lr:  '<b>Logistic Regression</b> — Converts a linear combination of measurements into a readmission probability via the S-Curve. C controls the curve\'s steepness.',
      nb:  "<b>Naïve Bayes</b> — Combines each measurement's independent risk contribution using Bayes' theorem. Each bar shows how much that feature shifts the final probability.",
    };
    const _paramP = {knn:'params-knn',svm:'params-svm',dt:'params-dt',rf:'params-rf',lr:'params-lr',nb:'params-nb'};
    const _vizP   = {knn:'viz-knn',   svm:'viz-svm',   dt:'viz-dt',  rf:'viz-rf',  lr:'viz-lr',  nb:'viz-nb'};
    let _activeAlgo = 'knn';

    function _showAlgo(m) {
      _activeAlgo = m;
      document.querySelectorAll('.model-tab').forEach(t=>t.classList.remove('active'));
      const tab=document.querySelector('.model-tab[data-model="'+m+'"]'); if(tab) tab.classList.add('active');
      const desc=document.getElementById('modelDesc'); if(desc) desc.innerHTML=_modelDescs[m]||'';
      Object.values(_paramP).forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
      Object.values(_vizP  ).forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
      const pp=document.getElementById(_paramP[m]); if(pp) pp.style.display='block';
      const vp=document.getElementById(_vizP[m]);   if(vp) vp.style.display='block';
      // Use rAF so elements are visible and have non-zero layout before drawing
      requestAnimationFrame(function(){ requestAnimationFrame(_redrawActive); });
    }
    document.querySelectorAll('.model-tab').forEach(tab=>{
      tab.addEventListener('click',function(){_showAlgo(tab.dataset.model);});
    });

    function _css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

    // Canvas helper: use actual rendered dimensions to avoid init stretch bug
    function _sizeCanvas(canvas, defaultH) {
      var dpr = window.devicePixelRatio || 1;
      var W = canvas.offsetWidth;
      var H = canvas.offsetHeight || defaultH || 240;
      if (W < 10) { var par = canvas.parentElement; W = par ? par.clientWidth || 400 : 400; }
      if (H < 10) H = defaultH || 240;
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      var ctx = canvas.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(dpr, dpr);
      return {ctx:ctx, W:W, H:H};
    }

    function _wireSlider(sid, vid, fmt, cb) {
      var s=document.getElementById(sid), v=document.getElementById(vid);
      if(!s) return;
      s.addEventListener('input', function(){
        if(v) v.textContent = fmt ? fmt(+s.value) : s.value;
        if(cb) cb(+s.value);
        triggerRetrain();
        _redrawActive();
      });
    }
    _wireSlider('splitSlider','splitVal',function(v){
      var tr=Math.round(304*v/100),te=304-tr;
      var el=document.getElementById('splitHint');if(el)el.textContent='Training: '+tr+' patients · Testing: '+te+' patients';
      return v+'%';
    });
    _wireSlider('knnK','knnKVal',null,function(v){var l=document.getElementById('knnKVizLabel');if(l)l.textContent=v;});
    _wireSlider('svmC','svmCVal',function(v){return (Math.pow(10,(v-5)/2)).toFixed(2);});
    var _svmKEl=document.getElementById('svmKernel');
    if(_svmKEl) _svmKEl.addEventListener('change',function(){if(_activeAlgo==='svm')_drawSVM();triggerRetrain();});
    _wireSlider('dtDepth','dtDepthVal');
    _wireSlider('rfTrees','rfTreesVal',null,function(v){var e=document.getElementById('rfTreeCountVal');if(e)e.textContent=v;var e2=document.getElementById('rfTreeCountVal2');if(e2)e2.textContent=v;});
    _wireSlider('rfDepth','rfDepthVal');
    _wireSlider('lrC','lrCVal',function(v){return (Math.pow(10,(v-5)/2)).toFixed(2);});
    _wireSlider('lrIter','lrIterVal');

    function _redrawActive(){
      if(_activeAlgo==='knn')_drawKNN();
      else if(_activeAlgo==='svm')_drawSVM();
      else if(_activeAlgo==='dt') _drawDT();
      else if(_activeAlgo==='rf') _drawRF();
      else if(_activeAlgo==='lr') _drawLR();
      else if(_activeAlgo==='nb') _drawNB();
    }

    // ── KNN: Dots + star always visible; K=0 shows base, K>0 highlights neighbors ──
    var _knnRAF, _knnCurR=0, _knnInited=false;
    function _drawKNN(){
      var canvas=document.getElementById('knnCanvas'); if(!canvas) return;
      var c=_sizeCanvas(canvas,240); var ctx=c.ctx,W=c.W,H=c.H;
      var k=Math.max(0,+(document.getElementById('knnK').value||5));
      var cBad=_css('--bad')||'#dc2626',cGood=_css('--good')||'#16a34a';
      var cPri=_css('--primary')||'#2a7c3f',cInk=_css('--ink')||'#0d2340';
      var pts=[
        [.15,.25,0],[.20,.55,0],[.12,.65,1],[.30,.75,1],[.37,.38,0],
        [.50,.20,0],[.44,.60,1],[.58,.70,1],[.63,.40,0],[.70,.60,1],
        [.76,.28,0],[.83,.64,1],[.35,.17,0],[.61,.80,1],[.88,.37,0],
        [.10,.45,1],[.90,.73,1],[.60,.12,0],[.28,.44,0],[.53,.46,1]
      ];
      var np=[.48,.51];
      var dists=pts.map(function(p,i){return{i:i,d:Math.hypot(p[0]-np[0],p[1]-np[1]),c:p[2]};});
      dists.sort(function(a,b){return a.d-b.d;});
      var nbrs=k>0?new Set(dists.slice(0,k).map(function(d){return d.i;})):new Set();
      var targetR=k>0?dists[k-1].d*Math.min(W,H):0;
      if(!_knnInited){ _knnCurR=targetR; _knnInited=true; }
      if(_knnRAF) cancelAnimationFrame(_knnRAF);
      function frame(){
        _knnCurR += (targetR - _knnCurR) * 0.14;
        ctx.clearRect(0,0,W,H);
        if(k>0){
          ctx.lineWidth=1;ctx.strokeStyle=cPri;ctx.globalAlpha=.15;
          pts.forEach(function(p,i){if(!nbrs.has(i))return;ctx.beginPath();ctx.moveTo(p[0]*W,p[1]*H);ctx.lineTo(np[0]*W,np[1]*H);ctx.stroke();});
          ctx.globalAlpha=1;
          ctx.beginPath();ctx.arc(np[0]*W,np[1]*H,Math.max(0,_knnCurR),0,2*Math.PI);
          ctx.strokeStyle=cPri;ctx.lineWidth=2;ctx.globalAlpha=.55;ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);
          ctx.globalAlpha=.06;ctx.fillStyle=cPri;ctx.fill();ctx.globalAlpha=1;
        }
        pts.forEach(function(p,i){
          var isN=nbrs.has(i);
          ctx.beginPath();ctx.arc(p[0]*W,p[1]*H,isN?6.5:4.5,0,2*Math.PI);
          ctx.fillStyle=p[2]===1?cBad:cGood;ctx.globalAlpha=isN?1:.35;ctx.fill();
          if(isN){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.globalAlpha=1;ctx.stroke();}
          ctx.globalAlpha=1;
        });
        var sx=np[0]*W,sy=np[1]*H,sr=10;
        ctx.fillStyle=cInk;ctx.beginPath();
        for(var q=0;q<5;q++){var a=(q*4*Math.PI/5)-Math.PI/2,b=(q*4*Math.PI/5+2*Math.PI/5)-Math.PI/2;
          if(q===0)ctx.moveTo(sx+sr*Math.cos(a),sy+sr*Math.sin(a));else ctx.lineTo(sx+sr*Math.cos(a),sy+sr*Math.sin(a));
          ctx.lineTo(sx+sr*.4*Math.cos(b),sy+sr*.4*Math.sin(b));}
        ctx.closePath();ctx.fill();
        var redN=0;dists.slice(0,k).forEach(function(d){if(d.c===1)redN++;});
        ctx.font='bold 12px system-ui';ctx.fillStyle=cInk;ctx.textAlign='left';ctx.globalAlpha=.85;
        ctx.fillText(k===0?'Drag K right to highlight nearest neighbours':('Neighbours: '+k+'  |  Readmit: '+redN+'  |  Safe: '+(k-redN)),8,H-10);
        ctx.globalAlpha=1;
        if(Math.abs(targetR-_knnCurR)>0.5) _knnRAF=requestAnimationFrame(frame);
      }
      frame();
    }

    // ── SVM: Scatter + decision boundary (linear/poly/RBF) with smooth transitions ──
    var _svmRAF, _svmT=0, _svmAnimPrevC=-1, _svmAnimPrevK='';
    function _drawSVM(){
      var canvas=document.getElementById('svmCanvas'); if(!canvas) return;
      var C=+(document.getElementById('svmC').value||5);
      var kernel=(_svmKEl?_svmKEl.value:'rbf').toLowerCase().replace(/\s.*/,'')||'rbf';
      if(kernel.includes('linear'))kernel='linear'; else if(kernel.includes('poly'))kernel='poly'; else kernel='rbf';
      if(C!==_svmAnimPrevC||kernel!==_svmAnimPrevK){_svmT=0;_svmAnimPrevC=C;_svmAnimPrevK=kernel;}
      var c=_sizeCanvas(canvas,260); var ctx=c.ctx,W=c.W,H=c.H;
      var cBad=_css('--bad')||'#dc2626',cGood=_css('--good')||'#16a34a';
      var cPri=_css('--primary')||'#2a7c3f',cInk=_css('--ink')||'#0d2340',cMuted=_css('--text-muted')||'#6b7280';
      var rPts=[[.15,.72],[.22,.80],[.28,.85],[.12,.63],[.33,.90],[.24,.76],[.38,.94],[.08,.78]];
      var gPts=[[.73,.25],[.80,.18],[.85,.32],[.67,.14],[.90,.35],[.75,.22],[.62,.08],[.92,.27]];
      var cVal=Math.pow(10,(Math.max(1,Math.min(10,C))-5)/2);
      var margin=Math.max(0.03,Math.min(0.25,0.22-(C/10)*0.14));
      if(_svmRAF) cancelAnimationFrame(_svmRAF);
      function frame(){
        _svmT += (1-_svmT)*0.08;
        ctx.clearRect(0,0,W,H);
        var gR=ctx.createLinearGradient(0,0,W,0);
        gR.addColorStop(0,'rgba(220,38,38,.06)');gR.addColorStop(.48,'rgba(220,38,38,.02)');gR.addColorStop(.52,'rgba(22,163,74,.02)');gR.addColorStop(1,'rgba(22,163,74,.06)');
        ctx.fillStyle=gR;ctx.fillRect(0,0,W,H);
        function drawBoundary(t){
          ctx.beginPath();
          if(kernel==='linear'){
            ctx.moveTo(0,H*(1-t));ctx.lineTo(W,H*t);
          } else if(kernel==='poly'){
            var t0=0.4-(t-0.4)*0.3;
            for(var i=0;i<=80;i++){
              var u=i/80; var x=u*W;
              var y=H*(t0+0.15*Math.sin(u*Math.PI*3)*_svmT+0.08*(u-0.5)*(u-0.5)*4);
              if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
            }
          } else {
            var cx=W*.5,cy=H*.5,rx=W*(0.28+margin*0.8)*_svmT,ry=H*(0.18+margin*0.8)*_svmT;
            ctx.ellipse(cx,cy,rx,ry,Math.PI/4,0,2*Math.PI);
          }
        }
        ctx.setLineDash([5,4]);ctx.strokeStyle=cMuted;ctx.lineWidth=1.5;ctx.globalAlpha=.4;
        drawBoundary(0.4-margin); ctx.stroke();
        drawBoundary(0.4+margin); ctx.stroke();
        ctx.setLineDash([]);ctx.globalAlpha=1;
        ctx.strokeStyle=cInk;ctx.lineWidth=2.5;
        drawBoundary(0.4); ctx.stroke();
        function drawGrp(pts,isRed){
          pts.forEach(function(p){
            var diagScore=isRed?(p[0]+p[1]-0.7):((1-p[0])+(1-p[1])-0.7);
            var isSV=Math.abs(diagScore)<margin*2.5;
            ctx.beginPath();ctx.arc(p[0]*W,p[1]*H,isSV?7:5,0,2*Math.PI);
            ctx.fillStyle=isRed?cBad:cGood;ctx.fill();
            if(isSV){ctx.strokeStyle=cInk;ctx.lineWidth=2;ctx.stroke();}
          });
        }
        drawGrp(rPts,true);drawGrp(gPts,false);
        var kLabel=kernel==='linear'?'Linear':kernel==='poly'?'Polynomial':'RBF';
        ctx.font='11px system-ui';ctx.fillStyle=cMuted;ctx.textAlign='left';
        ctx.fillText('C='+cVal.toFixed(2)+' · Margin: '+(margin*100).toFixed(0)+'% · Kernel: '+kLabel,6,H-8);
        if(1-_svmT>0.008) _svmRAF=requestAnimationFrame(frame);
      }
      frame();
    }

    // ── DECISION TREE: DOM-based expanding tree with smooth depth transitions ──
    var _dtPrevDepth=-1;
    function _drawDT(){
      var wrap=document.getElementById('dtWrap'); if(!wrap) return;
      var depth=+(document.getElementById('dtDepth').value||3);
      var warn=document.getElementById('dtWarn');if(warn)warn.style.display=depth>4?'flex':'none';
      var wv=document.getElementById('dtWarnVal');if(wv)wv.textContent=depth;
      var qs=['EF < 38%?','Age ≥ 65?','Creatinine > 1.5?','Smoker?','BP > 140?','Prior admission?'];
      var limit=Math.min(Math.max(1,depth),6);
      function node(lvl,left){
        if(lvl>limit) return '';
        var q=qs[(lvl-1)%qs.length];
        if(lvl===limit){
          var lbl=left?'Readmit':'Safe';
          var cls=left?'leaf-r':'leaf-g';
          return '<div class="t-child"><div class="t-lbl '+cls+'">'+lbl+'</div></div>';
        }
        return '<div class="t-child">'
          +'<div class="t-lbl q">'+q+'</div>'
          +'<div class="t-children">'+node(lvl+1,true)+node(lvl+1,false)+'</div>'
          +'</div>';
      }
      wrap.style.opacity='0.6';
      wrap.style.transform='scale(0.98)';
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          wrap.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;padding:12px;min-width:min-content;">'
            +'<div class="t-lbl q" style="font-size:13px;margin-bottom:4px;">'+qs[0]+'</div>'
            +'<div class="t-children" style="margin-top:26px;">'+node(2,true)+node(2,false)+'</div>'
            +'</div>';
          wrap.style.opacity='1';
          wrap.style.transform='scale(1)';
        });
      });
    }

    // ── RANDOM FOREST: Animated vote bar chart that updates with tree count ──
    // Visual logic: more trees = vote percentages converge to stable estimate
    function _drawRF(){
      var wrap=document.getElementById('voteTrees'); if(!wrap) return;
      var count=+(document.getElementById('rfTrees').value||100);
      var tv=document.getElementById('rfTreeCountVal');if(tv)tv.textContent=count;
      var tv2=document.getElementById('rfTreeCountVal2');if(tv2)tv2.textContent=count;
      // Convergence: with few trees, votes are noisier
      // With many trees they converge to ~65% Readmit (simulated)
      var maxNoise = Math.max(0, 20 - count/15); // noise decreases as trees increase
      var seed = (count*7+13)%31 - 15; // -15 to +15 deterministic
      var noiseFrac = seed / (count + 1);
      var pct = Math.max(51, Math.min(82, 65 + noiseFrac * maxNoise));
      var rC=Math.round(count*pct/100), sC=count-rC;
      var rPct=(rC/count*100).toFixed(1), sPct=(sC/count*100).toFixed(1);
      // Mini tree icons
      var showN=Math.min(count,24), cutoff=Math.round(showN*pct/100);
      var html='';
      for(var i=0;i<showN;i++){
        var isR=i<cutoff;
        html+='<div class="mini-tree" title="Tree #'+(i+1)+': votes '+(isR?'Readmit':'Safe')+'">'
          +'<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="'+(isR?'var(--bad)':'var(--good)')+'"/></svg>'
          +'<div style="font-size:8px;color:var(--text-muted);">#'+(i+1)+'</div>'
          +'</div>';
      }
      wrap.innerHTML = html;
      // Animate vote bars
      setTimeout(function(){
        var bR=document.getElementById('voteReadmit');
        var bS=document.getElementById('voteSafe');
        var pR=document.getElementById('voteReadmitPct');
        var pS=document.getElementById('voteSafePct');
        if(bR){bR.style.width=rPct+'%';bR.textContent=rC;}
        if(bS){bS.style.width=sPct+'%';bS.textContent=sC;}
        if(pR)pR.textContent=rPct+'%';
        if(pS)pS.textContent=sPct+'%';
      },50);
    }

    // ── LR: S-curve + live patient dot; C=steepness, iterations shown ──
    var _lrRAF, _lrSteep=0.4;
    function _drawLR(){
      var canvas=document.getElementById('lrCanvas'); if(!canvas) return;
      var C=+(document.getElementById('lrC').value||5);
      var iterEl=document.getElementById('lrIter');
      var iter=iterEl?Math.max(100,Math.min(2000,+iterEl.value||1000)):1000;
      var targetSteep = 0.15 + (C/10)*2.0;
      var c=_sizeCanvas(canvas,240); var ctx=c.ctx,W=c.W,H=c.H;
      var cInk=_css('--ink')||'#0d2340',cMuted=_css('--text-muted')||'#6b7280';
      var cCurve=_css('--primary')||'#1A6B9A';
      var cText=_css('--text-primary')||cInk;
      var cBad=_css('--bad')||'#dc2626',cGood=_css('--good')||'#16a34a';
      if(_lrRAF) cancelAnimationFrame(_lrRAF);
      function frame(){
        _lrSteep += (targetSteep - _lrSteep)*0.12;
        ctx.clearRect(0,0,W,H);
        var m=52, pw=W-m*2, ph=H-m*2;
        // Axes
        ctx.strokeStyle=cMuted;ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(m,m-8);ctx.lineTo(m,H-m);ctx.lineTo(W-m+8,H-m);ctx.stroke();
        // Axis labels
        ctx.fillStyle=cMuted;ctx.font='10px system-ui';
        ctx.textAlign='right';
        ctx.fillText('100%',m-4,m+4);ctx.fillText('50%',m-4,m+ph/2+4);ctx.fillText('0%',m-4,H-m+4);
        ctx.textAlign='center';
        ctx.fillText('Ejection Fraction (%)',m+pw/2,H-m+20);
        ctx.save();ctx.translate(m-40,m+ph/2);ctx.rotate(-Math.PI/2);ctx.fillText('Readmission Risk',0,0);ctx.restore();
        // Low/High EF labels
        ctx.textAlign='left';ctx.fillText('Low EF',m,H-m+20);
        ctx.textAlign='right';ctx.fillText('High EF',W-m,H-m+20);
        // Danger zone label
        ctx.globalAlpha=.3;
        ctx.fillStyle=cBad;ctx.fillRect(m,m,pw/2,ph);
        ctx.fillStyle=cGood;ctx.fillRect(m+pw/2,m,pw/2,ph);
        ctx.globalAlpha=1;
        // 50% line
        ctx.setLineDash([4,4]);ctx.strokeStyle=cMuted;ctx.lineWidth=1;ctx.globalAlpha=.4;
        ctx.beginPath();ctx.moveTo(m,m+ph/2);ctx.lineTo(W-m,m+ph/2);ctx.stroke();
        ctx.setLineDash([]);ctx.globalAlpha=1;
        // Gradient under S-curve
        var grad=ctx.createLinearGradient(0,m,0,H-m);
        grad.addColorStop(0,'rgba(220,38,38,.18)');grad.addColorStop(.5,'rgba(150,150,150,.04)');grad.addColorStop(1,'rgba(22,163,74,.12)');
        function sig(t){return 1/(1+Math.exp(-_lrSteep*t));}
        ctx.beginPath();
        for(var i=0;i<=100;i++){var t=i/100*10-5,p=sig(t);if(i===0)ctx.moveTo(m+i/100*pw,m+ph*(1-p));else ctx.lineTo(m+i/100*pw,m+ph*(1-p));}
        ctx.lineTo(W-m,H-m);ctx.lineTo(m,H-m);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
        // S-curve line (use --primary for visibility in dark themes like Neon)
        ctx.strokeStyle=cCurve;ctx.lineWidth=3;
        ctx.beginPath();
        for(var i=0;i<=100;i++){var t=i/100*10-5,p=sig(t);if(i===0)ctx.moveTo(m+i/100*pw,m+ph*(1-p));else ctx.lineTo(m+i/100*pw,m+ph*(1-p));}
        ctx.stroke();
        // Patient at x=0.30 (EF=30%)
        var ef=.30,tef=ef*10-5,pef=sig(tef);
        var ppx=m+ef*pw, ppy=m+ph*(1-pef);
        ctx.beginPath();ctx.arc(ppx,ppy,9,0,2*Math.PI);
        ctx.fillStyle=cBad;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
        ctx.font='bold 11px system-ui';ctx.fillStyle=cText;ctx.textAlign='left';
        ctx.fillText('EF=30% → risk '+(pef*100).toFixed(0)+'%',ppx+13,ppy-7);
        // Second patient at EF=60%
        var ef2=.60,tef2=ef2*10-5,pef2=sig(tef2);
        var ppx2=m+ef2*pw, ppy2=m+ph*(1-pef2);
        ctx.beginPath();ctx.arc(ppx2,ppy2,9,0,2*Math.PI);
        ctx.fillStyle=cGood;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
        ctx.textAlign='left';ctx.fillStyle=cText;
        ctx.fillText('EF=60% → risk '+(pef2*100).toFixed(0)+'%',ppx2+13,ppy2-7);
        ctx.font='10px system-ui';ctx.fillStyle=cMuted;ctx.textAlign='right';
        ctx.fillText('Max iterations: '+iter, W-8, H-8);
        if(Math.abs(targetSteep-_lrSteep)>.005) _lrRAF=requestAnimationFrame(frame);
      }
      frame();
    }

    // ── NAIVE BAYES: Waterfall probability chart showing each feature's contribution ──
    // Visual logic: each bar shows that ONE feature's independent P(Readmit|feature=value)
    // Final bar shows the combined result (multiplicative Bayes combination)
    var _NB=[
      {n:'Base Rate',        val:33, dir:0,   imp:'33% of all patients are readmitted'},
      {n:'EF = 20%',         val:78, dir:+1,  imp:'Very low EF strongly predicts readmission'},
      {n:'Creatinine = 2.1', val:64, dir:+1,  imp:'Elevated kidney marker increases risk'},
      {n:'Age = 71',         val:54, dir:+1,  imp:'Older age moderately increases risk'},
      {n:'Sodium = 136',     val:45, dir:-1,  imp:'Normal sodium slightly reduces risk'},
      {n:'Non-smoker',       val:29, dir:-1,  imp:'Not smoking significantly reduces risk'},
    ];
    function _drawNB(){
      var wrap=document.getElementById('nbBars'); if(!wrap) return;
      // Combined probability: naive formula P(R|all) ∝ ∏P(x|R)/∏P(x|S)
      // For demo, we just show the bars and a summary
      var combined=0.74; // simulated combined probability
      var html=_NB.map(function(f,i){
        var cls = f.dir>0?'inc':f.dir<0?'dec':'';
        var bgcls = f.dir===0?'style="background:var(--text-muted)"':'';
        var arrow = f.dir>0?'↑ ':f.dir<0?'↓ ':'';
        return '<div class="pr-item">'
          +'<div class="pr-hdr">'
          +'<span class="pr-feat">'+f.n+'</span>'
          +'<span class="pr-val">P = '+f.val+'%</span>'
          +'</div>'
          +'<div class="pr-trk"><div class="pr-fil '+cls+'" id="_nbf'+i+'" '+bgcls+'></div></div>'
          +'<div class="pr-imp">'+arrow+f.imp+'</div>'
          +'</div>';
      }).join('');
      // Final combined bar
      html+='<div class="pr-item" style="border-color:var(--primary);margin-top:4px;">'
        +'<div class="pr-hdr"><span class="pr-feat" style="color:var(--primary)">Combined Naïve Bayes Result</span>'
        +'<span class="pr-val" style="color:var(--primary);font-weight:700;">P = '+(combined*100).toFixed(0)+'%</span></div>'
        +'<div class="pr-trk"><div class="pr-fil inc" id="_nbfinal"></div></div>'
        +'<div class="pr-imp">Final readmission risk estimate</div>'
        +'</div>';
      wrap.innerHTML=html;
      _NB.forEach(function(f,i){
        setTimeout(function(){var el=document.getElementById('_nbf'+i);if(el)el.style.width=f.val+'%';},80+i*120);
      });
      setTimeout(function(){var el=document.getElementById('_nbfinal');if(el)el.style.width=(combined*100)+'%';},80+_NB.length*120);
    }

    // ── INIT ──
    _showAlgo('knn');
    window.addEventListener('resize',function(){clearTimeout(window._p8T);window._p8T=setTimeout(_redrawActive,150);});

    // ── AUTO-RETRAIN SIMULATION ───────────────────────────────────────
    // ── AUTO-RETRAIN SIMULATION ───────────────────────────────────────
    let retrainTimer;
    function triggerRetrain() {
      if (!document.getElementById('autoRetrain').checked) return;
      clearTimeout(retrainTimer);
      const ts = document.getElementById('trainingStatus');
      const tm = document.getElementById('trainingMsg');
      const activeModel = document.querySelector('.model-tab.active')?.dataset.model || 'knn';
      ts.style.display = 'block';
      tm.textContent = `Retraining ${activeModel.toUpperCase()}…`;
      retrainTimer = setTimeout(() => {
        ts.style.display = 'none';
        document.querySelector(`.model-tab[data-model="${activeModel}"]`).classList.add('trained');
      }, 900);
    }

    document.getElementById('trainBtn').addEventListener('click', () => {
      const ts = document.getElementById('trainingStatus');
      const tm = document.getElementById('trainingMsg');
      const activeModel = document.querySelector('.model-tab.active')?.dataset.model || 'knn';
      ts.style.display = 'block';
      tm.textContent = `Training ${activeModel.toUpperCase()} on 243 patients…`;
      setTimeout(() => {
        ts.style.display = 'none';
        document.querySelector(`.model-tab[data-model="${activeModel}"]`).classList.add('trained');
        // Simulate result update
        addCompareRow(activeModel);
      }, 1200);
    });

    document.getElementById('addCompare').addEventListener('click', () => {
      const activeModel = document.querySelector('.model-tab.active')?.dataset.model || 'knn';
      addCompareRow(activeModel);
    });

    const compareRows = { 'knn': true };
    function addCompareRow(model) {
      if (compareRows[model]) return;
      compareRows[model] = true;
      const results = {
        svm: ['SVM (RBF, C=1.0)', '81%', '71%', '87%', '0.79'],
        dt: ['Decision Tree (depth=5)', '76%', '58%', '85%', '0.71'],
        rf: ['Random Forest (100 trees)', '83%', '74%', '89%', '0.82'],
        lr: ['Logistic Regression', '79%', '67%', '84%', '0.77'],
        nb: ['Naïve Bayes', '74%', '60%', '81%', '0.72'],
      };
      const r = results[model];
      if (!r) return;
      const tbody = document.getElementById('compareBody');
      const tr = document.createElement('tr');
      const sensCls = parseFloat(r[2]) >= 70 ? 'good' : parseFloat(r[2]) >= 60 ? 'warn' : 'bad';
      tr.innerHTML = `<td>${r[0]}</td><td>${r[1]}</td><td class="delta ${sensCls}">${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td>`;
      tbody.appendChild(tr);
    }

    // ── ETHICS CHECKLIST ──────────────────────────────────────────────
    function toggleCheck(el) {
      el.classList.toggle('checked');
      const box = el.querySelector('.check-box');
      box.textContent = el.classList.contains('checked') ? '✓' : '';
    }
    window.toggleCheck = toggleCheck;

    // ── STEP 6: Patient explanation (update on select) ───────────────────
    var _patientData = {
      '47': { risk: 78, level: 'HIGH RISK', bars: [
        { lbl: '↑ EF very low (20%)', w: 80, val: '+0.24', cls: 'bad' },
        { lbl: '↑ Age 71', w: 58, val: '+0.16', cls: 'bad' },
        { lbl: '↑ Creatinine 2.1', w: 46, val: '+0.12', cls: 'bad' },
        { lbl: '↓ Non-smoker', w: 20, val: '-0.05', cls: 'teal' },
        { lbl: '↓ Sodium normal', w: 14, val: '-0.03', cls: 'teal' }
      ], whatIf: 'creatinine were 1.2 instead of 2.1? The predicted risk would drop to approximately 61%.' },
      '12': { risk: 21, level: 'LOW RISK', bars: [
        { lbl: '↓ EF normal (55%)', w: 75, val: '-0.22', cls: 'teal' },
        { lbl: '↓ Age 45', w: 62, val: '-0.18', cls: 'teal' },
        { lbl: '↓ Creatinine 1.0', w: 48, val: '-0.12', cls: 'teal' },
        { lbl: '↓ Non-smoker', w: 22, val: '-0.06', cls: 'teal' },
        { lbl: '↓ Sodium normal', w: 18, val: '-0.04', cls: 'teal' }
      ], whatIf: 'age were 65 instead of 45? The predicted risk would increase to approximately 38%.' },
      '93': { risk: 51, level: 'MODERATE', bars: [
        { lbl: '↑ EF borderline (38%)', w: 45, val: '+0.08', cls: 'bad' },
        { lbl: '↑ Age 62', w: 38, val: '+0.06', cls: 'bad' },
        { lbl: '↑ Creatinine 1.4', w: 28, val: '+0.04', cls: 'bad' },
        { lbl: '↓ Non-smoker', w: 35, val: '-0.10', cls: 'teal' },
        { lbl: '↓ Sodium normal', w: 25, val: '-0.05', cls: 'teal' }
      ], whatIf: 'ejection fraction were 45% instead of 38%? The predicted risk would drop to approximately 42%.' }
    };
    function updatePatientExplanation() {
      var sel = document.getElementById('caseSelect');
      var titleEl = document.getElementById('patientExplainTitle');
      var barsEl = document.getElementById('patientExplainBars');
      if (!sel || !titleEl || !barsEl) return;
      var id = sel.value || '47';
      var d = _patientData[id] || _patientData['47'];
      titleEl.textContent = 'Why Was Patient #' + id + ' Flagged as ' + d.level + '? (' + d.risk + '% probability)';
      barsEl.innerHTML = d.bars.map(function(b) {
        return '<div class="bar-row"><div class="bar-lbl" style="color:var(--' + (b.cls === 'bad' ? 'bad' : 'good') + ');">' + b.lbl + '</div>' +
          '<div class="bar-track"><div class="bar-fill ' + b.cls + '" style="width:' + b.w + '%"></div></div>' +
          '<div class="bar-val" style="color:var(--' + (b.cls === 'bad' ? 'bad' : 'good') + ');">' + b.val + '</div></div>';
      }).join('');
      var whatIfEl = document.getElementById('patientWhatIfBanner');
      if (whatIfEl && d.whatIf) whatIfEl.innerHTML = '<div class="banner-icon">💡</div><div><b>What-if:</b> What if this patient\'s ' + d.whatIf + ' This kind of thinking helps assess which interventions might help.</div>';
    }
    document.getElementById('caseSelect')?.addEventListener('change', updatePatientExplanation);
    document.getElementById('explainPatientBtn')?.addEventListener('click', updatePatientExplanation);

    // ── DOWNLOAD SUMMARY CERTIFICATE ───────────────────────────────────
    function openDownloadSummary() {
      const domain = document.getElementById('domainLabel')?.textContent || 'Cardiology';
      const checklist = document.querySelectorAll('#euChecklist .check-item');
      const checked = [...checklist].filter(el => el.classList.contains('checked')).length;
      const total = Math.max(checklist.length, 1);
      const compareRows = document.querySelectorAll('#compareBody tr');
      const compareRowsHtml = compareRows.length
        ? [...compareRows].map(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length >= 5) return '<tr><td>' + [0,1,2,3,4].map(i => (cells[i]?.innerText || '').replace(/</g,'&lt;')).join('</td><td>') + '</td></tr>';
            return '';
          }).filter(Boolean).join('')
        : '<tr><td colspan="5">No models trained yet. Complete Step 4 to compare models.</td></tr>';
      const completionNote = (typeof currentStep !== 'undefined' && currentStep >= 7) ? '<p style="color:#0D7A50;font-weight:600;margin-bottom:16px;">✓ All 7 steps completed. This summary is ready for clinical review.</p>' : '';
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Health-AI Summary Certificate</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:28px;color:#1a1a1a;line-height:1.65}
h1{color:#1A6B9A;border-bottom:2px solid #0E9E8E;padding-bottom:10px;margin-bottom:8px}
.section{margin:28px 0}
.section h2{font-size:1.1em;color:#0D2340;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{border:1px solid #ddd;padding:12px;text-align:left}
th{background:#E8F4FA;font-weight:600}
.tag{display:inline-block;padding:4px 10px;border-radius:6px;font-size:12px;margin-right:6px}
.tag-ok{background:#E8F7F0;color:#0D7A50}
.tag-pending{background:#FEF3E2;color:#A05C00}
.footer{margin-top:36px;padding-top:20px;font-size:12px;color:#666;border-top:1px solid #eee}
</style></head><body>
<h1>Health-AI Summary Certificate</h1>
<p style="color:#666;font-size:14px;">Generated on ${new Date().toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}</p>
${completionNote}
<div class="section"><h2>Clinical Domain</h2><p>${(domain+'').replace(/</g,'&lt;')}</p></div>
<div class="section"><h2>7-Step Pipeline Completed</h2>
<ul><li>Step 1: Define Clinical Problem</li><li>Step 2: Upload &amp; Explore Data</li><li>Step 3: Prepare Data</li>
<li>Step 4: Model Selection &amp; Parameter Tuning</li><li>Step 5: Results Evaluation</li><li>Step 6: Explainability</li>
<li>Step 7: Ethics &amp; Bias</li></ul></div>
<div class="section"><h2>EU AI Act Compliance Checklist</h2><p>${checked} of ${total} items completed.</p>
<ul>${[...checklist].map(el => {
  const txt = (el.querySelector('.check-text b')?.textContent || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const ok = el.classList.contains('checked');
  return '<li><span class="tag ' + (ok ? 'tag-ok' : 'tag-pending') + '">' + (ok ? '✓' : '○') + '</span> ' + txt + '</li>';
}).join('')}</ul></div>
<div class="section"><h2>Model Comparison</h2>
<table><thead><tr><th>Model</th><th>Accuracy</th><th>Sensitivity</th><th>Specificity</th><th>AUC</th></tr></thead>
<tbody>${compareRowsHtml}</tbody></table></div>
<div class="footer">This certificate documents your completion of the Health-AI ML Learning Tool pipeline. For educational purposes. Not for clinical decision-making without qualified professional review.</div>
</body></html>`;
      var w = window.open('', '_blank');
      if (w && !w.closed) {
        w.document.write(html);
        w.document.close();
      } else {
        var blob = new Blob([html], { type: 'text/html' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'HealthAI-Summary-Certificate.html';
        a.click();
        URL.revokeObjectURL(a.href);
      }
    }
    document.getElementById('downloadSummaryBtn')?.addEventListener('click', openDownloadSummary);
    document.getElementById('downloadSummaryBtnFooter')?.addEventListener('click', openDownloadSummary);

    // ── RESET ALL ─────────────────────────────────────────────────────
    document.getElementById('resetAll').addEventListener('click', () => {
      elegantConfirm(
        'Reset Entire Pipeline?',
        'Are you sure you want to discard your current model trained data and begin again from Step 1?',
        () => {
          schemaOK = false;
      try { localStorage.removeItem('heathAI_schemaOK'); } catch(e) {}
          Object.keys(compareRows).forEach(k => { if (k !== 'knn') delete compareRows[k]; });
          document.getElementById('compareBody').innerHTML = '<tr><td>KNN (K=5)</td><td>78%</td><td class="delta warn">62%</td><td>85%</td><td>0.74</td></tr>';
          document.querySelectorAll('.model-tab').forEach(t => { t.classList.remove('trained'); if (t.dataset.model === 'knn') t.classList.add('trained'); });
          document.getElementById('schemaBanner').className = 'banner warn';
          document.getElementById('schemaBanner').innerHTML = '<div class="banner-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--warn);"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg></div><div><b>Action needed:</b> Open the Column Mapper to confirm your data structure before continuing to Step 3.</div>';
          showStep(1);
        });
    });

    // ── THEME SWITCHER ────────────────────────────────────────────────
    const themeSelector = document.getElementById('themeSelector');
    const savedTheme = localStorage.getItem('heathAI_theme') || 'nature';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeSelector.value = savedTheme;

    themeSelector.addEventListener('change', (e) => {
      const newTheme = e.target.value;
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('heathAI_theme', newTheme);
    });


    // ── CUSTOM CONFIRM MODAL LOGIC ───────────────────────────────────
    let confirmCallback = null;
    let cancelCallback = null;
    const customConfirmOverlay = document.getElementById('customConfirmOverlay');
    const customConfirmTitle = document.getElementById('customConfirmTitle');
    const customConfirmMessage = document.getElementById('customConfirmMessage');

    function elegantConfirm(title, message, onOk, onCancel) {
      customConfirmTitle.textContent = title;
      customConfirmMessage.textContent = message;
      confirmCallback = onOk;
      cancelCallback = onCancel || null;
      customConfirmOverlay.classList.add('open');
    }

    document.getElementById('customConfirmCancel').addEventListener('click', () => {
      customConfirmOverlay.classList.remove('open');
      if (cancelCallback) cancelCallback();
      cancelCallback = null;
    });
    document.getElementById('customConfirmOk').addEventListener('click', () => {
      customConfirmOverlay.classList.remove('open');
      if (confirmCallback) confirmCallback();
    });

    // 1. Reset All
    // Old listener handled elsewhere

    // Ensure theme selector works with custom select by updating the JS logic slightly
    const ts = document.getElementById('themeSelector');
    if (ts) {
      ts.addEventListener('change', (e) => {
        const newTheme = e.target.value;
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('heathAI_theme', newTheme);
      });
    }





    // Mapper logic placeholder



    // ── PREMIUM CUSTOM SELECT DROPDOWNS ──────────────────────────────────────
    function initPremiumDropdowns() {
      const selects = document.querySelectorAll('select.sel, select.theme-selector');
      selects.forEach(select => {
        if (select.nextElementSibling && select.nextElementSibling.classList.contains('custom-select-wrapper')) return;

        select.style.setProperty('display', 'none', 'important');

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper' + (select.id === 'themeSelector' ? ' theme-selector-compact' : '');

        const visual = document.createElement('div');
        visual.className = 'custom-select';

        const textSpan = document.createElement('span');
        textSpan.className = 'custom-select-text';
        textSpan.textContent = select.options[select.selectedIndex]?.text || '';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'custom-select-icon';
        iconSpan.innerHTML = '<svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1.5L6 6.5L11 1.5"/></svg>';

        visual.appendChild(textSpan);
        visual.appendChild(iconSpan);

        const optionsList = document.createElement('div');
        optionsList.className = 'custom-options';

        Array.from(select.options).forEach((opt, idx) => {
          const optionDiv = document.createElement('div');
          optionDiv.className = 'custom-option';
          if (idx === select.selectedIndex) optionDiv.classList.add('selected');

          const oText = document.createElement('span');
          oText.textContent = opt.text;

          optionDiv.appendChild(oText);

          optionDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            select.selectedIndex = idx;
            textSpan.textContent = opt.text;

            optionsList.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
            optionDiv.classList.add('selected');

            const event = new Event('change');
            select.dispatchEvent(event);
            visual.classList.remove('open');
          });
          optionsList.appendChild(optionDiv);
        });

        wrapper.appendChild(visual);
        wrapper.appendChild(optionsList);
        select.parentNode.insertBefore(wrapper, select.nextSibling);

        visual.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.custom-select.open').forEach(el => {
            if (el !== visual) el.classList.remove('open');
          });
          visual.classList.toggle('open');
        });
      });

      document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select.open').forEach(el => el.classList.remove('open'));
      });
    }

    // Call the function explicitly via timeouts so it binds even after the DOM shifts
    document.addEventListener('DOMContentLoaded', () => { setTimeout(initPremiumDropdowns, 100); });
    setTimeout(initPremiumDropdowns, 500);
    document.getElementById('openMapper')?.addEventListener('click', () => { setTimeout(initPremiumDropdowns, 50); });



    // ── PHASE 8: ALGORITHM VISUALIZATIONS ─────────────────────────────
    (function () {
      // Helper: read CSS variable value
      function cssVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
      }

      // ── TAB SWITCHING ──────────────────────────────────────────────
      const VIZ_PANELS = ['viz-knn', 'viz-svm', 'viz-dt', 'viz-rf', 'viz-lr', 'viz-nb'];
      const PARAM_PANELS = ['params-knn', 'params-svm', 'params-dt', 'params-rf', 'params-lr', 'params-nb'];
      let activeModel = 'knn';

      document.querySelectorAll('.model-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.model-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeModel = tab.dataset.model;

          PARAM_PANELS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
          });
          VIZ_PANELS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
          });

          const pp = document.getElementById('params-' + activeModel);
          if (pp) pp.style.display = 'block';
          const vp = document.getElementById('viz-' + activeModel);
          if (vp) vp.style.display = 'block';

          redraw();
        });
      });

      function redraw() {
        if (activeModel === 'knn') drawKNN();
        else if (activeModel === 'svm') drawSVM();
        else if (activeModel === 'dt') drawDT();
        else if (activeModel === 'rf') drawRF();
        else if (activeModel === 'lr') drawLR();
        else if (activeModel === 'nb') drawNB();
      }

      // ── SLIDER WIRING ────────────────────────────────────────────────
      function wire(id, valId, fmt, cb) {
        const s = document.getElementById(id), v = document.getElementById(valId);
        if (!s) return;
        s.addEventListener('input', () => {
          if (v) v.textContent = fmt ? fmt(s.value) : s.value;
          if (cb) cb(+s.value);
          redraw();
        });
      }

      wire('knnK', 'knnKVal', null, k => {
        const lbl = document.getElementById('knnKVizLabel');
        if (lbl) lbl.textContent = k;
      });
      wire('svmC', 'svmCVal', v => (+v < 5 ? '0.' + (+v) : +v - 4));
      document.getElementById('svmKernel')?.addEventListener('change', () => { if (activeModel === 'svm') drawSVM(); });
      wire('dtDepth', 'dtDepthVal');
      wire('rfTrees', 'rfTreesVal', null, t => {
        const tv = document.getElementById('rfTreeCountVal');
        if (tv) tv.textContent = t;
      });
      wire('rfDepth', 'rfDepthVal');
      wire('lrC', 'lrCVal', v => (+v < 5 ? '0.' + (+v) : +v - 4));
      wire('lrIter', 'lrIterVal');

      // Also update KNN label when knnK changes
      const knnSlider = document.getElementById('knnK');
      if (knnSlider) {
        knnSlider.addEventListener('input', () => {
          const lbl = document.getElementById('knnKVizLabel');
          if (lbl) lbl.textContent = knnSlider.value;
        });
      }

      // ── KNN ─────────────────────────────────────────────────────────
      let knnRAF;
      let knnCurR = 0;
      function drawKNN() {
        const canvas = document.getElementById('knnCanvas');
        if (!canvas) return;
        const k = +(document.getElementById('knnK')?.value || 5);

        const dpr = window.devicePixelRatio || 1;
        const W = canvas.parentElement.clientWidth - 2 || 500;
        const H = 240;
        canvas.style.height = H + 'px';
        canvas.width = W * dpr; canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const cBad = cssVar('--bad') || '#dc2626';
        const cGood = cssVar('--good') || '#16a34a';
        const cPri = cssVar('--primary') || '#2563eb';
        const cInk = cssVar('--ink') || '#111';

        const pts = [
          [0.18, 0.28, 0], [0.22, 0.52, 0], [0.13, 0.62, 1], [0.31, 0.73, 1], [0.38, 0.38, 0],
          [0.50, 0.22, 0], [0.44, 0.58, 1], [0.58, 0.68, 1], [0.64, 0.42, 0], [0.72, 0.58, 1],
          [0.77, 0.27, 0], [0.82, 0.63, 1], [0.36, 0.18, 0], [0.62, 0.78, 1], [0.87, 0.38, 0],
          [0.11, 0.44, 1], [0.91, 0.72, 1], [0.61, 0.13, 0], [0.29, 0.43, 0], [0.54, 0.47, 1],
        ];
        const np = [0.48, 0.50]; // New patient
        const dists = pts.map(([x, y, c], i) => ({ i, d: Math.hypot(x - np[0], y - np[1]), c }));
        dists.sort((a, b) => a.d - b.d);
        const nbrs = new Set(dists.slice(0, k).map(d => d.i));
        const targetR = dists[k - 1].d;

        if (knnRAF) cancelAnimationFrame(knnRAF);

        function frame() {
          knnCurR += (targetR - knnCurR) * 0.12;
          ctx.clearRect(0, 0, W, H);

          // Lines to neighbors
          ctx.lineWidth = 1; ctx.strokeStyle = cPri; ctx.globalAlpha = 0.18;
          pts.forEach(([x, y, c], i) => {
            if (!nbrs.has(i)) return;
            ctx.beginPath(); ctx.moveTo(x * W, y * H); ctx.lineTo(np[0] * W, np[1] * H); ctx.stroke();
          });
          ctx.globalAlpha = 1;

          // Radius circle
          ctx.beginPath();
          ctx.arc(np[0] * W, np[1] * H, Math.max(0, knnCurR) * Math.min(W, H), 0, Math.PI * 2);
          ctx.strokeStyle = cPri; ctx.lineWidth = 2; ctx.globalAlpha = 0.55;
          ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
          ctx.globalAlpha = 0.07; ctx.fillStyle = cPri; ctx.fill();
          ctx.globalAlpha = 1;

          // Patient dots
          pts.forEach(([x, y, c], i) => {
            const isN = nbrs.has(i);
            ctx.beginPath(); ctx.arc(x * W, y * H, isN ? 6 : 4.5, 0, Math.PI * 2);
            ctx.fillStyle = c === 1 ? cBad : cGood;
            ctx.globalAlpha = isN ? 1 : 0.38; ctx.fill();
            if (isN) { ctx.strokeStyle = c === 1 ? cBad : cGood; ctx.lineWidth = 2; ctx.globalAlpha = 1; ctx.stroke(); }
            ctx.globalAlpha = 1;
          });

          // Star (new patient)
          const sx = np[0] * W, sy = np[1] * H, sr = 9;
          ctx.fillStyle = cInk; ctx.beginPath();
          for (let q = 0; q < 5; q++) {
            const a = (q * 4 * Math.PI / 5) - Math.PI / 2, b = (q * 4 * Math.PI / 5 + 2 * Math.PI / 5) - Math.PI / 2;
            if (q === 0) ctx.moveTo(sx + sr * Math.cos(a), sy + sr * Math.sin(a));
            else ctx.lineTo(sx + sr * Math.cos(a), sy + sr * Math.sin(a));
            ctx.lineTo(sx + sr * .4 * Math.cos(b), sy + sr * .4 * Math.sin(b));
          }
          ctx.closePath(); ctx.fill();

          if (Math.abs(targetR - knnCurR) > 0.001) knnRAF = requestAnimationFrame(frame);
        }
        knnCurR = knnCurR > 0 ? knnCurR : 0;
        frame();
      }

      // ── SVM ─────────────────────────────────────────────────────────
      let svmRAF; let svmAnim = 0; let svmPrevK = '';
      function drawSVM() {
        const canvas = document.getElementById('svmCanvas');
        if (!canvas) return;
        const C = +(document.getElementById('svmC')?.value || 5);
        const kernel = document.getElementById('svmKernel')?.value || 'rbf';

        if (kernel !== svmPrevK) { svmAnim = 0; svmPrevK = kernel; }

        const dpr = window.devicePixelRatio || 1;
        const W = canvas.parentElement.clientWidth - 2 || 500, H = 240;
        canvas.style.height = H + 'px';
        canvas.width = W * dpr; canvas.height = H * dpr;
        const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

        const cBad = cssVar('--bad') || '#dc2626', cGood = cssVar('--good') || '#16a34a';
        const cInk = cssVar('--ink') || '#111', cMuted = cssVar('--text-muted') || '#888';

        const redPts = [[.18, .72], [.23, .78], [.28, .83], [.14, .66], [.33, .88], [.26, .74], [.38, .92]];
        const grnPts = [[.72, .28], [.77, .22], [.82, .33], [.66, .18], [.87, .38], [.74, .24], [.62, .10]];

        if (svmRAF) cancelAnimationFrame(svmRAF);
        function frame() {
          svmAnim += (1 - svmAnim) * 0.1;
          ctx.clearRect(0, 0, W, H);

          const strictness = C / 10;
          const margin = Math.max(0.06, 0.22 - strictness * 0.12);

          // Find support vectors: points closest to boundary
          const isSVRed = redPts.map(p => p[0] < 0.5 + margin);
          const isSVGrn = grnPts.map(p => p[0] > 0.5 - margin);

          // Background zones
          ctx.fillStyle = cssVar('--bad-bg') || 'rgba(220,38,38,.05)';
          ctx.fillRect(0, 0, W * 0.48 * svmAnim, H);
          ctx.fillStyle = cssVar('--good-bg') || 'rgba(22,163,74,.05)';
          ctx.fillRect(W * 0.52 * svmAnim, 0, W, H);

          // Margin lines
          ctx.setLineDash([5, 4]); ctx.strokeStyle = cMuted; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
          if (kernel === 'linear') {
            ctx.beginPath(); ctx.moveTo(W * (0.5 - margin) * svmAnim, 0); ctx.lineTo(W * (0.5 - margin) * svmAnim, H); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(W * (0.5 + margin) * svmAnim, 0); ctx.lineTo(W * (0.5 + margin) * svmAnim, H); ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.ellipse(W * .5, H * .5, W * (margin + 0.1) * svmAnim, H * (margin + 0.1) * svmAnim, Math.PI / 4, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.setLineDash([]); ctx.globalAlpha = 1;

          // Decision boundary
          ctx.strokeStyle = cInk; ctx.lineWidth = 2.5;
          ctx.beginPath();
          if (kernel === 'linear') {
            ctx.moveTo(W * .5 * svmAnim + (W * .5 * (1 - svmAnim)), 0); ctx.lineTo(W * .5 * svmAnim + (W * .5 * (1 - svmAnim)), H);
          } else {
            ctx.ellipse(W * .5, H * .5, W * .18 * svmAnim, H * .18 * svmAnim, Math.PI / 4, 0, Math.PI * 2);
          }
          ctx.stroke();

          // Dots
          [redPts, grnPts].forEach((group, gi) => {
            group.forEach((p, i) => {
              const isSV = gi === 0 ? isSVRed[i] : isSVGrn[i];
              ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, isSV ? 7 : 5, 0, Math.PI * 2);
              ctx.fillStyle = gi === 0 ? cBad : cGood; ctx.fill();
              if (isSV) { ctx.strokeStyle = cInk; ctx.lineWidth = 2; ctx.stroke(); }
            });
          });

          if (1 - svmAnim > 0.01) svmRAF = requestAnimationFrame(frame);
        }
        frame();
      }

      // ── DECISION TREE ───────────────────────────────────────────────
      function drawDT() {
        const wrap = document.getElementById('dtWrap');
        if (!wrap) return;
        const depth = +(document.getElementById('dtDepth')?.value || 3);

        const questions = ['EF < 38%?', 'Age > 65?', 'Creat > 1.5?', 'Smoker?', 'BP > 140?'];
        const limit = Math.min(depth, 5);

        function makeNode(level, isLeftChild) {
          if (level > limit) return '';
          const isLeaf = level === limit;
          const q = questions[(level - 1) % questions.length];
          if (isLeaf) {
            const kind = isLeftChild ? 'leaf-r">Readmit' : 'leaf-g">Safe';
            return `<div class="t-child"><div class="t-lbl ${kind}</div></div>`;
          }
          return `<div class="t-child">
        <div class="t-lbl q">${q}</div>
        <div class="t-children">
          ${makeNode(level + 1, true)}
          ${makeNode(level + 1, false)}
        </div>
      </div>`;
        }

        wrap.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;width:100%;overflow:auto;padding:16px;">
      <div class="t-lbl q" style="font-size:13px;">${questions[0]}</div>
      <div class="t-children" style="margin-top:28px;">
        ${makeNode(2, true)}
        ${makeNode(2, false)}
      </div>
    </div>`;

        const warn = document.getElementById('dtWarn');
        if (warn) {
          warn.style.display = depth > 4 ? 'flex' : 'none';
          const wv = document.getElementById('dtWarnVal');
          if (wv) wv.textContent = depth;
        }
      }

      // ── RANDOM FOREST ──────────────────────────────────────────────
      function drawRF() {
        const wrap = document.getElementById('voteTrees');
        if (!wrap) return;
        const count = +(document.getElementById('rfTrees')?.value || 100);

        const tv1 = document.getElementById('rfTreeCountVal');
        const tv2 = document.getElementById('rfTreeCountVal2');
        if (tv1) tv1.textContent = count;
        if (tv2) tv2.textContent = count;

        // Simulated votes: converge toward 68% with variance inversely proportional to count
        const variance = Math.max(0, (100 - count) / 100) * 15;
        const seed = ((count * 7) % 17) - 8; // deterministic "random" offset
        const adjustedPct = 68 + (seed / Math.sqrt(count)) * variance;
        const pct = Math.max(52, Math.min(84, adjustedPct));

        const rCount = Math.round(count * pct / 100);
        const sCount = count - rCount;
        const rPct = (rCount / count * 100).toFixed(1);
        const sPct = (sCount / count * 100).toFixed(1);

        const showCount = Math.min(count, 16);
        const cutoff = Math.round(showCount * pct / 100);
        let html = '';
        for (let i = 0; i < showCount; i++) {
          const isRed = i < cutoff;
          html += `<div class="mini-tree"><svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${isRed ? 'var(--bad)' : 'var(--good)'}" /></svg><div style="font-size:9px;color:var(--text-muted);font-weight:600;">#${i + 1}</div></div>`;
        }
        wrap.innerHTML = html;

        requestAnimationFrame(() => {
          const barR = document.getElementById('voteReadmit');
          const barS = document.getElementById('voteSafe');
          const pctR = document.getElementById('voteReadmitPct');
          const pctS = document.getElementById('voteSafePct');
          if (barR) { barR.style.width = rPct + '%'; barR.textContent = rCount; }
          if (barS) { barS.style.width = sPct + '%'; barS.textContent = sCount; }
          if (pctR) pctR.textContent = rPct + '%';
          if (pctS) pctS.textContent = sPct + '%';
        });
      }

      // ── LOGISTIC REGRESSION ─────────────────────────────────────────
      let lrRAF; let lrCur = 0.75;
      function drawLR() {
        const canvas = document.getElementById('lrCanvas');
        if (!canvas) return;
        const C = +(document.getElementById('lrC')?.value || 5);
        const steepness = 0.2 + (C / 10) * 1.8; // ranges from 0.2 to 2.0

        const dpr = window.devicePixelRatio || 1;
        const W = canvas.parentElement.clientWidth - 2 || 500, H = 240;
        canvas.style.height = H + 'px';
        canvas.width = W * dpr; canvas.height = H * dpr;
        const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

        const cInk = cssVar('--ink') || '#111', cMuted = cssVar('--text-muted') || '#888', cBad = cssVar('--bad') || '#dc2626', cPri = cssVar('--primary') || '#2563eb';

        if (lrRAF) cancelAnimationFrame(lrRAF);
        const target = steepness;
        function frame() {
          lrCur += (target - lrCur) * 0.12;
          ctx.clearRect(0, 0, W, H);

          const m = 44, pw = W - m * 2, ph = H - m * 2;

          ctx.strokeStyle = cMuted; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(m, m); ctx.lineTo(m, H - m); ctx.lineTo(W - m, H - m); ctx.stroke();

          ctx.fillStyle = cMuted; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
          ctx.fillText('100%', m - 5, m + 5);
          ctx.fillText('50%', m - 5, m + ph / 2 + 5);
          ctx.fillText('0%', m - 5, H - m + 5);
          ctx.textAlign = 'center';
          ctx.fillText('← Low EF% (sick)', m + 50, H - m + 18);
          ctx.fillText('High EF% (healthy) →', W - m - 50, H - m + 18);
          ctx.fillText('P(Readmission)', m - 30, H / 2);

          // 50% dashed line
          ctx.setLineDash([4, 4]); ctx.strokeStyle = cMuted; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.moveTo(m, m + ph / 2); ctx.lineTo(W - m, m + ph / 2); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;

          // S-curve
          ctx.strokeStyle = cInk; ctx.lineWidth = 3;
          ctx.beginPath();
          for (let i = 0; i <= 120; i++) {
            const t = (i / 120) * 10 - 5;
            const prob = 1 / (1 + Math.exp(-lrCur * t));
            const px2 = m + (i / 120) * pw;
            const py2 = m + ph * (1 - prob);
            if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
          }
          ctx.stroke();

          // Patient at EF ~35% = t around -1
          const ef35 = 0.35;
          const t35 = (ef35 * 10) - 5;
          const prob35 = 1 / (1 + Math.exp(-lrCur * t35));
          const pp2x = m + ef35 * pw;
          const pp2y = m + ph * (1 - prob35);

          ctx.beginPath(); ctx.arc(pp2x, pp2y, 8, 0, Math.PI * 2);
          ctx.fillStyle = cBad; ctx.fill(); ctx.strokeStyle = cInk; ctx.lineWidth = 2; ctx.stroke();

          ctx.textAlign = 'left'; ctx.fillStyle = cInk; ctx.font = 'bold 11px sans-serif';
          ctx.fillText(`Patient Risk: ${(prob35 * 100).toFixed(0)}%`, pp2x + 12, pp2y - 6);

          if (Math.abs(target - lrCur) > 0.005) lrRAF = requestAnimationFrame(frame);
        }
        frame();
      }

      // ── NAIVE BAYES ─────────────────────────────────────────────────
      const NB_FEATURES = [
        { name: 'Base Rate (population avg)', val: 33, pct: 33, cls: '', impact: 'Starting point' },
        { name: 'Ejection Fraction = 20% (very low)', val: 78, pct: 78, cls: 'inc', impact: '+45% risk increase' },
        { name: 'Age = 71 (elderly)', val: 54, pct: 54, cls: 'inc', impact: '+21% risk increase' },
        { name: 'Serum Creatinine = 1.3 (normal)', val: 35, pct: 35, cls: 'inc', impact: '+2% slight increase' },
        { name: 'Non-smoker', val: 28, pct: 28, cls: 'dec', impact: '-5% risk decrease' },
      ];

      function drawNB() {
        const wrap = document.getElementById('nbBars');
        if (!wrap) return;
        let html = NB_FEATURES.map((f, i) => `
      <div class="pr-item">
        <div class="pr-hdr"><span class="pr-feat">${f.name}</span><span class="pr-val">P = ${f.val}%</span></div>
        <div class="pr-trk"><div class="pr-fil ${f.cls}" id="nbf${i}"></div></div>
        <div class="pr-imp">${f.impact}</div>
      </div>`).join('');
        wrap.innerHTML = html;
        NB_FEATURES.forEach((f, i) => {
          setTimeout(() => {
            const el = document.getElementById('nbf' + i);
            if (el) el.style.width = f.pct + '%';
          }, 120 + i * 180);
        });
      }

      // ── INITIAL SETUP ────────────────────────────────────────────────
      // Show correct viz panel and param panel on load
      PARAM_PANELS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      VIZ_PANELS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      const knnP = document.getElementById('params-knn');
      if (knnP) knnP.style.display = 'block';
      const knnV = document.getElementById('viz-knn');
      if (knnV) knnV.style.display = 'block';

      // Set active tab
      document.querySelectorAll('.model-tab').forEach(t => t.classList.remove('active'));
      const knnTab = document.querySelector('.model-tab[data-model="knn"]');
      if (knnTab) knnTab.classList.add('active');

      // Initial draw after page settles
      setTimeout(() => { knnCurR = 0; drawKNN(); }, 300);
      setTimeout(() => { drawRF(); }, 400);
      setTimeout(() => { drawNB(); }, 500);

      // Redraw on resize
      window.addEventListener('resize', () => { clearTimeout(window._vizResizeTimer); window._vizResizeTimer = setTimeout(redraw, 200); });

    })();
    // ── END PHASE 8 ────────────────────────────────────────────────────

    // ── ACCESSIBILITY LOGIC ───────────────────────────────────────
    const a11yOverlay = document.getElementById('a11yOverlay');
    document.getElementById('openA11yBtn')?.addEventListener('click', () => { a11yOverlay.classList.add('open'); });
    document.getElementById('a11yCloseBtn')?.addEventListener('click', () => { a11yOverlay.classList.remove('open'); });

    // Text Size — persist to localStorage and apply on load
    const A11Y_TEXT_LARGE = 'heathAI_textSizeLarge';
    const btnStandard = document.getElementById('btnTextStandard');
    const btnLarge = document.getElementById('btnTextLarge');
    if (localStorage.getItem(A11Y_TEXT_LARGE) === '1') {
      document.documentElement.setAttribute('data-text-size', 'large');
      btnStandard?.classList.remove('active'); btnLarge?.classList.add('active');
    } else {
      document.documentElement.removeAttribute('data-text-size');
      btnStandard?.classList.add('active'); btnLarge?.classList.remove('active');
    }
    btnStandard?.addEventListener('click', () => {
      document.documentElement.removeAttribute('data-text-size');
      localStorage.removeItem(A11Y_TEXT_LARGE);
      btnStandard.classList.add('active'); btnLarge.classList.remove('active');
    });
    btnLarge?.addEventListener('click', () => {
      document.documentElement.setAttribute('data-text-size', 'large');
      localStorage.setItem(A11Y_TEXT_LARGE, '1');
      btnLarge.classList.add('active'); btnStandard.classList.remove('active');
    });

    // Contrast
    const btnCStandard = document.getElementById('btnContrastStandard');
    const btnCHigh = document.getElementById('btnContrastHigh');
    btnCHigh?.addEventListener('click', () => {
      // Override active theme with colorblind theme
      document.documentElement.setAttribute('data-theme', 'colorblind');
      btnCHigh.classList.add('active'); btnCStandard.classList.remove('active');
    });
    btnCStandard?.addEventListener('click', () => {
      // Restore from local storage
      const restoredTheme = localStorage.getItem('heathAI_theme') || 'nature';
      document.documentElement.setAttribute('data-theme', restoredTheme);
      btnCStandard.classList.add('active'); btnCHigh.classList.remove('active');
    });