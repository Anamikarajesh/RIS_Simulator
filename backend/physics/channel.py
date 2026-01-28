"""
RIS Channel Model - Aligned with FuTURE Forum White Paper (2025)
Implements:
- Modified FI (Floating-Intercept) Path Loss Model
- Modified CI (Close-In) Path Loss Model  
- 2-bit Phase Quantization
- GBSM-based Fast Fading (geometry parameters)
"""
import numpy as np

class RISChannelModel:
    """
    Channel model based on 3GPP TR 38.901 and FuTURE Forum White Paper.
    """
    
    def __init__(self, frequency_ghz=2.6):
        self.c = 3e8
        self.frequency = frequency_ghz * 1e9
        self.wavelength = self.c / self.frequency
        
        # Urban Macro (UMa) parameters from ITU/3GPP
        self.uma_alpha_los = 32.4  # Intercept for LOS
        self.uma_alpha_nlos = 35.3  # Intercept for NLOS
        self.uma_n_los = 2.0  # PLE for LOS
        self.uma_n_nlos = 3.5  # PLE for NLOS
        self.sf_std_los = 4.0  # dB
        self.sf_std_nlos = 6.0  # dB
        
    def pathloss_uma_los(self, d_3d, h_bs=25, h_ue=1.5):
        """
        3GPP TR 38.901 UMa LOS path loss.
        PL = 28.0 + 22*log10(d) + 20*log10(fc)
        """
        fc_ghz = self.frequency / 1e9
        # Breakpoint distance
        d_bp = 4 * (h_bs - 1) * (h_ue - 1) * self.frequency / self.c
        
        if d_3d < d_bp:
            pl = 28.0 + 22 * np.log10(d_3d) + 20 * np.log10(fc_ghz)
        else:
            pl = 28.0 + 40 * np.log10(d_3d) + 20 * np.log10(fc_ghz) - 9 * np.log10((d_bp)**2 + (h_bs - h_ue)**2)
        
        return pl
    
    def pathloss_uma_nlos(self, d_3d, h_bs=25, h_ue=1.5):
        """
        3GPP TR 38.901 UMa NLOS path loss.
        """
        fc_ghz = self.frequency / 1e9
        pl_los = self.pathloss_uma_los(d_3d, h_bs, h_ue)
        pl_nlos = 13.54 + 39.08 * np.log10(d_3d) + 20 * np.log10(fc_ghz) - 0.6 * (h_ue - 1.5)
        return max(pl_los, pl_nlos)
    
    def pathloss_ris_cascade_fi(self, d1, d2, theta_bs_ris, theta_ris_ue, n_elements, is_los=True):
        """
        Modified Floating-Intercept (FI) Model from White Paper (Eq 3-2).
        PL = α + n1*log10(d1) + n2*log10(d2) + f(θ_EoA) + f(θ_EoD) + SF
        """
        # Base intercept (calibrated for RIS)
        alpha = 30.0 if is_los else 35.0
        
        # Path loss exponents
        n1 = 2.0 if is_los else 2.5  # BS-RIS
        n2 = 2.2 if is_los else 2.8  # RIS-UE
        
        # Angle-dependent terms (cosine falloff)
        f_theta1 = 10 * np.log10(np.cos(theta_bs_ris) + 0.01)  # Avoid log(0)
        f_theta2 = 10 * np.log10(np.cos(theta_ris_ue) + 0.01)
        
        # RIS Array Gain (N^2 for coherent combining)
        ris_gain_db = 10 * np.log10(n_elements**2)
        
        # Frequency term
        fc_ghz = self.frequency / 1e9
        f_term = 20 * np.log10(fc_ghz)
        
        pl = alpha + 10*n1*np.log10(d1) + 10*n2*np.log10(d2) + f_term - ris_gain_db + f_theta1 + f_theta2
        
        return pl
    
    def pathloss_ris_cascade_ci(self, d1, d2, d1_ref=1.0, d2_ref=1.0, n_elements=256, is_los=True):
        """
        Modified Close-In (CI) Model from White Paper (Eq 3-3).
        PL = PL_ref + n1*log10(d1/d1_ref) + n2*log10(d2/d2_ref) + SF
        """
        # Reference path loss at reference distances
        fc_ghz = self.frequency / 1e9
        pl_ref = 32.4 + 20 * np.log10(fc_ghz)  # Free space reference
        
        # PLEs
        n1 = 2.0 if is_los else 2.5
        n2 = 2.2 if is_los else 2.8
        
        # RIS Gain
        ris_gain_db = 10 * np.log10(n_elements**2)
        
        pl = pl_ref + 10*n1*np.log10(d1/d1_ref) + 10*n2*np.log10(d2/d2_ref) - ris_gain_db
        
        return pl
    
    def quantize_phase_2bit(self, phase_rad):
        """
        2-bit phase quantization from White Paper (Eq 3-2).
        Maps continuous phase to 4 states: π/4, 3π/4, -3π/4, -π/4
        """
        phase_mod = np.mod(phase_rad, 2 * np.pi)
        
        if phase_mod < np.pi / 2:
            return np.pi / 4
        elif phase_mod < np.pi:
            return 3 * np.pi / 4
        elif phase_mod < 3 * np.pi / 2:
            return -3 * np.pi / 4
        else:
            return -np.pi / 4
    
    def quantize_phase_array(self, phase_array, bits=2):
        """
        Quantize phase array with specified bit resolution.
        """
        n_states = 2 ** bits
        step = 2 * np.pi / n_states
        
        # Quantize to nearest state
        quantized = np.round(phase_array / step) * step
        # Wrap to [-π, π]
        quantized = np.mod(quantized + np.pi, 2 * np.pi) - np.pi
        
        return quantized
    
    def optimal_phase_ris(self, tx_pos, ris_pos, rx_pos, element_positions, quantization_bits=2):
        """
        Calculate optimal phase shifts for RIS elements.
        Based on White Paper Eq 3-1:
        Φ_l,k = -2π * (r̂_AoA · d_l,k + r̂_AoD · d_l,k) / λ
        """
        # Direction vectors
        dir_tx_ris = (np.array(ris_pos) - np.array(tx_pos))
        dir_tx_ris = dir_tx_ris / np.linalg.norm(dir_tx_ris)
        
        dir_ris_rx = (np.array(rx_pos) - np.array(ris_pos))
        dir_ris_rx = dir_ris_rx / np.linalg.norm(dir_ris_rx)
        
        phases = []
        for elem_pos in element_positions:
            # Path length difference
            d_in = np.dot(dir_tx_ris, elem_pos)
            d_out = np.dot(dir_ris_rx, elem_pos)
            
            # Optimal phase
            phase = -2 * np.pi * (d_in + d_out) / self.wavelength
            phases.append(phase)
        
        phases = np.array(phases)
        
        # Apply quantization
        if quantization_bits > 0:
            phases = self.quantize_phase_array(phases, bits=quantization_bits)
        
        return phases
    
    def calculate_heatmap_vectorized(self, tx_pos, ris_pos, grid_x, grid_y, z_height, n_elements=256, is_los=True):
        """
        Vectorized heatmap calculation using CI model.
        """
        XX, YY = np.meshgrid(grid_x, grid_y)
        ZZ = np.full_like(XX, z_height)
        
        # Distances
        d1 = np.linalg.norm(np.array(ris_pos) - np.array(tx_pos))
        
        # Vectorized d2
        rx_points = np.stack([XX.flatten(), YY.flatten(), ZZ.flatten()], axis=1)
        d2_vec = np.linalg.norm(rx_points - np.array(ris_pos), axis=1)
        
        # Direct path distance
        d_direct = np.linalg.norm(rx_points - np.array(tx_pos), axis=1)
        
        # Path losses
        pl_ris = np.array([self.pathloss_ris_cascade_ci(d1, d2, n_elements=n_elements, is_los=is_los) for d2 in d2_vec])
        pl_direct = np.array([self.pathloss_uma_nlos(d, h_ue=z_height) for d in d_direct])
        
        # Combine powers (non-coherent from white paper)
        p_ris_lin = 10 ** (-pl_ris / 10)
        p_direct_lin = 10 ** (-pl_direct / 10)
        p_total = p_ris_lin + p_direct_lin
        
        return 10 * np.log10(p_total + 1e-20).reshape(XX.shape)


class USRPEmulator:
    """USRP Signal Generation and Processing"""
    
    def __init__(self, sample_rate=1e6):
        self.sample_rate = sample_rate

    def generate_signal(self, signal_type="cosine", frequency=1000, duration=0.001, amplitude=1.0):
        t = np.arange(0, duration, 1/self.sample_rate)
        
        if signal_type == "cosine":
            iq = amplitude * np.exp(1j * 2 * np.pi * frequency * t)
        elif signal_type == "noise":
            iq = amplitude * (np.random.normal(0, 1, len(t)) + 1j * np.random.normal(0, 1, len(t)))
        else:
            iq = np.zeros_like(t, dtype=np.complex64)
            
        return t, iq.astype(np.complex64)

    def apply_cfo(self, signal, cfo_hz):
        t = np.arange(len(signal)) / self.sample_rate
        return signal * np.exp(1j * 2 * np.pi * cfo_hz * t)

    def apply_channel(self, signal, pathloss_db, phase_shift=0):
        attenuation = 10 ** (-pathloss_db / 20)
        return signal * attenuation * np.exp(1j * phase_shift)

    def add_awgn(self, signal, snr_db=20):
        signal_power = np.mean(np.abs(signal) ** 2)
        noise_power = signal_power / (10 ** (snr_db / 10))
        noise = np.sqrt(noise_power / 2) * (np.random.randn(len(signal)) + 1j * np.random.randn(len(signal)))
        return signal + noise

    def quantize_adc(self, signal, bits=12):
        max_val = np.max(np.abs(signal))
        if max_val == 0:
            return signal
        levels = 2 ** bits
        step = 2 * max_val / levels
        quantized_real = np.round(signal.real / step) * step
        quantized_imag = np.round(signal.imag / step) * step
        return (quantized_real + 1j * quantized_imag).astype(np.complex64)
