// ============================================================
// Learner: AI Brain — Main Orchestrator
// ============================================================
// Enhanced with: 4-Gate Validation Pipeline, 3-Stage Promotion
// (Paper → Candidate → Shadow → Active), Strategy Memory
// integration, and self-learning feedback loop.
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
    TradeDirection,
    EvolutionGeneration,
    Position,
    PerformanceMetrics,
    MarketRegime,
    OHLCV,
    StrategyValidation,
    ValidationGateResult,
    WalkForwardResult,
    MonteCarloResult,
    OverfittingReport,
    RegimeGeneMemory,
} from '@/types';
import { EvolutionEngine, DEFAULT_EVOLUTION_CONFIG } from './evolution';
import { generateRandomStrategy } from './strategy-dna';
import { evaluatePerformance, calculateFitnessScore, calculateDeflatedFitness } from './evaluator';
import { runWalkForwardAnalysis } from './walk-forward';
import { runMonteCarloPermutation } from './monte-carlo';
import { detectRegime, classifyTradeRegime, calculateRegimeDiversity } from './regime-detector';
import { calculateOverfittingScore } from './overfitting-detector';

// ─── Brain Configuration ─────────────────────────────────────

export interface BrainConfig {
    tradesPerEvaluation: number;     // How many trades before evaluating a generation
    paperTradesBeforeLive: number;   // Paper trades required before going live
    maxConcurrentStrategies: number; // How many strategies can trade simultaneously
    evaluationInterval: number;      // Milliseconds between evaluations
    validationTradesMin: number;     // Min trades before validation runs (30)
    shadowTradesMin: number;         // Trades in shadow mode before promotion (20)
    minRegimesRequired: number;      // Min unique market regimes for validation (2)
}

export const DEFAULT_BRAIN_CONFIG: BrainConfig = {
    tradesPerEvaluation: 30,
    paperTradesBeforeLive: 50,
    maxConcurrentStrategies: 3,
    evaluationInterval: 60000, // 1 minute
    validationTradesMin: 30,
    shadowTradesMin: 20,
    minRegimesRequired: 2,
};

// ─── Brain State Interface ───────────────────────────────────

export interface BrainSnapshot {
    state: BrainState;
    activeStrategy: StrategyDNA | null;
    candidateStrategies: StrategyDNA[];
    currentGeneration: number;
    totalGenerations: number;
    totalTrades: number;
    bestFitnessAllTime: number;
    logs: BrainLog[];
    lastActivity: number;
    evolutionHistory: EvolutionGeneration[];
    performanceMetrics: PerformanceMetrics | null;
    // New validation-related state
    validationQueue: StrategyDNA[];
    validatedStrategies: StrategyDNA[];
    retiredStrategies: StrategyDNA[];
    currentMutationRate: number;
    strategyMemory: RegimeGeneMemory;
    currentRegime: MarketRegime | null;
}

// ─── AI Brain ────────────────────────────────────────────────

export class AIBrain {
    private state: BrainState = BrainState.IDLE;
    private config: BrainConfig;
    private evolutionEngine: EvolutionEngine;
    private activeStrategy: StrategyDNA | null = null;
    private candidateStrategies: StrategyDNA[] = [];
    private tradeHistory: Trade[] = [];
    private tradesByStrategy: Map<string, Trade[]> = new Map();
    private logs: BrainLog[] = [];
    private lastActivity: number = Date.now();
    private totalTrades: number = 0;
    // New: Validation & Promotion state
    private validationQueue: StrategyDNA[] = [];
    private validatedStrategies: StrategyDNA[] = [];
    private retiredStrategies: StrategyDNA[] = [];
    private tradeRegimeMap: Map<string, MarketRegime> = new Map();
    private currentRegime: MarketRegime | null = null;
    private marketCandles: OHLCV[] = [];

    constructor(config: Partial<BrainConfig> = {}) {
        this.config = { ...DEFAULT_BRAIN_CONFIG, ...config };
        this.evolutionEngine = new EvolutionEngine({
            ...DEFAULT_EVOLUTION_CONFIG,
            minTradesForEvaluation: this.config.tradesPerEvaluation,
        });
    }

    /**
     * Start the brain — begin exploring strategies.
     * This is the genesis moment where the AI starts learning.
     */
    start(): BrainSnapshot {
        this.state = BrainState.EXPLORING;
        this.log(LogLevel.INFO, '🧠 Brain ACTIVATED — Starting exploration phase');

        // Create initial generation
        const genesis = this.evolutionEngine.createInitialGeneration();
        this.candidateStrategies = genesis.population;

        // Select the first strategy to trade with
        this.activeStrategy = this.candidateStrategies[0];
        this.activeStrategy.status = StrategyStatus.PAPER;

        this.log(LogLevel.DECISION, `Selected initial strategy: ${this.activeStrategy.name}`, {
            strategyId: this.activeStrategy.id,
            indicators: this.activeStrategy.indicators.map(i => `${i.type}(${i.period})`),
            timeframe: this.activeStrategy.preferredTimeframe,
        });

        this.log(LogLevel.EVOLUTION, `Genesis generation created with ${genesis.population.length} strategies`, {
            generationId: genesis.id,
            populationSize: genesis.population.length,
        });

        return this.getSnapshot();
    }

    /**
     * Update market candle data for regime detection.
     * Called by the market data feed to keep regime classification current.
     */
    updateMarketData(candles: OHLCV[]): void {
        this.marketCandles = candles;
        try {
            if (candles.length >= 60) {
                const analysis = detectRegime(candles);
                this.currentRegime = analysis.currentRegime;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.log(LogLevel.WARNING, `Regime detection failed: ${message}`);
        }
    }

    /**
     * Record a trade result and trigger evaluation if needed.
     * Now also tracks trade regime for validation purposes.
     */
    recordTrade(trade: Trade): BrainSnapshot {
        this.tradeHistory.push(trade);
        this.totalTrades++;

        // Track trades by strategy
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

        if (trade.status === TradeStatus.CLOSED) {
            const pnlStr = trade.pnlPercent !== null
                ? `${trade.pnlPercent > 0 ? '+' : ''}${(trade.pnlPercent * 100).toFixed(2)}%`
                : 'N/A';
            this.log(LogLevel.TRADE, `Trade closed: ${trade.symbol} ${trade.direction} → ${pnlStr}`, {
                tradeId: trade.id,
                strategyName: trade.strategyName,
                pnlUSD: trade.pnlUSD,
                exitReason: trade.exitReason,
                marketRegime: this.tradeRegimeMap.get(trade.id) ?? 'unknown',
            });

            // Check if we need to evaluate
            const currentStratTrades = this.tradesByStrategy.get(trade.strategyId) ?? [];
            const closedCount = currentStratTrades.filter(t => t.status === TradeStatus.CLOSED).length;

            if (closedCount >= this.config.tradesPerEvaluation) {
                this.triggerEvaluation();
            }
        }

        this.lastActivity = Date.now();
        return this.getSnapshot();
    }

    /**
     * Trigger strategy evaluation and potentially evolve to next generation.
     */
    private triggerEvaluation(): void {
        this.state = BrainState.EVALUATING;
        this.log(LogLevel.EVOLUTION, '📊 Evaluation triggered — Analyzing strategy performance');

        const currentGen = this.evolutionEngine.getLatestGeneration();
        if (!currentGen) return;

        // Check if all strategies in generation have been evaluated
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
            // Record regime performance memory before evolving
            this.recordGenerationRegimePerformance(currentGen);

            // Run validation on top strategies before evolution
            this.validateTopStrategies(currentGen);

            // Evolve to next generation
            this.evolve();
        } else {
            // Move to next strategy in the population for evaluation
            this.rotateToNextStrategy();
        }
    }

    /**
     * 4-GATE VALIDATION PIPELINE
     * Runs all validation checks on a strategy to determine promotion eligibility.
     *
     * Gate 1: Walk-Forward Analysis (efficiency ≥ 0.5)
     * Gate 2: Monte Carlo Permutation (p-value < 0.05)
     * Gate 3: Overfitting Detection (score < 40)
     * Gate 4: Regime Diversity (≥ 2 unique regimes)
     */
    validateStrategy(strategy: StrategyDNA): StrategyValidation {
        this.state = BrainState.VALIDATING;
        this.log(LogLevel.EVOLUTION, `🔬 VALIDATION starting for ${strategy.name}`, {
            strategyId: strategy.id,
            fitnessScore: strategy.metadata.fitnessScore,
        });

        const trades = this.tradesByStrategy.get(strategy.id) ?? [];
        const gates: ValidationGateResult[] = [];

        // Gate 1: Walk-Forward Analysis
        let wfaResult: WalkForwardResult | null = null;
        try {
            wfaResult = runWalkForwardAnalysis(trades);
            gates.push({
                gateName: 'Walk-Forward Analysis',
                passed: wfaResult.passed,
                score: Math.round(wfaResult.averageEfficiency * 100),
                details: wfaResult.reason,
                timestamp: Date.now(),
            });
            this.log(
                wfaResult.passed ? LogLevel.INFO : LogLevel.WARNING,
                `Gate 1 WFA: ${wfaResult.passed ? 'PASS' : 'FAIL'} — Efficiency ${(wfaResult.averageEfficiency * 100).toFixed(1)}%`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            gates.push({
                gateName: 'Walk-Forward Analysis',
                passed: false,
                score: 0,
                details: `WFA error: ${message}`,
                timestamp: Date.now(),
            });
            this.log(LogLevel.ERROR, `Gate 1 WFA error: ${message}`);
        }

        // Gate 2: Monte Carlo Permutation Test
        let mcResult: MonteCarloResult | null = null;
        try {
            mcResult = runMonteCarloPermutation(trades);
            gates.push({
                gateName: 'Monte Carlo Permutation',
                passed: mcResult.isSignificant,
                score: Math.round(mcResult.percentileRank * 100),
                details: `p-value: ${mcResult.pValue.toFixed(4)}, percentile: ${Math.round(mcResult.percentileRank * 100)}th`,
                timestamp: Date.now(),
            });
            this.log(
                mcResult.isSignificant ? LogLevel.INFO : LogLevel.WARNING,
                `Gate 2 Monte Carlo: ${mcResult.isSignificant ? 'PASS' : 'FAIL'} — p-value ${mcResult.pValue.toFixed(4)}`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            gates.push({
                gateName: 'Monte Carlo Permutation',
                passed: false,
                score: 0,
                details: `MC error: ${message}`,
                timestamp: Date.now(),
            });
            this.log(LogLevel.ERROR, `Gate 2 Monte Carlo error: ${message}`);
        }

        // Gate 3: Overfitting Detection Score
        const tradeRegimes = this.getTradeRegimes(trades);
        let overfittingReport: OverfittingReport | null = null;
        try {
            overfittingReport = calculateOverfittingScore(
                strategy,
                trades,
                wfaResult,
                mcResult,
                tradeRegimes
            );
            gates.push({
                gateName: 'Overfitting Detection',
                passed: overfittingReport.passed,
                score: overfittingReport.overallScore,
                details: `Score: ${overfittingReport.overallScore}/100 (threshold: <40)`,
                timestamp: Date.now(),
            });
            this.log(
                overfittingReport.passed ? LogLevel.INFO : LogLevel.WARNING,
                `Gate 3 Overfitting: ${overfittingReport.passed ? 'PASS' : 'FAIL'} — Score ${overfittingReport.overallScore}`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            gates.push({
                gateName: 'Overfitting Detection',
                passed: false,
                score: 100,
                details: `ODS error: ${message}`,
                timestamp: Date.now(),
            });
            this.log(LogLevel.ERROR, `Gate 3 Overfitting error: ${message}`);
        }

        // Gate 4: Regime Diversity
        const regimeDiversity = calculateRegimeDiversity(tradeRegimes);
        const regimeGatePassed = regimeDiversity.uniqueRegimes >= this.config.minRegimesRequired;
        gates.push({
            gateName: 'Regime Diversity',
            passed: regimeGatePassed,
            score: regimeDiversity.uniqueRegimes,
            details: `${regimeDiversity.uniqueRegimes} regimes (min: ${this.config.minRegimesRequired})`,
            timestamp: Date.now(),
        });
        this.log(
            regimeGatePassed ? LogLevel.INFO : LogLevel.WARNING,
            `Gate 4 Regime: ${regimeGatePassed ? 'PASS' : 'FAIL'} — ${regimeDiversity.uniqueRegimes} unique regimes`
        );

        // Overall pass = ALL gates pass
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

        // Update strategy metadata
        strategy.metadata.validation = validation;

        if (overallPassed) {
            strategy.status = StrategyStatus.CANDIDATE;
            this.validatedStrategies.push(strategy);
            this.log(LogLevel.EVOLUTION, `✅ ${strategy.name} PASSED all 4 gates → Promoted to CANDIDATE`, {
                strategyId: strategy.id,
                gateResults: gates.map(g => `${g.gateName}: ${g.passed ? '✅' : '❌'}`),
            });
        } else {
            const failedGates = gates.filter(g => !g.passed).map(g => g.gateName);
            strategy.status = StrategyStatus.RETIRED;
            this.retiredStrategies.push(strategy);
            this.log(LogLevel.WARNING, `❌ ${strategy.name} FAILED validation → RETIRED`, {
                strategyId: strategy.id,
                failedGates,
            });
        }

        return validation;
    }

    /**
     * Validate the top-performing strategies from a generation.
     */
    private validateTopStrategies(generation: EvolutionGeneration): void {
        const sortedByFitness = [...generation.population]
            .sort((a, b) => b.metadata.fitnessScore - a.metadata.fitnessScore);

        // Validate top 3 (or elitism count)
        const topCount = Math.min(3, sortedByFitness.length);
        for (let i = 0; i < topCount; i++) {
            const strategy = sortedByFitness[i];
            if (strategy.metadata.fitnessScore > 0) {
                this.validateStrategy(strategy);
            }
        }
    }

    /**
     * Record regime-specific performance data for the evolution engine's memory.
     */
    private recordGenerationRegimePerformance(generation: EvolutionGeneration): void {
        for (const strategy of generation.population) {
            const trades = this.tradesByStrategy.get(strategy.id) ?? [];
            if (trades.length === 0 || !this.currentRegime) continue;

            const regimes = this.getTradeRegimes(trades);
            for (const regime of [...new Set(regimes)]) {
                this.evolutionEngine.recordRegimePerformance(
                    strategy,
                    regime,
                    strategy.metadata.fitnessScore
                );
            }
        }
    }

    /**
     * Get the market regimes for a set of trades.
     */
    private getTradeRegimes(trades: Trade[]): MarketRegime[] {
        return trades
            .map(t => this.tradeRegimeMap.get(t.id))
            .filter((r): r is MarketRegime => r !== undefined);
    }

    /**
     * Evolve to the next generation.
     */
    private evolve(): void {
        this.state = BrainState.EVOLVING;
        const currentGen = this.evolutionEngine.getLatestGeneration();
        if (!currentGen) return;

        this.log(LogLevel.EVOLUTION, '🧬 EVOLUTION — Creating next generation', {
            currentMutationRate: this.evolutionEngine.getCurrentMutationRate(),
            stagnationCounter: this.evolutionEngine.getStagnationCounter(),
        });

        const nextGen = this.evolutionEngine.evolveNextGeneration(currentGen, this.tradesByStrategy);

        // Apply deflated fitness for multiple testing correction
        const totalTested = this.evolutionEngine.getTotalStrategiesTested();
        if (totalTested > 10) {
            for (const strategy of nextGen.population) {
                if (strategy.metadata.fitnessScore > 0) {
                    strategy.metadata.fitnessScore = calculateDeflatedFitness(
                        strategy.metadata.fitnessScore,
                        totalTested
                    );
                }
            }
        }

        this.log(LogLevel.EVOLUTION, `Generation ${nextGen.generationNumber} created`, {
            previousBestScore: currentGen.bestFitnessScore,
            previousAvgScore: currentGen.averageFitnessScore,
            newPopulationSize: nextGen.population.length,
            adaptiveMutationRate: this.evolutionEngine.getCurrentMutationRate(),
            totalStrategiesTested: totalTested,
        });

        // Update candidates
        this.candidateStrategies = nextGen.population;

        // Select best strategy from new generation
        const bestFromPrev = currentGen.bestStrategyId
            ? currentGen.population.find(s => s.id === currentGen.bestStrategyId)
            : null;

        if (bestFromPrev) {
            const preserved = nextGen.population.find(
                s => s.parentIds.includes(bestFromPrev.id) || s.id === bestFromPrev.id
            );
            this.activeStrategy = preserved ?? nextGen.population[0];
        } else {
            this.activeStrategy = nextGen.population[0];
        }

        this.log(LogLevel.DECISION, `New active strategy: ${this.activeStrategy.name}`, {
            generation: nextGen.generationNumber,
            fitnessScore: this.activeStrategy.metadata.fitnessScore,
        });

        // Clear trade tracking for new generation strategies
        for (const strategy of nextGen.population) {
            this.tradesByStrategy.set(strategy.id, []);
        }

        this.state = BrainState.TRADING;
    }

    /**
     * Rotate to the next unevaluated strategy in the current generation.
     */
    private rotateToNextStrategy(): void {
        const currentGen = this.evolutionEngine.getLatestGeneration();
        if (!currentGen) return;

        for (const strategy of currentGen.population) {
            const trades = this.tradesByStrategy.get(strategy.id) ?? [];
            const closed = trades.filter(t => t.status === TradeStatus.CLOSED);
            if (closed.length < this.config.tradesPerEvaluation) {
                this.activeStrategy = strategy;
                this.log(LogLevel.DECISION, `Rotating to strategy: ${strategy.name} (${closed.length}/${this.config.tradesPerEvaluation} trades done)`, {
                    strategyId: strategy.id,
                });
                this.state = BrainState.TRADING;
                return;
            }
        }
    }

    /**
     * Pause the brain (user-initiated).
     */
    pause(): BrainSnapshot {
        this.state = BrainState.PAUSED;
        this.log(LogLevel.WARNING, '⏸️ Brain PAUSED by user');
        return this.getSnapshot();
    }

    /**
     * Resume the brain from pause.
     */
    resume(): BrainSnapshot {
        this.state = this.activeStrategy ? BrainState.TRADING : BrainState.EXPLORING;
        this.log(LogLevel.INFO, '▶️ Brain RESUMED');
        return this.getSnapshot();
    }

    /**
     * Emergency stop — halt everything immediately.
     */
    emergencyStop(): BrainSnapshot {
        this.state = BrainState.EMERGENCY_STOP;
        this.log(LogLevel.ERROR, '🚨 EMERGENCY STOP — All trading halted');
        return this.getSnapshot();
    }

    /**
     * Get current strategy's performance metrics.
     */
    getActiveStrategyMetrics(): PerformanceMetrics | null {
        if (!this.activeStrategy) return null;
        const trades = this.tradesByStrategy.get(this.activeStrategy.id) ?? [];
        if (trades.length === 0) return null;
        return evaluatePerformance(trades);
    }

    /**
     * Get a full snapshot of the brain state for the dashboard.
     */
    getSnapshot(): BrainSnapshot {
        return {
            state: this.state,
            activeStrategy: this.activeStrategy,
            candidateStrategies: [...this.candidateStrategies],
            currentGeneration: this.evolutionEngine.getCurrentGenerationNumber(),
            totalGenerations: this.evolutionEngine.getGenerations().length,
            totalTrades: this.totalTrades,
            bestFitnessAllTime: this.evolutionEngine.getBestStrategyAllTime()?.metadata.fitnessScore ?? 0,
            logs: this.logs.slice(-100),
            lastActivity: this.lastActivity,
            evolutionHistory: this.evolutionEngine.getGenerations(),
            performanceMetrics: this.getActiveStrategyMetrics(),
            validationQueue: [...this.validationQueue],
            validatedStrategies: [...this.validatedStrategies],
            retiredStrategies: this.retiredStrategies.slice(-50),
            currentMutationRate: this.evolutionEngine.getCurrentMutationRate(),
            strategyMemory: this.evolutionEngine.getStrategyMemory(),
            currentRegime: this.currentRegime,
        };
    }

    // ─── Private ─────────────────────────────────────────────────

    private log(level: LogLevel, message: string, details?: Record<string, unknown>): void {
        this.logs.push({
            id: uuidv4(),
            timestamp: Date.now(),
            level,
            message,
            details,
            strategyId: this.activeStrategy?.id,
        });

        // Keep only last 1000 logs
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(-1000);
        }
    }
}
