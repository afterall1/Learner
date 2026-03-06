// ============================================================
// Learner: Overfitting Detector — Composite Risk Scoring
// ============================================================
// Council Decision: Aggregate gatekeeper that combines WFA,
// Monte Carlo, complexity, regime diversity, and consistency
// into a single overfitting risk score (0-100).
// Score < 40 = safe. Score ≥ 40 = overfitting risk.
// ============================================================

import {
    Trade,
    StrategyDNA,
    MarketRegime,
    OverfittingReport,
    WalkForwardResult,
    MonteCarloResult,
} from '@/types';
import { evaluatePerformance } from './evaluator';
import { calculateRegimeDiversity } from './regime-detector';

// ─── Component Weights ───────────────────────────────────────

const OVERFITTING_WEIGHTS = {
    wfaEfficiency: 0.30,           // Walk-Forward Analysis (30%)
    monteCarloSignificance: 0.25,  // Monte Carlo p-value (25%)
    complexityPenalty: 0.15,       // Strategy complexity (15%)
    regimeDiversity: 0.15,         // Market regime diversity (15%)
    returnConsistency: 0.15,       // Return consistency (15%)
} as const;

// ─── Public API ──────────────────────────────────────────────

/**
 * Calculate composite overfitting risk score for a strategy.
 * Aggregates multiple validation dimensions into a single 0-100 score.
 * 
 * Score interpretation:
 * - 0-20: Very safe, well-validated strategy
 * - 20-40: Acceptable risk, strategy can be promoted
 * - 40-60: Moderate overfitting risk, needs more validation
 * - 60-80: High overfitting risk, likely overfit
 * - 80-100: Clearly overfit, retire immediately
 *
 * PASS threshold: score < 40
 */
export function calculateOverfittingScore(
    strategy: StrategyDNA,
    trades: Trade[],
    wfaResult: WalkForwardResult | null,
    mcResult: MonteCarloResult | null,
    tradeRegimes: MarketRegime[]
): OverfittingReport {
    const recommendations: string[] = [];

    // Component 1: Walk-Forward Analysis Efficiency (0-100, lower = better)
    const wfaScore = calculateWFAComponent(wfaResult, recommendations);

    // Component 2: Monte Carlo Significance (0-100, lower = better)
    const mcScore = calculateMonteCarloComponent(mcResult, recommendations);

    // Component 3: Complexity Penalty (0-100, lower = better)
    const complexityScore = calculateComplexityComponent(strategy, recommendations);

    // Component 4: Regime Diversity (0-100, lower = better)
    const regimeScore = calculateRegimeDiversityComponent(tradeRegimes, recommendations);

    // Component 5: Return Consistency (0-100, lower = better)
    const consistencyScore = calculateConsistencyComponent(trades, recommendations);

    // Weighted aggregate score
    const overallScore = Math.round(
        wfaScore * OVERFITTING_WEIGHTS.wfaEfficiency +
        mcScore * OVERFITTING_WEIGHTS.monteCarloSignificance +
        complexityScore * OVERFITTING_WEIGHTS.complexityPenalty +
        regimeScore * OVERFITTING_WEIGHTS.regimeDiversity +
        consistencyScore * OVERFITTING_WEIGHTS.returnConsistency
    );

    const passed = overallScore < 40;

    if (passed) {
        recommendations.unshift('✅ Strategy passed overfitting detection');
    } else {
        recommendations.unshift('❌ Strategy shows overfitting risk — review recommended');
    }

    return {
        overallScore: Math.max(0, Math.min(100, overallScore)),
        components: {
            wfaEfficiency: Math.round(wfaScore),
            monteCarloSignificance: Math.round(mcScore),
            complexityPenalty: Math.round(complexityScore),
            regimeDiversity: Math.round(regimeScore),
            returnConsistency: Math.round(consistencyScore),
        },
        passed,
        recommendations,
    };
}

/**
 * Calculate the complexity penalty for a strategy.
 * Implements Occam's Razor: simpler strategies are less likely to be overfit.
 *
 * Returns a multiplier (0.7 to 1.0) that reduces the fitness score:
 * - 2 indicators, 2 entry rules, 1 exit rule = 1.0 (no penalty)
 * - Each additional indicator beyond 2 = -0.05
 * - Each additional entry rule beyond 2 = -0.03
 * - Each additional exit rule beyond 1 = -0.03
 */
export function calculateComplexityPenalty(strategy: StrategyDNA): number {
    let penalty = 0;

    // Indicator penalty: each beyond 2 costs 0.05
    const excessIndicators = Math.max(0, strategy.indicators.length - 2);
    penalty += excessIndicators * 0.05;

    // Entry rule penalty: each beyond 2 costs 0.03
    const excessEntryRules = Math.max(0, strategy.entryRules.entrySignals.length - 2);
    penalty += excessEntryRules * 0.03;

    // Exit rule penalty: each beyond 1 costs 0.03
    const excessExitRules = Math.max(0, strategy.exitRules.exitSignals.length - 1);
    penalty += excessExitRules * 0.03;

    // Clamp to max 30% penalty
    return Math.max(0.7, 1.0 - penalty);
}

// ─── Component Score Calculators ─────────────────────────────
// Each returns 0-100 where LOWER = SAFER (less overfitting risk)

/**
 * WFA Component: How much performance degrades out-of-sample.
 * 0 = excellent OOS performance (safe)
 * 100 = complete OOS failure (overfit)
 */
function calculateWFAComponent(
    wfaResult: WalkForwardResult | null,
    recommendations: string[]
): number {
    if (!wfaResult) {
        recommendations.push('⚠️ WFA not yet performed — cannot assess out-of-sample robustness');
        return 70; // Penalize missing validation
    }

    if (!wfaResult.passed) {
        recommendations.push(`❌ WFA failed: ${wfaResult.reason}`);
        return 85;
    }

    // Convert efficiency (0-1.5) to overfitting score (0-100)
    // Efficiency 1.0+ = score 0 (perfect)
    // Efficiency 0.5 = score 50 (borderline)
    // Efficiency 0.0 = score 100 (overfit)
    const efficiency = Math.max(0, Math.min(1.5, wfaResult.averageEfficiency));
    const score = Math.max(0, (1 - efficiency) * 100);

    if (score < 30) {
        recommendations.push(`✅ WFA efficiency ${(wfaResult.averageEfficiency * 100).toFixed(1)}% — robust OOS performance`);
    } else if (score < 50) {
        recommendations.push(`⚠️ WFA efficiency ${(wfaResult.averageEfficiency * 100).toFixed(1)}% — moderate OOS degradation`);
    } else {
        recommendations.push(`❌ WFA efficiency ${(wfaResult.averageEfficiency * 100).toFixed(1)}% — significant OOS degradation`);
    }

    return score;
}

/**
 * Monte Carlo Component: Is the strategy's edge statistically significant?
 * 0 = highly significant (safe)
 * 100 = not significant (likely random luck)
 */
function calculateMonteCarloComponent(
    mcResult: MonteCarloResult | null,
    recommendations: string[]
): number {
    if (!mcResult) {
        recommendations.push('⚠️ Monte Carlo test not yet performed — cannot assess statistical significance');
        return 70; // Penalize missing validation
    }

    if (mcResult.isSignificant) {
        // Significant: convert p-value to score
        // p-value 0.01 = score ~5 (very significant)
        // p-value 0.05 = score ~25 (borderline significant)
        const score = Math.min(100, mcResult.pValue * 500);
        recommendations.push(
            `✅ Monte Carlo: p-value ${mcResult.pValue.toFixed(4)} — edge is statistically significant at ${Math.round(mcResult.percentileRank * 100)}th percentile`
        );
        return score;
    }

    // Not significant
    const score = Math.min(100, 50 + mcResult.pValue * 100);
    recommendations.push(
        `❌ Monte Carlo: p-value ${mcResult.pValue.toFixed(4)} — edge is NOT statistically significant`
    );
    return score;
}

/**
 * Complexity Component: Is the strategy too complex?
 * Simpler strategies are less prone to overfitting.
 * 0 = simple (safe)
 * 100 = very complex (high overfitting risk)
 */
function calculateComplexityComponent(
    strategy: StrategyDNA,
    recommendations: string[]
): number {
    const penalty = calculateComplexityPenalty(strategy);

    // Convert penalty multiplier (0.7-1.0) to score (0-100)
    // Penalty 1.0 = score 0 (no penalty, simple strategy)
    // Penalty 0.7 = score 100 (max penalty, complex strategy)
    const score = Math.round((1 - penalty) / 0.3 * 100);

    const totalRules = strategy.indicators.length +
        strategy.entryRules.entrySignals.length +
        strategy.exitRules.exitSignals.length;

    if (score < 20) {
        recommendations.push(`✅ Strategy complexity: ${totalRules} total genes — simple and robust`);
    } else if (score < 50) {
        recommendations.push(`⚠️ Strategy complexity: ${totalRules} total genes — moderate complexity`);
    } else {
        recommendations.push(`❌ Strategy complexity: ${totalRules} total genes — high complexity increases overfitting risk`);
    }

    return score;
}

/**
 * Regime Diversity Component: Does the strategy work across market conditions?
 * 0 = diverse (safe)
 * 100 = single-regime (high overfitting risk)
 */
function calculateRegimeDiversityComponent(
    tradeRegimes: MarketRegime[],
    recommendations: string[]
): number {
    if (tradeRegimes.length === 0) {
        recommendations.push('⚠️ No regime data available — cannot assess market condition diversity');
        return 70;
    }

    const diversity = calculateRegimeDiversity(tradeRegimes);

    // Score based on unique regimes
    // 4+ regimes = 0 (very diverse)
    // 3 regimes = 20
    // 2 regimes = 40
    // 1 regime = 80
    let score: number;
    if (diversity.uniqueRegimes >= 4) {
        score = 0;
    } else if (diversity.uniqueRegimes === 3) {
        score = 20;
    } else if (diversity.uniqueRegimes === 2) {
        score = 40;
    } else {
        score = 80;
    }

    if (diversity.isDiverse) {
        recommendations.push(
            `✅ Regime diversity: ${diversity.uniqueRegimes} unique regimes — strategy works across market conditions`
        );
    } else {
        recommendations.push(
            `❌ Regime diversity: ${diversity.uniqueRegimes} unique regime — strategy may only work in specific market conditions`
        );
    }

    return score;
}

/**
 * Consistency Component: Are returns evenly distributed or erratic?
 * Low variance in per-trade returns = more consistent = less overfitting risk.
 * 0 = very consistent (safe)
 * 100 = highly erratic (high overfitting risk)
 */
function calculateConsistencyComponent(
    trades: Trade[],
    recommendations: string[]
): number {
    if (trades.length < 10) {
        recommendations.push('⚠️ Insufficient trades for consistency analysis');
        return 50;
    }

    const metrics = evaluatePerformance(trades);

    // Use Coefficient of Variation (CV) of returns
    const returns = trades
        .filter(t => t.pnlPercent !== null)
        .map(t => t.pnlPercent!);

    if (returns.length < 5) {
        return 50;
    }

    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    const cv = mean !== 0 ? Math.abs(stdDev / mean) : 10;

    // Consecutive losses also indicate inconsistency
    const consecutiveLossPenalty = Math.min(30, metrics.consecutiveLosses * 5);

    // CV of 1 = 30 score, CV of 3+ = 80+ score
    const cvScore = Math.min(70, cv * 25);
    const score = Math.min(100, cvScore + consecutiveLossPenalty);

    if (score < 30) {
        recommendations.push(`✅ Return consistency: CV=${cv.toFixed(2)} — stable, predictable returns`);
    } else if (score < 50) {
        recommendations.push(`⚠️ Return consistency: CV=${cv.toFixed(2)} — moderate variance in returns`);
    } else {
        recommendations.push(`❌ Return consistency: CV=${cv.toFixed(2)} — highly erratic returns suggest curve fitting`);
    }

    return score;
}
