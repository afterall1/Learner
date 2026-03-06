'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
    Brain, Activity, Dna, Shield, GitBranch, Zap,
    Target, BookOpen, Database, RefreshCw, ArrowRight,
    CheckCircle, XCircle, Clock, Layers, Radar, Grid3X3,
    TrendingUp, TrendingDown, Minus, BarChart3,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    RadarChart, PolarGrid, PolarAngleAxis, Radar as RechartsRadar,
    BarChart, Bar, CartesianGrid, ReferenceLine,
} from 'recharts';
import { MarketRegime } from '@/types';

// ═══════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════

type PipelineStage =
    | 'genesis'
    | 'paper_trading'
    | 'evaluation'
    | 'validation'
    | 'roster_bank'
    | 'replay_record'
    | 'evolution';

interface StageState {
    status: 'idle' | 'active' | 'complete' | 'failed';
}

interface GateResult {
    name: string;
    score: number;
    maxScore: number;
    passed: boolean | null; // null = pending
    detail: string;
}

interface RosterEntry {
    name: string;
    state: 'active' | 'hibernating' | 'retired';
    bestRegime: string;
    confidence: number;
    activations: number;
}

interface ReplayCell {
    regime: string;
    patternType: string;
    confidence: number;
    sampleCount: number;
    avgFitness: number;
}

interface GenerationData {
    gen: number;
    bestFitness: number;
    avgFitness: number;
    diversity: number;
    mutationRate: number;
    seededCount: number;
    validated: boolean;
    validationResult: 'pass' | 'fail' | null;
}

// ─── Shared Chart Styles ─────────────────────────────────────

const TOOLTIP_STYLE: React.CSSProperties = {
    background: 'rgba(14, 17, 30, 0.95)',
    border: '1px solid rgba(99, 115, 171, 0.2)',
    borderRadius: 8,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    padding: '8px 12px',
    color: '#f1f5f9',
};

const AXIS_TICK = { fill: '#64748b', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" };

const REGIME_LABELS: Record<string, string> = {
    [MarketRegime.TRENDING_UP]: 'Trend ▲',
    [MarketRegime.TRENDING_DOWN]: 'Trend ▼',
    [MarketRegime.RANGING]: 'Ranging',
    [MarketRegime.HIGH_VOLATILITY]: 'High Vol',
    [MarketRegime.LOW_VOLATILITY]: 'Low Vol',
};

const REGIME_COLORS: Record<string, string> = {
    [MarketRegime.TRENDING_UP]: '#34d399',
    [MarketRegime.TRENDING_DOWN]: '#f43f5e',
    [MarketRegime.RANGING]: '#6366f1',
    [MarketRegime.HIGH_VOLATILITY]: '#fbbf24',
    [MarketRegime.LOW_VOLATILITY]: '#22d3ee',
};

const PATTERN_TYPES = ['INDICATOR_COMBO', 'RISK_PROFILE', 'SIGNAL_CONFIG'] as const;
const PATTERN_LABELS: Record<string, string> = {
    INDICATOR_COMBO: 'Indicators',
    RISK_PROFILE: 'Risk',
    SIGNAL_CONFIG: 'Signals',
};

// ═══════════════════════════════════════════════════════════════
// DEMO DATA GENERATORS
// ═══════════════════════════════════════════════════════════════

function rng(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function generateDemoGenerations(count: number): GenerationData[] {
    const gens: GenerationData[] = [];
    let bestFitness = 15;
    for (let i = 0; i < count; i++) {
        const improvement = rng(-5, 12) * (1 - i / (count * 2));
        bestFitness = Math.max(5, Math.min(95, bestFitness + improvement));
        const validated = i > 4 && Math.random() > 0.6;
        gens.push({
            gen: i + 1,
            bestFitness: Math.round(bestFitness * 10) / 10,
            avgFitness: Math.round((bestFitness * rng(0.4, 0.7)) * 10) / 10,
            diversity: Math.round(rng(0.2, 0.85) * 100) / 100,
            mutationRate: Math.round(rng(0.1, 0.5) * 100) / 100,
            seededCount: i === 0 ? Math.floor(rng(2, 4)) : Math.floor(rng(0, 2)),
            validated,
            validationResult: validated ? (Math.random() > 0.4 ? 'pass' : 'fail') : null,
        });
    }
    return gens;
}

function generateDemoGates(): GateResult[] {
    return [
        { name: 'Walk-Forward', score: Math.round(rng(30, 85)), maxScore: 100, passed: null, detail: '' },
        { name: 'Monte Carlo', score: Math.round(rng(40, 95)), maxScore: 100, passed: null, detail: '' },
        { name: 'Overfitting', score: Math.round(rng(20, 75)), maxScore: 100, passed: null, detail: '' },
        { name: 'Regime Div.', score: Math.floor(rng(1, 5)), maxScore: 5, passed: null, detail: '' },
    ];
}

function generateDemoRoster(): RosterEntry[] {
    const names = ['Bold Nexus', 'Silent Vortex', 'Legacy Alpha', 'Proven Sage', 'Wild Phoenix'];
    const regimes = [MarketRegime.TRENDING_UP, MarketRegime.RANGING, MarketRegime.HIGH_VOLATILITY, MarketRegime.TRENDING_DOWN, MarketRegime.LOW_VOLATILITY];
    const states: RosterEntry['state'][] = ['active', 'hibernating', 'hibernating', 'hibernating', 'retired'];
    return names.map((name, i) => ({
        name,
        state: states[i],
        bestRegime: regimes[i],
        confidence: Math.round(rng(15, 92)),
        activations: Math.floor(rng(0, 8)),
    }));
}

function generateDemoReplayHeatmap(): ReplayCell[] {
    const cells: ReplayCell[] = [];
    const regimes = Object.values(MarketRegime);
    for (const regime of regimes) {
        for (const pt of PATTERN_TYPES) {
            cells.push({
                regime,
                patternType: pt,
                confidence: Math.round(rng(0, 0.95) * 100) / 100,
                sampleCount: Math.floor(rng(0, 12)),
                avgFitness: Math.round(rng(20, 75) * 10) / 10,
            });
        }
    }
    return cells;
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE STATE MACHINE — Auto-cycling demo engine
// ═══════════════════════════════════════════════════════════════

const STAGE_ORDER: PipelineStage[] = [
    'genesis', 'paper_trading', 'evaluation', 'validation',
    'roster_bank', 'replay_record', 'evolution',
];

function usePipelineStateMachine() {
    const [activeStageIdx, setActiveStageIdx] = useState(0);
    const [stages, setStages] = useState<Record<PipelineStage, StageState>>(() => {
        const init: Record<string, StageState> = {};
        for (const s of STAGE_ORDER) { init[s] = { status: 'idle' }; }
        return init as Record<PipelineStage, StageState>;
    });
    const [gates, setGates] = useState<GateResult[]>(() => generateDemoGates());
    const [gateIdx, setGateIdx] = useState(0);
    const [currentStrategyName, setCurrentStrategyName] = useState('Nova Tiger');
    const [tradeProgress, setTradeProgress] = useState(0);

    const advanceStage = useCallback(() => {
        setActiveStageIdx(prev => {
            const next = (prev + 1) % STAGE_ORDER.length;

            setStages(old => {
                const updated = { ...old };
                // Mark current as complete (unless it's validation that failed)
                const currentStage = STAGE_ORDER[prev];
                if (currentStage === 'validation') {
                    const allPass = gates.every(g => g.passed === true);
                    updated[currentStage] = { status: allPass ? 'complete' : 'failed' };
                } else {
                    updated[currentStage] = { status: 'complete' };
                }
                // Mark next as active
                const nextStage = STAGE_ORDER[next];
                updated[nextStage] = { status: 'active' };

                // If wrapping around, reset all to idle except the new active
                if (next === 0) {
                    for (const s of STAGE_ORDER) {
                        updated[s] = { status: s === nextStage ? 'active' : 'idle' };
                    }
                    setGates(generateDemoGates());
                    setGateIdx(0);
                    setTradeProgress(0);
                    const names = ['Nova Tiger', 'Bold Nexus', 'Silent Vortex', 'Proven Sage', 'Legacy Phoenix'];
                    setCurrentStrategyName(names[Math.floor(Math.random() * names.length)]);
                }
                return updated;
            });
            return next;
        });
    }, [gates]);

    // Auto-advance with per-stage timing
    useEffect(() => {
        const currentStage = STAGE_ORDER[activeStageIdx];
        let delay = 2500;

        if (currentStage === 'paper_trading') delay = 3500;
        if (currentStage === 'validation') delay = 4000;
        if (currentStage === 'genesis') delay = 2000;

        const timer = setTimeout(advanceStage, delay);
        return () => clearTimeout(timer);
    }, [activeStageIdx, advanceStage]);

    // Animate trade progress during paper_trading stage
    useEffect(() => {
        const currentStage = STAGE_ORDER[activeStageIdx];
        if (currentStage !== 'paper_trading') return;

        const interval = setInterval(() => {
            setTradeProgress(prev => Math.min(30, prev + 1));
        }, 100);
        return () => clearInterval(interval);
    }, [activeStageIdx]);

    // Animate gate reveals during validation stage
    useEffect(() => {
        const currentStage = STAGE_ORDER[activeStageIdx];
        if (currentStage !== 'validation') return;

        setGateIdx(0);
        const timer = setInterval(() => {
            setGateIdx(prev => {
                if (prev >= 4) { clearInterval(timer); return prev; }
                setGates(old => {
                    const updated = [...old];
                    const gate = { ...updated[prev] };
                    if (prev === 0) gate.passed = gate.score >= 40; // WFA: min 40%
                    else if (prev === 1) gate.passed = gate.score >= 50; // MC: top 50%
                    else if (prev === 2) gate.passed = gate.score < 70; // Overfit: <70
                    else gate.passed = gate.score >= 2; // Regime: ≥2
                    gate.detail = gate.passed ? 'PASS' : 'FAIL';
                    updated[prev] = gate;
                    return updated;
                });
                return prev + 1;
            });
        }, 800);
        return () => clearInterval(timer);
    }, [activeStageIdx]);

    // Set initial active stage
    useEffect(() => {
        setStages(prev => ({ ...prev, genesis: { status: 'active' } }));
    }, []);

    return { stages, gates, gateIdx, activeStageIdx, tradeProgress, currentStrategyName };
}

// ═══════════════════════════════════════════════════════════════
// PANEL 1: Pipeline Flow Visualizer
// ═══════════════════════════════════════════════════════════════

const STAGE_CONFIG: Record<PipelineStage, { icon: string; label: string }> = {
    genesis: { icon: '🌱', label: 'Genesis' },
    paper_trading: { icon: '📄', label: 'Paper Trade' },
    evaluation: { icon: '📊', label: 'Evaluate' },
    validation: { icon: '🔒', label: '4-Gate' },
    roster_bank: { icon: '🏦', label: 'Roster' },
    replay_record: { icon: '🧠', label: 'Replay' },
    evolution: { icon: '🧬', label: 'Evolve' },
};

function PipelineFlowPanel({
    stages,
    tradeProgress,
    currentStrategyName,
}: {
    stages: Record<PipelineStage, StageState>;
    tradeProgress: number;
    currentStrategyName: string;
}) {
    return (
        <section id="pipeline-flow" className="glass-card glass-card-accent accent-neural col-12 stagger-in stagger-1">
            <div className="card-header">
                <div className="card-title">
                    <Layers size={18} style={{ color: 'var(--accent-primary)' }} />
                    <span>Evolution Pipeline</span>
                </div>
                <span className="card-badge badge-info">LIVE</span>
            </div>
            <div className="card-body">
                <div style={{ marginBottom: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Active Strategy: <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{currentStrategyName}</span>
                </div>
                <div className="pipeline-flow">
                    {STAGE_ORDER.map((stage, idx) => {
                        const config = STAGE_CONFIG[stage];
                        const state = stages[stage];
                        const isFlowing = state.status === 'active' || state.status === 'complete';
                        return (
                            <React.Fragment key={stage}>
                                {idx > 0 && (
                                    <div className={`pipeline-connector ${isFlowing ? 'flowing' : ''}`}>
                                        <div className="connector-line" />
                                    </div>
                                )}
                                <div className={`pipeline-stage stage-${state.status}`}>
                                    <div className="stage-icon">{config.icon}</div>
                                    <div className="stage-title">{config.label}</div>
                                    <div className="stage-stats">
                                        {stage === 'genesis' && (
                                            <>
                                                <div className="stage-stat">pop: <span className="stat-highlight">10</span></div>
                                                <div className="stage-stat">seeded: <span className="stat-highlight">3</span></div>
                                            </>
                                        )}
                                        {stage === 'paper_trading' && (
                                            <div className="stage-stat">
                                                <span className="stat-highlight">{tradeProgress}</span>/30 trades
                                            </div>
                                        )}
                                        {stage === 'evaluation' && (
                                            <div className="stage-stat">fitness: <span className="stat-highlight">67.3</span></div>
                                        )}
                                        {stage === 'validation' && (
                                            <div className="stage-stat">4 gates</div>
                                        )}
                                        {stage === 'roster_bank' && (
                                            <>
                                                <div className="stage-stat"><span className="stat-highlight">4</span> banked</div>
                                                <div className="stage-stat"><span className="stat-highlight">1</span> active</div>
                                            </>
                                        )}
                                        {stage === 'replay_record' && (
                                            <div className="stage-stat"><span className="stat-highlight">32</span> patterns</div>
                                        )}
                                        {stage === 'evolution' && (
                                            <>
                                                <div className="stage-stat">Gen <span className="stat-highlight">#8</span></div>
                                                <div className="stage-stat">mut: <span className="stat-highlight">0.27</span></div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 2: Generation Fitness Tracker
// ═══════════════════════════════════════════════════════════════

function GenerationFitnessPanel({ generations }: { generations: GenerationData[] }) {
    const safeFormatter = useCallback(
        (value: unknown, name?: string): [string, string] => {
            const num = Number(value ?? 0);
            if (name === 'diversity') return [`${(num * 100).toFixed(0)}%`, 'Diversity'];
            return [`${num.toFixed(1)}`, name === 'bestFitness' ? 'Best Fitness' : 'Avg Fitness'];
        },
        [],
    );
    const latestGen = generations[generations.length - 1];

    return (
        <section id="gen-fitness" className="glass-card glass-card-accent accent-purple col-8 stagger-in stagger-2">
            <div className="card-header">
                <div className="card-title">
                    <BarChart3 size={18} style={{ color: 'var(--accent-secondary)' }} />
                    <span>Generation Fitness</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <span className="card-badge badge-primary">
                        Gen #{latestGen?.gen ?? 0}
                    </span>
                    <span className="card-badge badge-info" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        μ {latestGen?.mutationRate ?? 0}
                    </span>
                </div>
            </div>
            <div className="card-body">
                <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={generations} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <defs>
                            <linearGradient id="fitnessFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="avgFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.1} />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.06)" />
                        <XAxis dataKey="gen" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} domain={[0, 100]} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={safeFormatter} />
                        <Area
                            type="monotone"
                            dataKey="avgFitness"
                            stroke="#6366f1"
                            strokeWidth={1.5}
                            fill="url(#avgFill)"
                            dot={false}
                            strokeDasharray="4 2"
                        />
                        <Area
                            type="monotone"
                            dataKey="bestFitness"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            fill="url(#fitnessFill)"
                            dot={(props: Record<string, unknown>) => {
                                const { cx, cy, payload } = props as { cx: number; cy: number; payload: GenerationData };
                                if (!payload?.validationResult) return <React.Fragment key={`dot-${payload?.gen}`} />;
                                const color = payload.validationResult === 'pass' ? '#34d399' : '#f43f5e';
                                return (
                                    <circle
                                        key={`val-${payload.gen}`}
                                        cx={cx}
                                        cy={cy}
                                        r={5}
                                        fill={color}
                                        stroke="#06080d"
                                        strokeWidth={2}
                                    />
                                );
                            }}
                            activeDot={{ r: 4, strokeWidth: 2, fill: '#06080d' }}
                        />
                        <ReferenceLine y={50} stroke="rgba(52,211,153,0.15)" strokeDasharray="8 4" label={{
                            value: 'Min Viable',
                            position: 'right',
                            fill: '#64748b',
                            fontSize: 9,
                        }} />
                    </AreaChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 3, background: '#8b5cf6', borderRadius: 2 }} />
                        Best Fitness
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 3, background: '#6366f1', borderRadius: 2, opacity: 0.5 }} />
                        Avg Fitness
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
                        Validated
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f43f5e' }} />
                        Failed
                    </div>
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 3: 4-Gate Validation Viewer
// ═══════════════════════════════════════════════════════════════

function ValidationGatePanel({
    gates,
    gateIdx,
    currentStrategyName,
}: {
    gates: GateResult[];
    gateIdx: number;
    currentStrategyName: string;
}) {
    const allRevealed = gateIdx >= 4;
    const allPassed = allRevealed && gates.every(g => g.passed === true);
    const anyFailed = allRevealed && gates.some(g => g.passed === false);

    return (
        <section id="validation-gates" className="glass-card glass-card-accent accent-amber col-4 stagger-in stagger-3">
            <div className="card-header">
                <div className="card-title">
                    <Shield size={18} style={{ color: 'var(--warning)' }} />
                    <span>4-Gate Validation</span>
                </div>
                {allRevealed && (
                    <span className={`card-badge ${allPassed ? 'badge-success' : 'badge-danger'}`}>
                        {allPassed ? 'PROMOTED' : 'RETIRED'}
                    </span>
                )}
            </div>
            <div className="card-body">
                <div style={{ marginBottom: 10, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Strategy: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentStrategyName}</span>
                </div>
                {gates.map((gate, i) => {
                    const revealed = i < gateIdx;
                    const isPending = !revealed;
                    const pct = gate.name === 'Regime Div.'
                        ? Math.min(100, (gate.score / gate.maxScore) * 100)
                        : gate.score;
                    const statusClass = isPending ? 'pending' : (gate.passed ? 'pass' : 'fail');

                    return (
                        <div className="gate-bar" key={gate.name}>
                            <span className="gate-name">{gate.name}</span>
                            <div className="gate-track">
                                <div
                                    className={`gate-fill ${statusClass}`}
                                    style={{ width: revealed ? `${pct}%` : '0%' }}
                                />
                            </div>
                            {revealed ? (
                                <span className={`gate-badge badge-${gate.passed ? 'pass' : 'fail'}`}>
                                    {gate.passed ? '✓' : '✗'} {gate.name === 'Regime Div.' ? `${gate.score}/${gate.maxScore}` : `${gate.score}%`}
                                </span>
                            ) : (
                                <span className="gate-badge badge-pending">
                                    <Clock size={10} />
                                </span>
                            )}
                        </div>
                    );
                })}

                {allRevealed && (
                    <div style={{
                        marginTop: 12,
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: allPassed ? 'rgba(52, 211, 153, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                        border: `1px solid ${allPassed ? 'rgba(52, 211, 153, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                    }}>
                        {allPassed ? (
                            <>
                                <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                                <span style={{ color: 'var(--success)' }}>All 4 gates passed → Banked in Roster</span>
                            </>
                        ) : (
                            <>
                                <XCircle size={16} style={{ color: 'var(--danger)' }} />
                                <span style={{ color: 'var(--danger)' }}>
                                    Failed {gates.filter(g => !g.passed).length} gate(s) → Retired
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 4: Strategy Roster Radar
// ═══════════════════════════════════════════════════════════════

function StrategyRosterPanel({ roster }: { roster: RosterEntry[] }) {
    const radarData = useMemo(() => {
        const regimes = Object.values(MarketRegime);
        return regimes.map(regime => {
            const entry = roster.find(r => r.bestRegime === regime);
            return {
                regime: REGIME_LABELS[regime] ?? regime,
                coverage: entry ? entry.confidence : 0,
                fullMark: 100,
            };
        });
    }, [roster]);

    const stateEmoji = (state: RosterEntry['state']) => {
        if (state === 'active') return '🟢';
        if (state === 'hibernating') return '😴';
        return '🪦';
    };

    const confidenceColor = (c: number) => {
        if (c >= 70) return 'var(--success)';
        if (c >= 40) return 'var(--warning)';
        return 'var(--text-muted)';
    };

    return (
        <section id="roster-radar" className="glass-card glass-card-accent accent-emerald col-6 stagger-in stagger-4">
            <div className="card-header">
                <div className="card-title">
                    <Database size={18} style={{ color: 'var(--success)' }} />
                    <span>Strategy Roster</span>
                </div>
                <span className="card-badge badge-success">{roster.length} BANKED</span>
            </div>
            <div className="card-body" style={{ display: 'flex', gap: 16 }}>
                {/* Radar Chart */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height={200}>
                        <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                            <PolarGrid stroke="rgba(99, 115, 171, 0.1)" />
                            <PolarAngleAxis
                                dataKey="regime"
                                tick={{ fill: '#94a3b8', fontSize: 9 }}
                            />
                            <RechartsRadar
                                name="Coverage"
                                dataKey="coverage"
                                stroke="#34d399"
                                fill="#34d399"
                                fillOpacity={0.15}
                                strokeWidth={2}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>

                {/* Roster List */}
                <div style={{ width: 220, flexShrink: 0 }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Top Strategies
                    </div>
                    {roster.map(entry => (
                        <div className="roster-entry" key={entry.name}>
                            <span className="roster-state">{stateEmoji(entry.state)}</span>
                            <span className="roster-name">{entry.name}</span>
                            <span className="roster-regime">{REGIME_LABELS[entry.bestRegime] ?? entry.bestRegime}</span>
                            <span className="roster-confidence" style={{ color: confidenceColor(entry.confidence) }}>
                                {entry.confidence}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 5: Experience Replay Heatmap
// ═══════════════════════════════════════════════════════════════

function ExperienceReplayPanel({ cells }: { cells: ReplayCell[] }) {
    const regimes = Object.values(MarketRegime);

    const totalPatterns = cells.filter(c => c.sampleCount > 0).length;
    const highConfidence = cells.filter(c => c.confidence >= 0.5).length;
    const canSeedRegimes = regimes.filter(regime =>
        cells.filter(c => c.regime === regime && c.confidence >= 0.5 && c.sampleCount >= 3).length > 0,
    ).length;

    const cellColor = (confidence: number): string => {
        if (confidence >= 0.7) return 'rgba(99, 102, 241, 0.5)';
        if (confidence >= 0.5) return 'rgba(99, 102, 241, 0.3)';
        if (confidence >= 0.3) return 'rgba(99, 102, 241, 0.15)';
        if (confidence > 0) return 'rgba(99, 102, 241, 0.06)';
        return 'rgba(99, 115, 171, 0.03)';
    };

    return (
        <section id="experience-replay" className="glass-card glass-card-accent accent-primary col-6 stagger-in stagger-5">
            <div className="card-header">
                <div className="card-title">
                    <BookOpen size={18} style={{ color: 'var(--accent-primary)' }} />
                    <span>Experience Replay</span>
                </div>
                <span className="card-badge badge-primary">{totalPatterns} PATTERNS</span>
            </div>
            <div className="card-body">
                {/* Summary Stats */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                    <div className="metric-card" style={{ flex: 1, padding: '8px 10px' }}>
                        <div className="metric-value" style={{ fontSize: '1.1rem' }}>{totalPatterns}</div>
                        <div className="metric-label">Total</div>
                    </div>
                    <div className="metric-card" style={{ flex: 1, padding: '8px 10px' }}>
                        <div className="metric-value" style={{ fontSize: '1.1rem', color: 'var(--success)' }}>{highConfidence}</div>
                        <div className="metric-label">High Conf.</div>
                    </div>
                    <div className="metric-card" style={{ flex: 1, padding: '8px 10px' }}>
                        <div className="metric-value" style={{ fontSize: '1.1rem', color: 'var(--accent-primary)' }}>{canSeedRegimes}</div>
                        <div className="metric-label">Can Seed</div>
                    </div>
                </div>

                {/* Heatmap Grid */}
                <div style={{ overflowX: 'auto' }}>
                    {/* Column Headers */}
                    <div
                        className="regime-heatmap"
                        style={{ gridTemplateColumns: `80px repeat(${PATTERN_TYPES.length}, 1fr)` }}
                    >
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, padding: '4px 6px' }} />
                        {PATTERN_TYPES.map(pt => (
                            <div
                                key={pt}
                                style={{
                                    fontSize: '0.6rem',
                                    color: 'var(--text-muted)',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                    textAlign: 'center',
                                    padding: '4px 6px',
                                }}
                            >
                                {PATTERN_LABELS[pt]}
                            </div>
                        ))}

                        {/* Rows */}
                        {regimes.map(regime => (
                            <React.Fragment key={regime}>
                                <div style={{
                                    fontSize: '0.65rem',
                                    color: REGIME_COLORS[regime],
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 6px',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {REGIME_LABELS[regime]}
                                </div>
                                {PATTERN_TYPES.map(pt => {
                                    const cell = cells.find(c => c.regime === regime && c.patternType === pt);
                                    const conf = cell?.confidence ?? 0;
                                    return (
                                        <div
                                            key={`${regime}-${pt}`}
                                            className="regime-heatmap-cell"
                                            style={{ background: cellColor(conf) }}
                                            title={cell ? `Confidence: ${(conf * 100).toFixed(0)}%\nSamples: ${cell.sampleCount}\nAvg Fitness: ${cell.avgFitness}` : 'No data'}
                                        >
                                            <span className="cell-value" style={{ color: conf >= 0.5 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                {conf > 0 ? `${(conf * 100).toFixed(0)}%` : '—'}
                                            </span>
                                            <span className="cell-label">
                                                {cell && cell.sampleCount > 0 ? `n=${cell.sampleCount}` : ''}
                                            </span>
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// STRATEGY ARCHAEOLOGY — Phase 8.5
// ═══════════════════════════════════════════════════════════════

// ─── Types for Archaeology ──────────────────────────────────

interface LineageNode {
    id: string;
    name: string;
    generation: number;
    fitness: number;
    origin: 'random' | 'seeded' | 'crossover' | 'mutation';
    parentIds: string[];
    alive: boolean;
    validated: boolean;
    survivingGenes: string[];
}

interface SurvivalRow {
    geneName: string;
    geneType: 'indicator' | 'risk' | 'signal';
    generations: { gen: number; present: boolean; fitness: number }[];
    persistenceScore: number; // 0-1, how many gens this gene survived
}

interface DecisionEvent {
    timestamp: number;
    fromRegime: string;
    toRegime: string;
    chosenStrategy: string;
    reasons: { icon: string; text: string; value: string }[];
    alternatives: { name: string; confidence: number; rejected: string }[];
    outcome: 'pending' | 'profitable' | 'loss';
}

// ─── Demo Data: Archaeology ──────────────────────────────────

const STRATEGY_NAMES = [
    'Nova Tiger', 'Bold Nexus', 'Silent Vortex', 'Proven Sage', 'Legacy Alpha',
    'Wild Phoenix', 'Rapid Fox', 'Iron Shield', 'Dark Pulse', 'Omega Ray',
    'Frost Blade', 'Neon Torch', 'Shadow Fang', 'Storm Drift', 'Crystal Edge',
];

function generateDemoLineage(): LineageNode[] {
    const nodes: LineageNode[] = [];
    const genePool = ['RSI(14)', 'EMA(50)', 'BOLL(20)', 'SMA(200)', 'MACD', 'ADX(14)', 'StochRSI', 'ATR(14)'];

    for (let gen = 1; gen <= 6; gen++) {
        const countInGen = gen === 1 ? 6 : Math.max(3, 7 - gen);
        for (let j = 0; j < countInGen; j++) {
            const id = `G${gen}-${j}`;
            const isFirst = gen === 1;
            const isSeeded = isFirst && j < 2;
            const isCrossover = !isFirst && j < Math.floor(countInGen / 2);
            const isMutation = !isFirst && !isCrossover;
            const fitness = Math.round(rng(isSeeded ? 30 : 10, 85) * 10) / 10;
            const alive = gen >= 4 ? Math.random() > 0.5 : gen === 6;
            const nameIdx = (gen * 3 + j) % STRATEGY_NAMES.length;

            const parentIds: string[] = [];
            if (isCrossover && gen > 1) {
                const prevCount = gen === 2 ? 6 : Math.max(3, 8 - gen);
                parentIds.push(`G${gen - 1}-${j % prevCount}`);
                parentIds.push(`G${gen - 1}-${(j + 1) % prevCount}`);
            } else if (isMutation && gen > 1) {
                const prevCount = gen === 2 ? 6 : Math.max(3, 8 - gen);
                parentIds.push(`G${gen - 1}-${j % prevCount}`);
            }

            const numGenes = Math.floor(rng(2, 5));
            const survivingGenes = genePool
                .sort(() => Math.random() - 0.5)
                .slice(0, numGenes);

            nodes.push({
                id,
                name: STRATEGY_NAMES[nameIdx],
                generation: gen,
                fitness,
                origin: isSeeded ? 'seeded' : isCrossover ? 'crossover' : isMutation ? 'mutation' : 'random',
                parentIds,
                alive,
                validated: fitness > 60 && Math.random() > 0.6,
                survivingGenes,
            });
        }
    }
    return nodes;
}

function generateDemoSurvival(): SurvivalRow[] {
    const genes: { name: string; type: SurvivalRow['geneType'] }[] = [
        { name: 'RSI(14)', type: 'indicator' },
        { name: 'EMA(50)', type: 'indicator' },
        { name: 'BOLL(20)', type: 'indicator' },
        { name: 'MACD', type: 'indicator' },
        { name: 'ADX(14)', type: 'indicator' },
        { name: 'SL: 1.5%', type: 'risk' },
        { name: 'TP: 4.5%', type: 'risk' },
        { name: 'Lev: 5x', type: 'risk' },
        { name: 'CROSS_ABOVE', type: 'signal' },
        { name: 'CROSS_BELOW', type: 'signal' },
    ];

    return genes.map(gene => {
        const isPopular = ['RSI(14)', 'EMA(50)', 'SL: 1.5%', 'CROSS_ABOVE'].includes(gene.name);
        const generations: SurvivalRow['generations'] = [];
        for (let gen = 1; gen <= 14; gen++) {
            const baseProbability = isPopular ? 0.8 : 0.4;
            const present = Math.random() < baseProbability;
            generations.push({
                gen,
                present,
                fitness: present ? Math.round(rng(20, 80)) : 0,
            });
        }
        const presentCount = generations.filter(g => g.present).length;
        return {
            geneName: gene.name,
            geneType: gene.type,
            generations,
            persistenceScore: presentCount / 14,
        };
    });
}

function generateDemoDecisions(): DecisionEvent[] {
    const regimes = Object.values(MarketRegime);
    const events: DecisionEvent[] = [];
    const now = Date.now();

    const scenarios = [
        {
            from: MarketRegime.TRENDING_UP,
            to: MarketRegime.RANGING,
            strategy: 'Silent Vortex',
            reasons: [
                { icon: '📊', text: 'RANGING rejiminde test edilmiş', value: '3 kez' },
                { icon: '🎯', text: 'Bayesian güven puanı', value: '72/100' },
                { icon: '📈', text: 'Geçmiş performans', value: '+4.2% ort.' },
                { icon: '✅', text: 'Kârlı trade oranı', value: '5/7 (71%)' },
                { icon: '🧬', text: 'RSI(14) geni 6 nesildir hayatta', value: 'kanıtlanmış' },
            ],
            alternatives: [
                { name: 'Wild Phoenix', confidence: 12, rejected: 'Güven çok düşük (min: 25)' },
                { name: 'Omega Ray', confidence: 31, rejected: 'RANGING deneyimi yok' },
            ],
            outcome: 'profitable' as const,
        },
        {
            from: MarketRegime.RANGING,
            to: MarketRegime.HIGH_VOLATILITY,
            strategy: 'Legacy Alpha',
            reasons: [
                { icon: '📊', text: 'HIGH_VOL rejiminde test edilmiş', value: '5 kez' },
                { icon: '🎯', text: 'Bayesian güven puanı', value: '65/100' },
                { icon: '📈', text: 'Geçmiş performans', value: '+2.8% ort.' },
                { icon: '🛡️', text: 'Max drawdown kontrol altında', value: '-3.2%' },
            ],
            alternatives: [
                { name: 'Dark Pulse', confidence: 28, rejected: 'Sadece 1 deneyim' },
            ],
            outcome: 'pending' as const,
        },
        {
            from: MarketRegime.HIGH_VOLATILITY,
            to: MarketRegime.TRENDING_DOWN,
            strategy: 'Proven Sage',
            reasons: [
                { icon: '📊', text: 'TREND_DOWN rejiminde test edilmiş', value: '4 kez' },
                { icon: '🎯', text: 'Bayesian güven puanı', value: '58/100' },
                { icon: '📈', text: 'Geçmiş performans', value: '+1.9% ort.' },
                { icon: '🧬', text: 'Short-biased sinyal genleri', value: 'aktif' },
            ],
            alternatives: [],
            outcome: 'loss' as const,
        },
    ];

    scenarios.forEach((s, i) => {
        events.push({
            timestamp: now - (3 - i) * 3600000 * Math.floor(rng(2, 8)),
            fromRegime: s.from,
            toRegime: s.to,
            chosenStrategy: s.strategy,
            reasons: s.reasons,
            alternatives: s.alternatives,
            outcome: s.outcome,
        });
    });

    return events;
}

// ═══════════════════════════════════════════════════════════════
// PANEL 6: Gene Lineage Tree
// ═══════════════════════════════════════════════════════════════

function GeneLineagePanel({ nodes }: { nodes: LineageNode[] }) {
    const maxGen = Math.max(...nodes.map(n => n.generation));
    const generationGroups = useMemo(() => {
        const groups: Map<number, LineageNode[]> = new Map();
        for (let g = 1; g <= maxGen; g++) {
            groups.set(g, nodes.filter(n => n.generation === g));
        }
        return groups;
    }, [nodes, maxGen]);

    const nodeStatus = (node: LineageNode): string => {
        if (node.validated) return 'champion';
        if (node.origin === 'seeded') return 'seeded';
        if (node.alive) return 'alive';
        return 'dead';
    };

    const originLabel = (origin: LineageNode['origin']): string => {
        if (origin === 'seeded') return '🔮';
        if (origin === 'crossover') return '✂️';
        if (origin === 'mutation') return '🔀';
        return '🎲';
    };

    const fitnessColor = (f: number): string => {
        if (f >= 60) return 'var(--success)';
        if (f >= 35) return 'var(--warning)';
        return 'var(--text-muted)';
    };

    return (
        <section id="gene-lineage" className="glass-card glass-card-accent accent-cyan col-12 stagger-in stagger-6">
            <div className="card-header">
                <div className="card-title">
                    <GitBranch size={18} style={{ color: 'var(--info)' }} />
                    <span>Gene Lineage Tree</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <span className="card-badge badge-info">{nodes.length} STRATEGIES</span>
                    <span className="card-badge badge-success">{nodes.filter(n => n.validated).length} VALIDATED</span>
                </div>
            </div>
            <div className="card-body">
                {/* Legend */}
                <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[
                        { emoji: '🎲', label: 'Random' },
                        { emoji: '🔮', label: 'Seeded (Replay)' },
                        { emoji: '✂️', label: 'Crossover' },
                        { emoji: '🔀', label: 'Mutation' },
                        { emoji: '⭐', label: 'Validated (Champion)' },
                    ].map(item => (
                        <div key={item.label} style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>{item.emoji}</span> {item.label}
                        </div>
                    ))}
                </div>

                <div className="lineage-tree-container">
                    <div style={{ display: 'flex', gap: 24 }}>
                        {Array.from(generationGroups.entries()).map(([gen, genNodes]) => (
                            <div key={gen} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 70 }}>
                                <div style={{
                                    fontSize: '0.55rem',
                                    fontWeight: 700,
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    marginBottom: 4,
                                }}>
                                    Gen {gen}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                                    {genNodes.map(node => (
                                        <div
                                            className="lineage-node"
                                            key={node.id}
                                            title={`${node.name}\nFitness: ${node.fitness}\nOrigin: ${node.origin}\nGenes: ${node.survivingGenes.join(', ')}`}
                                        >
                                            <div className={`node-circle ${nodeStatus(node)}`}>
                                                {node.validated ? '⭐' : originLabel(node.origin)}
                                            </div>
                                            <div className="node-name">{node.name}</div>
                                            <div className="node-fitness" style={{ color: fitnessColor(node.fitness) }}>
                                                {node.fitness}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 7: Gene Survival Heatmap
// ═══════════════════════════════════════════════════════════════

function GeneSurvivalPanel({ rows }: { rows: SurvivalRow[] }) {
    const maxGen = Math.max(...rows.flatMap(r => r.generations.map(g => g.gen)));

    const cellBg = (present: boolean, fitness: number): string => {
        if (!present) return 'rgba(99, 115, 171, 0.03)';
        if (fitness >= 60) return 'rgba(52, 211, 153, 0.4)';
        if (fitness >= 40) return 'rgba(99, 102, 241, 0.3)';
        if (fitness >= 20) return 'rgba(99, 102, 241, 0.15)';
        return 'rgba(99, 102, 241, 0.06)';
    };

    const typeColor = (type: SurvivalRow['geneType']): string => {
        if (type === 'indicator') return 'var(--accent-primary)';
        if (type === 'risk') return 'var(--warning)';
        return 'var(--accent-secondary)';
    };

    const sortedRows = useMemo(() =>
        [...rows].sort((a, b) => b.persistenceScore - a.persistenceScore),
        [rows],
    );

    return (
        <section id="gene-survival" className="glass-card glass-card-accent accent-purple col-8 stagger-in stagger-7">
            <div className="card-header">
                <div className="card-title">
                    <Dna size={18} style={{ color: 'var(--accent-secondary)' }} />
                    <span>Gene Survival Heatmap</span>
                </div>
                <span className="card-badge badge-primary">
                    {rows.filter(r => r.persistenceScore >= 0.6).length} PERSISTENT
                </span>
            </div>
            <div className="card-body">
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Bright cells = gene present with high fitness. Persistent genes glow — these are the AI&apos;s proven patterns.
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <div
                        className="survival-heatmap"
                        style={{ gridTemplateColumns: `90px repeat(${maxGen}, 1fr)` }}
                    >
                        {/* Column headers */}
                        <div />
                        {Array.from({ length: maxGen }, (_, i) => (
                            <div key={`col-${i}`} className="survival-col-label">
                                G{i + 1}
                            </div>
                        ))}

                        {/* Rows */}
                        {sortedRows.map(row => (
                            <React.Fragment key={row.geneName}>
                                <div className="survival-row-label" style={{ color: typeColor(row.geneType) }}>
                                    {row.geneName}
                                    {row.persistenceScore >= 0.6 && (
                                        <span style={{ marginLeft: 4, fontSize: '0.5rem' }} title={`${(row.persistenceScore * 100).toFixed(0)}% persistence`}>🔥</span>
                                    )}
                                </div>
                                {row.generations.map(g => (
                                    <div
                                        key={`${row.geneName}-${g.gen}`}
                                        className={`survival-cell ${row.persistenceScore >= 0.6 && g.present ? 'persistent' : ''}`}
                                        style={{ background: cellBg(g.present, g.fitness) }}
                                        title={g.present ? `${row.geneName} @ Gen ${g.gen}\nFitness: ${g.fitness}` : 'Not present'}
                                    >
                                        {g.present && (
                                            <span className="cell-inner" style={{ color: g.fitness >= 60 ? 'var(--success)' : 'var(--text-muted)' }}>
                                                {g.fitness}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Summary */}
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(52, 211, 153, 0.4)' }} />
                        High Fitness (&gt;60)
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(99, 102, 241, 0.3)' }} />
                        Mid Fitness (40-60)
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(99, 102, 241, 0.15)' }} />
                        Low Fitness (&lt;40)
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        🔥 Persistent Gene (&gt;60% survival)
                    </div>
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 8: Decision Explainer
// ═══════════════════════════════════════════════════════════════

function DecisionExplainerPanel({ decisions }: { decisions: DecisionEvent[] }) {
    const formatTime = (ts: number): string => {
        const d = new Date(ts);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const formatTimeAgo = (ts: number): string => {
        const mins = Math.floor((Date.now() - ts) / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        return `${hours}h ago`;
    };

    const regimeChip = (regime: string) => {
        const color = REGIME_COLORS[regime] ?? '#6366f1';
        return (
            <span
                className="decision-regime-chip"
                style={{
                    background: `${color}18`,
                    color,
                    border: `1px solid ${color}30`,
                }}
            >
                {REGIME_LABELS[regime] ?? regime}
            </span>
        );
    };

    const outcomeEmoji = (outcome: DecisionEvent['outcome']): string => {
        if (outcome === 'profitable') return '✅';
        if (outcome === 'loss') return '❌';
        return '⏳';
    };

    const outcomeColor = (outcome: DecisionEvent['outcome']): string => {
        if (outcome === 'profitable') return 'var(--success)';
        if (outcome === 'loss') return 'var(--danger)';
        return 'var(--warning)';
    };

    return (
        <section id="decision-explainer" className="glass-card glass-card-accent accent-emerald col-4 stagger-in stagger-8">
            <div className="card-header">
                <div className="card-title">
                    <Target size={18} style={{ color: 'var(--success)' }} />
                    <span>Decision Explainer</span>
                </div>
                <span className="card-badge badge-success">{decisions.length} EVENTS</span>
            </div>
            <div className="card-body" style={{ maxHeight: 520, overflowY: 'auto' }}>
                {decisions.map((decision, idx) => (
                    <div className="decision-card" key={`decision-${idx}`}>
                        {/* Header: Regime Change */}
                        <div className="decision-header">
                            <div className="decision-regime-change">
                                🔄 {regimeChip(decision.fromRegime)}
                                <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                                {regimeChip(decision.toRegime)}
                            </div>
                            <span className="decision-time">{formatTimeAgo(decision.timestamp)}</span>
                        </div>

                        {/* Chosen Strategy */}
                        <div className="decision-strategy">
                            <span style={{ fontSize: '1rem' }}>{outcomeEmoji(decision.outcome)}</span>
                            <span>{decision.chosenStrategy}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: outcomeColor(decision.outcome), fontWeight: 600 }}>
                                {decision.outcome === 'profitable' ? 'Kârlı' : decision.outcome === 'loss' ? 'Zararlı' : 'Devam ediyor'}
                            </span>
                        </div>

                        {/* Reasons */}
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Neden bu strateji?
                        </div>
                        <div className="decision-reasons">
                            {decision.reasons.map((reason, rIdx) => (
                                <div className="decision-reason" key={`reason-${rIdx}`}>
                                    <span className="reason-icon">{reason.icon}</span>
                                    <span>{reason.text}</span>
                                    <span className="reason-value">{reason.value}</span>
                                </div>
                            ))}
                        </div>

                        {/* Alternatives */}
                        {decision.alternatives.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                                    Reddedilen alternatifler
                                </div>
                                {decision.alternatives.map((alt, aIdx) => (
                                    <div key={`alt-${aIdx}`} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        fontSize: '0.65rem',
                                        color: 'var(--text-muted)',
                                        padding: '3px 0',
                                    }}>
                                        <span style={{ color: 'var(--danger)' }}>✗</span>
                                        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{alt.name}</span>
                                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem' }}>({alt.confidence})</span>
                                        <span style={{ opacity: 0.6 }}>— {alt.rejected}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PIPELINE PAGE
// ═══════════════════════════════════════════════════════════════

export default function PipelinePage() {
    const { stages, gates, gateIdx, tradeProgress, currentStrategyName } = usePipelineStateMachine();

    // Generate demo data once
    const [demoData, setDemoData] = useState<{
        generations: GenerationData[];
        roster: RosterEntry[];
        replayCells: ReplayCell[];
        lineageNodes: LineageNode[];
        survivalRows: SurvivalRow[];
        decisions: DecisionEvent[];
    } | null>(null);

    useEffect(() => {
        setDemoData({
            generations: generateDemoGenerations(14),
            roster: generateDemoRoster(),
            replayCells: generateDemoReplayHeatmap(),
            lineageNodes: generateDemoLineage(),
            survivalRows: generateDemoSurvival(),
            decisions: generateDemoDecisions(),
        });
    }, []);

    if (!demoData) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: 'var(--bg-primary)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <Brain size={48} style={{ color: 'var(--accent-primary)', marginBottom: 16, animation: 'pulse-glow 2s ease-in-out infinite' }} />
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading Pipeline...</div>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* ─── Header ───────────────────────────────────────── */}
            <header className="app-header">
                <div className="app-logo">
                    <Brain size={24} style={{ color: 'var(--accent-primary)' }} />
                    <div>
                        <h1>Learner</h1>
                        <div className="subtitle">Self-Evolving AI Trading System</div>
                    </div>
                </div>
                <div className="header-actions">
                    <nav className="nav-tabs">
                        <Link href="/" className="nav-tab">
                            <Activity size={14} /> Dashboard
                        </Link>
                        <Link href="/pipeline" className="nav-tab active">
                            <GitBranch size={14} /> Pipeline
                        </Link>
                    </nav>
                </div>
            </header>

            {/* ─── Pipeline Grid ──────────────────────────────────── */}
            <main className="dashboard-grid">
                {/* Row 1: Pipeline Flow */}
                <PipelineFlowPanel
                    stages={stages}
                    tradeProgress={tradeProgress}
                    currentStrategyName={currentStrategyName}
                />

                {/* Row 2: Fitness + Validation */}
                <GenerationFitnessPanel generations={demoData.generations} />
                <ValidationGatePanel
                    gates={gates}
                    gateIdx={gateIdx}
                    currentStrategyName={currentStrategyName}
                />

                {/* Row 3: Roster + Replay */}
                <StrategyRosterPanel roster={demoData.roster} />
                <ExperienceReplayPanel cells={demoData.replayCells} />

                {/* Row 4: Strategy Archaeology — Gene Lineage (Full Width) */}
                <GeneLineagePanel nodes={demoData.lineageNodes} />

                {/* Row 5: Gene Survival Heatmap + Decision Explainer */}
                <GeneSurvivalPanel rows={demoData.survivalRows} />
                <DecisionExplainerPanel decisions={demoData.decisions} />
            </main>
        </>
    );
}

