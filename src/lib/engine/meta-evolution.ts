// ============================================================
// Learner: Meta-Evolution Engine — GA² (GA that evolves GA)
// ============================================================
// Council Decision: The most radical innovation — a second-layer
// genetic algorithm that optimizes the evolution parameters
// themselves. Each Island carries its own HyperDNA, allowing
// pair:timeframe-specific learning dynamics to emerge naturally.
//
// The system learns HOW to learn, not just WHAT to learn.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type {
    HyperDNA,
    MetaFitnessRecord,
    MetaEvolutionConfig,
} from '@/types';
import { DEFAULT_META_EVOLUTION_CONFIG } from '@/types';

// ─── HyperDNA Gene Ranges ────────────────────────────────────

interface GeneRange {
    min: number;
    max: number;
    step: number;
    isInteger: boolean;
}

const EVOLUTION_GENE_RANGES: Record<keyof HyperDNA['evolutionGenes'], GeneRange> = {
    populationSize: { min: 6, max: 30, step: 2, isInteger: true },
    elitismRate: { min: 0.1, max: 0.4, step: 0.05, isInteger: false },
    mutationRate: { min: 0.05, max: 0.6, step: 0.05, isInteger: false },
    crossoverRate: { min: 0.3, max: 0.9, step: 0.05, isInteger: false },
    tournamentSize: { min: 2, max: 7, step: 1, isInteger: true },
    wildCardRate: { min: 0.05, max: 0.3, step: 0.05, isInteger: false },
    stagnationThreshold: { min: 2, max: 8, step: 1, isInteger: true },
    diversityMinimum: { min: 0.1, max: 0.6, step: 0.05, isInteger: false },
};

const FITNESS_WEIGHT_RANGES: Record<keyof HyperDNA['fitnessWeights'], GeneRange> = {
    sharpeWeight: { min: 0.05, max: 0.5, step: 0.05, isInteger: false },
    sortinoWeight: { min: 0.05, max: 0.4, step: 0.05, isInteger: false },
    profitFactorWeight: { min: 0.05, max: 0.4, step: 0.05, isInteger: false },
    drawdownWeight: { min: 0.05, max: 0.5, step: 0.05, isInteger: false },
    expectancyWeight: { min: 0.05, max: 0.3, step: 0.05, isInteger: false },
};

// ─── Meta-Evolution Engine ───────────────────────────────────

/**
 * MetaEvolutionEngine — manages the creation, mutation, crossover,
 * and evaluation of HyperDNA genomes across Islands.
 *
 * This is intentionally SIMPLER than the strategy-level GA because:
 * 1. Meta-overfitting is a real risk — less complexity = more stability
 * 2. HyperDNA evaluations take many generations worth of data
 * 3. The search space is smaller (15 continuous parameters)
 */
export class MetaEvolutionEngine {
    private config: MetaEvolutionConfig;
    private hyperDnaHistory: HyperDNA[] = [];
    private metaFitnessRecords: MetaFitnessRecord[] = [];
    private metaGeneration: number = 0;

    constructor(config: Partial<MetaEvolutionConfig> = {}) {
        this.config = { ...DEFAULT_META_EVOLUTION_CONFIG, ...config };
    }

    // ─── HyperDNA Creation ───────────────────────────────────

    /**
     * Generate a random HyperDNA genome.
     * Used for the initial Island configuration (genesis).
     */
    generateRandomHyperDNA(): HyperDNA {
        const evolutionGenes = this.generateRandomEvolutionGenes();
        const fitnessWeights = this.generateRandomFitnessWeights();

        const hyperDna: HyperDNA = {
            id: uuidv4(),
            generation: this.metaGeneration,
            parentIds: [],
            createdAt: Date.now(),
            evolutionGenes,
            fitnessWeights,
            metadata: {
                fitnessImprovementRate: 0,
                validationPassRate: 0,
                metaFitness: 0,
                generationsActive: 0,
                lastEvaluated: null,
            },
        };

        this.hyperDnaHistory.push(hyperDna);
        return hyperDna;
    }

    /**
     * Generate the default HyperDNA — starts from human-designed defaults.
     * This is the baseline that meta-evolution improves upon.
     */
    generateDefaultHyperDNA(): HyperDNA {
        return {
            id: uuidv4(),
            generation: 0,
            parentIds: [],
            createdAt: Date.now(),
            evolutionGenes: {
                populationSize: 10,
                elitismRate: 0.2,
                mutationRate: 0.3,
                crossoverRate: 0.6,
                tournamentSize: 3,
                wildCardRate: 0.1,
                stagnationThreshold: 3,
                diversityMinimum: 0.3,
            },
            fitnessWeights: {
                sharpeWeight: 0.25,
                sortinoWeight: 0.20,
                profitFactorWeight: 0.20,
                drawdownWeight: 0.25,
                expectancyWeight: 0.10,
            },
            metadata: {
                fitnessImprovementRate: 0,
                validationPassRate: 0,
                metaFitness: 0,
                generationsActive: 0,
                lastEvaluated: null,
            },
        };
    }

    // ─── Meta-Crossover ──────────────────────────────────────

    /**
     * Crossover two HyperDNA genomes to produce a child.
     * Uses uniform crossover at the gene-group level:
     * - Evolution genes: take each parameter from either parent randomly
     * - Fitness weights: take from one parent entirely (to preserve sum=1.0 constraint)
     */
    crossover(parentA: HyperDNA, parentB: HyperDNA): HyperDNA {
        try {
            // Uniform crossover for evolution genes
            const childEvolutionGenes = {} as HyperDNA['evolutionGenes'];
            const evoKeys = Object.keys(EVOLUTION_GENE_RANGES) as (keyof HyperDNA['evolutionGenes'])[];

            for (const key of evoKeys) {
                childEvolutionGenes[key] = Math.random() < 0.5
                    ? parentA.evolutionGenes[key]
                    : parentB.evolutionGenes[key];
            }

            // Fitness weights: take from one parent entirely to preserve sum=1 constraint
            const fitnessWeights = Math.random() < 0.5
                ? { ...parentA.fitnessWeights }
                : { ...parentB.fitnessWeights };

            const child: HyperDNA = {
                id: uuidv4(),
                generation: this.metaGeneration + 1,
                parentIds: [parentA.id, parentB.id],
                createdAt: Date.now(),
                evolutionGenes: childEvolutionGenes,
                fitnessWeights,
                metadata: {
                    fitnessImprovementRate: 0,
                    validationPassRate: 0,
                    metaFitness: 0,
                    generationsActive: 0,
                    lastEvaluated: null,
                },
            };

            this.hyperDnaHistory.push(child);
            return child;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[MetaEvolution] Crossover failed: ${message}`);
            // Fallback: return a copy of the better parent
            return this.cloneHyperDNA(
                parentA.metadata.metaFitness >= parentB.metadata.metaFitness ? parentA : parentB
            );
        }
    }

    // ─── Meta-Mutation ───────────────────────────────────────

    /**
     * Mutate a HyperDNA genome with conservative perturbations.
     * Unlike strategy mutation, meta-mutation is deliberately gentle
     * to prevent destabilizing the learning process.
     */
    mutate(hyperDna: HyperDNA): HyperDNA {
        try {
            const mutated = this.cloneHyperDNA(hyperDna);
            const mutationRate = this.config.metaMutationRate;

            // Mutate evolution genes
            const evoKeys = Object.keys(EVOLUTION_GENE_RANGES) as (keyof HyperDNA['evolutionGenes'])[];
            for (const key of evoKeys) {
                if (Math.random() < mutationRate) {
                    const range = EVOLUTION_GENE_RANGES[key];
                    const currentValue = mutated.evolutionGenes[key];
                    const perturbation = (Math.random() - 0.5) * 2 * range.step * 3; // ±3 steps
                    let newValue = currentValue + perturbation;

                    // Clamp to range
                    newValue = Math.max(range.min, Math.min(range.max, newValue));

                    // Snap to step
                    if (range.isInteger) {
                        newValue = Math.round(newValue);
                    } else {
                        newValue = Math.round(newValue / range.step) * range.step;
                    }

                    mutated.evolutionGenes[key] = newValue;
                }
            }

            // Mutate fitness weights (then renormalize to sum=1)
            const weightKeys = Object.keys(FITNESS_WEIGHT_RANGES) as (keyof HyperDNA['fitnessWeights'])[];
            let weightsMutated = false;

            for (const key of weightKeys) {
                if (Math.random() < mutationRate) {
                    const range = FITNESS_WEIGHT_RANGES[key];
                    const currentValue = mutated.fitnessWeights[key];
                    const perturbation = (Math.random() - 0.5) * 2 * 0.05; // ±0.05
                    let newValue = currentValue + perturbation;
                    newValue = Math.max(range.min, Math.min(range.max, newValue));
                    mutated.fitnessWeights[key] = newValue;
                    weightsMutated = true;
                }
            }

            // Renormalize fitness weights to sum to 1.0
            if (weightsMutated) {
                this.normalizeFitnessWeights(mutated.fitnessWeights);
            }

            // Reset metadata for the mutated version
            mutated.id = uuidv4();
            mutated.parentIds = [hyperDna.id];
            mutated.createdAt = Date.now();
            mutated.metadata = {
                fitnessImprovementRate: 0,
                validationPassRate: 0,
                metaFitness: 0,
                generationsActive: 0,
                lastEvaluated: null,
            };

            this.hyperDnaHistory.push(mutated);
            return mutated;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[MetaEvolution] Mutation failed: ${message}`);
            return this.cloneHyperDNA(hyperDna);
        }
    }

    // ─── Meta-Fitness Evaluation ─────────────────────────────

    /**
     * Evaluate a HyperDNA's effectiveness based on the Island's performance.
     *
     * Meta-fitness measures HOW WELL the evolution parameters produce
     * good strategies, NOT strategy quality itself.
     *
     * Components:
     * - Fitness Improvement Rate (35%): How quickly strategies improve per generation
     * - Validation Pass Rate (30%): % of top strategies that pass 4-Gate validation
     * - Convergence Speed (20%): How fast the Island reaches 60+ fitness
     * - Diversity Maintenance (15%): Ability to maintain population diversity
     */
    evaluateMetaFitness(
        hyperDna: HyperDNA,
        slotId: string,
        generationFitnessHistory: number[],   // Best fitness per generation
        validationAttempts: number,
        validationPasses: number,
        avgDiversityIndex: number,
    ): MetaFitnessRecord {
        try {
            const generationsObserved = generationFitnessHistory.length;

            // 1. Fitness Improvement Rate (35%)
            const improvementRate = this.calculateImprovementRate(generationFitnessHistory);
            const improvementScore = this.normalize(improvementRate, -2, 10) * 100;

            // 2. Validation Pass Rate (30%)
            const valPassRate = validationAttempts > 0
                ? validationPasses / validationAttempts
                : 0;
            const validationScore = valPassRate * 100;

            // 3. Convergence Speed (20%)
            const convergenceGen = this.findConvergenceGeneration(generationFitnessHistory, 60);
            const maxGens = generationFitnessHistory.length;
            const convergenceScore = convergenceGen >= 0
                ? (1 - convergenceGen / Math.max(maxGens, 1)) * 100
                : 0; // Never reached 60 = 0 score

            // 4. Diversity Maintenance (15%)
            const diversityScore = avgDiversityIndex * 100;

            // Composite meta-fitness
            const metaFitness = Math.min(100, Math.max(0,
                improvementScore * 0.35 +
                validationScore * 0.30 +
                convergenceScore * 0.20 +
                diversityScore * 0.15
            ));

            const record: MetaFitnessRecord = {
                hyperDnaId: hyperDna.id,
                slotId,
                evaluatedAt: Date.now(),
                generationsObserved,
                avgFitnessImprovement: improvementRate,
                bestFitnessProduced: Math.max(0, ...generationFitnessHistory),
                validationPassRate: valPassRate,
                diversityMaintained: avgDiversityIndex,
                convergenceSpeed: convergenceGen >= 0 ? convergenceGen : generationsObserved,
                metaFitness,
            };

            // Update HyperDNA metadata
            hyperDna.metadata.fitnessImprovementRate = improvementRate;
            hyperDna.metadata.validationPassRate = valPassRate;
            hyperDna.metadata.metaFitness = metaFitness;
            hyperDna.metadata.generationsActive = generationsObserved;
            hyperDna.metadata.lastEvaluated = Date.now();

            this.metaFitnessRecords.push(record);
            return record;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[MetaEvolution] Meta-fitness evaluation failed: ${message}`);

            // Return a safe default record
            return {
                hyperDnaId: hyperDna.id,
                slotId,
                evaluatedAt: Date.now(),
                generationsObserved: 0,
                avgFitnessImprovement: 0,
                bestFitnessProduced: 0,
                validationPassRate: 0,
                diversityMaintained: 0,
                convergenceSpeed: 0,
                metaFitness: 0,
            };
        }
    }

    // ─── Stability Guard ─────────────────────────────────────

    /**
     * Check if a HyperDNA has been observed for enough generations
     * to produce a reliable meta-fitness evaluation.
     *
     * This prevents knee-jerk reactions to short-term noise.
     */
    isReadyForEvaluation(hyperDna: HyperDNA): boolean {
        return hyperDna.metadata.generationsActive >= this.config.minGenerationsBeforeEval;
    }

    /**
     * Check if enough strategy-generations have passed since the last
     * meta-crossover to warrant a new meta-evolution cycle.
     */
    shouldTriggerMetaCrossover(totalStrategyGenerations: number): boolean {
        return totalStrategyGenerations > 0 &&
            totalStrategyGenerations % this.config.metaCrossoverInterval === 0 &&
            this.metaGeneration < this.config.maxMetaGenerations;
    }

    /**
     * Advance to the next meta-generation.
     * Called after a meta-crossover event.
     */
    advanceMetaGeneration(): void {
        this.metaGeneration++;
    }

    // ─── Conversion: HyperDNA → EvolutionConfig ──────────────

    /**
     * Convert a HyperDNA into an EvolutionConfig that the EvolutionEngine
     * can use directly. This is the bridge between meta-evolution and
     * strategy-level evolution.
     */
    hyperDnaToEvolutionConfig(hyperDna: HyperDNA): {
        populationSize: number;
        elitismCount: number;
        mutationRate: number;
        crossoverRate: number;
        tournamentSize: number;
        minTradesForEvaluation: number;
        maxGenerations: number;
        adaptiveMutationEnabled: boolean;
        stagnationThreshold: number;
        diversityMinimum: number;
    } {
        const genes = hyperDna.evolutionGenes;
        return {
            populationSize: genes.populationSize,
            elitismCount: Math.max(1, Math.round(genes.populationSize * genes.elitismRate)),
            mutationRate: genes.mutationRate,
            crossoverRate: genes.crossoverRate,
            tournamentSize: genes.tournamentSize,
            minTradesForEvaluation: 30, // Hardcoded — safety critical, NOT evolvable
            maxGenerations: 1000,       // Safety cap — NOT evolvable
            adaptiveMutationEnabled: true, // Always on — NOT evolvable
            stagnationThreshold: genes.stagnationThreshold,
            diversityMinimum: genes.diversityMinimum,
        };
    }

    /**
     * Extract the fitness weight vector from a HyperDNA.
     * Returns the 5 weights in the order expected by the evaluator.
     */
    hyperDnaToFitnessWeights(hyperDna: HyperDNA): {
        sharpeWeight: number;
        sortinoWeight: number;
        profitFactorWeight: number;
        drawdownWeight: number;
        expectancyWeight: number;
    } {
        return { ...hyperDna.fitnessWeights };
    }

    // ─── Getters ─────────────────────────────────────────────

    getMetaGeneration(): number {
        return this.metaGeneration;
    }

    getHyperDnaHistory(): HyperDNA[] {
        return [...this.hyperDnaHistory];
    }

    getMetaFitnessRecords(): MetaFitnessRecord[] {
        return [...this.metaFitnessRecords];
    }

    getBestHyperDna(): HyperDNA | null {
        if (this.hyperDnaHistory.length === 0) return null;
        return this.hyperDnaHistory.reduce((best, current) =>
            current.metadata.metaFitness > best.metadata.metaFitness ? current : best
        );
    }

    // ─── Private Helpers ─────────────────────────────────────

    private generateRandomEvolutionGenes(): HyperDNA['evolutionGenes'] {
        const genes = {} as HyperDNA['evolutionGenes'];
        const keys = Object.keys(EVOLUTION_GENE_RANGES) as (keyof HyperDNA['evolutionGenes'])[];

        for (const key of keys) {
            const range = EVOLUTION_GENE_RANGES[key];
            const steps = Math.round((range.max - range.min) / range.step);
            const randomSteps = Math.floor(Math.random() * (steps + 1));
            let value = range.min + randomSteps * range.step;

            if (range.isInteger) {
                value = Math.round(value);
            }

            genes[key] = value;
        }

        return genes;
    }

    private generateRandomFitnessWeights(): HyperDNA['fitnessWeights'] {
        const weights: HyperDNA['fitnessWeights'] = {
            sharpeWeight: 0.1 + Math.random() * 0.3,
            sortinoWeight: 0.1 + Math.random() * 0.2,
            profitFactorWeight: 0.1 + Math.random() * 0.2,
            drawdownWeight: 0.1 + Math.random() * 0.3,
            expectancyWeight: 0.05 + Math.random() * 0.15,
        };

        this.normalizeFitnessWeights(weights);
        return weights;
    }

    private normalizeFitnessWeights(weights: HyperDNA['fitnessWeights']): void {
        const sum = weights.sharpeWeight +
            weights.sortinoWeight +
            weights.profitFactorWeight +
            weights.drawdownWeight +
            weights.expectancyWeight;

        if (sum <= 0) {
            // Fallback to equal weights
            weights.sharpeWeight = 0.2;
            weights.sortinoWeight = 0.2;
            weights.profitFactorWeight = 0.2;
            weights.drawdownWeight = 0.2;
            weights.expectancyWeight = 0.2;
            return;
        }

        weights.sharpeWeight /= sum;
        weights.sortinoWeight /= sum;
        weights.profitFactorWeight /= sum;
        weights.drawdownWeight /= sum;
        weights.expectancyWeight /= sum;
    }

    private cloneHyperDNA(source: HyperDNA): HyperDNA {
        return {
            id: uuidv4(),
            generation: source.generation,
            parentIds: [source.id],
            createdAt: Date.now(),
            evolutionGenes: { ...source.evolutionGenes },
            fitnessWeights: { ...source.fitnessWeights },
            metadata: {
                fitnessImprovementRate: 0,
                validationPassRate: 0,
                metaFitness: 0,
                generationsActive: 0,
                lastEvaluated: null,
            },
        };
    }

    private calculateImprovementRate(fitnessHistory: number[]): number {
        if (fitnessHistory.length < 2) return 0;

        // Linear regression slope of fitness over generations
        const n = fitnessHistory.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += fitnessHistory[i];
            sumXY += i * fitnessHistory[i];
            sumX2 += i * i;
        }

        const denominator = n * sumX2 - sumX * sumX;
        if (denominator === 0) return 0;

        return (n * sumXY - sumX * sumY) / denominator;
    }

    private findConvergenceGeneration(fitnessHistory: number[], threshold: number): number {
        for (let i = 0; i < fitnessHistory.length; i++) {
            if (fitnessHistory[i] >= threshold) {
                return i;
            }
        }
        return -1; // Never reached threshold
    }

    private normalize(value: number, min: number, max: number): number {
        if (max === min) return 0;
        return Math.max(0, Math.min(1, (value - min) / (max - min)));
    }
}
