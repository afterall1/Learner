// ============================================================
// Learner: Strategy DNA — Genome Generator & Operators
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    StrategyDNA,
    IndicatorGene,
    SignalRule,
    IndicatorType,
    SignalCondition,
    Timeframe,
    TradeDirection,
    StrategyStatus,
    RiskGenes,
} from '@/types';
import {
    generateRandomMicrostructureGene,
    crossoverMicrostructureGene,
    mutateMicrostructureGene,
} from './microstructure-genes';
import {
    generateRandomPriceActionGene,
    crossoverPriceActionGene,
    mutatePriceActionGene,
} from './price-action-genes';
import {
    generateRandomCompositeGene,
    crossoverCompositeGene,
    mutateCompositeGene,
} from './composite-functions';
import {
    generateRandomDCGene,
    crossoverDCGene,
    mutateDCGene,
} from './directional-change';

// ─── Random Utility Helpers ──────────────────────────────────

function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// ─── Constants ───────────────────────────────────────────────

const ALL_INDICATORS: IndicatorType[] = [
    IndicatorType.RSI,
    IndicatorType.EMA,
    IndicatorType.SMA,
    IndicatorType.MACD,
    IndicatorType.BOLLINGER,
    IndicatorType.ADX,
    IndicatorType.ATR,
    IndicatorType.STOCH_RSI,
];

const ALL_TIMEFRAMES: Timeframe[] = [
    Timeframe.M1,
    Timeframe.M5,
    Timeframe.M15,
    Timeframe.H1,
    Timeframe.H4,
];

const ALL_CONDITIONS: SignalCondition[] = [
    SignalCondition.ABOVE,
    SignalCondition.BELOW,
    SignalCondition.CROSS_ABOVE,
    SignalCondition.CROSS_BELOW,
    SignalCondition.INCREASING,
    SignalCondition.DECREASING,
];

const DEFAULT_PAIRS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];

// ─── Indicator Period Ranges ─────────────────────────────────

const INDICATOR_CONFIGS: Record<IndicatorType, { minPeriod: number; maxPeriod: number; defaultParams: Record<string, [number, number]> }> = {
    [IndicatorType.RSI]: { minPeriod: 7, maxPeriod: 28, defaultParams: {} },
    [IndicatorType.EMA]: { minPeriod: 5, maxPeriod: 200, defaultParams: {} },
    [IndicatorType.SMA]: { minPeriod: 5, maxPeriod: 200, defaultParams: {} },
    [IndicatorType.MACD]: { minPeriod: 9, maxPeriod: 26, defaultParams: { fastPeriod: [8, 16], slowPeriod: [20, 32], signalPeriod: [7, 12] } },
    [IndicatorType.BOLLINGER]: { minPeriod: 10, maxPeriod: 30, defaultParams: { stdDev: [1.5, 3.0] } },
    [IndicatorType.ADX]: { minPeriod: 10, maxPeriod: 30, defaultParams: {} },
    [IndicatorType.ATR]: { minPeriod: 7, maxPeriod: 21, defaultParams: {} },
    [IndicatorType.STOCH_RSI]: { minPeriod: 10, maxPeriod: 21, defaultParams: { kPeriod: [3, 7], dPeriod: [3, 7] } },
    [IndicatorType.VOLUME]: { minPeriod: 10, maxPeriod: 30, defaultParams: {} },
};

// ─── Generator Functions ─────────────────────────────────────

function generateIndicatorGene(type?: IndicatorType): IndicatorGene {
    const indicatorType = type ?? randomPick(ALL_INDICATORS);
    const config = INDICATOR_CONFIGS[indicatorType];
    const params: Record<string, number> = {};

    for (const [key, [min, max]] of Object.entries(config.defaultParams)) {
        params[key] = Math.round(randomFloat(min, max) * 100) / 100;
    }

    return {
        id: uuidv4(),
        type: indicatorType,
        period: randomInt(config.minPeriod, config.maxPeriod),
        params,
    };
}

function generateSignalRule(indicatorId: string): SignalRule {
    const condition = randomPick(ALL_CONDITIONS);
    const rule: SignalRule = {
        id: uuidv4(),
        indicatorId,
        condition,
        threshold: Math.round(randomFloat(20, 80) * 100) / 100,
    };

    if (condition === SignalCondition.BETWEEN) {
        rule.secondaryThreshold = Math.round(randomFloat(rule.threshold, 95) * 100) / 100;
    }

    return rule;
}

function generateRiskGenes(): RiskGenes {
    return {
        stopLossPercent: Math.round(randomFloat(0.5, 3.0) * 100) / 100,
        takeProfitPercent: Math.round(randomFloat(1.0, 8.0) * 100) / 100,
        positionSizePercent: Math.round(randomFloat(0.5, 2.0) * 100) / 100,
        maxLeverage: randomInt(1, 10),
    };
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Generate a completely random Strategy DNA. This is the "exploration" phase
 * where the system creates novel strategies from scratch.
 */
export function generateRandomStrategy(generation: number = 0): StrategyDNA {
    // Create 2-4 indicator genes
    const indicatorCount = randomInt(2, 4);
    const indicators: IndicatorGene[] = [];
    const usedTypes = new Set<IndicatorType>();

    for (let i = 0; i < indicatorCount; i++) {
        let type = randomPick(ALL_INDICATORS);
        // Avoid duplicate indicator types
        while (usedTypes.has(type) && usedTypes.size < ALL_INDICATORS.length) {
            type = randomPick(ALL_INDICATORS);
        }
        usedTypes.add(type);
        indicators.push(generateIndicatorGene(type));
    }

    // Create entry signals (1-3 rules)
    const entrySignalCount = randomInt(1, 3);
    const entrySignals: SignalRule[] = [];
    for (let i = 0; i < entrySignalCount; i++) {
        const targetIndicator = randomPick(indicators);
        entrySignals.push(generateSignalRule(targetIndicator.id));
    }

    // Create exit signals (1-2 rules)
    const exitSignalCount = randomInt(1, 2);
    const exitSignals: SignalRule[] = [];
    for (let i = 0; i < exitSignalCount; i++) {
        const targetIndicator = randomPick(indicators);
        exitSignals.push(generateSignalRule(targetIndicator.id));
    }

    const riskGenes = generateRiskGenes();

    // ─── Phase 9: Advanced Gene Injection ─────────────────────
    // 40% chance to include advanced genes in random strategies.
    // This lets the GA explore structural innovation alongside
    // standard indicator-based strategies.
    const strategy: StrategyDNA = {
        id: uuidv4(),
        name: generateStrategyName(),
        slotId: '',
        generation,
        parentIds: [],
        createdAt: Date.now(),
        indicators,
        entryRules: {
            entrySignals,
            exitSignals: [],
            trailingStopPercent: Math.random() > 0.5 ? Math.round(randomFloat(0.5, 2.0) * 100) / 100 : undefined,
        },
        exitRules: {
            entrySignals: [],
            exitSignals,
        },
        preferredTimeframe: randomPick(ALL_TIMEFRAMES),
        preferredPairs: [randomPick(DEFAULT_PAIRS)],
        riskGenes,
        directionBias: Math.random() > 0.3 ? null : randomPick([TradeDirection.LONG, TradeDirection.SHORT]),
        status: StrategyStatus.PAPER,
        metadata: {
            mutationHistory: ['genesis'],
            fitnessScore: 0,
            tradeCount: 0,
            lastEvaluated: null,
            validation: null,
        },
    };

    // Inject advanced genes (each type has independent 40% chance)
    if (Math.random() < 0.4) {
        strategy.microstructureGenes = [
            generateRandomMicrostructureGene(),
            ...(Math.random() < 0.3 ? [generateRandomMicrostructureGene()] : []),
        ];
    }
    if (Math.random() < 0.4) {
        strategy.priceActionGenes = [
            generateRandomPriceActionGene(),
            ...(Math.random() < 0.3 ? [generateRandomPriceActionGene()] : []),
        ];
    }
    if (Math.random() < 0.35) {
        strategy.compositeGenes = [
            generateRandomCompositeGene(),
        ];
    }
    if (Math.random() < 0.25) {
        strategy.dcGenes = [
            generateRandomDCGene(),
        ];
    }

    // Calculate structural complexity
    strategy.metadata.structuralComplexity = calculateStructuralComplexity(strategy);

    return strategy;
}

/**
 * Crossover two parent strategies to produce a child strategy.
 * Uses uniform crossover — each gene is randomly selected from either parent.
 */
export function crossover(parentA: StrategyDNA, parentB: StrategyDNA, generation: number): StrategyDNA {
    const child = generateRandomStrategy(generation);
    child.parentIds = [parentA.id, parentB.id];
    child.name = generateStrategyName();

    // Crossover indicators — take from each parent
    const allIndicators = [...parentA.indicators, ...parentB.indicators];
    const selectedIndicators: IndicatorGene[] = [];
    const usedTypes = new Set<IndicatorType>();
    const count = randomInt(2, Math.min(4, allIndicators.length));

    for (let i = 0; i < count && i < allIndicators.length; i++) {
        const candidate = randomPick(allIndicators);
        if (!usedTypes.has(candidate.type)) {
            usedTypes.add(candidate.type);
            selectedIndicators.push({ ...candidate, id: uuidv4() });
        }
    }
    child.indicators = selectedIndicators.length > 0 ? selectedIndicators : [generateIndicatorGene()];

    // Crossover risk genes — blend from both parents
    child.riskGenes = {
        stopLossPercent: Math.round(((parentA.riskGenes.stopLossPercent + parentB.riskGenes.stopLossPercent) / 2) * 100) / 100,
        takeProfitPercent: Math.round(((parentA.riskGenes.takeProfitPercent + parentB.riskGenes.takeProfitPercent) / 2) * 100) / 100,
        positionSizePercent: Math.round(((parentA.riskGenes.positionSizePercent + parentB.riskGenes.positionSizePercent) / 2) * 100) / 100,
        maxLeverage: Math.round((parentA.riskGenes.maxLeverage + parentB.riskGenes.maxLeverage) / 2),
    };

    // Crossover timeframe — pick from either parent
    child.preferredTimeframe = Math.random() > 0.5 ? parentA.preferredTimeframe : parentB.preferredTimeframe;

    // Crossover pairs — union of both parents' pairs
    const pairSet = new Set([...parentA.preferredPairs, ...parentB.preferredPairs]);
    child.preferredPairs = Array.from(pairSet).slice(0, 3);

    // Rebuild signals for new indicator set
    child.entryRules.entrySignals = child.indicators
        .slice(0, randomInt(1, Math.min(3, child.indicators.length)))
        .map(ind => generateSignalRule(ind.id));

    child.exitRules.exitSignals = child.indicators
        .slice(0, randomInt(1, Math.min(2, child.indicators.length)))
        .map(ind => generateSignalRule(ind.id));

    child.metadata.mutationHistory = ['crossover'];
    child.metadata.validation = null;

    // ─── Phase 9: Crossover advanced genes from parents ──────
    crossoverAdvancedGenes(child, parentA, parentB);
    child.metadata.structuralComplexity = calculateStructuralComplexity(child);

    return child;
}

/**
 * Mutate a strategy by randomly modifying 1-3 genes.
 * This introduces small variations while preserving the core structure.
 */
export function mutate(strategy: StrategyDNA, mutationRate: number = 0.3): StrategyDNA {
    const mutated: StrategyDNA = JSON.parse(JSON.stringify(strategy));
    mutated.id = uuidv4();
    mutated.parentIds = [strategy.id];
    mutated.createdAt = Date.now();
    mutated.status = StrategyStatus.PAPER;
    mutated.metadata.fitnessScore = 0;
    mutated.metadata.tradeCount = 0;
    mutated.metadata.lastEvaluated = null;
    mutated.metadata.validation = null;

    const mutations: string[] = [];

    // Mutate indicator periods
    for (const indicator of mutated.indicators) {
        if (Math.random() < mutationRate) {
            const config = INDICATOR_CONFIGS[indicator.type];
            const delta = randomInt(-5, 5);
            indicator.period = clamp(indicator.period + delta, config.minPeriod, config.maxPeriod);
            mutations.push(`period:${indicator.type}`);
        }
    }

    // Mutate risk genes
    if (Math.random() < mutationRate) {
        const delta = randomFloat(-0.5, 0.5);
        mutated.riskGenes.stopLossPercent = clamp(
            Math.round((mutated.riskGenes.stopLossPercent + delta) * 100) / 100,
            0.5, 5.0
        );
        mutations.push('stopLoss');
    }

    if (Math.random() < mutationRate) {
        const delta = randomFloat(-1.0, 1.0);
        mutated.riskGenes.takeProfitPercent = clamp(
            Math.round((mutated.riskGenes.takeProfitPercent + delta) * 100) / 100,
            1.0, 15.0
        );
        mutations.push('takeProfit');
    }

    if (Math.random() < mutationRate) {
        const delta = randomFloat(-0.3, 0.3);
        mutated.riskGenes.positionSizePercent = clamp(
            Math.round((mutated.riskGenes.positionSizePercent + delta) * 100) / 100,
            0.5, 2.0
        );
        mutations.push('positionSize');
    }

    // Mutate signal thresholds
    for (const signal of mutated.entryRules.entrySignals) {
        if (Math.random() < mutationRate) {
            const delta = randomFloat(-10, 10);
            signal.threshold = clamp(Math.round((signal.threshold + delta) * 100) / 100, 5, 95);
            mutations.push(`entryThreshold`);
        }
    }

    // Possibly swap timeframe
    if (Math.random() < mutationRate * 0.5) {
        mutated.preferredTimeframe = randomPick(ALL_TIMEFRAMES);
        mutations.push('timeframe');
    }

    // Possibly add/remove indicator
    if (Math.random() < mutationRate * 0.3) {
        if (mutated.indicators.length < 5) {
            const newInd = generateIndicatorGene();
            mutated.indicators.push(newInd);
            mutations.push(`+indicator:${newInd.type}`);
        } else if (mutated.indicators.length > 2) {
            const removed = mutated.indicators.pop();
            if (removed) mutations.push(`-indicator:${removed.type}`);
        }
    }

    // ─── Phase 9: Mutate advanced genes ───────────────────────
    mutateAdvancedGenes(mutated, mutationRate, mutations);
    mutated.metadata.structuralComplexity = calculateStructuralComplexity(mutated);

    mutated.metadata.mutationHistory = [...strategy.metadata.mutationHistory, `mutate:[${mutations.join(',')}]`];
    mutated.name = generateStrategyName();
    return mutated;
}

/**
 * Generate a human-readable strategy name using adjectives + nouns.
 */
function generateStrategyName(): string {
    const adjectives = [
        'Swift', 'Silent', 'Brave', 'Iron', 'Crystal', 'Shadow', 'Phoenix', 'Quantum',
        'Nova', 'Apex', 'Stealth', 'Rapid', 'Cosmic', 'Vortex', 'Thunder', 'Titan',
        'Nebula', 'Cipher', 'Zenith', 'Omega', 'Prism', 'Flux', 'Pulse', 'Echo',
    ];
    const nouns = [
        'Wolf', 'Eagle', 'Tiger', 'Dragon', 'Falcon', 'Shark', 'Panther', 'Raven',
        'Viper', 'Lynx', 'Hawk', 'Bull', 'Bear', 'Fox', 'Cobra', 'Puma',
        'Storm', 'Wave', 'Blade', 'Shield', 'Arrow', 'Spark', 'Flame', 'Frost',
    ];
    return `${randomPick(adjectives)} ${randomPick(nouns)}`;
}

/**
 * Serialize a StrategyDNA to a compact JSON string for persistence.
 */
export function serializeStrategy(strategy: StrategyDNA): string {
    return JSON.stringify(strategy);
}

/**
 * Deserialize a JSON string back to StrategyDNA.
 */
export function deserializeStrategy(json: string): StrategyDNA {
    const parsed = JSON.parse(json) as StrategyDNA;
    if (!parsed.id || !parsed.indicators || !parsed.riskGenes) {
        throw new Error('Invalid Strategy DNA structure');
    }
    return parsed;
}

// ─── Phase 9: Advanced Gene Helpers ──────────────────────────

/**
 * Calculate the structural complexity of a strategy genome.
 * Measures how many different gene families are active (0-1 scale).
 * Used for novelty bonus in the evaluator.
 */
export function calculateStructuralComplexity(strategy: StrategyDNA): number {
    let familyCount = 0;
    const maxFamilies = 5; // indicator, microstructure, priceAction, composite, dc

    if (strategy.indicators.length > 0) familyCount++;
    if (strategy.microstructureGenes && strategy.microstructureGenes.length > 0) familyCount++;
    if (strategy.priceActionGenes && strategy.priceActionGenes.length > 0) familyCount++;
    if (strategy.compositeGenes && strategy.compositeGenes.length > 0) familyCount++;
    if (strategy.dcGenes && strategy.dcGenes.length > 0) familyCount++;

    return Math.round((familyCount / maxFamilies) * 100) / 100;
}

/**
 * Crossover advanced gene arrays from two parents into a child.
 */
function crossoverAdvancedGenes(
    child: StrategyDNA,
    parentA: StrategyDNA,
    parentB: StrategyDNA,
): void {
    // Microstructure genes
    const microA = parentA.microstructureGenes ?? [];
    const microB = parentB.microstructureGenes ?? [];
    if (microA.length > 0 || microB.length > 0) {
        const allMicro = [...microA, ...microB];
        if (microA.length > 0 && microB.length > 0) {
            child.microstructureGenes = [crossoverMicrostructureGene(randomPick(microA), randomPick(microB))];
        } else {
            child.microstructureGenes = [{ ...randomPick(allMicro) }];
        }
    }

    // Price action genes
    const paA = parentA.priceActionGenes ?? [];
    const paB = parentB.priceActionGenes ?? [];
    if (paA.length > 0 || paB.length > 0) {
        const allPA = [...paA, ...paB];
        if (paA.length > 0 && paB.length > 0) {
            child.priceActionGenes = [crossoverPriceActionGene(randomPick(paA), randomPick(paB))];
        } else {
            child.priceActionGenes = [{ ...randomPick(allPA) }];
        }
    }

    // Composite genes
    const compA = parentA.compositeGenes ?? [];
    const compB = parentB.compositeGenes ?? [];
    if (compA.length > 0 || compB.length > 0) {
        if (compA.length > 0 && compB.length > 0) {
            child.compositeGenes = [crossoverCompositeGene(randomPick(compA), randomPick(compB))];
        } else {
            const allComp = [...compA, ...compB];
            child.compositeGenes = [JSON.parse(JSON.stringify(randomPick(allComp)))];
        }
    }

    // DC genes
    const dcA = parentA.dcGenes ?? [];
    const dcB = parentB.dcGenes ?? [];
    if (dcA.length > 0 || dcB.length > 0) {
        if (dcA.length > 0 && dcB.length > 0) {
            child.dcGenes = [crossoverDCGene(randomPick(dcA), randomPick(dcB))];
        } else {
            const allDC = [...dcA, ...dcB];
            child.dcGenes = [JSON.parse(JSON.stringify(randomPick(allDC)))];
        }
    }
}

/**
 * Mutate advanced gene arrays on a strategy.
 * Can add, remove, or modify advanced genes.
 */
function mutateAdvancedGenes(
    strategy: StrategyDNA,
    rate: number,
    mutations: string[],
): void {
    // Mutate existing microstructure genes
    if (strategy.microstructureGenes) {
        strategy.microstructureGenes = strategy.microstructureGenes.map(g => {
            if (Math.random() < rate) {
                mutations.push('mutate:microstructure');
                return mutateMicrostructureGene(g, rate);
            }
            return g;
        });
    }
    // Chance to add new microstructure gene
    if (Math.random() < rate * 0.15) {
        if (!strategy.microstructureGenes) strategy.microstructureGenes = [];
        if (strategy.microstructureGenes.length < 2) {
            strategy.microstructureGenes.push(generateRandomMicrostructureGene());
            mutations.push('+microstructure');
        }
    }

    // Mutate existing price action genes
    if (strategy.priceActionGenes) {
        strategy.priceActionGenes = strategy.priceActionGenes.map(g => {
            if (Math.random() < rate) {
                mutations.push('mutate:priceAction');
                return mutatePriceActionGene(g, rate);
            }
            return g;
        });
    }
    if (Math.random() < rate * 0.15) {
        if (!strategy.priceActionGenes) strategy.priceActionGenes = [];
        if (strategy.priceActionGenes.length < 2) {
            strategy.priceActionGenes.push(generateRandomPriceActionGene());
            mutations.push('+priceAction');
        }
    }

    // Mutate existing composite genes
    if (strategy.compositeGenes) {
        strategy.compositeGenes = strategy.compositeGenes.map(g => {
            if (Math.random() < rate) {
                mutations.push('mutate:composite');
                return mutateCompositeGene(g, rate);
            }
            return g;
        });
    }
    if (Math.random() < rate * 0.12) {
        if (!strategy.compositeGenes) strategy.compositeGenes = [];
        if (strategy.compositeGenes.length < 2) {
            strategy.compositeGenes.push(generateRandomCompositeGene());
            mutations.push('+composite');
        }
    }

    // Mutate existing DC genes
    if (strategy.dcGenes) {
        strategy.dcGenes = strategy.dcGenes.map(g => {
            if (Math.random() < rate) {
                mutations.push('mutate:dc');
                return mutateDCGene(g, rate);
            }
            return g;
        });
    }
    if (Math.random() < rate * 0.10) {
        if (!strategy.dcGenes) strategy.dcGenes = [];
        if (strategy.dcGenes.length < 2) {
            strategy.dcGenes.push(generateRandomDCGene());
            mutations.push('+dc');
        }
    }

    // Remove empty arrays
    if (strategy.microstructureGenes?.length === 0) delete strategy.microstructureGenes;
    if (strategy.priceActionGenes?.length === 0) delete strategy.priceActionGenes;
    if (strategy.compositeGenes?.length === 0) delete strategy.compositeGenes;
    if (strategy.dcGenes?.length === 0) delete strategy.dcGenes;
}
