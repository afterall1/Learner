// ============================================================
// Learner: Evolution Engine — Genetic Algorithm Controller
// ============================================================
// Enhanced with: Adaptive Mutation, Diversity Pressure,
// Strategy Memory, Complexity-Aware Fitness, and
// Experience Replay Integration.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    StrategyDNA,
    EvolutionGeneration,
    Trade,
    StrategyStatus,
    IndicatorType,
    MarketRegime,
    RegimeGeneMemory,
    RegimeGenePerformance,
} from '@/types';
import { generateRandomStrategy, crossover, mutate } from './strategy-dna';
import { evaluatePerformance, calculateFitnessScore } from './evaluator';
import { ExperienceReplayMemory } from './experience-replay';

// ─── Configuration ───────────────────────────────────────────

export interface EvolutionConfig {
    populationSize: number;       // Number of strategies per generation (8-20)
    elitismCount: number;         // Top N strategies survive unchanged (2-4)
    mutationRate: number;         // Probability of gene mutation (0.1-0.5)
    crossoverRate: number;        // Probability of crossover vs mutation (0.5-0.8)
    tournamentSize: number;       // Number of candidates in tournament selection (3-5)
    minTradesForEvaluation: number; // Minimum trades before a strategy is scored
    maxGenerations: number;       // Safety limit
    adaptiveMutationEnabled: boolean; // Enables adaptive mutation rate
    stagnationThreshold: number;  // Generations without improvement before mutation increases
    diversityMinimum: number;     // Minimum diversity index before extra wild cards
}

export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
    populationSize: 10,
    elitismCount: 2,
    mutationRate: 0.3,
    crossoverRate: 0.6,
    tournamentSize: 3,
    minTradesForEvaluation: 30,
    maxGenerations: 1000,
    adaptiveMutationEnabled: true,
    stagnationThreshold: 3,
    diversityMinimum: 0.3,
};

// ─── Evolution Engine ────────────────────────────────────────

export class EvolutionEngine {
    private config: EvolutionConfig;
    private generations: EvolutionGeneration[] = [];
    private currentGeneration: number = 0;
    private currentMutationRate: number;
    private stagnationCounter: number = 0;
    private lastBestFitness: number = 0;
    private strategyMemory: RegimeGeneMemory = {
        entries: [],
        totalStrategiesTested: 0,
        generationsProcessed: 0,
    };

    constructor(config: Partial<EvolutionConfig> = {}) {
        this.config = { ...DEFAULT_EVOLUTION_CONFIG, ...config };
        this.currentMutationRate = this.config.mutationRate;
    }

    /**
     * Create the initial generation.
     * If an ExperienceReplayMemory and current regime are provided,
     * 30% of the population will be seeded from proven gene patterns.
     * The remaining 70% are random (preserving diversity).
     *
     * Without replay: 100% random genesis (original behavior).
     */
    createInitialGeneration(
        replayMemory?: ExperienceReplayMemory,
        currentRegime?: MarketRegime,
    ): EvolutionGeneration {
        const population: StrategyDNA[] = [];

        // Phase 7: Seed from Experience Replay if available
        if (replayMemory && currentRegime && replayMemory.canSeedForRegime(currentRegime)) {
            const seeded = replayMemory.generateSeededPopulation(
                currentRegime,
                this.config.populationSize,
                0, // generation 0
            );
            for (const strategy of seeded) {
                population.push(strategy);
            }
        }

        // Fill remaining slots with random strategies
        while (population.length < this.config.populationSize) {
            population.push(generateRandomStrategy(0));
        }

        const generation: EvolutionGeneration = {
            id: uuidv4(),
            generationNumber: 0,
            createdAt: Date.now(),
            completedAt: null,
            population,
            bestStrategyId: null,
            bestFitnessScore: 0,
            averageFitnessScore: 0,
            metrics: {
                totalTradesExecuted: 0,
                populationSize: population.length,
                mutationRate: this.currentMutationRate,
                crossoverRate: this.config.crossoverRate,
                survivalRate: 1.0,
            },
        };

        this.generations.push(generation);
        this.currentGeneration = 0;
        return generation;
    }

    /**
     * Evaluate all strategies in a generation using their trade records.
     * Returns strategies sorted by fitness score (descending).
     * Now applies complexity penalty via the enhanced evaluator.
     */
    evaluateGeneration(
        generation: EvolutionGeneration,
        tradesByStrategy: Map<string, Trade[]>
    ): StrategyDNA[] {
        for (const strategy of generation.population) {
            const trades = tradesByStrategy.get(strategy.id) ?? [];

            if (trades.length >= this.config.minTradesForEvaluation) {
                const metrics = evaluatePerformance(trades);
                // Pass strategy for complexity penalty calculation
                strategy.metadata.fitnessScore = calculateFitnessScore(metrics, strategy);
                strategy.metadata.tradeCount = trades.length;
                strategy.metadata.lastEvaluated = Date.now();
            }
        }

        // Sort by fitness score (descending)
        const sorted = [...generation.population].sort(
            (a, b) => b.metadata.fitnessScore - a.metadata.fitnessScore
        );

        // Update generation metadata
        const scores = sorted.map(s => s.metadata.fitnessScore);
        generation.bestStrategyId = sorted[0]?.id ?? null;
        generation.bestFitnessScore = scores[0] ?? 0;
        generation.averageFitnessScore = scores.length > 0
            ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100
            : 0;
        generation.metrics.totalTradesExecuted = Array.from(tradesByStrategy.values())
            .reduce((sum, trades) => sum + trades.length, 0);
        generation.completedAt = Date.now();

        // Track total strategies tested for deflated fitness
        this.strategyMemory.totalStrategiesTested += generation.population.length;

        return sorted;
    }

    /**
     * Create the next generation using selection, crossover, and mutation.
     * Enhanced with adaptive mutation, diversity pressure, and
     * optional Experience Replay injection.
     *
     * When replay memory is provided, 1-2 replay strategies may replace
     * wild cards, injecting proven gene patterns into the population.
     */
    evolveNextGeneration(
        currentGeneration: EvolutionGeneration,
        tradesByStrategy: Map<string, Trade[]>,
        replayMemory?: ExperienceReplayMemory,
        currentRegime?: MarketRegime,
    ): EvolutionGeneration {
        // Step 1: Evaluate and rank current generation
        const ranked = this.evaluateGeneration(currentGeneration, tradesByStrategy);
        this.currentGeneration++;
        this.strategyMemory.generationsProcessed++;

        // Step 2: Adapt mutation rate based on fitness progress
        if (this.config.adaptiveMutationEnabled) {
            this.adaptMutationRate(currentGeneration);
        }

        const newPopulation: StrategyDNA[] = [];

        // Step 3: Elitism — carry over top performers unchanged
        const elites = ranked.slice(0, this.config.elitismCount);
        for (const elite of elites) {
            const preserved: StrategyDNA = JSON.parse(JSON.stringify(elite));
            preserved.generation = this.currentGeneration;
            preserved.status = StrategyStatus.PAPER;
            preserved.metadata.fitnessScore = elite.metadata.fitnessScore;
            preserved.metadata.tradeCount = 0;
            preserved.metadata.lastEvaluated = null;
            newPopulation.push(preserved);
        }

        // Step 4: Calculate diversity and determine wild card count
        const diversityIndex = this.calculateDiversityIndex(ranked);
        const wildCardCount = this.calculateWildCardCount(diversityIndex);

        // Step 5: Fill remaining slots with crossover + mutation
        const targetCrossoverMutation = this.config.populationSize - newPopulation.length - wildCardCount;
        let filled = 0;

        while (filled < targetCrossoverMutation && ranked.length >= 2) {
            if (Math.random() < this.config.crossoverRate) {
                // Crossover: select two parents via tournament, create child
                const parentA = this.tournamentSelect(ranked);
                const parentB = this.tournamentSelect(ranked, parentA.id);
                const child = crossover(parentA, parentB, this.currentGeneration);
                newPopulation.push(child);
            } else {
                // Mutation: select one parent via tournament, mutate with adaptive rate
                const parent = this.tournamentSelect(ranked);
                const child = mutate(parent, this.currentMutationRate);
                child.generation = this.currentGeneration;
                newPopulation.push(child);
            }
            filled++;
        }

        // Step 6: Add wild cards for diversity maintenance
        // Phase 7: Replace some wild cards with replay-seeded strategies
        let replayInjected = 0;
        if (replayMemory && currentRegime && replayMemory.canSeedForRegime(currentRegime)) {
            const replayCount = Math.min(2, wildCardCount); // Max 2 replay injections
            const replayStrategies = replayMemory.generateSeededPopulation(
                currentRegime,
                replayCount,
                this.currentGeneration,
            );
            for (const replayed of replayStrategies) {
                newPopulation.push(replayed);
                replayInjected++;
            }
        }

        // Fill remaining wild card slots with random strategies
        for (let i = 0; i < wildCardCount - replayInjected; i++) {
            newPopulation.push(generateRandomStrategy(this.currentGeneration));
        }

        const newGeneration: EvolutionGeneration = {
            id: uuidv4(),
            generationNumber: this.currentGeneration,
            createdAt: Date.now(),
            completedAt: null,
            population: newPopulation.slice(0, this.config.populationSize),
            bestStrategyId: null,
            bestFitnessScore: 0,
            averageFitnessScore: 0,
            metrics: {
                totalTradesExecuted: 0,
                populationSize: newPopulation.length,
                mutationRate: this.currentMutationRate,
                crossoverRate: this.config.crossoverRate,
                survivalRate: this.config.elitismCount / this.config.populationSize,
            },
        };

        this.generations.push(newGeneration);
        return newGeneration;
    }

    /**
     * Adapt mutation rate based on fitness progress across generations.
     * If best fitness stagnates for 3+ generations → increase mutation rate by 50%
     * If fitness is improving → decrease mutation rate by 25% (min 0.1)
     *
     * This prevents premature convergence while allowing exploitation
     * when the algorithm is making progress.
     */
    private adaptMutationRate(currentGeneration: EvolutionGeneration): void {
        const currentBestFitness = currentGeneration.bestFitnessScore;

        if (currentBestFitness > this.lastBestFitness) {
            // Fitness is improving — reduce mutation to exploit
            this.stagnationCounter = 0;
            this.currentMutationRate = Math.max(
                0.1,
                this.currentMutationRate * 0.75
            );
        } else {
            // Fitness stagnated
            this.stagnationCounter++;

            if (this.stagnationCounter >= this.config.stagnationThreshold) {
                // Stagnation detected — increase mutation to explore
                this.currentMutationRate = Math.min(
                    0.7,
                    this.currentMutationRate * 1.5
                );
            }
        }

        this.lastBestFitness = currentBestFitness;

        // Round for clean logging
        this.currentMutationRate = Math.round(this.currentMutationRate * 100) / 100;
    }

    /**
     * Calculate population diversity index (0-1).
     * Measures how diverse the current population is across:
     * - Indicator types used
     * - Period ranges
     * - Risk gene values
     *
     * Low diversity (<0.3) signals convergence risk — need more wild cards.
     * High diversity (>0.7) signals healthy exploration.
     */
    calculateDiversityIndex(population: StrategyDNA[]): number {
        if (population.length <= 1) return 0;

        // 1. Indicator type diversity
        const allIndicatorTypes = new Set<IndicatorType>();
        for (const strategy of population) {
            for (const indicator of strategy.indicators) {
                allIndicatorTypes.add(indicator.type);
            }
        }
        const indicatorTypeDiversity = allIndicatorTypes.size / Object.values(IndicatorType).length;

        // 2. Period diversity (coefficient of variation across strategies)
        const allPeriods = population.flatMap(s => s.indicators.map(i => i.period));
        const periodCV = allPeriods.length > 1 ? this.coefficientOfVariation(allPeriods) : 0;
        const periodDiversity = Math.min(1, periodCV / 0.5); // CV of 0.5+ = max diversity

        // 3. Risk gene diversity
        const stopLosses = population.map(s => s.riskGenes.stopLossPercent);
        const leverages = population.map(s => s.riskGenes.maxLeverage);

        const slCV = this.coefficientOfVariation(stopLosses);
        const levCV = this.coefficientOfVariation(leverages);
        const riskDiversity = Math.min(1, (slCV + levCV) / 1.0);

        // 4. Timeframe diversity
        const uniqueTimeframes = new Set(population.map(s => s.preferredTimeframe));
        const timeframeDiversity = uniqueTimeframes.size / 5; // 5 possible timeframes

        // Weighted average
        const diversityIndex =
            indicatorTypeDiversity * 0.3 +
            periodDiversity * 0.25 +
            riskDiversity * 0.25 +
            timeframeDiversity * 0.2;

        return Math.round(diversityIndex * 100) / 100;
    }

    /**
     * Calculate how many wild cards to inject based on diversity.
     * Normal: 1 wild card (10%)
     * Low diversity: up to 3 wild cards (30%)
     */
    private calculateWildCardCount(diversityIndex: number): number {
        if (diversityIndex >= this.config.diversityMinimum) {
            return 1; // Normal: 1 wild card
        }

        // Low diversity — inject more wild cards
        // Diversity 0.0 → 3 wild cards
        // Diversity 0.15 → 2 wild cards
        // Diversity 0.3 → 1 wild card
        const extraCards = Math.ceil((this.config.diversityMinimum - diversityIndex) / this.config.diversityMinimum * 3);
        return Math.min(3, Math.max(1, extraCards));
    }

    /**
     * Record strategy performance in regime-specific memory.
     * This builds institutional knowledge about which gene configurations
     * work best in which market conditions.
     */
    recordRegimePerformance(
        strategy: StrategyDNA,
        regime: MarketRegime,
        fitness: number
    ): void {
        const indicatorTypes = strategy.indicators.map(i => i.type).sort();
        const key = `${regime}:${indicatorTypes.join(',')}`;

        // Find existing entry or create new
        const existing = this.strategyMemory.entries.find(
            e => e.regime === regime &&
                JSON.stringify(e.indicatorTypes.sort()) === JSON.stringify(indicatorTypes)
        );

        if (existing) {
            // Update running average
            existing.avgFitness = (existing.avgFitness * existing.sampleCount + fitness) / (existing.sampleCount + 1);
            existing.sampleCount++;
            existing.lastUpdated = Date.now();
        } else {
            this.strategyMemory.entries.push({
                regime,
                indicatorTypes,
                avgFitness: fitness,
                sampleCount: 1,
                lastUpdated: Date.now(),
            });
        }

        // Trim memory to top 100 entries by sample count
        if (this.strategyMemory.entries.length > 100) {
            this.strategyMemory.entries.sort((a, b) => b.sampleCount - a.sampleCount);
            this.strategyMemory.entries = this.strategyMemory.entries.slice(0, 100);
        }
    }

    /**
     * Get the best-performing indicator combinations for a given regime.
     * Used to bias new generation creation towards known-good patterns.
     */
    getBestGenesForRegime(regime: MarketRegime, topN: number = 5): RegimeGenePerformance[] {
        return this.strategyMemory.entries
            .filter(e => e.regime === regime && e.sampleCount >= 3)
            .sort((a, b) => b.avgFitness - a.avgFitness)
            .slice(0, topN);
    }

    /**
     * Tournament selection: pick `tournamentSize` random candidates and return the best.
     * This preserves selection pressure while maintaining diversity.
     */
    private tournamentSelect(population: StrategyDNA[], excludeId?: string): StrategyDNA {
        const eligible = excludeId
            ? population.filter(s => s.id !== excludeId)
            : population;

        if (eligible.length === 0) {
            return population[0]; // Fallback
        }

        const candidates: StrategyDNA[] = [];
        for (let i = 0; i < this.config.tournamentSize && i < eligible.length; i++) {
            const idx = Math.floor(Math.random() * eligible.length);
            candidates.push(eligible[idx]);
        }

        candidates.sort((a, b) => b.metadata.fitnessScore - a.metadata.fitnessScore);
        return candidates[0];
    }

    /**
     * Calculate coefficient of variation for a set of values.
     * CV = stdDev / mean. Higher CV = more diversity.
     */
    private coefficientOfVariation(values: number[]): number {
        if (values.length < 2) return 0;
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        if (mean === 0) return 0;
        const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1);
        return Math.sqrt(variance) / Math.abs(mean);
    }

    // ─── Getters ─────────────────────────────────────────────────

    getGenerations(): EvolutionGeneration[] {
        return [...this.generations];
    }

    getCurrentGenerationNumber(): number {
        return this.currentGeneration;
    }

    getLatestGeneration(): EvolutionGeneration | null {
        return this.generations[this.generations.length - 1] ?? null;
    }

    getCurrentMutationRate(): number {
        return this.currentMutationRate;
    }

    getStagnationCounter(): number {
        return this.stagnationCounter;
    }

    getStrategyMemory(): RegimeGeneMemory {
        return { ...this.strategyMemory, entries: [...this.strategyMemory.entries] };
    }

    getTotalStrategiesTested(): number {
        return this.strategyMemory.totalStrategiesTested;
    }

    getBestStrategyAllTime(): StrategyDNA | null {
        let best: StrategyDNA | null = null;
        let bestScore = -1;

        for (const gen of this.generations) {
            for (const strategy of gen.population) {
                if (strategy.metadata.fitnessScore > bestScore) {
                    bestScore = strategy.metadata.fitnessScore;
                    best = strategy;
                }
            }
        }

        return best;
    }
}
