import numpy as np

class USRPEmulator:
    def __init__(self, sample_rate=1e6):
        self.sample_rate = sample_rate

    def generate_signal(self, signal_type="cosine", frequency=1000, duration=0.001, amplitude=1.0):
        """
        Generates baseband IQ samples.
        """
        t = np.arange(0, duration, 1/self.sample_rate)
        
        if signal_type == "cosine":
            # I = cos(wt), Q = sin(wt) for complex exponential
            # Baseband tone at 'frequency' offset
            iq = amplitude * np.exp(1j * 2 * np.pi * frequency * t)
        elif signal_type == "noise":
            iq = amplitude * (np.random.normal(0, 1, len(t)) + 1j * np.random.normal(0, 1, len(t)))
        else:
            iq = np.zeros_like(t, dtype=np.complex64)
            
        return t, iq.astype(np.complex64)

    def apply_tx_impairments(self, signal, cfo=0.0, gain_db=0.0):
        """
        Simulate Tx Chain: Gain -> CFO
        """
        # Linear Gain
        gain_lin = 10**(gain_db/20)
        out = signal * gain_lin
        
        # CFO
        if cfo != 0:
            t = np.arange(len(signal)) / self.sample_rate
            out = out * np.exp(1j * 2 * np.pi * cfo * t)
            
        return out.astype(np.complex64)

    def apply_rx_impairments(self, signal, adc_bits=12, noise_figure_db=5):
        """
        Simulate Rx Chain: AWGN -> ADC Quantization
        """
        # AWGN
        # Calculate Noise Power based on Thermal Noise + NF
        k = 1.38e-23
        T = 290
        B = self.sample_rate
        noise_power_dbm = 10 * np.log10(k * T * B * 1000) + noise_figure_db
        noise_power_watts = 10**((noise_power_dbm - 30)/10)
        noise_std = np.sqrt(noise_power_watts / 2)
        
        noise = noise_std * (np.random.randn(len(signal)) + 1j * np.random.randn(len(signal)))
        noisy_signal = signal + noise
        
        # ADC Quantization
        # Normalize to dynamic range [-1, 1] then quantize
        max_val = np.max(np.abs(noisy_signal))
        if max_val == 0:
            return noisy_signal
            
        levels = 2**adc_bits
        step = 2 * max_val / levels
        
        # simple uniform quantization
        quantized_real = np.round(noisy_signal.real / step) * step
        quantized_imag = np.round(noisy_signal.imag / step) * step
        
        return (quantized_real + 1j * quantized_imag).astype(np.complex64)
