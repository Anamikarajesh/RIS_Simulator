import React, { useState, useEffect, useRef, useCallback } from 'react';
import Viewport3D from './components/Viewport3D';
import ConfigPanel from './components/ConfigPanel';
import Dashboard from './components/Dashboard';
import Heatmap from './components/Heatmap';

function App() {
  const [scenarioKey, setScenarioKey] = useState(0);
  const [selectedRxId, setSelectedRxId] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const [config, setConfig] = useState({
    tx_nodes: [{ id: 'BS-1', pos: [0, 5, 0], power_dbm: 20 }],
    rx_nodes: [{ id: 'UE-1', pos: [5, 1.5, 5] }],
    ris_nodes: [{ id: 'RIS-1', pos: [2.5, 2.5, 2.5], rotation: [0, -Math.PI / 4, 0], size: 0.4, elements: 40 }],
    frequency_ghz: 3.5,
    ris_bits: 2,
    cfo: 0,
    rx_mobility: 'static'
  });

  const [simulationState, setSimulationState] = useState({
    pathloss_db: 0,
    rx_power: -100,
    tx_iq: { real: [], imag: [], t: [] },
    rx_iq: { real: [], imag: [], t: [] },
    connected: false,
    distance_tx_ris: 0,
    distance_ris_rx: 0,
    rx_positions: []
  });

  const [isRunning, setIsRunning] = useState(false);
  const [simulationTime, setSimulationTime] = useState(0);
  const ws = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Send full config to backend
  const sendFullConfig = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const fullConfig = {
        tx_nodes: config.tx_nodes,
        rx_nodes: config.rx_nodes,
        ris_nodes: config.ris_nodes,
        frequency_ghz: config.frequency_ghz,
        ris_bits: config.ris_bits,
        cfo: config.cfo,
        rx_mobility: config.rx_mobility,
        selected_rx_id: selectedRxId,
        running: isRunning
      };
      ws.current.send(JSON.stringify(fullConfig));
    }
  }, [config, selectedRxId, isRunning]);

  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:8000/ws/simulation");

    ws.current.onopen = () => {
      setSimulationState(prev => ({ ...prev, connected: true }));
      // Send initial config
      setTimeout(() => sendFullConfig(), 100);
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      setSimulationState(prev => ({
        ...prev,
        pathloss_db: data.pathloss_db,
        rx_power: data.rx_power_dbm,
        tx_iq: { real: data.tx_iq_real || [], imag: data.tx_iq_imag || [], t: data.t || [] },
        rx_iq: { real: data.rx_iq_real || [], imag: data.rx_iq_imag || [], t: data.t || [] },
        distance_tx_ris: data.distance_tx_ris,
        distance_ris_rx: data.distance_ris_rx
      }));

      // Update Rx positions from backend if mobility is active
      if (data.rx_positions && data.rx_positions.length > 0) {
        setConfig(prev => {
          const newRxNodes = prev.rx_nodes.map((rx, i) => ({
            ...rx,
            pos: data.rx_positions[i] || rx.pos
          }));
          return { ...prev, rx_nodes: newRxNodes };
        });
      }
    };

    ws.current.onerror = () => { };
    ws.current.onclose = () => setSimulationState(prev => ({ ...prev, connected: false }));

    return () => ws.current?.close();
  }, []);

  // Simulation timer
  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now() - (simulationTime * 1000);
      timerRef.current = setInterval(() => {
        setSimulationTime((Date.now() - startTimeRef.current) / 1000);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const sendConfig = (key, value) => {
    setConfig(prev => {
      const newConfig = { ...prev, [key]: value };
      // Send update to backend immediately
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ [key]: value }));
      }
      return newConfig;
    });
  };

  const loadScenario = (scenarioConfig) => {
    const freshConfig = JSON.parse(JSON.stringify(scenarioConfig));
    setConfig(prev => ({ ...prev, ...freshConfig }));
    setScenarioKey(prev => prev + 1);
    setSimulationTime(0);
    // Set default selected Rx
    if (freshConfig.rx_nodes && freshConfig.rx_nodes.length > 0) {
      setSelectedRxId(freshConfig.rx_nodes[0].id);
    }
    // Send to backend
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(freshConfig));
    }
  };

  const toggleSimulation = () => {
    const newState = !isRunning;
    setIsRunning(newState);
    if (!newState) {
      setSimulationTime(0);
    }
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ running: newState }));
    }
  };

  // Handle position updates from 3D viewport - SEND TO BACKEND IMMEDIATELY
  const handleConfigUpdate = useCallback((type, id, pos, rot) => {
    setConfig(prev => {
      const key = `${type}_nodes`;
      const nodes = [...(prev[key] || [])];
      const idx = nodes.findIndex(n => n.id === id);
      if (idx >= 0) {
        nodes[idx] = { ...nodes[idx], pos: [...pos] };
        if (rot) nodes[idx].rotation = [...rot];
      }

      // CRITICAL: Send position update to backend for recalculation
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          [key]: nodes,
          selected_rx_id: selectedRxId
        }));
      }

      return { ...prev, [key]: nodes };
    });
  }, [selectedRxId]);

  const handleRxSelect = (rxId) => {
    setSelectedRxId(rxId);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ selected_rx_id: rxId }));
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      height: '100vh',
      width: '100vw',
      background: '#0f172a',
      color: '#e2e8f0',
      overflow: 'hidden'
    }}>
      {/* Left: Config */}
      <div style={{
        width: '260px',
        minWidth: '260px',
        height: '100%',
        background: 'rgba(15, 23, 42, 0.98)',
        padding: '12px',
        overflowY: 'auto',
        borderRight: '1px solid #334155'
      }}>
        <ConfigPanel
          config={config}
          onConfigChange={sendConfig}
          onScenarioLoad={loadScenario}
          onStartSimulation={toggleSimulation}
          isRunning={isRunning}
          onShowHeatmap={() => setShowHeatmap(true)}
        />
      </div>

      {/* Center: 3D Viewport */}
      <div style={{ flex: 1, height: '100%', position: 'relative' }}>
        <Viewport3D
          key={scenarioKey}
          config={config}
          isRunning={isRunning}
          onConfigUpdate={handleConfigUpdate}
          simulationTime={simulationTime}
          selectedRxId={selectedRxId}
          onSelectRx={handleRxSelect}
        />

        {/* Status Badges */}
        <div style={{ position: 'absolute', top: '16px', left: '16px', display: 'flex', gap: '8px' }}>
          <div style={{
            padding: '6px 12px',
            borderRadius: '16px',
            fontSize: '11px',
            fontWeight: 'bold',
            background: simulationState.connected ? '#22c55e' : '#ef4444',
            color: 'white'
          }}>
            {simulationState.connected ? "⚡ ONLINE" : "⚠ OFFLINE"}
          </div>
          {isRunning && (
            <div style={{
              padding: '6px 12px',
              borderRadius: '16px',
              fontSize: '11px',
              fontWeight: 'bold',
              background: '#3b82f6',
              color: 'white'
            }}>
              🔴 RUNNING
            </div>
          )}
        </div>

        {/* Navigation */}
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          padding: '8px',
          background: 'rgba(0,0,0,0.7)',
          borderRadius: '6px',
          fontSize: '10px',
          color: '#94a3b8'
        }}>
          <b>🖱️ Nav:</b> Left=Rotate | Right=Pan | Scroll=Zoom
        </div>
      </div>

      {/* Right: Dashboard */}
      <div style={{
        width: '280px',
        minWidth: '280px',
        height: '100%',
        background: 'rgba(15, 23, 42, 0.98)',
        padding: '12px',
        overflowY: 'auto',
        borderLeft: '1px solid #334155'
      }}>
        <Dashboard
          state={simulationState}
          config={config}
          simulationTime={simulationTime}
          isRunning={isRunning}
          selectedRxId={selectedRxId}
          onSelectRx={handleRxSelect}
        />
      </div>

      {/* Heatmap Modal */}
      <Heatmap
        config={config}
        isVisible={showHeatmap}
        onClose={() => setShowHeatmap(false)}
      />
    </div>
  );
}

export default App;
