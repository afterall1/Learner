// ============================================================
// Learner: Trade Lifecycle Observer — Position State Tracker
// ============================================================
// Phase 42: Real-time position & trade lifecycle tracking.
//
// Captures ALL trade lifecycle events from LiveTradeExecutor
// and surfaces them as a reactive stream for the dashboard.
//
// Events:
//   POSITION_OPENED    → New position entered (AOLE success)
//   POSITION_CLOSED    → Position exited (signal or SL/TP hit)
//   POSITION_EMERGENCY → Emergency close (SL failure, circuit breaker)
//   DRY_RUN_SIGNAL     → Would-have-traded signal in dry run mode
//
// The panel subscribes via getTradeObserver().subscribe() and
// renders open positions + trade history in real-time.
// ============================================================

import { createLogger } from '@/lib/utils/logger';

const tloLog = createLogger('TradeObserver');

// ─── Types ──────────────────────────────────────────────────

export type TradeLifecycleEventType =
    | 'POSITION_OPENED'
    | 'POSITION_CLOSED'
    | 'POSITION_EMERGENCY'
    | 'DRY_RUN_SIGNAL';

export type JournalEntryStatus = 'OPEN' | 'CLOSED' | 'EMERGENCY_CLOSED' | 'DRY_RUN';

export interface TradeJournalEntry {
    /** Unique identifier */
    id: string;
    /** When the event occurred */
    timestamp: number;

    /** Trading slot ID (e.g., "BTCUSDT:1h") */
    slotId: string;
    /** Trading pair (e.g., "BTCUSDT") */
    pair: string;
    /** Trade direction */
    direction: 'LONG' | 'SHORT';
    /** Current status */
    status: JournalEntryStatus;

    /** Strategy that generated the signal */
    strategyName: string;
    /** Strategy ID */
    strategyId: string;
    /** Signal confidence (0-1) */
    confidence: number;

    /** Entry price */
    entryPrice: number;
    /** Exit price (null if still open) */
    exitPrice: number | null;
    /** Position quantity */
    quantity: number;
    /** Leverage used */
    leverage: number;

    /** Stop-loss price */
    slPrice: number;
    /** Take-profit price */
    tpPrice: number;

    /** Realized P&L in percent (null if open) */
    pnlPercent: number | null;
    /** Realized P&L in USD (null if open) */
    pnlUSD: number | null;

    /** When the position was opened */
    openTime: number;
    /** When the position was closed (null if open) */
    closeTime: number | null;
    /** Duration in milliseconds (null if open) */
    durationMs: number | null;

    /** Exit reason (null if open) */
    exitReason: string | null;
    /** AOLE Order group ID for correlation */
    orderGroupId: string;
    /** Whether this is a testnet/paper trade */
    isPaper: boolean;
}

// ─── Trade Lifecycle Observer ───────────────────────────────

const MAX_CLOSED_TRADES = 100;
let journalCounter = 0;

export class TradeLifecycleObserver {
    private openPositions = new Map<string, TradeJournalEntry>(); // slotId → entry
    private closedTrades: TradeJournalEntry[] = [];
    private listeners = new Set<() => void>();

    // ─── Record Events ──────────────────────────────────

    recordOpen(params: {
        slotId: string;
        direction: 'LONG' | 'SHORT';
        strategyName: string;
        strategyId: string;
        confidence: number;
        entryPrice: number;
        quantity: number;
        leverage: number;
        slPrice: number;
        tpPrice: number;
        orderGroupId: string;
        isPaper: boolean;
    }): void {
        const entry: TradeJournalEntry = {
            id: `tj_${++journalCounter}_${Date.now()}`,
            timestamp: Date.now(),
            slotId: params.slotId,
            pair: params.slotId.split(':')[0],
            direction: params.direction,
            status: 'OPEN',
            strategyName: params.strategyName,
            strategyId: params.strategyId,
            confidence: params.confidence,
            entryPrice: params.entryPrice,
            exitPrice: null,
            quantity: params.quantity,
            leverage: params.leverage,
            slPrice: params.slPrice,
            tpPrice: params.tpPrice,
            pnlPercent: null,
            pnlUSD: null,
            openTime: Date.now(),
            closeTime: null,
            durationMs: null,
            exitReason: null,
            orderGroupId: params.orderGroupId,
            isPaper: params.isPaper,
        };

        this.openPositions.set(params.slotId, entry);

        tloLog.info(`📈 POSITION OPENED: ${entry.direction} ${entry.pair}`, {
            entry: entry.entryPrice,
            qty: entry.quantity,
            leverage: `${entry.leverage}x`,
            strategy: entry.strategyName,
            sl: entry.slPrice,
            tp: entry.tpPrice,
        });

        this.notify();
    }

    recordClose(slotId: string, exitPrice: number, exitReason: string): void {
        const position = this.openPositions.get(slotId);
        if (!position) {
            tloLog.warn(`Close event for unknown position: ${slotId}`);
            return;
        }

        const now = Date.now();
        const durationMs = now - position.openTime;

        // Calculate P&L
        const priceDiff = position.direction === 'LONG'
            ? exitPrice - position.entryPrice
            : position.entryPrice - exitPrice;
        const pnlPercent = (priceDiff / position.entryPrice) * 100 * position.leverage;
        const pnlUSD = priceDiff * position.quantity;

        const closedEntry: TradeJournalEntry = {
            ...position,
            status: 'CLOSED',
            exitPrice,
            pnlPercent: Math.round(pnlPercent * 100) / 100,
            pnlUSD: Math.round(pnlUSD * 100) / 100,
            closeTime: now,
            durationMs,
            exitReason,
        };

        this.openPositions.delete(slotId);
        this.closedTrades.unshift(closedEntry); // Newest first

        // Cap closed trades
        if (this.closedTrades.length > MAX_CLOSED_TRADES) {
            this.closedTrades = this.closedTrades.slice(0, MAX_CLOSED_TRADES);
        }

        const pnlStr = pnlPercent >= 0
            ? `+${pnlPercent.toFixed(2)}%`
            : `${pnlPercent.toFixed(2)}%`;

        tloLog.info(`📉 POSITION CLOSED: ${closedEntry.pair} ${pnlStr}`, {
            direction: closedEntry.direction,
            entry: closedEntry.entryPrice,
            exit: exitPrice,
            pnl: pnlStr,
            duration: `${Math.round(durationMs / 1000)}s`,
            reason: exitReason,
        });

        this.notify();
    }

    recordEmergency(slotId: string, reason: string): void {
        const position = this.openPositions.get(slotId);
        if (!position) return;

        const now = Date.now();
        const closedEntry: TradeJournalEntry = {
            ...position,
            status: 'EMERGENCY_CLOSED',
            exitPrice: position.entryPrice, // Unknown actual exit
            pnlPercent: null,
            pnlUSD: null,
            closeTime: now,
            durationMs: now - position.openTime,
            exitReason: `EMERGENCY: ${reason}`,
        };

        this.openPositions.delete(slotId);
        this.closedTrades.unshift(closedEntry);

        if (this.closedTrades.length > MAX_CLOSED_TRADES) {
            this.closedTrades = this.closedTrades.slice(0, MAX_CLOSED_TRADES);
        }

        tloLog.warn(`🚨 EMERGENCY CLOSE: ${closedEntry.pair} — ${reason}`);
        this.notify();
    }

    recordDryRunSignal(params: {
        slotId: string;
        direction: 'LONG' | 'SHORT';
        strategyName: string;
        confidence: number;
        price: number;
    }): void {
        const entry: TradeJournalEntry = {
            id: `tj_dry_${++journalCounter}_${Date.now()}`,
            timestamp: Date.now(),
            slotId: params.slotId,
            pair: params.slotId.split(':')[0],
            direction: params.direction,
            status: 'DRY_RUN',
            strategyName: params.strategyName,
            strategyId: '',
            confidence: params.confidence,
            entryPrice: params.price,
            exitPrice: null,
            quantity: 0,
            leverage: 0,
            slPrice: 0,
            tpPrice: 0,
            pnlPercent: null,
            pnlUSD: null,
            openTime: Date.now(),
            closeTime: Date.now(),
            durationMs: 0,
            exitReason: 'DRY_RUN',
            orderGroupId: '',
            isPaper: true,
        };

        this.closedTrades.unshift(entry);

        if (this.closedTrades.length > MAX_CLOSED_TRADES) {
            this.closedTrades = this.closedTrades.slice(0, MAX_CLOSED_TRADES);
        }

        tloLog.info(`🔸 DRY RUN: Would ${params.direction} ${entry.pair} @ $${params.price.toFixed(2)}`);
        this.notify();
    }

    // ─── Query ──────────────────────────────────────────

    getOpenPositions(): TradeJournalEntry[] {
        return [...this.openPositions.values()];
    }

    getClosedTrades(): TradeJournalEntry[] {
        return [...this.closedTrades];
    }

    getOpenCount(): number {
        return this.openPositions.size;
    }

    getSummary(): {
        totalTrades: number;
        winCount: number;
        lossCount: number;
        winRate: number;
        avgPnl: number;
        totalPnl: number;
        maxWin: number;
        maxLoss: number;
        openCount: number;
    } {
        const closed = this.closedTrades.filter(t => t.status === 'CLOSED');
        const pnls = closed.map(t => t.pnlPercent ?? 0);
        const wins = pnls.filter(p => p > 0);
        const losses = pnls.filter(p => p < 0);
        const totalPnl = pnls.reduce((s, p) => s + p, 0);

        return {
            totalTrades: closed.length,
            winCount: wins.length,
            lossCount: losses.length,
            winRate: closed.length > 0
                ? Math.round((wins.length / closed.length) * 100)
                : 0,
            avgPnl: closed.length > 0
                ? Math.round((totalPnl / closed.length) * 100) / 100
                : 0,
            totalPnl: Math.round(totalPnl * 100) / 100,
            maxWin: pnls.length > 0 ? Math.max(...pnls) : 0,
            maxLoss: pnls.length > 0 ? Math.min(...pnls) : 0,
            openCount: this.openPositions.size,
        };
    }

    // ─── Subscription ───────────────────────────────────

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    // ─── Internal ───────────────────────────────────────

    private notify(): void {
        for (const listener of this.listeners) {
            try {
                listener();
            } catch {
                // Non-critical — UI subscription error
            }
        }
    }
}

// ─── Singleton ──────────────────────────────────────────────

let observerInstance: TradeLifecycleObserver | null = null;

export function getTradeObserver(): TradeLifecycleObserver {
    if (!observerInstance) {
        observerInstance = new TradeLifecycleObserver();
    }
    return observerInstance;
}
