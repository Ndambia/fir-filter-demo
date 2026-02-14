import numpy as np
import matplotlib.pyplot as plt
from scipy import signal
import os

# Create output directory
os.makedirs('filter_demo_plots', exist_ok=True)

# Set style for professional plots
plt.style.use('seaborn-v0_8-darkgrid')

# ========== GENERATE SYNTHETIC SIGNAL ==========
# Signal parameters
fs = 200  # Sampling frequency (Hz)
duration = 5  # Duration (seconds)
t = np.linspace(0, duration, int(fs * duration), endpoint=False)

# Create clean signal: mix of useful frequencies
signal_clean = (
    1.5 * np.sin(2 * np.pi * 5 * t) +      # 5 Hz component (useful)
    1.0 * np.sin(2 * np.pi * 15 * t) +     # 15 Hz component (useful)
    0.8 * np.sin(2 * np.pi * 25 * t)       # 25 Hz component (useful)
)

# Add noise at unwanted frequencies
noise_high_freq = 0.5 * np.sin(2 * np.pi * 60 * t)  # 60 Hz powerline noise
noise_low_freq = 0.3 * np.sin(2 * np.pi * 0.5 * t)  # 0.5 Hz baseline drift
random_noise = 0.3 * np.random.randn(len(t))         # Random noise

# Combine signal and noise
signal_noisy = signal_clean + noise_high_freq + noise_low_freq + random_noise

# ========== DESIGN FIR BANDPASS FILTER ==========
# Filter specifications
lowcut = 3.0    # Low cutoff (Hz)
highcut = 30.0  # High cutoff (Hz)
numtaps = 101   # Number of filter coefficients

# Design the filter
fir_coeffs = signal.firwin(
    numtaps, 
    [lowcut, highcut], 
    pass_zero=False,
    fs=fs, 
    window='hamming'
)

# Apply filter (zero-phase filtering)
signal_filtered = signal.filtfilt(fir_coeffs, 1.0, signal_noisy)

# ========== COMPUTE FREQUENCY SPECTRA ==========
def compute_spectrum(sig, fs):
    """Compute frequency spectrum of a signal"""
    n = len(sig)
    fft_vals = np.fft.fft(sig)
    fft_freq = np.fft.fftfreq(n, 1/fs)
    
    # Get positive frequencies only
    pos_mask = fft_freq > 0
    freqs = fft_freq[pos_mask]
    mags = np.abs(fft_vals[pos_mask]) * 2 / n  # Normalize
    
    return freqs, mags

freq_noisy, mag_noisy = compute_spectrum(signal_noisy, fs)
freq_filtered, mag_filtered = compute_spectrum(signal_filtered, fs)

# ========== PLOT 1: NOISY SIGNAL (TIME DOMAIN) ==========
plt.figure(figsize=(10, 6))
plt.plot(t[:400], signal_noisy[:400], linewidth=1.5, color='#e74c3c', alpha=0.8)
plt.xlabel('Time (s)', fontsize=12)
plt.ylabel('Amplitude', fontsize=12)
plt.title('Noisy Signal (Time Domain)', fontsize=14, fontweight='bold')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('filter_demo_plots/01_noisy_signal_time.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: 01_noisy_signal_time.png")

# ========== PLOT 2: FILTERED SIGNAL (TIME DOMAIN) ==========
plt.figure(figsize=(10, 6))
plt.plot(t[:400], signal_filtered[:400], linewidth=1.5, color='#2ecc71', alpha=0.8)
plt.xlabel('Time (s)', fontsize=12)
plt.ylabel('Amplitude', fontsize=12)
plt.title('Filtered Signal (Time Domain)', fontsize=14, fontweight='bold')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('filter_demo_plots/02_filtered_signal_time.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: 02_filtered_signal_time.png")

# ========== PLOT 3: COMPARISON (TIME DOMAIN) ==========
plt.figure(figsize=(12, 6))
plt.plot(t[:400], signal_noisy[:400], linewidth=1.5, color='#e74c3c', alpha=0.6, label='Noisy Signal')
plt.plot(t[:400], signal_filtered[:400], linewidth=1.5, color='#2ecc71', alpha=0.8, label='Filtered Signal')
plt.xlabel('Time (s)', fontsize=12)
plt.ylabel('Amplitude', fontsize=12)
plt.title('Signal Comparison (Time Domain)', fontsize=14, fontweight='bold')
plt.legend(fontsize=11)
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('filter_demo_plots/03_comparison_time.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: 03_comparison_time.png")

# ========== PLOT 4: NOISY SIGNAL (FREQUENCY DOMAIN) ==========
plt.figure(figsize=(10, 6))
plt.plot(freq_noisy, mag_noisy, linewidth=1.5, color='#e74c3c', alpha=0.8)
plt.axvspan(lowcut, highcut, alpha=0.2, color='green', label='Passband (3-30 Hz)')
plt.xlabel('Frequency (Hz)', fontsize=12)
plt.ylabel('Magnitude', fontsize=12)
plt.title('Noisy Signal (Frequency Domain)', fontsize=14, fontweight='bold')
plt.xlim(0, 80)
plt.grid(True, alpha=0.3)
plt.legend(fontsize=11)
plt.tight_layout()
plt.savefig('filter_demo_plots/04_noisy_signal_freq.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: 04_noisy_signal_freq.png")

# ========== PLOT 5: FILTERED SIGNAL (FREQUENCY DOMAIN) ==========
plt.figure(figsize=(10, 6))
plt.plot(freq_filtered, mag_filtered, linewidth=1.5, color='#2ecc71', alpha=0.8)
plt.axvspan(lowcut, highcut, alpha=0.2, color='green', label='Passband (3-30 Hz)')
plt.xlabel('Frequency (Hz)', fontsize=12)
plt.ylabel('Magnitude', fontsize=12)
plt.title('Filtered Signal (Frequency Domain)', fontsize=14, fontweight='bold')
plt.xlim(0, 80)
plt.grid(True, alpha=0.3)
plt.legend(fontsize=11)
plt.tight_layout()
plt.savefig('filter_demo_plots/05_filtered_signal_freq.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: 05_filtered_signal_freq.png")

# ========== PLOT 6: COMPARISON (FREQUENCY DOMAIN) ==========
plt.figure(figsize=(12, 6))
plt.plot(freq_noisy, mag_noisy, linewidth=1.5, color='#e74c3c', alpha=0.6, label='Noisy Signal')
plt.plot(freq_filtered, mag_filtered, linewidth=1.5, color='#2ecc71', alpha=0.8, label='Filtered Signal')
plt.axvspan(lowcut, highcut, alpha=0.15, color='green', label='Passband (3-30 Hz)')
plt.xlabel('Frequency (Hz)', fontsize=12)
plt.ylabel('Magnitude', fontsize=12)
plt.title('Signal Comparison (Frequency Domain)', fontsize=14, fontweight='bold')
plt.xlim(0, 80)
plt.legend(fontsize=11)
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('filter_demo_plots/06_comparison_freq.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: 06_comparison_freq.png")

# ========== PLOT 7: FILTER IMPULSE RESPONSE ==========
plt.figure(figsize=(10, 6))
plt.stem(fir_coeffs, linefmt='#3498db', markerfmt='o', basefmt=' ')
plt.xlabel('Tap Number', fontsize=12)
plt.ylabel('Coefficient Value', fontsize=12)
plt.title('FIR Filter Impulse Response (101 taps)', fontsize=14, fontweight='bold')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('filter_demo_plots/07_filter_impulse_response.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: 07_filter_impulse_response.png")

# ========== PLOT 8: FILTER FREQUENCY RESPONSE ==========
plt.figure(figsize=(10, 6))
w, h = signal.freqz(fir_coeffs, 1, worN=8000, fs=fs)
plt.plot(w, 20 * np.log10(np.abs(h)), linewidth=2, color='#3498db')
plt.axvline(lowcut, color='red', linestyle='--', alpha=0.7, linewidth=2, label='Cutoff frequencies')
plt.axvline(highcut, color='red', linestyle='--', alpha=0.7, linewidth=2)
plt.axhline(-3, color='gray', linestyle=':', alpha=0.6, linewidth=1.5, label='-3 dB line')
plt.xlabel('Frequency (Hz)', fontsize=12)
plt.ylabel('Gain (dB)', fontsize=12)
plt.title('Filter Frequency Response', fontsize=14, fontweight='bold')
plt.xlim(0, 80)
plt.ylim(-80, 5)
plt.grid(True, alpha=0.3)
plt.legend(fontsize=11)
plt.tight_layout()
plt.savefig('filter_demo_plots/08_filter_frequency_response.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: 08_filter_frequency_response.png")

# ========== PLOT 9: COMPREHENSIVE OVERVIEW (ALL IN ONE) ==========
fig = plt.figure(figsize=(16, 10))
fig.suptitle('FIR Bandpass Filter - Complete Analysis (3-30 Hz)', 
             fontsize=16, fontweight='bold')

# Noisy signal time domain
plt.subplot(3, 3, 1)
plt.plot(t[:400], signal_noisy[:400], linewidth=1, color='#e74c3c', alpha=0.8)
plt.xlabel('Time (s)', fontsize=9)
plt.ylabel('Amplitude', fontsize=9)
plt.title('Noisy Signal (Time)', fontsize=10, fontweight='bold')
plt.grid(True, alpha=0.3)

# Filtered signal time domain
plt.subplot(3, 3, 2)
plt.plot(t[:400], signal_filtered[:400], linewidth=1, color='#2ecc71', alpha=0.8)
plt.xlabel('Time (s)', fontsize=9)
plt.ylabel('Amplitude', fontsize=9)
plt.title('Filtered Signal (Time)', fontsize=10, fontweight='bold')
plt.grid(True, alpha=0.3)

# Comparison time domain
plt.subplot(3, 3, 3)
plt.plot(t[:400], signal_noisy[:400], linewidth=1, color='#e74c3c', alpha=0.5, label='Noisy')
plt.plot(t[:400], signal_filtered[:400], linewidth=1, color='#2ecc71', alpha=0.8, label='Filtered')
plt.xlabel('Time (s)', fontsize=9)
plt.ylabel('Amplitude', fontsize=9)
plt.title('Comparison (Time)', fontsize=10, fontweight='bold')
plt.legend(fontsize=8)
plt.grid(True, alpha=0.3)

# Noisy signal frequency domain
plt.subplot(3, 3, 4)
plt.plot(freq_noisy, mag_noisy, linewidth=1, color='#e74c3c', alpha=0.8)
plt.axvspan(lowcut, highcut, alpha=0.2, color='green')
plt.xlabel('Frequency (Hz)', fontsize=9)
plt.ylabel('Magnitude', fontsize=9)
plt.title('Noisy Signal (Frequency)', fontsize=10, fontweight='bold')
plt.xlim(0, 80)
plt.grid(True, alpha=0.3)

# Filtered signal frequency domain
plt.subplot(3, 3, 5)
plt.plot(freq_filtered, mag_filtered, linewidth=1, color='#2ecc71', alpha=0.8)
plt.axvspan(lowcut, highcut, alpha=0.2, color='green')
plt.xlabel('Frequency (Hz)', fontsize=9)
plt.ylabel('Magnitude', fontsize=9)
plt.title('Filtered Signal (Frequency)', fontsize=10, fontweight='bold')
plt.xlim(0, 80)
plt.grid(True, alpha=0.3)

# Comparison frequency domain
plt.subplot(3, 3, 6)
plt.plot(freq_noisy, mag_noisy, linewidth=1, color='#e74c3c', alpha=0.5, label='Noisy')
plt.plot(freq_filtered, mag_filtered, linewidth=1, color='#2ecc71', alpha=0.8, label='Filtered')
plt.axvspan(lowcut, highcut, alpha=0.15, color='green')
plt.xlabel('Frequency (Hz)', fontsize=9)
plt.ylabel('Magnitude', fontsize=9)
plt.title('Comparison (Frequency)', fontsize=10, fontweight='bold')
plt.xlim(0, 80)
plt.legend(fontsize=8)
plt.grid(True, alpha=0.3)

# Filter impulse response
plt.subplot(3, 3, 7)
plt.stem(fir_coeffs, linefmt='#3498db', markerfmt='o', basefmt=' ')
plt.xlabel('Tap Number', fontsize=9)
plt.ylabel('Coefficient', fontsize=9)
plt.title('Filter Impulse Response', fontsize=10, fontweight='bold')
plt.grid(True, alpha=0.3)

# Filter frequency response
plt.subplot(3, 3, 8)
w, h = signal.freqz(fir_coeffs, 1, worN=8000, fs=fs)
plt.plot(w, 20 * np.log10(np.abs(h)), linewidth=2, color='#3498db')
plt.axvline(lowcut, color='red', linestyle='--', alpha=0.6, linewidth=1)
plt.axvline(highcut, color='red', linestyle='--', alpha=0.6, linewidth=1)
plt.axhline(-3, color='gray', linestyle=':', alpha=0.6)
plt.xlabel('Frequency (Hz)', fontsize=9)
plt.ylabel('Gain (dB)', fontsize=9)
plt.title('Filter Frequency Response', fontsize=10, fontweight='bold')
plt.xlim(0, 80)
plt.ylim(-80, 5)
plt.grid(True, alpha=0.3)

# Text summary
plt.subplot(3, 3, 9)
plt.axis('off')
summary_text = f"""
FILTER SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━
Type: FIR Bandpass
Passband: {lowcut} - {highcut} Hz
Order: {numtaps} taps
Window: Hamming
Sampling Rate: {fs} Hz

SIGNAL COMPONENTS
━━━━━━━━━━━━━━━━━━━━━━
✓ Preserved: 5, 15, 25 Hz
✗ Removed: 0.5, 60 Hz
✗ Attenuated: Random noise

PERFORMANCE
━━━━━━━━━━━━━━━━━━━━━━
Effective noise reduction
Zero-phase filtering
"""
plt.text(0.1, 0.5, summary_text, fontsize=9, family='monospace', 
         verticalalignment='center', bbox=dict(boxstyle='round', 
         facecolor='wheat', alpha=0.3))

plt.tight_layout()
plt.savefig('filter_demo_plots/09_complete_overview.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print("✓ Saved: 09_complete_overview.png")

# ========== PRINT RESULTS ==========
print("\n" + "=" * 60)
print("FIR BANDPASS FILTER - DEMONSTRATION RESULTS")
print("=" * 60)
print(f"\n📊 Signal Parameters:")
print(f"   Sampling Rate: {fs} Hz")
print(f"   Duration: {duration} seconds")
print(f"   Total Samples: {len(t)}")

print(f"\n🎯 Filter Specifications:")
print(f"   Type: FIR Bandpass")
print(f"   Passband: {lowcut} - {highcut} Hz")
print(f"   Filter Order: {numtaps}")
print(f"   Window: Hamming")

print(f"\n📈 Signal Components:")
print(f"   Useful frequencies: 5, 15, 25 Hz (preserved)")
print(f"   Noise at 60 Hz: removed")
print(f"   Baseline drift at 0.5 Hz: removed")
print(f"   Random noise: attenuated")

# Calculate SNR improvement
snr_before = 10 * np.log10(np.var(signal_clean) / np.var(signal_noisy - signal_clean))
snr_after = 10 * np.log10(np.var(signal_clean) / np.var(signal_filtered - signal_clean))

print(f"\n✨ Performance:")
print(f"   SNR before filtering: {snr_before:.2f} dB")
print(f"   SNR after filtering: {snr_after:.2f} dB")
print(f"   SNR improvement: {snr_after - snr_before:.2f} dB")

print(f"\n💾 All plots saved to: 'filter_demo_plots/' directory")
print(f"   Total files: 9 individual plots")
print("=" * 60)