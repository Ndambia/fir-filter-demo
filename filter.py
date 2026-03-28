import numpy as np
import matplotlib.pyplot as plt
from scipy import signal
import os

# ========== CONSTANTS ==========
OUTPUT_DIR = 'filter_demo_plots'
DISPLAY_SAMPLES = 400   # Number of samples shown in time-domain plots

# Signal parameters
FS = 200            # Sampling frequency (Hz)
DURATION = 5        # Duration (seconds)
NUMTAPS = 101       # Number of filter coefficients
LOWCUT = 3.0        # Low cutoff (Hz)
HIGHCUT = 30.0      # High cutoff (Hz)

# Plot colors
COLOR_NOISY = '#e74c3c'
COLOR_FILTERED = '#2ecc71'
COLOR_FILTER = '#3498db'


# ========== PLOTTING HELPERS ==========
def save_plot(filename, xlabel='Time (s)', ylabel='Amplitude', title='',
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
    path = os.path.join(OUTPUT_DIR, filename)
    plt.savefig(path, dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"✓ Saved: {filename}")


def compute_spectrum(sig, fs):
    """Compute frequency spectrum of a signal (positive frequencies only)."""
    n = len(sig)
    fft_vals = np.fft.fft(sig)
    fft_freq = np.fft.fftfreq(n, 1 / fs)

    pos_mask = fft_freq > 0
    freqs = fft_freq[pos_mask]
    mags = np.abs(fft_vals[pos_mask]) * 2 / n  # Normalize
    return freqs, mags


# ========== MAIN ==========
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    plt.style.use('seaborn-v0_8-darkgrid')

    # ── GENERATE SYNTHETIC SIGNAL ──
    t = np.linspace(0, DURATION, int(FS * DURATION), endpoint=False)

    signal_clean = (
        1.5 * np.sin(2 * np.pi * 5 * t) +      # 5 Hz component (useful)
        1.0 * np.sin(2 * np.pi * 15 * t) +     # 15 Hz component (useful)
        0.8 * np.sin(2 * np.pi * 25 * t)       # 25 Hz component (useful)
    )

    noise_high_freq = 0.5 * np.sin(2 * np.pi * 60 * t)  # 60 Hz powerline noise
    noise_low_freq = 0.3 * np.sin(2 * np.pi * 0.5 * t)  # 0.5 Hz baseline drift
    random_noise = 0.3 * np.random.randn(len(t))         # Random noise

    signal_noisy = signal_clean + noise_high_freq + noise_low_freq + random_noise

    # ── DESIGN FIR BANDPASS FILTER ──
    fir_coeffs = signal.firwin(
        NUMTAPS,
        [LOWCUT, HIGHCUT],
        pass_zero=False,
        fs=FS,
        window='hamming'
    )

    # Apply filter (zero-phase filtering)
    signal_filtered = signal.filtfilt(fir_coeffs, 1.0, signal_noisy)

    # ── COMPUTE FREQUENCY SPECTRA ──
    freq_noisy, mag_noisy = compute_spectrum(signal_noisy, FS)
    freq_filtered, mag_filtered = compute_spectrum(signal_filtered, FS)

    # Compute filter frequency response (reused in plots 8 and 9)
    w, h = signal.freqz(fir_coeffs, 1, worN=8000, fs=FS)

    # Shorthand for time-domain slicing
    t_disp = t[:DISPLAY_SAMPLES]
    noisy_disp = signal_noisy[:DISPLAY_SAMPLES]
    filtered_disp = signal_filtered[:DISPLAY_SAMPLES]

    # ── PLOT 1: NOISY SIGNAL (TIME DOMAIN) ──
    plt.figure(figsize=(10, 6))
    plt.plot(t_disp, noisy_disp, linewidth=1.5, color=COLOR_NOISY, alpha=0.8)
    save_plot('01_noisy_signal_time.png', title='Noisy Signal (Time Domain)')

    # ── PLOT 2: FILTERED SIGNAL (TIME DOMAIN) ──
    plt.figure(figsize=(10, 6))
    plt.plot(t_disp, filtered_disp, linewidth=1.5, color=COLOR_FILTERED, alpha=0.8)
    save_plot('02_filtered_signal_time.png', title='Filtered Signal (Time Domain)')

    # ── PLOT 3: COMPARISON (TIME DOMAIN) ──
    plt.figure(figsize=(12, 6))
    plt.plot(t_disp, noisy_disp, linewidth=1.5, color=COLOR_NOISY, alpha=0.6, label='Noisy Signal')
    plt.plot(t_disp, filtered_disp, linewidth=1.5, color=COLOR_FILTERED, alpha=0.8, label='Filtered Signal')
    plt.legend(fontsize=11)
    save_plot('03_comparison_time.png', title='Signal Comparison (Time Domain)')

    # ── PLOT 4: NOISY SIGNAL (FREQUENCY DOMAIN) ──
    plt.figure(figsize=(10, 6))
    plt.plot(freq_noisy, mag_noisy, linewidth=1.5, color=COLOR_NOISY, alpha=0.8)
    plt.axvspan(LOWCUT, HIGHCUT, alpha=0.2, color='green', label=f'Passband ({LOWCUT}–{HIGHCUT} Hz)')
    plt.legend(fontsize=11)
    save_plot('04_noisy_signal_freq.png', xlabel='Frequency (Hz)', ylabel='Magnitude',
              title='Noisy Signal (Frequency Domain)', xlim=(0, 80))

    # ── PLOT 5: FILTERED SIGNAL (FREQUENCY DOMAIN) ──
    plt.figure(figsize=(10, 6))
    plt.plot(freq_filtered, mag_filtered, linewidth=1.5, color=COLOR_FILTERED, alpha=0.8)
    plt.axvspan(LOWCUT, HIGHCUT, alpha=0.2, color='green', label=f'Passband ({LOWCUT}–{HIGHCUT} Hz)')
    plt.legend(fontsize=11)
    save_plot('05_filtered_signal_freq.png', xlabel='Frequency (Hz)', ylabel='Magnitude',
              title='Filtered Signal (Frequency Domain)', xlim=(0, 80))

    # ── PLOT 6: COMPARISON (FREQUENCY DOMAIN) ──
    plt.figure(figsize=(12, 6))
    plt.plot(freq_noisy, mag_noisy, linewidth=1.5, color=COLOR_NOISY, alpha=0.6, label='Noisy Signal')
    plt.plot(freq_filtered, mag_filtered, linewidth=1.5, color=COLOR_FILTERED, alpha=0.8, label='Filtered Signal')
    plt.axvspan(LOWCUT, HIGHCUT, alpha=0.15, color='green', label=f'Passband ({LOWCUT}–{HIGHCUT} Hz)')
    plt.legend(fontsize=11)
    save_plot('06_comparison_freq.png', xlabel='Frequency (Hz)', ylabel='Magnitude',
              title='Signal Comparison (Frequency Domain)', xlim=(0, 80))

    # ── PLOT 7: FILTER IMPULSE RESPONSE ──
    plt.figure(figsize=(10, 6))
    plt.stem(fir_coeffs, linefmt=COLOR_FILTER, markerfmt='o', basefmt=' ')
    save_plot('07_filter_impulse_response.png', xlabel='Tap Number', ylabel='Coefficient Value',
              title=f'FIR Filter Impulse Response ({NUMTAPS} taps)')

    # ── PLOT 8: FILTER FREQUENCY RESPONSE ──
    plt.figure(figsize=(10, 6))
    plt.plot(w, 20 * np.log10(np.abs(h)), linewidth=2, color=COLOR_FILTER)
    plt.axvline(LOWCUT, color='red', linestyle='--', alpha=0.7, linewidth=2, label='Cutoff frequencies')
    plt.axvline(HIGHCUT, color='red', linestyle='--', alpha=0.7, linewidth=2)
    plt.axhline(-3, color='gray', linestyle=':', alpha=0.6, linewidth=1.5, label='-3 dB line')
    plt.legend(fontsize=11)
    save_plot('08_filter_frequency_response.png', xlabel='Frequency (Hz)', ylabel='Gain (dB)',
              title='Filter Frequency Response', xlim=(0, 80), ylim=(-80, 5))

    # ── PLOT 9: COMPREHENSIVE OVERVIEW (ALL IN ONE) ──
    fig = plt.figure(figsize=(16, 10))
    fig.suptitle(f'FIR Bandpass Filter — Complete Analysis ({LOWCUT}–{HIGHCUT} Hz)',
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
    plt.axvspan(LOWCUT, HIGHCUT, alpha=0.2, color='green')
    plt.xlabel('Frequency (Hz)', fontsize=9); plt.ylabel('Magnitude', fontsize=9)
    plt.title('Noisy Signal (Frequency)', fontsize=10, fontweight='bold'); plt.xlim(0, 80); plt.grid(True, alpha=0.3)

    plt.subplot(3, 3, 5)
    plt.plot(freq_filtered, mag_filtered, linewidth=1, color=COLOR_FILTERED, alpha=0.8)
    plt.axvspan(LOWCUT, HIGHCUT, alpha=0.2, color='green')
    plt.xlabel('Frequency (Hz)', fontsize=9); plt.ylabel('Magnitude', fontsize=9)
    plt.title('Filtered Signal (Frequency)', fontsize=10, fontweight='bold'); plt.xlim(0, 80); plt.grid(True, alpha=0.3)

    plt.subplot(3, 3, 6)
    plt.plot(freq_noisy, mag_noisy, linewidth=1, color=COLOR_NOISY, alpha=0.5, label='Noisy')
    plt.plot(freq_filtered, mag_filtered, linewidth=1, color=COLOR_FILTERED, alpha=0.8, label='Filtered')
    plt.axvspan(LOWCUT, HIGHCUT, alpha=0.15, color='green')
    plt.xlabel('Frequency (Hz)', fontsize=9); plt.ylabel('Magnitude', fontsize=9)
    plt.title('Comparison (Frequency)', fontsize=10, fontweight='bold'); plt.xlim(0, 80)
    plt.legend(fontsize=8); plt.grid(True, alpha=0.3)

    # Row 3: Filter characteristics + summary
    plt.subplot(3, 3, 7)
    plt.stem(fir_coeffs, linefmt=COLOR_FILTER, markerfmt='o', basefmt=' ')
    plt.xlabel('Tap Number', fontsize=9); plt.ylabel('Coefficient', fontsize=9)
    plt.title('Filter Impulse Response', fontsize=10, fontweight='bold'); plt.grid(True, alpha=0.3)

    plt.subplot(3, 3, 8)
    plt.plot(w, 20 * np.log10(np.abs(h)), linewidth=2, color=COLOR_FILTER)
    plt.axvline(LOWCUT, color='red', linestyle='--', alpha=0.6, linewidth=1)
    plt.axvline(HIGHCUT, color='red', linestyle='--', alpha=0.6, linewidth=1)
    plt.axhline(-3, color='gray', linestyle=':', alpha=0.6)
    plt.xlabel('Frequency (Hz)', fontsize=9); plt.ylabel('Gain (dB)', fontsize=9)
    plt.title('Filter Frequency Response', fontsize=10, fontweight='bold')
    plt.xlim(0, 80); plt.ylim(-80, 5); plt.grid(True, alpha=0.3)

    # Text summary panel
    plt.subplot(3, 3, 9)
    plt.axis('off')
    summary_text = f"""
FILTER SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━
Type: FIR Bandpass
Passband: {LOWCUT} – {HIGHCUT} Hz
Order: {NUMTAPS} taps
Window: Hamming
Sampling Rate: {FS} Hz

SIGNAL COMPONENTS
━━━━━━━━━━━━━━━━━━━━━━
Useful: 5, 15, 25 Hz
Noise:  60 Hz, 0.5 Hz, random

PERFORMANCE
━━━━━━━━━━━━━━━━━━━━━━
Effective noise reduction
Zero-phase filtering
"""
    plt.text(0.1, 0.5, summary_text, fontsize=9, family='monospace',
             verticalalignment='center', bbox=dict(boxstyle='round',
             facecolor='wheat', alpha=0.3))

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, '09_complete_overview.png'),
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    print("✓ Saved: 09_complete_overview.png")

    # ── PRINT RESULTS ──
    # Calculate SNR improvement
    snr_before = 10 * np.log10(np.var(signal_clean) / np.var(signal_noisy - signal_clean))
    snr_after = 10 * np.log10(np.var(signal_clean) / np.var(signal_filtered - signal_clean))

    print("\n" + "=" * 60)
    print("FIR BANDPASS FILTER — DEMONSTRATION RESULTS")
    print("=" * 60)
    print(f"\n Signal Parameters:")
    print(f"   Sampling Rate: {FS} Hz")
    print(f"   Duration: {DURATION} seconds")
    print(f"   Total Samples: {len(t)}")
    print(f"\n Filter Specifications:")
    print(f"   Type: FIR Bandpass")
    print(f"   Passband: {LOWCUT} – {HIGHCUT} Hz")
    print(f"   Filter Order: {NUMTAPS}")
    print(f"   Window: Hamming")
    print(f"\n Signal Components:")
    print(f"   Useful frequencies: 5, 15, 25 Hz (preserved)")
    print(f"   Noise at 60 Hz: removed")
    print(f"   Baseline drift at 0.5 Hz: removed")
    print(f"   Random noise: attenuated")
    print(f"\n✨ Performance:")
    print(f"   SNR before filtering: {snr_before:.2f} dB")
    print(f"   SNR after filtering: {snr_after:.2f} dB")
    print(f"   SNR improvement: {snr_after - snr_before:.2f} dB")
    print(f"\n All plots saved to: '{OUTPUT_DIR}/' directory")
    print(f"   Total files: 9 individual plots")
    print("=" * 60)


if __name__ == "__main__":
    main()