// ============================================================
// Learner: Walk-Forward Analysis — Anti-Overfitting Validation
// ============================================================
// Council Decision: Dr. Pardo's gold standard — 70% IS / 30% OOS
// rolling windows. Efficiency ratio must be ≥ 0.5 to pass.
// ============================================================

import {
    Trade,
    WalkForwardConfig,
    WalkForwardResult,
    WalkForwardWindow,
    DEFAULT_WFA_CONFIG,
} from '@/types';
import { evaluatePerformance, calculateFitnessScore } from './evaluator';

// ─── Walk-Forward Analysis ───────────────────────────────────

/**
 * Run Walk-Forward Analysis on a set of trades.
 * Splits trades chronologically into rolling IS/OOS windows and measures
 * how much performance degrades on unseen data.
 *
 * A strategy that retains ≥50% of its in-sample performance on
 * out-of-sample data is considered robust (not overfitted).
 */
export function runWalkForwardAnalysis(
    trades: Trade[],
    config: Partial<WalkForwardConfig> = {}
): WalkForwardResult {
    const cfg: WalkForwardConfig = { ...DEFAULT_WFA_CONFIG, ...config };

    // Sort trades chronologically by entry time
    const sortedTrades = [...trades].sort((a, b) => a.entryTime - b.entryTime);

    // Validate minimum trade count
    const minTotalTrades = cfg.minTradesPerWindow * cfg.windowCount * 2;
    if (sortedTrades.length < minTotalTrades) {
        return {
            windows: [],
            averageEfficiency: 0,
            worstEfficiency: 0,
            averageDegradation: 1,
            passed: false,
            reason: `Insufficient trades: ${sortedTrades.length} < required ${minTotalTrades}`,
        };
    }

    const windows = generateRollingWindows(sortedTrades, cfg);

    if (windows.length === 0) {
        return {
            windows: [],
            averageEfficiency: 0,
            worstEfficiency: 0,
            averageDegradation: 1,
            passed: false,
            reason: 'Could not generate valid WFA windows',
        };
    }

    // Calculate aggregate metrics
    const efficiencies = windows.map(w => w.efficiencyRatio);
    const averageEfficiency = efficiencies.reduce((s, v) => s + v, 0) / efficiencies.length;
    const worstEfficiency = Math.min(...efficiencies);
    const averageDegradation = windows.reduce((s, w) => s + w.degradation, 0) / windows.length;

    // Pass criteria: average efficiency >= threshold
    const passed = averageEfficiency >= cfg.efficiencyThreshold;
    const reason = passed
        ? `WFA PASSED: Average efficiency ${(averageEfficiency * 100).toFixed(1)}% ≥ ${(cfg.efficiencyThreshold * 100).toFixed(1)}%`
        : `WFA FAILED: Average efficiency ${(averageEfficiency * 100).toFixed(1)}% < ${(cfg.efficiencyThreshold * 100).toFixed(1)}% threshold`;

    return {
        windows,
        averageEfficiency: Math.round(averageEfficiency * 10000) / 10000,
        worstEfficiency: Math.round(worstEfficiency * 10000) / 10000,
        averageDegradation: Math.round(averageDegradation * 10000) / 10000,
        passed,
        reason,
    };
}

/**
 * Run Anchored Walk-Forward Analysis.
 * Unlike rolling WFA, the in-sample window always starts from the first trade.
 * This gives progressively more IS data as windows advance, testing if
 * older data still contributes to prediction quality.
 */
export function runAnchoredWalkForward(
    trades: Trade[],
    config: Partial<WalkForwardConfig> = {}
): WalkForwardResult {
    const cfg: WalkForwardConfig = { ...DEFAULT_WFA_CONFIG, ...config };
    const sortedTrades = [...trades].sort((a, b) => a.entryTime - b.entryTime);

    const totalTrades = sortedTrades.length;
    if (totalTrades < cfg.minTradesPerWindow * 3) {
        return {
            windows: [],
            averageEfficiency: 0,
            worstEfficiency: 0,
            averageDegradation: 1,
            passed: false,
            reason: `Insufficient trades for anchored WFA: ${totalTrades}`,
        };
    }

    const windows: WalkForwardWindow[] = [];
    const oosSize = Math.max(cfg.minTradesPerWindow, Math.floor(totalTrades * (1 - cfg.inSampleRatio) / cfg.windowCount));

    for (let i = 0; i < cfg.windowCount; i++) {
        // Anchored: IS always starts from index 0
        const oosEnd = totalTrades - (cfg.windowCount - 1 - i) * oosSize;
        const oosStart = oosEnd - oosSize;
        const isEnd = oosStart;

        if (isEnd < cfg.minTradesPerWindow || oosStart < 0 || oosEnd > totalTrades) {
            continue;
        }

        const isTrades = sortedTrades.slice(0, isEnd);
        const oosTrades = sortedTrades.slice(oosStart, oosEnd);

        if (isTrades.length < cfg.minTradesPerWindow || oosTrades.length < cfg.minTradesPerWindow) {
            continue;
        }

        const window = evaluateWindow(i, isTrades, oosTrades);
        windows.push(window);
    }

    if (windows.length === 0) {
        return {
            windows: [],
            averageEfficiency: 0,
            worstEfficiency: 0,
            averageDegradation: 1,
            passed: false,
            reason: 'No valid anchored WFA windows generated',
        };
    }

    const efficiencies = windows.map(w => w.efficiencyRatio);
    const averageEfficiency = efficiencies.reduce((s, v) => s + v, 0) / efficiencies.length;
    const worstEfficiency = Math.min(...efficiencies);
    const averageDegradation = windows.reduce((s, w) => s + w.degradation, 0) / windows.length;

    const passed = averageEfficiency >= cfg.efficiencyThreshold;
    const reason = passed
        ? `Anchored WFA PASSED: Avg efficiency ${(averageEfficiency * 100).toFixed(1)}%`
        : `Anchored WFA FAILED: Avg efficiency ${(averageEfficiency * 100).toFixed(1)}% < threshold`;

    return {
        windows,
        averageEfficiency: Math.round(averageEfficiency * 10000) / 10000,
        worstEfficiency: Math.round(worstEfficiency * 10000) / 10000,
        averageDegradation: Math.round(averageDegradation * 10000) / 10000,
        passed,
        reason,
    };
}

/**
 * Calculate the performance degradation between in-sample and out-of-sample metrics.
 * Returns a value 0-1 where 0 = no degradation, 1 = total degradation.
 */
export function calculateDegradation(isFitness: number, oosFitness: number): number {
    if (isFitness <= 0) return 1;
    const degradation = 1 - (oosFitness / isFitness);
    return Math.max(0, Math.min(1, degradation));
}

// ─── Private Helpers ─────────────────────────────────────────

/**
 * Generate rolling WFA windows from sorted trades.
 */
function generateRollingWindows(
    sortedTrades: Trade[],
    config: WalkForwardConfig
): WalkForwardWindow[] {
    const windows: WalkForwardWindow[] = [];
    const totalTrades = sortedTrades.length;

    // Calculate window sizes
    const totalWindowSize = Math.floor(totalTrades / config.windowCount);
    const isSize = Math.floor(totalWindowSize * config.inSampleRatio);
    const oosSize = totalWindowSize - isSize;

    if (isSize < config.minTradesPerWindow || oosSize < config.minTradesPerWindow) {
        return [];
    }

    for (let i = 0; i < config.windowCount; i++) {
        const windowStart = i * totalWindowSize;
        const isStart = windowStart;
        const isEnd = windowStart + isSize;
        const oosStart = isEnd;
        const oosEnd = Math.min(windowStart + totalWindowSize, totalTrades);

        if (oosEnd > totalTrades) break;

        const isTrades = sortedTrades.slice(isStart, isEnd);
        const oosTrades = sortedTrades.slice(oosStart, oosEnd);

        if (isTrades.length < config.minTradesPerWindow || oosTrades.length < config.minTradesPerWindow) {
            continue;
        }

        const window = evaluateWindow(i, isTrades, oosTrades);
        windows.push(window);
    }

    return windows;
}

/**
 * Evaluate a single IS/OOS window pair.
 */
function evaluateWindow(
    windowIndex: number,
    isTrades: Trade[],
    oosTrades: Trade[]
): WalkForwardWindow {
    const isMetrics = evaluatePerformance(isTrades);
    const oosMetrics = evaluatePerformance(oosTrades);

    const isFitness = calculateFitnessScore(isMetrics);
    const oosFitness = calculateFitnessScore(oosMetrics);

    // Efficiency = OOS / IS ratio. Higher = less overfitting.
    // Cap at 1.5 to handle edge cases where OOS outperforms IS
    const efficiencyRatio = isFitness > 0
        ? Math.min(1.5, oosFitness / isFitness)
        : oosFitness > 0 ? 1.0 : 0;

    const degradation = calculateDegradation(isFitness, oosFitness);

    return {
        windowIndex,
        inSampleMetrics: isMetrics,
        outOfSampleMetrics: oosMetrics,
        inSampleTradeCount: isTrades.length,
        outOfSampleTradeCount: oosTrades.length,
        efficiencyRatio: Math.round(efficiencyRatio * 10000) / 10000,
        degradation: Math.round(degradation * 10000) / 10000,
    };
}
