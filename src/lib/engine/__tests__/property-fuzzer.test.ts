// ============================================================
// Learner: Property-Based Fuzzing Harness + Chaos Monkey
// ============================================================
// Phase 25 Radical Innovation: Metamorphic testing that discovers
// bugs unit tests cannot. Tests universal mathematical invariants,
// GA operator stability, and system resilience under extreme inputs.
//
// 7 Categories, 30 Tests:
//   1. GA Operator Invariants (6)
//   2. Signal Engine Monotonicity (4)
//   3. Evaluator Consistency (4)
//   4. WFA Symmetry (3)
//   5. Overfitting Monotonicity (3)
//   6. Migration Affinity Algebra (4)
//   7. Chaos Monkey Stress (6)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    TradeDirection,
    TradeStatus,
    IndicatorType,
    SignalCondition,
    Timeframe,
    StrategyStatus,
    MarketRegime,
    MicrostructureGeneType,
    PriceActionPatternType,
    type Trade,
    type StrategyDNA,
    type OHLCV,
    type WalkForwardResult,
    type MonteCarloResult,
} from '@/types';
import { createTradingSlot, type TradingSlot } from '@/types/trading-slot';

import {
    generateRandomMicrostructureGene,
    crossoverMicrostructureGene,
    mutateMicrostructureGene,
    calculateMicrostructureSignals,
} from '../microstructure-genes';
import {
    generateRandomPriceActionGene,
    crossoverPriceActionGene,
    mutatePriceActionGene,
    calculatePriceActionSignals,
} from '../price-action-genes';
import {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateBollinger,
    calculateATR,
    evaluateStrategy,
} from '../signal-engine';
import {
    evaluatePerformance,
    calculateFitnessScore,
    calculateNoveltyBonus,
    calculateDeflatedFitness,
} from '../evaluator';
import {
    calculateComplexityPenalty,
    calculateOverfittingScore,
} from '../overfitting-detector';
import {
    runWalkForwardAnalysis,
    calculateDegradation,
} from '../walk-forward';
import {
    calculateMigrationAffinity,
    adaptMigrant,
} from '../migration';

// ─── Random Generators ───────────────────────────────────────

function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random but structurally valid OHLCV candle.
 */
function randomCandle(basePrice: number = 50000, timestamp?: number): OHLCV {
    const open = basePrice * (1 + (Math.random() - 0.5) * 0.02);
    const close = basePrice * (1 + (Math.random() - 0.5) * 0.02);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    return {
        timestamp: timestamp || Date.now() - Math.random() * 86400000,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: Math.round(100 + Math.random() * 10000),
    };
}

/**
 * Generate extreme/corrupt candle data (Chaos Monkey input).
 */
function extremeCandle(scenario: 'zero' | 'negative_vol' | 'flat' | 'huge_spike'): OHLCV {
    const base: OHLCV = {
        timestamp: Date.now(),
        open: 50000,
        high: 50100,
        low: 49900,
        close: 50050,
        volume: 5000,
    };

    switch (scenario) {
        case 'zero':
            return { ...base, open: 0, high: 0, low: 0, close: 0 };
        case 'negative_vol':
            return { ...base, volume: -1000 };
        case 'flat':
            return { ...base, open: 50000, high: 50000, low: 50000, close: 50000 };
        case 'huge_spike':
            return { ...base, open: 50000, high: 500000, low: 5000, close: 50000, volume: 999999999 };
    }
}

/**
 * Generate N random candles with realistic price progression.
 */
function randomCandleSeries(count: number, startPrice: number = 50000): OHLCV[] {
    const candles: OHLCV[] = [];
    let price = startPrice;
    const baseTs = Date.now() - count * 60000;
    for (let i = 0; i < count; i++) {
        price *= (1 + (Math.random() - 0.5) * 0.02);
        candles.push(randomCandle(price, baseTs + i * 60000));
    }
    return candles;
}

/**
 * Generate a random but structurally valid trade.
 */
let fuzzTradeId = 0;
function randomTrade(pnlPercent?: number): Trade {
    fuzzTradeId++;
    const pnl = pnlPercent ?? (Math.random() - 0.4) * 10;
    return {
        id: `fuzz-trade-${fuzzTradeId}`,
        strategyId: 'fuzz-strat',
        strategyName: 'FuzzStrategy',
        slotId: 'BTCUSDT:1h',
        symbol: 'BTCUSDT',
        direction: Math.random() > 0.5 ? TradeDirection.LONG : TradeDirection.SHORT,
        status: TradeStatus.CLOSED,
        isPaperTrade: true,
        entryPrice: 50000,
        exitPrice: 50000 * (1 + pnl / 100),
        quantity: 0.01,
        leverage: 1,
        stopLoss: 49000,
        takeProfit: 52000,
        pnlPercent: Math.round(pnl * 100) / 100,
        pnlUSD: Math.round(pnl * 50) / 100,
        fees: 0.5,
        entryTime: Date.now() - fuzzTradeId * 3600000,
        exitTime: Date.now() - fuzzTradeId * 3600000 + 1800000,
        entryReason: 'Fuzz entry',
        exitReason: 'Fuzz exit',
        indicators: { rsi: 50 },
    };
}

/**
 * Generate a random but structurally valid StrategyDNA.
 */
function randomStrategy(): StrategyDNA {
    const indicatorTypes = [IndicatorType.RSI, IndicatorType.EMA, IndicatorType.SMA, IndicatorType.MACD, IndicatorType.BOLLINGER];
    const numIndicators = randomInt(1, 5);
    const indicators = Array.from({ length: numIndicators }, (_, i) => ({
        id: `fuzz-ind-${i}`,
        type: indicatorTypes[i % indicatorTypes.length],
        period: randomInt(5, 50),
        params: {},
    }));

    return {
        id: `fuzz-strat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: 'FuzzStrategy',
        slotId: 'BTCUSDT:1h',
        generation: randomInt(0, 100),
        parentIds: [],
        createdAt: Date.now(),
        indicators,
        entryRules: {
            entrySignals: [{ id: 'fuzz-sig-1', indicatorId: indicators[0].id, condition: SignalCondition.BELOW, threshold: 30 }],
            exitSignals: [],
        },
        exitRules: {
            entrySignals: [],
            exitSignals: [{ id: 'fuzz-sig-2', indicatorId: indicators[0].id, condition: SignalCondition.ABOVE, threshold: 70 }],
        },
        preferredTimeframe: Timeframe.H1,
        preferredPairs: ['BTCUSDT'],
        riskGenes: {
            stopLossPercent: randomFloat(0.5, 5.0),
            takeProfitPercent: randomFloat(1.0, 15.0),
            positionSizePercent: randomFloat(0.5, 2.0),
            maxLeverage: randomInt(1, 10),
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

// ─── Category 1: GA Operator Invariants ──────────────────────

describe('Property: GA Operator Invariants', () => {
    it('should always produce valid microstructure genes after crossover (100 iterations)', () => {
        for (let i = 0; i < 100; i++) {
            const a = generateRandomMicrostructureGene();
            const b = generateRandomMicrostructureGene();
            const child = crossoverMicrostructureGene(a, b);

            expect(child.id).toBeTruthy();
            expect(child.id).not.toBe(a.id);
            expect(child.id).not.toBe(b.id);
            expect(child.type).toBeTruthy();
            expect(child.lookbackPeriod).toBeGreaterThan(0);
            expect(child.params).toBeDefined();
        }
    });

    it('should always produce valid microstructure genes after mutation (100 iterations)', () => {
        for (let i = 0; i < 100; i++) {
            const gene = generateRandomMicrostructureGene();
            const rate = Math.random(); // Random mutation rate 0-1
            const mutated = mutateMicrostructureGene(gene, rate);

            expect(mutated.id).not.toBe(gene.id);
            expect(mutated.type).toBeTruthy();
            expect(mutated.lookbackPeriod).toBeGreaterThanOrEqual(3);
            expect(mutated.lookbackPeriod).toBeLessThanOrEqual(50);
        }
    });

    it('should always produce valid price action genes after crossover (100 iterations)', () => {
        for (let i = 0; i < 100; i++) {
            const a = generateRandomPriceActionGene();
            const b = generateRandomPriceActionGene();
            const child = crossoverPriceActionGene(a, b);

            expect(child.id).toBeTruthy();
            expect(child.id).not.toBe(a.id);
            expect(child.id).not.toBe(b.id);
            expect(child.type).toBeTruthy();
            expect(child.params).toBeDefined();
        }
    });

    it('should always produce valid price action genes after mutation (100 iterations)', () => {
        for (let i = 0; i < 100; i++) {
            const gene = generateRandomPriceActionGene();
            const rate = Math.random();
            const mutated = mutatePriceActionGene(gene, rate);

            expect(mutated.id).not.toBe(gene.id);
            expect(mutated.type).toBeTruthy();
            expect(mutated.params).toBeDefined();
        }
    });

    it('should survive 1000-iteration crossover+mutation chain without crash (microstructure)', () => {
        let gene = generateRandomMicrostructureGene();
        for (let i = 0; i < 1000; i++) {
            const partner = generateRandomMicrostructureGene();
            gene = crossoverMicrostructureGene(gene, partner);
            gene = mutateMicrostructureGene(gene, Math.random());
        }
        // After 1000 iterations, must still be valid
        expect(gene.id).toBeTruthy();
        expect(gene.type).toBeTruthy();
        expect(gene.lookbackPeriod).toBeGreaterThan(0);
    });

    it('should survive 1000-iteration crossover+mutation chain without crash (price action)', () => {
        let gene = generateRandomPriceActionGene();
        for (let i = 0; i < 1000; i++) {
            const partner = generateRandomPriceActionGene();
            gene = crossoverPriceActionGene(gene, partner);
            gene = mutatePriceActionGene(gene, Math.random());
        }
        expect(gene.id).toBeTruthy();
        expect(gene.type).toBeTruthy();
        expect(gene.params).toBeDefined();
    });
});

// ─── Category 2: Signal Engine Monotonicity ──────────────────

describe('Property: Signal Engine Monotonicity', () => {
    const candles = randomCandleSeries(200);

    it('should produce SMA where longer period => lower variance', () => {
        const sma10 = calculateSMA(candles, 10);
        const sma50 = calculateSMA(candles, 50);

        // Calculate variance of each
        const variance = (arr: number[]) => {
            if (arr.length < 2) return 0;
            const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
            return arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
        };

        const var10 = variance(sma10);
        const var50 = variance(sma50);

        // Longer period = smoother = lower variance
        expect(var50).toBeLessThanOrEqual(var10);
    });

    it('should always keep RSI in [0, 100] for any random candle series (50 runs)', () => {
        for (let run = 0; run < 50; run++) {
            const randomCandles = randomCandleSeries(randomInt(20, 200));
            const rsi = calculateRSI(randomCandles, 14);

            for (const val of rsi) {
                expect(val).toBeGreaterThanOrEqual(0);
                expect(val).toBeLessThanOrEqual(100);
            }
        }
    });

    it('should always have Bollinger upper > middle > lower (50 runs)', () => {
        for (let run = 0; run < 50; run++) {
            const randomCandles = randomCandleSeries(randomInt(30, 200));
            const bb = calculateBollinger(randomCandles, 20, 2);

            for (let i = 0; i < bb.middle.length; i++) {
                if (bb.middle[i] > 0) {
                    expect(bb.upper[i]).toBeGreaterThanOrEqual(bb.middle[i]);
                    expect(bb.middle[i]).toBeGreaterThanOrEqual(bb.lower[i]);
                }
            }
        }
    });

    it('should always produce non-negative ATR (50 runs)', () => {
        for (let run = 0; run < 50; run++) {
            const randomCandles = randomCandleSeries(randomInt(20, 200));
            const atr = calculateATR(randomCandles, 14);

            for (const val of atr) {
                expect(val).toBeGreaterThanOrEqual(0);
            }
        }
    });
});

// ─── Category 3: Evaluator Consistency ───────────────────────

describe('Property: Evaluator Consistency', () => {
    it('should always score all-win > all-loss (50 runs)', () => {
        for (let run = 0; run < 50; run++) {
            const winTrades = Array.from({ length: 50 }, () => randomTrade(randomFloat(1, 10)));
            const lossTrades = Array.from({ length: 50 }, () => randomTrade(randomFloat(-10, -1)));

            const winMetrics = evaluatePerformance(winTrades);
            const lossMetrics = evaluatePerformance(lossTrades);

            const winFitness = calculateFitnessScore(winMetrics);
            const lossFitness = calculateFitnessScore(lossMetrics);

            expect(winFitness).toBeGreaterThan(lossFitness);
        }
    });

    it('should always return 0 fitness for empty trades', () => {
        const metrics = evaluatePerformance([]);
        const fitness = calculateFitnessScore(metrics);
        expect(fitness).toBe(0);
    });

    it('should always bound fitness within [0, 100] for any random trades (50 runs)', () => {
        for (let run = 0; run < 50; run++) {
            const trades = Array.from({ length: randomInt(30, 200) }, () => randomTrade());
            const metrics = evaluatePerformance(trades);
            const fitness = calculateFitnessScore(metrics);

            expect(fitness).toBeGreaterThanOrEqual(0);
            expect(fitness).toBeLessThanOrEqual(100);
        }
    });

    it('should always apply complexity penalty <= 1.0 for any random strategy (50 runs)', () => {
        for (let run = 0; run < 50; run++) {
            const strategy = randomStrategy();
            const penalty = calculateComplexityPenalty(strategy);

            expect(penalty).toBeGreaterThan(0);
            expect(penalty).toBeLessThanOrEqual(1.0);
        }
    });
});

// ─── Category 4: WFA Symmetry ────────────────────────────────

describe('Property: WFA Symmetry', () => {
    it('should produce identical results regardless of input trade order (determinism)', () => {
        const trades = Array.from({ length: 100 }, () => randomTrade());

        const result1 = runWalkForwardAnalysis(trades);
        const shuffled = [...trades].sort(() => Math.random() - 0.5);
        const result2 = runWalkForwardAnalysis(shuffled);

        // WFA internally sorts by entryTime, so results must be identical
        expect(result1.averageEfficiency).toBe(result2.averageEfficiency);
        expect(result1.passed).toBe(result2.passed);
    });

    it('should always return passed=false for < 20 trades (50 runs)', () => {
        for (let run = 0; run < 50; run++) {
            const trades = Array.from({ length: randomInt(1, 15) }, () => randomTrade());
            const result = runWalkForwardAnalysis(trades);
            expect(result.passed).toBe(false);
        }
    });

    it('should always clamp degradation to [0, 1] for any input pair', () => {
        const testPairs: [number, number][] = [
            [100, 50], [0, 100], [100, 0], [100, 100],
            [100, 200], [-50, -100], [0, 0], [1000000, 1],
        ];

        for (const [is, oos] of testPairs) {
            const deg = calculateDegradation(is, oos);
            expect(deg).toBeGreaterThanOrEqual(0);
            expect(deg).toBeLessThanOrEqual(1);
        }
    });
});

// ─── Category 5: Overfitting Monotonicity ────────────────────

describe('Property: Overfitting Monotonicity', () => {
    it('should score lower with passed WFA than without (monotonic)', () => {
        const strategy = randomStrategy();
        const trades = Array.from({ length: 50 }, () => randomTrade());

        const passedWFA: WalkForwardResult = {
            windows: [], averageEfficiency: 0.9, worstEfficiency: 0.7,
            averageDegradation: 0.1, passed: true, reason: 'PASSED',
        };

        const reportWith = calculateOverfittingScore(strategy, trades, passedWFA, null, []);
        const reportWithout = calculateOverfittingScore(strategy, trades, null, null, []);

        expect(reportWith.components.wfaEfficiency).toBeLessThanOrEqual(
            reportWithout.components.wfaEfficiency,
        );
    });

    it('should score lower with significant MC than without (monotonic)', () => {
        const strategy = randomStrategy();
        const trades = Array.from({ length: 50 }, () => randomTrade());

        const sigMC: MonteCarloResult = {
            originalMetricValue: 2.0, simulatedMean: 0.3, simulatedStdDev: 0.2,
            percentileRank: 0.99, pValue: 0.01, confidenceThreshold: 0.95,
            isSignificant: true, distributionSample: [],
        };

        const reportWith = calculateOverfittingScore(strategy, trades, null, sigMC, []);
        const reportWithout = calculateOverfittingScore(strategy, trades, null, null, []);

        expect(reportWith.components.monteCarloSignificance).toBeLessThanOrEqual(
            reportWithout.components.monteCarloSignificance,
        );
    });

    it('should always bound composite score to [0, 100] for any random input (50 runs)', () => {
        for (let run = 0; run < 50; run++) {
            const strategy = randomStrategy();
            const trades = Array.from({ length: randomInt(10, 100) }, () => randomTrade());
            const regimes = [MarketRegime.TRENDING_UP, MarketRegime.RANGING, MarketRegime.HIGH_VOLATILITY];
            const tradeRegimes = Array.from({ length: trades.length }, () => regimes[randomInt(0, 2)]);

            const report = calculateOverfittingScore(strategy, trades, null, null, tradeRegimes);

            expect(report.overallScore).toBeGreaterThanOrEqual(0);
            expect(report.overallScore).toBeLessThanOrEqual(100);
        }
    });
});

// ─── Category 6: Migration Affinity Algebra ──────────────────

describe('Property: Migration Affinity Algebra', () => {
    it('should be reflexive: affinity(A, A) = 1.0 for any slot', () => {
        const slots: TradingSlot[] = [
            createTradingSlot('BTCUSDT', Timeframe.H1),
            createTradingSlot('ETHUSDT', Timeframe.M15),
            createTradingSlot('SOLUSDT', Timeframe.D1),
        ];

        for (const slot of slots) {
            expect(calculateMigrationAffinity(slot, slot)).toBe(1.0);
        }
    });

    it('should be symmetric: affinity(A, B) = affinity(B, A) for any slot pair', () => {
        const allPairs = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];
        const allTFs = [Timeframe.M1, Timeframe.M5, Timeframe.M15, Timeframe.H1, Timeframe.H4, Timeframe.D1];

        for (let i = 0; i < 50; i++) {
            const a = createTradingSlot(allPairs[randomInt(0, 4)], allTFs[randomInt(0, 5)]);
            const b = createTradingSlot(allPairs[randomInt(0, 4)], allTFs[randomInt(0, 5)]);

            expect(calculateMigrationAffinity(a, b)).toBe(calculateMigrationAffinity(b, a));
        }
    });

    it('should always be in range [0.0, 1.0] for any slot pair (100 runs)', () => {
        const allPairs = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT'];
        const allTFs = [Timeframe.M1, Timeframe.M5, Timeframe.M15, Timeframe.H1, Timeframe.H4, Timeframe.D1];

        for (let i = 0; i < 100; i++) {
            const a = createTradingSlot(allPairs[randomInt(0, 5)], allTFs[randomInt(0, 5)]);
            const b = createTradingSlot(allPairs[randomInt(0, 5)], allTFs[randomInt(0, 5)]);
            const affinity = calculateMigrationAffinity(a, b);

            expect(affinity).toBeGreaterThanOrEqual(0.0);
            expect(affinity).toBeLessThanOrEqual(1.0);
        }
    });

    it('should always reset fitness to 0 after adaptMigrant', () => {
        for (let i = 0; i < 20; i++) {
            const strategy = randomStrategy();
            strategy.metadata.fitnessScore = randomFloat(0, 100);
            strategy.metadata.tradeCount = randomInt(0, 500);
            const target = createTradingSlot('ETHUSDT', Timeframe.M15);

            const adapted = adaptMigrant(strategy, target);

            expect(adapted.metadata.fitnessScore).toBe(0);
            expect(adapted.metadata.tradeCount).toBe(0);
            expect(adapted.id).not.toBe(strategy.id);
            expect(adapted.status).toBe(StrategyStatus.PAPER);
        }
    });
});

// ─── Category 7: Chaos Monkey — Extreme Input Stress ─────────

describe('Chaos Monkey: Extreme Input Resilience', () => {
    it('should not crash on zero-price candles', () => {
        const candles: OHLCV[] = [
            ...randomCandleSeries(50),
            extremeCandle('zero'),
            extremeCandle('zero'),
            ...randomCandleSeries(50),
        ];

        // Signal engine should not throw
        expect(() => calculateSMA(candles, 10)).not.toThrow();
        expect(() => calculateEMA(candles, 10)).not.toThrow();
        expect(() => calculateRSI(candles, 14)).not.toThrow();
        expect(() => calculateATR(candles, 14)).not.toThrow();
    });

    it('should not crash on negative volume candles', () => {
        const candles: OHLCV[] = [
            ...randomCandleSeries(50),
            extremeCandle('negative_vol'),
            ...randomCandleSeries(50),
        ];

        // Microstructure genes use volume — must not crash
        const genes = [generateRandomMicrostructureGene(MicrostructureGeneType.VOLUME_PROFILE)];
        expect(() => calculateMicrostructureSignals(genes, candles)).not.toThrow();
    });

    it('should not crash on all-flat price candles', () => {
        const flatCandles = Array.from({ length: 100 }, () => extremeCandle('flat'));
        // Add some timestamps to make them sequential
        flatCandles.forEach((c, i) => { c.timestamp = Date.now() - (100 - i) * 60000; });

        expect(() => calculateSMA(flatCandles, 10)).not.toThrow();
        expect(() => calculateRSI(flatCandles, 14)).not.toThrow();
        expect(() => calculateBollinger(flatCandles, 20, 2)).not.toThrow();
    });

    it('should not crash on huge price spikes (flash crash simulation)', () => {
        const candles: OHLCV[] = [
            ...randomCandleSeries(50),
            extremeCandle('huge_spike'),
            ...randomCandleSeries(50),
        ];

        expect(() => calculateSMA(candles, 10)).not.toThrow();
        expect(() => calculateRSI(candles, 14)).not.toThrow();
        expect(() => calculateATR(candles, 14)).not.toThrow();

        // Price action genes must handle extreme ranges
        const paGenes = [generateRandomPriceActionGene(PriceActionPatternType.CANDLESTICK_PATTERN)];
        expect(() => calculatePriceActionSignals(paGenes, candles)).not.toThrow();
    });

    it('should handle single-candle input gracefully', () => {
        const singleCandle = [randomCandle()];

        // These should return empty arrays, not crash
        const sma = calculateSMA(singleCandle, 10);
        expect(sma.length).toBe(0);

        const rsi = calculateRSI(singleCandle, 14);
        expect(rsi.length).toBeLessThanOrEqual(1);

        const atr = calculateATR(singleCandle, 14);
        expect(atr.length).toBeLessThanOrEqual(1);
    });

    it('should handle evaluateStrategy with minimal candles without crash', () => {
        const strategy = randomStrategy();
        const shortCandles = randomCandleSeries(3);

        // Should return HOLD, not crash
        expect(() => evaluateStrategy(strategy, shortCandles)).not.toThrow();
    });
});
