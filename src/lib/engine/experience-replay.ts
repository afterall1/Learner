// ============================================================
// Learner: Experience Replay Memory — Institutional Knowledge Engine
// ============================================================
// Extracts reusable gene patterns from validated strategies and
// uses them to seed future evolution cycles. This is the system's
// "institutional memory" — it makes the AI smarter over time by
// learning which indicator combinations, risk profiles, and signal
// configurations work best in which market conditions.
//
// Council Decision: Prof. Kenneth Stanley's Novelty Search principle —
// we reward diverse patterns, not just high-fitness ones. A novel
// pattern that works in an underserved regime is more valuable than
// yet another trending-market strategy.
//
// Inspired by: Deep RL Experience Replay buffers, but adapted
// for evolutionary computation with Bayesian confidence updating.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    StrategyDNA,
    IndicatorGene,
    IndicatorType,
    RiskGenes,
    MarketRegime,
    PerformanceMetrics,
    ExperiencePattern,
    PatternType,
    ExperienceMemorySnapshot,
    Trade,
    StrategyStatus,
    Timeframe,
    SignalCondition,
} from '@/types';
import { evaluatePerformance, calculateFitnessScore } from './evaluator';

// ─── Configuration ───────────────────────────────────────────

export interface ExperienceReplayConfig {
    maxPatterns: number;                  // Maximum stored patterns
    minSamplesForSeeding: number;         // Min independent validations before seeding
    minConfidenceForSeeding: number;      // Min confidence (0-1) to seed a genesis
    seedRatio: number;                    // % of new generation seeded (0-1)
    bayesianPriorStrength: number;        // How strong the prior is (higher = slower updates)
    noveltyBonus: number;                 // Bonus for patterns in underserved regimes (0-1)
    patternDecayDays: number;             // Days before confidence starts decaying
}

export const DEFAULT_REPLAY_CONFIG: ExperienceReplayConfig = {
    maxPatterns: 200,
    minSamplesForSeeding: 3,
    minConfidenceForSeeding: 0.5,
    seedRatio: 0.30,                      // 30% seeded, 70% random
    bayesianPriorStrength: 5,
    noveltyBonus: 0.15,
    patternDecayDays: 30,
};

// ─── Random Helpers ──────────────────────────────────────────

function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Experience Replay Memory ────────────────────────────────

export class ExperienceReplayMemory {
    private readonly config: ExperienceReplayConfig;
    private patterns: Map<string, ExperiencePattern> = new Map();

    constructor(config: Partial<ExperienceReplayConfig> = {}) {
        this.config = { ...DEFAULT_REPLAY_CONFIG, ...config };
    }

    // ─── Pattern Recording ────────────────────────────────────

    /**
     * Record an experience from a validated strategy.
     * Extracts reusable gene patterns and stores them with
     * regime-specific performance data.
     *
     * Called when a strategy passes the 4-Gate Validation Pipeline.
     */
    recordExperience(
        strategy: StrategyDNA,
        trades: Trade[],
        regime: MarketRegime,
    ): ExperiencePattern[] {
        const metrics = evaluatePerformance(trades);
        const fitness = calculateFitnessScore(metrics, strategy);

        const newPatterns: ExperiencePattern[] = [];

        // Extract Indicator Combo pattern
        const comboPattern = this.extractIndicatorCombo(strategy, regime, fitness);
        const mergedCombo = this.mergeOrAddPattern(comboPattern);
        newPatterns.push(mergedCombo);

        // Extract Risk Profile pattern
        const riskPattern = this.extractRiskProfile(strategy, regime, fitness);
        const mergedRisk = this.mergeOrAddPattern(riskPattern);
        newPatterns.push(mergedRisk);

        // Extract Signal Configuration pattern (if entry rules are information-rich)
        if (strategy.entryRules.entrySignals.length >= 2) {
            const signalPattern = this.extractSignalConfig(strategy, regime, fitness);
            const mergedSignal = this.mergeOrAddPattern(signalPattern);
            newPatterns.push(mergedSignal);
        }

        // ─── Phase 9: Extract advanced gene patterns ─────────
        if (strategy.microstructureGenes && strategy.microstructureGenes.length > 0) {
            const microTypes = strategy.microstructureGenes.map(g => g.type).sort();
            const microKey = `micro:${regime}:${microTypes.join('+')}`;
            const microPattern: ExperiencePattern = {
                id: microKey,
                type: PatternType.MICROSTRUCTURE_COMBO,
                regime,
                indicatorTypes: [],
                indicatorGenes: [],
                riskProfile: null,
                avgFitness: fitness,
                peakFitness: fitness,
                sampleCount: 1,
                confidenceScore: 0.25,
                successRate: 1.0,
                createdAt: Date.now(),
                lastValidated: Date.now(),
                sourceStrategyIds: [strategy.id],
            };
            newPatterns.push(this.mergeOrAddPattern(microPattern));
        }

        if (strategy.compositeGenes && strategy.compositeGenes.length > 0) {
            const ops = strategy.compositeGenes.map(g => g.operation).sort();
            const compKey = `comp:${regime}:${ops.join('+')}`;
            const compPattern: ExperiencePattern = {
                id: compKey,
                type: PatternType.COMPOSITE_FUNCTION,
                regime,
                indicatorTypes: [],
                indicatorGenes: [],
                riskProfile: null,
                avgFitness: fitness,
                peakFitness: fitness,
                sampleCount: 1,
                confidenceScore: 0.25,
                successRate: 1.0,
                createdAt: Date.now(),
                lastValidated: Date.now(),
                sourceStrategyIds: [strategy.id],
            };
            newPatterns.push(this.mergeOrAddPattern(compPattern));
        }

        // Evict lowest-confidence patterns if over capacity
        this.evictIfOverCapacity();

        return newPatterns;
    }

    // ─── Seeded Strategy Generation ───────────────────────────

    /**
     * Generate a strategy seeded from proven gene patterns.
     * This is the core "replay" — creating new strategies biased
     * by institutional knowledge instead of pure randomness.
     *
     * The strategy inherits proven indicator combos and risk profiles
     * but gets new UUIDs, randomized thresholds, and slight mutations
     * to maintain diversity.
     */
    generateSeededStrategy(
        regime: MarketRegime,
        generation: number,
    ): StrategyDNA | null {
        // Get top patterns for this regime
        const combos = this.getTopPatternsForRegime(regime, PatternType.INDICATOR_COMBO, 5);
        const risks = this.getTopPatternsForRegime(regime, PatternType.RISK_PROFILE, 5);

        // Need at least one combo pattern with sufficient confidence
        const seedableCombos = combos.filter(
            p => p.sampleCount >= this.config.minSamplesForSeeding &&
                p.confidenceScore >= this.config.minConfidenceForSeeding,
        );

        if (seedableCombos.length === 0) {
            return null; // Not enough experience yet — fall back to random genesis
        }

        // Pick a combo pattern (probability-weighted by confidence)
        const selectedCombo = this.weightedSelect(seedableCombos);

        // Pick a risk pattern (or use default)
        const seedableRisks = risks.filter(
            p => p.sampleCount >= this.config.minSamplesForSeeding,
        );
        const selectedRisk = seedableRisks.length > 0
            ? this.weightedSelect(seedableRisks)
            : null;

        // Build the seeded strategy
        return this.buildSeededStrategy(selectedCombo, selectedRisk, regime, generation);
    }

    /**
     * Generate multiple seeded strategies for a new generation.
     * Returns the number of strategies that should be seeded (based on seedRatio).
     */
    generateSeededPopulation(
        regime: MarketRegime,
        populationSize: number,
        generation: number,
    ): StrategyDNA[] {
        const seedCount = Math.floor(populationSize * this.config.seedRatio);
        const seeded: StrategyDNA[] = [];

        for (let i = 0; i < seedCount; i++) {
            const strategy = this.generateSeededStrategy(regime, generation);
            if (strategy !== null) {
                seeded.push(strategy);
            }
        }

        return seeded;
    }

    // ─── Query Methods ────────────────────────────────────────

    /**
     * Get top patterns for a specific regime and type, sorted by fitness.
     */
    getTopPatternsForRegime(
        regime: MarketRegime,
        type: PatternType,
        topN: number = 5,
    ): ExperiencePattern[] {
        const matching: ExperiencePattern[] = [];

        for (const pattern of this.patterns.values()) {
            if (pattern.regime === regime && pattern.type === type) {
                matching.push(pattern);
            }
        }

        return matching
            .sort((a, b) => b.avgFitness * b.confidenceScore - a.avgFitness * a.confidenceScore)
            .slice(0, topN);
    }

    /**
     * Get all patterns, optionally filtered by regime.
     */
    getAllPatterns(regime?: MarketRegime): ExperiencePattern[] {
        const all = Array.from(this.patterns.values());
        if (regime) {
            return all.filter(p => p.regime === regime);
        }
        return all;
    }

    /**
     * Check if we have enough experience to seed strategies for a given regime.
     */
    canSeedForRegime(regime: MarketRegime): boolean {
        const combos = this.getTopPatternsForRegime(regime, PatternType.INDICATOR_COMBO, 1);
        return combos.length > 0 &&
            combos[0].sampleCount >= this.config.minSamplesForSeeding &&
            combos[0].confidenceScore >= this.config.minConfidenceForSeeding;
    }

    /**
     * Get the total pattern count.
     */
    getPatternCount(): number {
        return this.patterns.size;
    }

    /**
     * Get a full snapshot of the Experience Memory for the dashboard.
     */
    getSnapshot(): ExperienceMemorySnapshot {
        const patterns = Array.from(this.patterns.values());

        if (patterns.length === 0) {
            return {
                totalPatterns: 0,
                patternsByRegime: this.createEmptyRegimeCount(),
                highConfidencePatterns: 0,
                avgPatternFitness: 0,
                oldestPattern: 0,
                newestPattern: 0,
            };
        }

        const patternsByRegime = this.createEmptyRegimeCount();
        let highConfidence = 0;
        let totalFitness = 0;
        let oldest = Infinity;
        let newest = 0;

        for (const pattern of patterns) {
            patternsByRegime[pattern.regime]++;
            if (pattern.confidenceScore > 0.7) highConfidence++;
            totalFitness += pattern.avgFitness;
            if (pattern.createdAt < oldest) oldest = pattern.createdAt;
            if (pattern.lastValidated > newest) newest = pattern.lastValidated;
        }

        return {
            totalPatterns: patterns.length,
            patternsByRegime: patternsByRegime as Record<MarketRegime, number>,
            highConfidencePatterns: highConfidence,
            avgPatternFitness: Math.round((totalFitness / patterns.length) * 100) / 100,
            oldestPattern: oldest === Infinity ? 0 : oldest,
            newestPattern: newest,
        };
    }

    // ─── Pattern Extraction ───────────────────────────────────

    /**
     * Extract the indicator combination pattern from a strategy.
     * This captures WHICH indicators were used and their period configs.
     */
    private extractIndicatorCombo(
        strategy: StrategyDNA,
        regime: MarketRegime,
        fitness: number,
    ): ExperiencePattern {
        const types = strategy.indicators.map(ind => ind.type).sort();
        const comboKey = `combo:${regime}:${types.join('+')}`;

        return {
            id: comboKey,
            type: PatternType.INDICATOR_COMBO,
            regime,
            indicatorTypes: types,
            indicatorGenes: strategy.indicators.map(ind => ({ ...ind })),
            riskProfile: null,
            avgFitness: fitness,
            peakFitness: fitness,
            sampleCount: 1,
            confidenceScore: 0.3, // Initial prior
            successRate: 1.0,
            createdAt: Date.now(),
            lastValidated: Date.now(),
            sourceStrategyIds: [strategy.id],
        };
    }

    /**
     * Extract the risk profile pattern from a strategy.
     */
    private extractRiskProfile(
        strategy: StrategyDNA,
        regime: MarketRegime,
        fitness: number,
    ): ExperiencePattern {
        // Quantize risk genes for grouping
        const slBucket = Math.round(strategy.riskGenes.stopLossPercent * 2) / 2; // 0.5 steps
        const tpBucket = Math.round(strategy.riskGenes.takeProfitPercent); // 1.0 steps
        const riskKey = `risk:${regime}:SL${slBucket}:TP${tpBucket}:L${strategy.riskGenes.maxLeverage}`;

        return {
            id: riskKey,
            type: PatternType.RISK_PROFILE,
            regime,
            indicatorTypes: [],
            indicatorGenes: [],
            riskProfile: { ...strategy.riskGenes },
            avgFitness: fitness,
            peakFitness: fitness,
            sampleCount: 1,
            confidenceScore: 0.3,
            successRate: 1.0,
            createdAt: Date.now(),
            lastValidated: Date.now(),
            sourceStrategyIds: [strategy.id],
        };
    }

    /**
     * Extract the signal configuration pattern.
     */
    private extractSignalConfig(
        strategy: StrategyDNA,
        regime: MarketRegime,
        fitness: number,
    ): ExperiencePattern {
        const conditions = strategy.entryRules.entrySignals
            .map(s => s.condition)
            .sort()
            .join('+');
        const signalKey = `signal:${regime}:${conditions}`;

        return {
            id: signalKey,
            type: PatternType.SIGNAL_CONFIG,
            regime,
            indicatorTypes: strategy.indicators.map(ind => ind.type),
            indicatorGenes: strategy.indicators.map(ind => ({ ...ind })),
            riskProfile: null,
            avgFitness: fitness,
            peakFitness: fitness,
            sampleCount: 1,
            confidenceScore: 0.25,
            successRate: 1.0,
            createdAt: Date.now(),
            lastValidated: Date.now(),
            sourceStrategyIds: [strategy.id],
        };
    }

    // ─── Pattern Merge & Update ───────────────────────────────

    /**
     * Merge a new pattern with existing data (Bayesian update) or add as new.
     * This is how patterns gain confidence over time — each independent
     * observation strengthens or weakens the pattern's score.
     */
    private mergeOrAddPattern(newPattern: ExperiencePattern): ExperiencePattern {
        const existing = this.patterns.get(newPattern.id);

        if (!existing) {
            this.patterns.set(newPattern.id, newPattern);
            return newPattern;
        }

        // Bayesian update: weighted average of old and new fitness
        const priorWeight = this.config.bayesianPriorStrength;
        const totalSamples = existing.sampleCount + 1;

        const updatedAvgFitness = (
            (existing.avgFitness * existing.sampleCount + newPattern.avgFitness) / totalSamples
        );

        // Confidence update: approaches 1.0 as samples increase
        // Formula: confidence = samples / (samples + priorStrength)
        const updatedConfidence = totalSamples / (totalSamples + priorWeight);

        // Apply time decay: reduce confidence if pattern is old
        const daysSinceCreation = (Date.now() - existing.createdAt) / (1000 * 60 * 60 * 24);
        const decayFactor = daysSinceCreation > this.config.patternDecayDays
            ? Math.pow(0.99, daysSinceCreation - this.config.patternDecayDays)
            : 1.0;

        // Apply novelty bonus for underserved regimes
        const regimePatternCount = this.countPatternsForRegime(existing.regime);
        const avgPatternsPerRegime = this.patterns.size / 5; // 5 regimes
        const noveltyMultiplier = regimePatternCount < avgPatternsPerRegime
            ? 1 + this.config.noveltyBonus
            : 1.0;

        existing.avgFitness = Math.round(updatedAvgFitness * 100) / 100;
        existing.peakFitness = Math.max(existing.peakFitness, newPattern.peakFitness);
        existing.sampleCount = totalSamples;
        existing.confidenceScore = Math.round(
            Math.min(1, updatedConfidence * decayFactor * noveltyMultiplier) * 10000,
        ) / 10000;
        existing.lastValidated = Date.now();

        // Merge indicator genes: take the higher-fitness version
        if (newPattern.avgFitness > existing.avgFitness) {
            existing.indicatorGenes = newPattern.indicatorGenes;
        }

        // Track source strategies (keep last 20)
        if (!existing.sourceStrategyIds.includes(newPattern.sourceStrategyIds[0])) {
            existing.sourceStrategyIds.push(newPattern.sourceStrategyIds[0]);
            if (existing.sourceStrategyIds.length > 20) {
                existing.sourceStrategyIds = existing.sourceStrategyIds.slice(-20);
            }
        }

        return existing;
    }

    // ─── Seeded Strategy Builder ──────────────────────────────

    /**
     * Build a concrete StrategyDNA from proven patterns.
     * Uses the pattern's genes as a base, then adds slight randomization
     * to maintain diversity and avoid exact cloning.
     */
    private buildSeededStrategy(
        comboPattern: ExperiencePattern,
        riskPattern: ExperiencePattern | null,
        regime: MarketRegime,
        generation: number,
    ): StrategyDNA {
        // Clone and slightly mutate indicator genes from the pattern
        const indicators: IndicatorGene[] = comboPattern.indicatorGenes.map(gene => ({
            id: uuidv4(),
            type: gene.type,
            period: this.perturbPeriod(gene.period, gene.type),
            params: { ...gene.params },
        }));

        // Use proven risk profile or generate a mutated one
        const riskGenes: RiskGenes = riskPattern?.riskProfile
            ? this.perturbRiskGenes(riskPattern.riskProfile)
            : {
                stopLossPercent: Math.round(randomFloat(0.5, 3.0) * 100) / 100,
                takeProfitPercent: Math.round(randomFloat(1.0, 8.0) * 100) / 100,
                positionSizePercent: Math.round(randomFloat(0.5, 2.0) * 100) / 100,
                maxLeverage: randomInt(1, 10),
            };

        // Generate signal rules for the seeded indicators
        const ALL_CONDITIONS: SignalCondition[] = [
            SignalCondition.ABOVE,
            SignalCondition.BELOW,
            SignalCondition.CROSS_ABOVE,
            SignalCondition.CROSS_BELOW,
            SignalCondition.INCREASING,
            SignalCondition.DECREASING,
        ];

        const entrySignals = indicators
            .slice(0, randomInt(1, Math.min(3, indicators.length)))
            .map(ind => ({
                id: uuidv4(),
                indicatorId: ind.id,
                condition: randomPick(ALL_CONDITIONS),
                threshold: Math.round(randomFloat(20, 80) * 100) / 100,
            }));

        const exitSignals = indicators
            .slice(0, randomInt(1, Math.min(2, indicators.length)))
            .map(ind => ({
                id: uuidv4(),
                indicatorId: ind.id,
                condition: randomPick(ALL_CONDITIONS),
                threshold: Math.round(randomFloat(20, 80) * 100) / 100,
            }));

        const ALL_TIMEFRAMES: Timeframe[] = [
            Timeframe.M1, Timeframe.M5, Timeframe.M15, Timeframe.H1, Timeframe.H4,
        ];

        const DEFAULT_PAIRS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];

        return {
            id: uuidv4(),
            name: this.generateSeededName(),
            slotId: '',
            generation,
            parentIds: [],
            createdAt: Date.now(),
            indicators,
            entryRules: {
                entrySignals,
                exitSignals: [],
                trailingStopPercent: Math.random() > 0.5
                    ? Math.round(randomFloat(0.5, 2.0) * 100) / 100
                    : undefined,
            },
            exitRules: {
                entrySignals: [],
                exitSignals,
            },
            preferredTimeframe: randomPick(ALL_TIMEFRAMES),
            preferredPairs: [randomPick(DEFAULT_PAIRS)],
            riskGenes,
            directionBias: null,
            status: StrategyStatus.PAPER,
            metadata: {
                mutationHistory: [`seeded:${comboPattern.id}`],
                fitnessScore: 0,
                tradeCount: 0,
                lastEvaluated: null,
                validation: null,
            },
        };
    }

    // ─── Perturbation Helpers ─────────────────────────────────

    /**
     * Slightly perturb an indicator period to maintain diversity.
     * Keeps 80% of the original value + 20% random noise.
     */
    private perturbPeriod(originalPeriod: number, type: IndicatorType): number {
        const INDICATOR_RANGES: Record<IndicatorType, [number, number]> = {
            [IndicatorType.RSI]: [7, 28],
            [IndicatorType.EMA]: [5, 200],
            [IndicatorType.SMA]: [5, 200],
            [IndicatorType.MACD]: [9, 26],
            [IndicatorType.BOLLINGER]: [10, 30],
            [IndicatorType.ADX]: [10, 30],
            [IndicatorType.ATR]: [7, 21],
            [IndicatorType.STOCH_RSI]: [10, 21],
            [IndicatorType.VOLUME]: [10, 30],
        };

        const [min, max] = INDICATOR_RANGES[type];
        const noise = randomInt(-3, 3);
        return Math.max(min, Math.min(max, originalPeriod + noise));
    }

    /**
     * Slightly perturb risk genes to maintain diversity.
     */
    private perturbRiskGenes(original: RiskGenes): RiskGenes {
        return {
            stopLossPercent: Math.round(
                Math.max(0.5, Math.min(5.0, original.stopLossPercent + randomFloat(-0.3, 0.3))) * 100,
            ) / 100,
            takeProfitPercent: Math.round(
                Math.max(1.0, Math.min(15.0, original.takeProfitPercent + randomFloat(-0.5, 0.5))) * 100,
            ) / 100,
            positionSizePercent: Math.round(
                Math.max(0.5, Math.min(2.0, original.positionSizePercent + randomFloat(-0.2, 0.2))) * 100,
            ) / 100,
            maxLeverage: Math.max(1, Math.min(10,
                original.maxLeverage + (Math.random() > 0.7 ? randomInt(-1, 1) : 0),
            )),
        };
    }

    // ─── Utility Methods ──────────────────────────────────────

    /**
     * Select a pattern with probability proportional to its confidence score.
     */
    private weightedSelect(patterns: ExperiencePattern[]): ExperiencePattern {
        const totalWeight = patterns.reduce((sum, p) => sum + p.confidenceScore, 0);
        if (totalWeight <= 0) return patterns[0];

        let random = Math.random() * totalWeight;
        for (const pattern of patterns) {
            random -= pattern.confidenceScore;
            if (random <= 0) return pattern;
        }
        return patterns[patterns.length - 1];
    }

    /**
     * Count patterns for a specific regime.
     */
    private countPatternsForRegime(regime: MarketRegime): number {
        let count = 0;
        for (const pattern of this.patterns.values()) {
            if (pattern.regime === regime) count++;
        }
        return count;
    }

    /**
     * Evict lowest-confidence patterns if over capacity.
     */
    private evictIfOverCapacity(): void {
        while (this.patterns.size > this.config.maxPatterns) {
            let worstId: string | null = null;
            let worstScore = Infinity;

            for (const [id, pattern] of this.patterns) {
                const score = pattern.confidenceScore * pattern.avgFitness;
                if (score < worstScore) {
                    worstScore = score;
                    worstId = id;
                }
            }

            if (worstId !== null) {
                this.patterns.delete(worstId);
            } else {
                break;
            }
        }
    }

    /**
     * Create an empty regime count map.
     */
    private createEmptyRegimeCount(): Record<MarketRegime, number> {
        return {
            [MarketRegime.TRENDING_UP]: 0,
            [MarketRegime.TRENDING_DOWN]: 0,
            [MarketRegime.RANGING]: 0,
            [MarketRegime.HIGH_VOLATILITY]: 0,
            [MarketRegime.LOW_VOLATILITY]: 0,
        };
    }

    /**
     * Generate a distinctive name for seeded strategies.
     */
    private generateSeededName(): string {
        const prefixes = [
            'Legacy', 'Proven', 'Replay', 'Heritage', 'Refined',
            'Evolved', 'Veteran', 'Wise', 'Tested', 'Forged',
        ];
        const suffixes = [
            'Alpha', 'Prime', 'Elite', 'Core', 'Anchor',
            'Sentinel', 'Guardian', 'Sage', 'Oracle', 'Phoenix',
        ];
        return `${randomPick(prefixes)} ${randomPick(suffixes)}`;
    }
}
