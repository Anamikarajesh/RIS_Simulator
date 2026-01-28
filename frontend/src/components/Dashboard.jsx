import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Dashboard({ state, config, simulationTime, isRunning, selectedRxId, onSelectRx }) {
    // Tx IQ data
    const txChartData = state.tx_iq && state.tx_iq.t && state.tx_iq.t.length > 0
        ? state.tx_iq.t.map((t, idx) => ({
            time: (t * 1e6).toFixed(1),
            I: state.tx_iq.real[idx] || 0,
            Q: state.tx_iq.imag[idx] || 0
        }))
        : [{ time: 0, I: 0, Q: 0 }];

    // Rx IQ data
    const rxChartData = state.rx_iq && state.rx_iq.t && state.rx_iq.t.length > 0
        ? state.rx_iq.t.map((t, idx) => ({
            time: (t * 1e6).toFixed(1),
            I: state.rx_iq.real[idx] || 0,
            Q: state.rx_iq.imag[idx] || 0
        }))
        : [{ time: 0, I: 0, Q: 0 }];

    const cardStyle = {
        background: 'linear-gradient(145deg, #1e293b, #0f172a)',
        borderRadius: '8px',
        padding: '10px',
        marginBottom: '8px',
        border: '1px solid #334155'
    };

    const rxNodes = config.rx_nodes || [];
    const risNodes = config.ris_nodes || [];
    const selectedRx = rxNodes.find(rx => rx.id === selectedRxId) || rxNodes[0];

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            <h2 style={{ color: '#06b6d4', fontSize: '13px', marginBottom: '2px' }}>📊 Live Data</h2>

            {/* Simulation Status */}
            <div style={{ ...cardStyle, background: isRunning ? 'linear-gradient(145deg, #14532d, #0f172a)' : cardStyle.background }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <span style={{ color: '#94a3b8', fontSize: '10px' }}>Status</span>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: isRunning ? '#22c55e' : '#64748b' }}>
                            {isRunning ? '▶ Running' : '⏸ Stopped'}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ color: '#94a3b8', fontSize: '10px' }}>Time</span>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#22d3ee', fontFamily: 'monospace' }}>
                            {formatTime(simulationTime || 0)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Rx Selector */}
            {rxNodes.length > 1 && (
                <div style={cardStyle}>
                    <h3 style={{ color: '#22c55e', fontSize: '10px', marginBottom: '4px' }}>🎯 Select Rx</h3>
                    <select
                        style={{
                            width: '100%',
                            padding: '5px',
                            background: '#0f172a',
                            border: '1px solid #475569',
                            borderRadius: '4px',
                            color: '#e2e8f0',
                            fontSize: '10px'
                        }}
                        value={selectedRxId || ''}
                        onChange={(e) => onSelectRx && onSelectRx(e.target.value)}
                    >
                        {rxNodes.map(rx => (
                            <option key={rx.id} value={rx.id}>{rx.id}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Channel Metrics */}
            <div style={cardStyle}>
                <h3 style={{ color: '#22d3ee', fontSize: '10px', marginBottom: '4px' }}>
                    📡 Channel → {selectedRx?.id || 'Rx'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: '#94a3b8', fontSize: '9px', margin: 0 }}>Path Loss</p>
                        <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#f472b6', fontFamily: 'monospace', margin: 0 }}>
                            {state.pathloss_db?.toFixed(1) || 0} dB
                        </p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: '#94a3b8', fontSize: '9px', margin: 0 }}>Rx Power</p>
                        <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#4ade80', fontFamily: 'monospace', margin: 0 }}>
                            {state.rx_power?.toFixed(1) || -100} dBm
                        </p>
                    </div>
                </div>
            </div>

            {/* Tx IQ Plot */}
            <div style={{ ...cardStyle, height: '100px', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ color: '#3b82f6', fontSize: '10px', marginBottom: '2px' }}>📤 Tx IQ (Transmitted)</h3>
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={txChartData} margin={{ top: 2, right: 5, left: -30, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 7 }} />
                            <YAxis domain={[-1.2, 1.2]} tick={{ fill: '#64748b', fontSize: 7 }} />
                            <Line type="monotone" dataKey="I" stroke="#3b82f6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                            <Line type="monotone" dataKey="Q" stroke="#60a5fa" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Rx IQ Plot */}
            <div style={{ ...cardStyle, height: '100px', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ color: '#22c55e', fontSize: '10px', marginBottom: '2px' }}>📥 Rx IQ (Received)</h3>
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rxChartData} margin={{ top: 2, right: 5, left: -30, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 7 }} />
                            <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 7 }} />
                            <Line type="monotone" dataKey="I" stroke="#22c55e" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                            <Line type="monotone" dataKey="Q" stroke="#4ade80" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Config Summary */}
            <div style={cardStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', fontSize: '9px' }}>
                    <div>Tx: <b>{config.tx_nodes?.length || 1}</b></div>
                    <div>Rx: <b style={{ color: '#22c55e' }}>{rxNodes.length}</b></div>
                    <div>RIS: <b style={{ color: '#fbbf24' }}>{risNodes.length}</b></div>
                    <div>Freq: <b>{config.frequency_ghz} GHz</b></div>
                </div>
            </div>
        </div>
    );
}
