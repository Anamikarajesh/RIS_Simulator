from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import asyncio
import numpy as np
import json

from physics.channel import RISChannelModel, USRPEmulator
from physics.ellingson import EllingsonPathLoss
from physics.mobility import MobilityManager

app = FastAPI(title="RIS Simulator Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize physics engines
usrp = USRPEmulator(sample_rate=1e6)

@app.get("/")
def read_root():
    return {"status": "RIS Simulator Backend v2.1 - Live Position Updates"}

# Pydantic models for API
class HeatmapRequest(BaseModel):
    tx_pos: List[float]
    ris_pos: List[float]
    ris_rotation: List[float] = [0, 0, 0]  # Euler angles [rx, ry, rz]
    grid_size: int = 50
    grid_extent: float = 100
    height: float = 1.5
    n_elements: int = 256
    frequency_ghz: float = 2.6
    tx_power_dbm: float = 20.0
    phase_coherence: float = 0.5  # 0=random, 1=optimal

@app.post("/api/heatmap")
async def get_heatmap(req: HeatmapRequest):
    """Generate coverage heatmap with realistic RIS gains"""
    ellingson = EllingsonPathLoss(frequency_ghz=req.frequency_ghz)
    x = np.linspace(-req.grid_extent, req.grid_extent, req.grid_size)
    z = np.linspace(-req.grid_extent, req.grid_extent, req.grid_size)
    XX, ZZ = np.meshgrid(x, z)
    
    # Calculate RIS normal from Euler rotation [rx, ry, rz]
    # Default normal is +Z [0, 0, 1], apply Y rotation (yaw) first
    rx, ry, rz = req.ris_rotation
    # Rotation matrix for Y-axis (yaw is most important for horizontal pointing)
    cos_ry = np.cos(ry)
    sin_ry = np.sin(ry)
    # Normal after Y rotation: [sin(ry), 0, cos(ry)]
    ris_normal = np.array([sin_ry, 0, cos_ry])
    
    heatmap_combined = np.zeros_like(XX)
    heatmap_direct = np.zeros_like(XX)
    heatmap_ris_only = np.zeros_like(XX)
    heatmap_gain = np.zeros_like(XX)
    
    for i in range(req.grid_size):
        for j in range(req.grid_size):
            rx_pos = [XX[i, j], req.height, ZZ[i, j]]
            result = ellingson.path_loss_with_direct(
                tx_pos=req.tx_pos,
                ris_pos=req.ris_pos,
                rx_pos=rx_pos,
                n_elements=req.n_elements,
                include_direct=True,
                tx_power_dbm=req.tx_power_dbm,
                phase_coherence=req.phase_coherence,
                ris_normal=ris_normal
            )
            # Combined power (RIS + Direct)
            heatmap_combined[i, j] = result['rx_power_combined_dbm']
            # Direct path only
            heatmap_direct[i, j] = result['rx_power_direct_dbm']
            # RIS path only
            heatmap_ris_only[i, j] = result['rx_power_ris_dbm']
            # RIS GAIN = Combined - Direct (how much better with RIS enabled)
            heatmap_gain[i, j] = result['rx_power_combined_dbm'] - result['rx_power_direct_dbm']
    
    return {
        "heatmap": heatmap_combined.tolist(),
        "heatmap_direct": heatmap_direct.tolist(),
        "heatmap_ris_only": heatmap_ris_only.tolist(),
        "heatmap_gain": heatmap_gain.tolist(),
        "x_coords": x.tolist(),
        "z_coords": z.tolist(),
        "min_power": float(np.min(heatmap_combined)),
        "max_power": float(np.max(heatmap_combined)),
        "min_gain": float(np.min(heatmap_gain)),
        "max_gain": float(np.max(heatmap_gain)),
        "avg_gain": float(np.mean(heatmap_gain)),
        "tx_power_dbm": req.tx_power_dbm,
        "n_elements": req.n_elements
    }

class BURRequest(BaseModel):
    tx_pos: List[float]
    ris_pos: List[float]
    rx_positions: List[List[float]]
    n_elements: int = 40
    frequency_ghz: float = 3.5
    threshold_db: float = 5.0  # Benefit threshold

@app.post("/api/bur")
async def calculate_bur(req: BURRequest):
    """
    Calculate Beneficial UE Ratio (BUR)
    BUR = % of UEs where RIS path gain > direct path gain by threshold
    """
    ellingson = EllingsonPathLoss(frequency_ghz=req.frequency_ghz)
    
    beneficial_count = 0
    results = []
    
    for rx_pos in req.rx_positions:
        result = ellingson.path_loss_with_direct(
            tx_pos=req.tx_pos,
            ris_pos=req.ris_pos,
            rx_pos=rx_pos,
            n_elements=req.n_elements,
            include_direct=True
        )
        
        # Calculate benefit
        ris_gain = -result['path_loss_ris_db']
        direct_gain = -result['path_loss_direct_db']
        benefit = ris_gain - direct_gain
        
        is_beneficial = benefit > req.threshold_db
        if is_beneficial:
            beneficial_count += 1
            
        results.append({
            "rx_pos": rx_pos,
            "ris_pl_db": result['path_loss_ris_db'],
            "direct_pl_db": result['path_loss_direct_db'],
            "benefit_db": benefit,
            "is_beneficial": is_beneficial
        })
    
    bur = beneficial_count / len(req.rx_positions) * 100 if req.rx_positions else 0
    
    return {
        "bur_percent": bur,
        "beneficial_count": beneficial_count,
        "total_ues": len(req.rx_positions),
        "threshold_db": req.threshold_db,
        "per_ue_results": results
    }

@app.websocket("/ws/simulation")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to Simulation Stream")
    
    # Default State
    config = {
        "tx_nodes": [{"id": "BS-1", "pos": [0, 5, 0]}],
        "ris_nodes": [{"id": "RIS-1", "pos": [2.5, 2.5, 2.5], "elements": 40}],
        "rx_nodes": [{"id": "UE-1", "pos": [5, 1.5, 5]}],
        "frequency_ghz": 3.5,
        "ris_bits": 2,
        "cfo": 0,
        "signal_type": "cosine",
        "rx_mobility": "static",
        "selected_rx_id": None,
        "running": False
    }
    
    # Initialize path loss model
    pl_model = EllingsonPathLoss(frequency_ghz=config["frequency_ghz"])
    
    # Initialize mobility
    bounds = (-50, 50, -50, 50)  # Smaller bounds for indoor-scale scenarios
    mobility_manager = MobilityManager(config["rx_mobility"], bounds)
    
    for rx in config["rx_nodes"]:
        mobility_manager.initialize_node(rx["id"], rx["pos"])
    
    last_update = asyncio.get_event_loop().time()

    try:
        while True:
            # Check for incoming config updates (non-blocking)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                new_config = json.loads(data)
                print(f"Received config update: {list(new_config.keys())}")
                
                # Update config
                for key, value in new_config.items():
                    config[key] = value
                
                # Handle frequency change
                if "frequency_ghz" in new_config:
                    pl_model = EllingsonPathLoss(frequency_ghz=new_config["frequency_ghz"])
                
                # Handle mobility change
                if "rx_mobility" in new_config or "rx_nodes" in new_config:
                    mobility_manager = MobilityManager(config["rx_mobility"], bounds)
                    for rx in config["rx_nodes"]:
                        mobility_manager.initialize_node(rx["id"], rx["pos"])
                
            except asyncio.TimeoutError:
                pass
            except json.JSONDecodeError as e:
                print(f"JSON error: {e}")
            except Exception as e:
                print(f"Error rx: {e}")
                break

            if config["running"]:
                current_time = asyncio.get_event_loop().time()
                dt = current_time - last_update
                last_update = current_time
                
                # Update mobility for non-static modes
                if config["rx_mobility"] != "static" and mobility_manager:
                    new_positions = mobility_manager.update_all(dt)
                    for rx in config["rx_nodes"]:
                        if rx["id"] in new_positions:
                            rx["pos"] = new_positions[rx["id"]]
                
                # Get nodes
                tx_nodes = config.get("tx_nodes", [{"id": "TX", "pos": [0, 5, 0]}])
                ris_nodes = config.get("ris_nodes", [{"id": "RIS", "pos": [2.5, 2.5, 2.5], "elements": 40}])
                rx_nodes = config.get("rx_nodes", [{"id": "RX", "pos": [5, 1.5, 5]}])
                
                # Use first Tx and RIS for now
                tx_pos = tx_nodes[0]["pos"] if tx_nodes else [0, 5, 0]
                ris_pos = ris_nodes[0]["pos"] if ris_nodes else [2.5, 2.5, 2.5]
                n_elements = ris_nodes[0].get("elements", 40) if ris_nodes else 40
                
                # Find selected Rx or use first
                selected_rx_id = config.get("selected_rx_id")
                selected_rx = None
                for rx in rx_nodes:
                    if rx["id"] == selected_rx_id:
                        selected_rx = rx
                        break
                if selected_rx is None and rx_nodes:
                    selected_rx = rx_nodes[0]
                
                rx_pos = selected_rx["pos"] if selected_rx else [5, 1.5, 5]
                
                # Calculate path loss using Ellingson model
                result = pl_model.path_loss_with_direct(
                    tx_pos=tx_pos,
                    ris_pos=ris_pos,
                    rx_pos=rx_pos,
                    n_elements=n_elements,
                    include_direct=True,
                    tx_power_dbm=20  # Lower power for indoor
                )
                
                # Generate IQ signal
                t, tx_iq = usrp.generate_signal(
                    signal_type=config.get("signal_type", "cosine"),
                    duration=0.001
                )
                
                # Apply channel
                attenuation = 10 ** (-result['path_loss_ris_db'] / 20)
                rx_iq = tx_iq * attenuation
                
                # Apply CFO
                if config.get("cfo", 0) != 0:
                    rx_iq = usrp.apply_cfo(rx_iq, config["cfo"])
                
                # Add noise and quantize
                rx_iq = usrp.add_awgn(rx_iq, snr_db=20)
                rx_iq = usrp.quantize_adc(rx_iq, bits=12)
                
                # Downsample for visualization
                viz_points = 100
                step = max(1, len(t) // viz_points)
                
                payload = {
                    "pathloss_db": result['path_loss_ris_db'],
                    "rx_power_dbm": result['rx_power_combined_dbm'],
                    "tx_iq_real": tx_iq.real[::step].tolist(),
                    "tx_iq_imag": tx_iq.imag[::step].tolist(),
                    "rx_iq_real": rx_iq.real[::step].tolist(),
                    "rx_iq_imag": rx_iq.imag[::step].tolist(),
                    "t": t[::step].tolist(),
                    "rx_positions": [rx["pos"] for rx in rx_nodes],
                    "distance_tx_ris": result['distance_tx_ris_m'],
                    "distance_ris_rx": result['distance_ris_rx_m'],
                    "selected_rx_id": selected_rx["id"] if selected_rx else None
                }
                
                await websocket.send_json(payload)
            
            # Throttle to ~30 FPS
            await asyncio.sleep(0.033)

    except WebSocketDisconnect:
        print("Client disconnected")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
