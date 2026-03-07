// ============================================================
// Learner: IndexedDB Persistence Layer — Zero Data Loss
// ============================================================
// Phase 13: Provides durable, unlimited-capacity storage for all
// trading data. Replaces localStorage (5MB limit) with IndexedDB
// (250MB+ capacity). Ensures trades, strategies, evolution
// history, and forensic reports survive page refreshes.
//
// Council: Kyle Simpson (async storage), Tom Preston-Werner
//          (schema), Rich Harris (hydration), López de Prado
//          (data integrity), Kent C. Dodds (React state)
// ============================================================

import { openDB, type IDBPDatabase } from 'idb';
import type {
    Trade,
    StrategyDNA,
    TradeForensicReport,
    TradeLesson,
    PerformanceMetrics,
    MarketRegime,
} from '@/types';

// ─── Schema Version & Store Names ────────────────────────────

const DB_NAME = 'learner-trading-db';
const DB_VERSION = 1;

const STORES = {
    TRADES: 'trades',
    STRATEGIES: 'strategies',
    EVOLUTION_SNAPSHOTS: 'evolution_snapshots',
    FORENSIC_REPORTS: 'forensic_reports',
    PORTFOLIO_SNAPSHOTS: 'portfolio_snapshots',
    ENGINE_STATE: 'engine_state',
} as const;

// ─── Types ───────────────────────────────────────────────────

export interface EvolutionSnapshot {
    id: string;
    generationNumber: number;
    timestamp: number;
    bestFitnessScore: number;
    averageFitnessScore: number;
    populationSize: number;
    mutationRate: number;
    bestStrategyId: string | null;
    bestStrategyName: string | null;
    slotId: string;
}

export interface PortfolioSnapshot {
    id: string;
    timestamp: number;
    totalBalance: number;
    unrealizedPnl: number;
    totalTrades: number;
    activePositions: number;
    allTimePnl: number;
    allTimePnlPercent: number;
}

export interface EngineCheckpoint {
    id: string;                                  // Always 'latest'
    timestamp: number;
    version: number;                             // Schema versioning for forward compat
    cortexConfig: {
        totalCapital: number;
        slots: Array<{
            id: string;
            pair: string;
            timeframe: string;
            status: string;
        }>;
    };
    islandStates: Array<{
        slotId: string;
        activeStrategyId: string | null;
        currentGeneration: number;
        totalTrades: number;
        currentRegime: MarketRegime | null;
        bestFitnessAllTime: number;
    }>;
    forensicLearningBeliefs: Array<{
        id: string;
        regime: MarketRegime;
        lessonType: string;
        sampleCount: number;
        avgSeverity: number;
        avgConfidence: number;
        weight: number;
    }>;
    lastTradeId: string | null;
}

// ─── Database Initialization ─────────────────────────────────

let dbInstance: IDBPDatabase | null = null;

/**
 * Initialize the IndexedDB database.
 * Creates all object stores and indexes on first run.
 * Idempotent — safe to call multiple times.
 */
export async function initDB(): Promise<IDBPDatabase> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            // ── Trades Store ──
            if (!db.objectStoreNames.contains(STORES.TRADES)) {
                const tradeStore = db.createObjectStore(STORES.TRADES, { keyPath: 'id' });
                tradeStore.createIndex('by_strategy', 'strategyId');
                tradeStore.createIndex('by_timestamp', 'entryTime');
                tradeStore.createIndex('by_symbol', 'symbol');
                tradeStore.createIndex('by_status', 'status');
            }

            // ── Strategies Store ──
            if (!db.objectStoreNames.contains(STORES.STRATEGIES)) {
                const stratStore = db.createObjectStore(STORES.STRATEGIES, { keyPath: 'id' });
                stratStore.createIndex('by_generation', 'generation');
                stratStore.createIndex('by_status', 'status');
                stratStore.createIndex('by_slot', 'slotId');
                stratStore.createIndex('by_fitness', 'metadata.fitnessScore');
            }

            // ── Evolution Snapshots Store ──
            if (!db.objectStoreNames.contains(STORES.EVOLUTION_SNAPSHOTS)) {
                const evoStore = db.createObjectStore(STORES.EVOLUTION_SNAPSHOTS, { keyPath: 'id' });
                evoStore.createIndex('by_generation', 'generationNumber');
                evoStore.createIndex('by_slot', 'slotId');
                evoStore.createIndex('by_timestamp', 'timestamp');
            }

            // ── Forensic Reports Store ──
            if (!db.objectStoreNames.contains(STORES.FORENSIC_REPORTS)) {
                const forStore = db.createObjectStore(STORES.FORENSIC_REPORTS, { keyPath: 'tradeId' });
                forStore.createIndex('by_strategy', 'strategyId');
                forStore.createIndex('by_regime', 'entryRegime');
                forStore.createIndex('by_timestamp', 'entryTime');
            }

            // ── Portfolio Snapshots Store ──
            if (!db.objectStoreNames.contains(STORES.PORTFOLIO_SNAPSHOTS)) {
                const portStore = db.createObjectStore(STORES.PORTFOLIO_SNAPSHOTS, { keyPath: 'id' });
                portStore.createIndex('by_timestamp', 'timestamp');
            }

            // ── Engine State Store ──
            if (!db.objectStoreNames.contains(STORES.ENGINE_STATE)) {
                db.createObjectStore(STORES.ENGINE_STATE, { keyPath: 'id' });
            }
        },
    });

    return dbInstance;
}

/**
 * Get DB instance, initializing if needed.
 */
async function getDB(): Promise<IDBPDatabase> {
    if (!dbInstance) {
        return initDB();
    }
    return dbInstance;
}

// ─── Trade Operations ────────────────────────────────────────

/**
 * Save a single trade to IndexedDB.
 */
export async function saveTrade(trade: Trade): Promise<void> {
    try {
        const db = await getDB();
        await db.put(STORES.TRADES, trade);
    } catch (error) {
        console.error('[Persistence] Failed to save trade:', error);
    }
}

/**
 * Save multiple trades in a single transaction.
 */
export async function saveTrades(trades: Trade[]): Promise<void> {
    if (trades.length === 0) return;
    try {
        const db = await getDB();
        const tx = db.transaction(STORES.TRADES, 'readwrite');
        const store = tx.objectStore(STORES.TRADES);
        for (const trade of trades) {
            store.put(trade);
        }
        await tx.done;
    } catch (error) {
        console.error('[Persistence] Failed to save trades batch:', error);
    }
}

/**
 * Load all trades, sorted by entry time.
 */
export async function loadAllTrades(): Promise<Trade[]> {
    try {
        const db = await getDB();
        return await db.getAllFromIndex(STORES.TRADES, 'by_timestamp');
    } catch (error) {
        console.error('[Persistence] Failed to load trades:', error);
        return [];
    }
}

/**
 * Load trades for a specific strategy.
 */
export async function loadTradesByStrategy(strategyId: string): Promise<Trade[]> {
    try {
        const db = await getDB();
        return await db.getAllFromIndex(STORES.TRADES, 'by_strategy', strategyId);
    } catch (error) {
        console.error('[Persistence] Failed to load strategy trades:', error);
        return [];
    }
}

/**
 * Load most recent N trades.
 */
export async function loadRecentTrades(count: number = 50): Promise<Trade[]> {
    try {
        const db = await getDB();
        const all = await db.getAllFromIndex(STORES.TRADES, 'by_timestamp');
        return all.slice(-count);
    } catch (error) {
        console.error('[Persistence] Failed to load recent trades:', error);
        return [];
    }
}

/**
 * Get total trade count without loading all data.
 */
export async function getTradeCount(): Promise<number> {
    try {
        const db = await getDB();
        return await db.count(STORES.TRADES);
    } catch (error) {
        console.error('[Persistence] Failed to count trades:', error);
        return 0;
    }
}

// ─── Strategy Operations ─────────────────────────────────────

/**
 * Save a strategy DNA to IndexedDB.
 */
export async function saveStrategy(strategy: StrategyDNA): Promise<void> {
    try {
        const db = await getDB();
        await db.put(STORES.STRATEGIES, strategy);
    } catch (error) {
        console.error('[Persistence] Failed to save strategy:', error);
    }
}

/**
 * Save multiple strategies in a single transaction.
 */
export async function saveStrategies(strategies: StrategyDNA[]): Promise<void> {
    if (strategies.length === 0) return;
    try {
        const db = await getDB();
        const tx = db.transaction(STORES.STRATEGIES, 'readwrite');
        const store = tx.objectStore(STORES.STRATEGIES);
        for (const strat of strategies) {
            store.put(strat);
        }
        await tx.done;
    } catch (error) {
        console.error('[Persistence] Failed to save strategies batch:', error);
    }
}

/**
 * Load all strategies for a slot.
 */
export async function loadStrategiesBySlot(slotId: string): Promise<StrategyDNA[]> {
    try {
        const db = await getDB();
        return await db.getAllFromIndex(STORES.STRATEGIES, 'by_slot', slotId);
    } catch (error) {
        console.error('[Persistence] Failed to load slot strategies:', error);
        return [];
    }
}

/**
 * Load strategies by status.
 */
export async function loadStrategiesByStatus(status: string): Promise<StrategyDNA[]> {
    try {
        const db = await getDB();
        return await db.getAllFromIndex(STORES.STRATEGIES, 'by_status', status);
    } catch (error) {
        console.error('[Persistence] Failed to load strategies by status:', error);
        return [];
    }
}

// ─── Evolution Snapshot Operations ───────────────────────────

/**
 * Save an evolution generation snapshot.
 */
export async function saveEvolutionSnapshot(snapshot: EvolutionSnapshot): Promise<void> {
    try {
        const db = await getDB();
        await db.put(STORES.EVOLUTION_SNAPSHOTS, snapshot);
    } catch (error) {
        console.error('[Persistence] Failed to save evolution snapshot:', error);
    }
}

/**
 * Load all evolution snapshots for a slot, sorted by generation.
 */
export async function loadEvolutionSnapshots(slotId: string): Promise<EvolutionSnapshot[]> {
    try {
        const db = await getDB();
        const all = await db.getAllFromIndex(STORES.EVOLUTION_SNAPSHOTS, 'by_slot', slotId);
        return all.sort((a, b) => a.generationNumber - b.generationNumber);
    } catch (error) {
        console.error('[Persistence] Failed to load evolution snapshots:', error);
        return [];
    }
}

// ─── Forensic Report Operations ──────────────────────────────

/**
 * Save a forensic report.
 */
export async function saveForensicReport(report: TradeForensicReport): Promise<void> {
    try {
        const db = await getDB();
        await db.put(STORES.FORENSIC_REPORTS, report);
    } catch (error) {
        console.error('[Persistence] Failed to save forensic report:', error);
    }
}

/**
 * Load forensic reports for a strategy.
 */
export async function loadForensicReportsByStrategy(strategyId: string): Promise<TradeForensicReport[]> {
    try {
        const db = await getDB();
        return await db.getAllFromIndex(STORES.FORENSIC_REPORTS, 'by_strategy', strategyId);
    } catch (error) {
        console.error('[Persistence] Failed to load forensic reports:', error);
        return [];
    }
}

/**
 * Load forensic reports by regime.
 */
export async function loadForensicReportsByRegime(regime: MarketRegime): Promise<TradeForensicReport[]> {
    try {
        const db = await getDB();
        return await db.getAllFromIndex(STORES.FORENSIC_REPORTS, 'by_regime', regime);
    } catch (error) {
        console.error('[Persistence] Failed to load forensic reports by regime:', error);
        return [];
    }
}

/**
 * Get total forensic report count.
 */
export async function getForensicReportCount(): Promise<number> {
    try {
        const db = await getDB();
        return await db.count(STORES.FORENSIC_REPORTS);
    } catch (error) {
        console.error('[Persistence] Failed to count forensic reports:', error);
        return 0;
    }
}

// ─── Portfolio Snapshot Operations ───────────────────────────

/**
 * Save a portfolio snapshot (for equity curve tracking).
 */
export async function savePortfolioSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
    try {
        const db = await getDB();
        await db.put(STORES.PORTFOLIO_SNAPSHOTS, snapshot);
    } catch (error) {
        console.error('[Persistence] Failed to save portfolio snapshot:', error);
    }
}

/**
 * Load portfolio history for equity curve rendering.
 */
export async function loadPortfolioHistory(): Promise<PortfolioSnapshot[]> {
    try {
        const db = await getDB();
        return await db.getAllFromIndex(STORES.PORTFOLIO_SNAPSHOTS, 'by_timestamp');
    } catch (error) {
        console.error('[Persistence] Failed to load portfolio history:', error);
        return [];
    }
}

// ─── Engine State (Checkpoint/Hydration) ─────────────────────

/**
 * Save the current engine state checkpoint.
 * Used for auto-recovery after page refresh.
 */
export async function saveEngineCheckpoint(checkpoint: EngineCheckpoint): Promise<void> {
    try {
        const db = await getDB();
        await db.put(STORES.ENGINE_STATE, { ...checkpoint, id: 'latest' });
    } catch (error) {
        console.error('[Persistence] Failed to save engine checkpoint:', error);
    }
}

/**
 * Load the latest engine checkpoint for hydration.
 * Returns null if no checkpoint exists.
 */
export async function loadEngineCheckpoint(): Promise<EngineCheckpoint | null> {
    try {
        const db = await getDB();
        const checkpoint = await db.get(STORES.ENGINE_STATE, 'latest');
        return checkpoint ?? null;
    } catch (error) {
        console.error('[Persistence] Failed to load engine checkpoint:', error);
        return null;
    }
}

// ─── Zustand Persistence Adapter ─────────────────────────────

/**
 * Custom Zustand storage adapter that uses IndexedDB.
 * Drop-in replacement for createJSONStorage(() => localStorage).
 *
 * Usage:
 *   persist(storeCreator, {
 *     name: 'store-name',
 *     storage: createIndexedDBStorage('store-name'),
 *   })
 */
export function createIndexedDBStorage(storeName: string) {
    return {
        getItem: async (name: string) => {
            try {
                const db = await getDB();
                const data = await db.get(STORES.ENGINE_STATE, `zustand_${name}`);
                return data?.value ?? null;
            } catch (error) {
                console.error(`[Persistence] Failed to read ${name}:`, error);
                return null;
            }
        },

        setItem: async (name: string, value: unknown): Promise<void> => {
            try {
                const db = await getDB();
                await db.put(STORES.ENGINE_STATE, {
                    id: `zustand_${name}`,
                    value,
                    timestamp: Date.now(),
                });
            } catch (error) {
                console.error(`[Persistence] Failed to write ${name}:`, error);
            }
        },

        removeItem: async (name: string): Promise<void> => {
            try {
                const db = await getDB();
                await db.delete(STORES.ENGINE_STATE, `zustand_${name}`);
            } catch (error) {
                console.error(`[Persistence] Failed to remove ${name}:`, error);
            }
        },
    };
}

// ─── Auto-Checkpoint Scheduler ───────────────────────────────

let checkpointInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic auto-checkpointing.
 * Saves engine state every `intervalMs` (default 30s).
 */
export function startAutoCheckpoint(
    getCheckpointFn: () => EngineCheckpoint,
    intervalMs: number = 30_000,
): void {
    stopAutoCheckpoint(); // Prevent duplicates
    checkpointInterval = setInterval(async () => {
        try {
            const checkpoint = getCheckpointFn();
            await saveEngineCheckpoint(checkpoint);
        } catch (error) {
            console.error('[Persistence] Auto-checkpoint failed:', error);
        }
    }, intervalMs);
}

/**
 * Stop periodic auto-checkpointing.
 */
export function stopAutoCheckpoint(): void {
    if (checkpointInterval) {
        clearInterval(checkpointInterval);
        checkpointInterval = null;
    }
}

// ─── Database Utilities ──────────────────────────────────────

/**
 * Get storage statistics.
 */
export async function getStorageStats(): Promise<{
    trades: number;
    strategies: number;
    evolutionSnapshots: number;
    forensicReports: number;
    portfolioSnapshots: number;
    hasCheckpoint: boolean;
}> {
    try {
        const db = await getDB();
        return {
            trades: await db.count(STORES.TRADES),
            strategies: await db.count(STORES.STRATEGIES),
            evolutionSnapshots: await db.count(STORES.EVOLUTION_SNAPSHOTS),
            forensicReports: await db.count(STORES.FORENSIC_REPORTS),
            portfolioSnapshots: await db.count(STORES.PORTFOLIO_SNAPSHOTS),
            hasCheckpoint: !!(await db.get(STORES.ENGINE_STATE, 'latest')),
        };
    } catch (error) {
        console.error('[Persistence] Failed to get storage stats:', error);
        return {
            trades: 0,
            strategies: 0,
            evolutionSnapshots: 0,
            forensicReports: 0,
            portfolioSnapshots: 0,
            hasCheckpoint: false,
        };
    }
}

/**
 * Clear all data from all stores. USE WITH CAUTION.
 */
export async function clearAllData(): Promise<void> {
    try {
        const db = await getDB();
        const storeNames = Object.values(STORES);
        for (const storeName of storeNames) {
            await db.clear(storeName);
        }
    } catch (error) {
        console.error('[Persistence] Failed to clear all data:', error);
    }
}
