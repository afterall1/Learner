// ============================================================
// Learner: Regime Intelligence — Markov Regime Transition Intelligence (MRTI)
// ============================================================
// Predictive regime analysis engine. While regime-detector.ts
// classifies the CURRENT state (reactive), this module PREDICTS
// upcoming regime transitions using:
//   1. Markov Chain transition probability matrix
//   2. Early-warning signal detection (4 leading indicators)
//   3. Proactive positioning recommendations
//
// Council: López de Prado, Hamilton, Lo, Taleb, Dalio, Derman, Sutton
// ============================================================

import {
    OHLCV,
    MarketRegime,
} from '@/types';
import {
    detectRegime,
    calculateATR,
    calculateADX,
    type RegimeAnalysis,
} from './regime-detector';

// ─── Constants ───────────────────────────────────────────────

const ALL_REGIMES: MarketRegime[] = [
    MarketRegime.TRENDING_UP,
    MarketRegime.TRENDING_DOWN,
    MarketRegime.RANGING,
    MarketRegime.HIGH_VOLATILITY,
    MarketRegime.LOW_VOLATILITY,
];

// ─── Configuration ───────────────────────────────────────────

export interface RegimeIntelligenceConfig {
    /** Minimum regime observations before matrix is considered reliable */
    minObservationsForReliability: number;
    /** Number of candles between regime samples (for building history) */
    regimeSampleInterval: number;
    /** Minimum candles needed to build the transition matrix */
    minCandlesForMatrix: number;
    /** Threshold for 'PREPARE' recommendation */
    prepareThreshold: number;
    /** Threshold for 'SWITCH' recommendation */
    switchThreshold: number;
    /** Weight for ADX slope signal in composite risk */
    adxSlopeWeight: number;
    /** Weight for ATR acceleration signal in composite risk */
    atrAccelerationWeight: number;
    /** Weight for duration exhaustion signal in composite risk */
    durationExhaustionWeight: number;
    /** Weight for confidence decay signal in composite risk */
    confidenceDecayWeight: number;
    /** Number of recent ADX samples for slope calculation */
    adxSlopeLookback: number;
    /** Number of recent ATR samples for acceleration calculation */
    atrAccelerationLookback: number;
}

export const DEFAULT_REGIME_INTELLIGENCE_CONFIG: RegimeIntelligenceConfig = {
    minObservationsForReliability: 20,
    regimeSampleInterval: 10,      // Sample regime every 10 candles
    minCandlesForMatrix: 200,
    prepareThreshold: 0.3,
    switchThreshold: 0.7,
    adxSlopeWeight: 0.30,
    atrAccelerationWeight: 0.30,
    durationExhaustionWeight: 0.25,
    confidenceDecayWeight: 0.15,
    adxSlopeLookback: 5,
    atrAccelerationLookback: 5,
};

// ─── Types ───────────────────────────────────────────────────

export type EarlyWarningSignal =
    | 'adx_slope'
    | 'atr_acceleration'
    | 'duration_exhaustion'
    | 'confidence_decay';

export interface EarlyWarning {
    signal: EarlyWarningSignal;
    severity: number;           // 0-1
    description: string;
}

export type TransitionRecommendation = 'HOLD' | 'PREPARE' | 'SWITCH';

export interface RegimeTransitionForecast {
    /** Current detected regime */
    currentRegime: MarketRegime;
    /** Confidence in current regime classification */
    currentConfidence: number;
    /** Overall transition risk score (0 = stable, 1 = imminent) */
    transitionRisk: number;
    /** Most probable next regime (from Markov matrix) */
    predictedNextRegime: MarketRegime;
    /** Probability of predicted next regime */
    predictedNextProbability: number;
    /** Active early-warning signals */
    earlyWarnings: EarlyWarning[];
    /** Estimated candles remaining in current regime */
    estimatedCandlesRemaining: number;
    /** Actionable recommendation */
    recommendation: TransitionRecommendation;
    /** Full transition probability row for current regime */
    transitionProbabilities: Record<MarketRegime, number>;
    /** Whether the matrix has enough data to be reliable */
    matrixReliable: boolean;
}

export interface TransitionMatrixSnapshot {
    matrix: Record<MarketRegime, Record<MarketRegime, number>>;
    totalTransitions: number;
    averageDurations: Record<MarketRegime, number>;
    isReliable: boolean;
}

// ─── Transition Matrix (Markov Chain) ────────────────────────

/**
 * Builds and maintains a 5×5 Markov transition probability matrix
 * from historical regime sequences.
 *
 * P(next_regime | current_regime) is estimated from observed
 * transition frequencies, with Laplace smoothing to handle
 * unobserved transitions.
 */
export class TransitionMatrix {
    /** Raw count of transitions: counts[from][to] */
    private counts: Map<MarketRegime, Map<MarketRegime, number>> = new Map();
    /** Cumulative duration (in samples) per regime */
    private durationSums: Map<MarketRegime, number> = new Map();
    /** Number of regime visits (for average duration) */
    private visitCounts: Map<MarketRegime, number> = new Map();
    /** Total observed transitions */
    private totalTransitions: number = 0;
    /** Laplace smoothing constant */
    private readonly smoothingAlpha: number = 0.1;

    constructor() {
        // Initialize empty counts for all regime pairs
        for (const from of ALL_REGIMES) {
            const row = new Map<MarketRegime, number>();
            for (const to of ALL_REGIMES) {
                row.set(to, 0);
            }
            this.counts.set(from, row);
            this.durationSums.set(from, 0);
            this.visitCounts.set(from, 0);
        }
    }

    /**
     * Build the transition matrix from a historical regime sequence.
     * The sequence is a time-ordered array of regime classifications.
     */
    buildFromHistory(regimeSequence: MarketRegime[]): void {
        if (regimeSequence.length < 2) return;

        // Reset counts
        for (const from of ALL_REGIMES) {
            const row = this.counts.get(from)!;
            for (const to of ALL_REGIMES) {
                row.set(to, 0);
            }
            this.durationSums.set(from, 0);
            this.visitCounts.set(from, 0);
        }
        this.totalTransitions = 0;

        // Track current regime run
        let currentRunRegime = regimeSequence[0];
        let currentRunLength = 1;
        this.visitCounts.set(currentRunRegime, 1);

        for (let i = 1; i < regimeSequence.length; i++) {
            const current = regimeSequence[i];
            const previous = regimeSequence[i - 1];

            if (current !== previous) {
                // Transition occurred
                const row = this.counts.get(previous)!;
                row.set(current, (row.get(current) ?? 0) + 1);
                this.totalTransitions++;

                // Record duration of the regime that just ended
                this.durationSums.set(
                    currentRunRegime,
                    (this.durationSums.get(currentRunRegime) ?? 0) + currentRunLength,
                );

                // Start new run
                currentRunRegime = current;
                currentRunLength = 1;
                this.visitCounts.set(current, (this.visitCounts.get(current) ?? 0) + 1);
            } else {
                currentRunLength++;
            }
        }

        // Record the final run
        this.durationSums.set(
            currentRunRegime,
            (this.durationSums.get(currentRunRegime) ?? 0) + currentRunLength,
        );
    }

    /**
     * Get transition probability P(toRegime | fromRegime).
     * Uses Laplace smoothing to handle zero-count transitions.
     */
    getTransitionProbability(from: MarketRegime, to: MarketRegime): number {
        const row = this.counts.get(from);
        if (!row) return 1.0 / ALL_REGIMES.length; // Uniform if unknown

        const count = row.get(to) ?? 0;
        const rowTotal = this.getRowTotal(from);

        // Laplace-smoothed probability
        const smoothedCount = count + this.smoothingAlpha;
        const smoothedTotal = rowTotal + this.smoothingAlpha * ALL_REGIMES.length;

        return smoothedCount / smoothedTotal;
    }

    /**
     * Get full transition probability row for a given regime.
     * All probabilities in the row sum to 1.0.
     */
    getTransitionRow(from: MarketRegime): Record<MarketRegime, number> {
        const result = {} as Record<MarketRegime, number>;
        for (const to of ALL_REGIMES) {
            result[to] = this.getTransitionProbability(from, to);
        }
        return result;
    }

    /**
     * Get the most probable next regime given the current regime.
     * Excludes self-transition (staying in same regime).
     */
    getMostProbableTransition(from: MarketRegime): { regime: MarketRegime; probability: number } {
        let bestRegime: MarketRegime = MarketRegime.RANGING;
        let bestProb = -1;

        for (const to of ALL_REGIMES) {
            if (to === from) continue; // Exclude self-transition
            const prob = this.getTransitionProbability(from, to);
            if (prob > bestProb) {
                bestProb = prob;
                bestRegime = to;
            }
        }

        return { regime: bestRegime, probability: bestProb };
    }

    /**
     * Get average duration (in sample intervals) for a given regime.
     */
    getAverageDuration(regime: MarketRegime): number {
        const visits = this.visitCounts.get(regime) ?? 0;
        if (visits === 0) return 50; // Default estimate: 50 samples

        const totalDuration = this.durationSums.get(regime) ?? 0;
        return totalDuration / visits;
    }

    /**
     * Check if the matrix has enough observations to be statistically reliable.
     */
    isReliable(minObservations: number): boolean {
        return this.totalTransitions >= minObservations;
    }

    /**
     * Get total number of observed transitions.
     */
    getTotalTransitions(): number {
        return this.totalTransitions;
    }

    /**
     * Get a dashboard-friendly snapshot of the matrix.
     */
    getSnapshot(): TransitionMatrixSnapshot {
        const matrix = {} as Record<MarketRegime, Record<MarketRegime, number>>;
        const averageDurations = {} as Record<MarketRegime, number>;

        for (const from of ALL_REGIMES) {
            matrix[from] = this.getTransitionRow(from);
            averageDurations[from] = Math.round(this.getAverageDuration(from) * 10) / 10;
        }

        return {
            matrix,
            totalTransitions: this.totalTransitions,
            averageDurations,
            isReliable: this.totalTransitions >= 20,
        };
    }

    /**
     * Get raw row total (unsmoothed) for normalization.
     */
    private getRowTotal(from: MarketRegime): number {
        const row = this.counts.get(from);
        if (!row) return 0;

        let total = 0;
        for (const count of row.values()) {
            total += count;
        }
        return total;
    }
}

// ─── Early Warning Detector ──────────────────────────────────

/**
 * Monitors 4 leading indicators that signal an impending regime transition.
 * Each signal produces a severity score (0-1).
 */
export class EarlyWarningDetector {
    private readonly config: RegimeIntelligenceConfig;

    constructor(config: Partial<RegimeIntelligenceConfig> = {}) {
        this.config = { ...DEFAULT_REGIME_INTELLIGENCE_CONFIG, ...config };
    }

    /**
     * Detect all early-warning signals from current market data.
     * Returns an array of active warnings sorted by severity (descending).
     */
    detectWarnings(
        candles: OHLCV[],
        currentAnalysis: RegimeAnalysis,
        averageRegimeDuration: number,
    ): EarlyWarning[] {
        const warnings: EarlyWarning[] = [];

        // Signal 1: ADX Slope — is the trend weakening/strengthening?
        const adxWarning = this.detectAdxSlope(candles);
        if (adxWarning.severity > 0.15) {
            warnings.push(adxWarning);
        }

        // Signal 2: ATR Acceleration — sudden volatility change?
        const atrWarning = this.detectAtrAcceleration(candles);
        if (atrWarning.severity > 0.15) {
            warnings.push(atrWarning);
        }

        // Signal 3: Duration Exhaustion — been in this regime too long?
        const durationWarning = this.detectDurationExhaustion(
            currentAnalysis.regimeDuration,
            averageRegimeDuration,
        );
        if (durationWarning.severity > 0.15) {
            warnings.push(durationWarning);
        }

        // Signal 4: Confidence Decay — classification becoming uncertain?
        const confidenceWarning = this.detectConfidenceDecay(currentAnalysis.confidence);
        if (confidenceWarning.severity > 0.15) {
            warnings.push(confidenceWarning);
        }

        // Sort by severity (highest first)
        return warnings.sort((a, b) => b.severity - a.severity);
    }

    /**
     * Calculate composite transition risk from early-warning signals.
     * Weighted average of all 4 signals, clamped to [0, 1].
     */
    calculateTransitionRisk(
        candles: OHLCV[],
        currentAnalysis: RegimeAnalysis,
        averageRegimeDuration: number,
    ): number {
        const adxSev = this.detectAdxSlope(candles).severity;
        const atrSev = this.detectAtrAcceleration(candles).severity;
        const durSev = this.detectDurationExhaustion(
            currentAnalysis.regimeDuration,
            averageRegimeDuration,
        ).severity;
        const confSev = this.detectConfidenceDecay(currentAnalysis.confidence).severity;

        const weightedRisk =
            adxSev * this.config.adxSlopeWeight +
            atrSev * this.config.atrAccelerationWeight +
            durSev * this.config.durationExhaustionWeight +
            confSev * this.config.confidenceDecayWeight;

        return Math.max(0, Math.min(1, weightedRisk));
    }

    /**
     * Signal 1: ADX Slope.
     * Compute the slope of recent ADX values.
     * Negative slope in a trend = weakening trend → transition likely.
     * Positive slope in ranging = emerging trend → transition likely.
     */
    private detectAdxSlope(candles: OHLCV[]): EarlyWarning {
        const lookback = this.config.adxSlopeLookback;
        if (candles.length < 14 + lookback * 10) {
            return { signal: 'adx_slope', severity: 0, description: 'Insufficient data for ADX slope' };
        }

        // Calculate ADX at multiple recent points
        const adxValues: number[] = [];
        for (let i = 0; i < lookback; i++) {
            const endIdx = candles.length - i * 10;
            if (endIdx < 28) break;
            const slice = candles.slice(0, endIdx);
            adxValues.unshift(calculateADX(slice, 14));
        }

        if (adxValues.length < 2) {
            return { signal: 'adx_slope', severity: 0, description: 'Insufficient ADX samples' };
        }

        // Calculate linear regression slope
        const slope = this.linearSlope(adxValues);

        // Negative slope = ADX declining = trend weakening
        // We care about the MAGNITUDE of change
        const normalizedSlope = Math.abs(slope) / 5; // ADX change of 5 per sample = max severity
        const severity = Math.max(0, Math.min(1, normalizedSlope));

        let description: string;
        if (slope < -1) {
            description = `ADX declining (slope: ${slope.toFixed(2)}) — trend may be weakening`;
        } else if (slope > 1) {
            description = `ADX rising (slope: ${slope.toFixed(2)}) — trend may be emerging`;
        } else {
            description = `ADX stable (slope: ${slope.toFixed(2)})`;
        }

        return { signal: 'adx_slope', severity, description };
    }

    /**
     * Signal 2: ATR Acceleration.
     * Sudden ATR increase = volatility spike → regime disruption.
     * Sudden ATR decrease = volatility contraction → new regime forming.
     */
    private detectAtrAcceleration(candles: OHLCV[]): EarlyWarning {
        const lookback = this.config.atrAccelerationLookback;
        if (candles.length < 14 + lookback * 10) {
            return { signal: 'atr_acceleration', severity: 0, description: 'Insufficient data for ATR acceleration' };
        }

        // Calculate ATR at multiple recent points
        const atrValues: number[] = [];
        for (let i = 0; i < lookback; i++) {
            const endIdx = candles.length - i * 10;
            if (endIdx < 28) break;
            const slice = candles.slice(0, endIdx);
            atrValues.unshift(calculateATR(slice, 14));
        }

        if (atrValues.length < 3) {
            return { signal: 'atr_acceleration', severity: 0, description: 'Insufficient ATR samples' };
        }

        // Calculate acceleration (second derivative)
        // First: velocities
        const velocities: number[] = [];
        for (let i = 1; i < atrValues.length; i++) {
            velocities.push(atrValues[i] - atrValues[i - 1]);
        }

        // Second: acceleration
        let acceleration = 0;
        if (velocities.length >= 2) {
            acceleration = velocities[velocities.length - 1] - velocities[velocities.length - 2];
        }

        // Normalize: ATR acceleration relative to mean ATR
        const meanATR = atrValues.reduce((s, v) => s + v, 0) / atrValues.length;
        const normalizedAccel = meanATR > 0 ? Math.abs(acceleration) / meanATR : 0;

        // Severity: 0.5 = moderate, 1.0 = extreme
        const severity = Math.max(0, Math.min(1, normalizedAccel * 2));

        const direction = acceleration > 0 ? 'accelerating' : 'decelerating';
        const description = `ATR ${direction} (accel: ${acceleration.toFixed(4)}, severity: ${severity.toFixed(2)})`;

        return { signal: 'atr_acceleration', severity, description };
    }

    /**
     * Signal 3: Duration Exhaustion.
     * The longer a regime persists, the more likely a transition.
     * Uses the average duration from the TransitionMatrix.
     */
    private detectDurationExhaustion(
        currentDuration: number,
        averageDuration: number,
    ): EarlyWarning {
        if (averageDuration <= 0) {
            return { signal: 'duration_exhaustion', severity: 0, description: 'No duration baseline' };
        }

        // Ratio of current duration to average
        const durationRatio = currentDuration / averageDuration;

        // Severity ramps up as duration exceeds average
        // At 1.0× average → severity 0.3
        // At 1.5× average → severity 0.6
        // At 2.0× average → severity 0.9
        let severity: number;
        if (durationRatio < 0.5) {
            severity = 0; // Too new, no exhaustion risk
        } else {
            severity = Math.max(0, Math.min(1, (durationRatio - 0.5) * 0.6));
        }

        const description = `Regime duration: ${currentDuration} samples (avg: ${averageDuration.toFixed(0)}, ratio: ${durationRatio.toFixed(2)}×)`;

        return { signal: 'duration_exhaustion', severity, description };
    }

    /**
     * Signal 4: Confidence Decay.
     * Low regime classification confidence = ambiguous market state = transition zone.
     */
    private detectConfidenceDecay(confidence: number): EarlyWarning {
        // Invert confidence: low confidence = high transition risk
        // Confidence 1.0 → severity 0.0
        // Confidence 0.5 → severity 0.5
        // Confidence 0.3 → severity 0.7
        const severity = Math.max(0, Math.min(1, 1 - confidence));

        let description: string;
        if (confidence < 0.3) {
            description = `Regime classification very uncertain (confidence: ${(confidence * 100).toFixed(0)}%) — transition zone likely`;
        } else if (confidence < 0.5) {
            description = `Regime classification weakening (confidence: ${(confidence * 100).toFixed(0)}%)`;
        } else {
            description = `Regime classification stable (confidence: ${(confidence * 100).toFixed(0)}%)`;
        }

        return { signal: 'confidence_decay', severity, description };
    }

    /**
     * Calculate linear regression slope for a numeric sequence.
     */
    private linearSlope(values: number[]): number {
        const n = values.length;
        if (n < 2) return 0;

        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += values[i];
            sumXY += i * values[i];
            sumXX += i * i;
        }

        const denominator = n * sumXX - sumX * sumX;
        if (denominator === 0) return 0;

        return (n * sumXY - sumX * sumY) / denominator;
    }
}

// ─── Regime Intelligence (MRTI Orchestrator) ─────────────────

/**
 * Main MRTI orchestrator. Combines TransitionMatrix predictions
 * with EarlyWarningDetector signals to produce actionable
 * RegimeTransitionForecast objects.
 *
 * Usage:
 *   const mrti = new RegimeIntelligence();
 *   mrti.calibrate(historicalCandles);  // Build transition matrix
 *   const forecast = mrti.forecast(recentCandles);
 *
 *   if (forecast.recommendation === 'PREPARE') {
 *       roster.preWarmForRegime(forecast.predictedNextRegime);
 *   }
 */
export class RegimeIntelligence {
    private readonly config: RegimeIntelligenceConfig;
    private readonly matrix: TransitionMatrix;
    private readonly warningDetector: EarlyWarningDetector;
    private calibrated: boolean = false;

    constructor(config: Partial<RegimeIntelligenceConfig> = {}) {
        this.config = { ...DEFAULT_REGIME_INTELLIGENCE_CONFIG, ...config };
        this.matrix = new TransitionMatrix();
        this.warningDetector = new EarlyWarningDetector(this.config);
    }

    /**
     * Calibrate the MRTI engine from historical candle data.
     * Builds the Markov transition probability matrix by sampling
     * regime classifications at regular intervals across the history.
     *
     * Should be called once with a large dataset (500+ candles)
     * and periodically recalibrated as new data arrives.
     */
    calibrate(candles: OHLCV[]): void {
        if (candles.length < this.config.minCandlesForMatrix) {
            // Not enough data — matrix will be unreliable but we'll still build it
            // with whatever we have
            if (candles.length < 100) return; // Absolute minimum
        }

        // Sample regime at regular intervals to build the sequence
        const regimeSequence: MarketRegime[] = [];
        const interval = this.config.regimeSampleInterval;
        const minWindowSize = 60; // Need at least 60 candles for ADX/ATR/SMA

        for (let i = minWindowSize; i <= candles.length; i += interval) {
            const slice = candles.slice(0, i);
            const analysis = detectRegime(slice);
            regimeSequence.push(analysis.currentRegime);
        }

        // Build the transition matrix from the regime sequence
        this.matrix.buildFromHistory(regimeSequence);
        this.calibrated = true;
    }

    /**
     * Generate a regime transition forecast from current market data.
     *
     * Returns a comprehensive forecast including:
     * - Current regime with confidence
     * - Transition risk score (0-1)
     * - Predicted next regime
     * - Early-warning signals
     * - Actionable recommendation (HOLD/PREPARE/SWITCH)
     */
    forecast(candles: OHLCV[]): RegimeTransitionForecast {
        // Get current regime analysis
        const analysis = detectRegime(candles);
        const currentRegime = analysis.currentRegime;

        // Get transition probabilities from Markov matrix
        const transitionRow = this.matrix.getTransitionRow(currentRegime);
        const mostProbable = this.matrix.getMostProbableTransition(currentRegime);
        const avgDuration = this.matrix.getAverageDuration(currentRegime);
        const matrixReliable = this.matrix.isReliable(this.config.minObservationsForReliability);

        // Detect early-warning signals
        const earlyWarnings = this.warningDetector.detectWarnings(
            candles,
            analysis,
            avgDuration * this.config.regimeSampleInterval, // Convert samples → candles
        );

        // Calculate composite transition risk
        const transitionRisk = this.warningDetector.calculateTransitionRisk(
            candles,
            analysis,
            avgDuration * this.config.regimeSampleInterval,
        );

        // Estimate remaining candles in current regime
        const avgDurationCandles = avgDuration * this.config.regimeSampleInterval;
        const currentDurationCandles = analysis.regimeDuration;
        const estimatedRemaining = Math.max(
            0,
            Math.round(avgDurationCandles - currentDurationCandles),
        );

        // Generate recommendation
        let recommendation: TransitionRecommendation;
        if (transitionRisk >= this.config.switchThreshold) {
            recommendation = 'SWITCH';
        } else if (transitionRisk >= this.config.prepareThreshold) {
            recommendation = 'PREPARE';
        } else {
            recommendation = 'HOLD';
        }

        // If matrix isn't reliable, cap recommendation at PREPARE
        if (!matrixReliable && recommendation === 'SWITCH') {
            recommendation = 'PREPARE';
        }

        return {
            currentRegime,
            currentConfidence: analysis.confidence,
            transitionRisk: Math.round(transitionRisk * 1000) / 1000,
            predictedNextRegime: mostProbable.regime,
            predictedNextProbability: Math.round(mostProbable.probability * 1000) / 1000,
            earlyWarnings,
            estimatedCandlesRemaining: estimatedRemaining,
            recommendation,
            transitionProbabilities: transitionRow,
            matrixReliable,
        };
    }

    /**
     * Quick check: Is a transition likely within the next N candles?
     */
    isTransitionLikely(candles: OHLCV[], withinCandles: number = 50): boolean {
        const f = this.forecast(candles);
        return f.transitionRisk > this.config.prepareThreshold &&
            f.estimatedCandlesRemaining < withinCandles;
    }

    /**
     * Get the transition matrix for dashboard display or analysis.
     */
    getMatrixSnapshot(): TransitionMatrixSnapshot {
        return this.matrix.getSnapshot();
    }

    /**
     * Check if the MRTI engine has been calibrated with historical data.
     */
    isCalibrated(): boolean {
        return this.calibrated;
    }

    /**
     * Get the underlying TransitionMatrix for advanced access.
     */
    getTransitionMatrix(): TransitionMatrix {
        return this.matrix;
    }
}
