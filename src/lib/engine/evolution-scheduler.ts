// ============================================================
// Learner: Evolution Scheduler — Candle-Driven Evolution Timer
// ============================================================
// Determines WHEN to trigger backtesting + evolution for each
// island based on candle close events. Prevents CPU spikes by
// sequentializing evolution cycles and enforcing cooldowns.
//
// Flow:
//   CandleClose → onCandleClose(slotId) → threshold check
//   → if ready: queue evolution → dequeue → batchBacktest() + evolve()
//   → emit onEvolutionComplete callback
// ============================================================

import type { Cortex } from './cortex';
import { batchBacktest } from './backtester';
import type { OHLCV, EvolutionSchedulerConfig, EvolutionSlotStatus, StrategyDNA } from '@/types';

// ─── Default Configuration ──────────────────────────────────

const DEFAULT_SCHEDULER_CONFIG: EvolutionSchedulerConfig = {
    candlesPerEvolution: 10,
    maxConcurrentEvolutions: 1,
    cooldownMs: 5000,
    autoEvolveEnabled: true,
};

// ─── Evolution Scheduler ────────────────────────────────────

export type EvolutionCompleteCallback = (
    slotId: string,
    generationNumber: number,
    bestFitness: number,
    durationMs: number,
) => void;

export class EvolutionScheduler {
    private cortex: Cortex;
    private config: EvolutionSchedulerConfig;
    private slotStatus: Map<string, EvolutionSlotStatus> = new Map();
    private evolutionQueue: string[] = [];
    private activeEvolutions = 0;
    private isProcessing = false;
    private onEvolutionComplete: EvolutionCompleteCallback | null = null;

    constructor(cortex: Cortex, config: Partial<EvolutionSchedulerConfig> = {}) {
        this.cortex = cortex;
        this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    }

    // ─── Public API ─────────────────────────────────────────

    /**
     * Set callback for when an evolution cycle completes.
     */
    setOnEvolutionComplete(callback: EvolutionCompleteCallback): void {
        this.onEvolutionComplete = callback;
    }

    /**
     * Called every time a candle closes for a specific slot.
     * Increments the counter and checks if evolution should be triggered.
     */
    onCandleClose(slotId: string): void {
        if (!this.config.autoEvolveEnabled) return;

        const status = this.getOrCreateSlotStatus(slotId);
        status.candlesSinceLastEvolution++;

        // Check threshold
        if (status.candlesSinceLastEvolution >= this.config.candlesPerEvolution) {
            // Check cooldown
            const timeSinceLast = Date.now() - status.lastEvolutionTimestamp;
            if (timeSinceLast >= this.config.cooldownMs) {
                this.enqueueEvolution(slotId);
            }
        }
    }

    /**
     * Force-trigger evolution for a specific slot (ignores candle count).
     */
    forceEvolve(slotId: string): void {
        this.enqueueEvolution(slotId);
    }

    /**
     * Get the status of all tracked slots.
     */
    getStatus(): Map<string, EvolutionSlotStatus> {
        return new Map(this.slotStatus);
    }

    /**
     * Get status for a specific slot.
     */
    getSlotStatus(slotId: string): EvolutionSlotStatus | null {
        return this.slotStatus.get(slotId) ?? null;
    }

    /**
     * Register all current cortex slots.
     */
    registerSlots(slotIds: string[]): void {
        for (const slotId of slotIds) {
            this.getOrCreateSlotStatus(slotId);
        }
    }

    /**
     * Update config at runtime.
     */
    updateConfig(config: Partial<EvolutionSchedulerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get queue length.
     */
    getQueueLength(): number {
        return this.evolutionQueue.length;
    }

    /**
     * Reset a slot's candle counter (e.g., after manual trigger).
     */
    resetSlotCounter(slotId: string): void {
        const status = this.slotStatus.get(slotId);
        if (status) {
            status.candlesSinceLastEvolution = 0;
        }
    }

    // ─── Private Methods ────────────────────────────────────

    private getOrCreateSlotStatus(slotId: string): EvolutionSlotStatus {
        let status = this.slotStatus.get(slotId);
        if (!status) {
            status = {
                slotId,
                candlesSinceLastEvolution: 0,
                lastEvolutionTimestamp: 0,
                isEvolving: false,
                totalEvolutionCycles: 0,
                lastBacktestDurationMs: 0,
                lastGenerationFitness: 0,
            };
            this.slotStatus.set(slotId, status);
        }
        return status;
    }

    private enqueueEvolution(slotId: string): void {
        // Don't enqueue if already queued or already evolving
        const status = this.slotStatus.get(slotId);
        if (!status) return;
        if (status.isEvolving) return;
        if (this.evolutionQueue.includes(slotId)) return;

        this.evolutionQueue.push(slotId);
        this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            while (
                this.evolutionQueue.length > 0 &&
                this.activeEvolutions < this.config.maxConcurrentEvolutions
            ) {
                const slotId = this.evolutionQueue.shift();
                if (!slotId) break;

                this.activeEvolutions++;
                try {
                    await this.runEvolutionCycle(slotId);
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`[EvolutionScheduler] Evolution failed for ${slotId}:`, msg);
                } finally {
                    this.activeEvolutions--;
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private async runEvolutionCycle(slotId: string): Promise<void> {
        const status = this.getOrCreateSlotStatus(slotId);
        const island = this.cortex.getIsland(slotId);
        if (!island) {
            console.warn(`[EvolutionScheduler] Island ${slotId} not found, skipping`);
            return;
        }

        status.isEvolving = true;
        const startTime = Date.now();

        try {
            // Get the island's current market candles
            const candles = island.getMarketCandles();
            if (!candles || candles.length < 200) {
                console.warn(
                    `[EvolutionScheduler] Insufficient candles for ${slotId}: ${candles?.length ?? 0} (need 200+)`,
                );
                return;
            }

            // Get current population from the evolution engine
            const currentGen = island.getCurrentGeneration();
            if (!currentGen) {
                console.warn(`[EvolutionScheduler] No current generation for ${slotId}`);
                return;
            }

            // Run batch backtest on the population
            const population = currentGen.population;
            const backtestResults = batchBacktest(population, candles);

            // Assign fitness scores back to strategies
            for (const result of backtestResults) {
                const strategy = population.find((s: StrategyDNA) => s.id === result.strategyId);
                if (strategy) {
                    strategy.metadata.fitnessScore = result.fitnessScore;
                }
            }

            // Trigger evolution (next generation)
            island.evolve();

            // Update status
            const durationMs = Date.now() - startTime;
            const bestFitness = backtestResults.length > 0
                ? Math.max(...backtestResults.map(r => r.fitnessScore))
                : 0;

            status.candlesSinceLastEvolution = 0;
            status.lastEvolutionTimestamp = Date.now();
            status.totalEvolutionCycles++;
            status.lastBacktestDurationMs = durationMs;
            status.lastGenerationFitness = bestFitness;

            console.log(
                `[EvolutionScheduler] ✅ ${slotId} — Gen ${currentGen.generationNumber + 1}` +
                ` | Best: ${bestFitness.toFixed(1)} | ${durationMs}ms` +
                ` | ${population.length} strategies × ${candles.length} candles`,
            );

            // Emit callback
            if (this.onEvolutionComplete) {
                this.onEvolutionComplete(
                    slotId,
                    currentGen.generationNumber + 1,
                    bestFitness,
                    durationMs,
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[EvolutionScheduler] Evolution cycle error for ${slotId}:`, msg);
            throw error; // Re-throw for processQueue error handler
        } finally {
            status.isEvolving = false;
        }
    }
}
