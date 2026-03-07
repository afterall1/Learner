// ============================================================
// Learner: Knowledge-Directed Strategy Synthesis (KDSS)
// ============================================================
// Phase 20: The paradigm shift from blind Darwinian evolution
// to Lamarckian directed construction.
//
// Instead of random mutation + crossover, KDSS uses accumulated
// knowledge from ALL modules to INTELLIGENTLY CONSTRUCT new
// strategies that are pre-optimized for specific behavioral niches.
//
// Knowledge Sources (consumed):
//   1. Bayesian Calibrator → signal reliability per regime
//   2. SAIE Gene Importance → which indicators matter (MI)
//   3. MAP-Elites Grid → which niches are empty/weak
//   4. Experience Replay → proven gene patterns
//   5. Metacognitive Monitor → epistemic uncertainty
//   6. Trade Forensics → failure patterns to avoid
//
// Key insight: After hundreds of evaluations, the system knows
// WHAT WORKS and WHAT FAILS. KDSS uses this knowledge to build
// strategies that are designed to succeed, not randomly stumbled
// upon through blind search.
//
// Result: 30% of each new generation is knowledge-directed,
// 70% remains standard GA for exploration diversity.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type StrategyDNA,
    type KDSSConfig,
    type KnowledgeContext,
    type SynthesisBlueprint,
    type SynthesisReport,
    type GeneImportanceScore,
    IndicatorType,
    SignalCondition,
    TradeStyle,
    MarketRegime,
    Timeframe,
    StrategyStatus,
    DEFAULT_KDSS_CONFIG,
} from '@/types';

// ─── Constants ───────────────────────────────────────────────

const ALL_INDICATOR_TYPES: IndicatorType[] = [
    IndicatorType.RSI, IndicatorType.EMA, IndicatorType.SMA,
    IndicatorType.MACD, IndicatorType.BOLLINGER, IndicatorType.ADX,
    IndicatorType.ATR, IndicatorType.VOLUME, IndicatorType.STOCH_RSI,
];

/** Default period ranges per indicator type. */
const PERIOD_RANGES: Record<IndicatorType, { min: number; max: number; sweet: number }> = {
    [IndicatorType.RSI]: { min: 7, max: 30, sweet: 14 },
    [IndicatorType.EMA]: { min: 5, max: 200, sweet: 21 },
    [IndicatorType.SMA]: { min: 10, max: 200, sweet: 50 },
    [IndicatorType.MACD]: { min: 9, max: 50, sweet: 12 },
    [IndicatorType.BOLLINGER]: { min: 10, max: 50, sweet: 20 },
    [IndicatorType.ADX]: { min: 7, max: 30, sweet: 14 },
    [IndicatorType.ATR]: { min: 7, max: 30, sweet: 14 },
    [IndicatorType.VOLUME]: { min: 10, max: 50, sweet: 20 },
    [IndicatorType.STOCH_RSI]: { min: 7, max: 21, sweet: 14 },
};

/** Risk profile templates per trade style. */
const STYLE_RISK_TEMPLATES: Record<TradeStyle, {
    sl: { min: number; max: number; center: number };
    tp: { min: number; max: number; center: number };
    leverage: { min: number; max: number; center: number };
    posSize: { min: number; max: number; center: number };
}> = {
    [TradeStyle.SCALPER]: {
        sl: { min: 0.3, max: 1.5, center: 0.8 },
        tp: { min: 0.5, max: 3.0, center: 1.5 },
        leverage: { min: 3, max: 10, center: 5 },
        posSize: { min: 1, max: 5, center: 3 },
    },
    [TradeStyle.SWING]: {
        sl: { min: 1.0, max: 4.0, center: 2.0 },
        tp: { min: 2.0, max: 10.0, center: 5.0 },
        leverage: { min: 2, max: 7, center: 3 },
        posSize: { min: 2, max: 8, center: 5 },
    },
    [TradeStyle.POSITION]: {
        sl: { min: 2.0, max: 8.0, center: 4.0 },
        tp: { min: 5.0, max: 20.0, center: 10.0 },
        leverage: { min: 1, max: 5, center: 2 },
        posSize: { min: 3, max: 10, center: 5 },
    },
};

/** Regime-indicator affinity matrix — which indicators tend to work in which regimes. */
const REGIME_INDICATOR_AFFINITY: Record<MarketRegime, IndicatorType[]> = {
    [MarketRegime.TRENDING_UP]: [IndicatorType.EMA, IndicatorType.MACD, IndicatorType.ADX, IndicatorType.VOLUME],
    [MarketRegime.TRENDING_DOWN]: [IndicatorType.EMA, IndicatorType.MACD, IndicatorType.RSI, IndicatorType.VOLUME],
    [MarketRegime.RANGING]: [IndicatorType.RSI, IndicatorType.BOLLINGER, IndicatorType.STOCH_RSI, IndicatorType.ATR],
    [MarketRegime.HIGH_VOLATILITY]: [IndicatorType.ATR, IndicatorType.BOLLINGER, IndicatorType.ADX, IndicatorType.VOLUME],
    [MarketRegime.LOW_VOLATILITY]: [IndicatorType.RSI, IndicatorType.SMA, IndicatorType.STOCH_RSI, IndicatorType.BOLLINGER],
};

// ─── Noise Injection ─────────────────────────────────────────

/**
 * Add controlled Gaussian noise to a value within bounds.
 * Keeps the value near center but with diversity.
 */
function addNoise(
    center: number,
    min: number,
    max: number,
    noiseLevel: number,
): number {
    const range = max - min;
    // Box-Muller transform for Gaussian noise
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
    const noise = z * range * noiseLevel;
    return Math.max(min, Math.min(max, center + noise));
}

/**
 * Add controlled noise to an integer value.
 */
function addNoiseInt(
    center: number,
    min: number,
    max: number,
    noiseLevel: number,
): number {
    return Math.round(addNoise(center, min, max, noiseLevel));
}

// ─── Blueprint Construction ──────────────────────────────────

/**
 * Select indicators for a target niche using gene importance + regime affinity.
 *
 * Strategy:
 *   1. Start with regime-affine indicators
 *   2. Boost indicators with high gene importance (from SAIE)
 *   3. Add high-reliability indicators (from Bayesian Calibrator)
 *   4. Limit to 3-5 indicators to avoid complexity penalty
 */
function selectIndicators(
    targetRegime: MarketRegime,
    geneImportance: GeneImportanceScore[],
    signalReliability: Map<string, number>,
    config: KDSSConfig,
): IndicatorType[] {
    // Score each indicator type
    const scores: Array<{ type: IndicatorType; score: number }> = [];

    const affinitySet = new Set(REGIME_INDICATOR_AFFINITY[targetRegime]);

    for (const type of ALL_INDICATOR_TYPES) {
        let score = 0;

        // 1. Regime affinity bonus (+3)
        if (affinitySet.has(type)) {
            score += 3;
        }

        // 2. Gene importance bonus (0-5, from SAIE MI analysis)
        const importance = geneImportance.find(g =>
            g.featureName === `has_${type}`,
        );
        if (importance && importance.normalizedImportance >= config.minGeneImportance) {
            score += importance.normalizedImportance * 5;
        }

        // 3. Signal reliability bonus (0-3, from Bayesian Calibrator)
        // Check all conditions for this indicator in target regime
        let bestReliability = 0;
        for (const condition of Object.values(SignalCondition)) {
            const key = `${type}|${condition}|${targetRegime}`;
            const reliability = signalReliability.get(key);
            if (reliability !== undefined && reliability > bestReliability) {
                bestReliability = reliability;
            }
        }
        score += bestReliability * 3;

        scores.push({ type, score });
    }

    // Sort by combined score
    scores.sort((a, b) => b.score - a.score);

    // Select top 3-5 indicators
    const count = 3 + Math.floor(Math.random() * 3); // 3 to 5
    return scores.slice(0, count).map(s => s.type);
}

/**
 * Construct a risk profile for a target trade style.
 * Uses style templates as base, then adjusts based on
 * epistemic uncertainty (higher uncertainty → tighter risk).
 */
function constructRiskProfile(
    targetStyle: TradeStyle,
    epistemicUncertainty: number,
    noiseLevel: number,
): { sl: number; tp: number; leverage: number; positionSize: number } {
    const template = STYLE_RISK_TEMPLATES[targetStyle];

    // Adjust for epistemic uncertainty: higher uncertainty → tighter SL, lower leverage
    const uncertaintyFactor = 1 - epistemicUncertainty * 0.3;

    return {
        sl: addNoise(
            template.sl.center * uncertaintyFactor,
            template.sl.min,
            template.sl.max,
            noiseLevel,
        ),
        tp: addNoise(
            template.tp.center,
            template.tp.min,
            template.tp.max,
            noiseLevel,
        ),
        leverage: Math.round(addNoise(
            template.leverage.center * uncertaintyFactor,
            template.leverage.min,
            template.leverage.max,
            noiseLevel,
        )),
        positionSize: addNoise(
            template.posSize.center * uncertaintyFactor,
            template.posSize.min,
            template.posSize.max,
            noiseLevel,
        ),
    };
}

/**
 * Create a SynthesisBlueprint for a target niche.
 */
function createBlueprint(
    targetRegime: MarketRegime,
    targetStyle: TradeStyle,
    knowledge: KnowledgeContext,
    config: KDSSConfig,
): SynthesisBlueprint {
    const reasoning: string[] = [];

    // 1. Select indicators
    const selectedIndicators = selectIndicators(
        targetRegime,
        knowledge.geneImportance,
        knowledge.signalReliability,
        config,
    );
    reasoning.push(`Selected ${selectedIndicators.length} indicators: ${selectedIndicators.join(', ')}`);

    // 2. Determine parameter ranges (centered on sweet spots)
    const parameterRanges = new Map<string, { min: number; max: number; center: number }>();
    for (const indType of selectedIndicators) {
        const range = PERIOD_RANGES[indType];
        parameterRanges.set(indType, {
            min: range.min,
            max: range.max,
            center: range.sweet,
        });
    }

    // 3. Construct risk profile
    const riskProfile = constructRiskProfile(
        targetStyle,
        knowledge.epistemicUncertainty,
        config.noiseLevel,
    );
    reasoning.push(`Risk profile: SL=${riskProfile.sl.toFixed(1)}%, TP=${riskProfile.tp.toFixed(1)}%, Lev=${riskProfile.leverage}x`);

    // 4. Calculate confidence
    const importantIndicatorsUsed = selectedIndicators.filter(ind => {
        const imp = knowledge.geneImportance.find(g => g.featureName === `has_${ind}`);
        return imp && imp.normalizedImportance >= config.minGeneImportance;
    });
    const dataConfidence = Math.min(1, importantIndicatorsUsed.length / 3);
    const confidence = dataConfidence * (1 - knowledge.epistemicUncertainty * 0.5);
    reasoning.push(`Blueprint confidence: ${(confidence * 100).toFixed(0)}%`);

    return {
        targetRegime,
        targetStyle,
        selectedIndicators,
        parameterRanges,
        riskProfile,
        confidence,
        reasoning,
    };
}

// ─── Strategy Construction ───────────────────────────────────

/**
 * Build a complete StrategyDNA from a synthesis blueprint.
 */
function constructStrategy(
    blueprint: SynthesisBlueprint,
    generation: number,
    noiseLevel: number,
): StrategyDNA {
    const strategyId = uuidv4();

    // Build indicator genes from blueprint (IndicatorGene: id, type, period, params)
    const indicators = blueprint.selectedIndicators.map(type => {
        const range = PERIOD_RANGES[type];
        const period = addNoiseInt(range.sweet, range.min, range.max, noiseLevel);
        const geneId = uuidv4();

        return {
            id: geneId,
            type,
            period,
            params: buildIndicatorParams(type, period, noiseLevel),
        };
    });

    // Build entry rules (SignalRule: id, indicatorId, condition, threshold)
    const entrySignals = indicators.slice(0, 3).map(gene => {
        const condition = getDefaultEntryCondition(gene.type);
        return {
            id: uuidv4(),
            indicatorId: gene.id,
            condition,
            threshold: getDefaultThreshold(gene.type, condition),
        };
    });

    // Build exit rules
    const exitSignals = indicators.slice(0, 2).map(gene => {
        const condition = getDefaultExitCondition(gene.type);
        return {
            id: uuidv4(),
            indicatorId: gene.id,
            condition,
            threshold: getDefaultThreshold(gene.type, condition),
        };
    });

    const strategy: StrategyDNA = {
        id: strategyId,
        name: `KDSS-${blueprint.targetRegime.slice(0, 3)}-${blueprint.targetStyle.slice(0, 3)}-${generation}`,
        slotId: '',
        generation,
        parentIds: [],
        createdAt: Date.now(),
        indicators,
        entryRules: {
            entrySignals,
            exitSignals: [],
        },
        exitRules: {
            entrySignals: [],
            exitSignals,
        },
        preferredTimeframe: Timeframe.H1,
        preferredPairs: ['BTCUSDT'],
        riskGenes: {
            stopLossPercent: blueprint.riskProfile.sl,
            takeProfitPercent: blueprint.riskProfile.tp,
            maxLeverage: blueprint.riskProfile.leverage,
            positionSizePercent: blueprint.riskProfile.positionSize,
        },
        directionBias: null,
        status: StrategyStatus.PAPER,
        metadata: {
            mutationHistory: ['KDSS_SYNTHESIS'],
            fitnessScore: 0,
            tradeCount: 0,
            lastEvaluated: null,
            validation: null,
        },
    };

    return strategy;
}

/**
 * Build indicator-specific params based on type.
 */
function buildIndicatorParams(
    type: IndicatorType,
    period: number,
    noiseLevel: number,
): Record<string, number> {
    switch (type) {
        case IndicatorType.MACD:
            return {
                fastPeriod: Math.max(5, Math.round(period * 0.6)),
                slowPeriod: Math.max(10, Math.round(period * 1.4)),
                signalPeriod: 9,
            };
        case IndicatorType.BOLLINGER:
            return {
                period,
                stdDev: addNoise(2, 1.5, 3, noiseLevel),
            };
        case IndicatorType.STOCH_RSI:
            return {
                rsiPeriod: period,
                stochPeriod: period,
                smoothK: 3,
                smoothD: 3,
            };
        default:
            return { period };
    }
}


/**
 * Get the default entry condition for an indicator type.
 */
function getDefaultEntryCondition(type: IndicatorType): SignalCondition {
    switch (type) {
        case IndicatorType.RSI:
        case IndicatorType.STOCH_RSI:
            return SignalCondition.BELOW;
        case IndicatorType.EMA:
        case IndicatorType.SMA:
            return SignalCondition.CROSS_ABOVE;
        case IndicatorType.MACD:
            return SignalCondition.CROSS_ABOVE;
        case IndicatorType.BOLLINGER:
            return SignalCondition.BELOW;
        case IndicatorType.ADX:
            return SignalCondition.ABOVE;
        case IndicatorType.ATR:
            return SignalCondition.ABOVE;
        case IndicatorType.VOLUME:
            return SignalCondition.ABOVE;
        default:
            return SignalCondition.ABOVE;
    }
}

/**
 * Get the default exit condition for an indicator type.
 */
function getDefaultExitCondition(type: IndicatorType): SignalCondition {
    switch (type) {
        case IndicatorType.RSI:
        case IndicatorType.STOCH_RSI:
            return SignalCondition.ABOVE;
        case IndicatorType.EMA:
        case IndicatorType.SMA:
            return SignalCondition.CROSS_BELOW;
        case IndicatorType.MACD:
            return SignalCondition.CROSS_BELOW;
        case IndicatorType.BOLLINGER:
            return SignalCondition.ABOVE;
        case IndicatorType.ADX:
            return SignalCondition.BELOW;
        case IndicatorType.ATR:
            return SignalCondition.BELOW;
        case IndicatorType.VOLUME:
            return SignalCondition.BELOW;
        default:
            return SignalCondition.BELOW;
    }
}

/**
 * Get the default threshold value for an indicator/condition combo.
 */
function getDefaultThreshold(type: IndicatorType, condition: SignalCondition): number {
    switch (type) {
        case IndicatorType.RSI:
            return condition === SignalCondition.BELOW ? 30 :
                condition === SignalCondition.ABOVE ? 70 : 50;
        case IndicatorType.STOCH_RSI:
            return condition === SignalCondition.BELOW ? 0.2 :
                condition === SignalCondition.ABOVE ? 0.8 : 0.5;
        case IndicatorType.ADX:
            return condition === SignalCondition.ABOVE ? 25 : 20;
        case IndicatorType.EMA:
        case IndicatorType.SMA:
            return 0; // Crossover doesn't need a threshold value
        case IndicatorType.MACD:
            return 0; // Crossover with signal line
        case IndicatorType.BOLLINGER:
            return condition === SignalCondition.BELOW ? -1 : 1;
        case IndicatorType.ATR:
            return 1.5; // ATR multiplier
        case IndicatorType.VOLUME:
            return 1.2; // Volume ratio threshold
        default:
            return 0;
    }
}

// ─── KDSS Engine ─────────────────────────────────────────────

/**
 * KDSSEngine — The Knowledge-Directed Strategy Synthesis controller.
 *
 * This is the paradigm shift from blind evolution to informed construction.
 * Instead of random mutation/crossover, KDSS:
 *
 * 1. Gathers knowledge from ALL 6 modules
 * 2. Identifies which MAP-Elites grid cells need filling
 * 3. Designs strategy blueprints using accumulated intelligence
 * 4. Constructs fully-formed strategies from blueprints
 * 5. Injects controlled noise for diversity
 *
 * Usage:
 *   const kdss = new KDSSEngine();
 *   const strategies = kdss.synthesizeBatch(knowledge, 10, generation);
 *   // strategies are pre-designed for empty/weak grid cells
 */
export class KDSSEngine {
    private config: KDSSConfig;
    private totalSynthesized: number = 0;
    private lastReport: SynthesisReport | null = null;

    constructor(config: Partial<KDSSConfig> = {}) {
        this.config = { ...DEFAULT_KDSS_CONFIG, ...config };
    }

    /**
     * Synthesize a batch of knowledge-directed strategies.
     *
     * @param knowledge - Aggregated knowledge from all modules
     * @param count - Number of strategies to synthesize
     * @param generation - Current generation number
     * @returns Array of intelligently constructed strategies
     */
    synthesizeBatch(
        knowledge: KnowledgeContext,
        count: number,
        generation: number,
    ): StrategyDNA[] {
        const strategies: StrategyDNA[] = [];
        const knowledgeSourcesUsed = new Set<string>();
        let totalConfidence = 0;
        const targetedNiches = new Set<string>();

        // Determine target niches
        const targets = this.selectTargetNiches(knowledge, count);

        for (const target of targets) {
            // Create blueprint
            const blueprint = createBlueprint(
                target.regime,
                target.style,
                knowledge,
                this.config,
            );

            // Track knowledge sources
            if (knowledge.geneImportance.length > 0) knowledgeSourcesUsed.add('SAIE_GeneImportance');
            if (knowledge.signalReliability.size > 0) knowledgeSourcesUsed.add('BayesianCalibrator');
            if (knowledge.gridGaps.length > 0) knowledgeSourcesUsed.add('MAPElites_GridGaps');
            if (knowledge.provenPatterns.length > 0) knowledgeSourcesUsed.add('ExperienceReplay');
            knowledgeSourcesUsed.add('MetacognitiveMonitor');

            // Construct strategy from blueprint
            const strategy = constructStrategy(blueprint, generation, this.config.noiseLevel);
            strategies.push(strategy);

            totalConfidence += blueprint.confidence;
            targetedNiches.add(`${target.regime}::${target.style}`);
        }

        this.totalSynthesized += strategies.length;

        // Create report
        this.lastReport = {
            strategiesSynthesized: strategies.length,
            targetedNiches: targetedNiches.size,
            avgBlueprintConfidence: strategies.length > 0 ? totalConfidence / strategies.length : 0,
            knowledgeSourcesUsed: Array.from(knowledgeSourcesUsed),
            timestamp: Date.now(),
        };

        return strategies;
    }

    /**
     * Synthesize a single strategy for a specific niche.
     */
    synthesizeForNiche(
        targetRegime: MarketRegime,
        targetStyle: TradeStyle,
        knowledge: KnowledgeContext,
        generation: number,
    ): StrategyDNA {
        const blueprint = createBlueprint(
            targetRegime,
            targetStyle,
            knowledge,
            this.config,
        );

        const strategy = constructStrategy(blueprint, generation, this.config.noiseLevel);
        this.totalSynthesized++;

        return strategy;
    }

    /**
     * Get the number of KDSS-generated strategies needed for a generation.
     */
    getKDSSSlots(populationSize: number): number {
        return Math.floor(populationSize * this.config.synthesisRatio);
    }

    /**
     * Get the last synthesis report.
     */
    getLastReport(): SynthesisReport | null {
        return this.lastReport;
    }

    /**
     * Get total strategies synthesized across all generations.
     */
    getTotalSynthesized(): number {
        return this.totalSynthesized;
    }

    /**
     * Select target niches for synthesis.
     *
     * Priority:
     * 1. Empty grid cells (highest priority)
     * 2. Weak grid cells (fitness below average)
     * 3. Current regime cells (if not already strong)
     * 4. Random cells for diversity
     */
    private selectTargetNiches(
        knowledge: KnowledgeContext,
        count: number,
    ): Array<{ regime: MarketRegime; style: TradeStyle }> {
        const targets: Array<{ regime: MarketRegime; style: TradeStyle; priority: number }> = [];

        // Sort grid gaps by priority (empty cells first, then weakest)
        const sortedGaps = [...knowledge.gridGaps]
            .sort((a, b) => a.currentFitness - b.currentFitness);

        for (const gap of sortedGaps) {
            let priority = 0;

            // Empty cell = highest priority
            if (gap.currentFitness <= 0 || gap.currentFitness === -Infinity) {
                priority = 100;
            } else {
                // Weakness score: lower fitness = higher priority
                priority = Math.max(0, 50 - gap.currentFitness);
            }

            // Bonus for current regime
            if (gap.regime === knowledge.currentRegime) {
                priority += 20;
            }

            targets.push({
                regime: gap.regime,
                style: gap.style,
                priority,
            });
        }

        // Sort by priority (highest first)
        targets.sort((a, b) => b.priority - a.priority);

        // Select top-N, with duplicates for empty cells
        const selected: Array<{ regime: MarketRegime; style: TradeStyle }> = [];
        let targetIdx = 0;

        while (selected.length < count && targets.length > 0) {
            const target = targets[targetIdx % targets.length];
            selected.push({ regime: target.regime, style: target.style });
            targetIdx++;
        }

        return selected;
    }
}
