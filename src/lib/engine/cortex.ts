// ============================================================
// Learner: Cortex — Multi-Island Orchestrator
// ============================================================
// Central coordinator for the Island Model architecture.
// Manages island lifecycle, migration, capital allocation,
// global risk, and aggregated dashboard state.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    BrainState,
    BrainLog,
    LogLevel,
    StrategyDNA,
    Trade,
    OHLCV,
    CortexSnapshot,
    IslandSnapshot,
    IslandAllocation,
    MigrationEvent,
    PerformanceMetrics,
    MarketRegime,
} from '@/types';
import type { HyperDNA, MetaEvolutionConfig } from '@/types';
import { DEFAULT_META_EVOLUTION_CONFIG } from '@/types';
import { TradingSlot, TradingSlotStatus, createTradingSlot, generateStarterSlots } from '@/types/trading-slot';
import { Island, IslandConfig, DEFAULT_ISLAND_CONFIG } from './island';
import { MigrationEngine, MigrationConfig, DEFAULT_MIGRATION_CONFIG } from './migration';
import { CapitalAllocator, AllocationConfig, DEFAULT_ALLOCATION_CONFIG, calculateEqualAllocation } from './capital-allocator';
import { MetaEvolutionEngine } from './meta-evolution';

// ─── Cortex Configuration ────────────────────────────────────

export interface CortexConfig {
    maxConcurrentIslands: number;     // Maximum active islands (default: 8)
    maxGlobalPositions: number;       // Max positions across ALL islands (shared risk)
    totalCapital: number;             // Total capital for allocation
    islandConfig: Partial<IslandConfig>;
    migrationConfig: Partial<MigrationConfig>;
    allocationConfig: Partial<AllocationConfig>;
    correlationThreshold: number;     // Max directional agreement before reducing (0-1)
}

export const DEFAULT_CORTEX_CONFIG: CortexConfig = {
    maxConcurrentIslands: 8,
    maxGlobalPositions: 3,
    totalCapital: 10000,
    islandConfig: {},
    migrationConfig: {},
    allocationConfig: {},
    correlationThreshold: 0.7,
};

// ─── Cortex Class ────────────────────────────────────────────

export class Cortex {
    private config: CortexConfig;
    private islands: Map<string, Island> = new Map();
    private migrationEngine: MigrationEngine;
    private capitalAllocator: CapitalAllocator;
    private globalState: BrainState = BrainState.IDLE;
    private globalLogs: BrainLog[] = [];
    private migrationHistory: MigrationEvent[] = [];
    private totalTradesAllIslands: number = 0;

    // ─── Meta-Evolution (GA²) ────────────────────────────────
    private metaEvolutionEngine: MetaEvolutionEngine;
    private totalStrategyGenerations: number = 0;

    constructor(config: Partial<CortexConfig> = {}) {
        this.config = { ...DEFAULT_CORTEX_CONFIG, ...config };
        this.migrationEngine = new MigrationEngine(this.config.migrationConfig);
        this.capitalAllocator = new CapitalAllocator(this.config.allocationConfig);
        this.metaEvolutionEngine = new MetaEvolutionEngine();
    }

    // ─── Island Lifecycle ────────────────────────────────────────

    /**
     * Initialize the Cortex with a set of trading slots.
     * Creates one Island per slot and starts evolution.
     */
    initialize(slots?: TradingSlot[]): CortexSnapshot {
        const activeSlots = slots ?? generateStarterSlots();

        // Limit to max concurrent islands
        const slotsToActivate = activeSlots.slice(0, this.config.maxConcurrentIslands);

        this.globalLog(LogLevel.INFO, `🧠 CORTEX INITIALIZED — ${slotsToActivate.length} islands`);

        for (const slot of slotsToActivate) {
            this.spawnIsland(slot);
        }

        // Initial capital allocation (equal split)
        const allocations = calculateEqualAllocation(
            this.config.totalCapital,
            slotsToActivate.map(s => s.id)
        );
        for (const alloc of allocations) {
            const island = this.islands.get(alloc.slotId);
            if (island) {
                island.setAllocatedCapital(alloc.allocatedCapital);
            }
        }

        this.globalState = BrainState.EXPLORING;
        return this.getSnapshot();
    }

    /**
     * Spawn a new island for a trading slot.
     */
    spawnIsland(slot: TradingSlot): Island | null {
        if (this.islands.size >= this.config.maxConcurrentIslands) {
            this.globalLog(LogLevel.WARNING, `Cannot spawn island [${slot.id}]: max ${this.config.maxConcurrentIslands} islands reached`);
            return null;
        }

        if (this.islands.has(slot.id)) {
            this.globalLog(LogLevel.WARNING, `Island [${slot.id}] already exists`);
            return this.islands.get(slot.id) ?? null;
        }

        // GA²: Generate HyperDNA for the new island
        const bestHyperDna = this.metaEvolutionEngine.getBestHyperDna();
        let hyperDna: HyperDNA;

        if (bestHyperDna && bestHyperDna.metadata.metaFitness > 20) {
            // Mutate the best-known HyperDNA for this new island
            hyperDna = this.metaEvolutionEngine.mutate(bestHyperDna);
            this.globalLog(LogLevel.EVOLUTION, `🧬² [${slot.id}] Spawned with mutated HyperDNA from best: ${bestHyperDna.id.slice(0, 8)}`);
        } else if (this.islands.size === 0) {
            // First island: use human-designed defaults
            hyperDna = this.metaEvolutionEngine.generateDefaultHyperDNA();
            this.globalLog(LogLevel.INFO, `🧬² [${slot.id}] Spawned with DEFAULT HyperDNA`);
        } else {
            // No proven HyperDNA yet: use random for exploration
            hyperDna = this.metaEvolutionEngine.generateRandomHyperDNA();
            this.globalLog(LogLevel.INFO, `🧬² [${slot.id}] Spawned with RANDOM HyperDNA`);
        }

        const island = new Island(slot, this.config.islandConfig, hyperDna);
        this.islands.set(slot.id, island);

        island.start();

        this.globalLog(LogLevel.INFO, `🏝️ Spawned island [${slot.id}] — ${slot.pair}/${slot.timeframe}`, {
            totalIslands: this.islands.size,
        });

        return island;
    }

    /**
     * Retire an island — stops evolution and removes from active set.
     */
    retireIsland(slotId: string): boolean {
        const island = this.islands.get(slotId);
        if (!island) {
            this.globalLog(LogLevel.WARNING, `Cannot retire: island [${slotId}] not found`);
            return false;
        }

        island.emergencyStop();
        this.islands.delete(slotId);

        this.globalLog(LogLevel.INFO, `🏝️ Retired island [${slotId}]`, {
            remainingIslands: this.islands.size,
        });

        // Rebalance capital across remaining islands
        this.rebalanceCapital();

        return true;
    }

    /**
     * Pause a specific island.
     */
    pauseIsland(slotId: string): boolean {
        const island = this.islands.get(slotId);
        if (!island) return false;
        island.pause();
        this.globalLog(LogLevel.INFO, `⏸️ Paused island [${slotId}]`);
        return true;
    }

    /**
     * Resume a paused island.
     */
    resumeIsland(slotId: string): boolean {
        const island = this.islands.get(slotId);
        if (!island) return false;
        island.resume();
        this.globalLog(LogLevel.INFO, `▶️ Resumed island [${slotId}]`);
        return true;
    }

    // ─── Trade Recording ─────────────────────────────────────────

    /**
     * Record a trade to the appropriate island.
     * The trade's slotId determines which island receives it.
     */
    recordTrade(trade: Trade): CortexSnapshot {
        const island = this.islands.get(trade.slotId);
        if (!island) {
            this.globalLog(LogLevel.ERROR, `Trade for unknown island [${trade.slotId}]`);
            return this.getSnapshot();
        }

        island.recordTrade(trade);
        this.totalTradesAllIslands++;

        // After recording, check if migration should run
        this.checkMigrationCycle();

        // GA²: Check if meta-evolution cycle should trigger
        this.checkMetaEvolutionCycle();

        return this.getSnapshot();
    }

    /**
     * Update market data for a specific island.
     */
    updateMarketData(slotId: string, candles: OHLCV[]): void {
        const island = this.islands.get(slotId);
        if (island) {
            island.updateMarketData(candles);
        }
    }

    /**
     * Update market data for all islands of a specific pair.
     * When we receive BTCUSDT candles, all BTCUSDT islands (M15, H1, H4) get updated.
     */
    updateMarketDataForPair(pair: string, candles: OHLCV[]): void {
        for (const [slotId, island] of this.islands) {
            if (island.slot.pair === pair) {
                island.updateMarketData(candles);
            }
        }
    }

    // ─── Migration ───────────────────────────────────────────────

    /**
     * Check and run migration cycle if appropriate.
     */
    private checkMigrationCycle(): void {
        const events = this.migrationEngine.runMigrationCycle(this.islands);

        if (events.length > 0) {
            this.migrationHistory.push(...events);

            // Keep only last 200
            if (this.migrationHistory.length > 200) {
                this.migrationHistory = this.migrationHistory.slice(-200);
            }

            const summaryStr = events.map(e => `${e.sourceSlotId}→${e.targetSlotId}`).join(', ');
            this.globalLog(LogLevel.EVOLUTION, `📬 Migration: ${events.length} transfers (${summaryStr})`);
        }
    }

    // ─── Capital Allocation ──────────────────────────────────────

    /**
     * Rebalance capital across all active islands.
     */
    rebalanceCapital(): IslandAllocation[] {
        return this.capitalAllocator.rebalance(this.config.totalCapital, this.islands);
    }

    /**
     * Update total capital (e.g., from PnL changes).
     */
    updateTotalCapital(newCapital: number): void {
        this.config.totalCapital = newCapital;
        this.rebalanceCapital();
    }

    // ─── Correlation Guard ───────────────────────────────────────

    /**
     * Check cross-island directional correlation.
     * If too many islands have LONG (or SHORT) active strategies,
     * the system is over-exposed to one direction.
     *
     * Returns: directional agreement ratio (0-1).
     * >0.7 = WARNING: over-correlated
     */
    checkDirectionalCorrelation(): { ratio: number; overCorrelated: boolean; dominantDirection: 'LONG' | 'SHORT' | 'NEUTRAL' } {
        let longCount = 0;
        let shortCount = 0;
        let totalActive = 0;

        for (const [, island] of this.islands) {
            const strategy = island.getActiveStrategy();
            if (!strategy) continue;
            totalActive++;

            if (strategy.directionBias === 'LONG') {
                longCount++;
            } else if (strategy.directionBias === 'SHORT') {
                shortCount++;
            }
        }

        if (totalActive === 0) {
            return { ratio: 0, overCorrelated: false, dominantDirection: 'NEUTRAL' };
        }

        const maxDirectional = Math.max(longCount, shortCount);
        const ratio = maxDirectional / totalActive;
        const overCorrelated = ratio > this.config.correlationThreshold;
        const dominantDirection = longCount > shortCount ? 'LONG' as const
            : shortCount > longCount ? 'SHORT' as const
                : 'NEUTRAL' as const;

        if (overCorrelated) {
            this.globalLog(LogLevel.WARNING, `⚠️ Directional correlation ${(ratio * 100).toFixed(0)}% — ${dominantDirection} heavy`);
        }

        return { ratio, overCorrelated, dominantDirection };
    }

    // ─── Global Controls ─────────────────────────────────────────

    /**
     * Pause all islands.
     */
    pauseAll(): CortexSnapshot {
        for (const [, island] of this.islands) {
            island.pause();
        }
        this.globalState = BrainState.PAUSED;
        this.globalLog(LogLevel.WARNING, '⏸️ ALL islands PAUSED');
        return this.getSnapshot();
    }

    /**
     * Resume all islands.
     */
    resumeAll(): CortexSnapshot {
        for (const [, island] of this.islands) {
            island.resume();
        }
        this.globalState = BrainState.TRADING;
        this.globalLog(LogLevel.INFO, '▶️ ALL islands RESUMED');
        return this.getSnapshot();
    }

    /**
     * Emergency stop all islands.
     */
    emergencyStopAll(): CortexSnapshot {
        for (const [, island] of this.islands) {
            island.emergencyStop();
        }
        this.globalState = BrainState.EMERGENCY_STOP;
        this.globalLog(LogLevel.ERROR, '🚨 EMERGENCY STOP — All islands halted');
        return this.getSnapshot();
    }

    // ─── Snapshot ─────────────────────────────────────────────────

    /**
     * Get the full Cortex snapshot for the dashboard.
     * Aggregates all island snapshots + global state.
     */
    getSnapshot(): CortexSnapshot {
        const islandSnapshots: IslandSnapshot[] = [];
        let globalBestFitness = 0;

        for (const [, island] of this.islands) {
            const snap = island.getSnapshot();
            islandSnapshots.push(snap);
            if (snap.bestFitnessAllTime > globalBestFitness) {
                globalBestFitness = snap.bestFitnessAllTime;
            }
        }

        // Determine global state from island states
        const states = islandSnapshots.map(s => s.state);
        if (states.includes(BrainState.EMERGENCY_STOP)) {
            this.globalState = BrainState.EMERGENCY_STOP;
        } else if (states.every(s => s === BrainState.PAUSED)) {
            this.globalState = BrainState.PAUSED;
        } else if (states.includes(BrainState.TRADING)) {
            this.globalState = BrainState.TRADING;
        } else if (states.includes(BrainState.EVOLVING)) {
            this.globalState = BrainState.EVOLVING;
        } else if (states.includes(BrainState.EVALUATING) || states.includes(BrainState.VALIDATING)) {
            this.globalState = BrainState.EVALUATING;
        } else if (states.includes(BrainState.EXPLORING)) {
            this.globalState = BrainState.EXPLORING;
        }

        const activeIslands = islandSnapshots.filter(
            s => s.state !== BrainState.PAUSED && s.state !== BrainState.EMERGENCY_STOP && s.state !== BrainState.IDLE
        ).length;

        return {
            islands: islandSnapshots,
            globalState: this.globalState,
            totalIslands: this.islands.size,
            activeIslands,
            totalTradesAllIslands: this.totalTradesAllIslands,
            globalBestFitness,
            capitalAllocations: this.capitalAllocator.getCurrentAllocations(),
            migrationHistory: this.migrationHistory.slice(-50),
            globalLogs: this.globalLogs.slice(-100),
            totalCapital: this.config.totalCapital,
        };
    }

    // ─── Getters ─────────────────────────────────────────────────

    getIsland(slotId: string): Island | undefined {
        return this.islands.get(slotId);
    }

    getAllIslands(): Map<string, Island> {
        return new Map(this.islands);
    }

    getActiveSlots(): TradingSlot[] {
        return Array.from(this.islands.values()).map(i => i.slot);
    }

    getGlobalState(): BrainState {
        return this.globalState;
    }

    getTotalCapital(): number {
        return this.config.totalCapital;
    }

    getMigrationHistory(): MigrationEvent[] {
        return [...this.migrationHistory];
    }

    // ─── Private ─────────────────────────────────────────────────

    private globalLog(level: LogLevel, message: string, details?: Record<string, unknown>): void {
        this.globalLogs.push({
            id: uuidv4(),
            timestamp: Date.now(),
            level,
            message,
            details,
        });

        if (this.globalLogs.length > 500) {
            this.globalLogs = this.globalLogs.slice(-500);
        }
    }

    // ─── Meta-Evolution (GA²) Cycle ──────────────────────────────

    /**
     * Check if a meta-evolution cycle should run.
     * This is the GA² heartbeat: periodically evaluate HyperDNA performance
     * across all islands, then crossover the best HyperDNA and distribute
     * offspring to underperforming islands.
     */
    private checkMetaEvolutionCycle(): void {
        // Count total strategy generations across all islands
        let totalGens = 0;
        for (const [, island] of this.islands) {
            totalGens += island.getGenerationFitnessHistory().length;
        }
        this.totalStrategyGenerations = totalGens;

        // Check if it's time for meta-evolution
        if (!this.metaEvolutionEngine.shouldTriggerMetaCrossover(this.totalStrategyGenerations)) {
            return;
        }

        this.runMetaEvolutionCycle();
    }

    /**
     * Run a full meta-evolution cycle:
     * 1. Evaluate all islands' HyperDNA meta-fitness
     * 2. Select the two best HyperDNA configurations
     * 3. Crossover them to produce offspring
     * 4. Replace the worst-performing island's HyperDNA with the offspring
     */
    private runMetaEvolutionCycle(): void {
        try {
            this.globalLog(LogLevel.EVOLUTION, `🧬² META-EVOLUTION CYCLE triggered (total gens: ${this.totalStrategyGenerations})`);

            // Step 1: Evaluate meta-fitness for each island's HyperDNA
            const evaluations: Array<{ slotId: string; metaFitness: number; hyperDna: HyperDNA }> = [];

            for (const [slotId, island] of this.islands) {
                const hyperDna = island.getHyperDna();
                if (!hyperDna) continue;

                if (!this.metaEvolutionEngine.isReadyForEvaluation(hyperDna)) {
                    continue; // Stability guard: not enough data yet
                }

                const fitnessHistory = island.getGenerationFitnessHistory();
                const valStats = island.getValidationStats();
                const avgDiversity = island.getAverageDiversityIndex();

                const record = this.metaEvolutionEngine.evaluateMetaFitness(
                    hyperDna,
                    slotId,
                    fitnessHistory,
                    valStats.attempts,
                    valStats.passes,
                    avgDiversity,
                );

                evaluations.push({ slotId, metaFitness: record.metaFitness, hyperDna });
            }

            if (evaluations.length < 2) {
                this.globalLog(LogLevel.INFO, `🧬² Not enough evaluated islands for meta-crossover (${evaluations.length}/2)`);
                return;
            }

            // Step 2: Sort by meta-fitness (descending)
            evaluations.sort((a, b) => b.metaFitness - a.metaFitness);

            const best = evaluations[0];
            const secondBest = evaluations[1];
            const worst = evaluations[evaluations.length - 1];

            this.globalLog(LogLevel.EVOLUTION, `🧬² Meta-fitness ranking: best=${best.slotId} (${best.metaFitness.toFixed(1)}), worst=${worst.slotId} (${worst.metaFitness.toFixed(1)})`);

            // Step 3: Crossover the top 2 HyperDNA
            const offspring = this.metaEvolutionEngine.crossover(best.hyperDna, secondBest.hyperDna);

            // Step 4: Apply minor mutation to the offspring
            const mutatedOffspring = this.metaEvolutionEngine.mutate(offspring);

            // Step 5: Replace the worst island's HyperDNA
            const worstIsland = this.islands.get(worst.slotId);
            if (worstIsland) {
                worstIsland.replaceHyperDna(mutatedOffspring);
                this.globalLog(LogLevel.EVOLUTION,
                    `🧬² HyperDNA of [${worst.slotId}] replaced with offspring of [${best.slotId}] × [${secondBest.slotId}]`);
            }

            this.metaEvolutionEngine.advanceMetaGeneration();
            this.globalLog(LogLevel.EVOLUTION, `🧬² Meta-generation ${this.metaEvolutionEngine.getMetaGeneration()} complete`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[Cortex] Meta-evolution cycle failed: ${msg}`);
            this.globalLog(LogLevel.ERROR, `🧬² Meta-evolution cycle failed: ${msg}`);
        }
    }

    /**
     * Get the MetaEvolutionEngine instance for external access.
     */
    getMetaEvolutionEngine(): MetaEvolutionEngine {
        return this.metaEvolutionEngine;
    }
}
