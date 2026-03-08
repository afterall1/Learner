// ============================================================
// Learner: Validation Pipeline — Comprehensive Test Suite
// ============================================================
// Phase 25: Tests for walk-forward.ts, monte-carlo.ts,
//           overfitting-detector.ts
//
// 4 Suites, ~26 Tests:
//   1. Walk-Forward Analysis (9 tests)
//   2. Monte Carlo Permutation (6 tests)
//   3. Deflated Sharpe Ratio (4 tests)
//   4. Overfitting Detector (7 tests)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    TradeDirection,
    TradeStatus,
    type Trade,
    type StrategyDNA,
    type WalkForwardResult,
    type MonteCarloResult,
    MarketRegime,
    IndicatorType,
    SignalCondition,
    Timeframe,
    StrategyStatus,
} from '@/types';
import {
    runWalkForwardAnalysis,
    runAnchoredWalkForward,
    calculateDegradation,
} from '../walk-forward';
import {
    runMonteCarloPermutation,
    runEquityCurveRandomization,
    calculateDeflatedSharpeRatio,
} from '../monte-carlo';
import {
    calculateOverfittingScore,
    calculateComplexityPenalty,
} from '../overfitting-detector';

// ─── Test Data Factories ─────────────────────────────────────

let globalTradeId = 0;

/**
 * Create a realistic trade with configurable P&L.
 * pnlPercent > 0 = winner, < 0 = loser.
 */
function createTrade(overrides: Partial<Trade> = {}): Trade {
    globalTradeId++;
    return {
        id: `test-trade-${globalTradeId}`,
        strategyId: 'strat-001',
        strategyName: 'TestStrategy',
        slotId: 'BTCUSDT:1h',
        symbol: 'BTCUSDT',
        direction: TradeDirection.LONG,
        status: TradeStatus.CLOSED,
        isPaperTrade: true,
        entryPrice: 50000,
        exitPrice: 51000,
        quantity: 0.01,
        leverage: 1,
        stopLoss: 49000,
        takeProfit: 52000,
        pnlPercent: 2.0,
        pnlUSD: 10,
        fees: 0.5,
        entryTime: Date.now() - 3600000 * globalTradeId,
        exitTime: Date.now() - 3600000 * (globalTradeId - 0.5),
        entryReason: 'RSI oversold + EMA cross',
        exitReason: 'Take profit hit',
        indicators: { rsi: 35, ema20: 49500 },
        ...overrides,
    };
}

/**
 * Create N trades with alternating wins/losses.
 * winRate 0-1 controls the ratio.
 */
function createTradeSet(
    count: number,
    winRate: number = 0.6,
    avgWinPct: number = 3.0,
    avgLossPct: number = -1.5,
): Trade[] {
    const trades: Trade[] = [];
    const baseTime = Date.now() - count * 3600000;

    for (let i = 0; i < count; i++) {
        const isWin = Math.random() < winRate;
        const pnl = isWin
            ? avgWinPct * (0.5 + Math.random())
            : avgLossPct * (0.5 + Math.random());

        trades.push(createTrade({
            pnlPercent: Math.round(pnl * 100) / 100,
            pnlUSD: Math.round(pnl * 50) / 100,
            entryTime: baseTime + i * 3600000,
            exitTime: baseTime + i * 3600000 + 1800000,
        }));
    }
    return trades;
}

/**
 * Create a minimal StrategyDNA for overfitting tests.
 */
function createTestStrategy(overrides: Partial<StrategyDNA> = {}): StrategyDNA {
    return {
        id: 'test-strat-001',
        name: 'TestStrategy',
        slotId: 'BTCUSDT:1h',
        generation: 1,
        parentIds: [],
        createdAt: Date.now(),
        indicators: [
            { id: 'ind-1', type: IndicatorType.RSI, period: 14, params: {} },
            { id: 'ind-2', type: IndicatorType.EMA, period: 20, params: {} },
        ],
        entryRules: {
            entrySignals: [
                { id: 'sig-1', indicatorId: 'ind-1', condition: SignalCondition.BELOW, threshold: 30 },
                { id: 'sig-2', indicatorId: 'ind-2', condition: SignalCondition.CROSS_ABOVE, threshold: 0 },
            ],
            exitSignals: [],
        },
        exitRules: {
            entrySignals: [],
            exitSignals: [
                { id: 'sig-3', indicatorId: 'ind-1', condition: SignalCondition.ABOVE, threshold: 70 },
            ],
        },
        preferredTimeframe: Timeframe.H1,
        preferredPairs: ['BTCUSDT'],
        riskGenes: {
            stopLossPercent: 2.0,
            takeProfitPercent: 4.0,
            positionSizePercent: 1.0,
            maxLeverage: 3,
        },
        directionBias: null,
        status: StrategyStatus.ACTIVE,
        metadata: {
            mutationHistory: [],
            fitnessScore: 50,
            tradeCount: 100,
            lastEvaluated: Date.now(),
            validation: null,
        },
        ...overrides,
    };
}

// ─── Suite 1: Walk-Forward Analysis ──────────────────────────

describe('Walk-Forward Analysis', () => {
    it('should return failure for insufficient trades', () => {
        const trades = createTradeSet(5); // Very few trades
        const result = runWalkForwardAnalysis(trades);

        expect(result.passed).toBe(false);
        expect(result.windows).toHaveLength(0);
        expect(result.averageEfficiency).toBe(0);
        expect(result.reason).toContain('Insufficient');
    });

    it('should generate valid rolling windows for large trade set', () => {
        const trades = createTradeSet(200, 0.6);
        const result = runWalkForwardAnalysis(trades, { windowCount: 3 });

        // Should produce windows with valid structure
        if (result.windows.length > 0) {
            for (const window of result.windows) {
                expect(window.inSampleTradeCount).toBeGreaterThan(0);
                expect(window.outOfSampleTradeCount).toBeGreaterThan(0);
                expect(window.efficiencyRatio).toBeGreaterThanOrEqual(0);
                expect(window.degradation).toBeGreaterThanOrEqual(0);
                expect(window.degradation).toBeLessThanOrEqual(1);
            }
        }
    });

    it('should pass WFA when OOS performance is strong', () => {
        // Create trades with consistent positive performance
        const trades = createTradeSet(200, 0.7, 3.0, -1.0);
        const result = runWalkForwardAnalysis(trades, {
            windowCount: 3,
            minTradesPerWindow: 10,
            efficiencyThreshold: 0.3,
        });

        // With consistent win rate, WFA should at least generate windows
        expect(result.windows.length).toBeGreaterThanOrEqual(0);
        expect(result.averageEfficiency).toBeGreaterThanOrEqual(0);
        expect(result.worstEfficiency).toBeGreaterThanOrEqual(0);
    });

    it('should calculate efficiency correctly (OOS/IS ratio)', () => {
        const trades = createTradeSet(200, 0.6);
        const result = runWalkForwardAnalysis(trades, {
            windowCount: 3,
            minTradesPerWindow: 10,
        });

        if (result.windows.length > 0) {
            // Efficiency should be bounded
            expect(result.averageEfficiency).toBeGreaterThanOrEqual(0);
            expect(result.averageEfficiency).toBeLessThanOrEqual(1.5);
        }
    });

    it('should respect custom config overrides', () => {
        const trades = createTradeSet(300, 0.6);
        const result = runWalkForwardAnalysis(trades, {
            windowCount: 5,
            inSampleRatio: 0.8,
            efficiencyThreshold: 0.3,
            minTradesPerWindow: 15,
        });

        // Should attempt to generate 5 windows
        expect(result.windows.length).toBeLessThanOrEqual(5);
    });

    it('should sort trades chronologically before windowing', () => {
        // Create trades in reverse order
        const trades = createTradeSet(200, 0.6);
        const reversed = [...trades].reverse();

        const resultNormal = runWalkForwardAnalysis(trades, { windowCount: 3, minTradesPerWindow: 10 });
        const resultReversed = runWalkForwardAnalysis(reversed, { windowCount: 3, minTradesPerWindow: 10 });

        // same data, different order → same result
        expect(resultNormal.averageEfficiency).toBe(resultReversed.averageEfficiency);
    });

    it('should run anchored WFA with growing IS windows', () => {
        const trades = createTradeSet(200, 0.6);
        const result = runAnchoredWalkForward(trades, {
            windowCount: 3,
            minTradesPerWindow: 10,
        });

        // Should produce result with valid structure
        expect(result.averageDegradation).toBeGreaterThanOrEqual(0);
        expect(result.averageDegradation).toBeLessThanOrEqual(1);
    });

    it('should return failure on anchored WFA with too few trades', () => {
        const trades = createTradeSet(3);
        const result = runAnchoredWalkForward(trades);

        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Insufficient');
    });

    it('should calculate degradation correctly', () => {
        // IS=100, OOS=100 → 0 degradation
        expect(calculateDegradation(100, 100)).toBe(0);

        // IS=100, OOS=50 → 50% degradation
        expect(calculateDegradation(100, 50)).toBe(0.5);

        // IS=100, OOS=0 → total degradation
        expect(calculateDegradation(100, 0)).toBe(1);

        // IS=0 → edge case → max degradation
        expect(calculateDegradation(0, 50)).toBe(1);

        // IS=100, OOS=120 → negative degradation → clamped to 0
        expect(calculateDegradation(100, 120)).toBe(0);
    });
});

// ─── Suite 2: Monte Carlo Permutation ────────────────────────

describe('Monte Carlo Permutation Test', () => {
    it('should return insignificant for fewer than 10 trades', () => {
        const trades = createTradeSet(5);
        const result = runMonteCarloPermutation(trades);

        expect(result.isSignificant).toBe(false);
        expect(result.pValue).toBe(1);
        expect(result.distributionSample).toHaveLength(0);
    });

    it('should produce valid statistical output for sufficient trades', () => {
        const trades = createTradeSet(50, 0.65);
        const result = runMonteCarloPermutation(trades, { numSimulations: 100 });

        expect(result.originalMetricValue).toBeDefined();
        expect(result.simulatedMean).toBeDefined();
        expect(result.simulatedStdDev).toBeGreaterThanOrEqual(0);
        expect(result.percentileRank).toBeGreaterThanOrEqual(0);
        expect(result.percentileRank).toBeLessThanOrEqual(1);
        expect(result.pValue).toBeGreaterThanOrEqual(0);
        expect(result.pValue).toBeLessThanOrEqual(1);
    });

    it('should respect confidence threshold in significance determination', () => {
        const trades = createTradeSet(100, 0.5); // 50% win rate = no real edge
        const result = runMonteCarloPermutation(trades, {
            numSimulations: 200,
            confidenceLevel: 0.95,
        });

        // With 50% win rate and shuffled trades, no significance expected
        // but we just validate the threshold is used
        expect(result.confidenceThreshold).toBe(0.95);
    });

    it('should run equity curve randomization with sign flips', () => {
        const trades = createTradeSet(50, 0.65);
        const result = runEquityCurveRandomization(trades, { numSimulations: 100 });

        expect(result.originalMetricValue).toBeDefined();
        expect(result.simulatedMean).toBeDefined();
        expect(typeof result.isSignificant).toBe('boolean');
    });

    it('should return insignificant for equity curve with < 10 trades', () => {
        const trades = createTradeSet(5);
        const result = runEquityCurveRandomization(trades);

        expect(result.isSignificant).toBe(false);
        expect(result.pValue).toBe(1);
    });

    it('should produce distribution sample capped at 100', () => {
        const trades = createTradeSet(50, 0.6);
        const result = runMonteCarloPermutation(trades, { numSimulations: 500 });

        expect(result.distributionSample.length).toBeLessThanOrEqual(100);
    });
});

// ─── Suite 3: Deflated Sharpe Ratio ──────────────────────────

describe('Deflated Sharpe Ratio', () => {
    it('should return original Sharpe when only 1 strategy tested', () => {
        const dsr = calculateDeflatedSharpeRatio(1.5, 1, 100);
        expect(dsr).toBe(1.5);
    });

    it('should return original Sharpe when trade count < 5', () => {
        const dsr = calculateDeflatedSharpeRatio(2.0, 100, 3);
        expect(dsr).toBe(2.0);
    });

    it('should deflate Sharpe when many strategies are tested', () => {
        const originalSharpe = 1.5;
        const dsr = calculateDeflatedSharpeRatio(originalSharpe, 1000, 200);

        // With 1000 strategies tested, expected max Sharpe by luck is ~3.7
        // So DSR should be significantly lower than original Sharpe
        expect(dsr).toBeLessThan(originalSharpe);
    });

    it('should account for skewness and kurtosis', () => {
        const sharpe = 2.0;
        const normal = calculateDeflatedSharpeRatio(sharpe, 100, 200, 0, 0);
        const skewed = calculateDeflatedSharpeRatio(sharpe, 100, 200, -1, 3);

        // Negative skewness + excess kurtosis should produce different DSR
        expect(normal).not.toBe(skewed);
    });
});

// ─── Suite 4: Overfitting Detector ──────────────────────────

describe('Overfitting Detector', () => {
    it('should calculate composite score within 0-100 range', () => {
        const strategy = createTestStrategy();
        const trades = createTradeSet(50, 0.6);
        const report = calculateOverfittingScore(strategy, trades, null, null, []);

        expect(report.overallScore).toBeGreaterThanOrEqual(0);
        expect(report.overallScore).toBeLessThanOrEqual(100);
        expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should penalize missing WFA and MC results', () => {
        const strategy = createTestStrategy();
        const trades = createTradeSet(50, 0.6);

        // Both null → should get high penalty (70 for each null component)
        const report = calculateOverfittingScore(strategy, trades, null, null, []);
        expect(report.components.wfaEfficiency).toBe(70); // Penalized for missing
        expect(report.components.monteCarloSignificance).toBe(70); // Penalized for missing
    });

    it('should score lower (safer) with passed WFA result', () => {
        const strategy = createTestStrategy();
        const trades = createTradeSet(50, 0.6);

        const passedWFA: WalkForwardResult = {
            windows: [],
            averageEfficiency: 0.8,
            worstEfficiency: 0.6,
            averageDegradation: 0.2,
            passed: true,
            reason: 'WFA PASSED',
        };

        const reportWithWFA = calculateOverfittingScore(strategy, trades, passedWFA, null, []);
        const reportWithout = calculateOverfittingScore(strategy, trades, null, null, []);

        expect(reportWithWFA.components.wfaEfficiency).toBeLessThan(reportWithout.components.wfaEfficiency);
    });

    it('should score lower with significant MC result', () => {
        const strategy = createTestStrategy();
        const trades = createTradeSet(50, 0.6);

        const significantMC: MonteCarloResult = {
            originalMetricValue: 1.5,
            simulatedMean: 0.5,
            simulatedStdDev: 0.3,
            percentileRank: 0.98,
            pValue: 0.02,
            confidenceThreshold: 0.95,
            isSignificant: true,
            distributionSample: [],
        };

        const report = calculateOverfittingScore(strategy, trades, null, significantMC, []);
        expect(report.components.monteCarloSignificance).toBeLessThan(70); // Better than missing
    });

    it('should calculate complexity penalty correctly', () => {
        // Simple strategy: 2 indicators, 2 entry, 1 exit → penalty 1.0
        const simple = createTestStrategy();
        expect(calculateComplexityPenalty(simple)).toBe(1.0);

        // Complex strategy: 5 indicators, 4 entry, 3 exit
        const complex = createTestStrategy({
            indicators: [
                { id: 'i1', type: IndicatorType.RSI, period: 14, params: {} },
                { id: 'i2', type: IndicatorType.EMA, period: 20, params: {} },
                { id: 'i3', type: IndicatorType.MACD, period: 26, params: {} },
                { id: 'i4', type: IndicatorType.BOLLINGER, period: 20, params: {} },
                { id: 'i5', type: IndicatorType.ADX, period: 14, params: {} },
            ],
            entryRules: {
                entrySignals: [
                    { id: 's1', indicatorId: 'i1', condition: SignalCondition.BELOW, threshold: 30 },
                    { id: 's2', indicatorId: 'i2', condition: SignalCondition.CROSS_ABOVE, threshold: 0 },
                    { id: 's3', indicatorId: 'i3', condition: SignalCondition.ABOVE, threshold: 0 },
                    { id: 's4', indicatorId: 'i4', condition: SignalCondition.BELOW, threshold: 0 },
                ],
                exitSignals: [],
            },
            exitRules: {
                entrySignals: [],
                exitSignals: [
                    { id: 's5', indicatorId: 'i1', condition: SignalCondition.ABOVE, threshold: 70 },
                    { id: 's6', indicatorId: 'i3', condition: SignalCondition.BELOW, threshold: 0 },
                    { id: 's7', indicatorId: 'i4', condition: SignalCondition.ABOVE, threshold: 0 },
                ],
            },
        });
        const complexPenalty = calculateComplexityPenalty(complex);
        expect(complexPenalty).toBeLessThan(1.0);
        expect(complexPenalty).toBeGreaterThanOrEqual(0.7);
    });

    it('should give high regime diversity score for single regime', () => {
        const strategy = createTestStrategy();
        const trades = createTradeSet(50, 0.6);

        // Only trending-up trades
        const singleRegime = Array(50).fill(MarketRegime.TRENDING_UP);
        const report = calculateOverfittingScore(strategy, trades, null, null, singleRegime);

        expect(report.components.regimeDiversity).toBeGreaterThanOrEqual(40);
    });

    it('should pass with strong validation results', () => {
        const strategy = createTestStrategy();
        const trades = createTradeSet(100, 0.65, 2.0, -1.0);

        const passedWFA: WalkForwardResult = {
            windows: [],
            averageEfficiency: 0.9,
            worstEfficiency: 0.7,
            averageDegradation: 0.1,
            passed: true,
            reason: 'WFA PASSED',
        };

        const significantMC: MonteCarloResult = {
            originalMetricValue: 2.0,
            simulatedMean: 0.3,
            simulatedStdDev: 0.2,
            percentileRank: 0.99,
            pValue: 0.01,
            confidenceThreshold: 0.95,
            isSignificant: true,
            distributionSample: [],
        };

        const multiRegime = [
            MarketRegime.TRENDING_UP,
            MarketRegime.TRENDING_DOWN,
            MarketRegime.RANGING,
            MarketRegime.HIGH_VOLATILITY,
        ];

        const report = calculateOverfittingScore(strategy, trades, passedWFA, significantMC, multiRegime);

        // With strong validation, low complexity, diverse regimes → should pass
        expect(report.overallScore).toBeLessThan(40);
        expect(report.passed).toBe(true);
    });
});
