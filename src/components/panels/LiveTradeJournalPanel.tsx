// ============================================================
// Learner: Live Trade Journal Panel
// ============================================================
// Phase 42: Real-time trade blotter showing open positions,
// closed trade history, and execution summary.
//
// Sections:
//   1. Open Positions — live P&L, time held, SL/TP levels
//   2. Trade History — closed trades with P&L coloring
//   3. Execution Summary — win rate, total P&L, avg metrics
//
// Radical Innovation: Trade Decision Replay (TDR) — click any
// trade to see the full AI decision chain that led to it.
// ============================================================

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Clock, Activity, BarChart2,
    ChevronDown, ChevronUp, AlertTriangle, Zap,
    ArrowUpCircle, ArrowDownCircle, Target,
} from 'lucide-react';
import {
    getTradeObserver,
    type TradeJournalEntry,
} from '@/lib/engine/trade-lifecycle-observer';
import { getSignalStream, type SignalEvent } from '@/lib/engine/session-signal-stream';

// ─── Helpers ────────────────────────────────────────────────

function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

function formatPrice(price: number): string {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
}

function formatPnl(pnl: number | null): string {
    if (pnl === null) return '—';
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}${pnl.toFixed(2)}%`;
}

// ─── Open Position Card ─────────────────────────────────────

function OpenPositionCard({ entry }: { entry: TradeJournalEntry }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed(Date.now() - entry.openTime);
        }, 1000);
        return () => clearInterval(interval);
    }, [entry.openTime]);

    const isLong = entry.direction === 'LONG';

    return (
        <div className={`tj-position-card ${isLong ? 'tj-long' : 'tj-short'}`}>
            <div className="tj-position-header">
                <div className="tj-pair-badge">
                    {isLong
                        ? <ArrowUpCircle size={14} />
                        : <ArrowDownCircle size={14} />
                    }
                    <span className="tj-pair">{entry.pair}</span>
                    <span className={`tj-direction-badge ${isLong ? 'tj-badge-long' : 'tj-badge-short'}`}>
                        {entry.direction}
                    </span>
                </div>
                <span className="tj-elapsed">
                    <Clock size={10} />
                    {formatDuration(elapsed)}
                </span>
            </div>

            <div className="tj-position-details">
                <div className="tj-detail-row">
                    <span className="tj-detail-label">Entry</span>
                    <span className="tj-detail-value">${formatPrice(entry.entryPrice)}</span>
                </div>
                <div className="tj-detail-row">
                    <span className="tj-detail-label">Qty</span>
                    <span className="tj-detail-value">{entry.quantity}</span>
                </div>
                <div className="tj-detail-row">
                    <span className="tj-detail-label">Leverage</span>
                    <span className="tj-detail-value">{entry.leverage}x</span>
                </div>
                <div className="tj-detail-row">
                    <span className="tj-detail-label">SL</span>
                    <span className="tj-detail-value tj-sl">${formatPrice(entry.slPrice)}</span>
                </div>
                <div className="tj-detail-row">
                    <span className="tj-detail-label">TP</span>
                    <span className="tj-detail-value tj-tp">${formatPrice(entry.tpPrice)}</span>
                </div>
            </div>

            <div className="tj-position-footer">
                <span className="tj-strategy-tag">
                    🧬 {entry.strategyName}
                </span>
                <span className="tj-confidence">
                    {(entry.confidence * 100).toFixed(0)}% conf
                </span>
            </div>
        </div>
    );
}

// ─── Trade History Row ──────────────────────────────────────

function TradeHistoryRow({
    entry,
    expanded,
    onToggle,
}: {
    entry: TradeJournalEntry;
    expanded: boolean;
    onToggle: () => void;
}) {
    const isLong = entry.direction === 'LONG';
    const isDryRun = entry.status === 'DRY_RUN';
    const isEmergency = entry.status === 'EMERGENCY_CLOSED';
    const pnl = entry.pnlPercent;
    const isWin = pnl !== null && pnl > 0;

    // Trade Decision Replay: Find correlated signal events within ±5s
    const [decisionChain, setDecisionChain] = useState<SignalEvent[]>([]);

    useEffect(() => {
        if (expanded) {
            const stream = getSignalStream();
            const allEvents = stream.getEvents();
            const window = 5000; // ±5 seconds
            const correlated = allEvents.filter(e =>
                e.slotId === entry.slotId &&
                Math.abs(e.timestamp - entry.openTime) <= window,
            );
            setDecisionChain(correlated);
        }
    }, [expanded, entry.slotId, entry.openTime]);

    return (
        <div className={`tj-history-row ${isDryRun ? 'tj-dry-run' : isEmergency ? 'tj-emergency' : ''}`}>
            <div className="tj-history-main" onClick={onToggle} role="button" tabIndex={0}>
                <span className="tj-history-time">
                    {new Date(entry.openTime).toLocaleTimeString('en-US', { hour12: false })}
                </span>
                <span className={`tj-direction-badge tj-small ${isLong ? 'tj-badge-long' : 'tj-badge-short'}`}>
                    {entry.direction}
                </span>
                <span className="tj-history-pair">{entry.pair}</span>
                <span className="tj-history-entry">${formatPrice(entry.entryPrice)}</span>
                {entry.exitPrice !== null && (
                    <span className="tj-history-arrow">→</span>
                )}
                {entry.exitPrice !== null && (
                    <span className="tj-history-exit">${formatPrice(entry.exitPrice)}</span>
                )}
                <span className={`tj-history-pnl ${isDryRun ? 'tj-dry' : isWin ? 'tj-win' : 'tj-loss'}`}>
                    {isDryRun ? '🔸 DRY' : isEmergency ? '🚨 EMRG' : formatPnl(pnl)}
                </span>
                <span className="tj-history-duration">
                    {entry.durationMs ? formatDuration(entry.durationMs) : '—'}
                </span>
                <span className="tj-history-expand">
                    {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </span>
            </div>

            {/* Trade Decision Replay (Radical Innovation) */}
            {expanded && (
                <div className="tj-decision-replay">
                    <div className="tj-replay-title">🔍 Decision Chain</div>
                    {decisionChain.length === 0 ? (
                        <div className="tj-replay-empty">No correlated signals found</div>
                    ) : (
                        <div className="tj-replay-events">
                            {decisionChain.map(event => (
                                <div key={event.id} className={`tj-replay-event tj-replay-${event.type.toLowerCase()}`}>
                                    <span className="tj-replay-time">
                                        {new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                                    </span>
                                    <span className="tj-replay-msg">{event.message}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="tj-replay-meta">
                        <span>Strategy: {entry.strategyName}</span>
                        <span>Confidence: {(entry.confidence * 100).toFixed(0)}%</span>
                        {entry.exitReason && <span>Exit: {entry.exitReason}</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Execution Summary ──────────────────────────────────────

function ExecutionSummary({ summary }: {
    summary: {
        totalTrades: number;
        winCount: number;
        lossCount: number;
        winRate: number;
        avgPnl: number;
        totalPnl: number;
        maxWin: number;
        maxLoss: number;
        openCount: number;
    };
}) {
    return (
        <div className="tj-summary">
            <div className="tj-summary-stat">
                <span className="tj-summary-label">Trades</span>
                <span className="tj-summary-value">{summary.totalTrades}</span>
            </div>
            <div className="tj-summary-stat">
                <span className="tj-summary-label">Win Rate</span>
                <span className={`tj-summary-value ${summary.winRate >= 50 ? 'tj-win' : 'tj-loss'}`}>
                    {summary.winRate}%
                </span>
            </div>
            <div className="tj-summary-stat">
                <span className="tj-summary-label">Total P&L</span>
                <span className={`tj-summary-value ${summary.totalPnl >= 0 ? 'tj-win' : 'tj-loss'}`}>
                    {summary.totalPnl >= 0 ? '+' : ''}{summary.totalPnl.toFixed(2)}%
                </span>
            </div>
            <div className="tj-summary-stat">
                <span className="tj-summary-label">Open</span>
                <span className="tj-summary-value tj-open-count">{summary.openCount}</span>
            </div>
            <div className="tj-summary-stat">
                <span className="tj-summary-label">Best</span>
                <span className="tj-summary-value tj-win">
                    {summary.maxWin > 0 ? `+${summary.maxWin.toFixed(2)}%` : '—'}
                </span>
            </div>
            <div className="tj-summary-stat">
                <span className="tj-summary-label">Worst</span>
                <span className="tj-summary-value tj-loss">
                    {summary.maxLoss < 0 ? `${summary.maxLoss.toFixed(2)}%` : '—'}
                </span>
            </div>
        </div>
    );
}

// ─── Main Panel ─────────────────────────────────────────────

export function LiveTradeJournalPanel() {
    const [openPositions, setOpenPositions] = useState<TradeJournalEntry[]>([]);
    const [closedTrades, setClosedTrades] = useState<TradeJournalEntry[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [, setTick] = useState(0);

    // Subscribe to trade observer
    useEffect(() => {
        const observer = getTradeObserver();

        const refresh = () => {
            setOpenPositions(observer.getOpenPositions());
            setClosedTrades(observer.getClosedTrades());
            setTick(t => t + 1);
        };

        // Initial load
        refresh();

        // Subscribe for updates
        const unsub = observer.subscribe(refresh);
        return unsub;
    }, []);

    const summary = useMemo(() => {
        return getTradeObserver().getSummary();
    }, [openPositions, closedTrades]);

    const handleToggle = useCallback((id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    }, []);

    const hasActivity = openPositions.length > 0 || closedTrades.length > 0;

    return (
        <section
            id="trade-journal"
            className="glass-card glass-card-accent accent-cyan col-12 stagger-in stagger-7"
        >
            <div className="card-header">
                <div className="card-title">
                    <BarChart2 size={18} style={{ color: 'var(--info)' }} />
                    <span>Live Trade Journal</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {openPositions.length > 0 && (
                        <span className="card-badge badge-success tj-pulse">
                            {openPositions.length} Open
                        </span>
                    )}
                    <span className="card-badge badge-primary">
                        {closedTrades.length} Trades
                    </span>
                </div>
            </div>

            <div className="card-body">
                {/* Execution Summary */}
                {hasActivity && <ExecutionSummary summary={summary} />}

                {/* Open Positions */}
                {openPositions.length > 0 && (
                    <div className="tj-section">
                        <div className="tj-section-title">
                            <Activity size={12} />
                            <span>Open Positions</span>
                        </div>
                        <div className="tj-positions-grid">
                            {openPositions.map(pos => (
                                <OpenPositionCard key={pos.id} entry={pos} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Trade History */}
                {closedTrades.length > 0 && (
                    <div className="tj-section">
                        <div className="tj-section-title">
                            <Clock size={12} />
                            <span>Trade History</span>
                        </div>
                        <div className="tj-history-list">
                            {closedTrades.slice(0, 20).map(trade => (
                                <TradeHistoryRow
                                    key={trade.id}
                                    entry={trade}
                                    expanded={expandedId === trade.id}
                                    onToggle={() => handleToggle(trade.id)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!hasActivity && (
                    <div className="tj-empty">
                        <AlertTriangle size={20} style={{ opacity: 0.3 }} />
                        <span>No trades yet — start a session to begin trading</span>
                    </div>
                )}
            </div>
        </section>
    );
}
