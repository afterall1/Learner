'use client';

// ============================================================
// Learner: Ignition Sequence Panel — System Bootstrap UI
// ============================================================
// Phase 36.1 + 38 — Boot Telemetry Timeline + Resilience Sentinel
//
// Displays a 7-phase boot sequence with real-time progress:
//   Phase 0: ENV_CHECK       → Shield icon
//   Phase 1: PERSISTENCE     → Database icon
//   Phase 2: CORTEX_SPAWN    → Brain icon
//   Phase 3: HISTORICAL_SEED → BarChart3 icon
//   Phase 4: WS_CONNECT      → Wifi icon
//   Phase 5: EVOLUTION_START  → Zap icon
//   Phase 6: READY           → CheckCircle2 icon
//
// Before boot: Shows "IGNITE SYSTEM" button
// During boot: Shows animated phase progression + live elapsed timer
// After boot: Shows compact status bar + expandable Boot Telemetry Report
//   - Phase Waterfall Chart (horizontal duration bars)
//   - Per-Phase Result Badges
//   - Boot History (last 5 boots)
// ============================================================

import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
    Shield, Database, Brain, BarChart3, Wifi, Zap,
    CheckCircle2, Rocket, AlertCircle, Power,
    Loader2, Clock, ChevronDown, ChevronUp, Activity,
    Search, HeartPulse, ShieldAlert, RefreshCw,
} from 'lucide-react';
import { useBootStore } from '@/lib/store';
import { BootPhase, Timeframe } from '@/types';
import type { BootConfig } from '@/types';

// ─── Phase Configuration ─────────────────────────────────────

interface PhaseDisplayConfig {
    icon: React.ReactNode;
    label: string;
    description: string;
    phase: BootPhase;
}

const PHASE_CONFIGS: PhaseDisplayConfig[] = [
    {
        icon: <Shield size={16} />,
        label: 'Environment',
        description: 'Validating API keys & config',
        phase: BootPhase.ENV_CHECK,
    },
    {
        icon: <Database size={16} />,
        label: 'Persistence',
        description: 'Loading last session checkpoint',
        phase: BootPhase.PERSISTENCE,
    },
    {
        icon: <Brain size={16} />,
        label: 'Cortex',
        description: 'Spawning Islands with HyperDNA',
        phase: BootPhase.CORTEX_SPAWN,
    },
    {
        icon: <BarChart3 size={16} />,
        label: 'Historical Data',
        description: 'Seeding 500 candles per slot',
        phase: BootPhase.HISTORICAL_SEED,
    },
    {
        icon: <Wifi size={16} />,
        label: 'WebSocket',
        description: 'Connecting to Binance streams',
        phase: BootPhase.WS_CONNECT,
    },
    {
        icon: <Zap size={16} />,
        label: 'Evolution',
        description: 'Starting evolution engine',
        phase: BootPhase.EVOLUTION_START,
    },
    {
        icon: <CheckCircle2 size={16} />,
        label: 'Ready',
        description: 'System fully operational',
        phase: BootPhase.READY,
    },
];

// ─── Phase Status Helpers ────────────────────────────────────

type PhaseStatus = 'pending' | 'active' | 'complete' | 'error' | 'skipped';

function getPhaseStatus(
    phase: BootPhase,
    currentBootPhase: BootPhase,
    _subsystemStatuses: Record<string, string>,
): PhaseStatus {
    const phaseOrder = PHASE_CONFIGS.map(c => c.phase);
    const currentIdx = phaseOrder.indexOf(currentBootPhase);
    const phaseIdx = phaseOrder.indexOf(phase);

    if (currentBootPhase === BootPhase.IDLE || currentBootPhase === BootPhase.SHUTDOWN) {
        return 'pending';
    }
    if (currentBootPhase === BootPhase.READY) {
        return 'complete';
    }
    if (currentBootPhase === BootPhase.ERROR) {
        if (phaseIdx < currentIdx) return 'complete';
        if (phaseIdx === currentIdx) return 'error';
        return 'pending';
    }
    if (phaseIdx < currentIdx) return 'complete';
    if (phaseIdx === currentIdx) return 'active';
    return 'pending';
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Phase Result Badge for telemetry ────────────────────────

function getPhaseResultBadge(
    phase: BootPhase,
    envStatus: string,
    persistenceStatus: string,
    cortexStatus: string,
    seedStatus: string,
    wsStatus: string,
    evolutionStatus: string,
): { label: string; variant: string } {
    switch (phase) {
        case BootPhase.ENV_CHECK:
            return envStatus === 'valid'
                ? { label: '✅ VALID', variant: 'success' }
                : { label: '⚠️ DEMO', variant: 'warning' };
        case BootPhase.PERSISTENCE:
            if (persistenceStatus === 'hydrated') return { label: '💾 HYDRATED', variant: 'success' };
            if (persistenceStatus === 'fresh') return { label: '📭 FRESH', variant: 'info' };
            return { label: '⚠️ ERROR', variant: 'warning' };
        case BootPhase.CORTEX_SPAWN:
            return cortexStatus === 'spawned'
                ? { label: '🧠 SPAWNED', variant: 'success' }
                : { label: '❌ FAILED', variant: 'danger' };
        case BootPhase.HISTORICAL_SEED:
            if (seedStatus === 'complete') return { label: '📊 SEEDED', variant: 'success' };
            if (seedStatus === 'seeding') return { label: '⏳ SEEDING', variant: 'info' };
            return { label: '⏭️ SKIPPED', variant: 'neutral' };
        case BootPhase.WS_CONNECT:
            return wsStatus === 'connected'
                ? { label: '📡 CONNECTED', variant: 'success' }
                : { label: '⏭️ SKIPPED', variant: 'neutral' };
        case BootPhase.EVOLUTION_START:
            return evolutionStatus === 'active'
                ? { label: '🧬 ACTIVE', variant: 'success' }
                : { label: '⚠️ MANUAL', variant: 'warning' };
        case BootPhase.READY:
            return { label: '🟢 LIVE', variant: 'success' };
        default:
            return { label: '—', variant: 'neutral' };
    }
}

// ─── Ignition Panel Component ────────────────────────────────

export function IgnitionSequencePanel() {
    const {
        phase, progress, error, hasBooted,
        envStatus, persistenceStatus, cortexStatus,
        seedStatus, wsStatus, evolutionStatus,
        bootDurationMs, phaseDurations, elapsedMs,
        bootHistory,
        // Phase 38: Sentinel state
        probeResult, probeRunning,
        bootHealthScore, bootHealthGrade,
        sentinelRecoveryTier, sentinelRecovering,
        circuitBreakerTripped,
        resilientIgnite, runProbe, shutdown,
    } = useBootStore();

    const [isIgniting, setIsIgniting] = useState(false);
    const [showTelemetry, setShowTelemetry] = useState(true);
    const [showProbe, setShowProbe] = useState(true);

    const subsystemStatuses: Record<string, string> = {
        env: envStatus,
        persistence: persistenceStatus,
        cortex: cortexStatus,
        seed: seedStatus,
        ws: wsStatus,
        evolution: evolutionStatus,
    };

    // Auto-probe on mount when idle
    useEffect(() => {
        if (phase === BootPhase.IDLE && !hasBooted && !probeResult && !probeRunning) {
            runProbe();
        }
    }, [phase, hasBooted, probeResult, probeRunning, runProbe]);

    const handleIgnite = useCallback(async () => {
        setIsIgniting(true);
        try {
            // Phase 38: Use resilient boot with auto-recovery
            await resilientIgnite({
                pairs: ['BTCUSDT', 'ETHUSDT'],
                timeframe: Timeframe.H1,
                totalCapital: 10000,
                skipPersistence: false,
                autoTrade: false,
            });
        } finally {
            setIsIgniting(false);
        }
    }, [resilientIgnite]);

    const handleShutdown = useCallback(async () => {
        setShowTelemetry(true);
        await shutdown();
    }, [shutdown]);

    // Calculate max phase duration for waterfall chart scaling
    const maxPhaseDuration = useMemo(() => {
        const durations = Object.values(phaseDurations).filter((d): d is number => typeof d === 'number');
        return Math.max(1, ...durations);
    }, [phaseDurations]);

    // Previous boot for comparison
    const previousBoot = useMemo(() => {
        if (bootHistory.length < 2) return null;
        return bootHistory[bootHistory.length - 2];
    }, [bootHistory]);

    // ─── Boot state classification ───────────────────────────

    const isIdle = phase === BootPhase.IDLE && !isIgniting;
    const isBooting = phase !== BootPhase.IDLE
        && phase !== BootPhase.READY
        && phase !== BootPhase.ERROR
        && phase !== BootPhase.SHUTDOWN;
    const isError = phase === BootPhase.ERROR;
    const isReady = phase === BootPhase.READY && hasBooted;

    // ─── Render ──────────────────────────────────────────────

    return (
        <div className={`ignition-panel glass-card glass-card-accent ${isReady ? 'accent-emerald' : 'accent-primary'} col-12 stagger-in stagger-1`}>
            <div className="card-header">
                <div className="card-title">
                    <Rocket size={18} />
                    System Ignition
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Live Elapsed Timer During Boot */}
                    {(isBooting || isIgniting) && (
                        <span className="ignition-elapsed-timer">
                            <Clock size={14} />
                            <span className="ignition-elapsed-value">
                                {(elapsedMs / 1000).toFixed(1)}s
                            </span>
                        </span>
                    )}
                    {isBooting && (
                        <span className="card-badge badge-primary">
                            {progress.overallPercent}%
                        </span>
                    )}
                    {isError && (
                        <span className="card-badge badge-danger">
                            ERROR
                        </span>
                    )}
                    {isReady && (
                        <span className="card-badge badge-success">
                            LIVE
                        </span>
                    )}
                </div>
            </div>

            <div className="card-body">
                {/* ─── Compact Status Bar (after boot) ────────────── */}
                {isReady && (
                    <div className="ignition-compact-inner">
                        <div className="ignition-compact-status">
                            <div className="ignition-live-dot" />
                            <span className="ignition-compact-label">SYSTEM LIVE</span>
                            <span className="ignition-compact-detail">
                                Boot: {formatDuration(bootDurationMs)}
                            </span>
                            {envStatus === 'invalid' && (
                                <span className="card-badge badge-warning" style={{ marginLeft: 8 }}>
                                    DEMO MODE
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowTelemetry(prev => !prev)}
                                title="Toggle boot telemetry"
                            >
                                <Activity size={14} />
                                {showTelemetry ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={handleShutdown}
                            >
                                <Power size={14} />
                                Shutdown
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Overall Progress Bar ────────────────────────── */}
                {(isBooting || isError) && (
                    <div className="ignition-progress-container">
                        <div className="ignition-progress-bar">
                            <div
                                className={`ignition-progress-fill ${isError ? 'error' : ''}`}
                                style={{ width: `${progress.overallPercent}%` }}
                            />
                        </div>
                        <div className="ignition-progress-label">
                            {progress.message}
                        </div>
                    </div>
                )}

                {/* ─── Phase Steps (during boot + idle) ───────────── */}
                {(!isReady || !showTelemetry) && (isIdle || isBooting || isError || isIgniting) && (
                    <div className="ignition-phases">
                        {PHASE_CONFIGS.map((config, index) => {
                            const status = getPhaseStatus(
                                config.phase,
                                phase,
                                subsystemStatuses,
                            );
                            const duration = phaseDurations[config.phase];

                            return (
                                <div
                                    key={config.phase}
                                    className={`ignition-phase ignition-phase--${status}`}
                                >
                                    <div className="ignition-phase-icon">
                                        {status === 'active' ? (
                                            <Loader2 size={16} className="ignition-spinner" />
                                        ) : status === 'complete' ? (
                                            <CheckCircle2 size={16} />
                                        ) : status === 'error' ? (
                                            <AlertCircle size={16} />
                                        ) : (
                                            config.icon
                                        )}
                                    </div>

                                    <div className="ignition-phase-info">
                                        <div className="ignition-phase-label">
                                            {config.label}
                                        </div>
                                        {(isBooting || isError || hasBooted) && (
                                            <div className="ignition-phase-desc">
                                                {status === 'active'
                                                    ? config.description
                                                    : status === 'complete' && duration
                                                        ? formatDuration(duration)
                                                        : status === 'error'
                                                            ? 'Failed'
                                                            : ''}
                                            </div>
                                        )}
                                    </div>

                                    {/* Connector line between phases */}
                                    {index < PHASE_CONFIGS.length - 1 && (
                                        <div className={`ignition-phase-connector ignition-phase-connector--${status === 'complete' ? 'complete' : 'pending'}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ─── Seed Progress Detail ────────────────────────── */}
                {phase === BootPhase.HISTORICAL_SEED && progress.slotProgress.total > 0 && (
                    <div className="ignition-seed-detail">
                        <div className="ignition-seed-label">
                            {progress.slotProgress.currentSlot}
                        </div>
                        <div className="ignition-seed-count">
                            {progress.slotProgress.completed}/{progress.slotProgress.total} slots
                        </div>
                    </div>
                )}

                {/* ─── Error Display ───────────────────────────────── */}
                {isError && error && (
                    <div className="ignition-error">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {/* ─── Boot Telemetry Report (after boot) ─────────── */}
                {isReady && showTelemetry && (
                    <div className="ignition-telemetry">
                        <div className="ignition-telemetry-header">
                            <span className="ignition-telemetry-title">Boot Telemetry</span>
                            <span className="ignition-telemetry-total">
                                {formatDuration(bootDurationMs)}
                                {previousBoot && (
                                    <span className={`ignition-telemetry-compare ${bootDurationMs < previousBoot.durationMs ? 'faster' : 'slower'
                                        }`}>
                                        {bootDurationMs < previousBoot.durationMs
                                            ? `${((1 - bootDurationMs / previousBoot.durationMs) * 100).toFixed(0)}% faster`
                                            : `${((bootDurationMs / previousBoot.durationMs - 1) * 100).toFixed(0)}% slower`
                                        }
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* Phase Waterfall Chart */}
                        <div className="ignition-waterfall">
                            {PHASE_CONFIGS.map(config => {
                                const duration = phaseDurations[config.phase] ?? 0;
                                const pct = maxPhaseDuration > 0
                                    ? Math.max(2, (duration / maxPhaseDuration) * 100)
                                    : 2;
                                const badge = getPhaseResultBadge(
                                    config.phase,
                                    envStatus, persistenceStatus, cortexStatus,
                                    seedStatus, wsStatus, evolutionStatus,
                                );

                                return (
                                    <div key={config.phase} className="ignition-waterfall-row">
                                        <div className="ignition-waterfall-label">
                                            {config.label}
                                        </div>
                                        <div className="ignition-waterfall-bar-container">
                                            <div
                                                className={`ignition-waterfall-bar ignition-waterfall-bar--${duration < 100 ? 'fast' : duration < 500 ? 'normal' : 'slow'
                                                    }`}
                                                style={{ width: `${pct}%` }}
                                            />
                                            <span className="ignition-waterfall-duration">
                                                {formatDuration(duration)}
                                            </span>
                                        </div>
                                        <div className={`ignition-result-badge ignition-result-badge--${badge.variant}`}>
                                            {badge.label}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Boot History */}
                        {bootHistory.length > 1 && (
                            <div className="ignition-history">
                                <div className="ignition-history-title">Boot History</div>
                                <div className="ignition-history-entries">
                                    {bootHistory.slice().reverse().map((entry, i) => (
                                        <div
                                            key={entry.timestamp}
                                            className={`ignition-history-entry ${i === 0 ? 'current' : ''}`}
                                        >
                                            <span className="ignition-history-time">
                                                {new Date(entry.timestamp).toLocaleTimeString('tr-TR', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                })}
                                            </span>
                                            <span className={`ignition-history-badge ${entry.mode}`}>
                                                {entry.mode.toUpperCase()}
                                            </span>
                                            <span className="ignition-history-duration">
                                                {formatDuration(entry.durationMs)}
                                            </span>
                                            <span className={`ignition-history-status ${entry.success ? 'success' : 'fail'}`}>
                                                {entry.success ? '✅' : '❌'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ─── Phase 38: Pre-Boot Diagnostic ──────────────── */}
                {(isIdle || isError) && (
                    <div className="ignition-probe">
                        <div className="ignition-probe-header">
                            <div className="ignition-probe-title">
                                <Search size={14} />
                                <span>Pre-Boot Diagnostic</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                {bootHealthScore > 0 && (
                                    <span className={`ignition-health-badge ignition-health-badge--${
                                        bootHealthScore >= 90 ? 'excellent' :
                                        bootHealthScore >= 70 ? 'good' :
                                        bootHealthScore >= 50 ? 'fair' : 'poor'
                                    }`}>
                                        <HeartPulse size={12} />
                                        {bootHealthScore} ({bootHealthGrade})
                                    </span>
                                )}
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => { runProbe(); }}
                                    disabled={probeRunning}
                                    title="Re-run probe"
                                >
                                    <RefreshCw size={12} className={probeRunning ? 'ignition-spinner' : ''} />
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setShowProbe(prev => !prev)}
                                >
                                    {showProbe ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                            </div>
                        </div>

                        {showProbe && probeRunning && (
                            <div className="ignition-probe-loading">
                                <Loader2 size={16} className="ignition-spinner" />
                                <span>Running testnet connectivity probe...</span>
                            </div>
                        )}

                        {showProbe && probeResult && !probeRunning && (
                            <div className="ignition-probe-checks">
                                {probeResult.checks.map((check) => (
                                    <div key={check.name} className={`ignition-probe-check ignition-probe-check--${check.status}`}>
                                        <div className="ignition-probe-check-icon">
                                            {check.status === 'pass'
                                                ? <CheckCircle2 size={14} />
                                                : check.status === 'warn'
                                                    ? <AlertCircle size={14} />
                                                    : <ShieldAlert size={14} />
                                            }
                                        </div>
                                        <div className="ignition-probe-check-info">
                                            <span className="ignition-probe-check-name">
                                                {check.name.replace(/_/g, ' ')}
                                            </span>
                                            <span className="ignition-probe-check-detail">
                                                {check.details}
                                            </span>
                                        </div>
                                        {check.latencyMs > 0 && (
                                            <span className="ignition-probe-check-latency">
                                                {check.latencyMs}ms
                                            </span>
                                        )}
                                    </div>
                                ))}

                                {/* Account Summary */}
                                {probeResult.account && (
                                    <div className="ignition-probe-account">
                                        <span>Wallet: ${probeResult.account.walletBalance.toFixed(2)}</span>
                                        <span>Available: ${probeResult.account.availableBalance.toFixed(2)}</span>
                                        {probeResult.account.openPositions > 0 && (
                                            <span>Positions: {probeResult.account.openPositions}</span>
                                        )}
                                    </div>
                                )}

                                {/* Probe Summary */}
                                <div className={`ignition-probe-summary ignition-probe-summary--${
                                    probeResult.ready ? 'ready' : 'issues'
                                }`}>
                                    {probeResult.ready
                                        ? '✅ All checks passed — Ready to IGNITE'
                                        : `⚠️ ${probeResult.checks.filter(c => c.status === 'fail').length} issue(s) detected — Boot will use DEMO mode`
                                    }
                                    <span className="ignition-probe-latency">
                                        Probe: {probeResult.totalLatencyMs}ms
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ─── Phase 38: Sentinel Recovery Status ─────────── */}
                {sentinelRecovering && (
                    <div className="ignition-sentinel-recovery">
                        <ShieldAlert size={16} />
                        <span>
                            Auto-Recovery: Tier <strong>{sentinelRecoveryTier}</strong>
                        </span>
                        <Loader2 size={14} className="ignition-spinner" />
                    </div>
                )}

                {circuitBreakerTripped && (
                    <div className="ignition-circuit-breaker">
                        <ShieldAlert size={16} />
                        <span>Circuit Breaker Tripped — All recovery tiers exhausted</span>
                    </div>
                )}

                {/* ─── Ignite Button ───────────────────────────────── */}
                {(isIdle || isError) && (
                    <div className="ignition-action">
                        <button
                            className="ignition-button"
                            onClick={handleIgnite}
                            disabled={isIgniting}
                        >
                            {isIgniting ? (
                                <Loader2 size={20} className="ignition-spinner" />
                            ) : (
                                <Rocket size={20} />
                            )}
                            <span>
                                {isIgniting
                                    ? sentinelRecovering
                                        ? `Recovery: ${sentinelRecoveryTier}...`
                                        : 'Igniting...'
                                    : isError
                                        ? 'Retry Ignition'
                                        : 'Ignite System'}
                            </span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
