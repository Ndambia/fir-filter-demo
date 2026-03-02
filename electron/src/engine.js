/* engine.js — NeuroLab DSP Engine v3.0 (no DOM, no Chart.js) */
(function (global) {
  "use strict";

  // ═══════════════════════════════════════════════════════════════
  //  FFT  — Cooley–Tukey in-place (power-of-2)
  // ═══════════════════════════════════════════════════════════════
  function fft(re, im) {
    const n = re.length;
    if (n <= 1) return;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wRe = Math.cos(ang), wIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let curRe = 1, curIm = 0;
        for (let j = 0; j < len / 2; j++) {
          const uR = re[i + j], uI = im[i + j];
          const vR = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
          const vI = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
          re[i + j] = uR + vR; im[i + j] = uI + vI;
          re[i + j + len / 2] = uR - vR; im[i + j + len / 2] = uI - vI;
          const nr = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = nr;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  WINDOWING
  // ═══════════════════════════════════════════════════════════════
  function hannWindow(n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    return w;
  }

  // ═══════════════════════════════════════════════════════════════
  //  FFT SPECTRUM  (simple, rectangular window)
  // ═══════════════════════════════════════════════════════════════
  function computeSpectrum(signal, fs) {
    let n = 1;
    while (n < signal.length) n <<= 1;
    n = Math.min(n, 32768);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const win = hannWindow(n);
    for (let i = 0; i < n; i++) re[i] = (i < signal.length ? signal[i] : 0) * win[i];
    fft(re, im);
    const mag = new Float64Array(n / 2);
    const freqs = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / (n / 2);
      freqs[i] = (i * fs) / n;
    }
    return { mag, freqs };
  }

  // ═══════════════════════════════════════════════════════════════
  //  WELCH PSD  — averaged periodogram
  // ═══════════════════════════════════════════════════════════════
  function welchPSD(signal, fs, winSize) {
    winSize = winSize || 1024;
    let n = 1;
    while (n < winSize) n <<= 1;
    winSize = n;
    const hop = Math.floor(winSize / 2);
    const win = hannWindow(winSize);
    const psd = new Float64Array(winSize / 2);
    const freqs = new Float64Array(winSize / 2);
    let count = 0;
    let start = 0;
    while (start + winSize <= signal.length) {
      const re = new Float64Array(winSize);
      const im = new Float64Array(winSize);
      let wsum = 0;
      for (let i = 0; i < winSize; i++) {
        re[i] = signal[start + i] * win[i];
        wsum += win[i] * win[i];
      }
      fft(re, im);
      for (let i = 0; i < winSize / 2; i++) {
        psd[i] += (re[i] * re[i] + im[i] * im[i]) / (fs * wsum);
      }
      count++;
      start += hop;
    }
    if (count === 0) return computeSpectrum(signal, fs); // fallback
    for (let i = 0; i < winSize / 2; i++) {
      psd[i] /= count;
      freqs[i] = (i * fs) / winSize;
    }
    // Convert to dB magnitude for charting
    const mag = new Float64Array(winSize / 2);
    for (let i = 0; i < winSize / 2; i++) mag[i] = Math.sqrt(psd[i]);
    return { mag, freqs, psd };
  }

  // ═══════════════════════════════════════════════════════════════
  //  SPECTROGRAM  — Short-Time FFT matrix
  // ═══════════════════════════════════════════════════════════════
  function computeSpectrogram(signal, fs, winSize, hopSize) {
    winSize = winSize || 256;
    let n = 1;
    while (n < winSize) n <<= 1;
    winSize = n;
    hopSize = hopSize || Math.floor(winSize / 4);
    const win = hannWindow(winSize);
    const frames = [];
    const times = [];
    let start = 0;
    while (start + winSize <= signal.length) {
      const re = new Float64Array(winSize);
      const im = new Float64Array(winSize);
      for (let i = 0; i < winSize; i++) re[i] = signal[start + i] * win[i];
      fft(re, im);
      const frame = new Float64Array(winSize / 2);
      for (let i = 0; i < winSize / 2; i++) {
        frame[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / winSize;
      }
      frames.push(frame);
      times.push((start + winSize / 2) / fs);
      start += hopSize;
    }
    const freqs = new Float64Array(winSize / 2);
    for (let i = 0; i < winSize / 2; i++) freqs[i] = (i * fs) / winSize;
    return { frames, times, freqs, winSize, hopSize };
  }

  // ═══════════════════════════════════════════════════════════════
  //  BAND POWER
  // ═══════════════════════════════════════════════════════════════
  const EEG_BANDS = {
    delta: [0.5, 4],
    theta: [4, 8],
    alpha: [8, 13],
    beta: [13, 30],
    gamma: [30, 100],
  };

  function bandPower(signal, fs, bands) {
    bands = bands || EEG_BANDS;
    const { psd, freqs } = welchPSD(signal, fs, Math.min(signal.length, 2048));
    const result = {};
    let totalPower = 0;
    const df = freqs[1] - freqs[0];

    // Total power (0.5 Hz to Nyquist)
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i] >= 0.5) totalPower += (psd[i] || 0) * df;
    }

    for (const [name, [flo, fhi]] of Object.entries(bands)) {
      let bp = 0;
      for (let i = 0; i < freqs.length; i++) {
        if (freqs[i] >= flo && freqs[i] < fhi) bp += (psd[i] || 0) * df;
      }
      result[name] = { absolute: bp, relative: totalPower > 0 ? bp / totalPower : 0 };
    }
    result._total = totalPower;
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  RMS ENVELOPE
  // ═══════════════════════════════════════════════════════════════
  function rmsEnvelope(signal, windowSamples) {
    windowSamples = Math.max(2, windowSamples | 0);
    const out = new Float64Array(signal.length);
    // Running sum of squares
    let sumSq = 0;
    for (let i = 0; i < signal.length; i++) {
      sumSq += signal[i] * signal[i];
      if (i >= windowSamples) sumSq -= signal[i - windowSamples] * signal[i - windowSamples];
      const w = Math.min(i + 1, windowSamples);
      out[i] = Math.sqrt(sumSq / w);
    }
    return out;
  }

  // ═══════════════════════════════════════════════════════════════
  //  R-PEAK DETECTION  (Pan–Tompkins simplified)
  // ═══════════════════════════════════════════════════════════════
  function detectRPeaks(signal, fs) {
    const n = signal.length;
    if (n < 10) return { peaks: [], bpm: 0, hrv: 0, rr: [] };

    // 1) Band-pass  5–15 Hz (approximate via difference of MAs)
    const winLo = Math.round(0.12 * fs); // ~120ms → low-freq baseline
    const winHi = Math.round(0.04 * fs); // ~40ms  → high-freq MA

    function ma(sig, w) {
      w = Math.max(1, w);
      const out = new Float64Array(sig.length);
      let s = 0;
      for (let i = 0; i < sig.length; i++) {
        s += sig[i];
        if (i >= w) s -= sig[i - w];
        out[i] = s / Math.min(i + 1, w);
      }
      return out;
    }

    const lo = ma(signal, winLo);
    const hi = ma(signal, winHi);
    const diff = new Float64Array(n);
    for (let i = 0; i < n; i++) diff[i] = hi[i] - lo[i];

    // 2) Square
    const sq = new Float64Array(n);
    for (let i = 0; i < n; i++) sq[i] = diff[i] * diff[i];

    // 3) Integration window 150ms
    const intWin = Math.round(0.15 * fs);
    const integrated = ma(sq, intWin);

    // 4) Adaptive threshold (mean * 0.5)
    let sum = 0; for (const v of integrated) sum += v;
    let threshold = (sum / n) * 0.5;

    // 5) Find peaks: must be above threshold and local max in 200ms window
    const refractorySamples = Math.round(0.2 * fs);
    const peaks = [];
    let lastPeak = -refractorySamples;

    for (let i = 1; i < n - 1; i++) {
      if (integrated[i] > threshold &&
        integrated[i] > integrated[i - 1] &&
        integrated[i] > integrated[i + 1] &&
        (i - lastPeak) > refractorySamples) {
        // Refine: find max of original signal in ±50ms window
        const lo2 = Math.max(0, i - Math.round(0.05 * fs));
        const hi2 = Math.min(n - 1, i + Math.round(0.05 * fs));
        let maxIdx = lo2;
        for (let j = lo2; j <= hi2; j++) {
          if (Math.abs(signal[j]) > Math.abs(signal[maxIdx])) maxIdx = j;
        }
        peaks.push(maxIdx);
        lastPeak = maxIdx;
      }
    }

    // 6) HRV and BPM from RR intervals
    const rr = [];
    for (let i = 1; i < peaks.length; i++) {
      rr.push((peaks[i] - peaks[i - 1]) / fs * 1000); // ms
    }
    const bpm = rr.length > 0 ? 60000 / (rr.reduce((a, b) => a + b, 0) / rr.length) : 0;

    // RMSSD (HRV)
    let rmssd = 0;
    if (rr.length > 1) {
      let ssd = 0;
      for (let i = 1; i < rr.length; i++) ssd += (rr[i] - rr[i - 1]) ** 2;
      rmssd = Math.sqrt(ssd / (rr.length - 1));
    }

    return { peaks, bpm, hrv: rmssd, rr };
  }

  // ═══════════════════════════════════════════════════════════════
  //  LTTB DOWNSAMPLE  (Largest Triangle Three Buckets)
  // ═══════════════════════════════════════════════════════════════
  function lttbDownsample(data, threshold) {
    const n = data.length;
    if (threshold >= n || threshold <= 2) return data;

    const sampled = new Float64Array(threshold);
    const sampledIdx = new Int32Array(threshold);

    // Always include first and last
    sampled[0] = data[0];
    sampledIdx[0] = 0;
    sampled[threshold - 1] = data[n - 1];
    sampledIdx[threshold - 1] = n - 1;

    const bucketSize = (n - 2) / (threshold - 2);
    let a = 0;

    for (let i = 0; i < threshold - 2; i++) {
      const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
      const avgRangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
      let avgX = 0, avgY = 0;
      const avgCount = avgRangeEnd - avgRangeStart;
      for (let j = avgRangeStart; j < avgRangeEnd; j++) { avgX += j; avgY += data[j]; }
      avgX /= avgCount; avgY /= avgCount;

      const rangeStart = Math.floor(i * bucketSize) + 1;
      const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n);

      let maxArea = -1, nextA = rangeStart;
      for (let j = rangeStart; j < rangeEnd; j++) {
        const area = Math.abs((a - avgX) * (data[j] - data[a]) - (a - j) * (avgY - data[a]));
        if (area > maxArea) { maxArea = area; nextA = j; }
      }
      sampled[i + 1] = data[nextA];
      sampledIdx[i + 1] = nextA;
      a = nextA;
    }
    return { sampled, sampledIdx };
  }

  // ═══════════════════════════════════════════════════════════════
  //  FILTERS
  // ═══════════════════════════════════════════════════════════════
  function movingAverage(data, w) {
    if (w <= 1) return new Float64Array(data);
    const out = new Float64Array(data.length);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
      if (i >= w) sum -= data[i - w];
      out[i] = sum / Math.min(i + 1, w);
    }
    return out;
  }

  function butterworthLP(fc, fs, order) {
    const sections = [];
    const numSections = Math.ceil(order / 2);
    const wc = Math.tan(Math.PI * fc / fs);
    for (let k = 1; k <= numSections; k++) {
      if (order % 2 === 1 && k === numSections) {
        const b0 = wc / (1 + wc), b1 = b0, a1 = -(1 - wc) / (1 + wc);
        sections.push({ b0, b1, b2: 0, a1, a2: 0, order1: true });
      } else {
        const theta = Math.PI * (2 * k - 1) / (2 * order);
        const Q = 1 / (2 * Math.cos(theta));
        const denom = 1 + wc / Q + wc * wc;
        const b0 = (wc * wc) / denom, b1 = 2 * b0, b2 = b0;
        const a1 = 2 * (wc * wc - 1) / denom;
        const a2 = (1 - wc / Q + wc * wc) / denom;
        sections.push({ b0, b1, b2, a1, a2, order1: false });
      }
    }
    return sections;
  }

  function butterworthHP(fc, fs, order) {
    const sections = [];
    const numSections = Math.ceil(order / 2);
    const wc = Math.tan(Math.PI * fc / fs);
    for (let k = 1; k <= numSections; k++) {
      if (order % 2 === 1 && k === numSections) {
        const b0 = 1 / (1 + wc), b1 = -b0, a1 = (wc - 1) / (wc + 1);
        sections.push({ b0, b1, b2: 0, a1, a2: 0, order1: true });
      } else {
        const theta = Math.PI * (2 * k - 1) / (2 * order);
        const Q = 1 / (2 * Math.cos(theta));
        const denom = 1 + wc / Q + wc * wc;
        const b0 = 1 / denom, b1 = -2 / denom, b2 = b0;
        const a1 = 2 * (wc * wc - 1) / denom;
        const a2 = (1 - wc / Q + wc * wc) / denom;
        sections.push({ b0, b1, b2, a1, a2, order1: false });
      }
    }
    return sections;
  }

  function applyBiquadCascade(data, sections) {
    let out = new Float64Array(data);
    for (const s of sections) {
      const buf = new Float64Array(out.length);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      if (s.order1) {
        for (let i = 0; i < out.length; i++) {
          const x0 = out[i];
          const y0 = s.b0 * x0 + s.b1 * x1 - s.a1 * y1;
          buf[i] = y0; x1 = x0; y1 = y0;
        }
      } else {
        for (let i = 0; i < out.length; i++) {
          const x0 = out[i];
          const y0 = s.b0 * x0 + s.b1 * x1 + s.b2 * x2 - s.a1 * y1 - s.a2 * y2;
          buf[i] = y0; x2 = x1; x1 = x0; y2 = y1; y1 = y0;
        }
      }
      out = buf;
    }
    return out;
  }

  // Zero-phase (forward + backward) IIR
  function applyBiquadZeroPhase(data, sections) {
    const forward = applyBiquadCascade(data, sections);
    const reversed = forward.slice().reverse();
    const back = applyBiquadCascade(reversed, sections);
    return back.reverse();
  }

  class NotchFilter {
    constructor(f0, fs, Q) {
      const w0 = 2 * Math.PI * f0 / fs;
      const alpha = Math.sin(w0) / (2 * Q);
      const a0 = 1 + alpha;
      this.b0 = 1 / a0;
      this.b1 = (-2 * Math.cos(w0)) / a0;
      this.b2 = 1 / a0;
      this.a1 = (-2 * Math.cos(w0)) / a0;
      this.a2 = (1 - alpha) / a0;
      this.x1 = this.x2 = this.y1 = this.y2 = 0;
    }
    process(x0) {
      const y0 = this.b0 * x0 + this.b1 * this.x1 + this.b2 * this.x2
        - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1; this.x1 = x0;
      this.y2 = this.y1; this.y1 = y0;
      return y0;
    }
    static apply(data, f0, fs, Q, passes = 1) {
      let arr = new Float64Array(data);
      for (let p = 0; p < passes; p++) {
        const f = new NotchFilter(f0, fs, Q);
        for (let i = 0; i < arr.length; i++) arr[i] = f.process(arr[i]);
      }
      return arr;
    }
  }

  function detrend(data, mode) {
    const out = new Float64Array(data);
    if (mode === "mean") {
      let sum = 0; for (const v of out) sum += v;
      const m = sum / out.length;
      for (let i = 0; i < out.length; i++) out[i] -= m;
    } else if (mode === "linear") {
      const n = out.length, xm = (n - 1) / 2;
      let ym = 0, ssxx = 0, ssxy = 0;
      for (let i = 0; i < n; i++) ym += out[i] / n;
      for (let i = 0; i < n; i++) {
        const dx = i - xm; ssxx += dx * dx; ssxy += dx * (out[i] - ym);
      }
      const slope = ssxy / ssxx, intercept = ym - slope * xm;
      for (let i = 0; i < n; i++) out[i] -= slope * i + intercept;
    } else if (mode === "median") {
      const tmp = Array.from(out).sort((a, b) => a - b);
      const med = tmp[Math.floor(tmp.length / 2)];
      for (let i = 0; i < out.length; i++) out[i] -= med;
    }
    return out;
  }

  // ═══════════════════════════════════════════════════════════════
  //  METRICS
  // ═══════════════════════════════════════════════════════════════
  function calcStats(arr) {
    const n = arr.length;
    let min = Infinity, max = -Infinity, sum = 0, sum2 = 0;
    for (const v of arr) {
      if (v < min) min = v; if (v > max) max = v;
      sum += v; sum2 += v * v;
    }
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    const rms = Math.sqrt(sum2 / n);
    // Percentiles
    const sorted = Array.from(arr).sort((a, b) => a - b);
    const p25 = sorted[Math.floor(n * 0.25)];
    const p75 = sorted[Math.floor(n * 0.75)];
    const p50 = sorted[Math.floor(n * 0.50)];
    return { min, max, mean, std, rms, n, p25, p50, p75 };
  }

  function calcSNR(rawArr, filtArr) {
    const noise = new Float64Array(rawArr.length);
    for (let i = 0; i < rawArr.length; i++) noise[i] = rawArr[i] - filtArr[i];
    const sRMS = calcStats(filtArr).rms;
    const nRMS = calcStats(noise).rms;
    if (nRMS < 1e-10) return 99;
    return 20 * Math.log10(sRMS / nRMS);
  }

  // ═══════════════════════════════════════════════════════════════
  //  WAV EXPORT  (16-bit PCM)
  // ═══════════════════════════════════════════════════════════════
  function encodeWav(signal, fs) {
    const numSamples = signal.length;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = fs * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = numSamples * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);
    const write = (pos, str) => { for (let i = 0; i < str.length; i++) view.setUint8(pos + i, str.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true);
    write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, fs, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    write(36, 'data'); view.setUint32(40, dataSize, true);
    // Normalise to [-1, 1] then scale to int16
    let mx = 0; for (const v of signal) { const a = Math.abs(v); if (a > mx) mx = a; }
    const scale = mx > 0 ? 32767 / mx : 1;
    for (let i = 0; i < numSamples; i++) {
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(signal[i] * scale))), true);
    }
    return buf;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CSV PARSING + Fs ESTIMATION
  // ═══════════════════════════════════════════════════════════════
  const STD_RATES = [50, 100, 128, 200, 250, 256, 500, 512, 1000, 1024, 1250, 2000, 2048, 4000, 4096, 5000, 8000, 10000, 12000, 16000, 20000, 22050, 44100, 48000, 96000, 192000];

  function snapDist(fs) {
    let best = STD_RATES[0];
    for (const r of STD_RATES) if (Math.abs(r - fs) < Math.abs(best - fs)) best = r;
    return { snapped: best, relErr: Math.abs(best - fs) / fs };
  }

  function parseSignal(text) {
    // Normalise line endings
    const allLines = text.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n")
      .split("\n").filter(l => l.trim() && !l.startsWith("#"));
    if (allLines.length === 0) throw new Error("No rows found");

    // Detect separator: use whichever of comma/tab/semicolon appears most in first line
    const first = allLines[0];
    const sepCandidates = [",", "\t", ";", " "];
    const sep = sepCandidates.reduce((best, s) =>
      (first.split(s).length > first.split(best).length ? s : best), ",");
    const splitLine = l => l.split(sep).map(s => s.trim());

    const firstParts = splitLine(first).filter(Boolean);
    const hasHeader = firstParts.some(p => isNaN(Number(p)) || p === "");
    const dataLines = hasHeader ? allLines.slice(1) : allLines;

    // -- Column detection --
    // Column name keywords (in priority order)
    const TIME_KWS = ["timestamp", "time", "t_s", "t_ms", "t_us", "time_s", "time_ms", "time_us", "ts", "stamp", "sample_time", "s"];
    const SIGNAL_KWS = ["emg", "ecg", "eeg", "eog", "adc", "val", "value", "signal", "voltage", "amplitude", "data", "ch0", "ch1", "ch2", "raw", "sensor"];
    const SKIP_KWS = ["label", "class", "target", "annotation", "marker", "flag", "event", "category", "id", "index", "tag"];

    let tsCol = -1, valCol = -1, detectedNames = {};

    if (hasHeader) {
      const hdr = firstParts.map(p => p.toLowerCase().trim());

      // Find timestamp column
      for (const kw of TIME_KWS) {
        const i = hdr.findIndex(h => h === kw || h.startsWith(kw) || h.endsWith(kw) || h.includes(kw));
        if (i >= 0) { tsCol = i; break; }
      }

      // Find signal column — skip time column AND skip-keyword columns
      const skipSet = new Set(hdr.map((h, i) => {
        if (SKIP_KWS.some(k => h.includes(k))) return i;
        return -1;
      }).filter(i => i >= 0));

      for (const kw of SIGNAL_KWS) {
        const i = hdr.findIndex((h, idx) => idx !== tsCol && !skipSet.has(idx) &&
          (h === kw || h.startsWith(kw) || h.includes(kw)));
        if (i >= 0) { valCol = i; break; }
      }

      // Fallbacks: pick first non-time, non-skip numeric-looking column
      if (tsCol === -1) tsCol = 0;
      if (valCol === -1) {
        // Scan actual data to find first column that has non-zero variance (real signal)
        const nCheck = Math.min(50, dataLines.length);
        const nCols = firstParts.length;
        let bestVar = -1;
        for (let c = 0; c < nCols; c++) {
          if (c === tsCol || skipSet.has(c)) continue;
          const samples = [];
          for (let r = 0; r < nCheck; r++) {
            const parts = splitLine(dataLines[r]).filter((_, i2) => true);
            const v = parseFloat(parts[c]);
            if (!isNaN(v)) samples.push(v);
          }
          if (samples.length < 2) continue;
          const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
          const variance = samples.reduce((a, v) => a + (v - mean) ** 2, 0) / samples.length;
          if (variance > bestVar) { bestVar = variance; valCol = c; }
        }
        if (valCol === -1) valCol = tsCol === 0 ? 1 : 0;
      }
      detectedNames = { ts: firstParts[tsCol] || "col" + tsCol, val: firstParts[valCol] || "col" + valCol };
    } else {
      // No header: single column = signal; two columns = time,signal; more = time,signal,...
      const nCols = firstParts.length;
      if (nCols === 1) { tsCol = -1; valCol = 0; }   // pure signal column
      else { tsCol = 0; valCol = 1; }
      detectedNames = { ts: "col" + tsCol, val: "col" + valCol };
    }

    // -- Parse rows --
    const values = [], timestamps = [];
    for (const line of dataLines) {
      if (!line.trim()) continue;
      const parts = splitLine(line);
      const val = valCol >= 0 && parts.length > valCol ? parseFloat(parts[valCol]) : NaN;
      if (isNaN(val)) continue;
      values.push(val);
      const ts = tsCol >= 0 && parts.length > tsCol ? parseFloat(parts[tsCol]) : NaN;
      if (!isNaN(ts)) timestamps.push(ts);
    }

    if (values.length === 0) throw new Error("No numeric signal data found in column '" + (detectedNames.val) + "'. Check your CSV format.");

    // Normalise timestamps to start from 0
    let tsArr = null;
    if (timestamps.length === values.length && timestamps.length > 2) {
      const t0 = timestamps[0];
      tsArr = new Float64Array(timestamps.map(t => t - t0));
    }

    return {
      raw: new Float64Array(values),
      timestamps: tsArr,
      hasHeader,
      headerCols: hasHeader ? firstParts.map(p => p.toLowerCase()) : null,
      detectedNames,   // { ts: "timestamp", val: "emg" }
      tsCol, valCol,
    };
  }

  function estimateFs(timestamps, defaultFs = 2000) {
    if (!timestamps || timestamps.length < 3) return { fs: defaultFs, autoDetected: false, note: "No timestamps" };
    const diffs = [];
    const maxDiffs = Math.min(timestamps.length - 1, 5000);
    for (let i = 1; i <= maxDiffs; i++) {
      const dt = timestamps[i] - timestamps[i - 1];
      if (dt > 0) diffs.push(dt);
    }
    if (diffs.length === 0) return { fs: defaultFs, autoDetected: false, note: "Non-increasing timestamps" };
    diffs.sort((a, b) => a - b);
    const medDt = diffs[Math.floor(diffs.length / 2)];
    const candidates = [
      { unit: "s", fsRaw: 1 / medDt },
      { unit: "ms", fsRaw: 1 / (medDt * 1e-3) },
      { unit: "μs", fsRaw: 1 / (medDt * 1e-6) },
    ].filter(c => c.fsRaw >= 10 && c.fsRaw <= 500000)
      .map(c => ({ ...c, ...snapDist(c.fsRaw) }))
      .sort((a, b) => a.relErr - b.relErr);
    if (!candidates.length) return { fs: defaultFs, autoDetected: false, note: "Out of range" };
    const best = candidates[0];
    const usedFs = best.relErr < 0.10 ? best.snapped : Math.round(best.fsRaw);
    return { fs: Math.max(10, Math.min(500000, usedFs)), autoDetected: true, medDt, unit: best.unit, snapped: best.snapped, relErr: best.relErr };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PIPELINE
  // ═══════════════════════════════════════════════════════════════
  function runPipeline(raw, fs, config) {
    const stages = {};
    const order = [];
    stages.raw = raw;
    order.push("raw");
    let current = new Float64Array(raw);

    if (config?.ma?.enabled) {
      current = movingAverage(current, Math.max(1, config.ma.window | 0));
      stages.ma = new Float64Array(current); order.push("ma");
    }
    if (config?.hp?.enabled) {
      const fc = +config.hp.fc, ord = Math.max(1, config.hp.order | 0);
      if (fc > 0 && fc < fs / 2) {
        const sects = butterworthHP(fc, fs, ord);
        current = config.hp.zeroPhase ? applyBiquadZeroPhase(current, sects) : applyBiquadCascade(current, sects);
        stages.hp = new Float64Array(current); order.push("hp");
      }
    }
    if (config?.lp?.enabled) {
      const fc = +config.lp.fc, ord = Math.max(1, config.lp.order | 0);
      if (fc > 0 && fc < fs / 2) {
        const sects = butterworthLP(fc, fs, ord);
        current = config.lp.zeroPhase ? applyBiquadZeroPhase(current, sects) : applyBiquadCascade(current, sects);
        stages.lp = new Float64Array(current); order.push("lp");
      }
    }
    if (Array.isArray(config?.notches)) {
      for (const n of config.notches) {
        if (!n.enabled) continue;
        const f0 = +n.f0, Q = +n.Q, passes = Math.max(1, n.passes | 0);
        if (f0 > 0 && f0 < fs / 2) {
          current = NotchFilter.apply(current, f0, fs, Q, passes);
          const key = `notch_${n.id ?? f0}`;
          stages[key] = new Float64Array(current); order.push(key);
        }
      }
    }
    if (config?.baseline?.enabled) {
      current = detrend(current, config.baseline.mode || "mean");
      stages.bl = new Float64Array(current); order.push("bl");
    }

    stages.final = new Float64Array(current);
    order.push("final");

    const snr = calcSNR(raw, stages.final);
    const statsRaw = calcStats(raw);
    const statsFinal = calcStats(stages.final);

    return { stages, order, metrics: { snr, statsRaw, statsFinal } };
  }

  // ═══════════════════════════════════════════════════════════════
  //  EXPORT
  // ═══════════════════════════════════════════════════════════════
  global.NeuroLabEngine = {
    // Core
    parseSignal, estimateFs, runPipeline,
    // Spectrum
    computeSpectrum, welchPSD, computeSpectrogram,
    // Analysis
    bandPower, rmsEnvelope, detectRPeaks, lttbDownsample,
    // Metrics
    calcStats, calcSNR,
    // Audio
    encodeWav,
    // Constants
    EEG_BANDS,
  };
})(window);