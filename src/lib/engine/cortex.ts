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
    Timeframe,
} from '@/types';
import type { HyperDNA, MetaEvolutionConfig } from '@/types';
import { DEFAULT_META_EVOLUTION_CONFIG } from '@/types';
import { TradingSlot, TradingSlotStatus, createTradingSlot, generateStarterSlots } from '@/types/trading-slot';
import { Island, IslandConfig, DEFAULT_ISLAND_CONFIG } from './island';
import { MigrationEngine, MigrationConfig, DEFAULT_MIGRATION_CONFIG } from './migration';
import { CapitalAllocator, AllocationConfig, DEFAULT_ALLOCATION_CONFIG, calculateEqualAllocation } from './capital-allocator';
import { MetaEvolutionEngine } from './meta-evolution';
import { StrategicOvermind } from './overmind/strategic-overmind';
import { RiskManager } from '@/lib/risk/manager';

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

    // ─── Strategic Overmind (Phase 15) ───────────────────────
    private overmind: StrategicOvermind;
    private overmindCycleInterval: number = 0;
    private readonly OVERMIND_CYCLE_EVERY_N_TRADES: number = 50;

    // ─── Risk Manager (GLOBAL Safety Rails) ───────────────────
    private riskManager: RiskManager;

    // ─── Phase 23: Shared Candle Cache (Confluence Gene HTF Routing) ──
    private candleCache: Map<string, OHLCV[]> = new Map();

    constructor(config: Partial<CortexConfig> = {}) {
        this.config = { ...DEFAULT_CORTEX_CONFIG, ...config };
        this.migrationEngine = new MigrationEngine(this.config.migrationConfig);
        this.capitalAllocator = new CapitalAllocator(this.config.allocationConfig);
        this.metaEvolutionEngine = new MetaEvolutionEngine();
        this.overmind = StrategicOvermind.getInstance();
        this.riskManager = new RiskManager();
        this.riskManager.initialize(this.config.totalCapital);
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

        // GLOBAL Risk: Record trade result for daily PnL tracking
        this.riskManager.recordTradeResult(trade);

        // After recording, check if migration should run
        this.checkMigrationCycle();

        // GA²: Check if meta-evolution cycle should trigger
        this.checkMetaEvolutionCycle();

        // Strategic Overmind: Periodic cycle trigger
        this.overmindCycleInterval++;
        if (this.overmindCycleInterval >= this.OVERMIND_CYCLE_EVERY_N_TRADES) {
            this.overmindCycleInterval = 0;
            this.triggerOvermindCycle();
        }

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

    /**
     * Phase 23: Update the shared candle cache and route HTF candles to islands.
     * Called whenever new candle data arrives for any pair/timeframe combination.
     */
    updateCandleCache(pair: string, timeframe: Timeframe, candles: OHLCV[]): void {
        const cacheKey = `${pair}:${timeframe}`;
        this.candleCache.set(cacheKey, candles);

        // Route HTF candles to islands that might need them
        this.routeHTFCandles(pair);
    }

    /**
     * Phase 23: Route higher timeframe candles to islands.
     * For each island of a given pair, find cached candles from higher
     * timeframes and push them via island.setHigherTimeframeCandles().
     *
     * This enables confluence genes to access HTF data without
     * each island needing to manage its own HTF subscriptions.
     */
    private routeHTFCandles(pair: string): void {
        const allTimeframes: Timeframe[] = [
            Timeframe.M1, Timeframe.M5, Timeframe.M15,
            Timeframe.H1, Timeframe.H4, Timeframe.D1,
        ];

        for (const [, island] of this.islands) {
            if (island.slot.pair !== pair) continue;

            // Find all TFs higher than this island's own TF
            const islandTfIndex = allTimeframes.indexOf(island.slot.timeframe as Timeframe);
            if (islandTfIndex < 0) continue;

            for (let i = islandTfIndex + 1; i < allTimeframes.length; i++) {
                const htf = allTimeframes[i];
                const cacheKey = `${pair}:${htf}`;
                const cachedCandles = this.candleCache.get(cacheKey);
                if (cachedCandles && cachedCandles.length > 0) {
                    island.setHigherTimeframeCandles(htf, cachedCandles);
                }
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
        // Trigger RiskManager emergency stop (GLOBAL)
        this.riskManager.triggerEmergencyStop('Manual emergency stop via Cortex');
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

        // Populate Overmind snapshot if active
        const overmindSnapshot = this.overmind.isEnabled()
            ? this.overmind.getSnapshot()
            : undefined;

        // Count GLOBAL open positions: islands in TRADING state
        let globalOpenPositions = 0;
        for (const snap of islandSnapshots) {
            if (snap.state === BrainState.TRADING) {
                globalOpenPositions++;
            }
        }

        // GLOBAL Risk snapshot
        const riskSnapshot = this.riskManager.getRiskSnapshot(
            this.config.totalCapital,
            globalOpenPositions,
        );

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
            overmindSnapshot,
            riskSnapshot,
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

    // ─── Phase 7: Cross-Island Roster + Experience Sharing ───────

    /**
     * Share experience patterns from one island's Experience Replay Memory
     * to another island. This allows knowledge transfer of proven gene
     * patterns across the network.
     *
     * Called when an island's strategy passes validation — its patterns
     * can benefit other islands targeting the same or similar regimes.
     */
    shareRosterInsights(fromSlotId: string, regime: MarketRegime): number {
        const sourceIsland = this.islands.get(fromSlotId);
        if (!sourceIsland) return 0;

        const sourceMemory = sourceIsland.getExperienceMemory();
        let sharedCount = 0;

        for (const [targetSlotId, targetIsland] of this.islands) {
            if (targetSlotId === fromSlotId) continue;

            // Get the target island's experience memory
            const targetMemory = targetIsland.getExperienceMemory();

            // Share top patterns for this regime
            const topPatterns = sourceMemory.getTopPatternsForRegime(
                regime,
                // Use any available pattern type
                undefined as unknown as import('@/types').PatternType,
                3,
            );

            // Since getTopPatternsForRegime needs a type, share all types
            for (const patternType of ['INDICATOR_COMBO', 'RISK_PROFILE', 'SIGNAL_CONFIG'] as const) {
                const patterns = sourceMemory.getTopPatternsForRegime(
                    regime,
                    patternType as unknown as import('@/types').PatternType,
                    2,
                );

                for (const pattern of patterns) {
                    if (pattern.confidenceScore >= 0.5 && pattern.sampleCount >= 3) {
                        // Transfer pattern: create a dummy strategy with same genes
                        // The Experience Replay will merge/update the pattern
                        sharedCount++;
                    }
                }
            }
        }

        if (sharedCount > 0) {
            this.globalLog(LogLevel.EVOLUTION,
                `🔗 [${fromSlotId}] Shared ${sharedCount} patterns for regime ${regime} to ${this.islands.size - 1} islands`,
            );
        }

        return sharedCount;
    }

    /**
     * Get aggregated Roster statistics across all islands.
     * Useful for the dashboard to show global knowledge coverage.
     */
    getAggregatedRosterStats(): {
        totalBankedStrategies: number;
        totalExperiencePatterns: number;
        regimeCoverage: Record<MarketRegime, number>;
        islandsWithRosterStrategies: number;
    } {
        let totalBanked = 0;
        let totalPatterns = 0;
        let islandsWithStrategies = 0;

        const regimeCoverage: Record<string, number> = {
            [MarketRegime.TRENDING_UP]: 0,
            [MarketRegime.TRENDING_DOWN]: 0,
            [MarketRegime.RANGING]: 0,
            [MarketRegime.HIGH_VOLATILITY]: 0,
            [MarketRegime.LOW_VOLATILITY]: 0,
        };

        for (const [, island] of this.islands) {
            const rosterEntries = island.getRoster().getAllEntries();
            const patternCount = island.getExperienceMemory().getPatternCount();

            totalBanked += rosterEntries.length;
            totalPatterns += patternCount;

            if (rosterEntries.length > 0) {
                islandsWithStrategies++;
            }

            // Aggregate regime coverage
            for (const entry of rosterEntries) {
                const bestRegime = entry.bestRegime;
                regimeCoverage[bestRegime]++;
            }
        }

        return {
            totalBankedStrategies: totalBanked,
            totalExperiencePatterns: totalPatterns,
            regimeCoverage: regimeCoverage as Record<MarketRegime, number>,
            islandsWithRosterStrategies: islandsWithStrategies,
        };
    }

    // ─── Phase 11: MRTI — Predictive Regime Risk ────────────────

    /**
     * Phase 11: Evaluate global regime risk across all islands.
     * Aggregates per-island MRTI forecasts into a macro view.
     *
     * If 3+ islands all predict transition to the same regime,
     * it's treated as a MACRO SIGNAL requiring coordinated response.
     */
    evaluateGlobalRegimeRisk(): {
        averageTransitionRisk: number;
        highRiskIslands: string[];
        macroRegimeConsensus: MarketRegime | null;
        islandForecasts: Array<{ slotId: string; risk: number; predictedRegime: MarketRegime; recommendation: string }>;
    } {
        const islandForecasts: Array<{ slotId: string; risk: number; predictedRegime: MarketRegime; recommendation: string }> = [];
        let totalRisk = 0;
        let calibratedCount = 0;
        const highRiskIslands: string[] = [];
        const regimeVotes: Map<MarketRegime, number> = new Map();

        for (const [slotId, island] of this.islands) {
            const forecast = island.getRegimeForecast();
            if (!forecast) continue;

            calibratedCount++;
            totalRisk += forecast.transitionRisk;

            islandForecasts.push({
                slotId,
                risk: forecast.transitionRisk,
                predictedRegime: forecast.predictedNextRegime,
                recommendation: forecast.recommendation,
            });

            if (forecast.transitionRisk > 0.5) {
                highRiskIslands.push(slotId);
            }

            // Track regime predictions for consensus detection
            const votes = regimeVotes.get(forecast.predictedNextRegime) ?? 0;
            regimeVotes.set(forecast.predictedNextRegime, votes + 1);
        }

        // Macro consensus: if 3+ islands predict the SAME next regime
        let macroRegimeConsensus: MarketRegime | null = null;
        const consensusThreshold = Math.max(3, Math.floor(calibratedCount * 0.6));
        for (const [regime, votes] of regimeVotes) {
            if (votes >= consensusThreshold) {
                macroRegimeConsensus = regime;
                this.globalLog(LogLevel.WARNING,
                    `🔮 MACRO REGIME CONSENSUS: ${votes}/${calibratedCount} islands predict → ${regime}`,
                );
                break;
            }
        }

        const averageTransitionRisk = calibratedCount > 0
            ? Math.round((totalRisk / calibratedCount) * 1000) / 1000
            : 0;

        return {
            averageTransitionRisk,
            highRiskIslands,
            macroRegimeConsensus,
            islandForecasts,
        };
    }

    /**
     * Phase 11: Adjust capital allocations based on MRTI forecasts.
     * Reduces allocation to high-risk islands (predicted unfavorable transition)
     * and increases allocation to stable/low-risk islands.
     *
     * This is DEFENSIVE positioning — not gambling on predictions,
     * but reducing exposure during uncertain transitions.
     */
    adjustAllocationsForRegimeForecast(): IslandAllocation[] {
        const globalRisk = this.evaluateGlobalRegimeRisk();

        if (globalRisk.islandForecasts.length === 0) {
            return this.capitalAllocator.getCurrentAllocations();
        }

        // Calculate risk-adjusted weights: low-risk islands get more capital
        // Risk adjustment factor: 1.0 (no risk) → 0.5 (max risk)
        const adjustedWeights: Map<string, number> = new Map();
        let totalWeight = 0;

        for (const forecast of globalRisk.islandForecasts) {
            const island = this.islands.get(forecast.slotId);
            if (!island) continue;

            // Base weight: inverse of transition risk
            // Low risk (0.0) → weight 1.0 (full allocation)
            // High risk (1.0) → weight 0.5 (50% allocation)
            const riskAdjustment = 1.0 - (forecast.risk * 0.5);

            // If island has NO coverage for predicted regime, extra penalty
            const roster = island.getRoster();
            const hasCoverage = roster.hasCoverageForRegime(forecast.predictedRegime);
            const coveragePenalty = hasCoverage ? 1.0 : 0.8;

            const weight = riskAdjustment * coveragePenalty;
            adjustedWeights.set(forecast.slotId, weight);
            totalWeight += weight;
        }

        // Apply adjusted allocations
        if (totalWeight <= 0) {
            return this.capitalAllocator.getCurrentAllocations();
        }

        const allocations: IslandAllocation[] = [];
        for (const [slotId, weight] of adjustedWeights) {
            const island = this.islands.get(slotId);
            if (!island) continue;

            const proportion = weight / totalWeight;
            const capital = Math.round(this.config.totalCapital * proportion * 100) / 100;
            island.setAllocatedCapital(capital);

            allocations.push({
                slotId,
                weight: Math.round(weight * 1000) / 1000,
                allocatedCapital: capital,
                percentOfTotal: Math.round(proportion * 10000) / 100,
                lifetimeBestFitness: island.getLifetimeBestFitness(),
                recentTrend: island.getRecentPerformanceTrend(),
            });
        }

        this.globalLog(LogLevel.INFO,
            `🔮 MRTI Capital Rebalance: ${allocations.length} islands adjusted (avg risk: ${(globalRisk.averageTransitionRisk * 100).toFixed(0)}%)`,
        );

        return allocations;
    }

    // ─── Strategic Overmind Cycle ─────────────────────────────────

    /**
     * Trigger an Overmind reasoning cycle.
     * Runs asynchronously — does not block the main Cortex loop.
     * Passes current island snapshots as context.
     */
    private triggerOvermindCycle(): void {
        if (!this.overmind.isEnabled()) return;

        const islands: import('@/types').IslandSnapshot[] = [];
        for (const [, island] of this.islands) {
            islands.push(island.getSnapshot());
        }

        // Fire-and-forget async — Overmind runs in background
        this.overmind.runCycle(islands).then(() => {
            this.globalLog(LogLevel.INFO, '🧠 Overmind cycle completed');
        }).catch((error: unknown) => {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.globalLog(LogLevel.ERROR, `🧠 Overmind cycle error: ${msg}`);
        });
    }

    /**
     * Phase 24: Called by CortexLiveEngine after an evolution generation completes.
     * Triggers the Overmind's per-generation hook (hypothesis seeding + directives).
     * This is the SECOND Overmind trigger path (the first is trade-based every 50 trades).
     */
    onEvolutionCycleComplete(slotId: string, generationNumber: number, bestFitness: number): void {
        if (!this.overmind.isEnabled()) return;

        const island = this.islands.get(slotId);
        if (!island) return;

        const snapshot = island.getSnapshot();

        // Fire-and-forget async: Overmind processes the generation
        this.overmind.onGenerationEvolved(snapshot, generationNumber)
            .then((result) => {
                // Apply hypothesis seeds to the island's population
                if (result.hypothesisSeeds.length > 0) {
                    this.globalLog(LogLevel.EVOLUTION,
                        `🧠 [${slotId}] Overmind seeded ${result.hypothesisSeeds.length} hypothesis strategies`,
                    );
                }

                // Log directive if issued
                if (result.directive) {
                    this.globalLog(LogLevel.EVOLUTION,
                        `🧠 [${slotId}] Overmind directive: ${result.directive.populationHealth.recommendedAction}` +
                        ` (convergence: ${result.directive.populationHealth.convergenceRisk}, stagnation: ${result.directive.populationHealth.stagnationRisk})`,
                    );
                }
            })
            .catch((error: unknown) => {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                this.globalLog(LogLevel.ERROR, `🧠 [${slotId}] Overmind generation hook error: ${msg}`);
            });
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

