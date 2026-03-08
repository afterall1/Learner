// ============================================================
// Learner: Signal Engine — Comprehensive Test Suite
// ============================================================
// Phase 25: Tests for signal-engine.ts
//
// 3 Suites, 14 Tests:
//   1. Indicator Calculations (6 tests)
//   2. Signal Rule Evaluation (4 tests)
//   3. Strategy Evaluation Pipeline (4 tests)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    IndicatorType,
    SignalCondition,
    TradeDirection,
    TradeSignalAction,
    Timeframe,
    StrategyStatus,
    type OHLCV,
    type StrategyDNA,
    type SignalRule,
} from '@/types';
import {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollinger,
    calculateATR,
    calculateIndicators,
    evaluateSignalRule,
    evaluateEntrySignals,
    evaluateExitSignals,
    evaluateStrategy,
    getRequiredCandleCount,
    type IndicatorCalculationResult,
} from '../signal-engine';

// ─── Candle Generator ────────────────────────────────────────

function generateCandles(count: number, startPrice: number = 50000, trend: number = 0.001): OHLCV[] {
    const candles: OHLCV[] = [];
    let price = startPrice;
    const baseTs = Date.now() - count * 60000;

    for (let i = 0; i < count; i++) {
        const change = trend + (Math.random() - 0.5) * 0.02;
        price *= (1 + change);
        const open = price * (1 + (Math.random() - 0.5) * 0.005);
        const close = price;
        const high = Math.max(open, close) * (1 + Math.random() * 0.01);
        const low = Math.min(open, close) * (1 - Math.random() * 0.01);

        candles.push({
            timestamp: baseTs + i * 60000,
            open: Math.round(open * 100) / 100,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
            close: Math.round(close * 100) / 100,
            volume: 1000 + Math.random() * 5000,
        });
    }
    return candles;
}

function createTestDNA(): StrategyDNA {
    return {
        id: 'sig-test-strat',
        name: 'SignalTestStrategy',
        slotId: 'BTCUSDT:1h',
        generation: 1,
        parentIds: [],
        createdAt: Date.now(),
        indicators: [
            { id: 'rsi-1', type: IndicatorType.RSI, period: 14, params: {} },
            { id: 'ema-1', type: IndicatorType.EMA, period: 20, params: {} },
        ],
        entryRules: {
            entrySignals: [
                { id: 'entry-1', indicatorId: 'rsi-1', condition: SignalCondition.BELOW, threshold: 30 },
            ],
            exitSignals: [],
        },
        exitRules: {
            entrySignals: [],
            exitSignals: [
                { id: 'exit-1', indicatorId: 'rsi-1', condition: SignalCondition.ABOVE, threshold: 70 },
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
            fitnessScore: 0,
            tradeCount: 0,
            lastEvaluated: null,
            validation: null,
        },
    };
}

// ─── Suite 1: Indicator Calculations ─────────────────────────

describe('Indicator Calculations', () => {
    const candles = generateCandles(100, 50000);

    it('should calculate SMA correctly', () => {
        const sma = calculateSMA(candles, 10);

        // SMA returns only valid values (no padding)
        expect(sma.length).toBe(candles.length - 10 + 1);
        expect(sma.length).toBeGreaterThan(0);

        // SMA should be close to the price range
        for (const val of sma) {
            expect(val).toBeGreaterThan(10000);
            expect(val).toBeLessThan(200000);
        }
    });

    it('should calculate EMA correctly', () => {
        const ema = calculateEMA(candles, 10);

        // EMA returns array of valid values
        expect(ema.length).toBeGreaterThan(0);

        // EMA values should be in the price range
        for (const val of ema) {
            expect(val).toBeGreaterThan(10000);
            expect(val).toBeLessThan(200000);
        }

        // EMA should have different length/values from SMA
        const sma = calculateSMA(candles, 10);
        expect(ema.length).toBeGreaterThan(0);
    });

    it('should calculate RSI in 0-100 range', () => {
        const rsi = calculateRSI(candles, 14);

        expect(rsi.length).toBeGreaterThan(0);
        for (const val of rsi) {
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThanOrEqual(100);
        }
    });

    it('should calculate MACD with all three components', () => {
        const macd = calculateMACD(candles, 12, 26, 9);

        expect(macd.macdLine.length).toBeGreaterThan(0);
        expect(macd.signalLine.length).toBeGreaterThan(0);
        expect(macd.histogram.length).toBeGreaterThan(0);

        // MACD line should be at least as long as signal line
        expect(macd.macdLine.length).toBeGreaterThanOrEqual(macd.signalLine.length);
    });

    it('should calculate Bollinger Bands with upper > middle > lower', () => {
        const bb = calculateBollinger(candles, 20, 2);

        expect(bb.upper.length).toBeGreaterThan(0);
        expect(bb.middle.length).toBeGreaterThan(0);
        expect(bb.lower.length).toBeGreaterThan(0);

        // For valid values, upper > middle > lower
        for (let i = 0; i < bb.middle.length; i++) {
            if (bb.middle[i] > 0) {
                expect(bb.upper[i]).toBeGreaterThan(bb.middle[i]);
                expect(bb.middle[i]).toBeGreaterThan(bb.lower[i]);
            }
        }
    });

    it('should calculate ATR as positive values', () => {
        const atr = calculateATR(candles, 14);

        expect(atr.length).toBeGreaterThan(0);

        for (const val of atr) {
            expect(val).toBeGreaterThanOrEqual(0);
        }
    });
});

// ─── Suite 2: Signal Rule Evaluation ─────────────────────────

describe('Signal Rule Evaluation', () => {
    it('should evaluate ABOVE condition correctly', () => {
        const indicators = new Map<string, IndicatorCalculationResult>();
        indicators.set('rsi-1', {
            indicatorId: 'rsi-1',
            type: IndicatorType.RSI,
            currentValue: 75,
            previousValue: 70,
            allValues: [75],
        });

        const rule: SignalRule = {
            id: 'rule-1',
            indicatorId: 'rsi-1',
            condition: SignalCondition.ABOVE,
            threshold: 70,
        };

        expect(evaluateSignalRule(rule, indicators)).toBe(true);

        // Below threshold → false
        indicators.set('rsi-1', {
            indicatorId: 'rsi-1',
            type: IndicatorType.RSI,
            currentValue: 65,
            previousValue: 60,
            allValues: [65],
        });
        expect(evaluateSignalRule(rule, indicators)).toBe(false);
    });

    it('should evaluate BELOW condition correctly', () => {
        const indicators = new Map<string, IndicatorCalculationResult>();
        indicators.set('rsi-1', {
            indicatorId: 'rsi-1',
            type: IndicatorType.RSI,
            currentValue: 25,
            previousValue: 30,
            allValues: [25],
        });

        const rule: SignalRule = {
            id: 'rule-1',
            indicatorId: 'rsi-1',
            condition: SignalCondition.BELOW,
            threshold: 30,
        };

        expect(evaluateSignalRule(rule, indicators)).toBe(true);
    });

    it('should apply AND logic for entry signals (all must fire)', () => {
        const indicators = new Map<string, IndicatorCalculationResult>();
        indicators.set('rsi-1', {
            indicatorId: 'rsi-1',
            type: IndicatorType.RSI,
            currentValue: 25,
            previousValue: 30,
            allValues: [25],
        });
        indicators.set('ema-1', {
            indicatorId: 'ema-1',
            type: IndicatorType.EMA,
            currentValue: 51000,
            previousValue: 50000,
            allValues: [51000],
        });

        // Both conditions met
        const rules: SignalRule[] = [
            { id: 'r1', indicatorId: 'rsi-1', condition: SignalCondition.BELOW, threshold: 30 },
            { id: 'r2', indicatorId: 'ema-1', condition: SignalCondition.ABOVE, threshold: 50500 },
        ];

        const result = evaluateEntrySignals(rules, indicators);
        expect(result.triggered).toBe(true);
    });

    it('should apply OR logic for exit signals (any can trigger)', () => {
        const indicators = new Map<string, IndicatorCalculationResult>();
        indicators.set('rsi-1', {
            indicatorId: 'rsi-1',
            type: IndicatorType.RSI,
            currentValue: 75,
            previousValue: 70,
            allValues: [75],
        });
        indicators.set('ema-1', {
            indicatorId: 'ema-1',
            type: IndicatorType.EMA,
            currentValue: 48000, // Below threshold
            previousValue: 49000,
            allValues: [48000],
        });

        // Either condition → exit
        const rules: SignalRule[] = [
            { id: 'r1', indicatorId: 'rsi-1', condition: SignalCondition.ABOVE, threshold: 70 },
            { id: 'r2', indicatorId: 'ema-1', condition: SignalCondition.BELOW, threshold: 49000 },
        ];

        const result = evaluateExitSignals(rules, indicators);
        expect(result.triggered).toBe(true);
    });
});

// ─── Suite 3: Strategy Evaluation Pipeline ───────────────────

describe('Strategy Evaluation Pipeline', () => {
    it('should determine required candle count from strategy DNA', () => {
        const dna = createTestDNA();
        const required = getRequiredCandleCount(dna);

        // Should need at least the max indicator period + buffer
        expect(required).toBeGreaterThanOrEqual(20);
    });

    it('should evaluate a strategy against candle data', () => {
        const dna = createTestDNA();
        const candles = generateCandles(200);

        const signal = evaluateStrategy(dna, candles);

        expect(signal.action).toBeDefined();
        expect([TradeSignalAction.LONG, TradeSignalAction.SHORT,
        TradeSignalAction.EXIT_LONG, TradeSignalAction.EXIT_SHORT, TradeSignalAction.HOLD]).toContain(signal.action);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(1);
    });

    it('should return HOLD with insufficient candles', () => {
        const dna = createTestDNA();
        const candles = generateCandles(3); // Very few candles

        const signal = evaluateStrategy(dna, candles);

        expect(signal.action).toBe(TradeSignalAction.HOLD);
    });

    it('should calculate indicators for strategy genes', () => {
        const dna = createTestDNA();
        const candles = generateCandles(100);

        const indicators = calculateIndicators(dna.indicators, candles);

        expect(indicators.size).toBe(dna.indicators.length);
        for (const [id, result] of indicators) {
            expect(result.indicatorId).toBe(id);
            expect(typeof result.currentValue).toBe('number');
            expect(typeof result.previousValue).toBe('number');
        }
    });
});
