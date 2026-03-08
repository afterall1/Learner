// ============================================================
// Learner: Stress Trend Temporal Analysis (STTA)
// ============================================================
// Phase 35 RADICAL INNOVATION: Tracks RRS/CRRS evolution over
// successive GA generations to reveal whether strategy resilience
// is IMPROVING, STABLE, or DEGRADING across evolutionary time.
//
// Key insight: A single RRS snapshot tells you how GOOD a strategy
// is across regimes. The temporal TREND tells you if the GA is
// LEARNING to be more resilient — or accidentally specializing.
//
// Features:
//   - Rolling window (20 snapshots) of per-generation stress data
//   - Per-scenario fitness tracking over time (Vulnerability Matrix)
//   - Linear regression on RRS → IMPROVING/STABLE/DEGRADING
//   - Weakest-scenario trend detection (early warning)
//   - Dashboard-exportable types for sparkline + heatmap
//
// Usage:
//   const tracker = new StressTemporalTracker();
//   tracker.recordSnapshot(gen, stressResult, calibratedResult);
//   const trend = tracker.getTrendData();        // sparkline
//   const matrix = tracker.getVulnerabilityMatrix(); // heatmap
//   const direction = tracker.getResilienceTrend();  // arrow
// ============================================================

import type { StressMatrixResult, ScenarioResult } from './stress-matrix';
import type { CalibratedStressResult } from './adaptive-stress';
import { SCENARIO_NAMES } from './stress-matrix';
import { createLogger } from '@/lib/utils/logger';

const sttaLog = createLogger('STTA');

// ─── Types ──────────────────────────────────────────────────

/**
 * A single temporal data point — one stress snapshot per generation.
 */
export interface StressTrendPoint {
    /** Generation number */
    generation: number;
    /** Raw RRS (equal-weight) */
    rrs: number;
    /** Calibrated RRS (regime-weighted) */
    crrs: number;
    /** Average fitness across all 5 scenarios */
    avgFitness: number;
    /** Scenario variance (lower = more regime-agnostic) */
    variance: number;
    /** Per-scenario fitness breakdown */
    scenarioFitnesses: Record<string, number>;
    /** Timestamp of the snapshot */
    timestamp: number;
    /** Strategy name tested */
    strategyName: string;
}

/**
 * Resilience trend direction.
 */
export type ResilienceTrend = 'IMPROVING' | 'STABLE' | 'DEGRADING';

/**
 * Trend metadata returned by getResilienceTrend().
 */
export interface ResilienceTrendInfo {
    /** Direction: improving, stable, or degrading */
    direction: ResilienceTrend;
    /** Slope of linear regression (RRS change per generation) */
    slopePerGeneration: number;
    /** R² of the regression (0-1, confidence) */
    rSquared: number;
    /** Last N data points used for trend */
    windowSize: number;
}

/**
 * Vulnerability matrix cell — per-scenario per-generation fitness.
 */
export interface VulnerabilityCell {
    /** Scenario name */
    scenario: string;
    /** Generation number */
    generation: number;
    /** Fitness score in this scenario at this generation */
    fitness: number;
}

/**
 * Vulnerability matrix: 5 scenarios × N generations.
 */
export interface VulnerabilityMatrix {
    /** Rows: one per scenario */
    scenarios: string[];
    /** Columns: generation numbers */
    generations: number[];
    /** Cells: fitness[scenarioIdx][genIdx] */
    cells: number[][];
    /** Per-scenario trend: is each scenario getting better or worse? */
    scenarioTrends: Record<string, {
        direction: ResilienceTrend;
        slope: number;
    }>;
    /** Which scenario is deteriorating fastest? (early warning) */
    weakestScenarioTrend: {
        scenario: string;
        slope: number;
    } | null;
}

/**
 * Full STTA snapshot for dashboard rendering.
 */
export interface STTASnapshot {
    /** Sparkline data points (last 20 generations) */
    trendData: StressTrendPoint[];
    /** Resilience trend direction + slope */
    resilienceTrend: ResilienceTrendInfo;
    /** Vulnerability matrix for heatmap */
    vulnerabilityMatrix: VulnerabilityMatrix;
    /** Total snapshots recorded */
    totalSnapshots: number;
}

// ─── Linear Regression ──────────────────────────────────────

/**
 * Simple ordinary least squares linear regression.
 * Returns { slope, intercept, rSquared }.
 */
function linearRegression(xs: number[], ys: number[]): {
    slope: number;
    intercept: number;
    rSquared: number;
} {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, rSquared: 0 };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += xs[i];
        sumY += ys[i];
        sumXY += xs[i] * ys[i];
        sumX2 += xs[i] * xs[i];
        sumY2 += ys[i] * ys[i];
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (Math.abs(denominator) < 1e-10) {
        return { slope: 0, intercept: sumY / n, rSquared: 0 };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // R² calculation
    const yMean = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
        ssTot += (ys[i] - yMean) ** 2;
        const predicted = slope * xs[i] + intercept;
        ssRes += (ys[i] - predicted) ** 2;
    }
    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    return { slope, intercept, rSquared };
}

// ─── Stress Temporal Tracker ────────────────────────────────

/**
 * Maximum number of snapshots to retain in the rolling window.
 */
const MAX_WINDOW_SIZE = 20;

/**
 * Thresholds for classifying resilience trend direction.
 * Based on RRS slope per generation.
 */
const IMPROVING_THRESHOLD = 0.5;   // +0.5 RRS per generation = improving
const DEGRADING_THRESHOLD = -0.5;  // -0.5 RRS per generation = degrading

/**
 * StressTemporalTracker — Phase 35 Radical Innovation
 *
 * Records stress matrix results per evolution generation and
 * computes temporal trends that reveal whether the GA is learning
 * to be more resilient across market regimes.
 *
 * Key analytics:
 * - RRS sparkline over 20 generations (improving? degrading?)
 * - Per-scenario vulnerability heatmap (which regime is weakening?)
 * - Weakest-scenario early warning (about to lose coverage?)
 */
export class StressTemporalTracker {
    private snapshots: StressTrendPoint[] = [];

    /**
     * Record a new stress snapshot for the current generation.
     *
     * @param generation - GA generation number
     * @param stressResult - Raw StressMatrixResult from runStressMatrix()
     * @param calibratedResult - Optional CalibratedStressResult from ASC
     */
    recordSnapshot(
        generation: number,
        stressResult: StressMatrixResult,
        calibratedResult?: CalibratedStressResult | null,
    ): void {
        // Build per-scenario fitness map
        const scenarioFitnesses: Record<string, number> = {};
        for (const sr of stressResult.scenarioResults) {
            scenarioFitnesses[sr.name] = sr.fitnessScore;
        }

        const point: StressTrendPoint = {
            generation,
            rrs: stressResult.resilienceScore,
            crrs: calibratedResult?.calibratedScore ?? stressResult.resilienceScore,
            avgFitness: stressResult.avgFitness,
            variance: stressResult.scenarioVariance,
            scenarioFitnesses,
            timestamp: Date.now(),
            strategyName: stressResult.strategyName,
        };

        this.snapshots.push(point);

        // Enforce rolling window limit
        if (this.snapshots.length > MAX_WINDOW_SIZE) {
            this.snapshots = this.snapshots.slice(-MAX_WINDOW_SIZE);
        }

        sttaLog.info('Snapshot recorded', {
            generation,
            rrs: point.rrs,
            crrs: point.crrs,
            windowSize: this.snapshots.length,
        });
    }

    /**
     * Get sparkline data for dashboard rendering.
     * Returns up to MAX_WINDOW_SIZE points, ordered by generation.
     */
    getTrendData(): StressTrendPoint[] {
        return [...this.snapshots];
    }

    /**
     * Get the resilience trend direction and magnitude.
     * Uses linear regression on RRS values over the window.
     */
    getResilienceTrend(): ResilienceTrendInfo {
        if (this.snapshots.length < 2) {
            return {
                direction: 'STABLE',
                slopePerGeneration: 0,
                rSquared: 0,
                windowSize: this.snapshots.length,
            };
        }

        const xs = this.snapshots.map(s => s.generation);
        const ys = this.snapshots.map(s => s.rrs);
        const { slope, rSquared } = linearRegression(xs, ys);

        let direction: ResilienceTrend;
        if (slope >= IMPROVING_THRESHOLD) {
            direction = 'IMPROVING';
        } else if (slope <= DEGRADING_THRESHOLD) {
            direction = 'DEGRADING';
        } else {
            direction = 'STABLE';
        }

        return {
            direction,
            slopePerGeneration: Math.round(slope * 100) / 100,
            rSquared: Math.round(rSquared * 1000) / 1000,
            windowSize: this.snapshots.length,
        };
    }

    /**
     * Get the vulnerability matrix for heatmap rendering.
     *
     * Returns a 5×N matrix where each row is a scenario and
     * each column is a generation. Cell values are fitness scores.
     *
     * Also computes per-scenario linear trends to identify which
     * scenarios are getting weaker (potential early warning).
     */
    getVulnerabilityMatrix(): VulnerabilityMatrix {
        // Scenario names from the first snapshot that has full data
        const scenarios = SCENARIO_NAMES as unknown as string[];
        const generations = this.snapshots.map(s => s.generation);

        // Build 5×N fitness matrix
        const cells: number[][] = scenarios.map(scenario =>
            this.snapshots.map(snap => snap.scenarioFitnesses[scenario] ?? 0),
        );

        // Compute per-scenario trends via linear regression
        const scenarioTrends: Record<string, { direction: ResilienceTrend; slope: number }> = {};
        let weakestSlope = Infinity;
        let weakestScenario: string | null = null;

        for (let i = 0; i < scenarios.length; i++) {
            const ys = cells[i];
            if (ys.length < 2) {
                scenarioTrends[scenarios[i]] = { direction: 'STABLE', slope: 0 };
                continue;
            }

            const xs = this.snapshots.map(s => s.generation);
            const { slope } = linearRegression(xs, ys);
            const roundedSlope = Math.round(slope * 100) / 100;

            let direction: ResilienceTrend;
            if (roundedSlope >= IMPROVING_THRESHOLD) {
                direction = 'IMPROVING';
            } else if (roundedSlope <= DEGRADING_THRESHOLD) {
                direction = 'DEGRADING';
            } else {
                direction = 'STABLE';
            }

            scenarioTrends[scenarios[i]] = { direction, slope: roundedSlope };

            // Track the weakest (most negative slope)
            if (slope < weakestSlope) {
                weakestSlope = slope;
                weakestScenario = scenarios[i];
            }
        }

        const weakestScenarioTrend = weakestScenario && weakestSlope < DEGRADING_THRESHOLD
            ? { scenario: weakestScenario, slope: Math.round(weakestSlope * 100) / 100 }
            : null;

        return {
            scenarios,
            generations,
            cells,
            scenarioTrends,
            weakestScenarioTrend,
        };
    }

    /**
     * Get a full STTA snapshot for dashboard rendering.
     * Single call that gathers all temporal analytics.
     */
    getSnapshot(): STTASnapshot {
        return {
            trendData: this.getTrendData(),
            resilienceTrend: this.getResilienceTrend(),
            vulnerabilityMatrix: this.getVulnerabilityMatrix(),
            totalSnapshots: this.snapshots.length,
        };
    }

    /**
     * Get the total number of snapshots recorded.
     */
    get size(): number {
        return this.snapshots.length;
    }

    /**
     * Check if the tracker has enough data for meaningful trends.
     * Minimum 3 data points needed.
     */
    hasEnoughData(): boolean {
        return this.snapshots.length >= 3;
    }

    /**
     * Reset the tracker (e.g., when switching islands).
     */
    reset(): void {
        this.snapshots = [];
        sttaLog.info('Tracker reset');
    }
}
