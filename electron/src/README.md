#  NeuroLab Pro v3.0

**Comprehensive Biosignal Analysis & DSP Suite**

NeuroLab Pro is a high-performance web-based tool designed for real-time and post-hoc analysis of biosignals such as **EMG, ECG, EEG, and EOG**. It combines a powerful custom DSP engine with a modern, responsive UI for detailed signal examination.

![NeuroLab Overview](./Images/neurolab_Overview.png)
*Initial Workspace Layout*

---

##  Key Features

###  High-Performance DSP Engine
- **Smart Downsampling (LTTB):** Effortlessly handle datasets with hundreds of thousands of points using the Largest Triangle Three Buckets algorithm for lag-free visualization.
- **Advanced Spectral Analysis:** Implements Welch's method for Power Spectral Density (PSD) calculation, providing smoother and more accurate frequency profiles than standard FFTs.
- **Zero-Phase Filtering:** Support for forward and backward passes (Butterworth High-Pass/Low-Pass) to eliminate phase shift, critical for timing-accurate biosignal analysis.
- **Precision Notch Filters:** Target specific interference frequencies (e.g., 50/60Hz powerline noise) with adjustable Q-factors and multiple passes.
- **Time-Domain Tools:** Sliding window RMS Envelope (optimized for EMG) and Pan-Tompkins R-Peak detection (for ECG BPM/HRV).

### Advanced Visualization
- **Persistent Charting:** Custom implementation ensures chart instances are preserved across processing runs, eliminating flickers and preserving user state.
- **Multiple Layout Views:** 
    - **Stacked:** Individual stages for detailed comparison.
    - **Overlay:** High-comparision view of processing steps.
    - **Spectrum:** Comprehensive frequency domain analysis.
    - **Spectrogram:** Time-frequency heatmaps (STFT).
- **Interactive Controls:** Smooth mouse-wheel zoom, pan, and a high-precision crosshair readout showing raw, filtered, and noise delta values.

![Signal Processing View](./Images/Signal.png)
*Active EMG Analysis with Filtered Output and Frequency Content*

### 🛠️ Professional Workflow
- **Flexible CSV Parser:** Auto-detects columns, skips labels/annotations, and handles multiple separators.
- **Annotation System:** Drop time-synced markers with labels directly on the signal.
- **Comprehensive Export:** Export processed data to **CSV**, frequency data to **Spectrum CSV**, or timing/power metrics to **JSON**.
- **Audio Conversion:** Export your filtered biosignals as **16-bit PCM WAV** files for audio-based analysis.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Open / Load CSV Data |
| `R` | Re-run Signal Pipeline |
| `1` | Switch to **Stacked** View |
| `2` | Switch to **Overlay** View |
| `3` | Switch to **Spectrum** View |
| `4` | Switch to **Spectrogram** View |
| `Space` | Reset Zoom & Pan |
| `A` | Quick-add Notch Filter |
| `M` | Toggle **Annotation Mode** |
| `E` | Export Filtered CSV |
| `W` | Export Filtered WAV |
| `?` | Toggle Help Menu |

---

## Getting Started

1. **Launch:** Open `index.html` in any modern web browser.
2. **Load Data:** Drag and drop your `.csv` or `.txt` signal file onto the window.
3. **Configure:** Use the left sidebar to enable filters and adjust parameters.
4. **Analyze:** Switch to the "Analysis" tab for Band Power (EEG) or R-Peak (ECG) detection.
5. **Export:** Use the dropdown to save your results for further study.

---

## Tech Stack
- **Core:** Vanilla JavaScript (ES6+)
- **DSP Engine:** Custom `engine.js` (Zero dependencies)
- **Visualization:** [Chart.js](https://www.chartjs.org/)
- **Styling:** Dynamic CSS3 with Glassmorphism / Neon Aesthetics
- **Architecture:** PWA-ready with Service Worker for offline use.

---

Designed for Researchers, Biohackers, and Engineers. 
