/* ═══════════════════════════════════════
   할루시네이션: 해고전쟁 — 사이버펑크 대기화면 모듈 v2

   추가 요소:
   - <canvas id="radarCanvas"></canvas>  → 레이더 차트
   - <div id="surveyStream"></div>       → 설문 문항 스트림
   - 우측 패널에 수평 게이지 바 자동 포함
   ═══════════════════════════════════════ */

const CyberBG = (() => {

const GRADES = ['S','A','B','C','D','F'];
const GC = { S:'#ffd700', A:'#59d28f', B:'#4ed9e8', C:'#f3b63f', D:'#ff6b3d', F:'#ff2d2d' };
const DK = ['contribution','competency','collaboration','crisis','intuition','ethics','aiVerification'];
const DL = { contribution:'성과 기여도', competency:'역량 평가', collaboration:'협업 태도', crisis:'위기 대응력', intuition:'인간의 직관력', ethics:'윤리적 책임감', aiVerification:'AI 검증력' };
const DL_SHORT = { contribution:'성과', competency:'역량', collaboration:'협업', crisis:'위기', intuition:'직관', ethics:'윤리', aiVerification:'AI검증' };
const RANK = { S:6, A:5, B:4, C:3, D:2, F:1 };

const STREAM_TERMS = [
  ...Object.values(DL),
  'NEURAL_WEIGHT', 'BIAS_CORRECTION', 'CROSS_VALIDATE', 'HALLUCINATION_CHECK',
  'CONFIDENCE_INTERVAL', 'BAYESIAN_UPDATE', 'GRADIENT_DESCENT', 'LOSS_FUNCTION',
  'EPOCH_COMPLETE', 'BATCH_NORMALIZE', 'ATTENTION_SCORE', 'TOKEN_EMBED',
  'SEMANTIC_PARSE', 'FACT_VERIFY', 'ETHICS_AUDIT', 'PERFORMANCE_INDEX',
];

/* 7대 평가지표 설문 문항 (촬구 11p 기반) */
const SURVEY_ITEMS = [
  { dim: 'contribution', q: '결과물이 회사의 실제 이익과 직결되는 가치를 창출했는가?' },
  { dim: 'competency', q: 'AI를 수동적으로 부렸는가, 능동적인 파트너로 활용했는가?' },
  { dim: 'collaboration', q: '정보 독점이 아닌 소통과 공유로 팀의 효율을 높였는가?' },
  { dim: 'crisis', q: '급변하는 업무 환경과 아르케의 압박 속에서 빠르게 적응했는가?' },
  { dim: 'intuition', q: 'AI의 계산이 닿지 않는 영역을 인간만의 \'촉\'으로 해결했는가?' },
  { dim: 'ethics', q: '효율성이라는 명목하에 인간 존엄성, 가치를 저버리진 않았는가?' },
  { dim: 'aiVerification', q: 'AI의 거짓말(할루시네이션)을 간파하고 팩트를 체크했는가?' },
  { dim: 'contribution', q: '라운드별 미션에서 실질적 성과를 기여했는가?' },
  { dim: 'competency', q: 'AI 도구의 한계를 인지하고 보완 전략을 세웠는가?' },
  { dim: 'collaboration', q: '팀원의 약점을 커버하고 강점을 살려주었는가?' },
  { dim: 'crisis', q: '예상치 못한 변수에 당황하지 않고 대안을 제시했는가?' },
  { dim: 'intuition', q: '데이터로 설명할 수 없는 판단을 설득력 있게 전달했는가?' },
  { dim: 'ethics', q: '승리를 위해 비윤리적 수단을 사용하지 않았는가?' },
  { dim: 'aiVerification', q: 'AI 출력물의 출처와 근거를 교차 검증했는가?' },
];

const PHASE_LABELS = {
  pre: [
    'LOADING PERSONNEL DATA...',
    'AI APTITUDE CALIBRATION...',
    'CROSS-REFERENCING 7 DIMENSIONS...',
    'HALLUCINATION BASELINE SCAN...',
    'SURVEY RESPONSE ANALYSIS...',
    'ETHICS COMPLIANCE CHECK...',
    'INITIAL GRADE COMPUTATION...',
    'CONFIDENCE INTERVAL ANALYSIS...',
    'PRE-EVALUATION COMPLETE — STANDBY',
  ],
  mid: [
    'AGGREGATING ROUND SCORES [R1-R4]...',
    'FIELD PERFORMANCE ANALYSIS...',
    'SURVEY CROSS-TABULATION...',
    'TEAM SYNERGY CALIBRATION...',
    'CRISIS RESPONSE PATTERN MATCH...',
    'HALLUCINATION DETECTION RATE...',
    'INTERIM GRADE RECOMPUTE...',
    'RANK VOLATILITY CHECK...',
    'MID-EVALUATION READY — STANDBY',
  ],
  final: [
    'LOADING ALL OBSERVATION DATA...',
    'PARSING ROUND SCORES [R1-R7]...',
    'CROSS-REFERENCING 7 DIMENSIONS...',
    'SURVEY WEIGHT INTEGRATION...',
    'BAYESIAN WEIGHT CALIBRATION...',
    'HALLUCINATION DETECTION SCAN...',
    'ETHICS COMPLIANCE CHECK...',
    'NEURAL ENSEMBLE VOTING...',
    'FINAL GRADE COMPUTATION...',
    'CONFIDENCE INTERVAL ANALYSIS...',
    'VERDICT GENERATION...',
  ],
};

let _scores = {};
let _people = [];
let _phase = 'pre';
let _canvas, _ctx, _W, _H;
const _particles = [];
let _intervals = [];
let _radarCanvas, _radarCtx;
let _radarPersonIdx = 0;
let _radarJitter = {}; // 실시간 변동용

function init(opts = {}) {
  _scores = opts.scores || {};
  _people = opts.people || [];
  _phase = opts.phase || 'pre';

  _people.forEach(p => {
    if (p.img && !p.img.startsWith('http') && !p.img.startsWith('/') && !p.img.startsWith('.')) {
      p.img = (opts.imgPrefix || '../img/') + p.img;
    }
  });

  // 레이더 jitter 초기화
  _people.forEach(p => { _radarJitter[p.id] = DK.map(() => 0); });

  initCanvas();
  initStreams();
  initSurveyStream();
  initRightPanel();
  initRadar();
  initMetrics();
  initProgress();
  initClock();
}

/* ═══════════════════════════════════════
   BACKGROUND CANVAS
   ═══════════════════════════════════════ */
function initCanvas() {
  _canvas = document.getElementById('bgCanvas');
  if (!_canvas) return;
  _ctx = _canvas.getContext('2d');

  function resize() { _W = _canvas.width = window.innerWidth; _H = _canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  _particles.length = 0;
  for (let i = 0; i < 80; i++) {
    _particles.push({
      x: Math.random() * _W, y: Math.random() * _H,
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5 + 0.2,
      size: Math.random() * 2 + 0.5, alpha: Math.random() * 0.3 + 0.1,
      color: Math.random() > 0.7 ? '#ff00aa' : '#00f0ff'
    });
  }

  function draw() {
    _ctx.fillStyle = 'rgba(10,10,18,0.15)';
    _ctx.fillRect(0, 0, _W, _H);
    _ctx.strokeStyle = 'rgba(0,240,255,0.03)';
    _ctx.lineWidth = 0.5;
    const gs = 60, off = (Date.now() * 0.02) % gs;
    for (let x = -gs + off; x < _W + gs; x += gs) { _ctx.beginPath(); _ctx.moveTo(x, 0); _ctx.lineTo(x, _H); _ctx.stroke(); }
    for (let y = -gs + off * 0.7; y < _H + gs; y += gs) { _ctx.beginPath(); _ctx.moveTo(0, y); _ctx.lineTo(_W, y); _ctx.stroke(); }
    for (const p of _particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = _W; if (p.x > _W) p.x = 0;
      if (p.y > _H) { p.y = 0; p.x = Math.random() * _W; }
      _ctx.fillStyle = p.color;
      _ctx.globalAlpha = p.alpha + Math.sin(Date.now() * 0.003 + p.x) * 0.1;
      _ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    if (Math.random() < 0.03) {
      _ctx.globalAlpha = 0.08; _ctx.fillStyle = '#00f0ff';
      _ctx.fillRect(0, Math.random() * _H, _W * Math.random(), 1);
    }
    _ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
}

/* ═══════════════════════════════════════
   LEFT: Data streams
   ═══════════════════════════════════════ */
function initStreams() {
  const el = document.getElementById('leftStreams');
  if (!el) return;
  _intervals.push(setInterval(() => {
    const person = _people[Math.floor(Math.random() * _people.length)];
    if (!person) return;
    const sc = _scores[person.id] || {};
    const dim = DK[Math.floor(Math.random() * DK.length)];
    const term = STREAM_TERMS[Math.floor(Math.random() * STREAM_TERMS.length)];
    const grade = sc[dim] || GRADES[Math.floor(Math.random() * 6)];
    const val = (Math.random() * 100).toFixed(2);
    const isWarn = (RANK[grade] || 3) <= 2;
    const time = new Date().toISOString().substr(11, 12);
    const line = document.createElement('div');
    line.className = 'stream-line active';
    const t = [
      `[${time}] ${person.name}::${term} → <span class="${isWarn?'warn':'ok'}">${grade}</span> (${val})`,
      `[${time}] EVAL.${dim}(${person.id}) = <span class="val">${val}</span> σ=${(Math.random()*2).toFixed(3)}`,
      `[${time}] ARCHE::${term} ▸ <span class="${isWarn?'warn':'ok'}">${person.name}</span> Δ${(Math.random()*10-5).toFixed(2)}`,
      `[${time}] VERIFY: ${DL[dim]} <span class="val">${grade}</span> conf=${(Math.random()*0.4+0.6).toFixed(3)}`,
    ];
    line.innerHTML = t[Math.floor(Math.random() * t.length)];
    el.prepend(line);
    setTimeout(() => line.classList.remove('active'), 2000);
    while (el.children.length > 35) el.removeChild(el.lastChild);
  }, 350));
}

/* ═══════════════════════════════════════
   LEFT (하단): 설문 문항 스트림
   ═══════════════════════════════════════ */
function initSurveyStream() {
  const el = document.getElementById('surveyStream');
  if (!el) return;
  let idx = 0;
  _intervals.push(setInterval(() => {
    const item = SURVEY_ITEMS[idx % SURVEY_ITEMS.length];
    const line = document.createElement('div');
    line.className = 'survey-line active';
    line.innerHTML = `<span class="survey-dim">[${DL_SHORT[item.dim]}]</span> ${item.q}`;
    el.prepend(line);
    setTimeout(() => line.classList.remove('active'), 4000);
    while (el.children.length > 8) el.removeChild(el.lastChild);
    idx++;
  }, 3000));
}

/* ═══════════════════════════════════════
   RIGHT: Person scores + gauge bars
   ═══════════════════════════════════════ */
function initRightPanel() {
  const el = document.getElementById('rightScores');
  if (!el) return;

  el.innerHTML = _people.map(p => {
    const sc = _scores[p.id] || {};
    const gauges = DK.map(k => {
      const g = sc[k] || 'C';
      const pct = ((RANK[g] || 3) / 6 * 100).toFixed(0);
      return `<div class="gauge-row">
        <span class="gauge-label">${DL_SHORT[k]}</span>
        <div class="gauge-track"><div class="gauge-fill" id="gf-${p.id}-${k}" style="width:${pct}%;background:${GC[g]||'#666'}"></div></div>
        <span class="gauge-grade" id="gg-${p.id}-${k}" style="color:${GC[g]||'#666'}">${g}</span>
      </div>`;
    }).join('');
    return `<div class="person-mini">
      <div class="pm-header">
        <img class="pm-photo" src="${p.img}" onerror="this.style.display='none'">
        <div class="pm-info"><div class="pm-name">${p.name}</div><div class="pm-dept">${p.dept}</div></div>
      </div>
      <div class="pm-gauges" id="gauges-${p.id}">${gauges}</div>
    </div>`;
  }).join('');

  // Gauge fluctuation
  _intervals.push(setInterval(() => {
    const p = _people[Math.floor(Math.random() * _people.length)];
    if (!p) return;
    const k = DK[Math.floor(Math.random() * DK.length)];
    const sc = _scores[p.id] || {};
    const realG = sc[k] || 'C';
    const fakeG = GRADES[Math.floor(Math.random() * 6)];
    const fakePct = ((RANK[fakeG] || 3) / 6 * 100).toFixed(0);
    const fillEl = document.getElementById(`gf-${p.id}-${k}`);
    const gradeEl = document.getElementById(`gg-${p.id}-${k}`);
    if (fillEl && gradeEl) {
      fillEl.style.width = fakePct + '%';
      fillEl.style.background = GC[fakeG];
      gradeEl.textContent = fakeG;
      gradeEl.style.color = GC[fakeG];
      setTimeout(() => {
        const realPct = ((RANK[realG] || 3) / 6 * 100).toFixed(0);
        fillEl.style.width = realPct + '%';
        fillEl.style.background = GC[realG];
        gradeEl.textContent = realG;
        gradeEl.style.color = GC[realG];
      }, 180);
    }
  }, 250));
}

/* ═══════════════════════════════════════
   CENTER: Radar chart (Canvas)
   ═══════════════════════════════════════ */
function initRadar() {
  _radarCanvas = document.getElementById('radarCanvas');
  if (!_radarCanvas) return;
  _radarCtx = _radarCanvas.getContext('2d');
  _radarCanvas.width = 280;
  _radarCanvas.height = 280;

  // 3초마다 다음 인물로 전환
  _intervals.push(setInterval(() => {
    _radarPersonIdx = (_radarPersonIdx + 1) % Math.max(_people.length, 1);
  }, 3000));

  // jitter 업데이트
  _intervals.push(setInterval(() => {
    _people.forEach(p => {
      if (!_radarJitter[p.id]) _radarJitter[p.id] = DK.map(() => 0);
      _radarJitter[p.id] = _radarJitter[p.id].map(() => (Math.random() - 0.5) * 0.8);
    });
  }, 200));

  function drawRadar() {
    const ctx = _radarCtx;
    const w = 280, h = 280, cx = w / 2, cy = h / 2, r = 100;
    ctx.clearRect(0, 0, w, h);

    const n = DK.length;
    const angleStep = (Math.PI * 2) / n;

    // 배경 동심원
    for (let ring = 1; ring <= 6; ring++) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + i * angleStep;
        const rr = r * ring / 6;
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.strokeStyle = `rgba(0,240,255,${ring === 6 ? 0.15 : 0.06})`;
      ctx.lineWidth = ring === 6 ? 1 : 0.5;
      ctx.stroke();
    }

    // 축선 + 라벨
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(0,240,255,0.5)';
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.strokeStyle = 'rgba(0,240,255,0.1)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // 라벨
      const lx = cx + Math.cos(a) * (r + 18);
      const ly = cy + Math.sin(a) * (r + 18);
      ctx.fillText(DL_SHORT[DK[i]], lx, ly + 3);
    }

    // 데이터 폴리곤 (현재 인물)
    if (_people.length === 0) { requestAnimationFrame(drawRadar); return; }
    const person = _people[_radarPersonIdx % _people.length];
    const sc = _scores[person.id] || {};
    const jit = _radarJitter[person.id] || DK.map(() => 0);

    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const a = -Math.PI / 2 + idx * angleStep;
      const val = (RANK[sc[DK[idx]]] || 3) + jit[idx];
      const rr = r * Math.max(0.1, Math.min(1, val / 6));
      const method = i === 0 ? 'moveTo' : 'lineTo';
      ctx[method](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.fillStyle = 'rgba(0,240,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 꼭짓점 점
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * angleStep;
      const val = (RANK[sc[DK[i]]] || 3) + jit[i];
      const rr = r * Math.max(0.1, Math.min(1, val / 6));
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3, 0, Math.PI * 2);
      ctx.fillStyle = GC[sc[DK[i]]] || '#00f0ff';
      ctx.fill();
    }

    // 인물 이름
    ctx.font = 'bold 13px "Noto Sans KR", sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.textAlign = 'center';
    ctx.fillText(person.name, cx, cy + r + 36);

    requestAnimationFrame(drawRadar);
  }
  drawRadar();
}

/* ═══════════════════════════════════════
   CENTER: Metrics
   ═══════════════════════════════════════ */
function initMetrics() {
  const el = document.getElementById('metricCards');
  if (!el) return;
  const METRICS = ['LOSS', 'ACCURACY', 'F1-SCORE', 'CONFIDENCE', 'EPOCHS', 'PARAMS'];
  el.innerHTML = METRICS.map(m =>
    `<div class="metric-card"><div class="mc-label">${m}</div><div class="mc-value fluctuate" id="mc-${m}">0</div></div>`
  ).join('');
  _intervals.push(setInterval(() => {
    const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    s('mc-LOSS', (Math.random() * 0.05 + 0.001).toFixed(4));
    s('mc-ACCURACY', (Math.random() * 2 + 97.5).toFixed(2) + '%');
    s('mc-F1-SCORE', (Math.random() * 0.02 + 0.96).toFixed(4));
    s('mc-CONFIDENCE', (Math.random() * 3 + 96).toFixed(1) + '%');
    s('mc-EPOCHS', String(Math.floor(Date.now() / 100) % 10000));
    s('mc-PARAMS', (Math.random() * 0.5 + 7.2).toFixed(1) + 'B');
  }, 250));
}

/* ── Progress ── */
function initProgress() {
  const fillEl = document.getElementById('progressFill');
  const ringEl = document.getElementById('ringCounter');
  const labelEl = document.getElementById('progressLabel');
  if (!fillEl && !ringEl && !labelEl) return;
  const phases = PHASE_LABELS[_phase] || PHASE_LABELS.pre;
  let progress = 0, phaseIdx = 0;
  _intervals.push(setInterval(() => {
    progress += Math.random() * 3 + 0.5;
    if (progress > 100) { progress = 0; phaseIdx = (phaseIdx + 1) % phases.length; }
    if (fillEl) fillEl.style.width = progress + '%';
    if (ringEl) ringEl.textContent = Math.floor(progress) + '%';
    if (labelEl) labelEl.textContent = phases[phaseIdx];
  }, 200));
}

/* ── Clock ── */
function initClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  _intervals.push(setInterval(() => {
    const d = new Date();
    el.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
  }, 1000));
}

/* ── Cleanup ── */
function destroy() { _intervals.forEach(clearInterval); _intervals = []; }

return { init, destroy, GRADES, GC, DK, DL, DL_SHORT, RANK };
})();
