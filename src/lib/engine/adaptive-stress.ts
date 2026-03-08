// ============================================================
// Learner: Adaptive Stress Calibration (ASC)
// ============================================================
// Phase 30 RADICAL INNOVATION: Instead of equal-weight 5-scenario
// stress testing, dynamically weights scenarios based on the
// CURRENT and PREDICTED market regime.
//
// In a trending market, bull_trend and bear_crash scenarios get
// higher weight. In a ranging market, sideways_range gets
// priority. This produces a Calibrated Regime Resilience Score
// (CRRS) that reflects real-world regime probabilities.
//
// MRTI Integration: When regime transition predictions are
// available, future-likely scenarios receive elevated weight,
// enabling proactive strategy selection.
//
// Usage:
//   const calibrator = new AdaptiveStressCalibrator();
//   calibrator.updateRegime('TRENDING_UP', 0.82);
//   const crrs = calibrator.calibrateRRS(stressResult);
//   console.log(crrs.calibratedScore);  // regime-weighted RRS
// ============================================================

import type { MarketRegime } from '@/types';
import type { StressMatrixResult } from './stress-matrix';
import { SCENARIO_NAMES } from './stress-matrix';
import { createLogger } from '@/lib/utils/logger';

const ascLog = createLogger('AdaptiveStress');

// ─── Types ──────────────────────────────────────────────────

/**
 * Scenario weight configuration.
 * Higher weight = more influence on the calibrated RRS.
 */
export interface ScenarioWeights {
    [key: string]: number;  // Index signature for dynamic access
    bull_trend: number;
    bear_crash: number;
    sideways_range: number;
    high_volatility: number;
    regime_transition: number;
}

/**
 * Result of adaptive stress calibration.
 */
export interface CalibratedStressResult {
    /** Original RRS from equal-weight calculation */
    originalRRS: number;
    /** Calibrated RRS using regime-weighted scenarios */
    calibratedScore: number;
    /** Active scenario weights at time of calibration */
    weights: ScenarioWeights;
    /** Current regime used for calibration */
    currentRegime: MarketRegime | null;
    /** Regime confidence (0-1) */
    regimeConfidence: number;
    /** Per-scenario weighted contribution */
    scenarioContributions: Record<string, number>;
    /** Blended fitness: backtestFitness × 0.7 + calibratedScore × 0.3 */
    blendedFitness: number;
}

/**
 * State snapshot for dashboard visualization.
 */
export interface StressCalibrationState {
    currentRegime: MarketRegime | null;
    regimeConfidence: number;
    activeWeights: ScenarioWeights;
    lastCalibrationTimestamp: number;
    totalCalibrations: number;
    predictedNextRegime: MarketRegime | null;
}

// ─── Default Weights ────────────────────────────────────────

/**
 * Equal weights — fallback when no regime data available.
 */
const EQUAL_WEIGHTS: ScenarioWeights = {
    bull_trend: 1.0,
    bear_crash: 1.0,
    sideways_range: 1.0,
    high_volatility: 1.0,
    regime_transition: 1.0,
};

/**
 * Regime-specific weight matrices.
 * Higher values emphasize scenarios most relevant to the current regime.
 *
 * Design rationale:
 * - Current regime scenario gets 1.5× (verify performance in known conditions)
 * - Opposite regime gets 2.0× (stress-test against regime reversal)
 * - regime_transition always gets 1.5× (real markets transition constantly)
 */
const REGIME_WEIGHT_MATRIX: Record<string, ScenarioWeights> = {
    TRENDING_UP: {
        bull_trend: 1.5,       // Verify in known conditions
        bear_crash: 2.0,       // Stress: what if reversal?
        sideways_range: 0.8,   // Less likely to persist
        high_volatility: 1.2,  // Moderate concern
        regime_transition: 1.5, // Always important
    },
    TRENDING_DOWN: {
        bull_trend: 2.0,       // Stress: what if recovery?
        bear_crash: 1.5,       // Verify in known conditions
        sideways_range: 0.8,   // Less likely
        high_volatility: 1.2,  // Moderate concern
        regime_transition: 1.5, // Always important
    },
    RANGING: {
        bull_trend: 1.0,       // Possible breakout
        bear_crash: 1.0,       // Possible breakdown
        sideways_range: 1.5,   // Verify in known conditions
        high_volatility: 1.5,  // Volatility expansion risk
        regime_transition: 2.0, // Range-break = transition
    },
    HIGH_VOLATILITY: {
        bull_trend: 1.0,       // May resolve bullish
        bear_crash: 1.5,       // Volatility often precedes crashes
        sideways_range: 0.8,   // Unlikely in high vol
        high_volatility: 1.8,  // Verify in known conditions
        regime_transition: 1.5, // Transition imminent
    },
    LOW_VOLATILITY: {
        bull_trend: 1.2,       // Low vol → accumulation
        bear_crash: 1.2,       // Low vol → distribution
        sideways_range: 1.5,   // Low vol = ranging
        high_volatility: 2.0,  // Stress: volatility explosion
        regime_transition: 1.5, // Always important
    },
};

// ─── Adaptive Stress Calibrator ─────────────────────────────

/**
 * Adaptive Stress Calibrator — Phase 30 Radical Innovation
 *
 * Dynamically adjusts stress scenario weights based on detected
 * market regime and predicted regime transitions.
 *
 * Key features:
 * - Regime-weighted RRS (Calibrated Regime Resilience Score)
 * - MRTI-ready: accepts predicted next regime for proactive weighting
 * - Blended fitness: combines backtest fitness with calibrated RRS
 * - Dashboard-exportable state for visualization
 */
export class AdaptiveStressCalibrator {
    private currentRegime: MarketRegime | null = null;
    private regimeConfidence: number = 0;
    private predictedNextRegime: MarketRegime | null = null;
    private activeWeights: ScenarioWeights = { ...EQUAL_WEIGHTS };
    private lastCalibrationTimestamp: number = 0;
    private totalCalibrations: number = 0;

    /**
     * Update the current market regime.
     * This recalculates scenario weights based on the new regime.
     *
     * @param regime - Current detected market regime
     * @param confidence - Detection confidence (0-1)
     */
    updateRegime(regime: MarketRegime, confidence: number): void {
        this.currentRegime = regime;
        this.regimeConfidence = Math.max(0, Math.min(1, confidence));
        this.recalculateWeights();

        ascLog.info('Regime updated', {
            regime,
            confidence: this.regimeConfidence,
            weights: this.activeWeights,
        });
    }

    /**
     * Update predicted next regime from MRTI.
     * Blends predicted regime weights into current weights.
     *
     * @param predictedRegime - Predicted next regime (from MRTI transition matrix)
     * @param transitionProbability - Probability of transition (0-1)
     */
    updatePrediction(predictedRegime: MarketRegime, transitionProbability: number): void {
        this.predictedNextRegime = predictedRegime;

        // Only act on high-probability predictions
        if (transitionProbability >= 0.3) {
            this.recalculateWeights();
            ascLog.info('Prediction applied', {
                predicted: predictedRegime,
                probability: transitionProbability,
            });
        }
    }

    /**
     * Calibrate a StressMatrixResult using regime-weighted scoring.
     *
     * @param stressResult - Raw stress matrix result from runStressMatrix
     * @param backtestFitness - Strategy's base fitness from batchBacktest
     * @returns Calibrated result with weighted RRS and blended fitness
     */
    calibrateRRS(stressResult: StressMatrixResult, backtestFitness: number = 0): CalibratedStressResult {
        const weights = this.activeWeights;
        let weightedSum = 0;
        let totalWeight = 0;
        const contributions: Record<string, number> = {};

        for (const scenario of stressResult.scenarioResults) {
            const weight = weights[scenario.name] ?? 1.0;
            const contribution = scenario.fitnessScore * weight;
            weightedSum += contribution;
            totalWeight += weight;
            contributions[scenario.name] = Math.round(contribution * 100) / 100;
        }

        const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;

        // Apply same variance + consistency logic as original RRS
        const fitnesses = stressResult.scenarioResults.map(r => r.fitnessScore);
        const catastrophicFailures = fitnesses.filter(f => f === 0).length;
        const consistencyBonus = catastrophicFailures === 0
            ? 1.0
            : Math.max(0.3, 1 - (catastrophicFailures * 0.15));

        const calibratedScore = Math.round(
            Math.min(100, weightedAvg * consistencyBonus)
        );

        // Blended fitness: 70% backtest + 30% calibrated RRS
        const blendedFitness = backtestFitness > 0
            ? Math.round((backtestFitness * 0.7 + calibratedScore * 0.3) * 100) / 100
            : calibratedScore;

        this.totalCalibrations++;
        this.lastCalibrationTimestamp = Date.now();

        return {
            originalRRS: stressResult.resilienceScore,
            calibratedScore,
            weights: { ...weights },
            currentRegime: this.currentRegime,
            regimeConfidence: this.regimeConfidence,
            scenarioContributions: contributions,
            blendedFitness,
        };
    }

    /**
     * Get current calibration state for dashboard visualization.
     */
    getCalibrationState(): StressCalibrationState {
        return {
            currentRegime: this.currentRegime,
            regimeConfidence: this.regimeConfidence,
            activeWeights: { ...this.activeWeights },
            lastCalibrationTimestamp: this.lastCalibrationTimestamp,
            totalCalibrations: this.totalCalibrations,
            predictedNextRegime: this.predictedNextRegime,
        };
    }

    /**
     * Reset to equal weights (e.g., when regime is unknown).
     */
    reset(): void {
        this.currentRegime = null;
        this.regimeConfidence = 0;
        this.predictedNextRegime = null;
        this.activeWeights = { ...EQUAL_WEIGHTS };
        ascLog.info('Calibrator reset to equal weights');
    }

    // ─── Private ────────────────────────────────────────────

    private recalculateWeights(): void {
        if (!this.currentRegime) {
            this.activeWeights = { ...EQUAL_WEIGHTS };
            return;
        }

        // Start with regime-specific weights
        const regimeKey = this.currentRegime as string;
        const baseWeights = REGIME_WEIGHT_MATRIX[regimeKey] ?? EQUAL_WEIGHTS;

        // Deep copy
        const weights: ScenarioWeights = { ...baseWeights };

        // Blend prediction weights if available
        if (this.predictedNextRegime && this.predictedNextRegime !== this.currentRegime) {
            const predKey = this.predictedNextRegime as string;
            const predWeights = REGIME_WEIGHT_MATRIX[predKey];
            if (predWeights) {
                // 20% influence from predicted regime
                const predInfluence = 0.2;
                for (const name of SCENARIO_NAMES) {
                    weights[name] = weights[name] * (1 - predInfluence) +
                        predWeights[name] * predInfluence;
                }
            }
        }

        // Confidence modulation: blend toward equal weights at low confidence
        if (this.regimeConfidence < 0.5) {
            const confFactor = this.regimeConfidence / 0.5; // 0 at 0%, 1 at 50%+
            for (const name of SCENARIO_NAMES) {
                weights[name] = EQUAL_WEIGHTS[name] * (1 - confFactor) +
                    weights[name] * confFactor;
            }
        }

        this.activeWeights = weights;
    }
}
