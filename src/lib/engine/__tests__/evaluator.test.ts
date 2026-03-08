// ============================================================
// Learner: Evaluator — Comprehensive Test Suite
// ============================================================
// Phase 25: Tests for evaluator.ts (performance metrics + fitness)
//
// 2 Suites, 10 Tests:
//   1. evaluatePerformance (5 tests)
//   2. calculateFitnessScore + helpers (5 tests)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    TradeDirection,
    TradeStatus,
    IndicatorType,
    SignalCondition,
    Timeframe,
    StrategyStatus,
    type Trade,
    type StrategyDNA,
} from '@/types';
import {
    evaluatePerformance,
    calculateFitnessScore,
    calculateNoveltyBonus,
    calculateDeflatedFitness,
} from '../evaluator';

// ─── Trade Factory ───────────────────────────────────────────

let tradeId = 0;

function createTrade(pnlPercent: number, pnlUSD: number, entryTime?: number): Trade {
    tradeId++;
    return {
        id: `eval-trade-${tradeId}`,
        strategyId: 'strat-eval',
        strategyName: 'EvalTest',
        slotId: 'BTCUSDT:1h',
        symbol: 'BTCUSDT',
        direction: TradeDirection.LONG,
        status: TradeStatus.CLOSED,
        isPaperTrade: true,
        entryPrice: 50000,
        exitPrice: pnlPercent > 0 ? 50000 * (1 + pnlPercent / 100) : 50000 * (1 + pnlPercent / 100),
        quantity: 0.01,
        leverage: 1,
        stopLoss: 49000,
        takeProfit: 52000,
        pnlPercent,
        pnlUSD,
        fees: 0.5,
        entryTime: entryTime || Date.now() - tradeId * 3600000,
        exitTime: (entryTime || Date.now() - tradeId * 3600000) + 1800000,
        entryReason: 'Test entry',
        exitReason: 'Test exit',
        indicators: { rsi: 45 },
    };
}

function createTestStrategy(): StrategyDNA {
    return {
        id: 'strat-eval',
        name: 'EvalStrategy',
        slotId: 'BTCUSDT:1h',
        generation: 1,
        parentIds: [],
        createdAt: Date.now(),
        indicators: [
            { id: 'ind-1', type: IndicatorType.RSI, period: 14, params: {} },
        ],
        entryRules: {
            entrySignals: [{ id: 'sig-1', indicatorId: 'ind-1', condition: SignalCondition.BELOW, threshold: 30 }],
            exitSignals: [],
        },
        exitRules: {
            entrySignals: [],
            exitSignals: [{ id: 'sig-2', indicatorId: 'ind-1', condition: SignalCondition.ABOVE, threshold: 70 }],
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
            fitnessScore: 0,
            tradeCount: 0,
            lastEvaluated: null,
            validation: null,
        },
    };
}

// ─── Suite 1: evaluatePerformance ────────────────────────────

describe('evaluatePerformance', () => {
    it('should calculate metrics for a winning trade set', () => {
        const trades = [
            createTrade(3.0, 30),
            createTrade(2.0, 20),
            createTrade(-1.0, -10),
            createTrade(4.0, 40),
            createTrade(-0.5, -5),
            createTrade(1.5, 15),
        ];

        const metrics = evaluatePerformance(trades);

        expect(metrics.totalTrades).toBe(6);
        expect(metrics.winRate).toBeGreaterThan(0.5);
        expect(metrics.profitFactor).toBeGreaterThan(1.0);
        expect(metrics.expectancy).toBeGreaterThan(0);
    });

    it('should calculate metrics for all-losing trades', () => {
        const trades = [
            createTrade(-2.0, -20),
            createTrade(-1.5, -15),
            createTrade(-3.0, -30),
        ];

        const metrics = evaluatePerformance(trades);

        expect(metrics.winRate).toBe(0);
        expect(metrics.profitFactor).toBe(0);
        expect(metrics.expectancy).toBeLessThan(0);
    });

    it('should return empty metrics for empty trade list', () => {
        const metrics = evaluatePerformance([]);

        expect(metrics.totalTrades).toBe(0);
        expect(metrics.winRate).toBe(0);
        expect(metrics.sharpeRatio).toBe(0);
    });

    it('should calculate Sharpe ratio with known values', () => {
        // Consistent 2% return trades → stdDev = 0 → Sharpe = 0 (by convention)
        const consistentWins = Array.from({ length: 20 }, () => createTrade(2.0, 20));
        const metrics = evaluatePerformance(consistentWins);

        // With zero variance, Sharpe = 0 (division guard)
        expect(metrics.sharpeRatio).toBe(0);
        expect(metrics.winRate).toBe(1.0);
    });

    it('should handle single trade', () => {
        const trades = [createTrade(5.0, 50)];
        const metrics = evaluatePerformance(trades);

        expect(metrics.totalTrades).toBe(1);
        expect(metrics.winRate).toBe(1.0);
    });
});

// ─── Suite 2: Fitness Score + Helpers ────────────────────────

describe('Fitness Score and Helpers', () => {
    it('should compute fitness in 0-100 range', () => {
        // Need 30+ trades for non-zero fitness
        const trades = Array.from({ length: 50 }, (_, i) =>
            createTrade(i % 3 === 0 ? -1.0 : 2.5, i % 3 === 0 ? -10 : 25),
        );
        const metrics = evaluatePerformance(trades);
        const fitness = calculateFitnessScore(metrics);

        expect(fitness).toBeGreaterThanOrEqual(0);
        expect(fitness).toBeLessThanOrEqual(100);
    });

    it('should give higher fitness for better metrics', () => {
        const goodTrades = Array.from({ length: 30 }, () => createTrade(3.0, 30));
        const badTrades = Array.from({ length: 30 }, () => createTrade(-1.0, -10));

        const goodMetrics = evaluatePerformance(goodTrades);
        const badMetrics = evaluatePerformance(badTrades);

        const goodFitness = calculateFitnessScore(goodMetrics);
        const badFitness = calculateFitnessScore(badMetrics);

        expect(goodFitness).toBeGreaterThan(badFitness);
    });

    it('should apply novelty bonus for advanced genes', () => {
        const simpleStrategy = createTestStrategy();
        const advancedStrategy = createTestStrategy();
        advancedStrategy.microstructureGenes = [
            { id: 'mg-1', type: 'VOLUME_PROFILE' as any, lookbackPeriod: 20, params: {} },
        ];
        advancedStrategy.priceActionGenes = [
            { id: 'pg-1', type: 'CANDLESTICK_PATTERN' as any, params: { formation: 'ENGULFING' as any } },
        ];

        const simpleBonus = calculateNoveltyBonus(simpleStrategy);
        const advancedBonus = calculateNoveltyBonus(advancedStrategy);

        expect(advancedBonus).toBeGreaterThan(simpleBonus);
    });

    it('should deflate fitness when many strategies tested', () => {
        const baseFitness = 60;
        const few = calculateDeflatedFitness(baseFitness, 10);
        const many = calculateDeflatedFitness(baseFitness, 10000);

        // More strategies tested → more deflation
        expect(many).toBeLessThan(few);
    });

    it('should calculate max drawdown and streaks via evaluatePerformance', () => {
        const trades = [
            createTrade(2.0, 20),
            createTrade(3.0, 30),
            createTrade(-4.0, -40),
            createTrade(-2.0, -20),
            createTrade(-1.0, -10),
            createTrade(5.0, 50),
        ];

        const metrics = evaluatePerformance(trades);
        expect(metrics.maxDrawdown).toBeGreaterThan(0);
        expect(metrics.consecutiveWins).toBe(2); // First 2 wins
        expect(metrics.consecutiveLosses).toBe(3); // 3 losses in a row
    });
});
