# RIS Simulator

A real-time **Reconfigurable Intelligent Surface (RIS)** simulator with an interactive 3D visualization interface. This tool enables researchers and engineers to study RIS-assisted wireless communication systems through an intuitive web-based platform.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Simulator](#running-the-simulator)
- [Usage](#usage)
  - [3D Viewport Controls](#3d-viewport-controls)
  - [Configurable Parameters](#configurable-parameters)
  - [Metrics Displayed](#metrics-displayed)
- [Physics Model](#physics-model)
- [API Reference](#api-reference)
- [References](#references)
- [Contributing](#contributing)
- [License](#license)
- [Authors](#authors)

---

## Features

- **Interactive 3D Visualization** – Real-time scene with draggable transmitters, receivers, and RIS panels using Three.js
- **Physics-Based Simulation** – Implements the Ellingson (2021) path loss model for accurate RIS channel modeling
- **Real-Time Coverage Heatmaps** – Visualize received power distribution across the simulation area
- **Live Metrics Dashboard** – Monitor SNR, path loss, RIS gain, and beneficial UE ratio (BUR)
- **WebSocket Communication** – Low-latency data streaming between frontend and backend
- **Multiple Scenario Support** – Pre-configured scenarios for different deployment environments
- **USRP Emulation** – Software-defined radio emulator for signal processing experiments

---

## Architecture

```
+---------------------------------------------------------------------+
|                         Frontend (React + Vite)                     |
|  +--------------+  +--------------+  +--------------+  +-----------+|
|  | Viewport3D   |  | ConfigPanel  |  |  Dashboard   |  |  Heatmap  ||
|  |  (Three.js)  |  |   (Leva)     |  | (Recharts)   |  |  (Canvas) ||
|  +--------------+  +--------------+  +--------------+  +-----------+|
+-----------------------------------+---------------------------------+
                                    | WebSocket
+-----------------------------------v---------------------------------+
|                       Backend (FastAPI + Python)                    |
|  +--------------+  +--------------+  +--------------+  +-----------+|
|  |  Ellingson   |  |   Channel    |  |  Mobility    |  |   USRP    ||
|  | Path Loss    |  |   Model      |  |   Model      |  | Emulator  ||
|  +--------------+  +--------------+  +--------------+  +-----------+|
+---------------------------------------------------------------------+
```

---

## Project Structure

```
RIS_Simulator/
├── backend/
│   ├── main.py                 # FastAPI server with WebSocket endpoints
│   ├── requirements.txt        # Python dependencies
│   └── physics/
│       ├── ellingson.py        # RIS path loss model (Ellingson 2021)
│       ├── channel.py          # Channel modeling utilities
│       ├── mobility.py         # User mobility patterns
│       └── usrp.py             # USRP SDR emulator
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main application component
│   │   └── components/
│   │       ├── Viewport3D.jsx  # 3D scene with Three.js
│   │       ├── ConfigPanel.jsx # Configuration controls
│   │       ├── Dashboard.jsx   # Real-time metrics display
│   │       └── Heatmap.jsx     # Coverage heatmap visualization
│   ├── package.json
│   └── vite.config.js
├── papers/                     # Reference research papers
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 20.19+** (or 22.12+)
- **npm** or **yarn**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Anamikarajesh/RIS_Simulator.git
   cd RIS_Simulator
   ```

2. **Set up the backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. **Set up the frontend**
   ```bash
   cd ../frontend
   npm install
   ```

### Running the Simulator

You need **two terminals** – one for the backend and one for the frontend.

**Terminal 1 – Backend:**
```bash
cd backend
python -m uvicorn main:app --reload
```
Backend will start at: `http://127.0.0.1:8000`

**Terminal 2 – Frontend:**
```bash
cd frontend
npm run dev
```
Frontend will start at: `http://localhost:5173`

Open `http://localhost:5173` in your browser to use the simulator.

---

## Usage

### 3D Viewport Controls

| Control | Action |
|---------|--------|
| Left Click + Drag | Rotate camera |
| Right Click + Drag | Pan camera |
| Scroll | Zoom in/out |
| Show Gizmos | Enable draggable objects |

### Configurable Parameters

| Parameter | Description |
|-----------|-------------|
| Transmitter Position | Location of base station (x, y, z) |
| RIS Position | Placement of RIS panel in 3D space |
| RIS Rotation | Orientation of RIS panel (rx, ry, rz) |
| Number of RIS Elements | Array size (affects coherent gain) |
| Frequency (GHz) | Operating frequency of the system |
| Tx Power (dBm) | Transmit power level |
| Phase Coherence | RIS phase alignment quality (0 to 1) |

### Metrics Displayed

| Metric | Description |
|--------|-------------|
| SNR | Signal-to-noise ratio at receiver locations |
| Path Loss | Total path loss for direct and RIS-assisted paths |
| RIS Gain | Coherent array gain provided by the RIS |
| BUR | Beneficial UE Ratio – percentage of users benefiting from RIS |

---

## Physics Model

The simulator implements the **Ellingson (2021)** path loss model for RIS-assisted communications:

```
PL_RIS (dB) = PL_Tx-RIS + PL_RIS-Rx - G_RIS

Where:
  G_RIS = 10 * log10(N^2) + 2 * G_el + pattern_loss
  
  N     = Number of RIS elements
  G_el  = Element gain (typically 5 dBi)
```

**Key Assumptions:**
- Far-field propagation conditions
- Half-wavelength element spacing (lambda/2)
- Cosine-squared element radiation pattern
- Configurable phase coherence for realistic scenarios

**RIS Benefit Calculation:**
```
RIS_Benefit (dB) = PL_direct - PL_RIS
```
A positive value indicates the RIS-assisted path provides better signal quality than the direct path.

---

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check and API status |
| `POST` | `/heatmap` | Generate coverage heatmap data |
| `POST` | `/bur` | Calculate Beneficial UE Ratio |

### WebSocket Endpoint

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:8000/ws` | Real-time simulation data stream |

**WebSocket Message Format:**
```json
{
  "type": "config_update",
  "data": {
    "tx_pos": [0, 5, 0],
    "ris_pos": [10, 3, 0],
    "n_elements": 64,
    "frequency_ghz": 3.5
  }
}
```

---

## References

1. Ellingson, S. W. (2021). "Path Loss in Reconfigurable Intelligent Surface-Enabled Channels." *IEEE Wireless Communications Letters.*

2. Di Renzo, M. et al. "Smart Radio Environments Empowered by Reconfigurable AI Meta-Surfaces: An Idea Whose Time Has Come." *EURASIP Journal on Wireless Communications and Networking.*

3. Wu, Q. and Zhang, R. "Intelligent Reflecting Surface Enhanced Wireless Network via Joint Active and Passive Beamforming." *IEEE Transactions on Wireless Communications.*

---

## Contributing

Contributions are welcome. Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -m 'Add YourFeature'`)
4. Push to the branch (`git push origin feature/YourFeature`)
5. Open a Pull Request

Please ensure your code follows the existing style conventions and includes appropriate documentation.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Authors

- **Anamika Rajesh** – [GitHub](https://github.com/Anamikarajesh)

---

For questions or support, please open an issue on the GitHub repository.
