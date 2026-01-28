import React, { useState } from 'react';

/**
 * Scenarios based on:
 * - FuTURE Forum White Paper (2025)
 * - Ellingson experimental setup (45° polar sector, 5×8 RIS)
 */

// Helper: Generate 45° polar sector Rx positions (experimental setup)
function generatePolarSectorRx(count, radius, sectorAngleDeg = 45, angularResolutionDeg = 10, radialSpacingM = 0.3) {
    const nodes = [];
    let id = 1;

    // Convert to radians
    const sectorAngle = sectorAngleDeg * Math.PI / 180;
    const angularStep = angularResolutionDeg * Math.PI / 180;

    // Number of angular positions
    const numAngles = Math.floor(sectorAngle / angularStep) + 1;

    // Number of radial positions
    const numRadii = Math.floor(radius / radialSpacingM);

    for (let r = 1; r <= numRadii && nodes.length < count; r++) {
        const currentRadius = r * radialSpacingM;
        for (let a = 0; a < numAngles && nodes.length < count; a++) {
            const angle = -sectorAngle / 2 + a * angularStep; // Center the sector
            nodes.push({
                id: `UE-${id++}`,
                pos: [currentRadius * Math.sin(angle), 1.5, currentRadius * Math.cos(angle)]
            });
        }
    }
    return nodes;
}

// Generate RIS panels along the edge of Rx sector
function generateSectorEdgeRIS(count, radius, sectorAngleDeg = 45) {
    const nodes = [];
    const sectorAngle = sectorAngleDeg * Math.PI / 180;

    for (let i = 0; i < count; i++) {
        const angle = -sectorAngle / 2 + (i / (count - 1 || 1)) * sectorAngle;
        const dist = radius * 1.1; // Just beyond the Rx sector
        nodes.push({
            id: `RIS-${i + 1}`,
            pos: [dist * Math.sin(angle), 2.5, dist * Math.cos(angle)],
            rotation: [0, -angle, 0], // Face back towards Tx
            size: 0.4, // 5×8 elements at ~1cm spacing
            elements: 40 // 5×8 = 40
        });
    }
    return nodes;
}

// Helper: Generate 7-cell hexagonal BS positions
function generateHexBSPositions(isd = 500) {
    const nodes = [{ id: 'BS-1', pos: [0, 25, 0], power_dbm: 46 }];
    const angles = [0, 60, 120, 180, 240, 300].map(a => a * Math.PI / 180);
    for (let i = 0; i < 6; i++) {
        nodes.push({
            id: `BS-${i + 2}`,
            pos: [isd * Math.cos(angles[i]), 25, isd * Math.sin(angles[i])],
            power_dbm: 46
        });
    }
    return nodes;
}

// Generate RIS at cell edges
function generateCellEdgeRIS(isd, risPerSector = 4) {
    const nodes = [];
    const cellRadius = isd / Math.sqrt(3);
    let id = 1;

    for (let r = 0; r < risPerSector; r++) {
        const angle = (r / risPerSector) * 2 * Math.PI;
        const dist = cellRadius * 0.95;
        nodes.push({
            id: `RIS-${id++}`,
            pos: [dist * Math.cos(angle), 15, dist * Math.sin(angle)],
            rotation: [0, -angle, Math.PI / 18],
            size: 2.6,
            elements: 1600
        });
    }
    return nodes;
}

// Generate UEs
function generateUEs(count, isd, distribution = 'uniform') {
    const nodes = [];
    const cellRadius = isd / Math.sqrt(3);

    for (let i = 0; i < count; i++) {
        let x, z;
        if (distribution === 'cell_edge') {
            const angle = Math.random() * 2 * Math.PI;
            const dist = cellRadius * (0.85 + Math.random() * 0.05);
            x = dist * Math.cos(angle);
            z = dist * Math.sin(angle);
        } else {
            x = (Math.random() - 0.5) * isd * 1.5;
            z = (Math.random() - 0.5) * isd * 1.5;
        }
        nodes.push({ id: `UE-${i + 1}`, pos: [x, 1.5, z] });
    }
    return nodes;
}

// Preset Scenarios
const SCENARIOS = [
    {
        id: 'basic',
        name: '🔹 Basic: 1 BS, 1 UE, 1 RIS',
        description: 'Simple single-hop RIS relay',
        config: {
            tx_nodes: [{ id: 'BS-1', pos: [0, 5, 0], power_dbm: 20 }],
            rx_nodes: [{ id: 'UE-1', pos: [5, 1.5, 5] }],
            ris_nodes: [{ id: 'RIS-1', pos: [2.5, 2.5, 2.5], rotation: [0, -Math.PI / 4, 0], size: 0.4, elements: 40 }],
            frequency_ghz: 3.5
        }
    },
    {
        id: 'ellingson_experimental',
        name: '🔬 Ellingson Exp: 45° Polar Sector',
        description: '1 Tx, 30 Rx (45° sector, 30cm radial, 10° angular), 2x 5×8 RIS',
        config: {
            tx_nodes: [{ id: 'Tx', pos: [0, 1.5, -2], power_dbm: 20 }],
            rx_nodes: generatePolarSectorRx(30, 3.0, 45, 10, 0.3),
            ris_nodes: [
                { id: 'RIS-σ1', pos: [1.5, 2, 3], rotation: [0, Math.PI, 0], size: 0.4, elements: 40, phase: 49.64 },
                { id: 'RIS-σ2', pos: [-1.5, 2, 3], rotation: [0, Math.PI, 0], size: 0.4, elements: 40, phase: -153.77 }
            ],
            frequency_ghz: 3.5
        }
    },
    {
        id: 'ellingson_emulation',
        name: '🎯 Ellingson Emulation: 1Tx, 30Rx',
        description: 'Emulation matching experimental polar grid setup',
        config: {
            tx_nodes: [{ id: 'Tx', pos: [0, 1.5, -3], power_dbm: 20 }],
            rx_nodes: generatePolarSectorRx(30, 4.0, 45, 10, 0.4),
            ris_nodes: generateSectorEdgeRIS(3, 4.0, 45),
            frequency_ghz: 3.5
        }
    },
    {
        id: 'wp_case1_40x40',
        name: '📋 White Paper: 7-Cell, 40×40 RIS',
        description: 'System-level: 7 cells, 4 large RIS/sector',
        config: {
            tx_nodes: generateHexBSPositions(500),
            rx_nodes: generateUEs(50, 500, 'cell_edge'),
            ris_nodes: generateCellEdgeRIS(500, 4),
            frequency_ghz: 2.6
        }
    },
    {
        id: 'multi_ris',
        name: '🔹 Multi-RIS Interference',
        description: '2 BS, 4 RIS panels, interference scenario',
        config: {
            tx_nodes: [
                { id: 'BS-1', pos: [-50, 25, 0], power_dbm: 46 },
                { id: 'BS-2', pos: [50, 25, 0], power_dbm: 46 }
            ],
            rx_nodes: [{ id: 'UE-1', pos: [0, 1.5, 40] }],
            ris_nodes: [
                { id: 'RIS-1', pos: [-25, 15, 20], rotation: [0, Math.PI / 6, 0], size: 2.6, elements: 256 },
                { id: 'RIS-2', pos: [25, 15, 20], rotation: [0, -Math.PI / 6, 0], size: 2.6, elements: 256 },
                { id: 'RIS-3', pos: [-25, 15, -20], rotation: [0, -Math.PI / 6, 0], size: 2.6, elements: 256 },
                { id: 'RIS-4', pos: [25, 15, -20], rotation: [0, Math.PI / 6, 0], size: 2.6, elements: 256 }
            ],
            frequency_ghz: 2.6
        }
    },
    {
        id: 'nlos_indoor',
        name: '🏢 NLOS Indoor (RIS Benefit)',
        description: 'Indoor NLOS: direct path blocked, RIS provides coverage',
        config: {
            tx_nodes: [{ id: 'BS', pos: [0, 3, -10], power_dbm: 23 }],
            rx_nodes: [
                { id: 'UE-1', pos: [5, 1.5, 8] },
                { id: 'UE-2', pos: [-3, 1.5, 6] },
                { id: 'UE-3', pos: [0, 1.5, 10] }
            ],
            ris_nodes: [{ id: 'RIS-1', pos: [0, 2.5, 0], rotation: [0, 0, 0], size: 1.0, elements: 256 }],
            frequency_ghz: 28,  // mmWave - RIS more beneficial
            nlos_mode: true
        }
    },
    {
        id: 'custom',
        name: '⚙️ Custom Configuration',
        description: 'Define your own scenario',
        config: null
    }
];

const QUANTIZATION_BITS = [
    { value: 0, label: 'Continuous' },
    { value: 1, label: '1-bit (2 states)' },
    { value: 2, label: '2-bit (4 states) ★' },
    { value: 3, label: '3-bit (8 states)' }
];

const MOBILITY_MODELS = [
    { value: 'static', label: 'Static' },
    { value: 'random_waypoint', label: 'Random Waypoint' },
    { value: 'gaussian', label: 'Gaussian Markov' }
];

export default function ConfigPanel({ config, onConfigChange, onScenarioLoad, onStartSimulation, isRunning, onShowHeatmap }) {
    const [selectedScenario, setSelectedScenario] = useState('basic');

    const handleScenarioChange = (scenarioId) => {
        setSelectedScenario(scenarioId);
        const scenario = SCENARIOS.find(s => s.id === scenarioId);
        if (scenario && scenario.config) {
            onScenarioLoad(scenario.config);
        }
    };

    const sectionStyle = {
        background: 'linear-gradient(145deg, #1e293b, #0f172a)',
        borderRadius: '10px',
        padding: '10px',
        marginBottom: '8px',
        border: '1px solid #334155'
    };

    const labelStyle = { color: '#94a3b8', fontSize: '10px', marginBottom: '2px', display: 'block' };
    const inputStyle = {
        background: '#0f172a',
        border: '1px solid #475569',
        borderRadius: '5px',
        padding: '5px',
        width: '100%',
        color: '#e2e8f0',
        fontSize: '11px'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            <h2 style={{ color: '#06b6d4', fontSize: '14px', marginBottom: '2px' }}>⚙️ Configuration</h2>

            {/* Scenario Selector */}
            <div style={{ ...sectionStyle, background: 'linear-gradient(145deg, #1e3a5f, #0f172a)' }}>
                <h3 style={{ color: '#fbbf24', fontSize: '11px', marginBottom: '4px' }}>📋 Scenarios</h3>
                <select
                    style={{ ...inputStyle, fontWeight: 'bold' }}
                    value={selectedScenario}
                    onChange={(e) => handleScenarioChange(e.target.value)}
                >
                    {SCENARIOS.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                <p style={{ color: '#64748b', fontSize: '9px', marginTop: '3px' }}>
                    {SCENARIOS.find(s => s.id === selectedScenario)?.description}
                </p>
            </div>

            {/* Node Summary */}
            <div style={sectionStyle}>
                <h3 style={{ color: '#22d3ee', fontSize: '10px', marginBottom: '4px' }}>📊 Nodes</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', textAlign: 'center' }}>
                    <div style={{ background: '#3b82f6', borderRadius: '4px', padding: '4px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{config.tx_nodes?.length || 1}</div>
                        <div style={{ fontSize: '8px' }}>Tx</div>
                    </div>
                    <div style={{ background: '#22c55e', borderRadius: '4px', padding: '4px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{config.rx_nodes?.length || 1}</div>
                        <div style={{ fontSize: '8px' }}>Rx</div>
                    </div>
                    <div style={{ background: '#f59e0b', borderRadius: '4px', padding: '4px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{config.ris_nodes?.length || 1}</div>
                        <div style={{ fontSize: '8px' }}>RIS</div>
                    </div>
                </div>
            </div>

            {/* RIS Phase */}
            <div style={sectionStyle}>
                <h3 style={{ color: '#fbbf24', fontSize: '10px', marginBottom: '4px' }}>🔲 RIS Phase</h3>
                <select style={inputStyle} value={config.ris_bits || 2}
                    onChange={(e) => onConfigChange('ris_bits', parseInt(e.target.value))}>
                    {QUANTIZATION_BITS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                </select>
            </div>

            {/* Channel */}
            <div style={sectionStyle}>
                <h3 style={{ color: '#a78bfa', fontSize: '10px', marginBottom: '4px' }}>📶 Channel</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div>
                        <label style={labelStyle}>Freq (GHz)</label>
                        <input type="number" style={inputStyle} step="0.1" value={config.frequency_ghz || 2.6}
                            onChange={(e) => onConfigChange('frequency_ghz', parseFloat(e.target.value))} />
                    </div>
                    <div>
                        <label style={labelStyle}>Mobility</label>
                        <select style={inputStyle} value={config.rx_mobility || 'static'}
                            onChange={(e) => onConfigChange('rx_mobility', e.target.value)}>
                            {MOBILITY_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Tx Power Slider */}
                <div style={{ marginTop: '8px' }}>
                    <label style={labelStyle}>Tx Power: <b style={{ color: '#22c55e' }}>{config.tx_power_dbm || 20} dBm</b></label>
                    <input
                        type="range"
                        min="0"
                        max="46"
                        step="1"
                        value={config.tx_power_dbm || 20}
                        onChange={(e) => onConfigChange('tx_power_dbm', parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: '#22c55e' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#64748b' }}>
                        <span>0 dBm</span>
                        <span>23 dBm (Indoor)</span>
                        <span>46 dBm (Macro)</span>
                    </div>
                </div>

                {/* Phase Coherence */}
                <div style={{ marginTop: '8px' }}>
                    <label style={labelStyle}>RIS Phase Coherence: <b style={{ color: '#3b82f6' }}>{((config.phase_coherence || 0.5) * 100).toFixed(0)}%</b></label>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={config.phase_coherence || 0.5}
                        onChange={(e) => onConfigChange('phase_coherence', parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: '#3b82f6' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#64748b' }}>
                        <span>0% (Random)</span>
                        <span>50% (Partial)</span>
                        <span>100% (Optimal)</span>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '6px' }}>
                <button
                    onClick={onStartSimulation}
                    style={{
                        flex: 1,
                        padding: '10px',
                        background: isRunning
                            ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                            : 'linear-gradient(135deg, #22c55e, #15803d)',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'white',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                >
                    {isRunning ? '⏹ Stop' : '▶ Start'}
                </button>
                <button
                    onClick={onShowHeatmap}
                    style={{
                        padding: '10px 14px',
                        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'white',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                >
                    🗺️
                </button>
            </div>
        </div>
    );
}
