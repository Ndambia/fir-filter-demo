/* app.js — NeuroLab Pro v3.0 UI Engine */
(function () {
  "use strict";

  // ── PWA ──────────────────────────────────────────────────────────────────
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => { });
    });
  }

  // ── STATE ─────────────────────────────────────────────────────────────────
  const STATE = {
    raw: null,
    timestamps: null,
    fs: 2000,
    fsManual: false,
    fsAutoDetected: false,
    stages: {},
    stageOrder: [],
    // Persistent chart instances — NEVER destroy unless stage disappears
    charts: {},        // key → Chart instance
    notches: [],
    notchId: 0,
    layout: "stacked",
    pinnedStages: new Set(["raw", "final"]),
    hiddenStages: new Set(),
    zoom: 100,
    pan: 0,
    // Analysis
    rpeaks: [],
    annotations: [],
    annotMode: false,
    annotId: 0,
    lastBandPower: null,
    // EOG
    eogCrests: [],
    eogTroughs: [],
    eogGazeTimeline: null,
    eogGazeEvents: [],
    groundTruthLabels: null,  // Float64Array(+1/0/-1) from CSV label column
  };
  window.STATE = STATE;

  const STAGE_META = {
    raw: { label: "RAW ADC", color: "#38bdf8", short: "RAW" },
    ma: { label: "After MA", color: "#facc15", short: "MA" },
    hp: { label: "After HP", color: "#a78bfa", short: "HP" },
    lp: { label: "After LP", color: "#f97316", short: "LP" },
    bl: { label: "Detrended", color: "#94a3b8", short: "BL" },
    final: { label: "FINAL OUTPUT", color: "#34d399", short: "OUT" },
  };
  window.STAGE_META = STAGE_META;

  function getNotchMeta(id) {
    const colors = ["#fb7185", "#60a5fa", "#fbbf24", "#c084fc", "#4ade80", "#f87171"];
    const i = STATE.notches.findIndex(n => n.id === id);
    const ci = i >= 0 ? i : 0;
    return { label: `After Notch ${ci + 1}`, color: colors[ci % colors.length], short: `N${ci + 1}` };
  }
  window.getNotchMeta = getNotchMeta;

  function stageLabel(key) {
    if (key.startsWith("notch_")) {
      const id = parseInt(key.slice(6), 10);
      return getNotchMeta(id);
    }
    return STAGE_META[key] || { label: key, color: "#cbd5e1", short: key.slice(0, 3).toUpperCase() };
  }

  // ── LOGGING ───────────────────────────────────────────────────────────────
  function log(msg, type = "info") {
    const el = document.getElementById("procLog");
    if (!el) return;
    const now = new Date();
    const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const div = document.createElement("div");
    div.className = "log-line";
    div.innerHTML = `<span class="log-time">${ts}</span><span class="log-${type}">${msg}</span>`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
  window.log = log;
  function pad(n) { return String(n).padStart(2, "0"); }

  // ── SYNC HELPERS ──────────────────────────────────────────────────────────
  window.syncV = function (rangeId, numId, dec = 0) {
    const v = document.getElementById(rangeId).value;
    document.getElementById(numId).value = dec > 0 ? parseFloat(v).toFixed(dec) : v;
  };
  window.syncR = function (numId, rangeId) {
    const r = document.getElementById(rangeId);
    const v = parseFloat(document.getElementById(numId).value);
    r.value = Math.max(parseFloat(r.min), Math.min(parseFloat(r.max), v));
  };

  // ── TAB SWITCHING ─────────────────────────────────────────────────────────
  window.switchSTab = function (btn, name) {
    document.querySelectorAll(".stab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    ["tabFilters", "tabPipeline", "tabMetrics", "tabAnalysis"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    const map = { filters: "tabFilters", pipeline: "tabPipeline", metrics: "tabMetrics", analysis: "tabAnalysis" };
    const target = document.getElementById(map[name]);
    if (target) target.style.display = "flex";
    // Auto-compute band power when switching to analysis
    if (name === "analysis" && STATE.raw) computeBandPower();
  };

  // ── CARD TOGGLE ───────────────────────────────────────────────────────────
  window.toggleCard = function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("collapsed");
  };

  // ── FS CONTROL ────────────────────────────────────────────────────────────
  window.overrideFs = function (val) {
    const v = parseFloat(val);
    if (!isFinite(v) || v < 1) return;
    STATE.fs = v; STATE.fsManual = true;
    const tag = document.getElementById("fsAutoTag");
    if (tag) tag.style.display = "none";
    log(`Fs manually set to ${v} Hz`, "warn");
    if (STATE.raw) applyPipeline();
  };

  function updateFsUI() {
    const el = document.getElementById("statFs");
    if (el) el.value = STATE.fs;
    const tag = document.getElementById("fsAutoTag");
    if (tag) tag.style.display = STATE.fsAutoDetected ? "" : "none";
    const nyq = document.getElementById("nyqLabel");
    if (nyq) nyq.textContent = (STATE.fs / 2).toFixed(0) + " Hz";
  }

  // ── FILE LOADING ──────────────────────────────────────────────────────────
  const topDrop = document.getElementById("topDrop");
  const fileInput = document.getElementById("fileInput");
  window.loadFile = loadFile; // expose for console testing

  document.addEventListener("dragover", e => { e.preventDefault(); topDrop.classList.add("drag"); });
  document.addEventListener("dragleave", e => { if (!e.relatedTarget || e.relatedTarget === document.documentElement) topDrop.classList.remove("drag"); });
  document.addEventListener("drop", e => {
    e.preventDefault(); topDrop.classList.remove("drag");
    const files = e.dataTransfer.files;
    if (files[0]) loadFile(files[0]);
  });
  topDrop.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ""; });

  // ── ANALYSIS STATE RESET ─────────────────────────────────────────────────
  function resetAnalysisState() {
    STATE.rpeaks = [];
    STATE.annotations = [];
    STATE.eogCrests = [];
    STATE.eogTroughs = [];
    STATE.eogGazeTimeline = null;
    STATE.eogGazeEvents = [];
    document.getElementById("bpmVal").textContent = "—";
    document.getElementById("hrvVal").textContent = "—";
    document.getElementById("peaksCount").textContent = "—";
    ['eogLeftCount', 'eogCenterCount', 'eogRightCount'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '—';
    });
    const ti = document.getElementById('eogThreshInfo');
    if (ti) ti.style.display = 'none';
    const accEl = document.getElementById('eogAccuracy');
    if (accEl) accEl.style.display = 'none';
  }

  // ── FILE UI UPDATE ──────────────────────────────────────────────────────
  function updateFileUI(file, stats) {
    document.getElementById("topDropLabel").textContent = "📄 " + file.name;
    document.getElementById("topStats").style.display = "flex";
    document.getElementById("emptyState").style.display = "none";
    document.getElementById("btnApply").disabled = false;
    document.getElementById("btnExport").disabled = false;
    document.getElementById("zoomBar").style.display = "flex";
    document.getElementById("statusDot").className = "status-dot live";
    document.getElementById("statN").textContent = STATE.raw.length.toLocaleString();
    document.getElementById("statMean").textContent = stats.mean.toFixed(2);
    document.getElementById("statStd").textContent = stats.std.toFixed(2);

    const durS = STATE.timestamps
      ? STATE.timestamps[STATE.timestamps.length - 1]
      : STATE.raw.length / STATE.fs;
    document.getElementById("statDur").textContent =
      durS >= 1 ? durS.toFixed(3) + "s" : (durS * 1000).toFixed(2) + "ms";

    // Show GT badge if labels present
    const gtBadge = document.getElementById('eogGTBadge');
    if (gtBadge) {
      gtBadge.style.display = STATE.groundTruthLabels ? '' : 'none';
      gtBadge.textContent = STATE.groundTruthLabels ? `GT: ${STATE.groundTruthLabels.length.toLocaleString()} labels` : '';
    }
  }

  function loadFile(file) {
    document.getElementById("topDropLabel").innerHTML = `<div class="spinner" style="width:11px;height:11px"></div>&nbsp;Loading…`;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = NeuroLabEngine.parseSignal(ev.target.result);
        STATE.raw = parsed.raw;
        STATE.timestamps = parsed.timestamps;

        // Log detected columns
        const dn = parsed.detectedNames || {};
        const lblNote = parsed.labelCol >= 0
          ? `label:"${dn.label || '?'}" (col${parsed.labelCol})`
          : 'no label col';
        log(`Columns → time:"${dn.ts || 'none'}" signal:"${dn.val || '?'}" (col${parsed.valCol}) · ${lblNote}`, "info");
        log(`Loaded ${STATE.raw.length.toLocaleString()} samples`, "ok");

        // Store ground truth labels
        STATE.groundTruthLabels = parsed.labels || null;
        if (STATE.groundTruthLabels) {
          const lc = parsed.labelCol >= 0 ? `"${dn.label}"` : '';
          log(`GT labels loaded from ${lc}: ${STATE.groundTruthLabels.length.toLocaleString()} samples`, 'ok');
        }

        if (!STATE.fsManual) {
          const est = NeuroLabEngine.estimateFs(STATE.timestamps, 2000);
          STATE.fs = est.fs;
          STATE.fsAutoDetected = !!est.autoDetected;
          if (est.autoDetected) {
            log(`dt≈${est.medDt.toExponential(3)}${est.unit} → Fs=${est.fs}Hz`, "ok");
            if (est.relErr > 0.10) log("⚠ Fs not near standard — consider manual override", "warn");
          } else {
            log(`Fs defaulted to ${STATE.fs}Hz (no timestamps)`, "warn");
          }
        }

        updateFsUI();
        updateFileUI(file, NeuroLabEngine.calcStats(STATE.raw));
        resetAnalysisState();
        applyPipeline();
      } catch (ex) {
        log("Parse error: " + ex.message, "warn");
        document.getElementById("topDropLabel").textContent = "Drop CSV / click to load";
      }
    };
    reader.readAsText(file);
  }

  // ── PIPELINE ──────────────────────────────────────────────────────────────
  let pipelineTimer = null;

  window.applyPipeline = function () {
    if (!STATE.raw) return;
    clearTimeout(pipelineTimer);
    pipelineTimer = setTimeout(_runPipeline, 80);
  };

  function buildConfig() {
    return {
      ma: { enabled: document.getElementById("enMA").checked, window: parseInt(document.getElementById("maWv").value) || 1 },
      hp: { enabled: document.getElementById("enHP").checked, fc: parseFloat(document.getElementById("hpFv").value), order: parseInt(document.getElementById("hpOrdv").value), zeroPhase: document.getElementById("hpZP").checked },
      lp: { enabled: document.getElementById("enLP").checked, fc: parseFloat(document.getElementById("lpFv").value), order: parseInt(document.getElementById("lpOrdv").value), zeroPhase: document.getElementById("lpZP").checked },
      notches: STATE.notches.map(n => ({ ...n })),
      baseline: { enabled: document.getElementById("enBL").checked, mode: document.getElementById("blMode").value },
    };
  }

  function _runPipeline() {
    if (!STATE.raw) return;
    const t0 = performance.now();
    document.getElementById("processingIndicator").style.display = "flex";

    const cfg = buildConfig();
    const out = NeuroLabEngine.runPipeline(STATE.raw, STATE.fs, cfg);
    STATE.stages = out.stages;
    STATE.stageOrder = out.order;

    const snrStr = isFinite(out.metrics.snr) ? out.metrics.snr.toFixed(1) : "∞";
    document.getElementById("statSNR").textContent = snrStr;
    const dt = (performance.now() - t0).toFixed(1);
    log(`Pipeline ${dt}ms · SNR=${snrStr}dB · N=${STATE.raw.length.toLocaleString()}`, "ok");

    updateStageToolbar();
    renderCharts();
    updateMetrics(out.metrics);
    renderSpectrum();
    updatePipelineViz();

    // Auto-update band power if Analysis tab is active
    if (document.getElementById("tabAnalysis").style.display !== "none") computeBandPower();

    document.getElementById("processingIndicator").style.display = "none";
  }

  // ── STAGE TOOLBAR ─────────────────────────────────────────────────────────
  function updateStageToolbar() {
    const tb = document.getElementById("stageToolbar");
    tb.querySelectorAll(".stage-btn").forEach(b => b.remove());
    const spacer = tb.querySelector(".stb-spacer");

    STATE.stageOrder.forEach(key => {
      const m = stageLabel(key);
      const pinned = STATE.pinnedStages.has(key);
      const hidden = STATE.hiddenStages.has(key);
      const btn = document.createElement("div");
      btn.className = "stage-btn" + (pinned ? " pinned" : "") + (hidden ? " hidden-stage" : "");
      btn.style.borderColor = pinned ? m.color : "";
      btn.style.color = pinned ? m.color : "";
      btn.innerHTML = `<span class="sdot" style="background:${m.color}"></span>${m.short}`;
      btn.title = `${m.label} — click to pin · right-click to toggle visibility`;
      btn.addEventListener("click", () => togglePinStage(key));
      btn.addEventListener("contextmenu", e => { e.preventDefault(); toggleHideStage(key); });
      tb.insertBefore(btn, spacer);
    });
  }

  function togglePinStage(key) {
    if (STATE.pinnedStages.has(key)) STATE.pinnedStages.delete(key);
    else STATE.pinnedStages.add(key);
    updateStageToolbar(); renderCharts();
  }
  function toggleHideStage(key) {
    if (STATE.hiddenStages.has(key)) STATE.hiddenStages.delete(key);
    else STATE.hiddenStages.add(key);
    updateStageToolbar(); renderCharts();
  }

  // ── LAYOUT ────────────────────────────────────────────────────────────────
  window.setLayout = function (mode, btn) {
    STATE.layout = mode;
    document.querySelectorAll(".vbtn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    // Destroy non-matching persistent panels
    renderCharts();
  };

  // ── ZOOM / PAN ────────────────────────────────────────────────────────────
  window.updateZoom = function () {
    STATE.zoom = parseInt(document.getElementById("zoomRange").value);
    STATE.pan = parseInt(document.getElementById("panRange").value);
    document.getElementById("zoomLabel").textContent = STATE.zoom + "%";
    document.getElementById("panLabel").textContent = STATE.pan + "%";
    renderCharts();
  };
  window.resetZoom = function () {
    STATE.zoom = 100; STATE.pan = 0;
    document.getElementById("zoomRange").value = 100;
    document.getElementById("panRange").value = 0;
    document.getElementById("zoomLabel").textContent = "100%";
    document.getElementById("panLabel").textContent = "0%";
    renderCharts();
  };

  function visibleSlice(len) {
    const visN = Math.max(2, Math.round(len * STATE.zoom / 100));
    const maxSt = Math.max(0, len - visN);
    const start = Math.round(maxSt * STATE.pan / 100);
    return { start, end: Math.min(len, start + visN), visN };
  }

  // ── DOWNSAMPLING ──────────────────────────────────────────────────────────
  const MAX_POINTS = 4000; // max data points per chart series

  function downsampledPoints(signal, start, end) {
    const slice = signal.slice(start, end);
    if (slice.length <= MAX_POINTS) {
      return Array.from(slice).map((v, i) => ({ x: start + i, y: v }));
    }
    const res = NeuroLabEngine.lttbDownsample(slice, MAX_POINTS);
    if (res.sampledIdx) {
      return Array.from(res.sampledIdx).map((si, i) => ({ x: start + si, y: res.sampled[i] }));
    }
    return Array.from(res).map((v, i) => ({ x: start + i, y: v }));
  }

  // ── CHART BASE OPTIONS ────────────────────────────────────────────────────
  function baseOpts(extraY) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true, callbacks: {
            label: ctx => `${ctx.dataset.label}: ${typeof ctx.parsed.y === "number" ? ctx.parsed.y.toFixed(4) : "—"}`
          }
        }
      },
      scales: {
        x: {
          type: "linear",
          ticks: {
            color: "#4a5f78", font: { family: "'JetBrains Mono',monospace", size: 9 }, maxTicksLimit: 7,
            callback: v => {
              // v is sample index; timestamps are normalised to t=0
              const sampleIdx = Math.round(v);
              const t = STATE.timestamps ? STATE.timestamps[sampleIdx] : sampleIdx / STATE.fs;
              if (t === undefined || t === null || !isFinite(t)) return sampleIdx;
              // Auto-pick suitable unit based on total duration
              const totalDur = STATE.timestamps
                ? STATE.timestamps[STATE.timestamps.length - 1]
                : STATE.raw.length / STATE.fs;
              if (totalDur < 0.1) return (t * 1000).toFixed(1) + "ms";
              if (totalDur < 10) return t.toFixed(3) + "s";
              if (totalDur < 600) return t.toFixed(1) + "s";
              return Math.floor(t / 60) + "m" + (t % 60).toFixed(0).padStart(2, "0") + "s";
            }
          },
          grid: { color: "rgba(56,189,248,.04)" }
        },
        y: {
          ticks: { color: "#4a5f78", font: { family: "'JetBrains Mono',monospace", size: 9 }, maxTicksLimit: 5 },
          grid: { color: "rgba(56,189,248,.04)" },
          ...(extraY || {})
        }
      },
      elements: { point: { radius: 0 }, line: { borderWidth: 1.5, tension: 0 } }
    };
  }

  // ── MAIN RENDER DISPATCH ──────────────────────────────────────────────────
  window.renderCharts = function renderCharts() {
    if (!STATE.raw || !STATE.stageOrder.length) return;
    if (STATE.layout === "stacked") renderStacked();
    else if (STATE.layout === "overlay") renderOverlay();
    else if (STATE.layout === "spectrum") renderSpectralView();
    else if (STATE.layout === "spectrogram") renderSpectrogramView();
    renderEOGTimeline();
    updateOverlayChips();
  };

  // ─── STACKED ─────────────────────────────────────────────────────────────
  function renderStacked() {
    const wrap = document.getElementById("chartsWrap");
    const shown = STATE.stageOrder.filter(k => !STATE.hiddenStages.has(k));
    const needed = new Set(shown);

    // Remove panels whose stage is gone
    wrap.querySelectorAll(".cpanel[data-stage]").forEach(p => {
      const key = p.dataset.stage;
      if (!needed.has(key) || key.startsWith("_")) {
        destroyChart(key); p.remove();
      }
    });

    shown.forEach(key => {
      const signal = STATE.stages[key];
      if (!signal) return;
      const m = stageLabel(key);
      const pinned = STATE.pinnedStages.has(key);
      const { start, end } = visibleSlice(signal.length);
      const points = downsampledPoints(signal, start, end);

      // Create panel if missing
      let panel = wrap.querySelector(`.cpanel[data-stage="${key}"]`);
      if (!panel) {
        panel = document.createElement("div");
        panel.dataset.stage = key;
        panel.className = "cpanel osc-bg " + (pinned ? "pinned" : "mini-panel");
        panel.innerHTML = `
          <div class="cpanel-header">
            <span style="width:8px;height:8px;border-radius:50%;background:${m.color};flex-shrink:0;display:inline-block"></span>
            <span class="ch-title">${m.label}</span>
            <div class="ch-badges">
              <span class="badge badge-info" id="badge_${key}">${signal.length.toLocaleString()} pts</span>
            </div>
          </div>
          <div class="cpanel-canvas" style="height:0;position:relative">
            <canvas id="canvas_${key}" style="display:block"></canvas>
          </div>`;
        panel.querySelector(".cpanel-header").addEventListener("click", () => togglePinStage(key));
        panel.addEventListener("wheel", e => onChartWheel(e), { passive: false });
        wrap.appendChild(panel);
      }

      // Update class
      panel.className = "cpanel osc-bg " + (pinned ? "pinned" : "mini-panel");
      const canvasWrap = panel.querySelector(".cpanel-canvas");
      canvasWrap.style.height = pinned ? "190px" : "0px";
      const canvas = panel.querySelector("canvas");

      if (!pinned) {
        destroyChart(key);
        return;
      }

      // Build datasets: signal + optional RMS envelope
      const datasets = [makeDataset(key, points, m.color)];
      if (document.getElementById("enRMS").checked) {
        const winMs = parseFloat(document.getElementById("rmsWinV").value) || 50;
        const winSmp = Math.max(2, Math.round(winMs / 1000 * STATE.fs));
        const env = NeuroLabEngine.rmsEnvelope(signal, winSmp);
        const ePts = downsampledPoints(env, start, end);
        datasets.push({ label: "RMS Env", data: ePts, borderColor: m.color + "99", borderDash: [3, 3], borderWidth: 1, fill: false, pointRadius: 0, tension: 0 });
        datasets.push({ label: "−RMS Env", data: ePts.map(p => ({ x: p.x, y: -p.y })), borderColor: m.color + "99", borderDash: [3, 3], borderWidth: 1, fill: false, pointRadius: 0, tension: 0 });
      }

      // Add R-peak annotations as scatter
      if (document.getElementById("enPeaks").checked && STATE.rpeaks.length > 0) {
        const peakPts = STATE.rpeaks
          .filter(i => i >= start && i < end)
          .map(i => ({ x: i, y: signal[i] }));
        if (peakPts.length) {
          datasets.push({
            label: "R-peaks", data: peakPts, type: "scatter", pointRadius: 5,
            pointBackgroundColor: "#fb7185", pointBorderColor: "#fb7185", showLine: false
          });
        }
      }

      // ── EOG crest (right) and trough (left) markers ──────────────
      if (document.getElementById('enEOGMarkers')?.checked) {
        if (STATE.eogCrests.length > 0) {
          const crestPts = STATE.eogCrests
            .filter(i => i >= start && i < end)
            .map(i => ({ x: i, y: signal[i] }));
          if (crestPts.length) {
            datasets.push({
              label: 'Crest ▲ (Right)', data: crestPts, type: 'scatter',
              pointRadius: 7, pointStyle: 'triangle',
              pointBackgroundColor: '#34d399', pointBorderColor: '#34d399', showLine: false
            });
          }
        }
        if (STATE.eogTroughs.length > 0) {
          const troughPts = STATE.eogTroughs
            .filter(i => i >= start && i < end)
            .map(i => ({ x: i, y: signal[i] }));
          if (troughPts.length) {
            datasets.push({
              label: 'Trough ▼ (Left)', data: troughPts, type: 'scatter',
              pointRadius: 7, pointStyle: 'triangle',
              rotation: 180,
              pointBackgroundColor: '#fb7185', pointBorderColor: '#fb7185', showLine: false
            });
          }
        }
      }

      // Persistent chart update
      if (STATE.charts[key]) {
        const chart = STATE.charts[key];
        chart.data.datasets = datasets;
        chart.update("none");
      } else {
        if (!canvas.id) canvas.id = "canvas_" + key;
        const ctx = canvas.getContext("2d");
        const opts = baseOpts();
        opts.onHover = (evt, els, chart) => updateCursorReadout(chart, evt, key);
        STATE.charts[key] = new Chart(ctx, { type: "line", data: { datasets }, options: opts });

        // ResizeObserver to fix chart when panel expands
        new ResizeObserver(() => { if (STATE.charts[key]) STATE.charts[key].resize(); })
          .observe(canvasWrap);
      }
    });
  }

  // ── EOG GAZE TIMELINE PANEL ───────────────────────────────────────────────
  function renderEOGTimeline() {
    const wrap = document.getElementById('chartsWrap');
    const show = document.getElementById('enEOGTimeline')?.checked && STATE.eogGazeTimeline;

    // Remove old panel if turning off
    if (!show) {
      const old = wrap.querySelector('.cpanel[data-stage="_eogTimeline"]');
      if (old) { destroyChart('_eogTimeline'); old.remove(); }
      return;
    }

    let panel = wrap.querySelector('.cpanel[data-stage="_eogTimeline"]');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'cpanel osc-bg pinned';
      panel.dataset.stage = '_eogTimeline';
      panel.innerHTML = `
        <div class="cpanel-header">
          <span style="width:8px;height:8px;border-radius:50%;background:#a78bfa;flex-shrink:0;display:inline-block"></span>
          <span class="ch-title">EOG — Gaze Direction Timeline</span>
          <span class="badge badge-info">+1 Right · 0 Center · -1 Left</span>
        </div>
        <div class="cpanel-canvas" style="height:90px;position:relative">
          <canvas id="canvas__eogTimeline" style="display:block"></canvas>
        </div>`;
      wrap.appendChild(panel);
      new ResizeObserver(() => { if (STATE.charts['_eogTimeline']) STATE.charts['_eogTimeline'].resize(); })
        .observe(panel.querySelector('.cpanel-canvas'));
    }

    const timeline = STATE.eogGazeTimeline;
    const { start, end } = visibleSlice(timeline.length);
    const slice = timeline.slice(start, end);
    // Stepped line: subsample to MAX_POINTS
    let pts;
    if (slice.length <= MAX_POINTS) {
      pts = Array.from(slice).map((v, i) => ({ x: start + i, y: v }));
    } else {
      const step = Math.ceil(slice.length / MAX_POINTS);
      pts = [];
      for (let i = 0; i < slice.length; i += step) pts.push({ x: start + i, y: slice[i] });
    }

    const datasets = [{
      label: 'Gaze',
      data: pts,
      borderColor: '#a78bfa',
      backgroundColor: 'rgba(167,139,250,.12)',
      fill: true,
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0,
      stepped: 'before',
    }];

    const opts = baseOpts({ min: -1.5, max: 1.5, ticks: {
      color: '#4a5f78', font: { family: "'JetBrains Mono',monospace", size: 9 },
      callback: v => v === 1 ? '▶R' : v === -1 ? '◀L' : v === 0 ? '●C' : ''
    }});

    if (STATE.charts['_eogTimeline']) {
      STATE.charts['_eogTimeline'].data.datasets = datasets;
      STATE.charts['_eogTimeline'].update('none');
    } else {
      const canvas = document.getElementById('canvas__eogTimeline');
      const ctx = canvas.getContext('2d');
      STATE.charts['_eogTimeline'] = new Chart(ctx, { type: 'line', data: { datasets }, options: opts });
    }
  }

  function makeDataset(key, points, color) {
    const m = stageLabel(key);
    return {
      label: m.label,
      data: points,
      borderColor: color,
      backgroundColor: color + "14",
      fill: false,
    };
  }

  // ─── OVERLAY ─────────────────────────────────────────────────────────────
  function renderOverlay() {
    const wrap = document.getElementById("chartsWrap");
    // Remove stacked panels
    wrap.querySelectorAll(".cpanel[data-stage]").forEach(p => {
      if (p.dataset.stage !== "_overlay") { destroyChart(p.dataset.stage); p.remove(); }
    });

    const shown = STATE.stageOrder.filter(k => !STATE.hiddenStages.has(k));
    const { start, end } = visibleSlice(STATE.raw.length);

    let panel = wrap.querySelector('.cpanel[data-stage="_overlay"]');
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "cpanel osc-bg pinned";
      panel.dataset.stage = "_overlay";
      panel.style.flex = "1";
      panel.innerHTML = `
        <div class="cpanel-header">
          <span class="ch-title">OVERLAY — All Stages</span>
        </div>
        <div class="cpanel-canvas" style="height:300px;position:relative">
          <canvas id="canvas__overlay" style="display:block"></canvas>
        </div>`;
      panel.addEventListener("wheel", e => onChartWheel(e), { passive: false });
      wrap.appendChild(panel);
    }

    const datasets = shown.map(key => {
      const signal = STATE.stages[key];
      if (!signal) return null;
      const pts = downsampledPoints(signal, start, Math.min(end, signal.length));
      return makeDataset(key, pts, stageLabel(key).color);
    }).filter(Boolean);

    if (STATE.charts["_overlay"]) {
      STATE.charts["_overlay"].data.datasets = datasets;
      STATE.charts["_overlay"].update("none");
    } else {
      const canvas = document.getElementById("canvas__overlay");
      const ctx = canvas.getContext("2d");
      STATE.charts["_overlay"] = new Chart(ctx, { type: "line", data: { datasets }, options: baseOpts() });
      new ResizeObserver(() => { if (STATE.charts["_overlay"]) STATE.charts["_overlay"].resize(); })
        .observe(panel.querySelector(".cpanel-canvas"));
    }
  }

  // ─── SPECTRUM (frequency domain, both raw & final) ─────────────────────
  function renderSpectralView() {
    const wrap = document.getElementById("chartsWrap");
    wrap.querySelectorAll(".cpanel[data-stage]").forEach(p => {
      if (p.dataset.stage !== "_spectrum") { destroyChart(p.dataset.stage); p.remove(); }
    });

    let panel = wrap.querySelector('.cpanel[data-stage="_spectrum"]');
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "cpanel osc-bg pinned";
      panel.dataset.stage = "_spectrum";
      panel.style.flex = "1";
      panel.innerHTML = `
        <div class="cpanel-header">
          <span class="ch-title">WELCH PSD — Frequency Spectrum</span>
          <span class="badge badge-info">Hann window</span>
        </div>
        <div class="cpanel-canvas" style="height:340px;position:relative">
          <canvas id="canvas__spectrum" style="display:block"></canvas>
        </div>`;
      wrap.appendChild(panel);
    }

    const keys = STATE.stageOrder.filter(k => !STATE.hiddenStages.has(k));
    const datasets = keys.map(key => {
      const signal = STATE.stages[key];
      if (!signal) return null;
      const { mag, freqs } = NeuroLabEngine.welchPSD(signal, STATE.fs, Math.min(signal.length, 2048));
      const m = stageLabel(key);
      const nyq = STATE.fs / 2;
      return {
        label: m.label,
        data: Array.from(mag).map((v, i) => ({ x: freqs[i], y: 20 * Math.log10(Math.max(v, 1e-12)) })).filter(p => p.x <= nyq),
        borderColor: m.color,
        backgroundColor: m.color + "18",
        fill: false,
      };
    }).filter(Boolean);

    const opts = baseOpts();
    opts.scales.x.title = { display: true, text: "Frequency (Hz)", color: "#4a5f78", font: { family: "'JetBrains Mono',monospace", size: 9 } };
    opts.scales.y.title = { display: true, text: "Power (dBFS)", color: "#4a5f78", font: { family: "'JetBrains Mono',monospace", size: 9 } };
    opts.scales.x.ticks.callback = v => v.toFixed(0) + "Hz";

    if (STATE.charts["_spectrum"]) {
      STATE.charts["_spectrum"].data.datasets = datasets;
      STATE.charts["_spectrum"].update("none");
    } else {
      const canvas = document.getElementById("canvas__spectrum");
      const ctx = canvas.getContext("2d");
      STATE.charts["_spectrum"] = new Chart(ctx, { type: "line", data: { datasets }, options: opts });
      new ResizeObserver(() => { if (STATE.charts["_spectrum"]) STATE.charts["_spectrum"].resize(); })
        .observe(panel.querySelector(".cpanel-canvas"));
    }
  }

  // ─── SPECTROGRAM ─────────────────────────────────────────────────────────
  function renderSpectrogramView() {
    const wrap = document.getElementById("chartsWrap");
    wrap.querySelectorAll(".cpanel[data-stage]").forEach(p => {
      destroyChart(p.dataset.stage); p.remove();
    });

    let panel = wrap.querySelector('.cpanel[data-stage="_spectrogram"]');
    if (!panel) {
      panel = document.createElement("div");
      panel.dataset.stage = "_spectrogram";
      panel.className = "cpanel osc-bg pinned";
      panel.style.flex = "1";
      panel.innerHTML = `
        <div class="cpanel-header">
          <span class="ch-title">SPECTROGRAM — Short-Time FFT</span>
          <span class="badge badge-warn">Signal: FINAL</span>
        </div>
        <div class="cpanel-canvas" style="height:340px;position:relative;background:var(--bg3)">
          <canvas id="canvas__spectrogram" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
          <div style="position:absolute;bottom:4px;left:8px;font-family:var(--mono);font-size:.56rem;color:var(--muted)">Time →</div>
          <div style="position:absolute;top:8px;left:6px;font-family:var(--mono);font-size:.56rem;color:var(--muted);writing-mode:vertical-rl;transform:rotate(180deg)">Freq</div>
        </div>`;
      wrap.appendChild(panel);
    }

    const signal = STATE.stages.final || STATE.stages.raw;
    if (!signal) return;

    const canvasWrap = panel.querySelector(".cpanel-canvas");
    const canvas = document.getElementById("canvas__spectrogram");
    const W = canvasWrap.clientWidth || 600;
    const H = canvasWrap.clientHeight || 340;
    canvas.width = W; canvas.height = H;
    const ctx2 = canvas.getContext("2d");

    const sg = NeuroLabEngine.computeSpectrogram(signal, STATE.fs, 256, 64);
    if (!sg.frames.length) return;

    const nFrames = sg.frames.length;
    const nFreqs = sg.frames[0].length;
    const maxFreqBin = Math.floor(nFreqs * Math.min(1, 200 / (STATE.fs / 2))); // show up to 200Hz or Nyq
    const dispFreqs = Math.min(maxFreqBin, nFreqs);

    // Find global max for normalization
    let globalMax = 0;
    for (const frame of sg.frames) for (let j = 0; j < dispFreqs; j++) if (frame[j] > globalMax) globalMax = frame[j];
    if (globalMax === 0) return;

    const cellW = W / nFrames;
    const cellH = H / dispFreqs;

    for (let t = 0; t < nFrames; t++) {
      for (let f = 0; f < dispFreqs; f++) {
        const val = sg.frames[t][f] / globalMax;
        const dB = 20 * Math.log10(Math.max(val, 1e-6));
        const norm = Math.max(0, Math.min(1, (dB + 60) / 60));
        ctx2.fillStyle = heatColor(norm);
        ctx2.fillRect(Math.round(t * cellW), Math.round((dispFreqs - 1 - f) * cellH),
          Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
      }
    }
  }

  function heatColor(t) {
    // black → blue → cyan → yellow → white
    if (t < 0.25) { const v = t * 4; return `rgb(0,0,${Math.round(v * 200)})`; }
    if (t < 0.5) { const v = (t - .25) * 4; return `rgb(0,${Math.round(v * 200)},${Math.round(200 + v * 55)})`; }
    if (t < 0.75) { const v = (t - .5) * 4; return `rgb(${Math.round(v * 240)},${Math.round(200 + v * 55)},${Math.round(255 - v * 200)})`; }
    const v = (t - .75) * 4; return `rgb(255,${Math.round(255 - v * 60)},${Math.round(55 + v * 200)})`;
  }

  // ── DESTROY CHART HELPER ─────────────────────────────────────────────────
  function destroyChart(key) {
    if (STATE.charts[key]) {
      STATE.charts[key].destroy();
      delete STATE.charts[key];
    }
  }

  // ── MOUSE WHEEL ZOOM ──────────────────────────────────────────────────────
  function onChartWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 5 : -5;
    const newZoom = Math.max(5, Math.min(100, STATE.zoom - delta));
    STATE.zoom = newZoom;
    document.getElementById("zoomRange").value = newZoom;
    document.getElementById("zoomLabel").textContent = newZoom + "%";
    renderCharts();
  }

  // ── CURSOR READOUT ────────────────────────────────────────────────────────
  function updateCursorReadout(chart, evt, key) {
    const pts = chart.getElementsAtEventForMode(evt.native || evt, "index", { intersect: false }, false);
    if (!pts.length) return;
    const idx = pts[0].index;
    const dataX = chart.data.datasets[0]?.data[idx]?.x;
    if (dataX === undefined) return;
    const sampleIdx = Math.round(dataX);
    const timeS = STATE.timestamps ? STATE.timestamps[sampleIdx] : sampleIdx / STATE.fs;
    const rawV = STATE.raw?.[sampleIdx];
    const filtV = STATE.stages.final?.[sampleIdx];
    document.getElementById("crIdx").textContent = sampleIdx.toLocaleString();
    document.getElementById("crTime").textContent = typeof timeS === "number" ? timeS.toFixed(4) + "s" : "—";
    document.getElementById("crRaw").textContent = rawV !== undefined ? rawV.toFixed(4) : "—";
    document.getElementById("crFilt").textContent = filtV !== undefined ? filtV.toFixed(4) : "—";
    document.getElementById("crDelta").textContent = (rawV !== undefined && filtV !== undefined)
      ? (rawV - filtV).toFixed(4) : "—";
  }

  // ── OVERLAY CHIPS ─────────────────────────────────────────────────────────
  function updateOverlayChips() {
    const tog = document.getElementById("overlayToggle");
    tog.innerHTML = "";
    STATE.stageOrder.forEach(key => {
      const m = stageLabel(key);
      const on = !STATE.hiddenStages.has(key);
      const chip = document.createElement("div");
      chip.style.cssText = `display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;border:1px solid ${on ? m.color : "var(--border)"};font-family:var(--mono);font-size:.6rem;color:${on ? m.color : "var(--muted)"};cursor:pointer;transition:.12s`;
      chip.innerHTML = `<span style="width:5px;height:5px;border-radius:50%;background:${m.color};display:inline-block"></span>${m.short}`;
      chip.addEventListener("click", () => { toggleHideStage(key); updateOverlayChips(); });
      tog.appendChild(chip);
    });
  }

  // ── SPECTRUM (right panel — Welch PSD) ────────────────────────────────────
  function renderSpectrum() {
    const canvas = document.getElementById("specCanvas");
    if (!canvas || !STATE.stages.raw) return;
    const wrap = document.getElementById("specWrap");
    const W = wrap.clientWidth || 220;
    const H = wrap.clientHeight || 120;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    const keys = ["raw", "final"].filter(k => STATE.stages[k]);
    const colors = { raw: "#38bdf8", final: "#34d399" };
    let domFreq = 0, domMag = 0;

    keys.forEach(key => {
      const { mag, freqs } = NeuroLabEngine.welchPSD(STATE.stages[key], STATE.fs, Math.min(STATE.stages[key].length, 1024));
      const nShow = Math.floor(mag.length * Math.min(1, 300 / (STATE.fs / 2)));
      let maxM = 0; for (let i = 1; i < nShow; i++) if (mag[i] > maxM) maxM = mag[i];
      if (maxM === 0) return;

      ctx.beginPath();
      ctx.strokeStyle = colors[key] || "#94a3b8";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < nShow; i++) {
        const x = (i / nShow) * W;
        const y = H - (mag[i] / maxM) * (H - 4) - 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        if (key === "raw" && mag[i] > domMag) { domMag = mag[i]; domFreq = freqs[i]; }
      }
      ctx.stroke();

      // Label raw/final
      ctx.fillStyle = colors[key] + "aa";
      ctx.font = "10px 'JetBrains Mono',monospace";
      ctx.fillText(key === "raw" ? "R" : "F", 4 + (key === "final" ? 14 : 0), 12);
    });

    document.getElementById("domFreq").textContent = domFreq.toFixed(1) + " Hz";
  }

  // ── METRICS ───────────────────────────────────────────────────────────────
  function updateMetrics(metrics) {
    const fmtN = v => isFinite(v) ? v.toFixed(3) : "—";
    const mk = (lbl, val) => `<div class="metric"><div class="mv">${val}</div><div class="ml">${lbl}</div></div>`;
    const sr = metrics.statsRaw, sf = metrics.statsFinal;
    const rawEl = document.getElementById("metricsRaw");
    if (rawEl) rawEl.innerHTML = mk("Mean", fmtN(sr.mean)) + mk("Std", fmtN(sr.std)) + mk("Min", fmtN(sr.min)) + mk("Max", fmtN(sr.max)) + mk("RMS", fmtN(sr.rms)) + mk("Median", fmtN(sr.p50));
    const finEl = document.getElementById("metricsFinal");
    if (finEl) finEl.innerHTML = mk("Mean", fmtN(sf.mean)) + mk("Std", fmtN(sf.std)) + mk("Min", fmtN(sf.min)) + mk("Max", fmtN(sf.max)) + mk("RMS", fmtN(sf.rms)) + mk("Median", fmtN(sf.p50));

    const snr = metrics.snr, snrStr = isFinite(snr) ? snr.toFixed(1) : "∞";
    const pct = Math.min(100, Math.max(0, isFinite(snr) ? (snr + 20) * 2 : 100));
    const clr = snr > 20 ? "#34d399" : snr > 10 ? "#facc15" : "#fb7185";
    const snrEl = document.getElementById("snrMeter");
    if (snrEl) snrEl.innerHTML = `<div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:.63rem"><span style="color:var(--muted)">SNR Improvement</span><span style="color:${clr}">${snrStr} dB</span></div><div class="snr-bar" style="margin-top:5px"><div class="snr-fill" style="width:${pct}%;background:${clr}"></div></div>`;

    const freqEl = document.getElementById("freqContent");
    if (freqEl && STATE.stages.raw) {
      const { mag, freqs } = NeuroLabEngine.welchPSD(STATE.stages.raw, STATE.fs, 1024);
      let mxM = 0, mxF = 0; for (let i = 1; i < mag.length; i++) if (mag[i] > mxM) { mxM = mag[i]; mxF = freqs[i]; }
      freqEl.innerHTML = `<div style="font-family:var(--mono);font-size:.62rem;color:var(--muted);line-height:1.8">Dominant: <span style="color:var(--accent)">${mxF.toFixed(1)}Hz</span><br>Nyquist: <span style="color:var(--accent)">${(STATE.fs / 2).toFixed(0)}Hz</span></div>`;
    }
  }

  // ── BAND POWER ────────────────────────────────────────────────────────────
  function computeBandPower() {
    const src = (document.getElementById("bandSrc")?.value) || "final";
    const signal = STATE.stages[src] || STATE.stages.final || STATE.stages.raw;
    if (!signal) return;

    const bp = NeuroLabEngine.bandPower(signal, STATE.fs);
    STATE.lastBandPower = bp;

    const BAND_COLORS = { delta: "#38bdf8", theta: "#a78bfa", alpha: "#34d399", beta: "#facc15", gamma: "#fb7185" };
    const BAND_RANGES = { delta: "0.5–4Hz", theta: "4–8Hz", alpha: "8–13Hz", beta: "13–30Hz", gamma: "30–100Hz" };
    const grid = document.getElementById("bandGrid");
    if (!grid) return;

    grid.innerHTML = Object.entries(bp)
      .filter(([k]) => k !== "—total" && !k.startsWith("_"))
      .map(([k, v]) => {
        const pct = (v.relative * 100).toFixed(1);
        const abs = v.absolute.toExponential(2);
        const col = BAND_COLORS[k] || "#94a3b8";
        return `<div class="band-row">
          <span class="band-lbl" style="color:${col}">${k}</span>
          <div class="band-bar-wrap"><div class="band-bar" style="width:${Math.min(100, v.relative * 100).toFixed(1)}%;background:${col}"></div></div>
          <span class="band-pct" style="color:${col}">${pct}%</span>
        </div>
        <div style="font-family:var(--mono);font-size:.55rem;color:var(--muted);margin-bottom:2px;padding-left:42px">${BAND_RANGES[k] || ""} · abs=${abs}</div>`;
      }).join("");
  }
  window.computeBandPower = computeBandPower;

  // ── EOG GAZE DETECTION ────────────────────────────────────────────────────
  window.runEOGDetection = function () {
    const src = (document.getElementById('eogSrc')?.value) || 'final';
    const signal = STATE.stages[src] || STATE.stages.final;
    if (!signal) { log('No signal — run pipeline first', 'warn'); return; }

    const thresholdK = parseFloat(document.getElementById('eogKv')?.value) || 1.0;
    log(`Running EOG gaze detection (k=${thresholdK})…`, 'info');

    const res = NeuroLabEngine.detectEOGGaze(signal, STATE.fs, { thresholdK });
    STATE.eogCrests       = res.crests;
    STATE.eogTroughs      = res.troughs;
    STATE.eogGazeTimeline = res.gazeTimeline;
    STATE.eogGazeEvents   = res.gazeEvents;

    // Update gaze count display
    const s = res.stats;
    document.getElementById('eogLeftCount').textContent   = s.leftEvents;
    document.getElementById('eogCenterCount').textContent = '—';
    document.getElementById('eogRightCount').textContent  = s.rightEvents;

    // Show threshold info
    const ti = document.getElementById('eogThreshInfo');
    if (ti) {
      ti.style.display = '';
      document.getElementById('eogThreshVal').textContent  = res.thresholds.std.toFixed(3);
      document.getElementById('eogEventCount').textContent = s.totalEvents;
    }

    log(
      `EOG: ${s.leftEvents} left saccade(s) · ${s.rightEvents} right saccade(s) · ` +
      `thresh=${res.thresholds.pos.toFixed(3)} / ${res.thresholds.neg.toFixed(3)}`,
      'ok'
    );

    renderCharts();
  };

  // ── R-PEAK DETECTION ──────────────────────────────────────────────────────
  window.runRPeakDetection = function () {
    const src = (document.getElementById("ecgSrc")?.value) || "final";
    const signal = STATE.stages[src] || STATE.stages.final;
    if (!signal) { log("No signal — run pipeline first", "warn"); return; }
    log("Running R-peak detection…", "info");

    const res = NeuroLabEngine.detectRPeaks(signal, STATE.fs);
    STATE.rpeaks = res.peaks;

    document.getElementById("bpmVal").textContent = res.bpm > 0 ? res.bpm.toFixed(1) : "—";
    document.getElementById("hrvVal").textContent = res.hrv > 0 ? res.hrv.toFixed(1) + " ms" : "—";
    document.getElementById("peaksCount").textContent = res.peaks.length;

    log(`R-peaks: ${res.peaks.length} detected · BPM=${res.bpm.toFixed(1)} · RMSSD=${res.hrv.toFixed(1)}ms`, "ok");
    renderCharts();
  };

  // ── ANNOTATIONS ───────────────────────────────────────────────────────────
  let annotModeActive = false;

  window.toggleAnnotMode = function () {
    annotModeActive = !annotModeActive;
    const btn = document.getElementById("btnAnnot");
    btn.classList.toggle("btn-success", annotModeActive);
    btn.style.background = annotModeActive ? "rgba(52,211,153,.15)" : "";
    document.body.style.cursor = annotModeActive ? "crosshair" : "";
    log(annotModeActive ? "Annotation mode ON — click chart to drop marker" : "Annotation mode OFF", "info");
  };

  window.clearAnnotations = function () {
    STATE.annotations = [];
    renderAnnotList();
    renderCharts();
  };

  document.addEventListener("click", e => {
    if (!annotModeActive || !STATE.raw) return;
    const wrap = document.getElementById("chartsWrap");
    const rect = wrap.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    // Find approximate sample index from click position
    const relX = (e.clientX - rect.left) / rect.width;
    const { start, end } = visibleSlice(STATE.raw.length);
    const sampleIdx = Math.round(start + relX * (end - start));
    const label = prompt("Annotation label:", `M${++STATE.annotId}`) || `M${STATE.annotId}`;
    STATE.annotations.push({ id: STATE.annotId, idx: sampleIdx, label });
    renderAnnotList();
    log(`Annotation '${label}' at sample ${sampleIdx}`, "info");
  });

  function renderAnnotList() {
    const el = document.getElementById("annotList");
    if (!el) return;
    if (!STATE.annotations.length) { el.innerHTML = "<span>No annotations</span>"; return; }
    el.innerHTML = STATE.annotations.map(a =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;background:var(--bg3);border-radius:4px;border:1px solid var(--border)">
        <span style="color:var(--warn)">${a.label}</span>
        <span style="color:var(--muted)">@${a.idx.toLocaleString()}</span>
        <span style="cursor:pointer;color:var(--danger)" onclick="removeAnnotation(${a.id})">✕</span>
      </div>`
    ).join("");
  }
  window.removeAnnotation = id => {
    STATE.annotations = STATE.annotations.filter(a => a.id !== id);
    renderAnnotList(); renderCharts();
  };

  // ── PIPELINE VIZ ─────────────────────────────────────────────────────────
  function updatePipelineViz() {
    const el = document.getElementById("pipelineViz");
    if (!el) return;
    el.innerHTML = STATE.stageOrder.map((key, i) => {
      const m = stageLabel(key);
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 7px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;font-family:var(--mono);font-size:.6rem;color:var(--muted)">
        <span style="width:6px;height:6px;border-radius:50%;background:${m.color}"></span>
        ${i > 0 ? "→ " : ""}${m.label}
      </div>`;
    }).join("");
  }

  // ── NOTCH FILTERS ─────────────────────────────────────────────────────────
  window.addNotch = function () {
    const id = ++STATE.notchId;
    STATE.notches.push({ id, f0: 50, Q: 30, passes: 1, enabled: true });
    renderNotchUI(); applyPipeline();
  };
  window.removeNotch = function (id) {
    STATE.notches = STATE.notches.filter(n => n.id !== id);
    // Destroy the matching chart
    const key = `notch_${id}`;
    destroyChart(key);
    const panel = document.querySelector(`.cpanel[data-stage="${key}"]`);
    if (panel) panel.remove();
    renderNotchUI(); applyPipeline();
  };
  window.updateNotch = function (id, field, value) {
    const n = STATE.notches.find(n => n.id === id);
    if (!n) return;
    n[field] = field === "enabled" ? value : parseFloat(value);
  };

  function renderNotchUI() {
    const container = document.getElementById("notchContainer");
    document.getElementById("notchCount").textContent = STATE.notches.length;
    container.innerHTML = "";
    const colors = ["#fb7185", "#60a5fa", "#fbbf24", "#c084fc", "#4ade80", "#f87171"];
    STATE.notches.forEach((n, idx) => {
      const color = colors[idx % colors.length];
      const maxF = ((STATE.fs / 2) - 1).toFixed(0);
      const div = document.createElement("div");
      div.className = "fcard";
      div.innerHTML = `
        <div class="fcard-header" onclick="toggleCard('nc_${n.id}')">
          <span class="fcard-dot" style="background:${color}"></span>
          <span class="fcard-name">Notch ${idx + 1} — ${n.f0}Hz</span>
          <label class="toggle" onclick="event.stopPropagation()">
            <input type="checkbox" ${n.enabled ? "checked" : ""} onchange="updateNotch(${n.id},'enabled',this.checked);applyPipeline()" />
            <span class="tslider"></span>
          </label>
          <button class="del-btn" onclick="event.stopPropagation();removeNotch(${n.id})" title="Remove">✕</button>
        </div>
        <div class="fcard-body" id="nc_${n.id}" style="display:flex">
          <div class="prow">
            <span class="plbl">Freq Hz</span>
            <input type="range" min="1" max="${maxF}" value="${n.f0}" step="0.5"
              oninput="updateNotch(${n.id},'f0',this.value);this.nextElementSibling.value=parseFloat(this.value).toFixed(1);applyPipeline()" />
            <input type="number" value="${n.f0}" min="1" max="${maxF}" step="0.5" style="width:60px"
              oninput="updateNotch(${n.id},'f0',this.value);applyPipeline()" />
          </div>
          <div class="prow">
            <span class="plbl">Q factor</span>
            <input type="range" min="1" max="100" value="${n.Q}"
              oninput="updateNotch(${n.id},'Q',this.value);this.nextElementSibling.value=this.value;applyPipeline()" />
            <input type="number" value="${n.Q}" min="1" max="100" style="width:60px"
              oninput="updateNotch(${n.id},'Q',this.value);applyPipeline()" />
          </div>
          <div class="prow">
            <span class="plbl">Passes</span>
            <input type="range" min="1" max="5" value="${n.passes}" step="1"
              oninput="updateNotch(${n.id},'passes',this.value);this.nextElementSibling.value=this.value;applyPipeline()" />
            <input type="number" value="${n.passes}" min="1" max="5" style="width:60px"
              oninput="updateNotch(${n.id},'passes',this.value);applyPipeline()" />
          </div>
        </div>`;
      container.appendChild(div);
    });
  }

  // ── EXPORT ────────────────────────────────────────────────────────────────
  window.toggleExportMenu = function (e) {
    e.stopPropagation();
    const menu = document.getElementById("exportMenu");
    const rect = document.getElementById("btnExport").getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + "px";
    menu.style.left = (rect.left) + "px";
    menu.classList.toggle("open");
  };
  document.addEventListener("click", () => document.getElementById("exportMenu")?.classList.remove("open"));

  function downloadFile(content, name, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  window.exportCSV = function () {
    if (!STATE.stages.final) return;
    const hasGaze = STATE.eogGazeTimeline && STATE.eogGazeTimeline.length === STATE.stages.final.length;
    const hdr = hasGaze ? 'sample,time,raw,filtered,gaze_dir' : 'sample,time,raw,filtered';
    const lines = [hdr];
    for (let i = 0; i < STATE.stages.final.length; i++) {
      const t = STATE.timestamps ? STATE.timestamps[i] : (i / STATE.fs);
      const row = `${i},${t},${STATE.raw[i]},${STATE.stages.final[i]}`;
      lines.push(hasGaze ? row + ',' + STATE.eogGazeTimeline[i] : row);
    }
    downloadFile(lines.join("\n"), "neurolab_filtered.csv", "text/csv");
    log(hasGaze ? 'Exported filtered CSV with gaze timeline' : 'Exported filtered CSV', 'ok');
  };
  window.exportWAV = function () {
    if (!STATE.stages.final) return;
    const buf = NeuroLabEngine.encodeWav(STATE.stages.final, STATE.fs);
    downloadFile(buf, "neurolab_filtered.wav", "audio/wav");
    log("Exported WAV (16-bit PCM)", "ok");
  };
  window.exportSpectrumCSV = function () {
    if (!STATE.stages.raw) return;
    const { mag: mR, freqs } = NeuroLabEngine.welchPSD(STATE.stages.raw, STATE.fs, 2048);
    const { mag: mF } = NeuroLabEngine.welchPSD(STATE.stages.final || STATE.stages.raw, STATE.fs, 2048);
    const lines = ["freq_hz,mag_raw,mag_final"];
    for (let i = 0; i < freqs.length; i++) lines.push(`${freqs[i].toFixed(4)},${mR[i]},${mF[i]}`);
    downloadFile(lines.join("\n"), "neurolab_spectrum.csv", "text/csv");
    log("Exported Welch PSD as CSV", "ok");
  };
  window.exportBandPower = function () {
    if (!STATE.stages.raw) return;
    if (!STATE.lastBandPower) computeBandPower();
    downloadFile(JSON.stringify(STATE.lastBandPower, null, 2), "neurolab_bandpower.json", "application/json");
    log("Exported band-power JSON", "ok");
  };

  // ── HELP ──────────────────────────────────────────────────────────────────
  window.showHelp = function () { document.getElementById("helpModal").classList.add("open"); };
  window.closeHelp = function () { document.getElementById("helpModal").classList.remove("open"); };

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────
  function selectLayout(mode, index) {
    setLayout(mode);
    document.querySelectorAll(".vbtn").forEach((b, i) => b.classList.toggle("active", i === index));
  }

  const SHORTCUT_MAP = {
    'r': () => { applyPipeline(); },
    'e': () => exportCSV(),
    'w': () => exportWAV(),
    '1': () => selectLayout('stacked', 0),
    '2': () => selectLayout('overlay', 1),
    '3': () => selectLayout('spectrum', 2),
    '4': () => selectLayout('spectrogram', 3),
    ' ': () => resetZoom(),
    'a': () => addNotch(),
    'm': () => toggleAnnotMode(),
    'g': () => { switchSTab(document.querySelector('.stab:last-of-type'), 'analysis'); runEOGDetection(); },
    '?': () => showHelp(),
  };

  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if ((e.ctrlKey || e.metaKey) && e.key === "o") { e.preventDefault(); fileInput.click(); return; }
    if (e.key === "Escape") { closeHelp(); if (annotModeActive) toggleAnnotMode(); return; }
    if (!STATE.raw) return;
    const handler = SHORTCUT_MAP[e.key.toLowerCase()];
    if (handler) {
      if (e.key === ' ' || e.key === 'r' || e.key === 'R') e.preventDefault();
      handler();
    }
  });

  // ── INIT ──────────────────────────────────────────────────────────────────
  window.applyPipeline = applyPipeline;
  log("NeuroLab Pro v3.0 ready — drop a CSV or press Ctrl+O", "info");
  log("Tip: press ? for keyboard shortcuts", "info");

})();