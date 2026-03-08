'use client';

// ============================================================
// Learner: Ignition Sequence Panel — System Bootstrap UI
// ============================================================
// Phase 36 — System Startup Architecture
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
// During boot: Shows animated phase progression
// After boot: Collapses to compact status bar
// ============================================================

import React, { useCallback, useState } from 'react';
import {
    Shield, Database, Brain, BarChart3, Wifi, Zap,
    CheckCircle2, Rocket, AlertCircle, Power,
    Loader2, Clock,
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
    subsystemStatuses: Record<string, string>,
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

// ─── Ignition Panel Component ────────────────────────────────

export function IgnitionSequencePanel() {
    const {
        phase, progress, error, hasBooted,
        envStatus, persistenceStatus, cortexStatus,
        seedStatus, wsStatus, evolutionStatus,
        bootDurationMs, phaseDurations,
        ignite, shutdown,
    } = useBootStore();

    const [isIgniting, setIsIgniting] = useState(false);

    const subsystemStatuses: Record<string, string> = {
        env: envStatus,
        persistence: persistenceStatus,
        cortex: cortexStatus,
        seed: seedStatus,
        ws: wsStatus,
        evolution: evolutionStatus,
    };

    const handleIgnite = useCallback(async () => {
        setIsIgniting(true);
        try {
            await ignite({
                pairs: ['BTCUSDT', 'ETHUSDT'],
                timeframe: Timeframe.H1,
                totalCapital: 10000,
                skipPersistence: false,
                autoTrade: false,
            });
        } finally {
            setIsIgniting(false);
        }
    }, [ignite]);

    const handleShutdown = useCallback(async () => {
        await shutdown();
    }, [shutdown]);

    // ─── Compact Status Bar (after boot) ──────────────────────

    if (phase === BootPhase.READY && hasBooted) {
        return (
            <div className="ignition-compact glass-card glass-card-accent accent-emerald col-12">
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
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleShutdown}
                    >
                        <Power size={14} />
                        Shutdown
                    </button>
                </div>
            </div>
        );
    }

    // ─── IDLE State — Show Ignite Button ──────────────────────

    const isIdle = phase === BootPhase.IDLE && !isIgniting;
    const isBooting = phase !== BootPhase.IDLE
        && phase !== BootPhase.READY
        && phase !== BootPhase.ERROR
        && phase !== BootPhase.SHUTDOWN;
    const isError = phase === BootPhase.ERROR;

    return (
        <div className="ignition-panel glass-card glass-card-accent accent-primary col-12 stagger-in stagger-1">
            <div className="card-header">
                <div className="card-title">
                    <Rocket size={18} />
                    System Ignition
                </div>
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
            </div>

            <div className="card-body">
                {/* Overall Progress Bar */}
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

                {/* Phase Steps */}
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

                {/* Seed Progress Detail */}
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

                {/* Error Display */}
                {isError && error && (
                    <div className="ignition-error">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Ignite Button */}
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
                                {isError ? 'Retry Ignition' : 'Ignite System'}
                            </span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
