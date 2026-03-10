// ============================================================
// Learner: Testnet Session Panel — Live Paper Trading Control
// ============================================================
// Phase 40: Dashboard panel that wires TestnetSessionOrchestrator
// to the UI, providing:
//   1. Session configuration (pairs, timeframe, capital, dryRun)
//   2. 5-phase progress display (PROBE→SEED→EVOLVE→TRADE→REPORT)
//   3. Live trade count, open positions, cumulative PnL
//   4. Start/Stop controls with safety confirmations
//   5. Post-session report (win rate, drawdown, P&L)
// ============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Play, Square, AlertTriangle, CheckCircle, XCircle,
    Loader2, Zap, Radio, ShieldAlert, TrendingUp,
    Clock, Target, Activity,
} from 'lucide-react';
import { useSessionStore } from '@/lib/store';
import { Timeframe } from '@/types';
import type { SessionPhase, SessionConfig } from '@/lib/engine/testnet-session-orchestrator';
import type { SignalEvent } from '@/lib/engine/session-signal-stream';

// ─── Phase Configuration ────────────────────────────────────

const PHASE_CONFIG: Record<SessionPhase, { icon: string; label: string; color: string }> = {
    IDLE: { icon: '⏸️', label: 'Idle', color: 'var(--text-muted)' },
    PROBE: { icon: '🔍', label: 'Probe', color: 'var(--info)' },
    SEED: { icon: '🌱', label: 'Seed', color: 'var(--accent-primary)' },
    EVOLVE: { icon: '🧬', label: 'Evolve', color: 'var(--accent-secondary)' },
    TRADE: { icon: '📈', label: 'Trading', color: 'var(--success)' },
    REPORT: { icon: '📊', label: 'Report', color: 'var(--info)' },
    STOPPED: { icon: '⏹️', label: 'Stopped', color: 'var(--text-muted)' },
    ERROR: { icon: '❌', label: 'Error', color: 'var(--danger)' },
};

const PHASE_ORDER: SessionPhase[] = ['PROBE', 'SEED', 'EVOLVE', 'TRADE', 'REPORT'];

// ─── Helpers ────────────────────────────────────────────────

function formatElapsed(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function formatPnl(pnl: number): string {
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}${pnl.toFixed(2)}%`;
}

// ─── Session Config Form ────────────────────────────────────

function SessionConfigForm({
    onStart,
    isStarting,
}: {
    onStart: (config: Partial<SessionConfig>) => void;
    isStarting: boolean;
}) {
    const [pairs, setPairs] = useState('BTCUSDT');
    const [timeframe, setTimeframe] = useState(Timeframe.H1);
    const [capital, setCapital] = useState(1000);
    const [dryRun, setDryRun] = useState(false);
    const [maxDuration, setMaxDuration] = useState(60);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const handleStart = useCallback(() => {
        const pairList = pairs.split(',').map(p => p.trim().toUpperCase()).filter(Boolean);
        onStart({
            pairs: pairList,
            timeframe,
            capitalPerSlot: capital,
            dryRun,
            maxDurationMinutes: maxDuration,
        });
        setConfirmOpen(false);
    }, [pairs, timeframe, capital, dryRun, maxDuration, onStart]);

    return (
        <div className="session-config">
            <div className="session-config-grid">
                <div className="session-field">
                    <label className="session-label">Pairs</label>
                    <input
                        className="session-input"
                        value={pairs}
                        onChange={e => setPairs(e.target.value)}
                        placeholder="BTCUSDT, ETHUSDT"
                    />
                </div>
                <div className="session-field">
                    <label className="session-label">Timeframe</label>
                    <select
                        className="session-input"
                        value={timeframe}
                        onChange={e => setTimeframe(e.target.value as Timeframe)}
                    >
                        <option value={Timeframe.M5}>5m</option>
                        <option value={Timeframe.M15}>15m</option>
                        <option value={Timeframe.H1}>1h</option>
                        <option value={Timeframe.H4}>4h</option>
                    </select>
                </div>
                <div className="session-field">
                    <label className="session-label">Capital (USDT)</label>
                    <input
                        className="session-input"
                        type="number"
                        value={capital}
                        onChange={e => setCapital(Number(e.target.value))}
                        min={100}
                        max={50000}
                    />
                </div>
                <div className="session-field">
                    <label className="session-label">Max Duration (min)</label>
                    <input
                        className="session-input"
                        type="number"
                        value={maxDuration}
                        onChange={e => setMaxDuration(Number(e.target.value))}
                        min={5}
                        max={1440}
                    />
                </div>
            </div>

            <div className="session-row" style={{ marginTop: 12 }}>
                <label className="session-toggle-label">
                    <input
                        type="checkbox"
                        checked={dryRun}
                        onChange={e => setDryRun(e.target.checked)}
                    />
                    <span>Dry Run</span>
                    <span className="session-hint">(signals only, no testnet orders)</span>
                </label>
            </div>

            {!confirmOpen ? (
                <button
                    className="session-btn session-btn-start"
                    onClick={() => setConfirmOpen(true)}
                    disabled={isStarting || !pairs.trim()}
                >
                    <Play size={14} />
                    <span>Start Session</span>
                </button>
            ) : (
                <div className="session-confirm">
                    <div className="session-confirm-text">
                        <ShieldAlert size={14} />
                        <span>
                            {dryRun
                                ? 'Start DRY RUN session? (No real orders)'
                                : '⚠️ Start LIVE TESTNET session? Real orders will be placed on Binance Testnet.'}
                        </span>
                    </div>
                    <div className="session-confirm-actions">
                        <button
                            className="session-btn session-btn-confirm"
                            onClick={handleStart}
                            disabled={isStarting}
                        >
                            {isStarting ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                            <span>{isStarting ? 'Starting...' : 'Confirm'}</span>
                        </button>
                        <button
                            className="session-btn session-btn-cancel"
                            onClick={() => setConfirmOpen(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Phase Progress Bar ─────────────────────────────────────

function PhaseProgressBar({ currentPhase }: { currentPhase: SessionPhase }) {
    const currentIdx = PHASE_ORDER.indexOf(currentPhase);

    return (
        <div className="session-phases">
            {PHASE_ORDER.map((phase, idx) => {
                const config = PHASE_CONFIG[phase];
                const isCompleted = currentIdx > idx;
                const isActive = currentPhase === phase;
                const isPending = currentIdx < idx;

                let className = 'session-phase';
                if (isCompleted) className += ' completed';
                else if (isActive) className += ' active';
                else if (isPending) className += ' pending';

                return (
                    <React.Fragment key={phase}>
                        {idx > 0 && (
                            <div className={`session-phase-connector ${isCompleted ? 'completed' : ''}`} />
                        )}
                        <div className={className}>
                            <span className="session-phase-icon">
                                {isCompleted ? <CheckCircle size={14} /> : config.icon}
                            </span>
                            <span className="session-phase-label">{config.label}</span>
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

// ─── Live Session Display ───────────────────────────────────

function LiveSessionDisplay({
    onStop,
    isStopping,
}: {
    onStop: () => void;
    isStopping: boolean;
}) {
    const { phase, sessionState, refreshState } = useSessionStore();

    // Auto-poll state every 2 seconds
    useEffect(() => {
        const iv = setInterval(refreshState, 2000);
        return () => clearInterval(iv);
    }, [refreshState]);

    if (!sessionState) return null;

    const isTrading = phase === 'TRADE';
    const isActive = ['PROBE', 'SEED', 'EVOLVE', 'TRADE'].includes(phase);
    const pnlColor = sessionState.cumulativePnl >= 0 ? 'var(--success)' : 'var(--danger)';

    return (
        <div className="session-live">
            <PhaseProgressBar currentPhase={phase} />

            {/* Live Stats */}
            <div className="session-stats">
                <div className="session-stat-tile">
                    <Clock size={12} />
                    <span className="session-stat-value">{formatElapsed(sessionState.elapsedMs)}</span>
                    <span className="session-stat-label">Elapsed</span>
                </div>
                <div className="session-stat-tile">
                    <Target size={12} />
                    <span className="session-stat-value">{sessionState.tradeCount}</span>
                    <span className="session-stat-label">Trades</span>
                </div>
                <div className="session-stat-tile">
                    <Activity size={12} />
                    <span className="session-stat-value">{sessionState.openPositions}</span>
                    <span className="session-stat-label">Open</span>
                </div>
                <div className="session-stat-tile">
                    <TrendingUp size={12} />
                    <span className="session-stat-value" style={{ color: pnlColor }}>
                        {formatPnl(sessionState.cumulativePnl)}
                    </span>
                    <span className="session-stat-label">P&L</span>
                </div>
            </div>

            {/* Trading Phase Badge */}
            {isTrading && (
                <div className="session-trading-badge">
                    <Radio size={12} className="session-pulse" />
                    <span>Auto-Trade Active — Signals being evaluated on every candle close</span>
                </div>
            )}

            {/* Error Display */}
            {sessionState.lastError && (
                <div className="session-error">
                    <XCircle size={14} />
                    <span>{sessionState.lastError}</span>
                </div>
            )}

            {/* Stop Button */}
            {isActive && (
                <button
                    className="session-btn session-btn-stop"
                    onClick={onStop}
                    disabled={isStopping}
                >
                    {isStopping ? <Loader2 size={14} className="spin" /> : <Square size={14} />}
                    <span>{isStopping ? 'Stopping...' : 'Stop Session'}</span>
                </button>
            )}
        </div>
    );
}

// ─── Session Report Display ─────────────────────────────────

function SessionReportDisplay() {
    const { lastReport } = useSessionStore();
    if (!lastReport) return null;

    const winRate = lastReport.totalTrades > 0
        ? Math.round((lastReport.winningTrades / lastReport.totalTrades) * 100)
        : 0;

    const pnlColor = lastReport.totalPnlPercent >= 0 ? 'var(--success)' : 'var(--danger)';

    return (
        <div className="session-report">
            <div className="session-report-header">
                <span>📊 Session Report</span>
                <span className="session-report-duration">
                    {formatElapsed(lastReport.durationMs)}
                </span>
            </div>
            <div className="session-stats">
                <div className="session-stat-tile">
                    <span className="session-stat-value" style={{ color: pnlColor }}>
                        {formatPnl(lastReport.totalPnlPercent)}
                    </span>
                    <span className="session-stat-label">Total P&L</span>
                </div>
                <div className="session-stat-tile">
                    <span className="session-stat-value">{lastReport.totalTrades}</span>
                    <span className="session-stat-label">Trades</span>
                </div>
                <div className="session-stat-tile">
                    <span className="session-stat-value">{winRate}%</span>
                    <span className="session-stat-label">Win Rate</span>
                </div>
                <div className="session-stat-tile">
                    <span className="session-stat-value" style={{ color: 'var(--danger)' }}>
                        -{lastReport.maxDrawdownPercent.toFixed(1)}%
                    </span>
                    <span className="session-stat-label">Max DD</span>
                </div>
                <div className="session-stat-tile">
                    <span className="session-stat-value" style={{ color: 'var(--success)' }}>
                        {formatPnl(lastReport.bestTradePnl)}
                    </span>
                    <span className="session-stat-label">Best</span>
                </div>
                <div className="session-stat-tile">
                    <span className="session-stat-value" style={{ color: 'var(--danger)' }}>
                        {formatPnl(lastReport.worstTradePnl)}
                    </span>
                    <span className="session-stat-label">Worst</span>
                </div>
            </div>

            {lastReport.abortReason && (
                <div className="session-error" style={{ marginTop: 8 }}>
                    <AlertTriangle size={14} />
                    <span>Aborted: {lastReport.abortReason}</span>
                </div>
            )}
        </div>
    );
}

// ─── Signal Stream Display (Radical Innovation) ────────────

const EVENT_TYPE_STYLES: Record<string, { emoji: string; color: string }> = {
    SIGNAL_EVALUATED: { emoji: '🔎', color: 'var(--text-muted)' },
    TRADE_EXECUTED: { emoji: '🔥', color: 'var(--success)' },
    TRADE_SKIPPED: { emoji: '⏭', color: 'var(--warning)' },
    EXIT_TRIGGERED: { emoji: '📤', color: 'var(--info)' },
    ERROR_OCCURRED: { emoji: '❌', color: 'var(--danger)' },
};

function SignalStreamDisplay() {
    const [events, setEvents] = useState<SignalEvent[]>([]);
    const [stats, setStats] = useState({ total: 0, executed: 0, skipped: 0, exits: 0, errors: 0, executionRate: 0 });

    useEffect(() => {
        let mounted = true;

        import('@/lib/engine/session-signal-stream').then(({ getSignalStream }) => {
            if (!mounted) return;
            const stream = getSignalStream();

            // Initial load
            setEvents(stream.getLatestEvents(15));
            setStats(stream.getStats());

            // Subscribe to updates
            const unsubscribe = stream.subscribe((allEvents) => {
                if (!mounted) return;
                setEvents(allEvents.slice(-15));
                setStats(stream.getStats());
            });

            return () => { unsubscribe(); };
        });

        return () => { mounted = false; };
    }, []);

    if (events.length === 0) {
        return (
            <div className="signal-stream-empty">
                <span>Waiting for signal evaluations...</span>
            </div>
        );
    }

    return (
        <div className="signal-stream">
            {/* Stream Stats */}
            <div className="signal-stream-header">
                <span className="signal-stream-title">🧠 AI Decision Stream</span>
                <div className="signal-stream-stats">
                    <span className="ss-stat">🔥 {stats.executed}</span>
                    <span className="ss-stat">⏭ {stats.skipped}</span>
                    <span className="ss-stat">📤 {stats.exits}</span>
                    <span className="ss-stat ss-rate">{stats.executionRate}% exec</span>
                </div>
            </div>

            {/* Event Feed */}
            <div className="signal-stream-feed">
                {events.slice().reverse().map((event) => {
                    const style = EVENT_TYPE_STYLES[event.type] ?? EVENT_TYPE_STYLES.SIGNAL_EVALUATED;
                    const time = new Date(event.timestamp).toLocaleTimeString([], {
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                    });

                    return (
                        <div
                            key={event.id}
                            className={`signal-event signal-event-${event.type.toLowerCase()}`}
                        >
                            <span className="signal-event-time">{time}</span>
                            <span className="signal-event-emoji">{style.emoji}</span>
                            <span className="signal-event-msg" style={{ color: style.color }}>
                                {event.message}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Main Panel ─────────────────────────────────────────────

export function TestnetSessionPanel() {
    const { phase, startSession, stopSession, isStarting, isStopping } = useSessionStore();

    const isIdle = phase === 'IDLE' || phase === 'STOPPED' || phase === 'ERROR';
    const isActive = ['PROBE', 'SEED', 'EVOLVE', 'TRADE', 'REPORT'].includes(phase);
    const showReport = phase === 'STOPPED' || phase === 'ERROR';

    const phaseConfig = PHASE_CONFIG[phase];

    return (
        <section
            id="testnet-session"
            className="glass-card glass-card-accent accent-amber col-12 stagger-in stagger-6"
        >
            <div className="card-header">
                <div className="card-title">
                    <Zap size={18} style={{ color: 'var(--warning)' }} />
                    <span>Testnet Trading Session</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span
                        className={`card-badge ${
                            phase === 'TRADE' ? 'badge-success' :
                            phase === 'ERROR' ? 'badge-danger' :
                            isActive ? 'badge-info' :
                            'badge-primary'
                        }`}
                    >
                        {phaseConfig.icon} {phaseConfig.label}
                    </span>
                </div>
            </div>

            <div className="card-body">
                {/* Idle / Config */}
                {isIdle && (
                    <SessionConfigForm
                        onStart={startSession}
                        isStarting={isStarting}
                    />
                )}

                {/* Active Session */}
                {isActive && (
                    <>
                        <LiveSessionDisplay
                            onStop={() => stopSession()}
                            isStopping={isStopping}
                        />
                        <SignalStreamDisplay />
                    </>
                )}

                {/* Report */}
                {showReport && <SessionReportDisplay />}
            </div>
        </section>
    );
}
