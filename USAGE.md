# NeuroLab Pro: Practical Usage Guide

NeuroLab Pro is designed for researchers, engineers, and clinical enthusiasts who need to process and visualize complex biosignals without writing custom scripts every time. Below are the primary ways you can use this tool.

---

## 1. Biomedical Signal Analysis

The core of NeuroLab Pro is built for human-computer interface (HCI) and biomedical research.

### **EMG (Electromyography) - Muscle Activity**
- **Filter out noise:** Use the **Bandpass Filter (20-450 Hz)** to focus on the frequency range of muscle motor units.
- **Envelope Extraction:** Enable the **RMS Envelope** tool to visualize the "effort" of the muscle, turning raw oscillations into a smooth amplitude curve.
- **Use Case:** Mapping muscle activation for prosthetic control or sports performance analysis.

### **ECG (Electrocardiography) - Heart Rates**
- **R-Peak Detection:** Use the built-in **Pan-Tompkins Algorithm** to automatically find heartbeats.
- **BPM Tracking:** View real-time Beats Per Minute (BPM) calculations and Heart Rate Variability (HRV) metrics.
- **Noch Filtering:** Target the **50/60 Hz** powerline interference that often obscures heart signals.

### **EEG (Electroencephalography) - Brain Waves**
- **Spectral Power:** Use the **welch** method in the Spectrum tab to identify Delta, Theta, Alpha, and Beta waves.
- **Band Power:** Select specific frequency bands to calculate the relative power of brain states (e.g., focus vs. relaxation).
- **Artifact Removal:** Use high-pass filtering (0.5 Hz) to remove "baseline wander" caused by head movements or sweat.

---

## 2. DSP Engine Prototyping

If you are an engineer designing a hardware sensor, use NeuroLab Pro as your "digital twin" analyzer.

- **Offline Validation:** Record raw data from your microcontroller (ESP32, Arduino, etc.) to a SD card as a CSV, then drag it into NeuroLab Pro to find the perfect filter settings.
- **Algorithm Testing:** Compare the **Standard FFT** vs. the **Welch PSD** to see which frequency analysis method provides more stable results for your specific sensor.
- **Filter Design:** Adjust "Taps" and "Cutoff" frequencies in real-time to see how they impact your signal's signal-to-noise ratio (SNR).

---

## 3. Signal Quality & Troubleshooting

Use the tool to debug "noisy" environments during experiments.

- **Identify Interference:** Switch to **Overlay Mode** to see exactly how much noise your filters are removing from the raw signal.
- **Spectrum Analysis:** Look for sharp peaks at 50/60 Hz to confirm if your laboratory environment has poor electrical grounding.
- **Audio Diagnostic:** Use the **Export to WAV** feature to *listen* to your signals. Often, powerline hum or mechanical vibration sounds distinct and can be identified by ear.

---

## 4. Educational & Teaching Tool

NeuroLab Pro is an excellent visual aid for teaching Digital Signal Processing (DSP).

- **Visualize Downsampling:** Demonstrate how the **LTTB (Largest Triangle Three Buckets)** algorithm preserves significant signal peaks even when viewing 1,000,000+ points on a standard screen.
- **Zero-Phase Demo:** Show the difference between standard filtering (which shifts the signal in time) and **Double-Pass Zero-Phase filtering** (which keeps the timing perfect).
- **Spectrograms:** Teach students how signal frequency changes over time (e.g., a "chirp" signal or a muscle fatigue sweep).

---

## 5. Modern Research Workflow

- **Annotation:** Add time-synced markers during playback to note specific events (e.g., "Subject Sneeze" or "Stimulus Start").
- **Clean Export:** After finding the right filter settings, export the cleaned data back to **CSV** for final analysis in Python, R, or specialized ML platforms.
- **Ready for Publication:** The clean, dark-themed charts are ideal for research presentations and documentation.

---

**NeuroLab Pro v3.0** | Designed for Precision, Built for Discovery.
