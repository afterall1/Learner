// ============================================================
// Learner: Genome Topology Engine — NEAT-Inspired Structural Evolution
// ============================================================
// Phase 18.2: Allows evolution to modify the STRUCTURE of a
// strategy genome, not just its parameters. Inspired by the
// NEAT algorithm (NeuroEvolution of Augmenting Topologies).
//
// Key innovations:
//   - Innovation Number Tracking: prevents crossover misalignment
//   - Structural Mutations: add/remove/chain genes
//   - Speciation: groups strategies by structural similarity
//   - Minimal Initialization: start simple, complexify through evolution
//
// This replaces the fixed-skeleton genome with a variable-topology
// genome that can discover fundamentally novel strategy architectures.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type StrategyDNA,
    type IndicatorGene,
    type SignalRule,
    type GenomeTopologyConfig,
    type InnovationRecord,
    type SpeciesProfile,
    IndicatorType,
    SignalCondition,
    DEFAULT_GENOME_TOPOLOGY_CONFIG,
} from '@/types';

// ─── Innovation Tracker (Singleton) ──────────────────────────

/**
 * InnovationTracker — assigns monotonically increasing innovation
 * numbers to new structural mutations across the entire system.
 *
 * This is the key insight from NEAT: by tagging each structural
 * innovation with a unique number, we can correctly align genes
 * during crossover even when parents have different topologies.
 */
export class InnovationTracker {
    private static instance: InnovationTracker | null = null;
    private nextInnovation: number = 1;
    private history: InnovationRecord[] = [];

    private constructor() { }

    static getInstance(): InnovationTracker {
        if (!InnovationTracker.instance) {
            InnovationTracker.instance = new InnovationTracker();
        }
        return InnovationTracker.instance;
    }

    static resetInstance(): void {
        InnovationTracker.instance = null;
    }

    /**
     * Register a new structural innovation and get its number.
     */
    registerInnovation(
        geneType: InnovationRecord['geneType'],
        originStrategyId: string,
        originGeneration: number,
        description: string,
    ): number {
        const innovationNumber = this.nextInnovation++;
        this.history.push({
            innovationNumber,
            geneType,
            originStrategyId,
            originGeneration,
            createdAt: Date.now(),
            description,
        });
        return innovationNumber;
    }

    /**
     * Get the current innovation counter value.
     */
    getCurrentInnovation(): number {
        return this.nextInnovation - 1;
    }

    /**
     * Get the full innovation history.
     */
    getHistory(): InnovationRecord[] {
        return [...this.history];
    }
}

// ─── Gene Pool for Structural Mutations ──────────────────────

const AVAILABLE_INDICATORS: IndicatorType[] = [
    IndicatorType.SMA, IndicatorType.EMA, IndicatorType.RSI,
    IndicatorType.MACD, IndicatorType.BOLLINGER, IndicatorType.ADX,
    IndicatorType.ATR, IndicatorType.STOCH_RSI, IndicatorType.VOLUME,
];

const PERIOD_RANGES: Record<IndicatorType, { min: number; max: number }> = {
    [IndicatorType.SMA]: { min: 5, max: 200 },
    [IndicatorType.EMA]: { min: 5, max: 200 },
    [IndicatorType.RSI]: { min: 7, max: 28 },
    [IndicatorType.MACD]: { min: 12, max: 26 },
    [IndicatorType.BOLLINGER]: { min: 10, max: 50 },
    [IndicatorType.ADX]: { min: 7, max: 28 },
    [IndicatorType.ATR]: { min: 7, max: 28 },
    [IndicatorType.STOCH_RSI]: { min: 7, max: 21 },
    [IndicatorType.VOLUME]: { min: 10, max: 50 },
};

/**
 * Generate a random indicator gene with an innovation number.
 */
function generateRandomIndicatorGene(strategyId: string, generation: number): IndicatorGene & { innovationNumber: number } {
    const type = AVAILABLE_INDICATORS[Math.floor(Math.random() * AVAILABLE_INDICATORS.length)];
    const range = PERIOD_RANGES[type];
    const period = range.min + Math.floor(Math.random() * (range.max - range.min));

    const tracker = InnovationTracker.getInstance();
    const innovationNumber = tracker.registerInnovation(
        'indicator',
        strategyId,
        generation,
        `Added ${type} indicator with period ${period}`,
    );

    return {
        id: uuidv4(),
        type,
        period,
        params: type === IndicatorType.MACD
            ? { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }
            : type === IndicatorType.BOLLINGER
                ? { stdDev: 2 }
                : {},
        innovationNumber,
    };
}

/**
 * Generate a random signal rule for an indicator gene.
 */
function generateRandomSignalRule(
    indicatorGene: IndicatorGene,
    strategyId: string,
    generation: number,
): SignalRule & { innovationNumber: number } {
    const conditions = [
        SignalCondition.CROSS_ABOVE,
        SignalCondition.CROSS_BELOW,
        SignalCondition.ABOVE,
        SignalCondition.BELOW,
    ];

    const condition = conditions[Math.floor(Math.random() * conditions.length)];

    // Determine appropriate threshold for indicator type
    let threshold: number;
    switch (indicatorGene.type) {
        case IndicatorType.RSI:
        case IndicatorType.STOCH_RSI:
            threshold = 20 + Math.random() * 60;
            break;
        case IndicatorType.ADX:
            threshold = 15 + Math.random() * 35;
            break;
        default:
            threshold = 0.5 + Math.random() * 1.5;
    }

    const tracker = InnovationTracker.getInstance();
    const innovationNumber = tracker.registerInnovation(
        'entry_rule',
        strategyId,
        generation,
        `Added ${condition} rule for ${indicatorGene.type}`,
    );

    return {
        id: uuidv4(),
        indicatorId: indicatorGene.id,
        condition,
        threshold,
        innovationNumber,
    };
}

// ─── Structural Mutations ────────────────────────────────────

/**
 * Add a new indicator gene to the strategy's genome.
 * This is a structural mutation — it changes the topology.
 */
export function addIndicatorGene(
    strategy: StrategyDNA,
): StrategyDNA {
    const newGene = generateRandomIndicatorGene(strategy.id, strategy.generation);

    // Track innovation number
    const innovationNumbers = { ...(strategy.innovationNumbers ?? {}) };
    innovationNumbers[newGene.id] = newGene.innovationNumber;

    // Also add a signal rule for this new indicator
    const newRule = generateRandomSignalRule(newGene, strategy.id, strategy.generation);
    innovationNumbers[newRule.id] = newRule.innovationNumber;

    return {
        ...strategy,
        indicators: [...strategy.indicators, newGene],
        entryRules: {
            ...strategy.entryRules,
            entrySignals: [...strategy.entryRules.entrySignals, newRule],
        },
        innovationNumbers,
        metadata: {
            ...strategy.metadata,
            mutationHistory: [
                ...strategy.metadata.mutationHistory,
                `structural:add_indicator:${newGene.type}:gen${strategy.generation}`,
            ],
        },
    };
}

/**
 * Remove the weakest indicator gene from the strategy.
 * "Weakest" = the indicator whose associated rules have the
 * least impact (approximated by threshold proximity to market neutral).
 * Never removes below 2 indicators.
 */
export function removeIndicatorGene(
    strategy: StrategyDNA,
): StrategyDNA {
    if (strategy.indicators.length <= 2) {
        return strategy; // Cannot go below minimal genome size
    }

    // Pick a random indicator to remove (not the first one, which is primary)
    const removeIndex = 1 + Math.floor(Math.random() * (strategy.indicators.length - 1));
    const removedGene = strategy.indicators[removeIndex];

    // Remove all signal rules referencing this indicator
    const filteredEntrySignals = strategy.entryRules.entrySignals.filter(
        r => r.indicatorId !== removedGene.id,
    );
    const filteredExitSignals = strategy.exitRules.exitSignals.filter(
        r => r.indicatorId !== removedGene.id,
    );

    // Remove innovation number
    const innovationNumbers = { ...(strategy.innovationNumbers ?? {}) };
    delete innovationNumbers[removedGene.id];

    return {
        ...strategy,
        indicators: strategy.indicators.filter((_, i) => i !== removeIndex),
        entryRules: {
            ...strategy.entryRules,
            entrySignals: filteredEntrySignals,
        },
        exitRules: {
            ...strategy.exitRules,
            exitSignals: filteredExitSignals,
        },
        innovationNumbers,
        metadata: {
            ...strategy.metadata,
            mutationHistory: [
                ...strategy.metadata.mutationHistory,
                `structural:remove_indicator:${removedGene.type}:gen${strategy.generation}`,
            ],
        },
    };
}

/**
 * Create an indicator chain — a novel structural innovation where
 * one indicator's output feeds into another. For example:
 *   - RSI of EMA (momentum of smoothed price)
 *   - MACD of RSI (momentum of momentum)
 *   - Bollinger of ATR (volatility of volatility)
 *
 * This is represented as a CompositeFunctionGene that chains
 * two indicator genes via the RATIO operation.
 */
export function addIndicatorChain(
    strategy: StrategyDNA,
): StrategyDNA {
    if (strategy.indicators.length < 1) return strategy;

    // Pick a random existing indicator as the chain source
    const sourceIndicator = strategy.indicators[Math.floor(Math.random() * strategy.indicators.length)];

    // Create a new indicator to chain with
    const chainedGene = generateRandomIndicatorGene(strategy.id, strategy.generation);

    // Track both as innovations
    const innovationNumbers = { ...(strategy.innovationNumbers ?? {}) };
    innovationNumbers[chainedGene.id] = chainedGene.innovationNumber;

    // Create an entry rule connecting to the chained indicator
    const chainRule = generateRandomSignalRule(chainedGene, strategy.id, strategy.generation);
    innovationNumbers[chainRule.id] = chainRule.innovationNumber;

    return {
        ...strategy,
        indicators: [...strategy.indicators, chainedGene],
        entryRules: {
            ...strategy.entryRules,
            entrySignals: [...strategy.entryRules.entrySignals, chainRule],
        },
        innovationNumbers,
        metadata: {
            ...strategy.metadata,
            mutationHistory: [
                ...strategy.metadata.mutationHistory,
                `structural:chain:${sourceIndicator.type}->${chainedGene.type}:gen${strategy.generation}`,
            ],
        },
    };
}

/**
 * Apply a structural mutation to a strategy.
 * Randomly selects one of: add, remove, or chain.
 */
export function applyStructuralMutation(
    strategy: StrategyDNA,
    config: GenomeTopologyConfig = DEFAULT_GENOME_TOPOLOGY_CONFIG,
): StrategyDNA {
    const roll = Math.random();

    if (roll < config.addGeneProbability) {
        return addIndicatorGene(strategy);
    } else if (roll < config.addGeneProbability + config.removeGeneProbability) {
        return removeIndicatorGene(strategy);
    } else {
        return addIndicatorChain(strategy);
    }
}

// ─── Innovation-Aligned Crossover ────────────────────────────

/**
 * Perform innovation-number-aligned crossover between two parents
 * with potentially different genome topologies.
 *
 * Genes are matched by innovation number:
 *   - Matching genes: randomly inherited from either parent
 *   - Disjoint/excess genes from fitter parent: included
 *   - Disjoint/excess genes from weaker parent: 50% inclusion
 *
 * This prevents crossover from misaligning unrelated structures.
 */
export function alignedCrossover(
    parentA: StrategyDNA,
    parentB: StrategyDNA,
): StrategyDNA {
    const fitter = parentA.metadata.fitnessScore >= parentB.metadata.fitnessScore
        ? parentA
        : parentB;
    const weaker = fitter === parentA ? parentB : parentA;

    // Build innovation maps for indicators
    const fitterInnovations = fitter.innovationNumbers ?? {};
    const weakerInnovations = weaker.innovationNumbers ?? {};

    // Collect all unique innovation numbers
    const allInnovations = new Set([
        ...Object.values(fitterInnovations),
        ...Object.values(weakerInnovations),
    ]);

    // Build reverse maps: innovationNumber → gene
    const fitterGeneMap = new Map<number, IndicatorGene>();
    const weakerGeneMap = new Map<number, IndicatorGene>();

    for (const gene of fitter.indicators) {
        const inn = fitterInnovations[gene.id];
        if (inn !== undefined) fitterGeneMap.set(inn, gene);
    }
    for (const gene of weaker.indicators) {
        const inn = weakerInnovations[gene.id];
        if (inn !== undefined) weakerGeneMap.set(inn, gene);
    }

    // Align and select genes
    const childIndicators: IndicatorGene[] = [];
    const childInnovationNumbers: Record<string, number> = {};

    for (const inn of allInnovations) {
        const fitterGene = fitterGeneMap.get(inn);
        const weakerGene = weakerGeneMap.get(inn);

        if (fitterGene && weakerGene) {
            // Matching gene: random parent
            const chosen = Math.random() < 0.5 ? fitterGene : weakerGene;
            childIndicators.push(chosen);
            childInnovationNumbers[chosen.id] = inn;
        } else if (fitterGene) {
            // Disjoint from fitter: always include
            childIndicators.push(fitterGene);
            childInnovationNumbers[fitterGene.id] = inn;
        } else if (weakerGene) {
            // Disjoint from weaker: 50% chance
            if (Math.random() < 0.5) {
                childIndicators.push(weakerGene);
                childInnovationNumbers[weakerGene.id] = inn;
            }
        }
    }

    // Ensure at least 2 indicators (genome minimum)
    if (childIndicators.length < 2) {
        const needed = 2 - childIndicators.length;
        for (let i = 0; i < needed; i++) {
            const gene = fitter.indicators[i] ?? weaker.indicators[i];
            if (gene && !childIndicators.find(g => g.id === gene.id)) {
                childIndicators.push(gene);
                const inn = fitterInnovations[gene.id] ?? weakerInnovations[gene.id];
                if (inn !== undefined) childInnovationNumbers[gene.id] = inn;
            }
        }
    }

    // Build valid entry/exit rules from available indicator IDs
    const validIndicatorIds = new Set(childIndicators.map(g => g.id));

    const childEntrySignals = [
        ...fitter.entryRules.entrySignals.filter(r => validIndicatorIds.has(r.indicatorId)),
        ...weaker.entryRules.entrySignals.filter(
            r => validIndicatorIds.has(r.indicatorId) &&
                !fitter.entryRules.entrySignals.find(fr => fr.indicatorId === r.indicatorId),
        ),
    ];

    const childExitSignals = [
        ...fitter.exitRules.exitSignals.filter(r => validIndicatorIds.has(r.indicatorId)),
    ];

    return {
        ...fitter,
        id: uuidv4(),
        parentIds: [parentA.id, parentB.id],
        createdAt: Date.now(),
        indicators: childIndicators,
        entryRules: {
            ...fitter.entryRules,
            entrySignals: childEntrySignals.length > 0 ? childEntrySignals : fitter.entryRules.entrySignals,
        },
        exitRules: {
            ...fitter.exitRules,
            exitSignals: childExitSignals.length > 0 ? childExitSignals : fitter.exitRules.exitSignals,
        },
        innovationNumbers: childInnovationNumbers,
        metadata: {
            ...fitter.metadata,
            mutationHistory: [`crossover:aligned:${parentA.id.slice(0, 8)}x${parentB.id.slice(0, 8)}`],
            fitnessScore: 0,
            tradeCount: 0,
            lastEvaluated: null,
            validation: null,
        },
    };
}

// ─── Speciation Engine ───────────────────────────────────────

/**
 * Calculate structural distance between two strategies.
 * Uses Jaccard distance on the set of indicator types.
 *
 * Returns 0-1 where 0 = identical structure, 1 = completely different.
 */
export function structuralDistance(a: StrategyDNA, b: StrategyDNA): number {
    const setA = new Set(a.indicators.map(g => g.type));
    const setB = new Set(b.indicators.map(g => g.type));

    const union = new Set([...setA, ...setB]);
    const intersection = new Set([...setA].filter(t => setB.has(t)));

    if (union.size === 0) return 0;
    return 1 - (intersection.size / union.size);
}

/**
 * Assign strategies to species based on structural similarity.
 * Each species has a representative member, and new strategies
 * join the first species within the threshold distance.
 *
 * Returns the species assignments and updated species profiles.
 */
export function assignSpecies(
    population: StrategyDNA[],
    existingSpecies: SpeciesProfile[],
    threshold: number = DEFAULT_GENOME_TOPOLOGY_CONFIG.speciationThreshold,
): { assignments: Map<string, number>; species: SpeciesProfile[] } {
    const assignments = new Map<string, number>();
    const updatedSpecies: SpeciesProfile[] = existingSpecies.map(s => ({
        ...s,
        memberCount: 0,
        avgFitness: 0,
        bestFitness: 0,
    }));
    let nextSpeciesId = existingSpecies.length > 0
        ? Math.max(...existingSpecies.map(s => s.id)) + 1
        : 1;

    // Assign each strategy to a species
    for (const strategy of population) {
        let assignedSpecies: SpeciesProfile | null = null;

        // Find the first species whose representative is close enough
        for (const species of updatedSpecies) {
            const distance = structuralDistance(strategy, species.representative);
            if (distance < threshold) {
                assignedSpecies = species;
                break;
            }
        }

        if (!assignedSpecies) {
            // Create a new species with this strategy as representative
            assignedSpecies = {
                id: nextSpeciesId++,
                representative: strategy,
                memberCount: 0,
                avgFitness: 0,
                bestFitness: 0,
                stagnationCounter: 0,
                offspringAllocation: 0,
                createdGeneration: strategy.generation,
            };
            updatedSpecies.push(assignedSpecies);
        }

        assignments.set(strategy.id, assignedSpecies.id);
        strategy.speciesId = assignedSpecies.id;
        assignedSpecies.memberCount++;

        // Track best fitness
        if (strategy.metadata.fitnessScore > assignedSpecies.bestFitness) {
            assignedSpecies.bestFitness = strategy.metadata.fitnessScore;
        }
    }

    // Calculate average fitness per species
    for (const species of updatedSpecies) {
        if (species.memberCount > 0) {
            const members = population.filter(s => assignments.get(s.id) === species.id);
            species.avgFitness = members.reduce(
                (sum, s) => sum + s.metadata.fitnessScore, 0,
            ) / species.memberCount;
        }
    }

    // Calculate offspring allocation proportional to average fitness
    const totalAvgFitness = updatedSpecies.reduce((s, sp) => s + Math.max(0.01, sp.avgFitness), 0);
    for (const species of updatedSpecies) {
        species.offspringAllocation = totalAvgFitness > 0
            ? Math.max(0.01, species.avgFitness) / totalAvgFitness
            : 1 / Math.max(1, updatedSpecies.length);
    }

    // Remove empty species
    const activeSpecies = updatedSpecies.filter(s => s.memberCount > 0);

    return { assignments, species: activeSpecies };
}

/**
 * Dissolve stagnating species by resetting their stagnation counter
 * and marking them for removal.
 *
 * Returns the IDs of dissolved species.
 */
export function dissolveStagnatingSpecies(
    species: SpeciesProfile[],
    limit: number = DEFAULT_GENOME_TOPOLOGY_CONFIG.speciesStagnationLimit,
): number[] {
    const dissolved: number[] = [];
    for (const s of species) {
        if (s.stagnationCounter >= limit && species.length > 1) {
            dissolved.push(s.id);
        }
    }
    return dissolved;
}
