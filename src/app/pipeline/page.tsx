'use client';
import { TestnetSessionPanel } from '@/components/panels/TestnetSessionPanel';
import { LiveTradeJournalPanel } from '@/components/panels/LiveTradeJournalPanel';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
    Brain, Activity, Dna, Shield, GitBranch, Zap,
    Target, BookOpen, Database, RefreshCw, ArrowRight,
    CheckCircle, XCircle, Clock, Layers, Radar, Grid3X3,
    TrendingUp, TrendingDown, Minus, BarChart3, Crosshair, Radio,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    RadarChart, PolarGrid, PolarAngleAxis, Radar as RechartsRadar,
    BarChart, Bar, CartesianGrid, ReferenceLine,
    LineChart, Line,
} from 'recharts';
import { MarketRegime, Timeframe } from '@/types';
import {
    usePipelineLiveData,
    type LiveTelemetrySnapshot,
    type LivePropagationSnapshot,
    type MRTISnapshot,
    type OvermindLiveSnapshot,
    type StressLiveSnapshot,
} from '@/lib/hooks/usePipelineLiveData';
import type { RiskSnapshot } from '@/types';
import type {
    GenomeHealthSnapshot,
    GeneDominanceEntry,
    AutoIntervention,
    HealthGrade,
} from '@/lib/engine/evolution-health';

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

// ─── Demo Stress Matrix Data ─────────────────────────────────

interface DemoScenarioResult {
    name: string;
    fitnessScore: number;
    equityReturnPercent: number;
    trades: number;
    detectedRegime: string;
    regimeConfidence: number;
}

interface DemoStressData {
    strategyName: string;
    resilienceScore: number;
    avgFitness: number;
    scenarioVariance: number;
    maxDrawdownWorst: number;
    scenarios: DemoScenarioResult[];
    strongest: string;
    weakest: string;
    calibration: {
        currentRegime: string;
        regimeConfidence: number;
        totalCalibrations: number;
        weights: Record<string, number>;
        calibratedRRS: number;
    };
}

const SCENARIO_NAMES = ['Bull Trend', 'Bear Crash', 'Sideways', 'High Volatility', 'Regime Transition'] as const;
const SCENARIO_KEYS = ['bull_trend', 'bear_crash', 'sideways', 'high_vol', 'regime_transition'] as const;

function generateDemoStressData(): DemoStressData {
    const scenarios: DemoScenarioResult[] = SCENARIO_NAMES.map((name, i) => {
        const fitness = rng(15, 85);
        return {
            name,
            fitnessScore: Math.round(fitness * 10) / 10,
            equityReturnPercent: Math.round(rng(-12, 25) * 100) / 100,
            trades: Math.floor(rng(8, 45)),
            detectedRegime: name,
            regimeConfidence: Math.round(rng(0.4, 0.95) * 100) / 100,
        };
    });

    const fitnesses = scenarios.map(s => s.fitnessScore);
    const avg = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const variance = fitnesses.reduce((sum, f) => sum + (f - avg) ** 2, 0) / fitnesses.length;
    const normalizedVar = Math.min(1, variance / (avg * avg + 1));
    const consistency = scenarios.filter(s => s.fitnessScore > avg * 0.6).length / scenarios.length;
    const rrs = Math.round(avg * (1 - normalizedVar) * (0.7 + consistency * 0.3) * 10) / 10;

    const strongest = scenarios.reduce((a, b) => a.fitnessScore > b.fitnessScore ? a : b);
    const weakest = scenarios.reduce((a, b) => a.fitnessScore < b.fitnessScore ? a : b);

    // ASC calibration demo
    const regimes = ['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'HIGH_VOLATILITY', 'LOW_VOLATILITY'];
    const currentRegime = regimes[Math.floor(Math.random() * regimes.length)];
    const weights: Record<string, number> = {};
    let remaining = 1.0;
    SCENARIO_KEYS.forEach((key, i) => {
        const isLast = i === SCENARIO_KEYS.length - 1;
        const w = isLast ? remaining : Math.round(rng(0.05, remaining * 0.5) * 100) / 100;
        weights[key] = w;
        remaining -= w;
    });

    return {
        strategyName: `Alpha-${Math.floor(rng(100, 999))}`,
        resilienceScore: Math.max(0, Math.min(100, rrs)),
        avgFitness: Math.round(avg * 10) / 10,
        scenarioVariance: Math.round(normalizedVar * 1000) / 1000,
        maxDrawdownWorst: Math.round(rng(8, 35) * 100) / 100,
        scenarios,
        strongest: strongest.name,
        weakest: weakest.name,
        calibration: {
            currentRegime,
            regimeConfidence: Math.round(rng(0.4, 0.92) * 100) / 100,
            totalCalibrations: Math.floor(rng(5, 120)),
            weights,
            calibratedRRS: Math.round(rrs * rng(0.85, 1.15) * 10) / 10,
        },
    };
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
// PANEL 9: Overmind Intelligence Hub (Phase 15 + CCR)
// ═══════════════════════════════════════════════════════════════

interface OvermindDemoHypothesis {
    id: string;
    hypothesis: string;
    slotLabel: string;
    confidence: number;
    status: 'ACTIVE' | 'CONFIRMED' | 'INVALIDATED';
}

interface OvermindDemoEpisode {
    id: string;
    type: 'hypothesis' | 'directive' | 'adversarial';
    summary: string;
    timestamp: number;
    success: boolean | null; // null = pending
    importance: number;
}

interface OvermindDemoInsight {
    id: string;
    insight: string;
    engine: string;
    confidence: number;
    isActive: boolean;
}

interface CounterfactualPoint {
    cycle: number;
    actualFitness: number;
    counterfactualFitness: number;
    gap: number;
}

function generateDemoOvermindData() {
    const now = Date.now();

    const hypotheses: OvermindDemoHypothesis[] = [
        { id: 'H-1', hypothesis: 'BTCUSDT Trending rejimde EMA(50)+MACD combo en yüksek fitness verir', slotLabel: 'BTC/1H', confidence: 78, status: 'ACTIVE' },
        { id: 'H-2', hypothesis: 'ETHUSDT Ranging rejimde RSI-based stratejiler Bollinger-based stratejilerden üstün', slotLabel: 'ETH/15M', confidence: 62, status: 'CONFIRMED' },
        { id: 'H-3', hypothesis: 'Yüksek volatilitede kısa SL (%1) uzun SL (%3) den iyi sonuç verir', slotLabel: 'Global', confidence: 45, status: 'ACTIVE' },
        { id: 'H-4', hypothesis: 'SOLUSDT düşen trendde short-bias stratejilerin win-rate %60 üstü', slotLabel: 'SOL/4H', confidence: 33, status: 'INVALIDATED' },
    ];

    const episodes: OvermindDemoEpisode[] = [
        { id: 'E-1', type: 'hypothesis', summary: 'EMA+MACD hipotezi BTC/1H için oluşturuldu', timestamp: now - 3600000 * 12, success: true, importance: 0.85 },
        { id: 'E-2', type: 'directive', summary: 'Yüksek mutasyon oranı directifi ETH/15M ye verildi', timestamp: now - 3600000 * 10, success: false, importance: 0.62 },
        { id: 'E-3', type: 'adversarial', summary: 'Flash-crash senaryosunda Nova Tiger dayanamadı', timestamp: now - 3600000 * 8, success: false, importance: 0.91 },
        { id: 'E-4', type: 'hypothesis', summary: 'RSI-temelli ranging hipotezi onayları topluyor', timestamp: now - 3600000 * 5, success: true, importance: 0.73 },
        { id: 'E-5', type: 'directive', summary: 'Diversity pressure artırımı SOL/4H ada', timestamp: now - 3600000 * 3, success: null, importance: 0.58 },
        { id: 'E-6', type: 'adversarial', summary: 'Likidite krizi testinde Legacy Alpha %92 hayatta kaldı', timestamp: now - 3600000 * 1, success: true, importance: 0.88 },
    ];

    const insights: OvermindDemoInsight[] = [
        { id: 'I-1', insight: 'Trending rejimde EMA(50) geni kullanılmalı — RSI(14) çok geç sinyalleri tetikliyor', engine: 'HypothesisEngine', confidence: 0.82, isActive: true },
        { id: 'I-2', insight: 'Adversarial test başarısızlıklarının %70 i SL %1 altında', engine: 'AdversarialTester', confidence: 0.74, isActive: true },
        { id: 'I-3', insight: 'BTCUSDT ve ETHUSDT hipotezleri birbirine transfer edilebilir', engine: 'EvolutionDirector', confidence: 0.56, isActive: false },
    ];

    // Counterfactual Comparison Data—actual vs "what would have happened"
    const counterfactualData: CounterfactualPoint[] = [];
    let actualBase = 35;
    let cfBase = 45;
    for (let i = 1; i <= 20; i++) {
        // Actual fitness improves over time (Overmind learning)
        actualBase += rng(-3, 6) + (i > 10 ? 1.5 : 0);
        // Counterfactual alternatives start better but converge
        cfBase += rng(-2, 4) - (i > 10 ? 0.5 : 0);
        const actual = Math.max(10, Math.min(95, Math.round(actualBase * 10) / 10));
        const cf = Math.max(10, Math.min(95, Math.round(cfBase * 10) / 10));
        counterfactualData.push({
            cycle: i,
            actualFitness: actual,
            counterfactualFitness: cf,
            gap: Math.round((cf - actual) * 10) / 10,
        });
    }

    return { hypotheses, episodes, insights, counterfactualData };
}

function OvermindIntelligenceHub({
    hypotheses,
    episodes,
    insights,
    counterfactualData,
    overmindLive,
}: {
    hypotheses: OvermindDemoHypothesis[];
    episodes: OvermindDemoEpisode[];
    insights: OvermindDemoInsight[];
    counterfactualData: CounterfactualPoint[];
    overmindLive?: OvermindLiveSnapshot | null;
}) {
    const phases = ['OBSERVE', 'ANALYZE', 'HYPOTHESIZE', 'DIRECT', 'VERIFY', 'LEARN'];
    const [demoPhaseIdx, setDemoPhaseIdx] = useState(0);

    // In live mode use real phase; in demo animate through phases
    const isLiveOvermind = !!overmindLive?.isActive;
    const livePhaseIdx = isLiveOvermind
        ? phases.indexOf(overmindLive!.currentPhase)
        : -1;
    const activePhaseIdx = isLiveOvermind && livePhaseIdx >= 0 ? livePhaseIdx : demoPhaseIdx;

    useEffect(() => {
        if (isLiveOvermind) return; // Don't animate in live mode
        const timer = setInterval(() => {
            setDemoPhaseIdx(prev => (prev + 1) % phases.length);
        }, 3000);
        return () => clearInterval(timer);
    }, [phases.length, isLiveOvermind]);

    const phaseColors: Record<string, string> = {
        OBSERVE: '#60a5fa',
        ANALYZE: '#a78bfa',
        HYPOTHESIZE: '#f472b6',
        DIRECT: '#34d399',
        VERIFY: '#fbbf24',
        LEARN: '#6366f1',
    };

    const statusColor = (status: string) => {
        if (status === 'CONFIRMED') return 'var(--success)';
        if (status === 'INVALIDATED') return 'var(--danger)';
        return 'var(--accent-primary)';
    };

    const typeEmoji = (type: string) => {
        if (type === 'hypothesis') return '💡';
        if (type === 'directive') return '🎯';
        return '🛡️';
    };

    const successEmoji = (success: boolean | null) => {
        if (success === true) return '✅';
        if (success === false) return '❌';
        return '⏳';
    };

    // Calculate overall learning rate from counterfactual gap
    const initialGap = counterfactualData[0]?.gap ?? 0;
    const finalGap = counterfactualData[counterfactualData.length - 1]?.gap ?? 0;
    const learningRate = initialGap !== 0
        ? Math.round(((initialGap - finalGap) / Math.abs(initialGap)) * 100)
        : 0;

    const formatTimeAgo = (ts: number): string => {
        const mins = Math.floor((Date.now() - ts) / 60000);
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        return `${hours}h`;
    };

    // ─── Live/Demo metric resolution ─────────────────────────
    const cycleCount = overmindLive?.cycleCount ?? 0;
    const totalHypotheses = overmindLive?.totalHypotheses ?? hypotheses.length;
    const activeHypothesesCount = overmindLive?.activeHypotheses ?? hypotheses.filter(h => h.status === 'ACTIVE').length;
    const hypothesisSuccessRate = overmindLive?.hypothesisSuccessRate ?? 0.65;
    const totalDirectives = overmindLive?.totalDirectives ?? episodes.filter(e => e.type === 'directive').length;
    const avgDirectiveImpact = overmindLive?.avgDirectiveImpact ?? 4.2;
    const tokensUsedThisHour = overmindLive?.tokensUsedThisHour ?? 0;
    const tokenBudgetRemaining = overmindLive?.tokenBudgetRemaining ?? 100000;
    const tokensUsedLifetime = overmindLive?.tokensUsedLifetime ?? 0;
    const adversarialTestsRun = overmindLive?.adversarialTestsRun ?? episodes.filter(e => e.type === 'adversarial').length;
    const avgResilienceScore = overmindLive?.avgResilienceScore ?? 72;
    const emergentIndicators = overmindLive?.emergentIndicatorsDiscovered ?? 0;
    const rsrdSyntheses = overmindLive?.rsrdSynthesesTotalPerformed ?? 0;
    const episodicMemorySize = overmindLive?.episodicMemorySize ?? episodes.length;
    const metaInsightsActive = overmindLive?.metaInsightsActive ?? insights.filter(i => i.isActive).length;
    const selfImprovementRate = overmindLive?.selfImprovementRate ?? (learningRate > 0 ? learningRate / 100 : 0.12);
    const counterfactualsGenerated = overmindLive?.counterfactualsGenerated ?? counterfactualData.length;
    const activePrePositions = overmindLive?.activePrePositions ?? 0;
    const predictionAccuracyRate = overmindLive?.predictionAccuracyRate ?? 0;
    const imminentTransitions = overmindLive?.imminentTransitions ?? 0;

    // Token pressure (0-100)
    const maxTokensPerHour = tokensUsedThisHour + tokenBudgetRemaining;
    const tokenPressurePct = maxTokensPerHour > 0
        ? Math.round((tokensUsedThisHour / maxTokensPerHour) * 100)
        : 0;
    const tokenPressureColor = tokenPressurePct >= 80 ? '#f43f5e'
        : tokenPressurePct >= 50 ? '#fbbf24' : '#22d3ee';

    return (
        <section id="overmind-hub" className="glass-card glass-card-accent accent-purple col-12 stagger-in stagger-9">
            <div className="card-header">
                <div className="card-title">
                    <Brain size={18} style={{ color: '#a78bfa' }} />
                    <span>Strategic Overmind Intelligence Hub</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isLiveOvermind && (
                        <span className="card-badge" style={{
                            background: 'rgba(52,211,153,0.12)',
                            color: '#34d399',
                            border: '1px solid rgba(52,211,153,0.3)',
                        }}>● OPUS LIVE</span>
                    )}
                    <span className="card-badge badge-primary">{cycleCount > 0 ? `CYCLE #${cycleCount}` : `${episodes.length} EPISODES`}</span>
                    <span className="card-badge badge-success">{metaInsightsActive} INSIGHTS</span>
                </div>
            </div>
            <div className="card-body">
                {/* Row 0: Cognitive Pulse — Token Pressure + Phase Heartbeat (Radical Innovation) */}
                <div style={{
                    display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap',
                    padding: '10px 14px',
                    background: 'rgba(14, 17, 30, 0.5)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(99, 102, 241, 0.08)',
                }}>
                    {/* Token Pressure Gauge */}
                    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            position: 'relative' as const,
                            width: 48, height: 48,
                        }}>
                            {/* Background ring */}
                            <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="24" cy="24" r="20" fill="none"
                                    stroke="rgba(99, 115, 171, 0.1)" strokeWidth="4" />
                                <circle cx="24" cy="24" r="20" fill="none"
                                    stroke={tokenPressureColor}
                                    strokeWidth="4"
                                    strokeDasharray={`${(tokenPressurePct / 100) * 125.66} 125.66`}
                                    strokeLinecap="round"
                                    style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.5s ease' }}
                                />
                            </svg>
                            {/* Center label */}
                            <div style={{
                                position: 'absolute' as const,
                                inset: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.55rem', fontWeight: 800,
                                color: tokenPressureColor,
                                fontFamily: "'JetBrains Mono', monospace",
                            }}>
                                {tokenPressurePct}%
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                                Token Budget
                            </div>
                            <div style={{ fontSize: '0.6rem', fontFamily: "'JetBrains Mono', monospace" }}>
                                <span style={{ color: tokenPressureColor }}>{(tokensUsedThisHour / 1000).toFixed(1)}k</span>
                                <span style={{ color: 'var(--text-muted)' }}> / {(maxTokensPerHour / 1000).toFixed(0)}k</span>
                            </div>
                            {tokenPressurePct >= 80 && (
                                <div style={{
                                    fontSize: '0.5rem', color: '#f43f5e', fontWeight: 700,
                                    animation: 'pulse-glow 1s ease-in-out infinite',
                                }}>⚠ BUDGET CRITICAL</div>
                            )}
                        </div>
                    </div>

                    {/* Separator */}
                    <div style={{ width: 1, background: 'rgba(99, 115, 171, 0.12)', margin: '4px 0' }} />

                    {/* Phase Heartbeat Timeline */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        gap: 4,
                        alignItems: 'center',
                    }}>
                        {phases.map((phase, idx) => {
                            const isActive = idx === activePhaseIdx;
                            const isDone = isLiveOvermind
                                ? livePhaseIdx >= 0 && idx < livePhaseIdx
                                : idx < demoPhaseIdx;
                            return (
                                <div
                                    key={phase}
                                    style={{
                                        flex: 1,
                                        textAlign: 'center' as const,
                                        padding: '6px 2px',
                                        borderRadius: 6,
                                        fontSize: '0.55rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.04em',
                                        textTransform: 'uppercase' as const,
                                        background: isActive ? `${phaseColors[phase]}20` : 'transparent',
                                        color: isActive ? phaseColors[phase] : isDone ? 'var(--text-muted)' : 'rgba(148, 163, 184, 0.4)',
                                        border: isActive ? `1px solid ${phaseColors[phase]}40` : '1px solid transparent',
                                        transition: 'all 0.5s ease',
                                        position: 'relative' as const,
                                    }}
                                >
                                    {isDone && <span style={{ marginRight: 2 }}>✓</span>}
                                    {phase}
                                    {isActive && (
                                        <div style={{
                                            position: 'absolute' as const,
                                            bottom: -2,
                                            left: '20%',
                                            right: '20%',
                                            height: 2,
                                            borderRadius: 1,
                                            background: phaseColors[phase],
                                            animation: 'pulse-glow 2s ease-in-out infinite',
                                        }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Separator */}
                    <div style={{ width: 1, background: 'rgba(99, 115, 171, 0.12)', margin: '4px 0' }} />

                    {/* Live Stats Compact */}
                    <div style={{ flex: '0 0 auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                        {[
                            { label: 'Hypotheses', value: `${activeHypothesesCount}/${totalHypotheses}`, color: '#a78bfa' },
                            { label: 'Directives', value: totalDirectives, color: '#34d399' },
                            { label: 'Adversarial', value: adversarialTestsRun, color: '#fbbf24' },
                        ].map(m => (
                            <div key={m.label} style={{
                                textAlign: 'center' as const,
                                minWidth: 50,
                            }}>
                                <div style={{
                                    fontSize: '0.85rem', fontWeight: 700,
                                    color: m.color,
                                    fontFamily: "'JetBrains Mono', monospace",
                                }}>{m.value}</div>
                                <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>
                                    {m.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Row 1: CCR + PSPP Metrics */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                    {/* CCR Metrics */}
                    <div style={{ display: 'flex', gap: 8, flex: '1 1 auto', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Episodes', value: episodicMemorySize, color: '#6366f1' },
                            { label: 'Counterfactuals', value: counterfactualsGenerated, color: '#f97316' },
                            { label: 'Meta-Insights', value: metaInsightsActive, color: '#34d399' },
                            { label: 'Self-Improve', value: `${selfImprovementRate > 0 ? '+' : ''}${(selfImprovementRate * 100).toFixed(0)}%`, color: selfImprovementRate > 0 ? '#34d399' : '#f87171' },
                            { label: 'PSPP Active', value: activePrePositions, color: '#a78bfa' },
                            { label: 'Prediction Acc', value: `${(predictionAccuracyRate * 100).toFixed(0)}%`, color: predictionAccuracyRate >= 0.5 ? '#34d399' : '#fbbf24' },
                            { label: 'Imminent', value: imminentTransitions, color: imminentTransitions > 0 ? '#f43f5e' : '#22d3ee' },
                            { label: 'Resilience', value: `${typeof avgResilienceScore === 'number' ? avgResilienceScore.toFixed(0) : '0'}`, color: '#6366f1' },
                        ].map(metric => (
                            <div key={metric.label} className="metric-card" style={{ minWidth: 70, padding: '6px 10px', textAlign: 'center' as const }}>
                                <div className="metric-value" style={{ fontSize: '1rem', color: metric.color }}>
                                    {metric.value}
                                </div>
                                <div className="metric-label" style={{ fontSize: '0.55rem' }}>{metric.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Row 2: Counterfactual Comparison Chart (Radical Innovation #5) */}
                <div style={{
                    marginBottom: 16,
                    padding: '12px 14px',
                    background: 'rgba(14, 17, 30, 0.5)',
                    borderRadius: 10,
                    border: '1px solid rgba(99, 102, 241, 0.08)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                            🔮 Counterfactual Comparison — Actual vs “What If?”
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                <div style={{ width: 16, height: 2, borderRadius: 1, background: '#6366f1' }} />
                                Actual Decisions
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                <div style={{ width: 16, height: 2, borderRadius: 1, background: '#f97316', opacity: 0.6 }} />
                                Best Alternative
                            </div>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={counterfactualData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99, 115, 171, 0.06)" />
                            <XAxis
                                dataKey="cycle"
                                tick={{ fill: '#64748b', fontSize: 10 }}
                                tickLine={false}
                                axisLine={{ stroke: 'rgba(99, 115, 171, 0.1)' }}
                                label={{ value: 'Overmind Cycle', position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 9 }}
                            />
                            <YAxis
                                tick={{ fill: '#64748b', fontSize: 10 }}
                                tickLine={false}
                                axisLine={{ stroke: 'rgba(99, 115, 171, 0.1)' }}
                                label={{ value: 'Fitness', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 9 }}
                            />
                            <Tooltip
                                contentStyle={TOOLTIP_STYLE}
                                formatter={((value: number) => [value.toFixed(1)]) as never}
                                labelFormatter={((label: number) => `Cycle ${label}`) as never}
                            />
                            {/* Counterfactual line (dashed, orange) */}
                            <Line
                                type="monotone"
                                dataKey="counterfactualFitness"
                                stroke="#f97316"
                                strokeWidth={2}
                                strokeDasharray="6 3"
                                dot={false}
                                strokeOpacity={0.6}
                            />
                            {/* Actual fitness line (solid, indigo) */}
                            <Line
                                type="monotone"
                                dataKey="actualFitness"
                                stroke="#6366f1"
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 4, fill: '#6366f1', stroke: '#1e1b4b', strokeWidth: 2 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                    <div style={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {learningRate > 0
                            ? `✅ Öğrenme kanıtlandı: gerçek kararlar karşı-olgusal alternatiflere yakınlaşıyor (+${learningRate}% gelişim)`
                            : '⏳ Daha fazla döngü gerekli — öğrenme henüz başlamadı'}
                    </div>
                </div>

                {/* Row 3: Hypotheses + Episodes + Insights */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {/* Active Hypotheses */}
                    <div style={{
                        flex: '1 1 260px',
                        padding: '10px 12px',
                        background: 'rgba(14, 17, 30, 0.4)',
                        borderRadius: 8,
                        border: '1px solid rgba(99, 102, 241, 0.06)',
                    }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            💡 Active Hypotheses
                        </div>
                        {hypotheses.map(h => (
                            <div key={h.id} style={{
                                padding: '6px 0',
                                borderBottom: '1px solid rgba(99, 115, 171, 0.06)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 3,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                        {h.hypothesis.length > 60 ? h.hypothesis.substring(0, 60) + '…' : h.hypothesis}
                                    </span>
                                    <span style={{ fontSize: '0.55rem', color: statusColor(h.status), fontWeight: 700 }}>
                                        {h.status}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{h.slotLabel}</span>
                                    <div style={{
                                        flex: 1,
                                        height: 3,
                                        borderRadius: 2,
                                        background: 'rgba(99, 115, 171, 0.1)',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            width: `${h.confidence}%`,
                                            height: '100%',
                                            borderRadius: 2,
                                            background: h.confidence >= 60 ? '#34d399' : h.confidence >= 40 ? '#6366f1' : '#94a3b8',
                                            transition: 'width 1s ease',
                                        }} />
                                    </div>
                                    <span style={{ fontSize: '0.55rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)' }}>
                                        {h.confidence}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Episodic Memory Timeline */}
                    <div style={{
                        flex: '1 1 300px',
                        padding: '10px 12px',
                        background: 'rgba(14, 17, 30, 0.4)',
                        borderRadius: 8,
                        border: '1px solid rgba(99, 102, 241, 0.06)',
                    }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            🧠 Episodic Memory Timeline
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {episodes.map(ep => (
                                <div key={ep.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '5px 8px',
                                    borderRadius: 6,
                                    background: ep.success === true
                                        ? 'rgba(52, 211, 153, 0.05)'
                                        : ep.success === false
                                            ? 'rgba(248, 113, 113, 0.05)'
                                            : 'rgba(99, 115, 171, 0.03)',
                                    border: `1px solid ${ep.success === true ? 'rgba(52, 211, 153, 0.1)' : ep.success === false ? 'rgba(248, 113, 113, 0.1)' : 'rgba(99, 115, 171, 0.05)'}`,
                                }}>
                                    <span style={{ fontSize: '0.8rem' }}>{typeEmoji(ep.type)}</span>
                                    <span style={{ fontSize: '0.7rem' }}>{successEmoji(ep.success)}</span>
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', flex: 1 }}>
                                        {ep.summary}
                                    </span>
                                    <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                        {formatTimeAgo(ep.timestamp)}
                                    </span>
                                    {/* Importance bar */}
                                    <div style={{
                                        width: 30,
                                        height: 3,
                                        borderRadius: 2,
                                        background: 'rgba(99, 115, 171, 0.1)',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            width: `${ep.importance * 100}%`,
                                            height: '100%',
                                            borderRadius: 2,
                                            background: ep.importance >= 0.8 ? '#f97316' : ep.importance >= 0.6 ? '#6366f1' : '#475569',
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Meta-Insights */}
                    <div style={{
                        flex: '1 1 240px',
                        padding: '10px 12px',
                        background: 'rgba(14, 17, 30, 0.4)',
                        borderRadius: 8,
                        border: '1px solid rgba(99, 102, 241, 0.06)',
                    }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            ✨ Meta-Insights (Self-Improvement)
                        </div>
                        {insights.map(ins => (
                            <div key={ins.id} style={{
                                padding: '8px 10px',
                                marginBottom: 6,
                                borderRadius: 6,
                                background: ins.isActive ? 'rgba(52, 211, 153, 0.06)' : 'rgba(99, 115, 171, 0.03)',
                                border: `1px solid ${ins.isActive ? 'rgba(52, 211, 153, 0.12)' : 'rgba(99, 115, 171, 0.06)'}`,
                            }}>
                                <div style={{ fontSize: '0.65rem', color: ins.isActive ? 'var(--text-primary)' : 'var(--text-muted)', marginBottom: 4 }}>
                                    {ins.insight}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{
                                        fontSize: '0.5rem',
                                        padding: '1px 6px',
                                        borderRadius: 3,
                                        background: 'rgba(99, 102, 241, 0.1)',
                                        color: 'var(--accent-primary)',
                                        fontWeight: 600,
                                    }}>
                                        {ins.engine}
                                    </span>
                                    <span style={{ fontSize: '0.55rem', color: ins.isActive ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                                        {ins.isActive ? '● Active' : '○ Decayed'}
                                        {' · '}
                                        {(ins.confidence * 100).toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Row 4: Regime Transition Radar (Radical Innovation #6: PSPP) */}
                <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                            🛰️ Regime Transition Radar — Predictive Pre-Positioning
                        </div>
                        <div style={{
                            fontSize: '0.55rem',
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'rgba(234, 179, 8, 0.08)',
                            color: '#eab308',
                            fontWeight: 700,
                            border: '1px solid rgba(234, 179, 8, 0.15)',
                        }}>
                            PSPP Active
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {/* Demo radar cards for 4 islands */}
                        {[
                            { slot: 'BTCUSDT·15m', risk: 0.72, current: 'TRENDING_UP', predicted: 'RANGING', candles: 18, status: 'SWITCH' as const, warnings: ['ADX declining', 'Duration 1.8×'] },
                            { slot: 'ETHUSDT·1h', risk: 0.41, current: 'RANGING', predicted: 'TRENDING_UP', candles: 65, status: 'PREPARE' as const, warnings: ['ATR accelerating'] },
                            { slot: 'SOLUSDT·15m', risk: 0.15, current: 'LOW_VOLATILITY', predicted: 'TRENDING_UP', candles: 112, status: 'HOLD' as const, warnings: [] },
                            { slot: 'BNBUSDT·4h', risk: 0.58, current: 'HIGH_VOLATILITY', predicted: 'RANGING', candles: 34, status: 'PREPARE' as const, warnings: ['Confidence decay 62%', 'Duration 1.4×'] },
                        ].map((item, idx) => {
                            const isImminent = item.risk >= 0.6;
                            const isPrepare = item.status === 'PREPARE';
                            const borderColor = isImminent
                                ? 'rgba(239, 68, 68, 0.25)'
                                : isPrepare
                                    ? 'rgba(234, 179, 8, 0.15)'
                                    : 'rgba(99, 102, 241, 0.06)';
                            const glowColor = isImminent
                                ? 'rgba(239, 68, 68, 0.06)'
                                : isPrepare
                                    ? 'rgba(234, 179, 8, 0.04)'
                                    : 'rgba(14, 17, 30, 0.4)';
                            const statusBadgeColor = isImminent
                                ? '#ef4444'
                                : isPrepare
                                    ? '#eab308'
                                    : '#34d399';
                            const statusBadgeBg = isImminent
                                ? 'rgba(239, 68, 68, 0.1)'
                                : isPrepare
                                    ? 'rgba(234, 179, 8, 0.1)'
                                    : 'rgba(52, 211, 153, 0.08)';

                            return (
                                <div key={idx} style={{
                                    flex: '1 1 200px',
                                    padding: '10px 12px',
                                    background: glowColor,
                                    borderRadius: 8,
                                    border: `1px solid ${borderColor}`,
                                    position: 'relative',
                                    overflow: 'hidden',
                                    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
                                    boxShadow: isImminent ? '0 0 16px rgba(239, 68, 68, 0.08)' : 'none',
                                }}>
                                    {/* Pulsing indicator for imminent transitions */}
                                    {isImminent && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 8,
                                            right: 8,
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: '#ef4444',
                                            animation: 'pulse 1.5s ease-in-out infinite',
                                            boxShadow: '0 0 6px rgba(239, 68, 68, 0.5)',
                                        }} />
                                    )}

                                    {/* Slot label */}
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                                        {item.slot}
                                    </div>

                                    {/* Risk bar */}
                                    <div style={{ marginBottom: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                            <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>Transition Risk</span>
                                            <span style={{ fontSize: '0.55rem', fontWeight: 700, color: isImminent ? '#ef4444' : isPrepare ? '#eab308' : '#34d399' }}>
                                                {(item.risk * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(99, 115, 171, 0.1)', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${item.risk * 100}%`,
                                                height: '100%',
                                                borderRadius: 2,
                                                background: isImminent
                                                    ? 'linear-gradient(90deg, #f97316, #ef4444)'
                                                    : isPrepare
                                                        ? 'linear-gradient(90deg, #34d399, #eab308)'
                                                        : 'linear-gradient(90deg, #34d399, #60a5fa)',
                                                transition: 'width 0.5s ease',
                                            }} />
                                        </div>
                                    </div>

                                    {/* Regime transition arrow */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                                        <span style={{
                                            fontSize: '0.5rem',
                                            padding: '1px 5px',
                                            borderRadius: 3,
                                            background: 'rgba(99, 102, 241, 0.08)',
                                            color: '#818cf8',
                                            fontWeight: 600,
                                        }}>
                                            {item.current.replace('_', ' ')}
                                        </span>
                                        <span style={{ fontSize: '0.55rem', color: isImminent ? '#ef4444' : '#475569' }}>→</span>
                                        <span style={{
                                            fontSize: '0.5rem',
                                            padding: '1px 5px',
                                            borderRadius: 3,
                                            background: isImminent ? 'rgba(239, 68, 68, 0.08)' : 'rgba(234, 179, 8, 0.08)',
                                            color: isImminent ? '#f87171' : '#fbbf24',
                                            fontWeight: 600,
                                        }}>
                                            {item.predicted.replace('_', ' ')}
                                        </span>
                                    </div>

                                    {/* Estimated candles + recommendation */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>
                                            ~{item.candles} candles left
                                        </span>
                                        <span style={{
                                            fontSize: '0.5rem',
                                            padding: '1px 6px',
                                            borderRadius: 3,
                                            background: statusBadgeBg,
                                            color: statusBadgeColor,
                                            fontWeight: 700,
                                        }}>
                                            {item.status}
                                        </span>
                                    </div>

                                    {/* Early warnings */}
                                    {item.warnings.length > 0 && (
                                        <div style={{ borderTop: '1px solid rgba(99, 115, 171, 0.06)', paddingTop: 4, marginTop: 4 }}>
                                            {item.warnings.map((w, wi) => (
                                                <div key={wi} style={{ fontSize: '0.5rem', color: '#f59e0b', lineHeight: 1.4 }}>
                                                    ⚠ {w}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 6 }}>
                        MRTI → Overmind köprüsü aktif · Rejim değişiminden ÖNCE strateji hazırlığı yapılıyor
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────
// Risk Shield Panel — GLOBAL Safety Rail Monitor (Risk Fortress)
// ─────────────────────────────────────────────────────────────────

function RiskShieldPanel({ riskLive }: { riskLive?: RiskSnapshot | null }) {
    // Demo defaults when no live data
    const risk = riskLive ?? {
        emergencyStopActive: false,
        dailyPnl: 0,
        dailyStartBalance: 10000,
        totalStartBalance: 10000,
        dailyDrawdownPct: 0,
        totalDrawdownPct: 0,
        openPositionCount: 0,
        globalRiskScore: 0,
        rails: {
            maxRiskPerTrade: 0.02,
            maxSimultaneousPositions: 3,
            dailyDrawdownLimit: 0.05,
            totalDrawdownLimit: 0.15,
            maxLeverage: 10,
            mandatoryStopLoss: true,
            paperTradeMinimum: 50,
            emergencyStopEnabled: true,
        },
        railUtilizations: {
            positionUtil: 0,
            dailyDrawdownUtil: 0,
            totalDrawdownUtil: 0,
        },
        recentLogs: [],
    };

    const isLiveRisk = !!riskLive;
    const score = risk.globalRiskScore;
    const scoreColor = score >= 80 ? '#f43f5e'
        : score >= 50 ? '#fbbf24'
            : score >= 20 ? '#22d3ee' : '#34d399';

    // 8 safety rails for display
    const railDefs = [
        {
            icon: '🎯', name: 'Max Risk/Trade',
            value: `${(risk.rails.maxRiskPerTrade * 100).toFixed(0)}%`,
            threshold: `${(risk.rails.maxRiskPerTrade * 100).toFixed(0)}%`,
            util: 0, // Can't be computed without per-trade data
            status: 'ENFORCED' as const,
        },
        {
            icon: '📊', name: 'Open Positions',
            value: `${risk.openPositionCount}`,
            threshold: `${risk.rails.maxSimultaneousPositions}`,
            util: risk.railUtilizations.positionUtil,
            status: risk.railUtilizations.positionUtil >= 1 ? 'AT_LIMIT' as const : 'OK' as const,
        },
        {
            icon: '📉', name: 'Daily Drawdown',
            value: `${(risk.dailyDrawdownPct * 100).toFixed(1)}%`,
            threshold: `${(risk.rails.dailyDrawdownLimit * 100).toFixed(0)}%`,
            util: risk.railUtilizations.dailyDrawdownUtil,
            status: risk.railUtilizations.dailyDrawdownUtil >= 0.8 ? 'WARNING' as const : 'OK' as const,
        },
        {
            icon: '🔻', name: 'Total Drawdown',
            value: `${(risk.totalDrawdownPct * 100).toFixed(1)}%`,
            threshold: `${(risk.rails.totalDrawdownLimit * 100).toFixed(0)}%`,
            util: risk.railUtilizations.totalDrawdownUtil,
            status: risk.railUtilizations.totalDrawdownUtil >= 0.8 ? 'CRITICAL' as const : 'OK' as const,
        },
        {
            icon: '🛡️', name: 'Mandatory SL',
            value: risk.rails.mandatoryStopLoss ? 'ACTIVE' : 'OFF',
            threshold: 'ALWAYS',
            util: risk.rails.mandatoryStopLoss ? 0 : 1,
            status: 'ENFORCED' as const,
        },
        {
            icon: '⚡', name: 'Max Leverage',
            value: `${risk.rails.maxLeverage}x`,
            threshold: `${risk.rails.maxLeverage}x`,
            util: 0,
            status: 'ENFORCED' as const,
        },
        {
            icon: '📝', name: 'Paper Minimum',
            value: `${risk.rails.paperTradeMinimum}`,
            threshold: `${risk.rails.paperTradeMinimum}`,
            util: 0,
            status: 'ENFORCED' as const,
        },
        {
            icon: '🚨', name: 'Emergency Stop',
            value: risk.emergencyStopActive ? 'ACTIVE' : 'READY',
            threshold: risk.rails.emergencyStopEnabled ? 'ENABLED' : 'DISABLED',
            util: risk.emergencyStopActive ? 1 : 0,
            status: risk.emergencyStopActive ? 'TRIGGERED' as const : 'STANDBY' as const,
        },
    ];

    const utilColor = (u: number) =>
        u >= 0.8 ? '#f43f5e' : u >= 0.5 ? '#fbbf24' : '#34d399';

    const statusBadge = (status: string) => {
        const map: Record<string, { bg: string; color: string }> = {
            OK: { bg: 'rgba(52,211,153,0.1)', color: '#34d399' },
            ENFORCED: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1' },
            WARNING: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
            CRITICAL: { bg: 'rgba(244,63,94,0.12)', color: '#f43f5e' },
            AT_LIMIT: { bg: 'rgba(244,63,94,0.12)', color: '#f43f5e' },
            TRIGGERED: { bg: 'rgba(244,63,94,0.2)', color: '#f43f5e' },
            STANDBY: { bg: 'rgba(52,211,153,0.08)', color: '#34d399' },
        };
        const s = map[status] ?? map.OK;
        return s;
    };

    return (
        <section id="risk-shield" className="glass-card glass-card-accent accent-danger col-12 stagger-in stagger-10">
            <div className="card-header">
                <div className="card-title">
                    <Shield size={18} style={{ color: risk.emergencyStopActive ? '#f43f5e' : '#34d399' }} />
                    <span>Risk Shield — GLOBAL Safety Rail Monitor</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {risk.emergencyStopActive && (
                        <span className="card-badge" style={{
                            background: 'rgba(244,63,94,0.2)',
                            color: '#f43f5e',
                            border: '1px solid rgba(244,63,94,0.4)',
                            animation: 'pulse-glow 1s ease-in-out infinite',
                        }}>🚨 EMERGENCY STOP</span>
                    )}
                    {isLiveRisk && (
                        <span className="card-badge" style={{
                            background: 'rgba(52,211,153,0.12)',
                            color: '#34d399',
                            border: '1px solid rgba(52,211,153,0.3)',
                        }}>● LIVE</span>
                    )}
                    <span className="card-badge" style={{
                        background: `${scoreColor}15`,
                        color: scoreColor,
                        border: `1px solid ${scoreColor}30`,
                    }}>RISK: {score}</span>
                </div>
            </div>
            <div className="card-body">
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {/* Left: Global Risk Score Ring + Daily PnL */}
                    <div style={{
                        flex: '0 0 auto',
                        display: 'flex', flexDirection: 'column' as const,
                        alignItems: 'center', justifyContent: 'center',
                        gap: 8,
                        padding: '12px 20px',
                        background: 'rgba(14, 17, 30, 0.5)',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${scoreColor}15`,
                        minWidth: 100,
                    }}>
                        {/* Score Ring */}
                        <div style={{ position: 'relative' as const, width: 64, height: 64 }}>
                            <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="32" cy="32" r="26" fill="none"
                                    stroke="rgba(99, 115, 171, 0.08)" strokeWidth="5" />
                                <circle cx="32" cy="32" r="26" fill="none"
                                    stroke={scoreColor}
                                    strokeWidth="5"
                                    strokeDasharray={`${(score / 100) * 163.36} 163.36`}
                                    strokeLinecap="round"
                                    style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.5s ease' }}
                                />
                            </svg>
                            <div style={{
                                position: 'absolute' as const, inset: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexDirection: 'column' as const,
                            }}>
                                <div style={{
                                    fontSize: '1.1rem', fontWeight: 800,
                                    color: scoreColor,
                                    fontFamily: "'JetBrains Mono', monospace",
                                }}>{score}</div>
                            </div>
                        </div>
                        <div style={{
                            fontSize: '0.5rem', color: 'var(--text-muted)',
                            textTransform: 'uppercase' as const, fontWeight: 700,
                            letterSpacing: '0.08em',
                        }}>Global Risk</div>

                        {/* Daily PnL */}
                        <div style={{
                            marginTop: 4,
                            padding: '4px 10px',
                            borderRadius: 4,
                            background: risk.dailyPnl >= 0
                                ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)',
                            border: `1px solid ${risk.dailyPnl >= 0 ? 'rgba(52,211,153,0.15)' : 'rgba(244,63,94,0.15)'}`,
                        }}>
                            <div style={{
                                fontSize: '0.5rem', color: 'var(--text-muted)',
                                textTransform: 'uppercase' as const, fontWeight: 600,
                            }}>Daily PnL</div>
                            <div style={{
                                fontSize: '0.8rem', fontWeight: 800,
                                color: risk.dailyPnl >= 0 ? '#34d399' : '#f43f5e',
                                fontFamily: "'JetBrains Mono', monospace",
                            }}>
                                {risk.dailyPnl >= 0 ? '+' : ''}{risk.dailyPnl.toFixed(2)}$
                            </div>
                        </div>
                    </div>

                    {/* Right: 8-Rail Status Matrix */}
                    <div style={{ flex: 1, minWidth: 300 }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: 6,
                        }}>
                            {railDefs.map(rail => {
                                const badge = statusBadge(rail.status);
                                const barColor = utilColor(rail.util);
                                const isFlashing = rail.util >= 0.8;
                                return (
                                    <div key={rail.name} style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '6px 10px',
                                        background: 'rgba(14, 17, 30, 0.4)',
                                        borderRadius: 6,
                                        border: `1px solid ${isFlashing ? `${barColor}30` : 'rgba(99, 115, 171, 0.06)'}`,
                                        animation: isFlashing ? 'pulse-glow 1.5s ease-in-out infinite' : 'none',
                                    }}>
                                        {/* Icon */}
                                        <span style={{ fontSize: '0.8rem', width: 22, textAlign: 'center' as const }}>{rail.icon}</span>
                                        {/* Name + Value */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between',
                                                alignItems: 'center', marginBottom: 2,
                                            }}>
                                                <span style={{
                                                    fontSize: '0.58rem', fontWeight: 700,
                                                    color: 'var(--text-primary)',
                                                    letterSpacing: '0.02em',
                                                }}>{rail.name}</span>
                                                <span style={{
                                                    fontSize: '0.55rem',
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    color: barColor,
                                                    fontWeight: 700,
                                                }}>
                                                    {rail.value} / {rail.threshold}
                                                </span>
                                            </div>
                                            {/* Utilization bar */}
                                            <div style={{
                                                height: 3, borderRadius: 2,
                                                background: 'rgba(99, 115, 171, 0.08)',
                                                overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${Math.min(100, rail.util * 100)}%`,
                                                    borderRadius: 2,
                                                    background: barColor,
                                                    transition: 'width 0.6s ease, background 0.4s ease',
                                                }} />
                                            </div>
                                        </div>
                                        {/* Status badge */}
                                        <span style={{
                                            fontSize: '0.45rem', fontWeight: 800,
                                            padding: '2px 5px', borderRadius: 3,
                                            background: badge.bg,
                                            color: badge.color,
                                            textTransform: 'uppercase' as const,
                                            letterSpacing: '0.04em',
                                            whiteSpace: 'nowrap' as const,
                                        }}>{rail.status}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Recent Risk Logs */}
                        {risk.recentLogs.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                                <div style={{
                                    fontSize: '0.55rem', fontWeight: 700,
                                    color: 'var(--text-muted)', marginBottom: 4,
                                    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                                }}>Recent Risk Events</div>
                                <div style={{
                                    maxHeight: 80, overflowY: 'auto' as const,
                                    display: 'flex', flexDirection: 'column' as const, gap: 2,
                                }}>
                                    {risk.recentLogs.slice(-5).reverse().map(log => (
                                        <div key={log.id} style={{
                                            fontSize: '0.5rem',
                                            padding: '2px 6px',
                                            borderRadius: 3,
                                            background: log.level === 'ERROR' || log.level === 'RISK'
                                                ? 'rgba(244,63,94,0.06)'
                                                : log.level === 'WARNING'
                                                    ? 'rgba(251,191,36,0.06)'
                                                    : 'rgba(99,115,171,0.04)',
                                            color: log.level === 'ERROR' || log.level === 'RISK'
                                                ? '#f87171'
                                                : log.level === 'WARNING' ? '#fbbf24' : 'var(--text-muted)',
                                            fontFamily: "'JetBrains Mono', monospace",
                                        }}>
                                            {new Date(log.timestamp).toLocaleTimeString()} · {log.message}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 10: Live Pulse Telemetry — RADICAL INNOVATION
// Real-time ADFI health + CIRPN cross-island propagation
// ═══════════════════════════════════════════════════════════════

function LivePulseTelemetryPanel({
    telemetry,
    propagation,
}: {
    telemetry: LiveTelemetrySnapshot | null;
    propagation: LivePropagationSnapshot | null;
}) {
    if (!telemetry && !propagation) return null;

    const formatUptime = (ms: number): string => {
        const hours = Math.floor(ms / 3_600_000);
        const mins = Math.floor((ms % 3_600_000) / 60_000);
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    const latencyColor = (ms: number): string => {
        if (ms < 500) return 'var(--success)';
        if (ms < 2000) return 'var(--warning)';
        return 'var(--danger)';
    };

    return (
        <section id="live-pulse" className="glass-card glass-card-accent accent-neural col-12 stagger-in stagger-1">
            <div className="card-header">
                <div className="card-title">
                    <Zap size={18} style={{ color: '#34d399' }} />
                    <span>Live Pulse Telemetry</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {telemetry && (
                        <span className="card-badge badge-success" style={{ fontSize: '0.55rem' }}>
                            ⚡ {telemetry.candlesPerMinute} candles/min
                        </span>
                    )}
                    {propagation && propagation.activeWarnings.length > 0 && (
                        <span className="card-badge badge-danger" style={{ fontSize: '0.55rem', animation: 'pulse-glow 2s ease-in-out infinite' }}>
                            🌊 {propagation.activeWarnings.length} CROSS-ISLAND WARNING{propagation.activeWarnings.length !== 1 ? 'S' : ''}
                        </span>
                    )}
                </div>
            </div>
            <div className="card-body">
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {/* ─── ADFI Data Pipeline Health ─── */}
                    {telemetry && (
                        <div style={{ flex: 1, minWidth: 320 }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                                📡 ADFI — Data Pipeline Health
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                                {/* Throughput */}
                                <div className="metric-card" style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <div className="metric-value" style={{ fontSize: '1rem', color: 'var(--success)' }}>
                                        {telemetry.totalCandles}
                                    </div>
                                    <div className="metric-label">Total Candles</div>
                                </div>
                                {/* Latency */}
                                <div className="metric-card" style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <div className="metric-value" style={{ fontSize: '1rem', color: latencyColor(telemetry.avgLatencyMs) }}>
                                        {telemetry.avgLatencyMs}ms
                                    </div>
                                    <div className="metric-label">Avg Latency</div>
                                </div>
                                {/* Gap Detection */}
                                <div className="metric-card" style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <div className="metric-value" style={{
                                        fontSize: '1rem',
                                        color: telemetry.gapsPending > 0 ? 'var(--danger)' : 'var(--success)',
                                    }}>
                                        {telemetry.gapsRepaired}/{telemetry.gapsDetected}
                                    </div>
                                    <div className="metric-label">Gaps Fixed</div>
                                </div>
                                {/* Reconnects */}
                                <div className="metric-card" style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <div className="metric-value" style={{
                                        fontSize: '1rem',
                                        color: telemetry.reconnects > 3 ? 'var(--warning)' : 'var(--text-primary)',
                                    }}>
                                        {telemetry.reconnects}
                                    </div>
                                    <div className="metric-label">Reconnects</div>
                                </div>
                                {/* Uptime */}
                                <div className="metric-card" style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <div className="metric-value" style={{ fontSize: '1rem', color: 'var(--accent-primary)' }}>
                                        {formatUptime(telemetry.uptimeMs)}
                                    </div>
                                    <div className="metric-label">Uptime</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── CIRPN Cross-Island Propagation ─── */}
                    {propagation && (
                        <div style={{ flex: 1, minWidth: 320 }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                                🌊 CIRPN — Cross-Island Regime Propagation
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                                {/* Stats */}
                                <div className="metric-card" style={{ padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                                    <div className="metric-value" style={{ fontSize: '0.9rem' }}>{propagation.totalRegimeEvents}</div>
                                    <div className="metric-label">Regime Events</div>
                                </div>
                                <div className="metric-card" style={{ padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                                    <div className="metric-value" style={{ fontSize: '0.9rem', color: '#34d399' }}>
                                        {propagation.leaderPairs.length}
                                    </div>
                                    <div className="metric-label">Leaders</div>
                                </div>
                                <div className="metric-card" style={{ padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                                    <div className="metric-value" style={{ fontSize: '0.9rem', color: '#818cf8' }}>
                                        {propagation.relationships.length}
                                    </div>
                                    <div className="metric-label">Correlations</div>
                                </div>
                            </div>

                            {/* Active Warnings */}
                            {propagation.activeWarnings.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {propagation.activeWarnings.slice(0, 4).map((w, i) => {
                                        const etaSeconds = Math.round(w.expectedArrivalMs / 1000);
                                        const confidencePct = Math.round(w.confidence * 100);
                                        const isImminent = etaSeconds < 60;
                                        return (
                                            <div key={i} style={{
                                                padding: '6px 10px',
                                                borderRadius: 6,
                                                background: isImminent
                                                    ? 'rgba(239, 68, 68, 0.06)'
                                                    : 'rgba(99, 102, 241, 0.04)',
                                                border: `1px solid ${isImminent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.1)'}`,
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: isImminent ? '#f87171' : '#818cf8' }}>
                                                        {w.sourcePair} → {w.targetPair}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.5rem',
                                                        padding: '1px 6px',
                                                        borderRadius: 3,
                                                        background: isImminent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.1)',
                                                        color: isImminent ? '#f87171' : '#a5b4fc',
                                                        fontWeight: 700,
                                                    }}>
                                                        ETA: {etaSeconds}s · {confidencePct}%
                                                    </span>
                                                </div>
                                                {/* ETA progress bar */}
                                                <div style={{ height: 3, borderRadius: 2, background: 'rgba(99, 115, 171, 0.08)', overflow: 'hidden' }}>
                                                    <div style={{
                                                        height: '100%',
                                                        borderRadius: 2,
                                                        width: `${Math.max(5, 100 - (etaSeconds / 600) * 100)}%`,
                                                        background: isImminent
                                                            ? 'linear-gradient(90deg, #ef4444, #f97316)'
                                                            : 'linear-gradient(90deg, #6366f1, #818cf8)',
                                                        transition: 'width 0.5s ease',
                                                    }} />
                                                </div>
                                                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: 3 }}>
                                                    Predicted: <span style={{ color: '#fbbf24', fontWeight: 600 }}>{w.predictedRegime.replace('_', ' ')}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '12px 0',
                                    fontSize: '0.65rem',
                                    color: 'var(--text-muted)',
                                    opacity: 0.6,
                                }}>
                                    No active cross-island warnings · Correlation network learning
                                </div>
                            )}

                            {/* Leader/Follower Pairs */}
                            {(propagation.leaderPairs.length > 0 || propagation.followerPairs.length > 0) && (
                                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                                    {propagation.leaderPairs.length > 0 && (
                                        <div style={{ fontSize: '0.55rem' }}>
                                            <span style={{ color: '#34d399', fontWeight: 700 }}>Leaders: </span>
                                            <span style={{ color: 'var(--text-secondary)' }}>
                                                {propagation.leaderPairs.join(', ')}
                                            </span>
                                        </div>
                                    )}
                                    {propagation.followerPairs.length > 0 && (
                                        <div style={{ fontSize: '0.55rem' }}>
                                            <span style={{ color: '#818cf8', fontWeight: 700 }}>Followers: </span>
                                            <span style={{ color: 'var(--text-secondary)' }}>
                                                {propagation.followerPairs.join(', ')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 11: Evolution Heartbeat Monitor — RADICAL INNOVATION
// Convergence / Stagnation / Gene Dominance Intelligence
// ═══════════════════════════════════════════════════════════════

const GRADE_COLORS: Record<HealthGrade, string> = {
    A: '#34d399',
    B: '#60a5fa',
    C: '#fbbf24',
    D: '#f97316',
    F: '#ef4444',
};

const TREND_ICON: Record<string, string> = {
    rising: '↑',
    stable: '•',
    declining: '↓',
};

const TREND_COLOR: Record<string, string> = {
    rising: '#34d399',
    stable: 'var(--text-muted)',
    declining: '#f87171',
};

function EvolutionHeartbeatPanel({ health }: { health: GenomeHealthSnapshot }) {
    const gradeColor = GRADE_COLORS[health.healthGrade];
    const riskPct = Math.round(health.convergenceRisk * 100);
    const diversityPct = Math.round(health.diversityIndex * 100);

    return (
        <section id="evo-heartbeat" className="glass-card glass-card-accent accent-evolution col-12 stagger-in stagger-2">
            <div className="card-header">
                <div className="card-title">
                    <Activity size={18} style={{ color: gradeColor }} />
                    <span>Evolution Heartbeat</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="card-badge" style={{
                        fontSize: '0.55rem',
                        background: `${gradeColor}15`,
                        color: gradeColor,
                        border: `1px solid ${gradeColor}30`,
                    }}>
                        Grade {health.healthGrade} · {health.healthLabel}
                    </span>
                    <span className="card-badge badge-info" style={{ fontSize: '0.55rem' }}>
                        Gen {health.currentGeneration}
                    </span>
                </div>
            </div>
            <div className="card-body">
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {/* ─── Left: Health Grade Ring + Core Metrics ─── */}
                    <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Pulse Ring */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{
                                width: 72,
                                height: 72,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: `conic-gradient(${gradeColor} ${100 - riskPct}%, rgba(99,115,171,0.08) 0%)`,
                                position: 'relative',
                                animation: health.convergenceRisk > 0.6 ? 'pulse-glow 1.5s ease-in-out infinite' : undefined,
                            }}>
                                <div style={{
                                    width: 58,
                                    height: 58,
                                    borderRadius: '50%',
                                    background: 'var(--bg-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column',
                                }}>
                                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: gradeColor, lineHeight: 1 }}>
                                        {health.healthGrade}
                                    </span>
                                    <span style={{ fontSize: '0.45rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        {100 - riskPct}% safe
                                    </span>
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                                    {health.healthRecommendation}
                                </div>
                                <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', opacity: 0.6 }}>
                                    {health.totalStrategiesTested} strategies tested across {health.currentGeneration + 1} generations
                                </div>
                            </div>
                        </div>

                        {/* Core Metrics Strip */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                            <div className="metric-card" style={{ padding: '6px 8px', textAlign: 'center' }}>
                                <div className="metric-value" style={{
                                    fontSize: '0.9rem',
                                    color: diversityPct > 50 ? '#34d399' : diversityPct > 30 ? '#fbbf24' : '#ef4444',
                                }}>
                                    {diversityPct}%
                                </div>
                                <div className="metric-label">Diversity</div>
                            </div>
                            <div className="metric-card" style={{ padding: '6px 8px', textAlign: 'center' }}>
                                <div className="metric-value" style={{
                                    fontSize: '0.9rem',
                                    color: health.stagnationLevel >= 3 ? '#ef4444' : health.stagnationLevel >= 1 ? '#fbbf24' : '#34d399',
                                }}>
                                    {health.stagnationLevel}
                                </div>
                                <div className="metric-label">Stagnation</div>
                            </div>
                            <div className="metric-card" style={{ padding: '6px 8px', textAlign: 'center' }}>
                                <div className="metric-value" style={{
                                    fontSize: '0.9rem',
                                    color: health.fitnessTrajectory > 0 ? '#34d399' : health.fitnessTrajectory < 0 ? '#ef4444' : 'var(--text-primary)',
                                }}>
                                    {health.fitnessTrajectory > 0 ? '+' : ''}{health.fitnessTrajectory}
                                </div>
                                <div className="metric-label">Trajectory</div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                            <div className="metric-card" style={{ padding: '6px 8px', textAlign: 'center' }}>
                                <div className="metric-value" style={{
                                    fontSize: '0.9rem',
                                    color: health.mutationPressure > 1.5 ? '#f97316' : health.mutationPressure < 0.8 ? '#60a5fa' : 'var(--text-primary)',
                                }}>
                                    {health.mutationPressure}x
                                </div>
                                <div className="metric-label">Mutation Δ</div>
                            </div>
                            <div className="metric-card" style={{ padding: '6px 8px', textAlign: 'center' }}>
                                <div className="metric-value" style={{
                                    fontSize: '0.9rem',
                                    color: '#818cf8',
                                }}>
                                    {health.currentBestFitness}
                                </div>
                                <div className="metric-label">Best Fit</div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Center: Gene Dominance Heatmap ─── */}
                    <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            🧠 Gene Dominance Distribution
                        </div>
                        {health.geneDominance.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {health.geneDominance.slice(0, 8).map((gene, i) => {
                                    const barPct = Math.round(gene.frequency * 100);
                                    return (
                                        <div key={gene.indicatorType} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{
                                                width: 80,
                                                fontSize: '0.5rem',
                                                fontWeight: 600,
                                                color: 'var(--text-secondary)',
                                                textAlign: 'right',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {gene.indicatorType.replace(/_/g, ' ')}
                                            </div>
                                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(99, 115, 171, 0.06)', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%',
                                                    borderRadius: 4,
                                                    width: `${barPct}%`,
                                                    background: `hsl(${220 + i * 20}, 70%, 60%)`,
                                                    transition: 'width 0.5s ease',
                                                }} />
                                            </div>
                                            <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>
                                                {barPct}%
                                            </span>
                                            <span style={{
                                                fontSize: '0.5rem',
                                                color: TREND_COLOR[gene.trending],
                                                fontWeight: 700,
                                                width: 10,
                                                textAlign: 'center',
                                            }}>
                                                {TREND_ICON[gene.trending]}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.6rem', color: 'var(--text-muted)', opacity: 0.6 }}>
                                Waiting for first generation…
                            </div>
                        )}
                    </div>

                    {/* ─── Right: Autopilot Log ─── */}
                    <div style={{ flex: '0 0 220px' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            🤖 Autopilot Interventions
                        </div>
                        {health.recentInterventions.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {health.recentInterventions.map((intervention, i) => {
                                    const iconMap: Record<string, string> = {
                                        MUTATION_BOOST: '⚡',
                                        MUTATION_DECAY: '📉',
                                        DIVERSITY_INJECTION: '🎲',
                                        REPLAY_SEED: '🧬',
                                    };
                                    const icon = iconMap[intervention.type] ?? '⚙️';
                                    return (
                                        <div key={i} style={{
                                            padding: '4px 8px',
                                            borderRadius: 4,
                                            background: 'rgba(99, 102, 241, 0.03)',
                                            border: '1px solid rgba(99, 102, 241, 0.06)',
                                            fontSize: '0.5rem',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                                                    {icon} Gen {intervention.generation}
                                                </span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.45rem' }}>
                                                    {intervention.type.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                                                {intervention.description}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.6rem', color: 'var(--text-muted)', opacity: 0.6 }}>
                                No auto-interventions yet
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 12: MRTI Forecast — Markov Regime Transition Intelligence
// Regime transition predictions, early-warning signals, 5×5 matrix
// ═══════════════════════════════════════════════════════════════

// ─── MRTI Demo Data Generator ───────────────────────────────

const ALL_REGIMES_ORDERED = [
    MarketRegime.TRENDING_UP,
    MarketRegime.TRENDING_DOWN,
    MarketRegime.RANGING,
    MarketRegime.HIGH_VOLATILITY,
    MarketRegime.LOW_VOLATILITY,
];

const MRTI_REGIME_SHORT: Record<string, string> = {
    [MarketRegime.TRENDING_UP]: 'T▲',
    [MarketRegime.TRENDING_DOWN]: 'T▼',
    [MarketRegime.RANGING]: 'RNG',
    [MarketRegime.HIGH_VOLATILITY]: 'HV',
    [MarketRegime.LOW_VOLATILITY]: 'LV',
};

const MRTI_REGIME_FULL: Record<string, string> = {
    [MarketRegime.TRENDING_UP]: 'Trend ▲',
    [MarketRegime.TRENDING_DOWN]: 'Trend ▼',
    [MarketRegime.RANGING]: 'Ranging',
    [MarketRegime.HIGH_VOLATILITY]: 'High Vol',
    [MarketRegime.LOW_VOLATILITY]: 'Low Vol',
};

const MRTI_REGIME_CLR: Record<string, string> = {
    [MarketRegime.TRENDING_UP]: '#34d399',
    [MarketRegime.TRENDING_DOWN]: '#f43f5e',
    [MarketRegime.RANGING]: '#6366f1',
    [MarketRegime.HIGH_VOLATILITY]: '#fbbf24',
    [MarketRegime.LOW_VOLATILITY]: '#22d3ee',
};

type EarlyWarningSignalKey = 'adx_slope' | 'atr_acceleration' | 'duration_exhaustion' | 'confidence_decay';

interface DemoMRTI {
    currentRegime: MarketRegime;
    currentConfidence: number;
    transitionRisk: number;
    predictedNextRegime: MarketRegime;
    predictedNextProbability: number;
    earlyWarnings: Array<{ signal: EarlyWarningSignalKey; severity: number; description: string }>;
    estimatedCandlesRemaining: number;
    recommendation: 'HOLD' | 'PREPARE' | 'SWITCH';
    transitionProbabilities: Record<MarketRegime, number>;
    matrixReliable: boolean;
    matrix: Record<MarketRegime, Record<MarketRegime, number>>;
    averageDurations: Record<MarketRegime, number>;
    totalTransitions: number;
}

function generateDemoMRTI(): DemoMRTI {
    const currentIdx = Math.floor(Math.random() * ALL_REGIMES_ORDERED.length);
    const currentRegime = ALL_REGIMES_ORDERED[currentIdx];
    const nextIdx = (currentIdx + 1 + Math.floor(Math.random() * (ALL_REGIMES_ORDERED.length - 1))) % ALL_REGIMES_ORDERED.length;
    const predictedNext = ALL_REGIMES_ORDERED[nextIdx];

    const transitionRisk = Math.round(rng(0.05, 0.85) * 1000) / 1000;

    let recommendation: 'HOLD' | 'PREPARE' | 'SWITCH';
    if (transitionRisk >= 0.7) recommendation = 'SWITCH';
    else if (transitionRisk >= 0.3) recommendation = 'PREPARE';
    else recommendation = 'HOLD';

    // Build demo 5×5 matrix with realistic-looking probabilities
    const matrix = {} as Record<MarketRegime, Record<MarketRegime, number>>;
    const averageDurations = {} as Record<MarketRegime, number>;
    for (const from of ALL_REGIMES_ORDERED) {
        const row = {} as Record<MarketRegime, number>;
        let remaining = 1.0;
        // Self-transition gets the lion's share
        const selfProb = rng(0.5, 0.85);
        row[from] = Math.round(selfProb * 1000) / 1000;
        remaining -= selfProb;
        const others = ALL_REGIMES_ORDERED.filter(r => r !== from);
        for (let j = 0; j < others.length; j++) {
            const isLast = j === others.length - 1;
            const p = isLast ? remaining : Math.round(rng(0, remaining * 0.6) * 1000) / 1000;
            row[others[j]] = Math.max(0, p);
            remaining -= p;
        }
        matrix[from] = row;
        averageDurations[from] = Math.round(rng(20, 80) * 10) / 10;
    }

    // Transition probabilities row for current regime
    const transitionProbabilities = { ...matrix[currentRegime] };

    // Early warning signals
    const earlyWarnings: DemoMRTI['earlyWarnings'] = [];
    const signals: Array<{ key: EarlyWarningSignalKey; label: string }> = [
        { key: 'adx_slope', label: 'ADX' },
        { key: 'atr_acceleration', label: 'ATR' },
        { key: 'duration_exhaustion', label: 'Duration' },
        { key: 'confidence_decay', label: 'Confidence' },
    ];
    for (const s of signals) {
        const sev = Math.round(rng(0, 0.95) * 100) / 100;
        if (sev > 0.15) {
            earlyWarnings.push({
                signal: s.key,
                severity: sev,
                description: `${s.label}: severity ${sev.toFixed(2)}`,
            });
        }
    }

    return {
        currentRegime,
        currentConfidence: Math.round(rng(0.3, 0.95) * 100) / 100,
        transitionRisk,
        predictedNextRegime: predictedNext,
        predictedNextProbability: Math.round(rng(0.15, 0.55) * 1000) / 1000,
        earlyWarnings: earlyWarnings.sort((a, b) => b.severity - a.severity),
        estimatedCandlesRemaining: Math.floor(rng(5, 120)),
        recommendation,
        transitionProbabilities,
        matrixReliable: Math.random() > 0.2,
        matrix,
        averageDurations,
        totalTransitions: Math.floor(rng(25, 180)),
    };
}

// ─── MRTI Forecast Panel ────────────────────────────────────

function MRTIForecastPanel({
    mrtiSnapshot,
    propagation,
}: {
    mrtiSnapshot: MRTISnapshot | null;
    propagation: LivePropagationSnapshot | null;
}) {
    // Use live data or demo fallback
    const [demoMrti, setDemoMrti] = useState<DemoMRTI | null>(null);

    useEffect(() => {
        if (!mrtiSnapshot) {
            setDemoMrti(generateDemoMRTI());
            const iv = setInterval(() => setDemoMrti(generateDemoMRTI()), 8000);
            return () => clearInterval(iv);
        }
    }, [mrtiSnapshot]);

    // Resolve data source
    const forecast = mrtiSnapshot?.forecast ?? null;
    const matrixSnap = mrtiSnapshot?.matrixSnapshot ?? null;

    const currentRegime = forecast?.currentRegime ?? demoMrti?.currentRegime ?? MarketRegime.RANGING;
    const currentConfidence = forecast?.currentConfidence ?? demoMrti?.currentConfidence ?? 0.5;
    const transitionRisk = forecast?.transitionRisk ?? demoMrti?.transitionRisk ?? 0;
    const predictedNext = forecast?.predictedNextRegime ?? demoMrti?.predictedNextRegime ?? MarketRegime.TRENDING_UP;
    const predictedNextProb = forecast?.predictedNextProbability ?? demoMrti?.predictedNextProbability ?? 0;
    const earlyWarnings = forecast?.earlyWarnings ?? demoMrti?.earlyWarnings ?? [];
    const candlesRemaining = forecast?.estimatedCandlesRemaining ?? demoMrti?.estimatedCandlesRemaining ?? 0;
    const recommendation = forecast?.recommendation ?? demoMrti?.recommendation ?? 'HOLD';
    const matrixReliable = forecast?.matrixReliable ?? demoMrti?.matrixReliable ?? false;
    const totalTransitions = matrixSnap?.totalTransitions ?? demoMrti?.totalTransitions ?? 0;
    const matrixData = matrixSnap?.matrix ?? demoMrti?.matrix ?? null;
    const avgDurations = matrixSnap?.averageDurations ?? demoMrti?.averageDurations ?? null;

    // Recommendation styling
    const recColor = recommendation === 'HOLD' ? '#34d399'
        : recommendation === 'PREPARE' ? '#fbbf24' : '#f43f5e';
    const recBg = recommendation === 'HOLD' ? 'rgba(52,211,153,0.1)'
        : recommendation === 'PREPARE' ? 'rgba(251,191,36,0.1)' : 'rgba(244,63,94,0.1)';

    // Risk gauge gradient position (0-100%)
    const riskPct = Math.round(transitionRisk * 100);

    // Warning signal labels
    const signalLabel: Record<string, string> = {
        adx_slope: 'ADX Slope',
        atr_acceleration: 'ATR Accel',
        duration_exhaustion: 'Duration',
        confidence_decay: 'Confidence',
    };

    // All 4 signals with default 0 severity
    const allSignals: Array<{ key: string; severity: number }> = [
        'adx_slope', 'atr_acceleration', 'duration_exhaustion', 'confidence_decay'
    ].map(key => {
        const found = earlyWarnings.find(w => w.signal === key);
        return { key, severity: found?.severity ?? 0 };
    });

    // Severity bar color
    const sevColor = (s: number) => {
        if (s >= 0.7) return '#f43f5e';
        if (s >= 0.4) return '#fbbf24';
        if (s > 0.15) return '#22d3ee';
        return 'rgba(99, 115, 171, 0.15)';
    };

    // Matrix cell color intensity
    const matrixCellColor = (prob: number, isSelf: boolean) => {
        if (isSelf) {
            const alpha = Math.min(0.5, prob * 0.55);
            return `rgba(99, 115, 171, ${alpha})`;
        }
        const alpha = Math.min(0.7, prob * 1.4);
        return `rgba(34, 211, 238, ${alpha})`;
    };

    // Find the highest non-self probability in a row
    const highestNonSelf = (row: Record<MarketRegime, number>, self: MarketRegime): MarketRegime | null => {
        let best: MarketRegime | null = null;
        let bestP = -1;
        for (const r of ALL_REGIMES_ORDERED) {
            if (r === self) continue;
            if (row[r] > bestP) { bestP = row[r]; best = r; }
        }
        return best;
    };

    return (
        <section id="mrti-forecast" className="glass-card glass-card-accent accent-cyan col-12 stagger-in stagger-2">
            <div className="card-header">
                <div className="card-title">
                    <Radar size={18} style={{ color: '#22d3ee' }} />
                    <span>MRTI — Regime Transition Intelligence</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="card-badge" style={{
                        background: matrixReliable ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
                        color: matrixReliable ? '#34d399' : '#fbbf24',
                        border: `1px solid ${matrixReliable ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}`,
                    }}>
                        {matrixReliable ? '● CALIBRATED' : '◌ LEARNING'}
                    </span>
                    <span className="card-badge badge-primary"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem' }}>
                        {totalTransitions} transitions
                    </span>
                </div>
            </div>
            <div className="card-body" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

                {/* ── Sub-Zone 1: Forecast HUD ──────────────── */}
                <div style={{ flex: '1 1 280px', minWidth: 260 }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        Forecast Overview
                    </div>

                    {/* Current Regime */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{
                            padding: '6px 14px',
                            borderRadius: 'var(--radius-sm)',
                            background: `${MRTI_REGIME_CLR[currentRegime]}18`,
                            border: `1px solid ${MRTI_REGIME_CLR[currentRegime]}40`,
                            color: MRTI_REGIME_CLR[currentRegime],
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            fontFamily: "'JetBrains Mono', monospace",
                        }}>
                            {MRTI_REGIME_FULL[currentRegime] ?? currentRegime}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            conf: <span style={{ color: currentConfidence >= 0.6 ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
                                {(currentConfidence * 100).toFixed(0)}%
                            </span>
                        </div>
                    </div>

                    {/* Transition Risk Gauge */}
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                            <span>Transition Risk</span>
                            <span style={{
                                color: riskPct >= 70 ? '#f43f5e' : riskPct >= 30 ? '#fbbf24' : '#34d399',
                                fontWeight: 700,
                                fontFamily: "'JetBrains Mono', monospace",
                            }}>{riskPct}%</span>
                        </div>
                        <div style={{
                            height: 8,
                            borderRadius: 4,
                            background: 'rgba(99, 115, 171, 0.08)',
                            overflow: 'hidden',
                            position: 'relative' as const,
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${riskPct}%`,
                                borderRadius: 4,
                                background: riskPct >= 70
                                    ? 'linear-gradient(90deg, #fbbf24, #f43f5e)'
                                    : riskPct >= 30
                                        ? 'linear-gradient(90deg, #34d399, #fbbf24)'
                                        : 'linear-gradient(90deg, #22d3ee, #34d399)',
                                transition: 'width 0.6s ease',
                            }} />
                        </div>
                    </div>

                    {/* Predicted Next */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                        background: 'rgba(14, 17, 30, 0.4)',
                        border: '1px solid rgba(99, 115, 171, 0.1)',
                        marginBottom: 12,
                    }}>
                        <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                        <div style={{ flex: 1, fontSize: '0.7rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Next: </span>
                            <span style={{ color: MRTI_REGIME_CLR[predictedNext], fontWeight: 700 }}>
                                {MRTI_REGIME_FULL[predictedNext]}
                            </span>
                            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                                ({(predictedNextProb * 100).toFixed(1)}%)
                            </span>
                        </div>
                    </div>

                    {/* Candles Remaining + Recommendation */}
                    <div style={{ display: 'flex', gap: 10 }}>
                        <div className="metric-card" style={{ flex: 1, padding: '8px 10px' }}>
                            <div className="metric-value" style={{
                                fontSize: '1.1rem',
                                fontFamily: "'JetBrains Mono', monospace",
                            }}>{candlesRemaining}</div>
                            <div className="metric-label">Candles Left</div>
                        </div>
                        <div className="metric-card" style={{
                            flex: 1, padding: '8px 10px',
                            background: recBg,
                            border: `1px solid ${recColor}30`,
                        }}>
                            <div className="metric-value" style={{
                                fontSize: '0.85rem',
                                color: recColor,
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                            }}>{recommendation}</div>
                            <div className="metric-label">Action</div>
                        </div>
                    </div>
                </div>

                {/* ── Sub-Zone 2: Early Warning Signals ─────── */}
                <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        Early Warning Signals
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                        {allSignals.map(sig => {
                            const pct = Math.round(sig.severity * 100);
                            const active = sig.severity > 0.15;
                            return (
                                <div key={sig.key}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        fontSize: '0.6rem', marginBottom: 3,
                                    }}>
                                        <span style={{
                                            color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                                            fontWeight: active ? 600 : 400,
                                        }}>
                                            {signalLabel[sig.key]}
                                        </span>
                                        <span style={{
                                            color: sevColor(sig.severity),
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontWeight: 600,
                                        }}>
                                            {pct}%
                                        </span>
                                    </div>
                                    <div style={{
                                        height: 6,
                                        borderRadius: 3,
                                        background: 'rgba(99, 115, 171, 0.06)',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${pct}%`,
                                            borderRadius: 3,
                                            background: sevColor(sig.severity),
                                            transition: 'width 0.5s ease, background 0.5s ease',
                                            boxShadow: active ? `0 0 8px ${sevColor(sig.severity)}40` : 'none',
                                        }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Composite indicator */}
                    <div style={{
                        marginTop: 14, padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(14, 17, 30, 0.4)',
                        border: '1px solid rgba(99, 115, 171, 0.08)',
                        fontSize: '0.6rem', color: 'var(--text-muted)',
                        display: 'flex', justifyContent: 'space-between',
                    }}>
                        <span>Active Warnings</span>
                        <span style={{
                            color: earlyWarnings.length >= 3 ? '#f43f5e'
                                : earlyWarnings.length >= 2 ? '#fbbf24' : '#34d399',
                            fontWeight: 700,
                        }}>{earlyWarnings.length}/4</span>
                    </div>
                </div>

                {/* ── Sub-Zone 3: Transition Matrix Heatmap ─── */}
                <div style={{ flex: '1 1 300px', minWidth: 280 }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        Markov Transition Matrix
                    </div>

                    {matrixData ? (
                        <div style={{ overflowX: 'auto' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: `60px repeat(${ALL_REGIMES_ORDERED.length}, 1fr)`,
                                gap: 2,
                                fontSize: '0.55rem',
                            }}>
                                {/* Header row */}
                                <div />
                                {ALL_REGIMES_ORDERED.map(r => (
                                    <div key={`hdr-${r}`} style={{
                                        textAlign: 'center',
                                        color: MRTI_REGIME_CLR[r],
                                        fontWeight: 700,
                                        padding: '3px 2px',
                                        fontFamily: "'JetBrains Mono', monospace",
                                    }}>
                                        {MRTI_REGIME_SHORT[r]}
                                    </div>
                                ))}

                                {/* Data rows */}
                                {ALL_REGIMES_ORDERED.map(from => {
                                    const row = matrixData[from];
                                    const best = highestNonSelf(row, from);
                                    return (
                                        <React.Fragment key={`row-${from}`}>
                                            <div style={{
                                                color: MRTI_REGIME_CLR[from],
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '0 4px',
                                                fontFamily: "'JetBrains Mono', monospace",
                                                whiteSpace: 'nowrap' as const,
                                            }}>
                                                {MRTI_REGIME_SHORT[from]}
                                            </div>
                                            {ALL_REGIMES_ORDERED.map(to => {
                                                const prob = row[to] ?? 0;
                                                const isSelf = from === to;
                                                const isBest = to === best;
                                                return (
                                                    <div
                                                        key={`${from}-${to}`}
                                                        style={{
                                                            background: matrixCellColor(prob, isSelf),
                                                            borderRadius: 3,
                                                            padding: '5px 2px',
                                                            textAlign: 'center' as const,
                                                            fontFamily: "'JetBrains Mono', monospace",
                                                            fontWeight: isBest ? 800 : 400,
                                                            color: isSelf
                                                                ? 'rgba(148, 163, 184, 0.5)'
                                                                : prob >= 0.15 ? '#e2e8f0' : 'var(--text-muted)',
                                                            border: isBest
                                                                ? '1px solid rgba(34, 211, 238, 0.4)'
                                                                : isSelf
                                                                    ? '1px solid rgba(99, 115, 171, 0.15)'
                                                                    : '1px solid transparent',
                                                            position: 'relative' as const,
                                                        }}
                                                        title={`P(${MRTI_REGIME_FULL[to]} | ${MRTI_REGIME_FULL[from]}) = ${(prob * 100).toFixed(1)}%`}
                                                    >
                                                        {(prob * 100).toFixed(0)}%
                                                        {isBest && (
                                                            <span style={{
                                                                position: 'absolute' as const,
                                                                top: -2, right: -2,
                                                                fontSize: '0.45rem',
                                                                color: '#22d3ee',
                                                            }}>★</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            {/* Average durations bar */}
                            {avgDurations && (
                                <div style={{
                                    display: 'flex', gap: 6, marginTop: 8,
                                    flexWrap: 'wrap' as const,
                                }}>
                                    {ALL_REGIMES_ORDERED.map(r => (
                                        <div key={`dur-${r}`} style={{
                                            fontSize: '0.5rem',
                                            color: 'var(--text-muted)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 3,
                                        }}>
                                            <span style={{ color: MRTI_REGIME_CLR[r], fontWeight: 600 }}>
                                                {MRTI_REGIME_SHORT[r]}
                                            </span>
                                            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                                ~{avgDurations[r]?.toFixed(0) ?? '?'}
                                            </span>
                                        </div>
                                    ))}
                                    <span style={{ fontSize: '0.45rem', color: 'var(--text-muted)', opacity: 0.6 }}>
                                        avg candles
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{
                            padding: '24px 12px', textAlign: 'center' as const,
                            fontSize: '0.7rem', color: 'var(--text-muted)',
                            background: 'rgba(14, 17, 30, 0.3)',
                            borderRadius: 'var(--radius-sm)',
                        }}>
                            Matrix building… Need ≥200 candles
                        </div>
                    )}
                </div>
            </div>

            {/* ── Radical Innovation: Regime Horizon Bar ──────── */}
            <div style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(14, 17, 30, 0.5)',
                border: '1px solid rgba(99, 115, 171, 0.08)',
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: '0.55rem', color: 'var(--text-muted)',
                    fontWeight: 600, textTransform: 'uppercase' as const,
                    letterSpacing: '0.08em', marginBottom: 8,
                }}>
                    <span>⏱ Predictive Horizon</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", textTransform: 'none' as const }}>
                        {candlesRemaining} candles → {MRTI_REGIME_FULL[predictedNext]}
                    </span>
                </div>

                {/* Timeline bar with gradient */}
                <div style={{ position: 'relative' as const, height: 28 }}>
                    {/* Background gradient: green → amber → red */}
                    <div style={{
                        position: 'absolute' as const,
                        inset: 0,
                        borderRadius: 6,
                        background: `linear-gradient(90deg, 
                            rgba(52,211,153,0.15) 0%, 
                            rgba(251,191,36,0.15) ${Math.max(30, 100 - riskPct)}%, 
                            rgba(244,63,94,0.2) 100%)`,
                        overflow: 'hidden',
                    }}>
                        {/* Progress fill showing time elapsed */}
                        <div style={{
                            height: '100%',
                            width: `${Math.min(95, Math.max(5, 100 - (candlesRemaining / (candlesRemaining + 50) * 100)))}%`,
                            background: `linear-gradient(90deg, 
                                ${MRTI_REGIME_CLR[currentRegime]}30  0%, 
                                ${MRTI_REGIME_CLR[currentRegime]}10 100%)`,
                            borderRight: `2px solid ${MRTI_REGIME_CLR[currentRegime]}80`,
                            transition: 'width 1s ease',
                        }} />
                    </div>

                    {/* NOW marker */}
                    <div style={{
                        position: 'absolute' as const,
                        left: 4, top: '50%', transform: 'translateY(-50%)',
                        fontSize: '0.55rem', fontWeight: 700,
                        color: MRTI_REGIME_CLR[currentRegime],
                        fontFamily: "'JetBrains Mono', monospace",
                        background: 'rgba(14, 17, 30, 0.8)',
                        padding: '2px 6px', borderRadius: 3,
                    }}>
                        NOW · {MRTI_REGIME_SHORT[currentRegime]}
                    </div>

                    {/* Predicted arrival marker */}
                    <div style={{
                        position: 'absolute' as const,
                        right: 4, top: '50%', transform: 'translateY(-50%)',
                        fontSize: '0.55rem', fontWeight: 700,
                        color: MRTI_REGIME_CLR[predictedNext],
                        fontFamily: "'JetBrains Mono', monospace",
                        background: 'rgba(14, 17, 30, 0.8)',
                        padding: '2px 6px', borderRadius: 3,
                    }}>
                        → {MRTI_REGIME_SHORT[predictedNext]} ({(predictedNextProb * 100).toFixed(0)}%)
                    </div>

                    {/* Early warning pulse points on timeline */}
                    {allSignals.filter(s => s.severity > 0.15).map((sig, i) => {
                        // Position proportional to severity (higher = closer to transition)
                        const leftPct = 15 + sig.severity * 70;
                        return (
                            <div
                                key={sig.key}
                                style={{
                                    position: 'absolute' as const,
                                    left: `${leftPct}%`,
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: sevColor(sig.severity),
                                    boxShadow: `0 0 6px ${sevColor(sig.severity)}60`,
                                    animation: sig.severity >= 0.5 ? 'pulse-glow 1.5s ease-in-out infinite' : 'none',
                                }}
                                title={`${signalLabel[sig.key]}: ${(sig.severity * 100).toFixed(0)}%`}
                            />
                        );
                    })}
                </div>

                {/* CIRPN Cross-Island Propagation Arrows */}
                {propagation && propagation.activeWarnings.length > 0 && (
                    <div style={{
                        marginTop: 8,
                        display: 'flex', flexWrap: 'wrap' as const, gap: 6,
                    }}>
                        {propagation.activeWarnings.slice(0, 3).map((w, i) => (
                            <div key={i} style={{
                                fontSize: '0.5rem',
                                padding: '3px 8px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'rgba(99, 102, 241, 0.08)',
                                border: '1px solid rgba(99, 102, 241, 0.2)',
                                color: '#a78bfa',
                                fontFamily: "'JetBrains Mono', monospace",
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                                <span style={{ color: '#6366f1' }}>⚡</span>
                                {w.sourcePair} → {w.targetPair}
                                <span style={{ opacity: 0.6 }}>~{Math.round(w.expectedArrivalMs / 60000)}m</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL: Stress Matrix Resilience Monitor (Phase 32)
// ═══════════════════════════════════════════════════════════════

const SCENARIO_CLR: Record<string, string> = {
    'Bull Trend': '#34d399',
    'Bear Crash': '#f43f5e',
    'Sideways': '#6366f1',
    'High Volatility': '#fbbf24',
    'Regime Transition': '#22d3ee',
};

const SCENARIO_ICON: Record<string, string> = {
    'Bull Trend': '📈',
    'Bear Crash': '📉',
    'Sideways': '↔️',
    'High Volatility': '⚡',
    'Regime Transition': '🔄',
};

const ASC_REGIME_LABEL: Record<string, string> = {
    TRENDING_UP: 'Trend ▲',
    TRENDING_DOWN: 'Trend ▼',
    RANGING: 'Ranging',
    HIGH_VOLATILITY: 'High Vol',
    LOW_VOLATILITY: 'Low Vol',
};

const ASC_REGIME_CLR: Record<string, string> = {
    TRENDING_UP: '#34d399',
    TRENDING_DOWN: '#f43f5e',
    RANGING: '#6366f1',
    HIGH_VOLATILITY: '#fbbf24',
    LOW_VOLATILITY: '#22d3ee',
};

function StressMatrixPanel({ stressData, stressLive }: {
    stressData: DemoStressData | null;
    stressLive: StressLiveSnapshot | null;
}) {
    // Dual-mode: prefer live data, fall back to demo
    const isLiveMode = stressLive !== null;
    const data = isLiveMode ? stressLive : stressData;
    if (!data) return null;

    const radarData = data.scenarios.map(s => ({
        scenario: s.name.replace(' ', '\n'),
        fitness: s.fitnessScore,
        fullMark: 100,
    }));

    // RRS gauge calculation
    const rrs = data.resilienceScore;
    const rrsColor = rrs >= 60 ? '#34d399' : rrs >= 35 ? '#fbbf24' : '#f43f5e';
    const rrsRadius = 55;
    const rrsCircumference = Math.PI * rrsRadius;
    const rrsOffset = rrsCircumference * (1 - rrs / 100);

    // Calibration weights
    const cal = data.calibration;
    const maxWeight = Math.max(...Object.values(cal.weights), 0.01);

    // STTA data (only from live)
    const stta = isLiveMode ? stressLive!.stta : null;
    const trend = stta?.resilienceTrend ?? null;
    const vulnMatrix = stta?.vulnerabilityMatrix ?? null;

    // Trend display helpers
    const trendArrow = trend?.direction === 'IMPROVING' ? '↑' :
        trend?.direction === 'DEGRADING' ? '↓' : '→';
    const trendColor = trend?.direction === 'IMPROVING' ? '#34d399' :
        trend?.direction === 'DEGRADING' ? '#f43f5e' : '#fbbf24';
    const trendLabel = trend?.direction === 'IMPROVING' ? `IMPROVING (+${Math.abs(trend.slopePerGeneration).toFixed(1)}/gen)` :
        trend?.direction === 'DEGRADING' ? `DEGRADING (${trend.slopePerGeneration.toFixed(1)}/gen)` :
            `STABLE (${(trend?.slopePerGeneration ?? 0).toFixed(1)}/gen)`;

    return (
        <section id="stress-matrix-panel" className="glass-card glass-card-accent accent-secondary col-12 stagger-in stagger-3">
            <div className="card-header">
                <div className="card-title">
                    <Shield size={18} style={{ color: '#8b5cf6' }} />
                    <span>MSSM — Market Scenario Stress Matrix</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isLiveMode && (
                        <span className="card-badge" style={{
                            background: 'rgba(244, 63, 94, 0.15)',
                            color: '#f43f5e',
                            border: '1px solid rgba(244, 63, 94, 0.4)',
                            fontWeight: 700,
                            fontSize: '0.55rem',
                            animation: 'pulse-glow 2s ease-in-out infinite',
                        }}>
                            🔴 LIVE
                        </span>
                    )}
                    <span className="card-badge badge-primary"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem' }}>
                        {data.scenarios.length} Scenarios
                    </span>
                    <span className="card-badge" style={{
                        background: `${rrsColor}15`,
                        color: rrsColor,
                        border: `1px solid ${rrsColor}40`,
                        fontWeight: 700,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '0.6rem',
                    }}>
                        RRS {rrs.toFixed(1)}
                    </span>
                </div>
            </div>
            <div className="card-body" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

                {/* ── Sub-Zone 1: Scenario Fitness Radar ────────── */}
                <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                        Scenario Fitness Profile
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                            <PolarGrid stroke="rgba(99, 115, 171, 0.1)" />
                            <PolarAngleAxis
                                dataKey="scenario"
                                tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
                            />
                            <RechartsRadar
                                dataKey="fitness"
                                stroke="#8b5cf6"
                                fill="#8b5cf6"
                                fillOpacity={0.18}
                                strokeWidth={2}
                                dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
                            />
                            <Tooltip
                                contentStyle={TOOLTIP_STYLE}
                                formatter={(value: string | number | undefined) => [
                                    `${Number(value ?? 0).toFixed(1)}/100`, 'Fitness'
                                ]}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>

                {/* ── Sub-Zone 2: RRS Gauge + Champion Stats ───── */}
                <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                        Regime Resilience Score
                    </div>

                    {/* SVG Gauge */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                        <svg viewBox="0 0 130 75" width="130" height="75">
                            {/* Background arc */}
                            <path
                                d="M 10 65 A 55 55 0 0 1 120 65"
                                fill="none"
                                stroke="rgba(99, 115, 171, 0.1)"
                                strokeWidth={8}
                                strokeLinecap="round"
                            />
                            {/* Filled arc */}
                            <path
                                d="M 10 65 A 55 55 0 0 1 120 65"
                                fill="none"
                                stroke={rrsColor}
                                strokeWidth={8}
                                strokeLinecap="round"
                                strokeDasharray={rrsCircumference}
                                strokeDashoffset={rrsOffset}
                                style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s ease' }}
                            />
                            {/* Center text */}
                            <text x="65" y="55" textAnchor="middle" fill={rrsColor}
                                fontSize="20" fontWeight="800" fontFamily="'JetBrains Mono', monospace">
                                {rrs.toFixed(0)}
                            </text>
                            <text x="65" y="68" textAnchor="middle" fill="rgba(148, 163, 184, 0.5)"
                                fontSize="7" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                                / 100
                            </text>
                        </svg>
                    </div>

                    {/* Champion Stats */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                            background: 'rgba(52, 211, 153, 0.06)',
                            border: '1px solid rgba(52, 211, 153, 0.15)',
                            fontSize: '0.6rem',
                        }}>
                            <span style={{ color: 'var(--text-muted)' }}>Strongest</span>
                            <span style={{ color: '#34d399', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                                {SCENARIO_ICON[data.strongest]} {data.strongest}
                            </span>
                        </div>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                            background: 'rgba(244, 63, 94, 0.06)',
                            border: '1px solid rgba(244, 63, 94, 0.15)',
                            fontSize: '0.6rem',
                        }}>
                            <span style={{ color: 'var(--text-muted)' }}>Weakest</span>
                            <span style={{ color: '#f43f5e', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                                {SCENARIO_ICON[data.weakest]} {data.weakest}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <div className="metric-card" style={{ flex: 1, padding: '6px 8px' }}>
                                <div className="metric-value" style={{ fontSize: '0.85rem', fontFamily: "'JetBrains Mono', monospace" }}>
                                    {data.avgFitness.toFixed(1)}
                                </div>
                                <div className="metric-label">Avg Fit</div>
                            </div>
                            <div className="metric-card" style={{ flex: 1, padding: '6px 8px' }}>
                                <div className="metric-value" style={{
                                    fontSize: '0.85rem', fontFamily: "'JetBrains Mono', monospace",
                                    color: data.scenarioVariance < 0.15 ? '#34d399' : '#fbbf24',
                                }}>
                                    {data.scenarioVariance.toFixed(3)}
                                </div>
                                <div className="metric-label">Variance</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Sub-Zone 3: Scenario Comparison Bars ──────── */}
                <div style={{ flex: '1 1 300px', minWidth: 260 }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                        Per-Scenario Breakdown
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {data.scenarios.map(s => {
                            const color = SCENARIO_CLR[s.name] ?? '#6366f1';
                            const barWidth = Math.max(2, Math.min(100, s.fitnessScore));
                            const returnColor = s.equityReturnPercent >= 0 ? '#34d399' : '#f43f5e';
                            return (
                                <div key={s.name}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', marginBottom: 3 }}>
                                        <span style={{ color: color, fontWeight: 600 }}>
                                            {SCENARIO_ICON[s.name]} {s.name}
                                        </span>
                                        <span style={{ display: 'flex', gap: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                {s.trades} trades
                                            </span>
                                            <span style={{ color: returnColor, fontWeight: 700 }}>
                                                {s.equityReturnPercent >= 0 ? '+' : ''}{s.equityReturnPercent.toFixed(1)}%
                                            </span>
                                        </span>
                                    </div>
                                    <div style={{
                                        height: 7, borderRadius: 4,
                                        background: 'rgba(99, 115, 171, 0.06)',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${barWidth}%`,
                                            borderRadius: 4,
                                            background: `linear-gradient(90deg, ${color}60, ${color})`,
                                            transition: 'width 0.6s ease',
                                            boxShadow: `0 0 8px ${color}25`,
                                        }} />
                                    </div>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        fontSize: '0.5rem', color: 'var(--text-muted)',
                                        marginTop: 2, fontFamily: "'JetBrains Mono', monospace",
                                    }}>
                                        <span>fit: {s.fitnessScore.toFixed(1)}</span>
                                        <span>conf: {(s.regimeConfidence * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── ASC Calibration Heatmap ────── */}
            <div style={{
                marginTop: 16, padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(14, 17, 30, 0.5)',
                border: '1px solid rgba(99, 115, 171, 0.08)',
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.55rem', color: 'var(--text-muted)',
                    fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.08em', marginBottom: 10,
                }}>
                    <span>🔬 Adaptive Stress Calibration</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none' }}>
                        <span style={{
                            padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                            background: `${ASC_REGIME_CLR[cal.currentRegime] ?? '#6366f1'}15`,
                            color: ASC_REGIME_CLR[cal.currentRegime] ?? '#6366f1',
                            fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                        }}>
                            {ASC_REGIME_LABEL[cal.currentRegime] ?? cal.currentRegime}
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                            {cal.totalCalibrations} calibrations
                        </span>
                    </div>
                </div>

                {/* Weight heatmap row */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {SCENARIO_KEYS.map((key, i) => {
                        const w = cal.weights[key] ?? 0;
                        const intensity = Math.min(1, w / maxWeight);
                        const color = SCENARIO_CLR[SCENARIO_NAMES[i]] ?? '#6366f1';
                        return (
                            <div
                                key={key}
                                style={{
                                    flex: 1, padding: '8px 4px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: `${color}${Math.round(intensity * 35 + 5).toString(16).padStart(2, '0')}`,
                                    border: `1px solid ${color}${Math.round(intensity * 50 + 10).toString(16).padStart(2, '0')}`,
                                    textAlign: 'center',
                                    transition: 'background 0.5s ease, border 0.5s ease',
                                }}
                                title={`${SCENARIO_NAMES[i]}: weight ${(w * 100).toFixed(1)}%`}
                            >
                                <div style={{
                                    fontSize: '0.5rem', color: color,
                                    fontWeight: 700, marginBottom: 3,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}>
                                    {SCENARIO_NAMES[i]}
                                </div>
                                <div style={{
                                    fontSize: '0.75rem', fontWeight: 800,
                                    color: `${color}`,
                                    fontFamily: "'JetBrains Mono', monospace",
                                }}>
                                    {(w * 100).toFixed(0)}%
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Calibrated vs Raw RRS comparison */}
                <div style={{
                    display: 'flex', gap: 12, alignItems: 'center',
                    fontSize: '0.6rem',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Raw RRS:</span>
                        <span style={{
                            fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                            color: rrsColor,
                        }}>
                            {rrs.toFixed(1)}
                        </span>
                    </div>
                    <span style={{ color: 'rgba(99, 115, 171, 0.3)' }}>→</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Calibrated CRRS:</span>
                        <span style={{
                            fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '0.75rem',
                            color: cal.calibratedRRS >= 60 ? '#34d399' : cal.calibratedRRS >= 35 ? '#fbbf24' : '#f43f5e',
                        }}>
                            {cal.calibratedRRS.toFixed(1)}
                        </span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Regime Conf:</span>
                        <div style={{
                            width: 40, height: 5, borderRadius: 3,
                            background: 'rgba(99, 115, 171, 0.08)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${cal.regimeConfidence * 100}%`,
                                borderRadius: 3,
                                background: cal.regimeConfidence >= 0.7 ? '#34d399' : '#fbbf24',
                                transition: 'width 0.5s ease',
                            }} />
                        </div>
                        <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 600,
                            color: cal.regimeConfidence >= 0.7 ? '#34d399' : '#fbbf24',
                        }}>
                            {(cal.regimeConfidence * 100).toFixed(0)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* ── RADICAL INNOVATION: STTA — Stress Trend Temporal Analysis ────── */}
            {stta && stta.trendData.length >= 3 && (
                <div style={{
                    marginTop: 16, padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(14, 17, 30, 0.5)',
                    border: '1px solid rgba(99, 115, 171, 0.08)',
                }}>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontSize: '0.55rem', color: 'var(--text-muted)',
                        fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.08em', marginBottom: 10,
                    }}>
                        <span>📈 Resilience Trend (STTA)</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none' }}>
                            <span style={{
                                padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                                background: `${trendColor}15`,
                                color: trendColor,
                                fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '0.65rem',
                            }}>
                                {trendArrow} {trendLabel}
                            </span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                                R² {trend?.rSquared?.toFixed(2) ?? '—'}
                            </span>
                        </div>
                    </div>

                    {/* STTA Sparkline: RRS over generations */}
                    <ResponsiveContainer width="100%" height={100}>
                        <AreaChart data={stta.trendData.map(p => ({
                            gen: `G${p.generation}`,
                            rrs: p.rrs,
                            crrs: p.crrs,
                        }))}>
                            <defs>
                                <linearGradient id="sttaGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={trendColor} stopOpacity={0.3} />
                                    <stop offset="100%" stopColor={trendColor} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="gen"
                                tick={{ fill: '#64748b', fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                domain={[0, 100]}
                                tick={{ fill: '#64748b', fontSize: 8, fontFamily: "'JetBrains Mono', monospace" }}
                                axisLine={false}
                                tickLine={false}
                                width={25}
                            />
                            <Tooltip
                                contentStyle={TOOLTIP_STYLE}
                                formatter={(value: string | number | undefined) => [
                                    `${Number(value ?? 0).toFixed(1)}`, 'Score'
                                ]}
                            />
                            <Area
                                type="monotone"
                                dataKey="rrs"
                                stroke={trendColor}
                                strokeWidth={2}
                                fill="url(#sttaGradient)"
                                dot={{ r: 2, fill: trendColor, strokeWidth: 0 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="crrs"
                                stroke="#8b5cf6"
                                strokeWidth={1.5}
                                strokeDasharray="4 2"
                                fill="none"
                                dot={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>

                    {/* Regime Vulnerability Heatmap */}
                    {vulnMatrix && vulnMatrix.generations.length >= 3 && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{
                                fontSize: '0.5rem', color: 'var(--text-muted)',
                                fontWeight: 600, textTransform: 'uppercase',
                                letterSpacing: '0.08em', marginBottom: 6,
                            }}>
                                🧬 Regime Vulnerability Heatmap
                                {vulnMatrix.weakestScenarioTrend && (
                                    <span style={{
                                        marginLeft: 8, color: '#f43f5e',
                                        fontWeight: 700, textTransform: 'none',
                                        fontFamily: "'JetBrains Mono', monospace",
                                    }}>
                                        ⚠ {vulnMatrix.weakestScenarioTrend.scenario} deteriorating ({vulnMatrix.weakestScenarioTrend.slope.toFixed(1)}/gen)
                                    </span>
                                )}
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: `80px repeat(${Math.min(vulnMatrix.generations.length, 20)}, 1fr)`,
                                gap: 2,
                            }}>
                                {/* Header row: generation numbers */}
                                <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)' }} />
                                {vulnMatrix.generations.slice(-20).map(gen => (
                                    <div key={`hdr-${gen}`} style={{
                                        fontSize: '0.4rem', color: 'var(--text-muted)',
                                        textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
                                    }}>
                                        G{gen}
                                    </div>
                                ))}

                                {/* Scenario rows */}
                                {vulnMatrix.scenarios.map((scenario, sIdx) => {
                                    const scenarioColor = SCENARIO_CLR[scenario] ?? '#6366f1';
                                    const scenarioTrend = vulnMatrix.scenarioTrends[scenario];
                                    const scenarioTrendArrow = scenarioTrend?.direction === 'IMPROVING' ? '↑' :
                                        scenarioTrend?.direction === 'DEGRADING' ? '↓' : '';
                                    const cellValues = vulnMatrix.cells[sIdx] ?? [];
                                    const maxFitInRow = Math.max(...cellValues, 1);

                                    return (
                                        <React.Fragment key={scenario}>
                                            {/* Row label */}
                                            <div style={{
                                                fontSize: '0.45rem', color: scenarioColor,
                                                fontWeight: 600, display: 'flex', alignItems: 'center',
                                                gap: 3, whiteSpace: 'nowrap', overflow: 'hidden',
                                                fontFamily: "'JetBrains Mono', monospace",
                                            }}>
                                                {SCENARIO_ICON[scenario]} {scenario}
                                                {scenarioTrendArrow && (
                                                    <span style={{
                                                        color: scenarioTrend?.direction === 'IMPROVING' ? '#34d399' : '#f43f5e',
                                                        fontWeight: 800,
                                                    }}>
                                                        {scenarioTrendArrow}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Fitness cells */}
                                            {cellValues.slice(-20).map((fitness, cIdx) => {
                                                const intensity = maxFitInRow > 0 ? fitness / maxFitInRow : 0;
                                                const cellColor = fitness >= 50 ? `rgba(52,211,153,${0.1 + intensity * 0.4})` :
                                                    fitness >= 25 ? `rgba(251,191,36,${0.1 + intensity * 0.3})` :
                                                        `rgba(244,63,94,${0.1 + intensity * 0.3})`;
                                                return (
                                                    <div
                                                        key={`cell-${sIdx}-${cIdx}`}
                                                        style={{
                                                            height: 18,
                                                            borderRadius: 2,
                                                            background: cellColor,
                                                            transition: 'background 0.3s ease',
                                                        }}
                                                        title={`${scenario} G${vulnMatrix.generations[vulnMatrix.generations.length - 20 + cIdx] ?? cIdx}: ${fitness.toFixed(1)}`}
                                                    />
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// PANEL 14: Testnet Mission Control (Phase 33)
// ═══════════════════════════════════════════════════════════════

type MissionPhase = 'IDLE' | 'PROBE' | 'SEED' | 'EVOLVE' | 'TRADE' | 'REPORT' | 'STOPPED' | 'ERROR';

interface ProbeCheckUI {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    latencyMs: number;
    details: string;
}

interface SessionStateUI {
    phase: MissionPhase;
    sessionId: string | null;
    startTime: number | null;
    elapsedMs: number;
    tradeCount: number;
    openPositions: number;
    cumulativePnl: number;
    lastError: string | null;
    report: {
        totalTrades: number;
        winningTrades: number;
        losingTrades: number;
        totalPnlPercent: number;
        maxDrawdownPercent: number;
        bestTradePnl: number;
        worstTradePnl: number;
        evolutionCycles: number;
        finalChampionFitness: number;
        durationMs: number;
        phases: { phase: string; durationMs: number }[];
    } | null;
    config: {
        maxLossPercent: number;
        maxDurationMinutes: number;
        maxPositions: number;
    } | null;
}

const MISSION_PHASES: { key: MissionPhase; label: string; icon: string }[] = [
    { key: 'PROBE', label: 'Probe', icon: '📡' },
    { key: 'SEED', label: 'Seed', icon: '🌱' },
    { key: 'EVOLVE', label: 'Evolve', icon: '🧬' },
    { key: 'TRADE', label: 'Trade', icon: '⚡' },
    { key: 'REPORT', label: 'Report', icon: '📊' },
];

const PHASE_COLORS: Record<string, string> = {
    PROBE: '#22d3ee',
    SEED: '#6366f1',
    EVOLVE: '#a855f7',
    TRADE: '#34d399',
    REPORT: '#fbbf24',
};

function TestnetMissionControlPanel() {
    // ─── Session Config ────────────────────────────────────
    const [configPairs, setConfigPairs] = useState('BTCUSDT');
    const [configTimeframe, setConfigTimeframe] = useState(Timeframe.H1);
    const [configCapital, setConfigCapital] = useState(1000);
    const [configDryRun, setConfigDryRun] = useState(false);
    const [configMaxDuration, setConfigMaxDuration] = useState(60);
    const [configMaxLoss, setConfigMaxLoss] = useState(-10);
    const [configMaxPositions, setConfigMaxPositions] = useState(3);

    // ─── State ─────────────────────────────────────────────
    const [probeResult, setProbeResult] = useState<{
        ready: boolean;
        isTestnet: boolean;
        checks: ProbeCheckUI[];
        account: {
            walletBalance: number;
            availableBalance: number;
            unrealizedPnl: number;
            openPositions: number;
        } | null;
        serverTimeDrift: number;
        totalLatencyMs: number;
        timestamp: number;
    } | null>(null);
    const [isProbing, setIsProbing] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [isStopping, setIsStopping] = useState(false);
    const [sessionState, setSessionState] = useState<SessionStateUI & {
        seedProgress: { completed: number; total: number } | null;
        trades: { slotId: string; direction: string; entryPrice: number; pnlPercent: number | null; status: string; entryTime: number }[];
    }>({
        phase: 'IDLE', sessionId: null, startTime: null, elapsedMs: 0,
        tradeCount: 0, openPositions: 0, cumulativePnl: 0,
        lastError: null, report: null, config: null,
        seedProgress: null, trades: [],
    });
    const [pnlHistory, setPnlHistory] = useState<number[]>([]);
    const [clientElapsed, setClientElapsed] = useState(0);
    const sessionStartRef = useRef<number | null>(null);
    const rafRef = useRef<number | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const tradeFeedRef = useRef<HTMLDivElement>(null);

    // ─── Helpers ───────────────────────────────────────────
    const isActive = sessionState.phase === 'TRADE' || sessionState.phase === 'EVOLVE' || sessionState.phase === 'SEED';
    const isIdle = sessionState.phase === 'IDLE' || sessionState.phase === 'STOPPED' || sessionState.phase === 'ERROR';

    const formatElapsed = (ms: number) => {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
        if (m > 0) return `${m}m ${s % 60}s`;
        return `${s}s`;
    };

    // ─── Polling ───────────────────────────────────────────
    const pollSession = useCallback(async () => {
        try {
            const res = await fetch('/api/trading/session', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            setSessionState(prev => ({ ...prev, ...data }));
            // Track session start time for client-side elapsed
            if (data.startTime && !sessionStartRef.current) {
                sessionStartRef.current = data.startTime;
            }
            if (data.cumulativePnl !== undefined) {
                setPnlHistory(prev => [...prev.slice(-49), data.cumulativePnl]);
            }
        } catch {
            // Silently handle — network errors during polling are non-critical
        }
    }, []);

    useEffect(() => {
        if (isActive && !pollRef.current) {
            pollRef.current = setInterval(pollSession, 3000);
        } else if (!isActive && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        return () => {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        };
    }, [isActive, pollSession]);

    // ─── Client-Side RAF Elapsed Timer ─────────────────────
    useEffect(() => {
        if (isActive && sessionStartRef.current) {
            const tick = () => {
                setClientElapsed(Date.now() - (sessionStartRef.current ?? Date.now()));
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        } else if (!isActive) {
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
            if (!isActive && sessionState.phase === 'IDLE') {
                sessionStartRef.current = null;
                setClientElapsed(0);
            }
        }
        return () => {
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        };
    }, [isActive, sessionState.phase]);

    // ─── Probe Action ─────────────────────────────────────
    const handleProbe = useCallback(async () => {
        setIsProbing(true);
        setProbeResult(null);
        try {
            const res = await fetch('/api/trading/testnet-probe', { cache: 'no-store' });
            if (!res.ok) throw new Error(`Probe failed: ${res.status}`);
            const data = await res.json();
            setProbeResult(data);
        } catch (error) {
            setProbeResult({
                ready: false,
                isTestnet: false,
                checks: [{ name: 'network', status: 'fail', latencyMs: 0, details: error instanceof Error ? error.message : 'Unknown error' }],
                account: null,
                serverTimeDrift: 0,
                totalLatencyMs: 0,
                timestamp: Date.now(),
            });
        } finally {
            setIsProbing(false);
        }
    }, []);

    // ─── Start Session ────────────────────────────────────
    const handleStart = useCallback(async () => {
        setIsStarting(true);
        setPnlHistory([]);
        try {
            const res = await fetch('/api/trading/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pairs: configPairs.split(',').map(p => p.trim()).filter(Boolean),
                    timeframe: configTimeframe,
                    capitalPerSlot: configCapital,
                    dryRun: configDryRun,
                    maxDurationMinutes: configMaxDuration,
                    maxLossPercent: configMaxLoss,
                    maxPositions: configMaxPositions,
                }),
            });
            if (!res.ok) throw new Error(`Start failed: ${res.status}`);
            const data = await res.json();
            if (data.state) setSessionState(data.state);
        } catch (error) {
            setSessionState(prev => ({
                ...prev,
                phase: 'ERROR',
                lastError: error instanceof Error ? error.message : 'Start failed',
            }));
        } finally {
            setIsStarting(false);
        }
    }, [configPairs, configTimeframe, configCapital, configDryRun, configMaxDuration, configMaxLoss, configMaxPositions]);

    // ─── Stop Session ─────────────────────────────────────
    const handleStop = useCallback(async () => {
        setIsStopping(true);
        try {
            const res = await fetch('/api/trading/session', { method: 'DELETE' });
            if (!res.ok) throw new Error(`Stop failed: ${res.status}`);
            const data = await res.json();
            // Refresh session state to get final report
            if (data.report) {
                setSessionState(prev => ({
                    ...prev,
                    phase: 'STOPPED',
                    report: data.report,
                }));
            } else {
                await pollSession();
            }
        } catch (error) {
            setSessionState(prev => ({
                ...prev,
                lastError: error instanceof Error ? error.message : 'Stop failed',
            }));
        } finally {
            setIsStopping(false);
        }
    }, [pollSession]);

    // ─── Phase State Helpers ──────────────────────────────
    const getPhaseNodeClass = (phaseKey: MissionPhase) => {
        const phaseOrder: MissionPhase[] = ['PROBE', 'SEED', 'EVOLVE', 'TRADE', 'REPORT'];
        const currentIdx = phaseOrder.indexOf(sessionState.phase);
        const thisIdx = phaseOrder.indexOf(phaseKey);
        if (sessionState.phase === 'ERROR') return thisIdx <= currentIdx ? 'error' : '';
        if (thisIdx < currentIdx) return 'completed';
        if (thisIdx === currentIdx) return 'active';
        return '';
    };

    const getConnectorClass = (idx: number) => {
        const phaseOrder: MissionPhase[] = ['PROBE', 'SEED', 'EVOLVE', 'TRADE', 'REPORT'];
        const currentIdx = phaseOrder.indexOf(sessionState.phase);
        if (idx < currentIdx) return 'filled';
        if (idx === currentIdx) return 'filling';
        return '';
    };

    // ─── Safety Interlock Calculation ─────────────────────
    const getLossUtilization = () => {
        if (!sessionState.config) return 0;
        const maxLoss = Math.abs(sessionState.config.maxLossPercent);
        return maxLoss > 0 ? Math.abs(sessionState.cumulativePnl) / maxLoss : 0;
    };

    const getDurationUtilization = () => {
        if (!sessionState.config || sessionState.config.maxDurationMinutes <= 0) return 0;
        const maxMs = sessionState.config.maxDurationMinutes * 60 * 1000;
        return sessionState.elapsedMs / maxMs;
    };

    const getPositionUtilization = () => {
        if (!sessionState.config || sessionState.config.maxPositions <= 0) return 0;
        return sessionState.openPositions / sessionState.config.maxPositions;
    };

    const getInterlockLevel = (util: number) => {
        if (util >= 0.8) return 'danger';
        if (util >= 0.5) return 'warning';
        return 'safe';
    };

    // ─── PnL Sparkline SVG ────────────────────────────────
    const sparklinePath = useMemo(() => {
        if (pnlHistory.length < 2) return '';
        const w = 300;
        const h = 40;
        const max = Math.max(...pnlHistory.map(Math.abs), 0.01);
        const mid = h / 2;
        return pnlHistory.map((val, i) => {
            const x = (i / (pnlHistory.length - 1)) * w;
            const y = mid - (val / max) * (mid - 2);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
    }, [pnlHistory]);

    // ─── Phase Badge ──────────────────────────────────────
    const phaseBadge = () => {
        const p = sessionState.phase;
        if (p === 'IDLE') return <span className="card-badge badge-info">IDLE</span>;
        if (p === 'STOPPED') return <span className="card-badge badge-info">STOPPED</span>;
        if (p === 'ERROR') return <span className="card-badge badge-danger">ERROR</span>;
        if (p === 'TRADE') return <span className="card-badge badge-success" style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}>TRADING</span>;
        return <span className="card-badge badge-primary">{p}</span>;
    };

    return (
        <section id="testnet-mission-control" className="glass-card glass-card-accent accent-neural col-12 stagger-in stagger-8">
            <div className="card-header">
                <div className="card-title">
                    <Crosshair size={18} style={{ color: '#22d3ee' }} />
                    <span>Testnet Mission Control</span>
                </div>
                {phaseBadge()}
            </div>
            <div className="card-body">

                {/* ─── 5-Phase Progress Track ──────────────────── */}
                <div className="mission-phase-track">
                    {MISSION_PHASES.map((mp, idx) => (
                        <React.Fragment key={mp.key}>
                            {idx > 0 && (
                                <div className={`mission-phase-connector ${getConnectorClass(idx - 1)}`} />
                            )}
                            <div className={`mission-phase-node ${getPhaseNodeClass(mp.key)}`}>
                                <div className="mission-phase-circle">{mp.icon}</div>
                                <div className="mission-phase-label">{mp.label}</div>
                            </div>
                        </React.Fragment>
                    ))}
                </div>

                {/* ─── Session Config (only when idle) ─────────── */}
                {isIdle && (
                    <div className="mission-config-grid">
                        <div className="mission-config-field">
                            <label className="mission-config-label">Pairs</label>
                            <input
                                className="mission-config-input"
                                type="text"
                                value={configPairs}
                                onChange={e => setConfigPairs(e.target.value)}
                                placeholder="BTCUSDT,ETHUSDT"
                            />
                        </div>
                        <div className="mission-config-field">
                            <label className="mission-config-label">Timeframe</label>
                            <select
                                className="mission-config-input"
                                value={configTimeframe}
                                onChange={e => setConfigTimeframe(e.target.value as Timeframe)}
                            >
                                <option value={Timeframe.M15}>15m</option>
                                <option value={Timeframe.H1}>1h</option>
                                <option value={Timeframe.H4}>4h</option>
                            </select>
                        </div>
                        <div className="mission-config-field">
                            <label className="mission-config-label">Capital / Slot</label>
                            <input
                                className="mission-config-input"
                                type="number"
                                value={configCapital}
                                onChange={e => setConfigCapital(Number(e.target.value))}
                                min={10}
                                step={100}
                            />
                        </div>
                        <div className="mission-config-field">
                            <label className="mission-config-label">Max Duration (min)</label>
                            <input
                                className="mission-config-input"
                                type="number"
                                value={configMaxDuration}
                                onChange={e => setConfigMaxDuration(Number(e.target.value))}
                                min={0}
                                step={5}
                            />
                        </div>
                        <div className="mission-config-field">
                            <label className="mission-config-label">Max Loss %</label>
                            <input
                                className="mission-config-input"
                                type="number"
                                value={configMaxLoss}
                                onChange={e => setConfigMaxLoss(Number(e.target.value))}
                                max={0}
                                step={1}
                            />
                        </div>
                        <div className="mission-config-field">
                            <label className="mission-config-label">Max Positions</label>
                            <input
                                className="mission-config-input"
                                type="number"
                                value={configMaxPositions}
                                onChange={e => setConfigMaxPositions(Number(e.target.value))}
                                min={1}
                                max={10}
                            />
                        </div>
                        <div className="mission-config-field">
                            <label className="mission-config-label">Dry Run</label>
                            <button
                                className="mission-config-input"
                                onClick={() => setConfigDryRun(prev => !prev)}
                                style={{
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    color: configDryRun ? '#fbbf24' : '#34d399',
                                }}
                            >
                                {configDryRun ? '⚠ DRY RUN' : '🔥 LIVE'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Active Config Echo (during active session) ── */}
                {!isIdle && sessionState.config && (
                    <div style={{
                        display: 'flex', gap: 10, padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                        background: 'rgba(99, 115, 171, 0.04)', border: '1px solid rgba(99, 115, 171, 0.1)',
                        marginBottom: 12, fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center',
                    }}>
                        <span>🔒</span>
                        <span>Pairs: <b style={{ color: 'var(--text-primary)' }}>{configPairs}</b></span>
                        <span>TF: <b style={{ color: 'var(--text-primary)' }}>{configTimeframe}</b></span>
                        <span>Capital: <b style={{ color: 'var(--text-primary)' }}>${configCapital}</b></span>
                        <span>Max Loss: <b style={{ color: '#f43f5e' }}>{sessionState.config.maxLossPercent}%</b></span>
                        <span>Max Pos: <b style={{ color: 'var(--text-primary)' }}>{sessionState.config.maxPositions}</b></span>
                        <span>Duration: <b style={{ color: 'var(--text-primary)' }}>{sessionState.config.maxDurationMinutes}m</b></span>
                    </div>
                )}

                {/* ─── Seed Progress Bar (during SEED phase) ─────── */}
                {sessionState.phase === 'SEED' && sessionState.seedProgress && (
                    <div style={{ marginBottom: 12 }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 4,
                        }}>
                            <span>🌱 Seeding historical data...</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#6366f1' }}>
                                {sessionState.seedProgress.completed}/{sessionState.seedProgress.total} candles
                            </span>
                        </div>
                        <div style={{
                            height: 6, borderRadius: 3, background: 'rgba(99, 102, 241, 0.1)',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                height: '100%', borderRadius: 3,
                                background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                                width: `${Math.min(100, (sessionState.seedProgress.completed / Math.max(1, sessionState.seedProgress.total)) * 100)}%`,
                                transition: 'width 0.5s ease',
                                boxShadow: '0 0 8px rgba(99, 102, 241, 0.3)',
                            }} />
                        </div>
                    </div>
                )}

                {/* ─── Probe Results (Enhanced) ────────────────── */}
                {probeResult && (
                    <div style={{ marginBottom: 14 }}>
                        {/* Probe Header with testnet badge + drift */}
                        <div style={{
                            fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <Radio size={12} style={{ color: probeResult.ready ? '#34d399' : '#f43f5e' }} />
                            Probe — {probeResult.checks.filter(c => c.status === 'pass').length}/{probeResult.checks.length} passed
                            {/* Testnet Safety Badge */}
                            <span style={{
                                padding: '1px 6px', borderRadius: 4, fontSize: '0.5rem', fontWeight: 700,
                                background: probeResult.isTestnet ? 'rgba(52, 211, 153, 0.12)' : 'rgba(244, 63, 94, 0.15)',
                                color: probeResult.isTestnet ? '#34d399' : '#f43f5e',
                                border: `1px solid ${probeResult.isTestnet ? 'rgba(52, 211, 153, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                            }}>
                                {probeResult.isTestnet ? '🟢 TESTNET' : '🔴 MAINNET'}
                            </span>
                            {/* Server Time Drift */}
                            <span style={{
                                padding: '1px 6px', borderRadius: 4, fontSize: '0.5rem', fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                background: Math.abs(probeResult.serverTimeDrift) < 1000 ? 'rgba(52, 211, 153, 0.08)' : 'rgba(251, 191, 36, 0.1)',
                                color: Math.abs(probeResult.serverTimeDrift) < 1000 ? '#34d399' : '#fbbf24',
                            }}>
                                Δ{probeResult.serverTimeDrift}ms
                            </span>
                            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>
                                {probeResult.totalLatencyMs}ms
                            </span>
                        </div>
                        {probeResult.checks.map(check => (
                            <div className="mission-probe-check" key={check.name}>
                                <span className="mission-probe-icon">
                                    {check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌'}
                                </span>
                                <span className="mission-probe-name">{check.name}</span>
                                <span className="mission-probe-detail">{check.details}</span>
                                <span className="mission-probe-latency">{check.latencyMs}ms</span>
                            </div>
                        ))}
                        {/* Full Account Panel (Enhanced) */}
                        {probeResult.account && (
                            <div style={{
                                marginTop: 6, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                background: 'rgba(52, 211, 153, 0.06)', border: '1px solid rgba(52, 211, 153, 0.15)',
                                fontSize: '0.65rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
                                fontFamily: 'var(--font-mono)',
                            }}>
                                <div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.5rem', marginBottom: 2 }}>WALLET</div>
                                    <div style={{ color: '#34d399', fontWeight: 700 }}>${probeResult.account.walletBalance.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.5rem', marginBottom: 2 }}>AVAILABLE</div>
                                    <div style={{ color: '#34d399', fontWeight: 700 }}>${probeResult.account.availableBalance.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.5rem', marginBottom: 2 }}>UNREALIZED</div>
                                    <div style={{ color: probeResult.account.unrealizedPnl >= 0 ? '#34d399' : '#f43f5e', fontWeight: 700 }}>
                                        {probeResult.account.unrealizedPnl >= 0 ? '+' : ''}{probeResult.account.unrealizedPnl.toFixed(2)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.5rem', marginBottom: 2 }}>POSITIONS</div>
                                    <div style={{ color: probeResult.account.openPositions > 0 ? '#fbbf24' : '#34d399', fontWeight: 700 }}>
                                        {probeResult.account.openPositions}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ─── Live Telemetry (during active session) ──── */}
                {!isIdle && (
                    <div className="mission-telemetry-grid">
                        <div className="mission-telemetry-cell">
                            <span className="mission-telemetry-label">Elapsed</span>
                            <span className="mission-telemetry-value">{formatElapsed(clientElapsed || sessionState.elapsedMs)}</span>
                        </div>
                        <div className="mission-telemetry-cell">
                            <span className="mission-telemetry-label">Trades</span>
                            <span className="mission-telemetry-value">{sessionState.tradeCount}</span>
                        </div>
                        <div className="mission-telemetry-cell">
                            <span className="mission-telemetry-label">Open</span>
                            <span className="mission-telemetry-value">{sessionState.openPositions}</span>
                        </div>
                        <div className="mission-telemetry-cell" style={{ gridColumn: 'span 3' }}>
                            <span className="mission-telemetry-label">Cumulative PnL</span>
                            <span className={`mission-telemetry-value ${sessionState.cumulativePnl >= 0 ? 'positive' : 'negative'}`}>
                                {sessionState.cumulativePnl >= 0 ? '+' : ''}{sessionState.cumulativePnl.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                )}

                {/* ─── Error Display ───────────────────────────── */}
                {sessionState.lastError && (
                    <div style={{
                        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                        background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)',
                        fontSize: '0.7rem', color: '#f43f5e', marginBottom: 10,
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <XCircle size={14} /> {sessionState.lastError}
                    </div>
                )}

                {/* ─── Session Report (after stop) ─────────────── */}
                {sessionState.report && sessionState.phase === 'STOPPED' && (
                    <div style={{
                        padding: '14px 16px', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                        marginBottom: 14,
                    }}>
                        <div style={{
                            fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
                        }}>📊 Session Report</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: '0.7rem' }}>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', marginBottom: 2 }}>TOTAL PnL</div>
                                <div style={{
                                    fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem',
                                    color: sessionState.report.totalPnlPercent >= 0 ? '#34d399' : '#f43f5e',
                                }}>
                                    {sessionState.report.totalPnlPercent >= 0 ? '+' : ''}{sessionState.report.totalPnlPercent.toFixed(2)}%
                                </div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', marginBottom: 2 }}>WIN / LOSS</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                                    <span style={{ color: '#34d399' }}>{sessionState.report.winningTrades}</span>
                                    {' / '}
                                    <span style={{ color: '#f43f5e' }}>{sessionState.report.losingTrades}</span>
                                </div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', marginBottom: 2 }}>MAX DD</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f43f5e' }}>
                                    {sessionState.report.maxDrawdownPercent.toFixed(2)}%
                                </div>
                            </div>
                            <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', marginBottom: 2 }}>CHAMPION</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#818cf8' }}>
                                    {sessionState.report.finalChampionFitness.toFixed(1)}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                            <span>Duration: <b style={{ color: 'var(--text-primary)' }}>{formatElapsed(sessionState.report.durationMs)}</b></span>
                            <span>Evo Cycles: <b style={{ color: 'var(--text-primary)' }}>{sessionState.report.evolutionCycles}</b></span>
                            <span>Best Trade: <b style={{ color: '#34d399' }}>+{sessionState.report.bestTradePnl.toFixed(2)}%</b></span>
                            <span>Worst Trade: <b style={{ color: '#f43f5e' }}>{sessionState.report.worstTradePnl.toFixed(2)}%</b></span>
                        </div>
                    </div>
                )}

                {/* ─── Live Trade Log Feed ──────────────────────── */}
                {sessionState.trades && sessionState.trades.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                        <div style={{
                            fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
                        }}>⚡ Trade Log ({sessionState.trades.length})</div>
                        <div
                            ref={tradeFeedRef}
                            className="mission-trade-feed"
                            style={{
                                maxHeight: 120, overflowY: 'auto', borderRadius: 'var(--radius-sm)',
                                background: 'rgba(6, 10, 20, 0.4)', border: '1px solid var(--glass-border)',
                                padding: '4px 0',
                            }}
                        >
                            {sessionState.trades.map((t, i) => (
                                <div
                                    key={`${t.slotId}-${t.entryTime}-${i}`}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '4px 10px', fontSize: '0.6rem',
                                        fontFamily: 'var(--font-mono)',
                                        borderBottom: '1px solid rgba(99, 115, 171, 0.05)',
                                    }}
                                >
                                    <span style={{
                                        fontWeight: 800, fontSize: '0.7rem',
                                        color: t.direction === 'LONG' ? '#34d399' : '#f43f5e',
                                    }}>
                                        {t.direction === 'LONG' ? '▲' : '▼'}
                                    </span>
                                    <span style={{ color: 'var(--text-secondary)', minWidth: 50 }}>
                                        {new Date(t.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                        ${t.entryPrice.toFixed(2)}
                                    </span>
                                    <span style={{
                                        marginLeft: 'auto',
                                        fontWeight: 700,
                                        color: t.pnlPercent === null ? 'var(--text-muted)'
                                            : t.pnlPercent >= 0 ? '#34d399' : '#f43f5e',
                                    }}>
                                        {t.pnlPercent !== null
                                            ? `${t.pnlPercent >= 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}%`
                                            : '—'}
                                    </span>
                                    <span style={{
                                        fontSize: '0.5rem', padding: '1px 4px', borderRadius: 3,
                                        background: t.status === 'OPEN' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(99, 115, 171, 0.08)',
                                        color: t.status === 'OPEN' ? '#34d399' : 'var(--text-muted)',
                                    }}>
                                        {t.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── RADICAL INNOVATION: Session Replay Timeline ─── */}
                {sessionState.report && sessionState.report.phases && sessionState.report.phases.length > 0 && (
                    <div className="mission-timeline-section">
                        <div style={{
                            fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
                        }}>Phase Timeline</div>
                        <div className="mission-timeline-bars">
                            {sessionState.report.phases.map((p, i) => {
                                const totalMs = sessionState.report!.phases.reduce((s, ph) => s + ph.durationMs, 0);
                                const pct = totalMs > 0 ? (p.durationMs / totalMs) * 100 : 0;
                                return (
                                    <div
                                        key={`${p.phase}-${i}`}
                                        className="mission-timeline-bar"
                                        data-label={pct > 15 ? p.phase : ''}
                                        style={{
                                            flexGrow: Math.max(1, pct),
                                            background: PHASE_COLORS[p.phase] ?? '#6366f1',
                                            opacity: 0.7,
                                        }}
                                        title={`${p.phase}: ${formatElapsed(p.durationMs)}`}
                                    />
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {sessionState.report.phases.map((p, i) => (
                                <div key={`${p.phase}-legend-${i}`} style={{
                                    display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.55rem',
                                }}>
                                    <div style={{
                                        width: 8, height: 8, borderRadius: 2,
                                        background: PHASE_COLORS[p.phase] ?? '#6366f1',
                                    }} />
                                    <span style={{ color: 'var(--text-muted)' }}>{p.phase}</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        {formatElapsed(p.durationMs)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── PnL Sparkline ───────────────────────────── */}
                {pnlHistory.length >= 2 && (
                    <div className="mission-pnl-spark">
                        <svg viewBox="0 0 300 40" preserveAspectRatio="none">
                            <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(99,115,171,0.1)" strokeWidth="0.5" />
                            <path
                                d={sparklinePath}
                                fill="none"
                                stroke={pnlHistory[pnlHistory.length - 1] >= 0 ? '#34d399' : '#f43f5e'}
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                )}

                {/* ─── Safety Interlocks (during TRADE phase) ───── */}
                {(sessionState.phase === 'TRADE' || sessionState.phase === 'EVOLVE') && sessionState.config && (
                    <div className="mission-interlocks">
                        <div className="mission-interlock">
                            <div className={`mission-interlock-dot ${getInterlockLevel(getLossUtilization())}`} />
                            <span className="mission-interlock-label">Max Loss</span>
                            <span className="mission-interlock-value">
                                {(getLossUtilization() * 100).toFixed(0)}%
                            </span>
                        </div>
                        <div className="mission-interlock">
                            <div className={`mission-interlock-dot ${getInterlockLevel(getDurationUtilization())}`} />
                            <span className="mission-interlock-label">Duration</span>
                            <span className="mission-interlock-value">
                                {(getDurationUtilization() * 100).toFixed(0)}%
                            </span>
                        </div>
                        <div className="mission-interlock">
                            <div className={`mission-interlock-dot ${getInterlockLevel(getPositionUtilization())}`} />
                            <span className="mission-interlock-label">Positions</span>
                            <span className="mission-interlock-value">
                                {sessionState.openPositions}/{sessionState.config.maxPositions}
                            </span>
                        </div>
                    </div>
                )}

                {/* ─── Control Buttons ─────────────────────────── */}
                <div className="mission-controls">
                    <button
                        className="mission-btn probe"
                        onClick={handleProbe}
                        disabled={isProbing || isActive}
                    >
                        <Radio size={14} />
                        {isProbing ? 'Probing...' : 'Run Probe'}
                    </button>
                    <button
                        className="mission-btn start"
                        onClick={handleStart}
                        disabled={isStarting || isActive}
                    >
                        <Zap size={14} />
                        {isStarting ? 'Starting...' : 'Start Session'}
                    </button>
                    <button
                        className="mission-btn stop"
                        onClick={handleStop}
                        disabled={isStopping || !isActive}
                    >
                        <Shield size={14} />
                        {isStopping ? 'Stopping...' : 'Stop Session'}
                    </button>
                </div>
            </div>
        </section>
    );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PIPELINE PAGE
// ═══════════════════════════════════════════════════════════════

export default function PipelinePage() {
    // Live data hook — returns null when Cortex is not initialized
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const liveData = usePipelineLiveData(selectedSlotId);
    const isLive = liveData?.isLive ?? false;

    // Demo mode fallback (auto-cycling state machine)
    const demoStateMachine = usePipelineStateMachine();

    // Determine active data source
    const activeStages = isLive ? liveData!.stages : demoStateMachine.stages;
    const activeGates = isLive ? liveData!.gates : demoStateMachine.gates;
    const activeGateIdx = isLive ? liveData!.gateIdx : demoStateMachine.gateIdx;
    const activeTradeProgress = isLive ? liveData!.tradeProgress : demoStateMachine.tradeProgress;
    const activeStrategyName = isLive ? liveData!.currentStrategyName : demoStateMachine.currentStrategyName;

    // Generate demo data once (for panels without live equivalents yet)
    const [demoData, setDemoData] = useState<{
        generations: GenerationData[];
        roster: RosterEntry[];
        replayCells: ReplayCell[];
        lineageNodes: LineageNode[];
        survivalRows: SurvivalRow[];
        decisions: DecisionEvent[];
        overmind: ReturnType<typeof generateDemoOvermindData>;
        stressData: DemoStressData;
    } | null>(null);

    useEffect(() => {
        setDemoData({
            generations: generateDemoGenerations(14),
            roster: generateDemoRoster(),
            replayCells: generateDemoReplayHeatmap(),
            lineageNodes: generateDemoLineage(),
            survivalRows: generateDemoSurvival(),
            decisions: generateDemoDecisions(),
            overmind: generateDemoOvermindData(),
            stressData: generateDemoStressData(),
        });
    }, []);

    // Derive panel data: live when available, demo fallback
    const generations = isLive ? liveData!.generations : (demoData?.generations ?? []);
    const roster = isLive
        ? liveData!.roster as RosterEntry[]
        : (demoData?.roster ?? []);
    const replayCells = isLive ? liveData!.replayCells : (demoData?.replayCells ?? []);

    if (!demoData && !isLive) {
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
                    {/* Island Selector + Live/Demo Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
                        <span className={`card-badge ${isLive ? 'badge-success' : 'badge-info'}`}
                            style={{ fontSize: '0.6rem', padding: '2px 8px' }}>
                            {isLive ? '● LIVE' : '◯ DEMO'}
                        </span>
                        {liveData && liveData.availableIslands.length > 0 && (
                            <select
                                value={selectedSlotId ?? liveData.availableIslands[0]?.slotId ?? ''}
                                onChange={(e) => setSelectedSlotId(e.target.value)}
                                style={{
                                    background: 'rgba(14, 17, 30, 0.8)',
                                    border: '1px solid rgba(99, 115, 171, 0.2)',
                                    borderRadius: 6,
                                    color: 'var(--text-primary)',
                                    fontSize: '0.7rem',
                                    padding: '4px 10px',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    cursor: 'pointer',
                                    outline: 'none',
                                }}
                            >
                                {liveData.availableIslands.map(island => (
                                    <option key={island.slotId} value={island.slotId}>
                                        {island.pair} · {island.timeframe}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                    <nav className="nav-tabs">
                        <Link href="/" className="nav-tab">
                            <Activity size={14} /> Dashboard
                        </Link>
                        <Link href="/pipeline" className="nav-tab active">
                            <GitBranch size={14} /> Pipeline
                        </Link>
                        <Link href="/command" className="nav-tab">
                            <Shield size={14} /> Komuta
                        </Link>
                    </nav>
                </div>
            </header>

            {/* ─── Pipeline Grid ──────────────────────────────────── */}
            <main className="dashboard-grid">
                {/* Row 1: Pipeline Flow */}
                <PipelineFlowPanel
                    stages={activeStages}
                    tradeProgress={activeTradeProgress}
                    currentStrategyName={activeStrategyName}
                />

                {/* Row 1.5: Live Pulse Telemetry (only in LIVE mode — radical innovation) */}
                {isLive && liveData && (
                    <LivePulseTelemetryPanel
                        telemetry={liveData.telemetry}
                        propagation={liveData.propagation}
                    />
                )}

                {/* Row 1.75: Evolution Heartbeat Monitor (radical innovation) */}
                {isLive && liveData && liveData.genomeHealth && (
                    <EvolutionHeartbeatPanel health={liveData.genomeHealth} />
                )}

                {/* Row 1.85: MRTI Regime Transition Intelligence (Phase 21) */}
                <MRTIForecastPanel
                    mrtiSnapshot={isLive && liveData ? liveData.mrtiSnapshot : null}
                    propagation={isLive && liveData ? liveData.propagation : null}
                />

                {/* Row 1.9: Stress Matrix Resilience Monitor (Phase 32 + Phase 35 Live) */}
                {(demoData || (isLive && liveData?.stressLive)) && (
                    <StressMatrixPanel
                        stressData={demoData?.stressData ?? null}
                        stressLive={isLive && liveData ? liveData.stressLive : null}
                    />
                )}

                {/* Row 1.95: Testnet Trading Session (Phase 40) */}
                <TestnetSessionPanel />
                <LiveTradeJournalPanel />

                {/* Row 2: Fitness + Validation */}
                <GenerationFitnessPanel generations={generations} />
                <ValidationGatePanel
                    gates={activeGates}
                    gateIdx={activeGateIdx}
                    currentStrategyName={activeStrategyName}
                />

                {/* Row 3: Roster + Replay */}
                <StrategyRosterPanel roster={roster} />
                <ExperienceReplayPanel cells={replayCells} />

                {/* Row 4: Strategy Archaeology — Gene Lineage (Full Width) */}
                <GeneLineagePanel nodes={demoData?.lineageNodes ?? []} />

                {/* Row 5: Gene Survival Heatmap + Decision Explainer */}
                <GeneSurvivalPanel rows={demoData?.survivalRows ?? []} />
                <DecisionExplainerPanel decisions={demoData?.decisions ?? []} />

                {/* Row 6: Strategic Overmind Intelligence Hub (Phase 15 + CCR) */}
                <OvermindIntelligenceHub
                    hypotheses={demoData?.overmind.hypotheses ?? []}
                    episodes={demoData?.overmind.episodes ?? []}
                    insights={demoData?.overmind.insights ?? []}
                    counterfactualData={demoData?.overmind.counterfactualData ?? []}
                    overmindLive={isLive && liveData ? liveData.overmindLive : null}
                />

                {/* Row 7: Risk Shield — GLOBAL Safety Rail Monitor */}
                <RiskShieldPanel
                    riskLive={isLive && liveData ? liveData.riskLive : null}
                />

                {/* Row 8: Testnet Mission Control — Session Lifecycle (Phase 33) */}
                <TestnetMissionControlPanel />
            </main>
        </>
    );
}

