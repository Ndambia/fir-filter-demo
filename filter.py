import numpy as np
import matplotlib.pyplot as plt
from scipy import signal
import os
import shutil

# ========== CONSTANTS ==========
OUTPUT_BASE_DIR = 'filter_demo_plots'
SAMPLE_DATA_DIR = 'sample_data'

# Plot colors
COLOR_NOISY = '#e74c3c'
COLOR_FILTERED = '#2ecc71'
COLOR_FILTER = '#3498db'


# ========== PLOTTING HELPERS ==========
def save_plot(output_dir, filename, xlabel='Time (s)', ylabel='Amplitude', title='',
              figsize=(10, 6), xlim=None, ylim=None):
    """Apply common formatting and save the current figure."""
    plt.xlabel(xlabel, fontsize=12)
    plt.ylabel(ylabel, fontsize=12)
    plt.title(title, fontsize=14, fontweight='bold')
    if xlim:
        plt.xlim(xlim)
    if ylim:
        plt.ylim(ylim)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    path = os.path.join(output_dir, filename)
    plt.savefig(path, dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()


def compute_spectrum(sig, fs):
    """Compute frequency spectrum of a signal (positive frequencies only)."""
    n = len(sig)
    fft_vals = np.fft.fft(sig)
    fft_freq = np.fft.fftfreq(n, 1 / fs)

    pos_mask = fft_freq > 0
    freqs = fft_freq[pos_mask]
    mags = np.abs(fft_vals[pos_mask]) * 2 / n  # Normalize
    return freqs, mags


# ========== DEMO GENERATOR ==========
def run_modality_demo(modality, fs, duration, lowcut, highcut, numtaps,
                      useful_components, noise_components):
    output_dir = os.path.join(OUTPUT_BASE_DIR, modality)
    os.makedirs(output_dir, exist_ok=True)
    plt.style.use('seaborn-v0_8-darkgrid')

    # ── GENERATE SYNTHETIC SIGNAL ──
    t = np.linspace(0, duration, int(fs * duration), endpoint=False)

    signal_clean = np.zeros_like(t)
    useful_desc = []
    for freq, amp in useful_components:
        signal_clean += amp * np.sin(2 * np.pi * freq * t)
        useful_desc.append(f"{freq} Hz")

    signal_noisy = np.copy(signal_clean)
    noise_desc = []
    for freq, amp in noise_components:
        if freq == 'random':
            signal_noisy += amp * np.random.randn(len(t))
            noise_desc.append("Random Noise")
        else:
            signal_noisy += amp * np.sin(2 * np.pi * freq * t)
            noise_desc.append(f"{freq} Hz")

    # ── DESIGN FIR BANDPASS FILTER ──
    fir_coeffs = signal.firwin(
        numtaps,
        [lowcut, highcut],
        pass_zero=False,
        fs=fs,
        window='hamming'
    )

    # Apply filter (zero-phase filtering)
    signal_filtered = signal.filtfilt(fir_coeffs, 1.0, signal_noisy)

    # ── EXPORT CSV FOR NEUROLAB PRO ──
    os.makedirs(SAMPLE_DATA_DIR, exist_ok=True)
    csv_path = os.path.join(SAMPLE_DATA_DIR, f'{modality}_sample.csv')
    with open(csv_path, 'w') as f:
        f.write('timestamp,signal\n')
        for i in range(len(t)):
            f.write(f'{t[i]:.6f},{signal_noisy[i]:.6f}\n')
    print(f"  ✓ CSV saved: {csv_path}")

    # ── COMPUTE FREQUENCY SPECTRA ──
    freq_noisy, mag_noisy = compute_spectrum(signal_noisy, fs)
    freq_filtered, mag_filtered = compute_spectrum(signal_filtered, fs)

    # Compute filter frequency response
    w, h = signal.freqz(fir_coeffs, 1, worN=8000, fs=fs)

    # Shorthand for time-domain slicing
    display_samples = min(int(fs * 2.5), len(t))  # Show 2.5 seconds
    t_disp = t[:display_samples]
    noisy_disp = signal_noisy[:display_samples]
    filtered_disp = signal_filtered[:display_samples]

    # ── PLOT 1: NOISY SIGNAL (TIME DOMAIN) ──
    plt.figure(figsize=(10, 6))
    plt.plot(t_disp, noisy_disp, linewidth=1.5, color=COLOR_NOISY, alpha=0.8)
    save_plot(output_dir, f'01_{modality}_noisy_time.png', title=f'{modality} Noisy Signal (Time Domain)')

    # ── PLOT 2: FILTERED SIGNAL (TIME DOMAIN) ──
    plt.figure(figsize=(10, 6))
    plt.plot(t_disp, filtered_disp, linewidth=1.5, color=COLOR_FILTERED, alpha=0.8)
    save_plot(output_dir, f'02_{modality}_filtered_time.png', title=f'{modality} Filtered Signal (Time Domain)')

    # ── PLOT 3: COMPARISON (TIME DOMAIN) ──
    plt.figure(figsize=(12, 6))
    plt.plot(t_disp, noisy_disp, linewidth=1.5, color=COLOR_NOISY, alpha=0.6, label='Noisy Signal')
    plt.plot(t_disp, filtered_disp, linewidth=1.5, color=COLOR_FILTERED, alpha=0.8, label='Filtered Signal')
    plt.legend(fontsize=11)
    save_plot(output_dir, f'03_{modality}_comparison_time.png', title=f'{modality} Signal Comparison (Time Domain)')

    # ── PLOT 4: NOISY SIGNAL (FREQUENCY DOMAIN) ──
    plt.figure(figsize=(10, 6))
    plt.plot(freq_noisy, mag_noisy, linewidth=1.5, color=COLOR_NOISY, alpha=0.8)
    plt.axvspan(lowcut, highcut, alpha=0.2, color='green', label=f'Passband ({lowcut}–{highcut} Hz)')
    plt.legend(fontsize=11)
    plot_xlim = (0, fs / 4)
    save_plot(output_dir, f'04_{modality}_noisy_freq.png', xlabel='Frequency (Hz)', ylabel='Magnitude',
              title=f'{modality} Noisy Signal (Frequency Domain)', xlim=plot_xlim)

    # ── PLOT 5: FILTERED SIGNAL (FREQUENCY DOMAIN) ──
    plt.figure(figsize=(10, 6))
    plt.plot(freq_filtered, mag_filtered, linewidth=1.5, color=COLOR_FILTERED, alpha=0.8)
    plt.axvspan(lowcut, highcut, alpha=0.2, color='green', label=f'Passband ({lowcut}–{highcut} Hz)')
    plt.legend(fontsize=11)
    save_plot(output_dir, f'05_{modality}_filtered_freq.png', xlabel='Frequency (Hz)', ylabel='Magnitude',
              title=f'{modality} Filtered Signal (Frequency Domain)', xlim=plot_xlim)

    # ── PLOT 6: COMPARISON (FREQUENCY DOMAIN) ──
    plt.figure(figsize=(12, 6))
    plt.plot(freq_noisy, mag_noisy, linewidth=1.5, color=COLOR_NOISY, alpha=0.6, label='Noisy Signal')
    plt.plot(freq_filtered, mag_filtered, linewidth=1.5, color=COLOR_FILTERED, alpha=0.8, label='Filtered Signal')
    plt.axvspan(lowcut, highcut, alpha=0.15, color='green', label=f'Passband ({lowcut}–{highcut} Hz)')
    plt.legend(fontsize=11)
    save_plot(output_dir, f'06_{modality}_comparison_freq.png', xlabel='Frequency (Hz)', ylabel='Magnitude',
              title=f'{modality} Signal Comparison (Frequency Domain)', xlim=plot_xlim)

    # ── PLOT 7: FILTER IMPULSE RESPONSE ──
    plt.figure(figsize=(10, 6))
    plt.stem(fir_coeffs, linefmt=COLOR_FILTER, markerfmt='o', basefmt=' ')
    save_plot(output_dir, f'07_{modality}_filter_impulse.png', xlabel='Tap Number', ylabel='Coefficient Value',
              title=f'{modality} FIR Filter Impulse Response ({numtaps} taps)')


    # ── PLOT 8: FILTER FREQUENCY RESPONSE ──
    plt.figure(figsize=(10, 6))
    plt.plot(w, 20 * np.log10(np.abs(h)), linewidth=2, color=COLOR_FILTER)
    plt.axvline(lowcut, color='red', linestyle='--', alpha=0.7, linewidth=2, label='Cutoff frequencies')
    plt.axvline(highcut, color='red', linestyle='--', alpha=0.7, linewidth=2)
    plt.axhline(-3, color='gray', linestyle=':', alpha=0.6, linewidth=1.5, label='-3 dB line')
    plt.legend(fontsize=11)
    save_plot(output_dir, f'08_{modality}_filter_freq_response.png', xlabel='Frequency (Hz)', ylabel='Gain (dB)',
              title=f'{modality} Filter Frequency Response', xlim=plot_xlim, ylim=(-80, 5))

    # ── PLOT 9: COMPREHENSIVE OVERVIEW (ALL IN ONE) ──
    fig = plt.figure(figsize=(16, 10))
    fig.suptitle(f'{modality} FIR Bandpass Filter — Complete Analysis ({lowcut}–{highcut} Hz)',
                 fontsize=16, fontweight='bold')

    # Row 1: Time domain
    plt.subplot(3, 3, 1)
    plt.plot(t_disp, noisy_disp, linewidth=1, color=COLOR_NOISY, alpha=0.8)
    plt.xlabel('Time (s)', fontsize=9); plt.ylabel('Amplitude', fontsize=9)
    plt.title('Noisy Signal (Time)', fontsize=10, fontweight='bold'); plt.grid(True, alpha=0.3)

    plt.subplot(3, 3, 2)
    plt.plot(t_disp, filtered_disp, linewidth=1, color=COLOR_FILTERED, alpha=0.8)
    plt.xlabel('Time (s)', fontsize=9); plt.ylabel('Amplitude', fontsize=9)
    plt.title('Filtered Signal (Time)', fontsize=10, fontweight='bold'); plt.grid(True, alpha=0.3)

    plt.subplot(3, 3, 3)
    plt.plot(t_disp, noisy_disp, linewidth=1, color=COLOR_NOISY, alpha=0.5, label='Noisy')
    plt.plot(t_disp, filtered_disp, linewidth=1, color=COLOR_FILTERED, alpha=0.8, label='Filtered')
    plt.xlabel('Time (s)', fontsize=9); plt.ylabel('Amplitude', fontsize=9)
    plt.title('Comparison (Time)', fontsize=10, fontweight='bold'); plt.legend(fontsize=8); plt.grid(True, alpha=0.3)

    # Row 2: Frequency domain
    plt.subplot(3, 3, 4)
    plt.plot(freq_noisy, mag_noisy, linewidth=1, color=COLOR_NOISY, alpha=0.8)
    plt.axvspan(lowcut, highcut, alpha=0.2, color='green')
    plt.xlabel('Frequency (Hz)', fontsize=9); plt.ylabel('Magnitude', fontsize=9)
    plt.title('Noisy Signal (Frequency)', fontsize=10, fontweight='bold'); plt.xlim(plot_xlim); plt.grid(True, alpha=0.3)

    plt.subplot(3, 3, 5)
    plt.plot(freq_filtered, mag_filtered, linewidth=1, color=COLOR_FILTERED, alpha=0.8)
    plt.axvspan(lowcut, highcut, alpha=0.2, color='green')
    plt.xlabel('Frequency (Hz)', fontsize=9); plt.ylabel('Magnitude', fontsize=9)
    plt.title('Filtered Signal (Frequency)', fontsize=10, fontweight='bold'); plt.xlim(plot_xlim); plt.grid(True, alpha=0.3)

    plt.subplot(3, 3, 6)
    plt.plot(freq_noisy, mag_noisy, linewidth=1, color=COLOR_NOISY, alpha=0.5, label='Noisy')
    plt.plot(freq_filtered, mag_filtered, linewidth=1, color=COLOR_FILTERED, alpha=0.8, label='Filtered')
    plt.axvspan(lowcut, highcut, alpha=0.15, color='green')
    plt.xlabel('Frequency (Hz)', fontsize=9); plt.ylabel('Magnitude', fontsize=9)
    plt.title('Comparison (Frequency)', fontsize=10, fontweight='bold'); plt.xlim(plot_xlim)
    plt.legend(fontsize=8); plt.grid(True, alpha=0.3)

    # Row 3: Filter characteristics + summary
    plt.subplot(3, 3, 7)
    plt.stem(fir_coeffs, linefmt=COLOR_FILTER, markerfmt='o', basefmt=' ')
    plt.xlabel('Tap Number', fontsize=9); plt.ylabel('Coefficient', fontsize=9)
    plt.title('Filter Impulse Response', fontsize=10, fontweight='bold'); plt.grid(True, alpha=0.3)

    plt.subplot(3, 3, 8)
    plt.plot(w, 20 * np.log10(np.abs(h)), linewidth=2, color=COLOR_FILTER)
    plt.axvline(lowcut, color='red', linestyle='--', alpha=0.6, linewidth=1)
    plt.axvline(highcut, color='red', linestyle='--', alpha=0.6, linewidth=1)
    plt.axhline(-3, color='gray', linestyle=':', alpha=0.6)
    plt.xlabel('Frequency (Hz)', fontsize=9); plt.ylabel('Gain (dB)', fontsize=9)
    plt.title('Filter Frequency Response', fontsize=10, fontweight='bold')
    plt.xlim(plot_xlim); plt.ylim(-80, 5); plt.grid(True, alpha=0.3)

    # Text summary panel
    plt.subplot(3, 3, 9)
    plt.axis('off')
    summary_text = f"""
{modality} FILTER SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━
Type: FIR Bandpass
Passband: {lowcut} – {highcut} Hz
Order: {numtaps} taps
Window: Hamming
Sampling Rate: {fs} Hz

SIGNAL COMPONENTS
━━━━━━━━━━━━━━━━━━━━━━
Useful: {', '.join(useful_desc)}
Noise:  {', '.join(noise_desc)}

PERFORMANCE
━━━━━━━━━━━━━━━━━━━━━━
Effective noise reduction
Zero-phase filtering
"""
    plt.text(0.1, 0.5, summary_text, fontsize=9, family='monospace',
             verticalalignment='center', bbox=dict(boxstyle='round',
             facecolor='wheat', alpha=0.3))

    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, f'09_{modality}_overview.png'),
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()

    # Calculate SNR improvement
    snr_before = 10 * np.log10(np.var(signal_clean) / np.var(signal_noisy - signal_clean))
    snr_after = 10 * np.log10(np.var(signal_clean) / np.var(signal_filtered - signal_clean))
    
    print(f"[{modality}] Filter: {lowcut}-{highcut}Hz | SNR Improved: {(snr_after - snr_before):.2f} dB")


# ========== MAIN ==========
def main():
    if os.path.exists(OUTPUT_BASE_DIR):
        shutil.rmtree(OUTPUT_BASE_DIR)
        
    print("\n" + "=" * 60)
    print("FIR BANDPASS FILTER — NEUROLAB PRO DEMONSTRATIONS")
    print("=" * 60)

    # ── 1. ECG DEMONSTRATION ──
    # Useful frequency range: ~0.5 to 40 Hz
    run_modality_demo(
        modality="ECG",
        fs=250, duration=5, lowcut=0.5, highcut=40.0, numtaps=151,
        useful_components=[(1.2, 1.5), (5.0, 1.0), (15.0, 0.5)],
        noise_components=[(0.1, 1.5), (60.0, 0.8), ('random', 0.2)]
    )

    # ── 2. EEG DEMONSTRATION ──
    # Useful frequency range: ~1 to 45 Hz
    run_modality_demo(
        modality="EEG",
        fs=250, duration=5, lowcut=1.0, highcut=45.0, numtaps=151,
        useful_components=[(10.0, 1.0), (22.0, 0.5)],
        noise_components=[(0.4, 1.2), (60.0, 0.8), ('random', 0.2)]
    )

    # ── 3. EMG DEMONSTRATION ──
    # Useful frequency range: ~20 to 150 Hz
    run_modality_demo(
        modality="EMG",
        fs=500, duration=5, lowcut=20.0, highcut=150.0, numtaps=151,
        useful_components=[(50.0, 1.0), (80.0, 0.8), (120.0, 0.5)],
        noise_components=[(2.0, 2.0), (200.0, 0.8), ('random', 0.3)]
    )

    print("\n" + "=" * 60)
    print(f"All 27 plots generated safely into '{OUTPUT_BASE_DIR}/' directory.")
    print("=" * 60)


if __name__ == "__main__":
    main()