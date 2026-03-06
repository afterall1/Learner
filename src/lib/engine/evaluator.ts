// ============================================================
// Learner: Performance Evaluator — Multi-Metric Strategy Scoring
// ============================================================

import { Trade, PerformanceMetrics, TradeStatus, StrategyDNA } from '@/types';
import { calculateComplexityPenalty } from './overfitting-detector';

/**
 * Calculate comprehensive performance metrics from a set of completed trades.
 * Uses institutional-grade metrics: Sharpe, Sortino, Profit Factor, Expectancy.
 */
export function evaluatePerformance(trades: Trade[]): PerformanceMetrics {
    const closedTrades = trades.filter(t => t.status === TradeStatus.CLOSED && t.pnlPercent !== null);

    if (closedTrades.length === 0) {
        return createEmptyMetrics();
    }

    const wins = closedTrades.filter(t => (t.pnlPercent ?? 0) > 0);
    const losses = closedTrades.filter(t => (t.pnlPercent ?? 0) <= 0);

    const winPnls = wins.map(t => t.pnlPercent!);
    const lossPnls = losses.map(t => t.pnlPercent!);
    const allPnls = closedTrades.map(t => t.pnlPercent!);

    const totalPnlPercent = allPnls.reduce((sum, p) => sum + p, 0);
    const totalPnlUSD = closedTrades.reduce((sum, t) => sum + (t.pnlUSD ?? 0), 0);

    const avgWin = winPnls.length > 0 ? winPnls.reduce((s, p) => s + p, 0) / winPnls.length : 0;
    const avgLoss = lossPnls.length > 0 ? Math.abs(lossPnls.reduce((s, p) => s + p, 0) / lossPnls.length) : 0;

    const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;
    const lossRate = 1 - winRate;

    // Profit Factor = Gross Profits / Gross Losses
    const grossProfit = winPnls.reduce((s, p) => s + p, 0);
    const grossLoss = Math.abs(lossPnls.reduce((s, p) => s + p, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Sharpe Ratio = mean(returns) / std(returns) * sqrt(annualization)
    const meanReturn = totalPnlPercent / closedTrades.length;
    const stdReturn = calculateStdDev(allPnls);
    const sharpeRatio = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;

    // Sortino Ratio = mean(returns) / downside_std * sqrt(annualization)
    const downsideReturns = allPnls.filter(p => p < 0);
    const downsideStd = calculateStdDev(downsideReturns);
    const sortinoRatio = downsideStd > 0 ? (meanReturn / downsideStd) * Math.sqrt(252) : 0;

    // Max Drawdown
    const { maxDrawdown, maxDrawdownDuration } = calculateMaxDrawdown(closedTrades);

    // Expectancy = (AvgWin * WinRate) - (AvgLoss * LossRate)
    const expectancy = (avgWin * winRate) - (avgLoss * lossRate);

    // Average R:R
    const averageRR = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    // Consecutive streaks
    const { maxConsecutiveWins, maxConsecutiveLosses } = calculateStreaks(closedTrades);

    // Average hold time
    const holdTimes = closedTrades
        .filter(t => t.exitTime !== null)
        .map(t => (t.exitTime! - t.entryTime));
    const averageHoldTime = holdTimes.length > 0 ? holdTimes.reduce((s, t) => s + t, 0) / holdTimes.length : 0;

    return {
        totalTrades: closedTrades.length,
        winningTrades: wins.length,
        losingTrades: losses.length,
        winRate: Math.round(winRate * 10000) / 10000,
        profitFactor: Math.round(profitFactor * 100) / 100,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        sortinoRatio: Math.round(sortinoRatio * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
        maxDrawdownDuration,
        averageRR: Math.round(averageRR * 100) / 100,
        expectancy: Math.round(expectancy * 10000) / 10000,
        totalPnlPercent: Math.round(totalPnlPercent * 10000) / 10000,
        totalPnlUSD: Math.round(totalPnlUSD * 100) / 100,
        averageWinPercent: Math.round(avgWin * 10000) / 10000,
        averageLossPercent: Math.round(avgLoss * 10000) / 10000,
        largestWinPercent: winPnls.length > 0 ? Math.round(Math.max(...winPnls) * 10000) / 10000 : 0,
        largestLossPercent: lossPnls.length > 0 ? Math.round(Math.abs(Math.min(...lossPnls)) * 10000) / 10000 : 0,
        consecutiveWins: maxConsecutiveWins,
        consecutiveLosses: maxConsecutiveLosses,
        averageHoldTime,
    };
}

/**
 * Calculate a composite fitness score (0-100) from performance metrics.
 * This is the primary score used by the evolution engine to rank strategies.
 *
 * Optionally applies a complexity penalty (Occam's Razor) when a strategy
 * is provided — simpler strategies receive a bonus.
 */
export function calculateFitnessScore(
    metrics: PerformanceMetrics,
    strategy?: StrategyDNA
): number {
    if (metrics.totalTrades < 30) return 0; // Min 30 trades for statistical significance

    // Weighted components (must sum to 100)
    const weights = {
        profitFactor: 20,
        sharpeRatio: 20,
        winRate: 15,
        expectancy: 15,
        drawdown: 15,
        consistency: 10,
        riskReward: 5,
    };

    // Score each component (0-1 scale)
    const pfScore = Math.min(metrics.profitFactor / 3, 1); // PF of 3+ = perfect
    const sharpeScore = Math.min(Math.max(metrics.sharpeRatio, 0) / 3, 1); // Sharpe 3+ = perfect
    const winRateScore = metrics.winRate; // Already 0-1
    const expectancyScore = Math.min(Math.max(metrics.expectancy / 2, 0), 1); // Expectancy 2%+ = perfect
    const drawdownScore = 1 - Math.min(metrics.maxDrawdown / 0.15, 1); // <15% = good, inverted
    const consistencyScore = 1 - Math.min(metrics.consecutiveLosses / 10, 1); // <10 consecutive losses = good
    const rrScore = Math.min(metrics.averageRR / 3, 1); // R:R 3+ = perfect

    const compositeScore =
        pfScore * weights.profitFactor +
        sharpeScore * weights.sharpeRatio +
        winRateScore * weights.winRate +
        expectancyScore * weights.expectancy +
        drawdownScore * weights.drawdown +
        consistencyScore * weights.consistency +
        rrScore * weights.riskReward;

    // Apply complexity penalty if strategy is provided
    const complexityMultiplier = strategy ? calculateComplexityPenalty(strategy) : 1.0;

    return Math.round(Math.max(0, Math.min(100, compositeScore * complexityMultiplier)));
}

/**
 * Calculate Deflated Fitness Score that accounts for multiple testing bias.
 * When many strategies are tested, some will appear good by random chance.
 * This adjusts the fitness score downward based on how many strategies
 * have been evaluated across all generations.
 *
 * @param fitnessScore - Original fitness score (0-100)
 * @param totalStrategiesTested - Total strategies tested across all generations
 * @returns Deflated fitness score (0-100)
 */
export function calculateDeflatedFitness(
    fitnessScore: number,
    totalStrategiesTested: number
): number {
    if (totalStrategiesTested <= 10) {
        return fitnessScore; // No significant deflation for small sample sizes
    }

    // Logarithmic penalty: grows slowly as more strategies are tested
    // Testing 100 strategies → ~15% deflation
    // Testing 1000 strategies → ~23% deflation
    const deflationFactor = 1 - (Math.log10(totalStrategiesTested) * 0.1);
    const clampedFactor = Math.max(0.5, Math.min(1.0, deflationFactor));

    return Math.round(Math.max(0, Math.min(100, fitnessScore * clampedFactor)));
}

// ─── Helper Functions ────────────────────────────────────────

function createEmptyMetrics(): PerformanceMetrics {
    return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        maxDrawdownDuration: 0,
        averageRR: 0,
        expectancy: 0,
        totalPnlPercent: 0,
        totalPnlUSD: 0,
        averageWinPercent: 0,
        averageLossPercent: 0,
        largestWinPercent: 0,
        largestLossPercent: 0,
        consecutiveWins: 0,
        consecutiveLosses: 0,
        averageHoldTime: 0,
    };
}

function calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((s, d) => s + d, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function calculateMaxDrawdown(trades: Trade[]): { maxDrawdown: number; maxDrawdownDuration: number } {
    if (trades.length === 0) return { maxDrawdown: 0, maxDrawdownDuration: 0 };

    let peak = 0;
    let cumulative = 0;
    let maxDD = 0;
    let maxDDDuration = 0;
    let ddStartTime = trades[0].entryTime;
    let inDrawdown = false;

    for (const trade of trades) {
        cumulative += trade.pnlPercent ?? 0;

        if (cumulative > peak) {
            peak = cumulative;
            if (inDrawdown) {
                inDrawdown = false;
            }
        }

        const currentDD = peak > 0 ? (peak - cumulative) / peak : 0;

        if (currentDD > maxDD) {
            maxDD = currentDD;
            if (!inDrawdown) {
                ddStartTime = trade.entryTime;
                inDrawdown = true;
            }
            maxDDDuration = (trade.exitTime ?? trade.entryTime) - ddStartTime;
        }
    }

    return { maxDrawdown: maxDD, maxDrawdownDuration: maxDDDuration };
}

function calculateStreaks(trades: Trade[]): { maxConsecutiveWins: number; maxConsecutiveLosses: number } {
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWins = 0;
    let maxLosses = 0;

    for (const trade of trades) {
        if ((trade.pnlPercent ?? 0) > 0) {
            currentWinStreak++;
            currentLossStreak = 0;
            maxWins = Math.max(maxWins, currentWinStreak);
        } else {
            currentLossStreak++;
            currentWinStreak = 0;
            maxLosses = Math.max(maxLosses, currentLossStreak);
        }
    }

    return { maxConsecutiveWins: maxWins, maxConsecutiveLosses: maxLosses };
}
