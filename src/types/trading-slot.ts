// ============================================================
// Learner: Trading Slot — Pair+Timeframe Identifier
// ============================================================
// A TradingSlot is the fundamental unit of the Island Model.
// Each slot = one pair + one timeframe = one isolated evolution.
// ============================================================

import { Timeframe } from './index';

// ─── Trading Slot ────────────────────────────────────────────

export interface TradingSlot {
    id: string;            // e.g. "BTCUSDT:1h"
    pair: string;          // e.g. "BTCUSDT"
    timeframe: Timeframe;  // e.g. Timeframe.H1
    status: TradingSlotStatus;
    createdAt: number;
}

export enum TradingSlotStatus {
    IDLE = 'IDLE',           // Created but not started
    SEEDING = 'SEEDING',     // Initial population being created
    ACTIVE = 'ACTIVE',       // Actively evolving and trading
    PAUSED = 'PAUSED',       // Temporarily paused
    RETIRED = 'RETIRED',     // Permanently stopped
}

// ─── Factory ─────────────────────────────────────────────────

/**
 * Create a TradingSlot from pair and timeframe.
 * The ID format is "PAIR:TIMEFRAME" (e.g., "BTCUSDT:1h").
 */
export function createTradingSlot(pair: string, timeframe: Timeframe): TradingSlot {
    return {
        id: `${pair}:${timeframe}`,
        pair,
        timeframe,
        status: TradingSlotStatus.IDLE,
        createdAt: Date.now(),
    };
}

/**
 * Parse a slot ID back into pair and timeframe.
 */
export function parseSlotId(slotId: string): { pair: string; timeframe: Timeframe } {
    const [pair, tf] = slotId.split(':');
    return { pair, timeframe: tf as Timeframe };
}

// ─── Default Slots ───────────────────────────────────────────

/**
 * Default pairs and timeframes for the Island Model.
 * Not all combinations will be active simultaneously —
 * the Cortex selects which slots to activate based on user config.
 */
export const DEFAULT_PAIRS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT',
    'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
] as const;

export const DEFAULT_TIMEFRAMES = [
    Timeframe.M15, Timeframe.H1, Timeframe.H4,
] as const;

/**
 * Generate all possible trading slots from pairs × timeframes.
 */
export function generateAllSlots(
    pairs: readonly string[] = DEFAULT_PAIRS,
    timeframes: readonly Timeframe[] = DEFAULT_TIMEFRAMES
): TradingSlot[] {
    const slots: TradingSlot[] = [];
    for (const pair of pairs) {
        for (const tf of timeframes) {
            slots.push(createTradingSlot(pair, tf));
        }
    }
    return slots;
}

/**
 * Generate a starter set of trading slots (recommended initial).
 * Starts with top pairs on the most common timeframes.
 */
export function generateStarterSlots(): TradingSlot[] {
    return [
        createTradingSlot('BTCUSDT', Timeframe.H1),
        createTradingSlot('ETHUSDT', Timeframe.H1),
        createTradingSlot('BTCUSDT', Timeframe.M15),
        createTradingSlot('ETHUSDT', Timeframe.M15),
        createTradingSlot('SOLUSDT', Timeframe.H1),
    ];
}
