'use client';

// ============================================================
// Learner: NEURAL CORTEX — Holographic Interface
// ============================================================
// Inspired by Iron Man's JARVIS holographic displays.
// Pure CSS 3D perspective transforms + SVG + scanline overlays.
//
// Design DNA:
//   - Monochrome cyan/teal hologram palette
//   - CSS perspective + preserve-3d for depth
//   - Scanline + noise overlay for CRT hologram feel
//   - Hex grid background for "tech blueprint" aesthetic
//   - Floating HUD metric readouts
//   - Wire-frame neuron rendering with glow edges
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBrainLiveData } from '@/lib/hooks/useBrainLiveData';
import type { NeuronId } from '@/lib/engine/neural-impulse-bus';

// ─── Types ───────────────────────────────────────────────────

interface NeuronNode {
    id: string;
    label: string;
    shortLabel: string;
    x: number;
    y: number;
    radius: number;
    description: string;
    activity: number;
    totalFirings: number;
    lastFired: number;
    tier: 'core' | 'inner' | 'outer';
    hue: number; // unique HSL hue for heatmap row
}

interface Synapse {
    id: string;
    from: string;
    to: string;
    active: boolean;
    signalProgress: number;
}

interface ActivitySnapshot {
    timestamp: number;
    activities: Record<string, number>;
}

interface BrainStats {
    totalSignals: number;
    avgActivity: number;
    dominantModule: string;
    learningRate: number;
    experienceLevel: number;
    activeConnections: number;
}

// ─── Neural Layout ───────────────────────────────────────────

const CW = 900;
const CH = 560;
const CX = CW / 2;
const CY = CH / 2;

function createNeuralNodes(): NeuronNode[] {
    return [
        { id: 'evolution', label: 'EVOLUTION ENGINE', shortLabel: 'EVO', x: CX, y: CY, radius: 42, description: 'Genetic algorithm core', activity: 0, totalFirings: 0, lastFired: 0, tier: 'core', hue: 270 },
        { id: 'bayesian', label: 'BAYESIAN CALIBRATOR', shortLabel: 'BAY', x: CX - 155, y: CY - 115, radius: 30, description: 'Signal confidence calibration', activity: 0, totalFirings: 0, lastFired: 0, tier: 'inner', hue: 210 },
        { id: 'metacog', label: 'METACOGNITIVE', shortLabel: 'META', x: CX + 155, y: CY - 115, radius: 30, description: 'Self-awareness layer', activity: 0, totalFirings: 0, lastFired: 0, tier: 'inner', hue: 320 },
        { id: 'kdss', label: 'STRATEGY SYNTHESIS', shortLabel: 'KDSS', x: CX - 155, y: CY + 115, radius: 30, description: 'Knowledge-directed construction', activity: 0, totalFirings: 0, lastFired: 0, tier: 'inner', hue: 30 },
        { id: 'saie', label: 'SURROGATE MODEL', shortLabel: 'SAIE', x: CX + 155, y: CY + 115, radius: 30, description: 'Fitness prediction engine', activity: 0, totalFirings: 0, lastFired: 0, tier: 'inner', hue: 170 },
        { id: 'market', label: 'MARKET INTEL', shortLabel: 'MKT', x: CX - 295, y: CY, radius: 26, description: 'External market awareness', activity: 0, totalFirings: 0, lastFired: 0, tier: 'outer', hue: 190 },
        { id: 'forensics', label: 'TRADE FORENSICS', shortLabel: 'FOR', x: CX + 295, y: CY, radius: 26, description: 'Post-trade attribution', activity: 0, totalFirings: 0, lastFired: 0, tier: 'outer', hue: 350 },
        { id: 'replay', label: 'EXPERIENCE REPLAY', shortLabel: 'EXP', x: CX, y: CY - 210, radius: 26, description: 'Institutional memory', activity: 0, totalFirings: 0, lastFired: 0, tier: 'outer', hue: 145 },
        { id: 'mapelites', label: 'MAP-ELITES', shortLabel: 'MAP', x: CX - 80, y: CY + 210, radius: 26, description: 'Quality-diversity grid', activity: 0, totalFirings: 0, lastFired: 0, tier: 'outer', hue: 250 },
        { id: 'regime', label: 'REGIME DETECTOR', shortLabel: 'REG', x: CX + 80, y: CY + 210, radius: 26, description: 'Market regime classification', activity: 0, totalFirings: 0, lastFired: 0, tier: 'outer', hue: 45 },
    ];
}

function createSynapses(): Synapse[] {
    return [
        { id: 's1', from: 'bayesian', to: 'evolution', active: false, signalProgress: 0 },
        { id: 's2', from: 'metacog', to: 'evolution', active: false, signalProgress: 0 },
        { id: 's3', from: 'kdss', to: 'evolution', active: false, signalProgress: 0 },
        { id: 's4', from: 'saie', to: 'evolution', active: false, signalProgress: 0 },
        { id: 's5', from: 'replay', to: 'evolution', active: false, signalProgress: 0 },
        { id: 's6', from: 'mapelites', to: 'evolution', active: false, signalProgress: 0 },
        { id: 's7', from: 'market', to: 'bayesian', active: false, signalProgress: 0 },
        { id: 's8', from: 'market', to: 'metacog', active: false, signalProgress: 0 },
        { id: 's9', from: 'regime', to: 'bayesian', active: false, signalProgress: 0 },
        { id: 's10', from: 'regime', to: 'kdss', active: false, signalProgress: 0 },
        { id: 's11', from: 'forensics', to: 'bayesian', active: false, signalProgress: 0 },
        { id: 's12', from: 'forensics', to: 'replay', active: false, signalProgress: 0 },
        { id: 's13', from: 'bayesian', to: 'kdss', active: false, signalProgress: 0 },
        { id: 's14', from: 'saie', to: 'kdss', active: false, signalProgress: 0 },
        { id: 's15', from: 'bayesian', to: 'metacog', active: false, signalProgress: 0 },
        { id: 's16', from: 'evolution', to: 'mapelites', active: false, signalProgress: 0 },
        { id: 's17', from: 'evolution', to: 'forensics', active: false, signalProgress: 0 },
        { id: 's18', from: 'evolution', to: 'saie', active: false, signalProgress: 0 },
    ];
}

// ─── Holographic Neuron (SVG) ────────────────────────────────

function HoloNeuron({
    node, isSelected, onClick,
}: {
    node: NeuronNode; isSelected: boolean; onClick: () => void;
}) {
    // Clamp activity to [0,1] for all visual calculations
    const act = Math.min(1, Math.max(0, node.activity));
    const pulseScale = 1 + act * 0.06; // Reduced from 0.12 → 0.06
    const fireIntensity = act;
    const holoOpacity = 0.3 + fireIntensity * 0.4; // Max 0.7 (was 1.0)
    const isCore = node.tier === 'core';

    // Hexagonal outline points for inner/core nodes
    const hexPoints = (cx: number, cy: number, r: number): string => {
        const pts: string[] = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
        }
        return pts.join(' ');
    };

    return (
        <g onClick={onClick} style={{ cursor: 'pointer' }} className="holo-neuron-group">
            {/* Outer scan ring */}
            <circle
                cx={node.x} cy={node.y}
                r={node.radius + 8 + fireIntensity * 8}
                fill="none"
                stroke="var(--holo-cyan)"
                strokeWidth={0.5}
                opacity={0.06 + fireIntensity * 0.12}
                strokeDasharray="3 6"
                className={fireIntensity > 0.3 ? 'holo-scan-ring' : ''}
            />

            {/* Hex wireframe body */}
            {node.tier !== 'outer' ? (
                <polygon
                    points={hexPoints(node.x, node.y, node.radius * pulseScale)}
                    fill="none"
                    stroke={isSelected ? 'var(--holo-white)' : 'var(--holo-cyan)'}
                    strokeWidth={isSelected ? 2 : 1.2}
                    opacity={holoOpacity}
                    className={fireIntensity > 0.3 ? 'holo-fire' : ''}
                />
            ) : (
                <circle
                    cx={node.x} cy={node.y}
                    r={node.radius * pulseScale}
                    fill="none"
                    stroke={isSelected ? 'var(--holo-white)' : 'var(--holo-cyan)'}
                    strokeWidth={isSelected ? 2 : 1}
                    opacity={holoOpacity}
                    className={fireIntensity > 0.3 ? 'holo-fire' : ''}
                />
            )}

            {/* Inner fill (very subtle wireframe tint) */}
            <circle
                cx={node.x} cy={node.y}
                r={node.radius * 0.85 * pulseScale}
                fill="var(--holo-cyan)"
                opacity={0.01 + fireIntensity * 0.06}
            />

            {/* Floating holographic data particles */}
            {[0, 1, 2, 3].map(i => {
                const orbitR = node.radius * 0.65;
                const speed = 6 + i * 2;
                return (
                    <circle
                        key={`particle-${node.id}-${i}`}
                        cx={node.x}
                        cy={node.y}
                        r={1.2}
                        fill="var(--holo-white)"
                        opacity={0.15 + fireIntensity * 0.35}
                        className="holo-data-particle"
                        style={{
                            transformOrigin: `${node.x}px ${node.y}px`,
                            transform: `rotate(${i * 90}deg) translateX(${orbitR}px)`,
                            animationDuration: `${speed}s`,
                            animationDelay: `${i * -1.5}s`,
                        }}
                    />
                );
            })}

            {/* Core dot */}
            <circle
                cx={node.x} cy={node.y}
                r={isCore ? 6 : 3}
                fill="var(--holo-cyan)"
                opacity={0.5 + fireIntensity * 0.5}
            />

            {/* Firing ripple */}
            {fireIntensity > 0.5 && (
                <circle
                    cx={node.x} cy={node.y}
                    r={node.radius * 0.5}
                    fill="none"
                    stroke="var(--holo-white)"
                    strokeWidth={1.5}
                    opacity={0}
                    className="holo-ripple"
                />
            )}

            {/* Activity HUD readout above node */}
            {fireIntensity > 0.1 && (
                <text
                    x={node.x} y={node.y - node.radius - 8}
                    textAnchor="middle"
                    fill="var(--holo-cyan)"
                    fontSize={8}
                    fontWeight={600}
                    fontFamily="'JetBrains Mono', monospace"
                    letterSpacing="0.08em"
                    opacity={0.4 + fireIntensity * 0.5}
                    style={{ pointerEvents: 'none' }}
                >
                    {(fireIntensity * 100).toFixed(0)}%
                </text>
            )}

            {/* Short label inside the node */}
            <text
                x={node.x} y={node.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--holo-white)"
                fontSize={isCore ? 11 : 8}
                fontWeight={700}
                fontFamily="'JetBrains Mono', monospace"
                opacity={0.5 + fireIntensity * 0.5}
                style={{ pointerEvents: 'none' }}
            >
                {node.shortLabel}
            </text>

            {/* Firing count (bottom) */}
            {node.totalFirings > 0 && (
                <text
                    x={node.x} y={node.y + node.radius + 14}
                    textAnchor="middle"
                    fill="var(--holo-dim)"
                    fontSize={7}
                    fontWeight={500}
                    fontFamily="'JetBrains Mono', monospace"
                    letterSpacing="0.06em"
                    opacity={0.5}
                    style={{ pointerEvents: 'none' }}
                >
                    ×{node.totalFirings}
                </text>
            )}
        </g>
    );
}

// ─── Holographic Synapse (SVG) ───────────────────────────────

function HoloSynapse({
    synapse, fromNode, toNode,
}: {
    synapse: Synapse; fromNode: NeuronNode; toNode: NeuronNode;
}) {
    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return null;
    const nx = dx / dist;
    const ny = dy / dist;

    const startX = fromNode.x + nx * (fromNode.radius + 4);
    const startY = fromNode.y + ny * (fromNode.radius + 4);
    const endX = toNode.x - nx * (toNode.radius + 4);
    const endY = toNode.y - ny * (toNode.radius + 4);

    const midX = (startX + endX) / 2 + ny * 12;
    const midY = (startY + endY) / 2 - nx * 12;
    const pathD = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;

    // Bezier interpolation for signal pulse
    const t = synapse.signalProgress;
    const px = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * midX + t * t * endX;
    const py = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * midY + t * t * endY;

    return (
        <g>
            <path
                d={pathD}
                fill="none"
                stroke="var(--holo-cyan)"
                strokeWidth={synapse.active ? 1.5 : 0.5}
                opacity={synapse.active ? 0.7 : 0.1}
                strokeDasharray={synapse.active ? '6 3' : '2 4'}
                className={synapse.active ? 'holo-synapse-active' : ''}
            />

            {synapse.active && t > 0 && t < 1 && (
                <>
                    <circle cx={px} cy={py} r={3} fill="var(--holo-white)" opacity={0.9} />
                    <circle cx={px} cy={py} r={7} fill="var(--holo-cyan)" opacity={0.25} />
                </>
            )}
        </g>
    );
}

// ─── HUD Metric Readout ──────────────────────────────────────

function HudMetric({ label, value, unit, accent }: {
    label: string; value: string; unit?: string; accent?: boolean;
}) {
    return (
        <div className={`hud-metric ${accent ? 'accent' : ''}`}>
            <span className="hud-metric-label">{label}</span>
            <span className="hud-metric-value">
                {value}
                {unit && <span className="hud-metric-unit">{unit}</span>}
            </span>
        </div>
    );
}

// ─── HUD Detail Readout ──────────────────────────────────────

function HudDetail({ node }: { node: NeuronNode | null }) {
    if (!node) {
        return (
            <div className="hud-detail">
                <div className="hud-detail-empty">
                    <div className="hud-detail-crosshair">⊕</div>
                    <span>SELECT TARGET</span>
                </div>
            </div>
        );
    }

    return (
        <div className="hud-detail">
            <div className="hud-detail-header">
                <span className="hud-detail-tag">● TARGET LOCK</span>
                <span className="hud-detail-name">{node.label}</span>
            </div>
            <div className="hud-detail-separator" />
            <div className="hud-detail-desc">{node.description}</div>
            <div className="hud-detail-grid">
                <div className="hud-detail-item">
                    <span className="hud-detail-item-label">ACTIVITY</span>
                    <div className="hud-detail-bar">
                        <div className="hud-detail-bar-fill" style={{ width: `${Math.min(100, node.activity * 100)}%` }} />
                    </div>
                    <span className="hud-detail-item-val">{Math.min(100, Math.round(node.activity * 100))}%</span>
                </div>
                <div className="hud-detail-item">
                    <span className="hud-detail-item-label">FIRINGS</span>
                    <span className="hud-detail-item-val">{node.totalFirings}</span>
                </div>
                <div className="hud-detail-item">
                    <span className="hud-detail-item-label">LAST ACTIVE</span>
                    <span className="hud-detail-item-val">
                        {node.lastFired > 0 ? `${Math.round((Date.now() - node.lastFired) / 1000)}s` : '—'}
                    </span>
                </div>
                <div className="hud-detail-item">
                    <span className="hud-detail-item-label">TIER</span>
                    <span className="hud-detail-item-val">{node.tier.toUpperCase()}</span>
                </div>
            </div>
        </div>
    );
}

// ─── Consciousness Arc ───────────────────────────────────────

function ConsciousnessArc({ level }: { level: number }) {
    const clamped = Math.max(0, Math.min(100, level));
    const r = 44;
    const circ = Math.PI * r;
    const off = circ * (1 - clamped / 100);

    const getPhase = (l: number): string => {
        if (l < 15) return 'DORMANT';
        if (l < 35) return 'AWAKENING';
        if (l < 55) return 'COGNIZANT';
        if (l < 75) return 'HYPERAWARE';
        return 'TRANSCENDENT';
    };

    return (
        <div className="hud-consciousness">
            <svg viewBox="0 0 100 58" className="hud-consciousness-svg">
                <path d="M 6 52 A 44 44 0 0 1 94 52" fill="none" stroke="var(--holo-dim)" strokeWidth={3} strokeLinecap="round" opacity={0.15} />
                <path d="M 6 52 A 44 44 0 0 1 94 52" fill="none" stroke="var(--holo-cyan)" strokeWidth={3} strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={off}
                    style={{ transition: 'stroke-dashoffset 400ms ease' }}
                    className="holo-arc-glow"
                />
                <text x="50" y="42" textAnchor="middle" fill="var(--holo-white)" fontSize="16" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                    {clamped.toFixed(0)}
                </text>
                <text x="50" y="54" textAnchor="middle" fill="var(--holo-cyan)" fontSize="5.5" fontWeight="600" letterSpacing="0.12em" fontFamily="'JetBrains Mono', monospace">
                    {getPhase(clamped)}
                </text>
            </svg>
        </div>
    );
}

// ─── Activity Heatmap ────────────────────────────────────────

const TIMELINE_COLS = 40;

function ActivityHeatmap({
    snapshots, nodeOrder,
}: {
    snapshots: ActivitySnapshot[]; nodeOrder: NeuronNode[];
}) {
    const visible = snapshots.slice(-TIMELINE_COLS);
    const pad = Math.max(0, TIMELINE_COLS - visible.length);

    return (
        <div className="holo-heatmap">
            <div className="holo-heatmap-header">
                <span className="holo-heatmap-title">◆ MEMORY TRACE</span>
                <span className="holo-heatmap-sub">{snapshots.length} FRAMES // 2s INTERVAL</span>
            </div>
            <div className="holo-heatmap-body">
                <div className="holo-heatmap-labels">
                    {nodeOrder.map(n => (
                        <div key={n.id} className="holo-heatmap-label">
                            <div
                                className="holo-heatmap-label-dot"
                                style={{ background: `hsl(${n.hue}, 80%, 55%)` }}
                            />
                            {n.shortLabel}
                        </div>
                    ))}
                </div>
                <div className="holo-heatmap-grid">
                    {nodeOrder.map(n => (
                        <div key={n.id} className="holo-heatmap-row">
                            {Array.from({ length: pad }).map((_, i) => (
                                <div key={`p-${i}`} className="holo-heatmap-cell" />
                            ))}
                            {visible.map((snap, i) => {
                                const act = Math.min(1, snap.activities[n.id] ?? 0);
                                // Per-row HSLA: hue from node, saturation 80%, lightness scales with activity
                                const lightness = act > 0.05 ? 15 + act * 45 : 4;
                                const alpha = act > 0.05 ? 0.35 + act * 0.55 : 0.06;
                                return (
                                    <div
                                        key={`${snap.timestamp}-${i}`}
                                        className="holo-heatmap-cell"
                                        title={`${n.shortLabel}: ${Math.round(act * 100)}%`}
                                        style={{
                                            background: act > 0.05
                                                ? `hsla(${n.hue}, 80%, ${lightness}%, ${alpha})`
                                                : undefined,
                                            boxShadow: act > 0.6
                                                ? `0 0 4px hsla(${n.hue}, 80%, 50%, 0.4)`
                                                : undefined,
                                        }}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────

export default function NeuralBrainPage() {
    const [nodes, setNodes] = useState<NeuronNode[]>(createNeuralNodes);
    const [synapses, setSynapses] = useState<Synapse[]>(createSynapses);
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [timeline, setTimeline] = useState<ActivitySnapshot[]>([]);
    const [stats, setStats] = useState<BrainStats>({
        totalSignals: 0, avgActivity: 0, dominantModule: 'EVO',
        learningRate: 0.05, experienceLevel: 0, activeConnections: 0,
    });
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const animRef = useRef<number>(0);
    const lastFireRef = useRef<number>(Date.now());
    const lastSnapRef = useRef<number>(Date.now());
    const signalRef = useRef<number>(0);
    const cooldownRef = useRef<Map<string, number>>(new Map());

    // ── Live Data Bridge (Phase 22) ──────────────────────────
    const brainLiveData = useBrainLiveData(selectedSlotId);
    const isLiveMode = brainLiveData?.isLive ?? false;

    const fireNeuron = useCallback((nodeId: string) => {
        const now = Date.now();
        // Cooldown: biological refractory period — min 800ms between fires per neuron
        const lastFire = cooldownRef.current.get(nodeId) ?? 0;
        if (now - lastFire < 800) return;
        cooldownRef.current.set(nodeId, now);

        signalRef.current++;
        setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, activity: Math.min(1, n.activity + 0.35), totalFirings: n.totalFirings + 1, lastFired: now } : n,
        ));
        setSynapses(prev => prev.map(s =>
            s.from === nodeId ? { ...s, active: true, signalProgress: 0 } : s,
        ));
    }, []);

    // ── LIVE MODE: Inject engine-derived neuron activities ────
    useEffect(() => {
        if (isPaused || !brainLiveData) return;

        const { neuronActivities, synapseActivations, hudStats, consciousnessLevel } = brainLiveData;

        // Inject real activity levels into neurons
        setNodes(prev => prev.map(n => {
            const liveActivity = neuronActivities[n.id as NeuronId];
            if (!liveActivity) return n;

            // Blend: live intensity drives the target, existing decay animation keeps visual smoothness
            const targetIntensity = liveActivity.intensity;
            // If live activity is higher than current, boost immediately
            // If live activity is lower, let decay handle it naturally
            const newActivity = Math.max(n.activity, targetIntensity * 0.8);

            return {
                ...n,
                activity: Math.min(1, newActivity),
                // Update description from live data for HUD enrichment
                description: liveActivity.label || n.description,
            };
        }));

        // Inject synapse activations from live data
        for (const sa of synapseActivations) {
            if (sa.shouldFire && sa.intensity > 0.15) {
                fireNeuron(sa.fromId);
            }
        }

        // Override HUD stats with live-derived values
        setStats({
            totalSignals: hudStats.totalSignals || signalRef.current,
            avgActivity: hudStats.avgActivity,
            dominantModule: hudStats.dominantModule,
            learningRate: hudStats.learningRate,
            experienceLevel: consciousnessLevel, // Drive consciousness arc from live data
            activeConnections: hudStats.activeConnections,
        });
    }, [brainLiveData, isPaused, fireNeuron]);

    // ── ANIMATION LOOP (both modes) ──────────────────────────
    useEffect(() => {
        if (isPaused) return;
        let prevTime = performance.now();

        const loop = (time: number) => {
            const dt = Math.min((time - prevTime) / 1000, 0.1);
            prevTime = time;

            // Decay: 4.5x per second — creates visible pulse-decay cycles
            setNodes(prev => prev.map(n => ({ ...n, activity: Math.max(0, n.activity - dt * 4.5) })));

            setSynapses(prev => prev.map(s => {
                if (!s.active) return s;
                // Signal propagation: 1.2x speed (was 2.2x) — visible traveling pulse
                const np = s.signalProgress + dt * 1.2;
                if (np >= 1) {
                    setTimeout(() => fireNeuron(s.to), 0);
                    return { ...s, active: false, signalProgress: 0 };
                }
                return { ...s, signalProgress: np };
            }));

            const now = Date.now();

            // DEMO MODE: Random sensory fire every 2-5s (only when NOT live)
            if (!isLiveMode) {
                if (now - lastFireRef.current > 2000 + Math.random() * 3000) {
                    const sensory: NeuronId[] = ['market', 'regime', 'replay', 'forensics'];
                    fireNeuron(sensory[Math.floor(Math.random() * sensory.length)]);
                    lastFireRef.current = now;
                }
            }

            // Timeline snapshot every 2s
            if (now - lastSnapRef.current > 2000) {
                setNodes(cur => {
                    const snap: ActivitySnapshot = { timestamp: now, activities: {} };
                    for (const n of cur) snap.activities[n.id] = n.activity;
                    setTimeline(prev => {
                        const next = [...prev, snap];
                        return next.length > 250 ? next.slice(-250) : next;
                    });
                    return cur;
                });
                lastSnapRef.current = now;
            }

            // DEMO MODE: Derive stats from animation state (live mode overrides above)
            if (!isLiveMode) {
                setNodes(prev => {
                    const avgAct = Math.min(1, prev.reduce((s, n) => s + Math.min(1, n.activity), 0) / prev.length);
                    const dominant = prev.reduce((mx, n) => n.totalFirings > mx.totalFirings ? n : mx, prev[0]);
                    const actConn = synapses.filter(s => s.active).length;
                    setStats({
                        totalSignals: signalRef.current,
                        avgActivity: avgAct,
                        dominantModule: dominant.shortLabel,
                        learningRate: 0.01 + Math.min(0.15, signalRef.current / 4000),
                        experienceLevel: Math.min(100, signalRef.current / 1.8),
                        activeConnections: actConn,
                    });
                    return prev;
                });
            }

            animRef.current = requestAnimationFrame(loop);
        };

        animRef.current = requestAnimationFrame(loop);
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, [isPaused, fireNeuron, synapses, isLiveMode]);

    const selectedNeuron = useMemo(() => nodes.find(n => n.id === selectedNode) ?? null, [nodes, selectedNode]);
    const nodeMap = useMemo(() => { const m = new Map<string, NeuronNode>(); for (const n of nodes) m.set(n.id, n); return m; }, [nodes]);

    return (
        <div className="holo-page">
            {/* Scanline + noise overlay */}
            <div className="holo-scanline-overlay" />

            {/* Header HUD */}
            <header className="holo-header">
                <div className="holo-header-left">
                    <div className="holo-logo">
                        <span className="holo-logo-bracket">[</span>
                        <span className="holo-logo-text">NEURAL CORTEX</span>
                        <span className="holo-logo-bracket">]</span>
                    </div>
                    <span className="holo-header-sub">COGNITIVE MODULE INTERFACE v2.1</span>
                    {/* LIVE/DEMO Mode Badge */}
                    <span
                        className="holo-mode-badge"
                        style={{
                            marginLeft: 12,
                            padding: '2px 10px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace",
                            letterSpacing: '0.1em',
                            background: isLiveMode
                                ? 'rgba(0, 255, 136, 0.15)'
                                : 'rgba(255, 170, 0, 0.15)',
                            color: isLiveMode ? '#00ff88' : '#ffaa00',
                            border: `1px solid ${isLiveMode ? 'rgba(0,255,136,0.3)' : 'rgba(255,170,0,0.3)'}`,
                        }}
                    >
                        {isLiveMode ? '● LIVE' : '◌ DEMO'}
                    </span>
                </div>
                <div className="holo-header-right">
                    {/* Island Selector (visible when islands available) */}
                    {brainLiveData && brainLiveData.availableIslands.length > 0 && (
                        <select
                            className="holo-island-select"
                            value={selectedSlotId ?? ''}
                            onChange={(e) => setSelectedSlotId(e.target.value || null)}
                            style={{
                                background: 'rgba(0, 234, 255, 0.08)',
                                color: 'var(--holo-cyan)',
                                border: '1px solid rgba(0, 234, 255, 0.2)',
                                borderRadius: 4,
                                padding: '4px 8px',
                                fontSize: 10,
                                fontFamily: "'JetBrains Mono', monospace",
                                letterSpacing: '0.06em',
                                marginRight: 8,
                                cursor: 'pointer',
                                outline: 'none',
                            }}
                        >
                            <option value="">AUTO-SELECT</option>
                            {brainLiveData.availableIslands.map(island => (
                                <option key={island.slotId} value={island.slotId}>
                                    {island.pair}:{island.timeframe}
                                </option>
                            ))}
                        </select>
                    )}
                    <button className={`holo-btn ${isPaused ? 'warn' : ''}`} onClick={() => setIsPaused(!isPaused)}>
                        {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
                    </button>
                    <a href="/" className="holo-btn">← EXIT</a>
                </div>
            </header>

            {/* Stats HUD bar */}
            <div className="holo-stats-bar">
                <HudMetric label="SIGNALS" value={stats.totalSignals.toLocaleString()} accent />
                <HudMetric label="ACTIVITY" value={`${(stats.avgActivity * 100).toFixed(0)}`} unit="%" />
                <HudMetric label="DOMINANT" value={stats.dominantModule} />
                <HudMetric label="LEARN RATE" value={`${(stats.learningRate * 100).toFixed(1)}`} unit="%" />
                <HudMetric label="CONNECTIONS" value={`${stats.activeConnections}`} unit={`/${synapses.length}`} />
            </div>

            {/* Main content: 3D perspective canvas + detail panel */}
            <div className="holo-content">
                <div className="holo-canvas-wrapper">
                    <div className="holo-canvas-3d">
                        <svg viewBox={`0 0 ${CW} ${CH}`} className="holo-canvas" preserveAspectRatio="xMidYMid meet">

                            {/* Hex grid background */}
                            <pattern id="holo-hex-grid" width="30" height="52" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
                                <polygon points="15,0 30,8 30,26 15,34 0,26 0,8" fill="none" stroke="rgba(0,234,255,0.04)" strokeWidth="0.5" />
                            </pattern>
                            <rect width="100%" height="100%" fill="url(#holo-hex-grid)" />

                            {/* Concentric guide rings */}
                            <circle cx={CX} cy={CY} r={120} fill="none" stroke="var(--holo-cyan)" strokeWidth={0.3} opacity={0.08} strokeDasharray="4 8" />
                            <circle cx={CX} cy={CY} r={220} fill="none" stroke="var(--holo-cyan)" strokeWidth={0.3} opacity={0.05} strokeDasharray="2 6" />
                            {/* Cross-hair lines */}
                            <line x1={CX} y1={20} x2={CX} y2={CH - 20} stroke="var(--holo-cyan)" strokeWidth={0.3} opacity={0.06} />
                            <line x1={20} y1={CY} x2={CW - 20} y2={CY} stroke="var(--holo-cyan)" strokeWidth={0.3} opacity={0.06} />

                            {/* Synapses */}
                            {synapses.map(s => {
                                const from = nodeMap.get(s.from);
                                const to = nodeMap.get(s.to);
                                if (!from || !to) return null;
                                return <HoloSynapse key={s.id} synapse={s} fromNode={from} toNode={to} />;
                            })}

                            {/* Neurons (no SVG filter — CSS drop-shadow used instead) */}
                            {nodes.map(node => (
                                <HoloNeuron
                                    key={node.id}
                                    node={node}
                                    isSelected={selectedNode === node.id}
                                    onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                                />
                            ))}
                        </svg>
                    </div>
                    {/* Corner brackets (HUD frame) */}
                    <div className="holo-frame-corner tl" />
                    <div className="holo-frame-corner tr" />
                    <div className="holo-frame-corner bl" />
                    <div className="holo-frame-corner br" />
                </div>

                {/* Right panel: Detail + Consciousness */}
                <div className="holo-sidebar">
                    <HudDetail node={selectedNeuron} />
                    <ConsciousnessArc level={stats.experienceLevel} />
                </div>
            </div>

            {/* Activity Heatmap */}
            <ActivityHeatmap snapshots={timeline} nodeOrder={nodes} />
        </div>
    );
}
