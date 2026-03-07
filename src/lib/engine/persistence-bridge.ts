// ============================================================
// Learner: Persistence Bridge — Dual-Write (IndexedDB + Supabase)
// ============================================================
// Phase 13.1 → 14: Connects engine lifecycle events to BOTH
// IndexedDB (local cache for speed + offline) AND Supabase
// (cloud PostgreSQL for PC-independent durability).
//
// Engine → PersistenceBridge → IndexedDB (local, fast)
//                             → Supabase  (cloud, durable)
//
// CRITICAL: Uses lazy auto-initialization — no manual init needed.
// Supabase writes happen immediately (stateless HTTP).
// IndexedDB writes trigger auto-init on first call.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type {
    Trade,
    StrategyDNA,
    TradeForensicReport,
} from '@/types';
import {
    saveTrade,
    saveStrategies,
    saveEvolutionSnapshot,
    saveForensicReport,
    savePortfolioSnapshot,
    saveEngineCheckpoint,
    loadEngineCheckpoint,
    startAutoCheckpoint,
    stopAutoCheckpoint,
    initDB,
    getStorageStats,
    type EvolutionSnapshot,
    type PortfolioSnapshot,
    type EngineCheckpoint,
} from '@/lib/store/persistence';
import {
    cloudSaveTrade,
    cloudSaveStrategies,
    cloudSaveEvolutionSnapshot,
    cloudSaveForensicReport,
    cloudSavePortfolioSnapshot,
    cloudSaveEngineCheckpoint,
    cloudLoadEngineCheckpoint,
    cloudGetStats,
} from '@/lib/db/supabase';

// ─── Bridge Configuration ────────────────────────────────────

interface PersistenceBridgeConfig {
    autoCheckpointIntervalMs: number;
    portfolioSnapshotIntervalMs: number;
    enabled: boolean;
}

const DEFAULT_BRIDGE_CONFIG: PersistenceBridgeConfig = {
    autoCheckpointIntervalMs: 30_000,
    portfolioSnapshotIntervalMs: 60_000,
    enabled: true,
};

// ─── Persistence Bridge ──────────────────────────────────────

/**
 * PersistenceBridge connects engine lifecycle events to durable storage.
 * Every write goes to BOTH IndexedDB (local cache) and Supabase (cloud).
 * Uses lazy auto-initialization — no manual `.initialize()` call needed.
 *
 * Usage:
 *   const bridge = getPersistenceBridge();
 *   bridge.onTradeRecorded(trade);       // just call it
 *   bridge.onGenerationEvolved(...);     // auto-inits internally
 */
export class PersistenceBridge {
    private readonly config: PersistenceBridgeConfig;
    private indexedDBReady: boolean = false;
    private initPromise: Promise<boolean> | null = null;
    private portfolioInterval: ReturnType<typeof setInterval> | null = null;
    private lastPortfolioSnapshot: number = 0;

    constructor(config: Partial<PersistenceBridgeConfig> = {}) {
        this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
    }

    // ── Lazy Auto-Init ───────────────────────────────────────

    /**
     * Ensures IndexedDB is initialized. Called internally before
     * any local write. Returns true if ready, false if unavailable
     * (e.g., server-side rendering).
     *
     * Uses a singleton promise to avoid concurrent init race conditions.
     */
    private ensureIndexedDB(): Promise<boolean> {
        if (this.indexedDBReady) return Promise.resolve(true);
        if (typeof window === 'undefined') return Promise.resolve(false);

        if (!this.initPromise) {
            this.initPromise = initDB()
                .then(() => {
                    this.indexedDBReady = true;
                    console.log('[PersistenceBridge] IndexedDB auto-initialized');
                    return true;
                })
                .catch(err => {
                    console.error('[PersistenceBridge] IndexedDB init failed:', err);
                    this.initPromise = null; // Allow retry
                    return false;
                });
        }

        return this.initPromise;
    }

    // ── Trade Events ─────────────────────────────────────────

    onTradeRecorded(trade: Trade): void {
        if (!this.config.enabled) return;

        // Cloud: stateless HTTP — fire immediately
        cloudSaveTrade(trade).catch(err =>
            console.error('[PersistenceBridge] Cloud trade save failed:', err)
        );

        // Local: needs IndexedDB init
        this.ensureIndexedDB().then(ok => {
            if (!ok) return;
            saveTrade(trade).catch(err =>
                console.error('[PersistenceBridge] IndexedDB trade save failed:', err)
            );
        });
    }

    onTradeUpdated(trade: Trade): void {
        if (!this.config.enabled) return;

        cloudSaveTrade(trade).catch(err =>
            console.error('[PersistenceBridge] Cloud trade update failed:', err)
        );

        this.ensureIndexedDB().then(ok => {
            if (!ok) return;
            saveTrade(trade).catch(err =>
                console.error('[PersistenceBridge] IndexedDB trade update failed:', err)
            );
        });
    }

    // ── Forensic Events ──────────────────────────────────────

    onForensicReportGenerated(report: TradeForensicReport): void {
        if (!this.config.enabled) return;

        cloudSaveForensicReport(report).catch(err =>
            console.error('[PersistenceBridge] Cloud forensic save failed:', err)
        );

        this.ensureIndexedDB().then(ok => {
            if (!ok) return;
            saveForensicReport(report).catch(err =>
                console.error('[PersistenceBridge] IndexedDB forensic save failed:', err)
            );
        });
    }

    // ── Evolution Events ─────────────────────────────────────

    onGenerationEvolved(
        generationNumber: number,
        bestFitness: number,
        avgFitness: number,
        populationSize: number,
        mutationRate: number,
        bestStrategy: StrategyDNA | null,
        slotId: string,
        strategies: StrategyDNA[],
    ): void {
        if (!this.config.enabled) return;

        const snapshot: EvolutionSnapshot = {
            id: `${slotId}_gen_${generationNumber}`,
            generationNumber,
            timestamp: Date.now(),
            bestFitnessScore: bestFitness,
            averageFitnessScore: avgFitness,
            populationSize,
            mutationRate,
            bestStrategyId: bestStrategy?.id ?? null,
            bestStrategyName: bestStrategy?.name ?? null,
            slotId,
        };

        // Cloud
        cloudSaveEvolutionSnapshot(snapshot).catch(err =>
            console.error('[PersistenceBridge] Cloud evolution save failed:', err)
        );
        cloudSaveStrategies(strategies).catch(err =>
            console.error('[PersistenceBridge] Cloud strategies save failed:', err)
        );

        // Local
        this.ensureIndexedDB().then(ok => {
            if (!ok) return;
            saveEvolutionSnapshot(snapshot).catch(err =>
                console.error('[PersistenceBridge] IndexedDB evolution save failed:', err)
            );
            saveStrategies(strategies).catch(err =>
                console.error('[PersistenceBridge] IndexedDB strategies save failed:', err)
            );
        });
    }

    // ── Portfolio Events ─────────────────────────────────────

    onPortfolioUpdate(summary: {
        totalBalance: number;
        unrealizedPnl: number;
        totalTrades: number;
        activePositions: number;
        allTimePnl: number;
        allTimePnlPercent: number;
    }): void {
        if (!this.config.enabled) return;

        // Throttle
        const now = Date.now();
        if (now - this.lastPortfolioSnapshot < this.config.portfolioSnapshotIntervalMs) {
            return;
        }
        this.lastPortfolioSnapshot = now;

        const snapshot: PortfolioSnapshot = {
            id: uuidv4(),
            timestamp: now,
            ...summary,
        };

        // Cloud
        cloudSavePortfolioSnapshot(snapshot).catch(err =>
            console.error('[PersistenceBridge] Cloud portfolio save failed:', err)
        );

        // Local
        this.ensureIndexedDB().then(ok => {
            if (!ok) return;
            savePortfolioSnapshot(snapshot).catch(err =>
                console.error('[PersistenceBridge] IndexedDB portfolio save failed:', err)
            );
        });
    }

    // ── Engine Checkpoint ────────────────────────────────────

    startEngineCheckpoint(getCheckpointFn: () => EngineCheckpoint): void {
        if (!this.config.enabled) return;

        this.ensureIndexedDB().then(ok => {
            if (!ok) return;
            startAutoCheckpoint(getCheckpointFn, this.config.autoCheckpointIntervalMs);
            console.log(
                `[PersistenceBridge] Auto-checkpoint started (every ${this.config.autoCheckpointIntervalMs / 1000}s)`
            );
        });
    }

    /**
     * Load the last engine checkpoint for hydration.
     * Tries cloud first (always available), falls back to local.
     */
    async loadLastCheckpoint(): Promise<EngineCheckpoint | null> {
        if (!this.config.enabled) return null;

        try {
            // Cloud first — always reachable
            const cloudCheckpoint = await cloudLoadEngineCheckpoint();
            if (cloudCheckpoint) return cloudCheckpoint;

            // Fall back to local
            const ok = await this.ensureIndexedDB();
            if (!ok) return null;
            return await loadEngineCheckpoint();
        } catch (error) {
            console.error('[PersistenceBridge] Failed to load checkpoint:', error);
            return null;
        }
    }

    // ── Stats & Cleanup ──────────────────────────────────────

    async getStats() {
        const [local, cloud] = await Promise.allSettled([
            getStorageStats(),
            cloudGetStats(),
        ]);

        return {
            local: local.status === 'fulfilled' ? local.value : null,
            cloud: cloud.status === 'fulfilled' ? cloud.value : null,
        };
    }

    async saveImmediateCheckpoint(checkpoint: EngineCheckpoint): Promise<void> {
        if (!this.config.enabled) return;

        try {
            await Promise.allSettled([
                this.ensureIndexedDB().then(ok =>
                    ok ? saveEngineCheckpoint(checkpoint) : undefined
                ),
                cloudSaveEngineCheckpoint(checkpoint),
            ]);
            console.log('[PersistenceBridge] Immediate checkpoint saved (local + cloud)');
        } catch (error) {
            console.error('[PersistenceBridge] Immediate checkpoint failed:', error);
        }
    }

    shutdown(): void {
        stopAutoCheckpoint();
        if (this.portfolioInterval) {
            clearInterval(this.portfolioInterval);
            this.portfolioInterval = null;
        }
        console.log('[PersistenceBridge] Shutdown complete');
    }
}

// ─── Singleton Instance ──────────────────────────────────────

let bridgeInstance: PersistenceBridge | null = null;

export function getPersistenceBridge(): PersistenceBridge {
    if (!bridgeInstance) {
        bridgeInstance = new PersistenceBridge();
    }
    return bridgeInstance;
}
