// ============================================================
// Learner: Evolution Health Analyzer — Heartbeat Monitor Engine
// ============================================================
// Radical Innovation: Exposes HIDDEN evolutionary intelligence.
//
// The EvolutionEngine already detects convergence, stagnation,
// and diversity collapse — but all of this is invisible.
// This analyzer extracts that intelligence into an observable
// GenomeHealthSnapshot for the dashboard.
//
// Key metrics:
//   - diversityIndex       → population genetic diversity (0-1)
//   - stagnationLevel      → generations without fitness improvement
//   - convergenceRisk      → composite risk score (0-1)
//   - fitnessTrajectory    → slope of recent fitness curve
//   - geneDominance        → frequency distribution of indicator types
//   - mutationPressure     → current vs baseline mutation rate ratio
//   - healthGrade          → A/B/C/D/F letter grade for evolution health
// ============================================================

import type { Island } from './island';
import type { EvolutionEngine } from './evolution';
import type {
    StrategyDNA,
    IndicatorType,
    EvolutionGeneration,
} from '@/types';

// ─── Types ──────────────────────────────────────────────────

export interface GeneDominanceEntry {
    indicatorType: string;
    frequency: number;          // 0-1, percentage of strategies using this type
    avgFitness: number;         // Average fitness of strategies with this gene
    trending: 'rising' | 'stable' | 'declining';  // Trend across last 3 gens
}

export interface AutoIntervention {
    type: 'MUTATION_BOOST' | 'DIVERSITY_INJECTION' | 'REPLAY_SEED' | 'MUTATION_DECAY';
    generation: number;
    description: string;
    timestamp: number;
}

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface GenomeHealthSnapshot {
    // Core metrics
    diversityIndex: number;         // 0-1, from EvolutionEngine
    stagnationLevel: number;        // 0-N, generations stagnated
    convergenceRisk: number;        // 0-1, composite risk score
    fitnessTrajectory: number;      // slope: positive = improving, negative = declining
    mutationPressure: number;       // ratio: currentMutationRate / baselineMutationRate

    // Gene-level analysis
    geneDominance: GeneDominanceEntry[];  // Top indicator types by frequency
    populationSize: number;
    totalStrategiesTested: number;
    currentGeneration: number;

    // Health assessment
    healthGrade: HealthGrade;
    healthLabel: string;
    healthRecommendation: string;

    // Auto-intervention history (detected from mutation rate changes)
    recentInterventions: AutoIntervention[];

    // Fitness stats
    currentBestFitness: number;
    currentAvgFitness: number;
    allTimeBestFitness: number;
}

// ─── Constants ──────────────────────────────────────────────

const TRAJECTORY_WINDOW = 5;                    // Last N generations for trajectory
const CONVERGENCE_DIVERSITY_WEIGHT = 0.4;       // Weight of diversity in convergence risk
const CONVERGENCE_STAGNATION_WEIGHT = 0.35;     // Weight of stagnation in convergence risk
const CONVERGENCE_TRAJECTORY_WEIGHT = 0.25;     // Weight of trajectory in convergence risk

// ─── Analyzer ───────────────────────────────────────────────

/**
 * Stateless analyzer: given an Island, compute a GenomeHealthSnapshot.
 * No side effects — pure extraction and computation.
 */
export function computeGenomeHealth(island: Island): GenomeHealthSnapshot {
    const engine = island.getEvolutionEngine();
    const generations = engine.getGenerations();
    const latestGen = engine.getLatestGeneration();
    const stagnation = engine.getStagnationCounter();
    const currentMutation = engine.getCurrentMutationRate();
    const baselineMutation = 0.3; // DEFAULT_EVOLUTION_CONFIG.mutationRate

    // ── Diversity Index ──────────────────────────────────────
    const population = latestGen?.population ?? [];
    const diversityIndex = population.length > 1
        ? engine.calculateDiversityIndex(population)
        : 0;

    // ── Fitness Trajectory (slope of last N gens) ────────────
    const fitnessTrajectory = computeFitnessTrajectory(generations);

    // ── Convergence Risk (composite 0-1) ─────────────────────
    const diversityRisk = 1 - diversityIndex; // Low diversity = high risk
    const stagnationRisk = Math.min(1, stagnation / 5); // 5+ gens stagnation = max risk
    const trajectoryRisk = fitnessTrajectory < 0
        ? Math.min(1, Math.abs(fitnessTrajectory) * 2) // Declining = risk
        : 0;

    const convergenceRisk = Math.round((
        diversityRisk * CONVERGENCE_DIVERSITY_WEIGHT +
        stagnationRisk * CONVERGENCE_STAGNATION_WEIGHT +
        trajectoryRisk * CONVERGENCE_TRAJECTORY_WEIGHT
    ) * 100) / 100;

    // ── Mutation Pressure ────────────────────────────────────
    const mutationPressure = Math.round((currentMutation / baselineMutation) * 100) / 100;

    // ── Gene Dominance Analysis ──────────────────────────────
    const geneDominance = computeGeneDominance(generations, population);

    // ── Auto-Intervention Detection ──────────────────────────
    const recentInterventions = detectAutoInterventions(generations);

    // ── Health Assessment ────────────────────────────────────
    const { grade, label, recommendation } = assessHealth(
        diversityIndex,
        stagnation,
        convergenceRisk,
        fitnessTrajectory,
    );

    // ── Fitness Stats ────────────────────────────────────────
    const currentBestFitness = latestGen?.bestFitnessScore ?? 0;
    const currentAvgFitness = latestGen?.averageFitnessScore ?? 0;
    const allTimeBest = engine.getBestStrategyAllTime();
    const allTimeBestFitness = allTimeBest?.metadata.fitnessScore ?? 0;

    return {
        diversityIndex,
        stagnationLevel: stagnation,
        convergenceRisk,
        fitnessTrajectory,
        mutationPressure,
        geneDominance,
        populationSize: population.length,
        totalStrategiesTested: engine.getTotalStrategiesTested(),
        currentGeneration: engine.getCurrentGenerationNumber(),
        healthGrade: grade,
        healthLabel: label,
        healthRecommendation: recommendation,
        recentInterventions,
        currentBestFitness,
        currentAvgFitness,
        allTimeBestFitness,
    };
}

// ─── Helper Functions ───────────────────────────────────────

/**
 * Compute the fitness trajectory as a linear regression slope
 * over the last TRAJECTORY_WINDOW generations.
 * Positive = improving, Negative = declining, 0 = flat.
 */
function computeFitnessTrajectory(generations: EvolutionGeneration[]): number {
    if (generations.length < 2) return 0;

    const recent = generations.slice(-TRAJECTORY_WINDOW);
    const n = recent.length;
    if (n < 2) return 0;

    // Simple linear regression: y = best fitness, x = generation index
    const xs = recent.map((_, i) => i);
    const ys = recent.map(g => g.bestFitnessScore);

    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
        numerator += (xs[i] - xMean) * (ys[i] - yMean);
        denominator += (xs[i] - xMean) * (xs[i] - xMean);
    }

    if (denominator === 0) return 0;

    const slope = numerator / denominator;
    return Math.round(slope * 100) / 100;
}

/**
 * Compute gene dominance histogram from latest population.
 * Shows which IndicatorTypes dominate the population.
 */
function computeGeneDominance(
    generations: EvolutionGeneration[],
    currentPopulation: StrategyDNA[],
): GeneDominanceEntry[] {
    if (currentPopulation.length === 0) return [];

    // Count frequency of each indicator type in current population
    const typeCount = new Map<string, {
        count: number;
        totalFitness: number;
        strategyCount: number;
    }>();

    for (const strategy of currentPopulation) {
        const seenTypes = new Set<string>();
        for (const indicator of strategy.indicators) {
            const type = indicator.type;
            if (!seenTypes.has(type)) {
                seenTypes.add(type);
                const existing = typeCount.get(type);
                if (existing) {
                    existing.count++;
                    existing.totalFitness += strategy.metadata.fitnessScore;
                    existing.strategyCount++;
                } else {
                    typeCount.set(type, {
                        count: 1,
                        totalFitness: strategy.metadata.fitnessScore,
                        strategyCount: 1,
                    });
                }
            }
        }
    }

    // Calculate trends from previous generations
    const prevGens = generations.slice(-4, -1); // Last 3 excluding current
    const prevFrequencies = new Map<string, number>();

    for (const gen of prevGens) {
        for (const strategy of gen.population) {
            for (const indicator of strategy.indicators) {
                prevFrequencies.set(
                    indicator.type,
                    (prevFrequencies.get(indicator.type) ?? 0) + 1,
                );
            }
        }
    }

    const totalPrevStrategies = prevGens.reduce((sum, g) => sum + g.population.length, 0);

    // Build entries sorted by frequency
    const entries: GeneDominanceEntry[] = [];
    for (const [type, data] of typeCount.entries()) {
        const frequency = Math.round((data.count / currentPopulation.length) * 100) / 100;
        const avgFitness = Math.round((data.totalFitness / data.strategyCount) * 10) / 10;

        // Determine trend
        const prevFreq = totalPrevStrategies > 0
            ? (prevFrequencies.get(type) ?? 0) / totalPrevStrategies
            : 0;
        const freqDelta = frequency - prevFreq;
        let trending: 'rising' | 'stable' | 'declining';
        if (freqDelta > 0.1) trending = 'rising';
        else if (freqDelta < -0.1) trending = 'declining';
        else trending = 'stable';

        entries.push({
            indicatorType: type,
            frequency,
            avgFitness,
            trending,
        });
    }

    // Sort by frequency descending
    entries.sort((a, b) => b.frequency - a.frequency);
    return entries.slice(0, 10); // Top 10 indicator types
}

/**
 * Detect auto-interventions by analyzing mutation rate changes
 * across generations. When mutation jumps by ≥ 25%, it's a boost.
 * When it drops by ≥ 15%, it's a decay (improvement was detected).
 */
function detectAutoInterventions(generations: EvolutionGeneration[]): AutoIntervention[] {
    const interventions: AutoIntervention[] = [];
    const recent = generations.slice(-10); // Last 10 only

    for (let i = 1; i < recent.length; i++) {
        const prevRate = recent[i - 1].metrics.mutationRate;
        const currRate = recent[i].metrics.mutationRate;
        const gen = recent[i].generationNumber;
        const timestamp = recent[i].createdAt;

        if (prevRate > 0 && currRate / prevRate >= 1.25) {
            interventions.push({
                type: 'MUTATION_BOOST',
                generation: gen,
                description: `Stagnation detected → mutation rate boosted ${(prevRate * 100).toFixed(0)}% → ${(currRate * 100).toFixed(0)}%`,
                timestamp,
            });
        } else if (prevRate > 0 && currRate / prevRate <= 0.85) {
            interventions.push({
                type: 'MUTATION_DECAY',
                generation: gen,
                description: `Fitness improving → mutation rate reduced ${(prevRate * 100).toFixed(0)}% → ${(currRate * 100).toFixed(0)}%`,
                timestamp,
            });
        }

        // Detect wild card / diversity injection
        const prevDiversity = recent[i - 1].metrics.survivalRate;
        const currDiversity = recent[i].metrics.survivalRate;
        if (prevDiversity > 0 && currDiversity < prevDiversity * 0.8) {
            interventions.push({
                type: 'DIVERSITY_INJECTION',
                generation: gen,
                description: `Low diversity → extra wild cards injected`,
                timestamp,
            });
        }
    }

    return interventions.slice(-5); // Last 5 interventions
}

/**
 * Assess overall evolution health and provide a grade + recommendation.
 */
function assessHealth(
    diversity: number,
    stagnation: number,
    convergenceRisk: number,
    trajectory: number,
): {
    grade: HealthGrade;
    label: string;
    recommendation: string;
} {
    // Grade based on convergence risk
    if (convergenceRisk < 0.2 && trajectory >= 0) {
        return {
            grade: 'A',
            label: 'Excellent',
            recommendation: 'Evolution is healthy — strong diversity and improving fitness.',
        };
    }

    if (convergenceRisk < 0.35 && trajectory >= -0.5) {
        return {
            grade: 'B',
            label: 'Good',
            recommendation: 'Evolution is progressing well. Minor diversity pressure detected.',
        };
    }

    if (convergenceRisk < 0.55) {
        return {
            grade: 'C',
            label: 'Fair',
            recommendation: stagnation >= 3
                ? 'Stagnation detected — adaptive mutation active. Monitor closely.'
                : 'Moderate convergence risk — diversity declining.',
        };
    }

    if (convergenceRisk < 0.75) {
        return {
            grade: 'D',
            label: 'Warning',
            recommendation: 'High convergence risk! Population diversity collapsing. Consider injecting fresh genes.',
        };
    }

    return {
        grade: 'F',
        label: 'Critical',
        recommendation: 'Evolution stalled! Extreme convergence. Wild card injection and mutation boost required.',
    };
}
