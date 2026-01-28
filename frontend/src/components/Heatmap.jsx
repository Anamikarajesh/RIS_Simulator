import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Enhanced Heatmap Component with RIS Gain Verification
 * Smoother visualization with interpolation
 */

// Format gain with appropriate precision
const formatGain = (value) => {
    if (value === undefined || value === null) return 'N/A';
    const absVal = Math.abs(value);
    if (absVal >= 1) {
        return `${value.toFixed(2)} dB`;
    } else if (absVal >= 0.01) {
        return `${value.toFixed(4)} dB`;
    } else if (absVal >= 0.0001) {
        return `${(value * 1000).toFixed(2)} mdB`;  // milli-dB
    } else if (absVal > 0) {
        return `${value.toExponential(2)} dB`;
    } else {
        return '0.0000 dB';
    }
};

// HSL to RGB conversion for smooth color rendering
const hslToRgb = (h, s, l) => {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

export default function Heatmap({ config, isVisible, onClose }) {
    const canvasRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [heatmapData, setHeatmapData] = useState(null);
    const [error, setError] = useState(null);
    const [nextRefresh, setNextRefresh] = useState(15);
    const [viewMode, setViewMode] = useState('ris'); // 'ris', 'direct', 'gain'
    const [zoomOnRIS, setZoomOnRIS] = useState(false);

    // Higher resolution for smoother visualization
    const gridSize = 80;

    const getGridExtent = useCallback(() => {
        // When zoomed, focus on RIS area
        if (zoomOnRIS && config.ris_nodes?.length) {
            const risPos = config.ris_nodes[0].pos;
            // Small area around RIS (±5m)
            return 5;
        }

        let maxDist = 10;
        const allNodes = [
            ...(config.tx_nodes || []),
            ...(config.rx_nodes || []),
            ...(config.ris_nodes || [])
        ];
        allNodes.forEach(node => {
            const pos = node.pos || [0, 0, 0];
            const dist = Math.max(Math.abs(pos[0]), Math.abs(pos[2]));
            if (dist > maxDist) maxDist = dist;
        });
        return Math.ceil(maxDist * 1.3);
    }, [config, zoomOnRIS]);

    const generateHeatmap = useCallback(async () => {
        if (!config.tx_nodes?.length || !config.ris_nodes?.length) {
            setError('Need at least 1 Tx and 1 RIS');
            return;
        }

        setLoading(true);
        setError(null);

        const gridExtent = getGridExtent();
        const txPos = config.tx_nodes[0].pos;
        const risPos = config.ris_nodes[0].pos;
        const nElements = config.ris_nodes[0].elements || 40;

        try {
            const response = await fetch('http://localhost:8000/api/heatmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tx_pos: txPos,
                    ris_pos: risPos,
                    ris_rotation: config.ris_nodes[0].rotation || [0, 0, 0],
                    grid_size: gridSize,
                    grid_extent: gridExtent,
                    height: 1.5,
                    n_elements: nElements,
                    frequency_ghz: config.frequency_ghz || 5.5,
                    tx_power_dbm: config.tx_power_dbm || 20,
                    phase_coherence: config.phase_coherence || 0.5
                })
            });

            if (!response.ok) throw new Error('Backend error');

            const data = await response.json();
            const risRotation = config.ris_nodes[0].rotation || [0, 0, 0];
            setHeatmapData({ ...data, gridExtent, txPos, risPos, risRotation });
        } catch (e) {
            console.error('Heatmap error:', e);
            setError(`Failed: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }, [config, getGridExtent]);

    // Color interpolation
    const interpolateColor = (value, min, max, mode) => {
        const range = max - min || 0.001;
        const normalized = Math.max(0, Math.min(1, (value - min) / range));

        if (mode === 'gain') {
            // For RIS gain: Blue (negative) -> White (zero) -> Red (positive)
            // Use the actual min/max range
            const midpoint = (max + min) / 2;
            if (value >= midpoint) {
                // Positive half: white to red
                const intensity = (value - midpoint) / (max - midpoint + 0.001);
                return `rgb(255, ${Math.floor(255 - intensity * 200)}, ${Math.floor(255 - intensity * 200)})`;
            } else {
                // Negative half: blue to white
                const intensity = (midpoint - value) / (midpoint - min + 0.001);
                return `rgb(${Math.floor(255 - intensity * 200)}, ${Math.floor(255 - intensity * 200)}, 255)`;
            }
        } else {
            // Standard power: Blue (low) -> Cyan -> Green -> Yellow -> Red (high)
            const hue = (1 - normalized) * 240;
            return `hsl(${hue}, 90%, 50%)`;
        }
    };

    const renderHeatmap = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !heatmapData) return;

        const ctx = canvas.getContext('2d');
        const gridExtent = heatmapData.gridExtent;
        const txPos = heatmapData.txPos;
        const risPos = heatmapData.risPos;

        // Select data based on view mode
        let data, minVal, maxVal;
        if (viewMode === 'gain') {
            data = heatmapData.heatmap_gain;
            minVal = heatmapData.min_gain;
            maxVal = heatmapData.max_gain;
        } else if (viewMode === 'direct') {
            data = heatmapData.heatmap_direct;
            minVal = Math.min(...data.flat());
            maxVal = Math.max(...data.flat());
        } else {
            data = heatmapData.heatmap;
            minVal = heatmapData.min_power;
            maxVal = heatmapData.max_power;
        }

        if (!data) return;
        const size = data.length;

        canvas.width = 500;
        canvas.height = 500;

        // Bilinear interpolation for smooth rendering
        const getValue = (x, y) => {
            const xi = Math.floor(x);
            const yi = Math.floor(y);
            const xf = x - xi;
            const yf = y - yi;

            const x0 = Math.max(0, Math.min(size - 1, xi));
            const x1 = Math.max(0, Math.min(size - 1, xi + 1));
            const y0 = Math.max(0, Math.min(size - 1, yi));
            const y1 = Math.max(0, Math.min(size - 1, yi + 1));

            const v00 = data[y0][x0];
            const v10 = data[y0][x1];
            const v01 = data[y1][x0];
            const v11 = data[y1][x1];

            return v00 * (1 - xf) * (1 - yf) + v10 * xf * (1 - yf) +
                v01 * (1 - xf) * yf + v11 * xf * yf;
        };

        // Create ImageData for smooth pixel-by-pixel rendering
        const imageData = ctx.createImageData(canvas.width, canvas.height);
        const pixels = imageData.data;

        for (let py = 0; py < canvas.height; py++) {
            for (let px = 0; px < canvas.width; px++) {
                // Map pixel to data grid
                const gx = (px / canvas.width) * (size - 1);
                const gy = ((canvas.height - 1 - py) / canvas.height) * (size - 1);

                const value = getValue(gx, gy);
                const color = interpolateColor(value, minVal, maxVal, viewMode);

                // Parse color
                const idx = (py * canvas.width + px) * 4;
                if (color.startsWith('rgb')) {
                    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                    if (match) {
                        pixels[idx] = parseInt(match[1]);
                        pixels[idx + 1] = parseInt(match[2]);
                        pixels[idx + 2] = parseInt(match[3]);
                        pixels[idx + 3] = 255;
                    }
                } else if (color.startsWith('hsl')) {
                    const match = color.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
                    if (match) {
                        const [r, g, b] = hslToRgb(parseFloat(match[1]) / 360, parseFloat(match[2]) / 100, parseFloat(match[3]) / 100);
                        pixels[idx] = r;
                        pixels[idx + 1] = g;
                        pixels[idx + 2] = b;
                        pixels[idx + 3] = 255;
                    }
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);

        // Draw contour lines
        const numContours = 8;
        const contourStep = (maxVal - minVal) / numContours;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;

        for (let c = 1; c < numContours; c++) {
            const threshold = minVal + c * contourStep;
            ctx.beginPath();

            for (let py = 1; py < canvas.height - 1; py += 2) {
                for (let px = 1; px < canvas.width - 1; px += 2) {
                    const gx = (px / canvas.width) * (size - 1);
                    const gy = ((canvas.height - 1 - py) / canvas.height) * (size - 1);
                    const val = getValue(gx, gy);

                    const gxNext = ((px + 2) / canvas.width) * (size - 1);
                    const valNext = getValue(gxNext, gy);

                    if ((val <= threshold && valNext > threshold) || (val > threshold && valNext <= threshold)) {
                        ctx.moveTo(px, py);
                        ctx.lineTo(px + 1, py);
                    }
                }
            }
            ctx.stroke();
        }

        // World to canvas conversion
        const worldToCanvas = (x, z) => {
            const canvasX = ((x + gridExtent) / (2 * gridExtent)) * canvas.width;
            const canvasZ = canvas.height - ((z + gridExtent) / (2 * gridExtent)) * canvas.height;
            return [canvasX, canvasZ];
        };

        // Draw Tx marker
        const [txX, txZ] = worldToCanvas(txPos[0], txPos[2]);
        ctx.fillStyle = '#3b82f6';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(txX, txZ, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Tx', txX, txZ + 4);

        // Draw RIS marker
        const [risX, risZ] = worldToCanvas(risPos[0], risPos[2]);
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#ffffff';
        ctx.fillRect(risX - 10, risZ - 10, 20, 20);
        ctx.strokeRect(risX - 10, risZ - 10, 20, 20);
        ctx.fillStyle = 'black';
        ctx.font = 'bold 9px Arial';
        ctx.fillText('RIS', risX, risZ + 3);

        // Draw Rx markers
        (config.rx_nodes || []).slice(0, 10).forEach((rx) => {
            const [rxX, rxZ] = worldToCanvas(rx.pos[0], rx.pos[2]);
            ctx.fillStyle = '#22c55e';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(rxX, rxZ, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        // Draw axis labels
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${-gridExtent}m`, 25, canvas.height - 8);
        ctx.fillText(`${gridExtent}m`, canvas.width - 25, canvas.height - 8);
        ctx.fillText('X', canvas.width / 2, canvas.height - 8);
    }, [heatmapData, viewMode, config]);

    // Generate on open
    useEffect(() => {
        if (!isVisible) return;
        generateHeatmap();
        setNextRefresh(15);

        const countdownInterval = setInterval(() => {
            setNextRefresh(prev => {
                if (prev <= 1) {
                    generateHeatmap();
                    return 15;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, [isVisible]);

    // Re-render when data or viewMode changes
    useEffect(() => {
        if (heatmapData && canvasRef.current) {
            renderHeatmap();
        }
    }, [heatmapData, viewMode, renderHeatmap]);

    if (!isVisible) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                borderRadius: '12px',
                padding: '20px',
                maxWidth: '520px',
                width: '95%',
                border: '1px solid #334155'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h2 style={{ color: '#22d3ee', margin: 0, fontSize: '16px' }}>🗺️ Coverage Analysis</h2>
                        <span style={{ color: '#64748b', fontSize: '10px' }}>Refresh: {nextRefresh}s</span>
                    </div>
                    <button onClick={onClose} style={{ background: '#ef4444', border: 'none', borderRadius: '4px', padding: '4px 12px', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                </div>

                {/* View Mode Toggle */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    {[
                        { id: 'ris', label: '📡 With RIS', color: '#3b82f6' },
                        { id: 'direct', label: '📶 Direct Only', color: '#f59e0b' },
                        { id: 'gain', label: '📈 RIS Gain', color: '#22c55e' }
                    ].map(mode => (
                        <button
                            key={mode.id}
                            onClick={() => setViewMode(mode.id)}
                            style={{
                                flex: 1,
                                padding: '6px',
                                background: viewMode === mode.id ? mode.color : '#334155',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '10px',
                                fontWeight: viewMode === mode.id ? 'bold' : 'normal'
                            }}
                        >{mode.label}</button>
                    ))}
                </div>

                {/* Zoom Toggle */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                    <button
                        onClick={() => { setZoomOnRIS(false); generateHeatmap(); }}
                        style={{
                            flex: 1,
                            padding: '5px',
                            background: !zoomOnRIS ? '#8b5cf6' : '#334155',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '9px'
                        }}
                    >🌍 Full View</button>
                    <button
                        onClick={() => { setZoomOnRIS(true); generateHeatmap(); }}
                        style={{
                            flex: 1,
                            padding: '5px',
                            background: zoomOnRIS ? '#8b5cf6' : '#334155',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '9px'
                        }}
                    >🔍 Zoom RIS (±5m)</button>
                </div>

                {loading && (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                        <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
                        Calculating coverage...
                    </div>
                )}

                {error && (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#ef4444', background: '#1e1e2e', borderRadius: '8px' }}>
                        ❌ {error}
                    </div>
                )}

                {!loading && !error && heatmapData && (
                    <>
                        <canvas ref={canvasRef} style={{ width: '100%', borderRadius: '8px', border: '1px solid #475569' }} />

                        {/* Legend */}
                        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#94a3b8', fontSize: '10px' }}>
                                {viewMode === 'gain' ? 'RIS Gain:' : 'Rx Power:'}
                            </span>
                            <div style={{
                                flex: 1,
                                height: '12px',
                                background: viewMode === 'gain'
                                    ? 'linear-gradient(to right, #dc2626, #fbbf24, #22c55e)'
                                    : 'linear-gradient(to right, hsl(240,90%,50%), hsl(180,90%,50%), hsl(120,90%,50%), hsl(60,90%,50%), hsl(0,90%,50%))',
                                borderRadius: '4px'
                            }} />
                            <span style={{ color: '#94a3b8', fontSize: '9px' }}>
                                {viewMode === 'gain'
                                    ? `${formatGain(heatmapData.min_gain)} → ${formatGain(heatmapData.max_gain)}`
                                    : `${heatmapData.min_power?.toFixed(0)} → ${heatmapData.max_power?.toFixed(0)} dBm`}
                            </span>
                        </div>

                        {/* RIS Gain Stats */}
                        {heatmapData.avg_gain !== undefined && (
                            <div style={{ marginTop: '8px', padding: '8px', background: '#0f172a', borderRadius: '6px', fontSize: '10px' }}>
                                <div style={{ color: '#22c55e', fontWeight: 'bold', marginBottom: '4px' }}>📊 RIS Boost Verification</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', color: '#e2e8f0' }}>
                                    <div>Avg: <b style={{ color: heatmapData.avg_gain > 0 ? '#22c55e' : '#ef4444' }}>
                                        {formatGain(heatmapData.avg_gain)}
                                    </b></div>
                                    <div>Max: <b style={{ color: '#3b82f6' }}>
                                        {formatGain(heatmapData.max_gain)}
                                    </b></div>
                                    <div>Min: <b>
                                        {formatGain(heatmapData.min_gain)}
                                    </b></div>
                                </div>
                            </div>
                        )}

                        {/* Info */}
                        <div style={{ marginTop: '8px', fontSize: '9px', color: '#64748b', display: 'flex', gap: '12px' }}>
                            <span>🔵 Tx</span>
                            <span>🟡 RIS ({config.ris_nodes?.[0]?.elements || 40} elem)</span>
                            <span>🟢 Rx</span>
                            <span>Height: 1.5m</span>
                        </div>

                        <button
                            onClick={generateHeatmap}
                            style={{
                                marginTop: '10px',
                                width: '100%',
                                padding: '8px',
                                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                border: 'none',
                                borderRadius: '6px',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 'bold'
                            }}
                        >🔄 Regenerate</button>
                    </>
                )}
            </div>
        </div >
    );
}
