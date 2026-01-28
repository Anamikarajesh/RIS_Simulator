import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Text, Line } from '@react-three/drei';
import * as THREE from 'three';

// RIS Panel Component - Uses TransformControls for cleaner CAD-like control
function RISPanel({ id, position, rotation = [0, 0, 0], size = 5, elements = 64, showGizmo, transformMode, onTransform }) {
    const groupRef = useRef();
    const elementsPerSide = Math.sqrt(elements);
    const cellSize = size / elementsPerSide;

    return (
        <group>
            <group ref={groupRef} position={position} rotation={rotation}>
                {/* RIS Back Panel */}
                <mesh position={[0, 0, -0.05]}>
                    <boxGeometry args={[size + 0.2, size + 0.2, 0.1]} />
                    <meshStandardMaterial color="#1a1a2e" metalness={0.9} roughness={0.1} />
                </mesh>

                {/* Simplified RIS Grid */}
                {Array.from({ length: Math.min(elements, 25) }).map((_, i) => {
                    const row = Math.floor(i / Math.sqrt(25));
                    const col = i % Math.sqrt(25);
                    const gridSize = Math.sqrt(25);
                    const x = (col - gridSize / 2 + 0.5) * (size / gridSize);
                    const y = (row - gridSize / 2 + 0.5) * (size / gridSize);
                    return (
                        <mesh key={i} position={[x, y, 0.02]}>
                            <boxGeometry args={[size / gridSize * 0.85, size / gridSize * 0.85, 0.02]} />
                            <meshStandardMaterial color="#ffd700" metalness={0.7} roughness={0.3} emissive="#ff8800" emissiveIntensity={0.1} />
                        </mesh>
                    );
                })}

                {/* Normal Direction Arrow */}
                <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0.05), 2, 0x00ffff, 0.3, 0.2]} />

                <Text position={[0, size / 2 + 0.3, 0]} fontSize={0.4} color="#ffd700" anchorX="center">
                    {id}
                </Text>
            </group>

            {showGizmo && groupRef.current && (
                <TransformControls
                    object={groupRef.current}
                    mode={transformMode}
                    size={0.8}
                    onObjectChange={() => {
                        if (groupRef.current && onTransform) {
                            onTransform(id, groupRef.current.position.toArray(), groupRef.current.rotation.toArray());
                        }
                    }}
                />
            )}
        </group>
    );
}

// Transmitter Node
function TxNode({ id, position, showGizmo, transformMode, onTransform }) {
    const groupRef = useRef();

    return (
        <group>
            <group ref={groupRef} position={position}>
                <mesh position={[0, 0, 0]}>
                    <cylinderGeometry args={[0.3, 0.5, 3, 8]} />
                    <meshStandardMaterial color="#3b82f6" metalness={0.5} roughness={0.3} />
                </mesh>
                <mesh position={[0, 2.2, 0]}>
                    <coneGeometry args={[0.8, 1.2, 8]} />
                    <meshStandardMaterial color="#60a5fa" metalness={0.6} roughness={0.2} />
                </mesh>
                <Text position={[0, 3.5, 0]} fontSize={0.4} color="#60a5fa" anchorX="center">
                    {id}
                </Text>
            </group>

            {showGizmo && groupRef.current && (
                <TransformControls
                    object={groupRef.current}
                    mode={transformMode}
                    size={0.6}
                    onObjectChange={() => {
                        if (groupRef.current && onTransform) {
                            onTransform(id, groupRef.current.position.toArray());
                        }
                    }}
                />
            )}
        </group>
    );
}

// Receiver Node - simplified for multiple Rx
function RxNode({ id, position, showGizmo, transformMode, onTransform, isSelected }) {
    const groupRef = useRef();

    return (
        <group>
            <group ref={groupRef} position={position}>
                <mesh>
                    <sphereGeometry args={[0.2, 16, 16]} />
                    <meshStandardMaterial
                        color={isSelected ? "#ff6b6b" : "#22c55e"}
                        emissive={isSelected ? "#ff0000" : "#00ff00"}
                        emissiveIntensity={isSelected ? 0.3 : 0.1}
                    />
                </mesh>
            </group>

            {showGizmo && groupRef.current && (
                <TransformControls
                    object={groupRef.current}
                    mode={transformMode}
                    size={0.5}
                    onObjectChange={() => {
                        if (groupRef.current && onTransform) {
                            onTransform(id, groupRef.current.position.toArray());
                        }
                    }}
                />
            )}
        </group>
    );
}

// Dynamic Signal Paths
function SignalPaths({ txNodes, rxNodes, risNodes, showSignals, showDirect, showReflected, selectedRxId }) {
    const [, setTick] = useState(0);
    useFrame(() => setTick(t => t + 1));

    if (!showSignals) return null;

    const paths = [];

    txNodes.forEach((tx, ti) => {
        // Only show paths to selected Rx or first 3 if many
        const rxToShow = selectedRxId
            ? rxNodes.filter(rx => rx.id === selectedRxId)
            : rxNodes.slice(0, 3);

        rxToShow.forEach((rx, ri) => {
            if (showDirect) {
                paths.push(
                    <Line key={`direct-${ti}-${ri}`} points={[tx.pos, rx.pos]} color="#ff4444" lineWidth={1} dashed dashSize={0.5} gapSize={0.5} />
                );
            }

            if (showReflected) {
                risNodes.forEach((ris, risi) => {
                    paths.push(<Line key={`tx-ris-${ti}-${risi}-${ri}`} points={[tx.pos, ris.pos]} color="#00ffff" lineWidth={2} />);
                    paths.push(<Line key={`ris-rx-${risi}-${ri}-${ti}`} points={[ris.pos, rx.pos]} color="#00ff88" lineWidth={2} />);
                });
            }
        });
    });

    return <>{paths}</>;
}

export default function Viewport3D({ config, isRunning, onConfigUpdate, simulationTime }) {
    const [showSignals, setShowSignals] = useState(true);
    const [showDirect, setShowDirect] = useState(false);
    const [showReflected, setShowReflected] = useState(true);
    const [showGizmos, setShowGizmos] = useState(false);
    const [transformMode, setTransformMode] = useState('translate');
    const [selectedNodeId, setSelectedNodeId] = useState(null);

    // Use config directly - no local state that retains old values
    const txNodes = config.tx_nodes || [];
    const rxNodes = config.rx_nodes || [];
    const risNodes = config.ris_nodes || [];

    const handleTransform = (type, id, pos, rot) => {
        if (onConfigUpdate) {
            onConfigUpdate(type, id, pos, rot);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    return (
        <>
            {/* Control Panel */}
            <div style={{
                position: 'absolute',
                top: '60px',
                left: '16px',
                background: 'rgba(0,0,0,0.85)',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#e2e8f0',
                zIndex: 100,
                width: '160px'
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#06b6d4' }}>🎮 Controls</div>

                {/* Gizmo Toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '4px' }}>
                    <input type="checkbox" checked={showGizmos} onChange={(e) => setShowGizmos(e.target.checked)} />
                    Show Gizmos
                </label>

                {/* Transform Mode */}
                {showGizmos && (
                    <div style={{ marginTop: '6px', marginBottom: '6px' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>Transform Mode:</div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                onClick={() => setTransformMode('translate')}
                                style={{
                                    padding: '4px 8px',
                                    background: transformMode === 'translate' ? '#3b82f6' : '#334155',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '10px'
                                }}
                            >Move</button>
                            <button
                                onClick={() => setTransformMode('rotate')}
                                style={{
                                    padding: '4px 8px',
                                    background: transformMode === 'rotate' ? '#f59e0b' : '#334155',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '10px'
                                }}
                            >Rotate</button>
                        </div>
                    </div>
                )}

                <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '8px 0' }} />

                <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#22d3ee' }}>📡 Signals</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showSignals} onChange={(e) => setShowSignals(e.target.checked)} />
                    Show Traces
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginTop: '2px' }}>
                    <input type="checkbox" checked={showDirect} onChange={(e) => setShowDirect(e.target.checked)} />
                    <span style={{ color: '#ff4444' }}>Direct</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginTop: '2px' }}>
                    <input type="checkbox" checked={showReflected} onChange={(e) => setShowReflected(e.target.checked)} />
                    <span style={{ color: '#00ff88' }}>Reflected</span>
                </label>
            </div>

            {/* Simulation Timer */}
            {isRunning && (
                <div style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    background: 'rgba(0,0,0,0.8)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    color: '#22c55e',
                    zIndex: 100
                }}>
                    ⏱️ {formatTime(simulationTime || 0)}
                </div>
            )}

            <Canvas
                camera={{ position: [15, 12, 15], fov: 50, near: 0.1, far: 2000 }}
                style={{ background: 'linear-gradient(180deg, #050510 0%, #0a0a1a 100%)' }}
            >
                <color attach="background" args={['#050510']} />

                <ambientLight intensity={0.4} />
                <directionalLight position={[50, 100, 50]} intensity={0.8} />

                <OrbitControls makeDefault enablePan enableZoom enableRotate />

                <Grid infiniteGrid sectionSize={5} cellSize={1} sectionColor="#334155" cellColor="#1e293b" fadeDistance={100} />

                {/* Render Tx Nodes */}
                {txNodes.map((tx) => (
                    <TxNode
                        key={tx.id}
                        id={tx.id}
                        position={tx.pos}
                        showGizmo={showGizmos}
                        transformMode={transformMode}
                        onTransform={(id, pos) => handleTransform('tx', id, pos)}
                    />
                ))}

                {/* Render RIS Nodes */}
                {risNodes.map((ris) => (
                    <RISPanel
                        key={ris.id}
                        id={ris.id}
                        position={ris.pos}
                        rotation={ris.rotation || [0, 0, 0]}
                        size={ris.size || 1}
                        elements={ris.elements || 40}
                        showGizmo={showGizmos}
                        transformMode={transformMode}
                        onTransform={(id, pos, rot) => handleTransform('ris', id, pos, rot)}
                    />
                ))}

                {/* Render Rx Nodes */}
                {rxNodes.map((rx) => (
                    <RxNode
                        key={rx.id}
                        id={rx.id}
                        position={rx.pos}
                        showGizmo={showGizmos && rxNodes.length <= 5}
                        transformMode={transformMode}
                        onTransform={(id, pos) => handleTransform('rx', id, pos)}
                        isSelected={rx.id === selectedNodeId}
                    />
                ))}

                <SignalPaths
                    txNodes={txNodes}
                    rxNodes={rxNodes}
                    risNodes={risNodes}
                    showSignals={showSignals}
                    showDirect={showDirect}
                    showReflected={showReflected}
                    selectedRxId={selectedNodeId}
                />

                <axesHelper args={[10]} />
            </Canvas>
        </>
    );
}
