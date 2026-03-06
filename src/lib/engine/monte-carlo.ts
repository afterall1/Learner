// ============================================================
// Learner: Monte Carlo Validation — Statistical Significance
// ============================================================
// Council Decision: Dr. Ernest Chan's mandate — shuffle trade
// order 1000x, verify edge is real at 95th percentile.
// Includes López de Prado's Deflated Sharpe Ratio.
// ============================================================

import {
    Trade,
    MonteCarloConfig,
    MonteCarloResult,
    DEFAULT_MC_CONFIG,
    PerformanceMetrics,
} from '@/types';
import { evaluatePerformance } from './evaluator';

// ─── Monte Carlo Permutation Testing ─────────────────────────

/**
 * Run Monte Carlo Permutation Test on a set of trades.
 * Shuffles the trade order `numSimulations` times and recalculates
 * the target metric for each permutation. If the original strategy's
 * metric value is above the confidence percentile, it's statistically
 * significant — the edge is real, not sequential luck.
 */
export function runMonteCarloPermutation(
    trades: Trade[],
    config: Partial<MonteCarloConfig> = {}
): MonteCarloResult {
    const cfg: MonteCarloConfig = { ...DEFAULT_MC_CONFIG, ...config };

    if (trades.length < 10) {
        return createInsignificantResult(0, cfg);
    }

    // Calculate original metric value
    const originalMetrics = evaluatePerformance(trades);
    const originalValue = extractMetric(originalMetrics, cfg.metricToTest);

    // Run permutation simulations
    const simulatedValues: number[] = [];
    for (let sim = 0; sim < cfg.numSimulations; sim++) {
        const shuffledTrades = fisherYatesShuffle([...trades]);
        const simMetrics = evaluatePerformance(shuffledTrades);
        const simValue = extractMetric(simMetrics, cfg.metricToTest);
        simulatedValues.push(simValue);
    }

    // Sort simulated values for percentile calculation
    simulatedValues.sort((a, b) => a - b);

    // Calculate statistics
    const mean = simulatedValues.reduce((s, v) => s + v, 0) / simulatedValues.length;
    const stdDev = calculateStdDev(simulatedValues, mean);

    // Calculate percentile rank of original value
    const countBelow = simulatedValues.filter(v => v < originalValue).length;
    const percentileRank = countBelow / simulatedValues.length;

    // p-value: probability of observing a value >= original by chance
    const pValue = 1 - percentileRank;

    // Significance: p-value must be below (1 - confidence level)
    const significanceThreshold = 1 - cfg.confidenceLevel;
    const isSignificant = pValue < significanceThreshold;

    return {
        originalMetricValue: Math.round(originalValue * 10000) / 10000,
        simulatedMean: Math.round(mean * 10000) / 10000,
        simulatedStdDev: Math.round(stdDev * 10000) / 10000,
        percentileRank: Math.round(percentileRank * 10000) / 10000,
        pValue: Math.round(pValue * 10000) / 10000,
        confidenceThreshold: cfg.confidenceLevel,
        isSignificant,
        distributionSample: simulatedValues.slice(0, 100).map(v => Math.round(v * 10000) / 10000),
    };
}

/**
 * Run Equity Curve Randomization test.
 * Instead of shuffling trade order, randomly flip the sign of each trade's
 * P&L to test if the equity curve shape is statistically significant.
 * This tests whether the pattern of wins/losses matters, not just the average.
 */
export function runEquityCurveRandomization(
    trades: Trade[],
    config: Partial<MonteCarloConfig> = {}
): MonteCarloResult {
    const cfg: MonteCarloConfig = { ...DEFAULT_MC_CONFIG, ...config };

    if (trades.length < 10) {
        return createInsignificantResult(0, cfg);
    }

    const originalMetrics = evaluatePerformance(trades);
    const originalValue = extractMetric(originalMetrics, cfg.metricToTest);

    const simulatedValues: number[] = [];
    for (let sim = 0; sim < cfg.numSimulations; sim++) {
        // Create trades with randomly flipped P&L signs
        const randomizedTrades = trades.map(trade => ({
            ...trade,
            pnlPercent: trade.pnlPercent !== null
                ? trade.pnlPercent * (Math.random() > 0.5 ? 1 : -1)
                : null,
            pnlUSD: trade.pnlUSD !== null
                ? trade.pnlUSD * (Math.random() > 0.5 ? 1 : -1)
                : null,
        }));

        const simMetrics = evaluatePerformance(randomizedTrades);
        const simValue = extractMetric(simMetrics, cfg.metricToTest);
        simulatedValues.push(simValue);
    }

    simulatedValues.sort((a, b) => a - b);

    const mean = simulatedValues.reduce((s, v) => s + v, 0) / simulatedValues.length;
    const stdDev = calculateStdDev(simulatedValues, mean);
    const countBelow = simulatedValues.filter(v => v < originalValue).length;
    const percentileRank = countBelow / simulatedValues.length;
    const pValue = 1 - percentileRank;
    const isSignificant = pValue < (1 - cfg.confidenceLevel);

    return {
        originalMetricValue: Math.round(originalValue * 10000) / 10000,
        simulatedMean: Math.round(mean * 10000) / 10000,
        simulatedStdDev: Math.round(stdDev * 10000) / 10000,
        percentileRank: Math.round(percentileRank * 10000) / 10000,
        pValue: Math.round(pValue * 10000) / 10000,
        confidenceThreshold: cfg.confidenceLevel,
        isSignificant,
        distributionSample: simulatedValues.slice(0, 100).map(v => Math.round(v * 10000) / 10000),
    };
}

/**
 * Calculate Deflated Sharpe Ratio (DSR) per López de Prado (2014).
 * Adjusts the Sharpe Ratio for the number of strategies tested,
 * accounting for selection bias (multiple testing problem).
 *
 * The more strategies you test, the higher the chance of finding
 * one that looks good by pure luck. DSR corrects for this.
 *
 * @param sharpe - Observed Sharpe Ratio of the strategy
 * @param totalStrategiesTested - Total number of strategies evaluated
 * @param tradeCount - Number of trades used to calculate the Sharpe
 * @param skewness - Skewness of returns distribution (0 = symmetric)
 * @param kurtosis - Excess kurtosis of returns (0 = normal distribution)
 */
export function calculateDeflatedSharpeRatio(
    sharpe: number,
    totalStrategiesTested: number,
    tradeCount: number,
    skewness: number = 0,
    kurtosis: number = 0
): number {
    if (totalStrategiesTested <= 1 || tradeCount < 5) {
        return sharpe;
    }

    // Expected maximum Sharpe Ratio from random strategies (Euler-Mascheroni correction)
    const eulerMascheroni = 0.5772156649;
    const logN = Math.log(totalStrategiesTested);
    const expectedMaxSharpe = Math.sqrt(2 * logN) - (Math.log(Math.PI) + eulerMascheroni) / (2 * Math.sqrt(2 * logN));

    // Standard error of the Sharpe Ratio
    // SE(SR) = sqrt((1 + 0.5*SR^2 - skewness*SR + ((kurtosis-1)/4)*SR^2) / (N-1))
    const sr2 = sharpe * sharpe;
    const numerator = 1 + 0.5 * sr2 - skewness * sharpe + ((kurtosis - 1) / 4) * sr2;
    const standardError = Math.sqrt(Math.max(0, numerator) / Math.max(1, tradeCount - 1));

    if (standardError <= 0) {
        return sharpe;
    }

    // Deflated Sharpe = (SR - E[max SR]) / SE(SR)
    // This gives a z-score: how many standard errors above the expected random max
    const deflatedSharpe = (sharpe - expectedMaxSharpe) / standardError;

    // Convert to a probability (normal CDF approximation)
    // A positive deflated Sharpe means the strategy is genuinely better than random
    return Math.round(deflatedSharpe * 10000) / 10000;
}

// ─── Private Helpers ─────────────────────────────────────────

/**
 * Fisher-Yates shuffle — O(n), unbiased.
 * Produces a uniformly random permutation.
 */
function fisherYatesShuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Extract the target metric value from performance metrics.
 */
function extractMetric(
    metrics: PerformanceMetrics,
    metricName: 'sharpeRatio' | 'profitFactor' | 'expectancy'
): number {
    switch (metricName) {
        case 'sharpeRatio':
            return metrics.sharpeRatio;
        case 'profitFactor':
            return metrics.profitFactor;
        case 'expectancy':
            return metrics.expectancy;
        default:
            return metrics.sharpeRatio;
    }
}

/**
 * Calculate standard deviation from values and pre-computed mean.
 */
function calculateStdDev(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((s, d) => s + d, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

/**
 * Create a default insignificant result for edge cases (insufficient data).
 */
function createInsignificantResult(originalValue: number, config: MonteCarloConfig): MonteCarloResult {
    return {
        originalMetricValue: originalValue,
        simulatedMean: 0,
        simulatedStdDev: 0,
        percentileRank: 0,
        pValue: 1,
        confidenceThreshold: config.confidenceLevel,
        isSignificant: false,
        distributionSample: [],
    };
}
