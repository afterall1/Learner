// ============================================================
// Learner: Evolution Scheduler — Candle-Driven Evolution Timer
// ============================================================
// Determines WHEN to trigger backtesting + evolution for each
// island based on candle close events. Prevents CPU spikes by
// sequentializing evolution cycles and enforcing cooldowns.
//
// Phase 30: Integrates stress matrix into evolution pipeline.
// After batchBacktest(), top-3 candidates are stress-tested
// across 5 scenarios. Calibrated RRS blends into final fitness.
//
// Flow:
//   CandleClose → onCandleClose(slotId) → threshold check
//   → if ready: queue evolution → dequeue → batchBacktest() + evolve()
//   → stress test top-3 → calibrate RRS → blend fitness
//   → emit onEvolutionComplete callback
// ============================================================

import type { Cortex } from './cortex';
import { batchBacktest, IndicatorCache } from './backtester';
import { batchStressMatrix, type StressMatrixResult } from './stress-matrix';
import { AdaptiveStressCalibrator } from './adaptive-stress';
import { BacktestProfiler } from './backtest-profiler';
import type { OHLCV, EvolutionSchedulerConfig, EvolutionSlotStatus, StrategyDNA } from '@/types';
import { schedulerLog } from '@/lib/utils/logger';

// ─── Default Configuration ──────────────────────────────────

const DEFAULT_SCHEDULER_CONFIG: EvolutionSchedulerConfig = {
    candlesPerEvolution: 10,
    maxConcurrentEvolutions: 1,
    cooldownMs: 5000,
    autoEvolveEnabled: true,
};

// ─── Stress Configuration ───────────────────────────────────

/** Number of top candidates to stress-test per evolution cycle */
const STRESS_TOP_N = 3;

/** Candles per stress scenario */
const STRESS_CANDLES = 300;

/** Fitness blend: backtest weight vs resilience weight */
const BACKTEST_WEIGHT = 0.7;
const RESILIENCE_WEIGHT = 0.3;

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
    private stressCalibrator: AdaptiveStressCalibrator;
    private profiler: BacktestProfiler;

    constructor(cortex: Cortex, config: Partial<EvolutionSchedulerConfig> = {}) {
        this.cortex = cortex;
        this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
        this.stressCalibrator = new AdaptiveStressCalibrator();
        this.profiler = BacktestProfiler.getInstance();
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

    /**
     * Get the adaptive stress calibrator for dashboard state.
     */
    getStressCalibrator(): AdaptiveStressCalibrator {
        return this.stressCalibrator;
    }

    /**
     * Get the performance profiler for dashboard telemetry.
     */
    getProfiler(): BacktestProfiler {
        return this.profiler;
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
                    schedulerLog.error(`Evolution failed for ${slotId}`, { error: msg });
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
            schedulerLog.warn(`Island ${slotId} not found, skipping`);
            return;
        }

        status.isEvolving = true;
        const startTime = Date.now();

        try {
            // Get the island's current market candles
            const candles = island.getMarketCandles();
            if (!candles || candles.length < 200) {
                schedulerLog.warn(`Insufficient candles for ${slotId}`, {
                    count: candles?.length ?? 0,
                    required: 200,
                });
                return;
            }

            // Get current population from the evolution engine
            const currentGen = island.getCurrentGeneration();
            if (!currentGen) {
                schedulerLog.warn(`No current generation for ${slotId}`);
                return;
            }

            // Run batch backtest on the population (PFLM shared cache)
            const population = currentGen.population;

            // Phase 34: Profile the evolution cycle
            this.profiler.startSession(slotId, population.length, candles.length);

            this.profiler.beginPhase('batch_backtest');
            const backtestResults = batchBacktest(population, candles);
            this.profiler.endPhase();

            // Record per-strategy timings from batch results
            for (const result of backtestResults) {
                this.profiler.recordStrategyTiming(result.executionTimeMs);
            }

            // Assign fitness scores back to strategies
            for (const result of backtestResults) {
                const strategy = population.find((s: StrategyDNA) => s.id === result.strategyId);
                if (strategy) {
                    strategy.metadata.fitnessScore = result.fitnessScore;
                }
            }

            // ─── Phase 30: Stress Matrix Integration ────────────
            //
            // Run stress matrix on top-N candidates to assess
            // regime resilience. Blend calibrated RRS into fitness.
            //
            let stressResults: StressMatrixResult[] = [];
            if (backtestResults.length >= STRESS_TOP_N) {
                const topCandidates = backtestResults
                    .slice(0, STRESS_TOP_N)
                    .map(r => population.find((s: StrategyDNA) => s.id === r.strategyId))
                    .filter((s): s is StrategyDNA => s !== undefined);

                if (topCandidates.length > 0) {
                    try {
                        this.profiler.beginPhase('stress_matrix');
                        stressResults = batchStressMatrix(topCandidates, STRESS_CANDLES);
                        this.profiler.endPhase();

                        // Apply calibrated RRS blending to top candidates
                        for (const stressResult of stressResults) {
                            const strategy = population.find(
                                (s: StrategyDNA) => s.id === stressResult.strategyId,
                            );
                            if (strategy) {
                                const backtestFitness = strategy.metadata.fitnessScore;
                                const calibrated = this.stressCalibrator.calibrateRRS(
                                    stressResult,
                                    backtestFitness,
                                );

                                // Blend: 70% backtest + 30% calibrated RRS
                                strategy.metadata.fitnessScore = calibrated.blendedFitness;

                                schedulerLog.debug('Stress calibration applied', {
                                    strategy: strategy.name,
                                    backtestFitness: Math.round(backtestFitness * 10) / 10,
                                    rrs: stressResult.resilienceScore,
                                    calibratedRRS: calibrated.calibratedScore,
                                    blendedFitness: calibrated.blendedFitness,
                                });
                            }
                        }

                        schedulerLog.info(`Stress matrix complete for ${slotId}`, {
                            candidates: topCandidates.length,
                            avgRRS: Math.round(
                                stressResults.reduce((s, r) => s + r.resilienceScore, 0) / stressResults.length,
                            ),
                        });
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : 'Unknown';
                        schedulerLog.warn('Stress matrix failed, using backtest fitness only', {
                            error: msg,
                        });
                    }
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

            schedulerLog.info(`✅ ${slotId} — Gen ${currentGen.generationNumber + 1}`, {
                bestFitness: Math.round(bestFitness * 10) / 10,
                durationMs,
                strategies: population.length,
                candles: candles.length,
                stressTested: stressResults.length,
            });

            // Phase 34: End profiler session
            this.profiler.endSession();

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
            schedulerLog.error(`Evolution cycle error for ${slotId}`, { error: msg });
            throw error; // Re-throw for processQueue error handler
        } finally {
            status.isEvolving = false;
        }
    }
}
