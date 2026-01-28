"""
RIS Path Loss Model - Corrected Implementation
Based on Ellingson (2021) and realistic deployment scenarios

Key Formula (Far-Field, Eq. 19):
P_rx/P_tx = (λ² * A_eff²) / ((4π)³ * d1² * d2²) * N² * G_el² * cos²(θ1) * cos²(θ2)

Where:
- A_eff = effective aperture = N * (λ/2)² for half-wave elements
- d1, d2 = distances Tx→RIS, RIS→Rx
- N = number of elements
- G_el = element gain (~5 dBi)
- θ1, θ2 = angles from broadside

Simplified for simulation:
PL_RIS (dB) = PL_Tx→RIS + PL_RIS→Rx - G_RIS
G_RIS = 10*log10(N²) + 2*G_el + pattern_loss
"""
import numpy as np

class EllingsonPathLoss:
    def __init__(self, frequency_ghz=3.5, element_gain_dbi=5.0, efficiency=0.7):
        self.c = 3e8
        self.frequency = frequency_ghz * 1e9
        self.wavelength = self.c / self.frequency
        self.element_gain_dbi = element_gain_dbi
        self.efficiency = efficiency
        
    def fspl_db(self, distance_m):
        """Free Space Path Loss in dB"""
        if distance_m <= 0.01:
            distance_m = 0.01
        return 20 * np.log10(4 * np.pi * distance_m / self.wavelength)
    
    def element_pattern_db(self, theta_rad):
        """Element pattern loss: cos²(θ) in dB"""
        theta = np.clip(np.abs(theta_rad), 0, np.pi/2 - 0.01)
        cos_sq = np.cos(theta) ** 2
        return 10 * np.log10(max(cos_sq, 0.001))
    
    def path_loss_with_direct(self, tx_pos, ris_pos, rx_pos, n_elements, include_direct=True,
                               ris_normal=None, tx_power_dbm=20, phase_coherence=1.0):
        """
        Calculate RIS-assisted and direct path losses.
        
        phase_coherence: 0 to 1
          - 1.0 = perfect phase alignment (optimal RIS configuration)
          - 0.5 = partial coherence
          - 0.0 = random phases (worst case)
        """
        tx_pos = np.array(tx_pos, dtype=float)
        ris_pos = np.array(ris_pos, dtype=float)
        rx_pos = np.array(rx_pos, dtype=float)
        
        # Distances
        d1 = max(np.linalg.norm(ris_pos - tx_pos), 0.1)  # Tx to RIS
        d2 = max(np.linalg.norm(rx_pos - ris_pos), 0.1)  # RIS to Rx
        d_direct = max(np.linalg.norm(rx_pos - tx_pos), 0.1)  # Direct path
        
        # RIS normal (default +Z)
        if ris_normal is None:
            ris_normal = np.array([0, 0, 1])
        ris_normal = ris_normal / np.linalg.norm(ris_normal)
        
        # Calculate incidence angles
        dir_to_tx = (tx_pos - ris_pos) / d1
        dir_to_rx = (rx_pos - ris_pos) / d2
        theta1 = np.arccos(np.clip(np.dot(dir_to_tx, ris_normal), -1, 1))
        theta2 = np.arccos(np.clip(np.dot(dir_to_rx, ris_normal), -1, 1))
        
        # ===== DIRECT PATH =====
        pl_direct = self.fspl_db(d_direct)
        
        # ===== RIS PATH =====
        # Path loss for each leg
        pl_tx_ris = self.fspl_db(d1)
        pl_ris_rx = self.fspl_db(d2)
        
        # RIS Array Gain
        # Coherent: G = N² (each element adds coherently)
        # Incoherent: G = N (power adds)
        # With phase_coherence: G = N^(1 + phase_coherence)
        effective_exponent = 1.0 + phase_coherence
        array_gain_db = 10 * np.log10(n_elements) * effective_exponent
        
        # Element pattern losses at both angles
        pattern_loss_db = -(self.element_pattern_db(theta1) + self.element_pattern_db(theta2))
        
        # Element gain (applied at both angles, so 2x)
        element_gain_total_db = 2 * self.element_gain_dbi
        
        # Efficiency loss
        efficiency_db = 10 * np.log10(self.efficiency)
        
        # Total RIS gain
        ris_gain_db = array_gain_db + element_gain_total_db - pattern_loss_db + efficiency_db
        
        # RIS path loss = leg losses - RIS gain
        pl_ris = pl_tx_ris + pl_ris_rx - ris_gain_db
        
        # ===== RIS BENEFIT =====
        # Positive = RIS path is better than direct
        ris_benefit_db = pl_direct - pl_ris
        
        # ===== POWER CALCULATIONS =====
        p_direct_dbm = tx_power_dbm - pl_direct if include_direct else -200
        p_ris_dbm = tx_power_dbm - pl_ris
        
        # Combined (non-coherent addition)
        p_direct_linear = 10 ** (p_direct_dbm / 10)
        p_ris_linear = 10 ** (p_ris_dbm / 10)
        combined_mw = p_direct_linear + p_ris_linear
        combined_dbm = 10 * np.log10(combined_mw + 1e-30)
        
        return {
            'path_loss_ris_db': pl_ris,
            'path_loss_direct_db': pl_direct,
            'rx_power_ris_dbm': p_ris_dbm,
            'rx_power_direct_dbm': p_direct_dbm,
            'rx_power_combined_dbm': combined_dbm,
            'ris_benefit_db': ris_benefit_db,
            'ris_gain_db': ris_gain_db,
            'distance_tx_ris_m': d1,
            'distance_ris_rx_m': d2,
            'distance_direct_m': d_direct,
            'theta_tx_deg': np.degrees(theta1),
            'theta_rx_deg': np.degrees(theta2)
        }
