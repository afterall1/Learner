// ============================================================
// Learner: Island — Self-Contained Evolution Unit
// ============================================================
// Each Island is an isolated evolution environment scoped to
// one TradingSlot (pair + timeframe). It has its own population,
// evolution engine, validation pipeline, and trade history.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    BrainState,
    BrainLog,
    LogLevel,
    StrategyDNA,
    StrategyStatus,
    Trade,
    TradeStatus,
    EvolutionGeneration,
    PerformanceMetrics,
    MarketRegime,
    OHLCV,
    IslandSnapshot,
    StrategyValidation,
    RegimeGeneMemory,
} from '@/types';
import type { HyperDNA } from '@/types';
import { TradingSlot, TradingSlotStatus } from '@/types/trading-slot';
import { EvolutionEngine, DEFAULT_EVOLUTION_CONFIG, EvolutionConfig } from './evolution';
import { MetaEvolutionEngine } from './meta-evolution';
import { generateRandomStrategy } from './strategy-dna';
import { evaluatePerformance, calculateFitnessScore, calculateDeflatedFitness } from './evaluator';
import { runWalkForwardAnalysis } from './walk-forward';
import { runMonteCarloPermutation } from './monte-carlo';
import { detectRegime, classifyTradeRegime, calculateRegimeDiversity } from './regime-detector';
import { StrategyRoster } from './strategy-roster';
import { ExperienceReplayMemory } from './experience-replay';
import { calculateOverfittingScore } from './overfitting-detector';
import {
    RegimeIntelligence,
    type RegimeTransitionForecast,
} from './regime-intelligence';
import { TradeForensicsEngine } from './trade-forensics';
import { ForensicLearningEngine } from './forensic-learning';
import { getPersistenceBridge, type PersistenceBridge } from './persistence-bridge';
import { calculateATR } from './regime-detector';

// ─── Island Configuration ────────────────────────────────────

export interface IslandConfig {
    populationSize: number;
    tradesPerEvaluation: number;
    maxConcurrentStrategies: number;
    validationTradesMin: number;
    minRegimesRequired: number;
    evolutionConfig: Partial<EvolutionConfig>;
}

export const DEFAULT_ISLAND_CONFIG: IslandConfig = {
    populationSize: 10,
    tradesPerEvaluation: 30,
    maxConcurrentStrategies: 1,
    validationTradesMin: 30,
    minRegimesRequired: 2,
    evolutionConfig: {},
};

// ─── Island Class ────────────────────────────────────────────

export class Island {
    readonly slot: TradingSlot;
    private state: BrainState = BrainState.IDLE;
    private config: IslandConfig;
    private evolutionEngine: EvolutionEngine;
    private activeStrategy: StrategyDNA | null = null;
    private candidateStrategies: StrategyDNA[] = [];
    private tradeHistory: Trade[] = [];
    private tradesByStrategy: Map<string, Trade[]> = new Map();
    private logs: BrainLog[] = [];
    private totalTrades: number = 0;
    private validatedStrategies: StrategyDNA[] = [];
    private retiredStrategies: StrategyDNA[] = [];
    private tradeRegimeMap: Map<string, MarketRegime> = new Map();

    // ─── Phase 7: Strategy Roster + Experience Replay ─────────
    private readonly roster: StrategyRoster = new StrategyRoster();
    private readonly experienceMemory: ExperienceReplayMemory = new ExperienceReplayMemory();
    private currentRegime: MarketRegime | null = null;
    private marketCandles: OHLCV[] = [];
    private allocatedCapital: number = 0;

    // ─── Meta-Evolution (GA²) ────────────────────────────────
    private hyperDna: HyperDNA | null = null;
    private generationFitnessHistory: number[] = [];  // Best fitness per generation
    private validationAttempts: number = 0;
    private validationPasses: number = 0;
    private diversityIndexHistory: number[] = [];      // Diversity per generation

    // ─── Phase 11: MRTI — Predictive Regime Intelligence ─────
    private readonly regimeIntelligence: RegimeIntelligence = new RegimeIntelligence();
    private lastForecast: RegimeTransitionForecast | null = null;
    private preWarmedStrategyId: string | null = null;

    // ─── Phase 12: Trade Forensics ─────────────────────────
    private readonly tradeForensics: TradeForensicsEngine = new TradeForensicsEngine();

    // ─── Phase 12.1: Forensic Learning (Closed Loop) ─────────
    private readonly forensicLearning: ForensicLearningEngine = new ForensicLearningEngine();

    // ─── Phase 13.1: Persistence Bridge ──────────────────
    private readonly persistenceBridge: PersistenceBridge = getPersistenceBridge();

    constructor(slot: TradingSlot, config: Partial<IslandConfig> = {}, hyperDna?: HyperDNA) {
        this.slot = slot;
        this.config = { ...DEFAULT_ISLAND_CONFIG, ...config };

        // If HyperDNA is provided, use it to configure the evolution engine
        if (hyperDna) {
            this.hyperDna = hyperDna;
            const metaEngine = new MetaEvolutionEngine();
            const evoConfig = metaEngine.hyperDnaToEvolutionConfig(hyperDna);
            this.evolutionEngine = new EvolutionEngine(evoConfig);
            this.log(LogLevel.INFO, `🧬² [${slot.id}] Using HyperDNA: ${hyperDna.id.slice(0, 8)}`);
        } else {
            this.evolutionEngine = new EvolutionEngine({
                ...DEFAULT_EVOLUTION_CONFIG,
                populationSize: this.config.populationSize,
                minTradesForEvaluation: this.config.tradesPerEvaluation,
                ...this.config.evolutionConfig,
            });
        }
    }

    // ─── Lifecycle ───────────────────────────────────────────────

    /**
     * Start the island — create initial population and begin evolution.
     */
    start(): IslandSnapshot {
        this.state = BrainState.EXPLORING;
        this.slot.status = TradingSlotStatus.ACTIVE;
        this.log(LogLevel.INFO, `🏝️ Island [${this.slot.id}] ACTIVATED`);

        // Phase 7: Seed genesis from Experience Replay if available
        const genesis = this.evolutionEngine.createInitialGeneration(
            this.experienceMemory,
            this.currentRegime ?? undefined,
        );

        // Tag all strategies with this island's slot ID
        for (const strategy of genesis.population) {
            strategy.slotId = this.slot.id;
            strategy.preferredPairs = [this.slot.pair];
            strategy.preferredTimeframe = this.slot.timeframe;
        }

        this.candidateStrategies = genesis.population;
        this.activeStrategy = this.candidateStrategies[0];
        this.activeStrategy.status = StrategyStatus.PAPER;

        const seededCount = genesis.population.filter(
            s => s.metadata.mutationHistory[0]?.startsWith('seeded:'),
        ).length;
        this.log(LogLevel.EVOLUTION, `Genesis: ${genesis.population.length} strategies for ${this.slot.pair}/${this.slot.timeframe} (${seededCount} seeded from Replay)`, {
            slotId: this.slot.id,
        });

        return this.getSnapshot();
    }

    pause(): IslandSnapshot {
        this.state = BrainState.PAUSED;
        this.slot.status = TradingSlotStatus.PAUSED;
        this.log(LogLevel.WARNING, `⏸️ Island [${this.slot.id}] PAUSED`);
        return this.getSnapshot();
    }

    resume(): IslandSnapshot {
        this.state = this.activeStrategy ? BrainState.TRADING : BrainState.EXPLORING;
        this.slot.status = TradingSlotStatus.ACTIVE;
        this.log(LogLevel.INFO, `▶️ Island [${this.slot.id}] RESUMED`);
        return this.getSnapshot();
    }

    emergencyStop(): IslandSnapshot {
        this.state = BrainState.EMERGENCY_STOP;
        this.slot.status = TradingSlotStatus.PAUSED;
        this.log(LogLevel.ERROR, `🚨 Island [${this.slot.id}] EMERGENCY STOP`);
        return this.getSnapshot();
    }

    // ─── Market Data ─────────────────────────────────────────────

    updateMarketData(candles: OHLCV[]): void {
        this.marketCandles = candles;
        try {
            if (candles.length >= 60) {
                const analysis = detectRegime(candles);
                const previousRegime = this.currentRegime;
                this.currentRegime = analysis.currentRegime;

                // Phase 11: Calibrate MRTI on first substantial data
                if (candles.length >= 200 && !this.regimeIntelligence.isCalibrated()) {
                    this.regimeIntelligence.calibrate(candles);
                    this.log(LogLevel.INFO, `🔮 [${this.slot.id}] MRTI calibrated (${this.regimeIntelligence.getMatrixSnapshot().totalTransitions} transitions)`);
                }

                // Phase 11: Generate regime forecast
                if (this.regimeIntelligence.isCalibrated()) {
                    this.lastForecast = this.regimeIntelligence.forecast(candles);
                    this.handleRegimeForecast(this.lastForecast);
                }

                // Phase 7: Handle regime transition via Roster
                if (previousRegime !== null && previousRegime !== this.currentRegime) {
                    this.handleRegimeTransition(this.currentRegime);
                }

                // Phase 12: Tick all active trade black boxes
                if (this.tradeForensics && candles.length > 0) {
                    const latestCandle = candles[candles.length - 1];
                    const currentATR = candles.length >= 14 ? calculateATR(candles, 14) : 0;
                    this.tradeForensics.tickAll(
                        latestCandle,
                        this.currentRegime ?? MarketRegime.RANGING,
                        {}, // Indicators computed at tick level; placeholder for now
                        currentATR,
                    );
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.log(LogLevel.WARNING, `Regime detection failed: ${msg}`);
        }
    }

    /**
     * Phase 11: Handle MRTI regime transition forecast.
     * Pre-warms the Roster strategy for the predicted next regime
     * when transition risk is elevated.
     */
    handleRegimeForecast(forecast: RegimeTransitionForecast): void {
        if (forecast.recommendation === 'PREPARE') {
            // Pre-warm: identify the best strategy for predicted regime WITHOUT switching
            const preWarmed = this.roster.preWarmForRegime(forecast.predictedNextRegime);
            if (preWarmed) {
                this.preWarmedStrategyId = preWarmed.strategy.id;
                this.log(LogLevel.INFO,
                    `🔮 [${this.slot.id}] MRTI PREPARE: Pre-warmed "${preWarmed.strategy.name}" ` +
                    `for ${forecast.predictedNextRegime} (risk: ${(forecast.transitionRisk * 100).toFixed(0)}%, ` +
                    `est. ${forecast.estimatedCandlesRemaining} candles remaining)`,
                );
            } else {
                this.preWarmedStrategyId = null;
                this.log(LogLevel.WARNING,
                    `🔮 [${this.slot.id}] MRTI PREPARE: No strategy for ${forecast.predictedNextRegime} — evolution needed`,
                );
            }
        } else if (forecast.recommendation === 'SWITCH') {
            // Proactive switch: transition risk is critical
            const preWarmed = this.roster.preWarmForRegime(forecast.predictedNextRegime);
            if (preWarmed) {
                // Proactively switch to the predicted regime's strategy
                this.handleRegimeTransition(forecast.predictedNextRegime);
                this.log(LogLevel.EVOLUTION,
                    `🔮 [${this.slot.id}] MRTI SWITCH: Proactively switched to "${preWarmed.strategy.name}" ` +
                    `for predicted ${forecast.predictedNextRegime} (risk: ${(forecast.transitionRisk * 100).toFixed(0)}%)`,
                );
            }
        }
        // HOLD: no action needed, current strategy remains active
    }

    /**
     * Phase 7: Handle a market regime transition.
     * If the Roster has a proven strategy for the new regime, activate it
     * instantly. Otherwise, continue with evolution.
     */
    handleRegimeTransition(newRegime: MarketRegime): void {
        const rosterSwitch = this.roster.handleRegimeTransition(newRegime);

        if (rosterSwitch !== null) {
            // Roster has a proven strategy — activate it!
            this.activeStrategy = rosterSwitch.strategy;
            this.state = BrainState.TRADING;
            this.preWarmedStrategyId = null; // Clear pre-warm
            this.log(LogLevel.EVOLUTION,
                `🔄 [${this.slot.id}] REGIME → ${newRegime}: Roster activated "${rosterSwitch.strategy.name}" ` +
                `(confidence: ${rosterSwitch.confidenceScore}, activations: ${rosterSwitch.activationCount})`,
            );
        } else {
            // No Roster strategy available — evolution must find one
            this.log(LogLevel.WARNING,
                `🔄 [${this.slot.id}] REGIME → ${newRegime}: No Roster strategy available — evolving`,
            );
        }
    }

    // ─── Trade Recording ─────────────────────────────────────────

    recordTrade(trade: Trade): IslandSnapshot {
        this.tradeHistory.push(trade);
        this.totalTrades++;

        const stratTrades = this.tradesByStrategy.get(trade.strategyId) ?? [];
        stratTrades.push(trade);
        this.tradesByStrategy.set(trade.strategyId, stratTrades);

        // Tag trade with current market regime
        if (this.currentRegime) {
            this.tradeRegimeMap.set(trade.id, this.currentRegime);
        } else if (this.marketCandles.length >= 60) {
            try {
                const regime = classifyTradeRegime(trade, this.marketCandles);
                this.tradeRegimeMap.set(trade.id, regime);
            } catch {
                this.tradeRegimeMap.set(trade.id, MarketRegime.RANGING);
            }
        }

        // Phase 12: Trade Forensics — open black box on entry, analyze on close
        const tradeRegime = this.tradeRegimeMap.get(trade.id) ?? MarketRegime.RANGING;
        if (trade.status !== TradeStatus.CLOSED && !this.tradeForensics.hasActiveBlackBox(trade.id)) {
            // Trade just opened — start recording
            const currentATR = this.marketCandles.length >= 14
                ? calculateATR(this.marketCandles, 14)
                : 0;
            this.tradeForensics.openBlackBox(
                trade,
                tradeRegime,
                trade.indicators ?? {},
                currentATR,
            );
        }

        if (trade.status === TradeStatus.CLOSED) {
            const pnlStr = trade.pnlPercent !== null
                ? `${trade.pnlPercent > 0 ? '+' : ''}${(trade.pnlPercent * 100).toFixed(2)}%`
                : 'N/A';
            this.log(LogLevel.TRADE, `[${this.slot.id}] Trade closed: ${trade.symbol} → ${pnlStr}`);

            // Phase 12: Close black box and generate forensic report
            const forensicReport = this.tradeForensics.closeAndAnalyze(
                trade,
                trade.indicators ?? {},
            );
            if (forensicReport && forensicReport.lessons.length > 0) {
                this.log(LogLevel.INFO,
                    `🔍 [${this.slot.id}] Forensics: ${forensicReport.lessons.length} lessons extracted ` +
                    `(entry eff: ${forensicReport.entryEfficiency}%, exit eff: ${forensicReport.exitEfficiency}%, ` +
                    `cause: ${forensicReport.primaryCause})`,
                );

                // Phase 12.1: Feed lessons into Bayesian learning engine (CLOSES THE LOOP)
                this.forensicLearning.ingestLessons(forensicReport.lessons);

                // Phase 13.1: Persist forensic report to IndexedDB
                this.persistenceBridge.onForensicReportGenerated(forensicReport);
            }

            // Phase 13.1: Persist closed trade to IndexedDB
            this.persistenceBridge.onTradeRecorded(trade);

            const closedCount = (this.tradesByStrategy.get(trade.strategyId) ?? [])
                .filter(t => t.status === TradeStatus.CLOSED).length;

            if (closedCount >= this.config.tradesPerEvaluation) {
                this.triggerEvaluation();
            }
        }

        return this.getSnapshot();
    }

    // ─── Evaluation & Evolution ──────────────────────────────────

    private triggerEvaluation(): void {
        this.state = BrainState.EVALUATING;
        this.log(LogLevel.EVOLUTION, `📊 [${this.slot.id}] Evaluation triggered`);

        const currentGen = this.evolutionEngine.getLatestGeneration();
        if (!currentGen) return;

        let allEvaluated = true;
        for (const strategy of currentGen.population) {
            const trades = this.tradesByStrategy.get(strategy.id) ?? [];
            const closed = trades.filter(t => t.status === TradeStatus.CLOSED);
            if (closed.length < this.config.tradesPerEvaluation) {
                allEvaluated = false;
                break;
            }
        }

        if (allEvaluated) {
            this.recordGenerationRegimePerformance(currentGen);
            this.validateTopStrategies(currentGen);
            this.evolve();
        } else {
            this.rotateToNextStrategy();
        }
    }

    /**
     * Run 4-Gate Validation Pipeline on a strategy.
     */
    validateStrategy(strategy: StrategyDNA): StrategyValidation {
        this.state = BrainState.VALIDATING;
        const trades = this.tradesByStrategy.get(strategy.id) ?? [];
        const gates: import('@/types').ValidationGateResult[] = [];

        // Gate 1: Walk-Forward Analysis
        let wfaResult: import('@/types').WalkForwardResult | null = null;
        try {
            wfaResult = runWalkForwardAnalysis(trades);
            gates.push({
                gateName: 'Walk-Forward Analysis',
                passed: wfaResult.passed,
                score: Math.round(wfaResult.averageEfficiency * 100),
                details: wfaResult.reason,
                timestamp: Date.now(),
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown';
            gates.push({ gateName: 'Walk-Forward Analysis', passed: false, score: 0, details: `Error: ${msg}`, timestamp: Date.now() });
        }

        // Gate 2: Monte Carlo
        let mcResult: import('@/types').MonteCarloResult | null = null;
        try {
            mcResult = runMonteCarloPermutation(trades);
            gates.push({
                gateName: 'Monte Carlo Permutation',
                passed: mcResult.isSignificant,
                score: Math.round(mcResult.percentileRank * 100),
                details: `p-value: ${mcResult.pValue.toFixed(4)}`,
                timestamp: Date.now(),
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown';
            gates.push({ gateName: 'Monte Carlo Permutation', passed: false, score: 0, details: `Error: ${msg}`, timestamp: Date.now() });
        }

        // Gate 3: Overfitting Detection
        const tradeRegimes = this.getTradeRegimes(trades);
        let overfittingReport: import('@/types').OverfittingReport | null = null;
        try {
            overfittingReport = calculateOverfittingScore(strategy, trades, wfaResult, mcResult, tradeRegimes);
            gates.push({
                gateName: 'Overfitting Detection',
                passed: overfittingReport.passed,
                score: overfittingReport.overallScore,
                details: `Score: ${overfittingReport.overallScore}/100`,
                timestamp: Date.now(),
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown';
            gates.push({ gateName: 'Overfitting Detection', passed: false, score: 100, details: `Error: ${msg}`, timestamp: Date.now() });
        }

        // Gate 4: Regime Diversity
        const diversity = calculateRegimeDiversity(tradeRegimes);
        const regimeGatePassed = diversity.uniqueRegimes >= this.config.minRegimesRequired;
        gates.push({
            gateName: 'Regime Diversity',
            passed: regimeGatePassed,
            score: diversity.uniqueRegimes,
            details: `${diversity.uniqueRegimes} regimes (min: ${this.config.minRegimesRequired})`,
            timestamp: Date.now(),
        });

        const overallPassed = gates.every(g => g.passed);

        const validation: StrategyValidation = {
            gates,
            overallPassed,
            walkForwardResult: wfaResult,
            monteCarloResult: mcResult,
            overfittingReport,
            regimesTraded: tradeRegimes,
            validatedAt: Date.now(),
            promotionStage: overallPassed ? StrategyStatus.CANDIDATE : StrategyStatus.RETIRED,
        };

        strategy.metadata.validation = validation;

        if (overallPassed) {
            strategy.status = StrategyStatus.CANDIDATE;
            this.validatedStrategies.push(strategy);

            // Phase 7: Bank strategy in Roster + record experience
            const strategyTrades = this.tradesByStrategy.get(strategy.id) ?? [];
            const regime = this.currentRegime ?? MarketRegime.RANGING;
            this.roster.addToRoster(strategy, regime, strategyTrades);
            this.experienceMemory.recordExperience(strategy, strategyTrades, regime);

            const rosterSize = this.roster.getAllEntries().length;
            const patternCount = this.experienceMemory.getPatternCount();
            this.log(LogLevel.EVOLUTION, `✅ [${this.slot.id}] ${strategy.name} PASSED → ROSTER (${rosterSize} banked, ${patternCount} patterns)`);
        } else {
            strategy.status = StrategyStatus.RETIRED;
            this.retiredStrategies.push(strategy);
            const failed = gates.filter(g => !g.passed).map(g => g.gateName);
            this.log(LogLevel.WARNING, `❌ [${this.slot.id}] ${strategy.name} FAILED: ${failed.join(', ')}`);
        }

        return validation;
    }

    private validateTopStrategies(generation: EvolutionGeneration): void {
        const sorted = [...generation.population]
            .sort((a, b) => b.metadata.fitnessScore - a.metadata.fitnessScore);
        const topCount = Math.min(3, sorted.length);
        for (let i = 0; i < topCount; i++) {
            if (sorted[i].metadata.fitnessScore > 0) {
                this.validateStrategy(sorted[i]);
            }
        }
    }

    private recordGenerationRegimePerformance(generation: EvolutionGeneration): void {
        for (const strategy of generation.population) {
            const trades = this.tradesByStrategy.get(strategy.id) ?? [];
            if (trades.length === 0 || !this.currentRegime) continue;
            const regimes = this.getTradeRegimes(trades);
            for (const regime of [...new Set(regimes)]) {
                this.evolutionEngine.recordRegimePerformance(strategy, regime, strategy.metadata.fitnessScore);
            }
        }
    }

    private getTradeRegimes(trades: Trade[]): MarketRegime[] {
        return trades.map(t => this.tradeRegimeMap.get(t.id)).filter((r): r is MarketRegime => r !== undefined);
    }

    private evolve(): void {
        this.state = BrainState.EVOLVING;
        const currentGen = this.evolutionEngine.getLatestGeneration();
        if (!currentGen) return;

        this.log(LogLevel.EVOLUTION, `🧬 [${this.slot.id}] EVOLVING — Gen ${this.evolutionEngine.getCurrentGenerationNumber() + 1}`);

        // Track best fitness for meta-evolution
        const bestFitness = Math.max(0, ...currentGen.population.map(s => s.metadata.fitnessScore));
        this.generationFitnessHistory.push(bestFitness);

        // Track diversity for meta-evolution
        const diversityIndex = this.evolutionEngine.calculateDiversityIndex(currentGen.population);
        this.diversityIndexHistory.push(diversityIndex);

        // Phase 7: Pass replay memory and regime for seeded injection
        const nextGen = this.evolutionEngine.evolveNextGeneration(
            currentGen,
            this.tradesByStrategy,
            this.experienceMemory,
            this.currentRegime ?? undefined,
        );

        // Tag all new strategies with this island's slot
        for (const strategy of nextGen.population) {
            strategy.slotId = this.slot.id;
            strategy.preferredPairs = [this.slot.pair];
            strategy.preferredTimeframe = this.slot.timeframe;
        }

        // Apply deflated fitness
        const totalTested = this.evolutionEngine.getTotalStrategiesTested();
        if (totalTested > 10) {
            for (const strategy of nextGen.population) {
                if (strategy.metadata.fitnessScore > 0) {
                    strategy.metadata.fitnessScore = calculateDeflatedFitness(strategy.metadata.fitnessScore, totalTested);
                }
            }
        }

        this.candidateStrategies = nextGen.population;
        this.activeStrategy = nextGen.population[0];

        for (const strategy of nextGen.population) {
            this.tradesByStrategy.set(strategy.id, []);
        }

        this.state = BrainState.TRADING;

        // Phase 13.1: Persist evolution to IndexedDB
        const best = this.evolutionEngine.getBestStrategyAllTime();
        this.persistenceBridge.onGenerationEvolved(
            this.evolutionEngine.getCurrentGenerationNumber(),
            bestFitness,
            nextGen.averageFitnessScore,
            nextGen.population.length,
            this.evolutionEngine.getCurrentMutationRate(),
            best ?? null,
            this.slot.id,
            nextGen.population,
        );
    }

    private rotateToNextStrategy(): void {
        const currentGen = this.evolutionEngine.getLatestGeneration();
        if (!currentGen) return;

        for (const strategy of currentGen.population) {
            const trades = this.tradesByStrategy.get(strategy.id) ?? [];
            const closed = trades.filter(t => t.status === TradeStatus.CLOSED);
            if (closed.length < this.config.tradesPerEvaluation) {
                this.activeStrategy = strategy;
                this.state = BrainState.TRADING;
                return;
            }
        }
    }

    // ─── Migration API ───────────────────────────────────────────

    /**
     * Export top strategies for migration to other islands.
     */
    exportElites(count: number = 1): StrategyDNA[] {
        const currentGen = this.evolutionEngine.getLatestGeneration();
        if (!currentGen) return [];

        return [...currentGen.population]
            .sort((a, b) => b.metadata.fitnessScore - a.metadata.fitnessScore)
            .slice(0, count);
    }

    /**
     * Import migrant strategies from another island.
     * They join the next generation as additional wild cards.
     */
    importMigrants(strategies: StrategyDNA[]): void {
        const currentGen = this.evolutionEngine.getLatestGeneration();
        if (!currentGen) return;

        for (const migrant of strategies) {
            // Re-scope the migrant to this island
            migrant.slotId = this.slot.id;
            migrant.preferredPairs = [this.slot.pair];
            migrant.preferredTimeframe = this.slot.timeframe;
            migrant.metadata.fitnessScore = 0; // Must prove itself
            migrant.metadata.tradeCount = 0;
            migrant.metadata.lastEvaluated = null;
            migrant.metadata.validation = null;
            migrant.metadata.mutationHistory = [...migrant.metadata.mutationHistory, `migration:${this.slot.id}`];
            migrant.status = StrategyStatus.PAPER;

            currentGen.population.push(migrant);
        }

        this.log(LogLevel.EVOLUTION, `📬 [${this.slot.id}] Received ${strategies.length} migrants`);
    }

    // ─── Capital Management ──────────────────────────────────────

    setAllocatedCapital(capital: number): void {
        this.allocatedCapital = capital;
    }

    getAllocatedCapital(): number {
        return this.allocatedCapital;
    }

    // ─── Snapshot ─────────────────────────────────────────────────

    getSnapshot(): IslandSnapshot {
        return {
            slotId: this.slot.id,
            pair: this.slot.pair,
            timeframe: this.slot.timeframe,
            state: this.state,
            activeStrategy: this.activeStrategy,
            candidateStrategies: [...this.candidateStrategies],
            currentGeneration: this.evolutionEngine.getCurrentGenerationNumber(),
            totalGenerations: this.evolutionEngine.getGenerations().length,
            totalTrades: this.totalTrades,
            bestFitnessAllTime: this.evolutionEngine.getBestStrategyAllTime()?.metadata.fitnessScore ?? 0,
            currentMutationRate: this.evolutionEngine.getCurrentMutationRate(),
            currentRegime: this.currentRegime,
            validatedStrategies: [...this.validatedStrategies],
            retiredStrategies: this.retiredStrategies.slice(-20),
            allocatedCapital: this.allocatedCapital,
            performanceMetrics: this.getActiveStrategyMetrics(),
            logs: this.logs.slice(-50),
        };
    }

    getState(): BrainState {
        return this.state;
    }

    getActiveStrategy(): StrategyDNA | null {
        return this.activeStrategy;
    }

    getEvolutionEngine(): EvolutionEngine {
        return this.evolutionEngine;
    }

    /**
     * Phase 7: Get the Strategy Roster for cross-island insight sharing.
     */
    getRoster(): StrategyRoster {
        return this.roster;
    }

    /**
     * Phase 7: Get the Experience Replay Memory.
     */
    getExperienceMemory(): ExperienceReplayMemory {
        return this.experienceMemory;
    }

    /**
     * Phase 11: Get the latest MRTI regime forecast.
     */
    getRegimeForecast(): RegimeTransitionForecast | null {
        return this.lastForecast;
    }

    /**
     * Phase 11: Get the MRTI engine for advanced access.
     */
    getRegimeIntelligence(): RegimeIntelligence {
        return this.regimeIntelligence;
    }

    /**
     * Phase 12: Get the Trade Forensics Engine.
     */
    getTradeForensics(): TradeForensicsEngine {
        return this.tradeForensics;
    }

    /**
     * Phase 12.1: Get the Forensic Learning Engine (closed-loop feedback).
     */
    getForensicLearning(): ForensicLearningEngine {
        return this.forensicLearning;
    }

    getLifetimeBestFitness(): number {
        return this.evolutionEngine.getBestStrategyAllTime()?.metadata.fitnessScore ?? 0;
    }

    getRecentPerformanceTrend(): number {
        const gens = this.evolutionEngine.getGenerations();
        if (gens.length < 2) return 0;
        const recent = gens.slice(-5);
        if (recent.length < 2) return 0;
        const firstScore = recent[0].bestFitnessScore;
        const lastScore = recent[recent.length - 1].bestFitnessScore;
        if (firstScore === 0) return lastScore > 0 ? 1 : 0;
        return Math.max(-1, Math.min(1, (lastScore - firstScore) / firstScore));
    }

    // ─── Meta-Evolution (GA²) API ─────────────────────────────────

    /**
     * Get the current HyperDNA attached to this island.
     */
    getHyperDna(): HyperDNA | null {
        return this.hyperDna;
    }

    /**
     * Replace the island's HyperDNA and reconfigure the evolution engine.
     * Called by Cortex after meta-crossover to apply new evolution parameters.
     */
    replaceHyperDna(newHyperDna: HyperDNA): void {
        try {
            this.hyperDna = newHyperDna;
            const metaEngine = new MetaEvolutionEngine();
            const evoConfig = metaEngine.hyperDnaToEvolutionConfig(newHyperDna);

            // Reconfigure existing evolution engine with new parameters
            this.evolutionEngine = new EvolutionEngine(evoConfig);

            // Reset meta-tracking for the new HyperDNA
            this.generationFitnessHistory = [];
            this.validationAttempts = 0;
            this.validationPasses = 0;
            this.diversityIndexHistory = [];

            this.log(LogLevel.EVOLUTION, `🧬² [${this.slot.id}] HyperDNA replaced: ${newHyperDna.id.slice(0, 8)}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[Island:${this.slot.id}] HyperDNA replacement failed: ${msg}`);
        }
    }

    /**
     * Get generation fitness history for meta-fitness evaluation.
     */
    getGenerationFitnessHistory(): number[] {
        return [...this.generationFitnessHistory];
    }

    /**
     * Get validation statistics for meta-fitness evaluation.
     */
    getValidationStats(): { attempts: number; passes: number } {
        return { attempts: this.validationAttempts, passes: this.validationPasses };
    }

    /**
     * Get average diversity index for meta-fitness evaluation.
     */
    getAverageDiversityIndex(): number {
        if (this.diversityIndexHistory.length === 0) return 0;
        const sum = this.diversityIndexHistory.reduce((a, b) => a + b, 0);
        return sum / this.diversityIndexHistory.length;
    }

    /**
     * Record a validation attempt for meta-fitness tracking.
     * Called after each validation pipeline run.
     */
    recordValidationResult(passed: boolean): void {
        this.validationAttempts++;
        if (passed) this.validationPasses++;
    }

    private getActiveStrategyMetrics(): PerformanceMetrics | null {
        if (!this.activeStrategy) return null;
        const trades = this.tradesByStrategy.get(this.activeStrategy.id) ?? [];
        if (trades.length === 0) return null;
        return evaluatePerformance(trades);
    }

    private log(level: LogLevel, message: string, details?: Record<string, unknown>): void {
        this.logs.push({
            id: uuidv4(),
            timestamp: Date.now(),
            level,
            message,
            details: { ...details, slotId: this.slot.id },
            strategyId: this.activeStrategy?.id,
        });
        if (this.logs.length > 500) {
            this.logs = this.logs.slice(-500);
        }
    }
}
