// ============================================================
// Learner: Session Signal Stream — Observable AI Decisions
// ============================================================
// Phase 40 RADICAL INNOVATION: Transforms live trading sessions
// from a black box into a glass box.
//
// On every candle close, the LiveTradeExecutor evaluates the
// champion strategy's signal. This module captures WHY each
// decision was made (or NOT made) and exposes it as a
// real-time stream for the dashboard.
//
// Decision Stream Events:
//   SIGNAL_EVALUATED → Signal was evaluated (LONG/SHORT/HOLD)
//   TRADE_EXECUTED   → Order was placed
//   TRADE_SKIPPED    → Signal was filtered (cooldown, maxPos, low confidence)
//   EXIT_TRIGGERED   → Position closed by exit signal
//   ERROR_OCCURRED   → Execution error
//
// This creates OBSERVABLE INTELLIGENCE — the user sees exactly
// what the AI brain is thinking on every market tick.
// ============================================================

import { createLogger } from '@/lib/utils/logger';

const seiLog = createLogger('SignalStream');

// ─── Types ──────────────────────────────────────────────────

export type SignalEventType =
    | 'SIGNAL_EVALUATED'
    | 'TRADE_EXECUTED'
    | 'TRADE_SKIPPED'
    | 'EXIT_TRIGGERED'
    | 'ERROR_OCCURRED';

export type SkipReason =
    | 'NO_CHAMPION'
    | 'HOLD_SIGNAL'
    | 'LOW_CONFIDENCE'
    | 'MAX_POSITIONS'
    | 'ALREADY_POSITIONED'
    | 'COOLDOWN_ACTIVE'
    | 'DRY_RUN'
    | 'EXECUTION_ERROR';

export interface SignalEvent {
    id: string;
    timestamp: number;
    type: SignalEventType;
    slotId: string;
    pair: string;

    // Signal details
    signalAction: string | null; // LONG, SHORT, HOLD, EXIT_LONG, EXIT_SHORT
    confidence: number | null;
    strategyName: string | null;

    // Decision metadata
    skipReason: SkipReason | null;
    executedDirection: string | null; // LONG or SHORT if executed
    executedQuantity: number | null;
    executedLeverage: number | null;

    // Context
    currentPrice: number | null;
    message: string;
}

// ─── Session Signal Stream ──────────────────────────────────

const MAX_EVENTS = 50;
let eventCounter = 0;

class SessionSignalStream {
    private events: SignalEvent[] = [];
    private listeners: Set<(events: SignalEvent[]) => void> = new Set();

    // ─── Record Events ──────────────────────────────────

    recordEvaluation(
        slotId: string,
        signalAction: string,
        confidence: number,
        strategyName: string,
        currentPrice: number,
    ): void {
        this.push({
            type: 'SIGNAL_EVALUATED',
            slotId,
            signalAction,
            confidence,
            strategyName,
            currentPrice,
            message: `${strategyName} → ${signalAction} (${(confidence * 100).toFixed(0)}% conf) @ $${currentPrice.toFixed(2)}`,
        });
    }

    recordExecution(
        slotId: string,
        direction: string,
        quantity: number,
        leverage: number,
        strategyName: string,
        currentPrice: number,
        confidence: number,
    ): void {
        this.push({
            type: 'TRADE_EXECUTED',
            slotId,
            signalAction: direction,
            confidence,
            strategyName,
            executedDirection: direction,
            executedQuantity: quantity,
            executedLeverage: leverage,
            currentPrice,
            message: `🔥 ${direction} ${slotId.split(':')[0]} | Qty: ${quantity} | Lev: ${leverage}x | ${strategyName}`,
        });
    }

    recordSkip(
        slotId: string,
        reason: SkipReason,
        strategyName: string | null,
        signalAction: string | null,
        confidence: number | null,
    ): void {
        const reasonLabels: Record<SkipReason, string> = {
            NO_CHAMPION: 'No champion strategy',
            HOLD_SIGNAL: 'Hold signal — no entry/exit',
            LOW_CONFIDENCE: `Confidence ${confidence !== null ? `(${(confidence * 100).toFixed(0)}%)` : ''} below threshold`,
            MAX_POSITIONS: 'Max concurrent positions reached',
            ALREADY_POSITIONED: 'Already positioned for this slot',
            COOLDOWN_ACTIVE: 'Post-trade cooldown active',
            DRY_RUN: 'Dry run mode — signal logged only',
            EXECUTION_ERROR: 'Execution error occurred',
        };

        this.push({
            type: 'TRADE_SKIPPED',
            slotId,
            skipReason: reason,
            signalAction,
            confidence,
            strategyName,
            currentPrice: null,
            message: `⏭ Skip: ${reasonLabels[reason]} | ${slotId}`,
        });
    }

    recordExit(
        slotId: string,
        strategyName: string,
        exitReason: string,
    ): void {
        this.push({
            type: 'EXIT_TRIGGERED',
            slotId,
            signalAction: 'EXIT',
            confidence: null,
            strategyName,
            currentPrice: null,
            message: `📤 Exit: ${slotId.split(':')[0]} — ${exitReason}`,
        });
    }

    recordError(slotId: string, error: string): void {
        this.push({
            type: 'ERROR_OCCURRED',
            slotId,
            signalAction: null,
            confidence: null,
            strategyName: null,
            currentPrice: null,
            message: `❌ Error: ${slotId} — ${error}`,
        });
    }

    // ─── Query ──────────────────────────────────────────

    getEvents(): SignalEvent[] {
        return [...this.events];
    }

    getLatestEvents(count: number): SignalEvent[] {
        return this.events.slice(-count);
    }

    getStats(): {
        total: number;
        executed: number;
        skipped: number;
        exits: number;
        errors: number;
        executionRate: number;
    } {
        const executed = this.events.filter(e => e.type === 'TRADE_EXECUTED').length;
        const skipped = this.events.filter(e => e.type === 'TRADE_SKIPPED').length;
        const exits = this.events.filter(e => e.type === 'EXIT_TRIGGERED').length;
        const errors = this.events.filter(e => e.type === 'ERROR_OCCURRED').length;
        const total = this.events.length;
        const executionRate = (executed + skipped) > 0
            ? Math.round((executed / (executed + skipped)) * 100)
            : 0;

        return { total, executed, skipped, exits, errors, executionRate };
    }

    clear(): void {
        this.events = [];
        this.notify();
    }

    // ─── Subscription ───────────────────────────────────

    subscribe(listener: (events: SignalEvent[]) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    // ─── Internal ───────────────────────────────────────

    private push(partial: Omit<SignalEvent, 'id' | 'timestamp' | 'pair' | 'executedDirection' | 'executedQuantity' | 'executedLeverage' | 'skipReason'> & Partial<SignalEvent>): void {
        const event: SignalEvent = {
            id: `sei_${++eventCounter}_${Date.now()}`,
            timestamp: Date.now(),
            pair: partial.slotId.split(':')[0],
            executedDirection: null,
            executedQuantity: null,
            executedLeverage: null,
            skipReason: null,
            ...partial,
        };

        this.events.push(event);

        // Cap at MAX_EVENTS
        if (this.events.length > MAX_EVENTS) {
            this.events = this.events.slice(-MAX_EVENTS);
        }

        seiLog.debug(event.message);
        this.notify();
    }

    private notify(): void {
        const snapshot = this.getEvents();
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            } catch {
                // Non-critical
            }
        }
    }
}

// ─── Singleton ──────────────────────────────────────────────

let streamInstance: SessionSignalStream | null = null;

export function getSignalStream(): SessionSignalStream {
    if (!streamInstance) {
        streamInstance = new SessionSignalStream();
    }
    return streamInstance;
}
