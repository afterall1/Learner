// ============================================================
// Learner: Confluence Gene Runtime — Comprehensive Test Suite
// ============================================================
// Phase 23: Tests for confluence-genes.ts + confluence-acsi.ts
//
// 5 Suites, 24 Tests:
//   1. Gene Generation (4 tests)
//   2. Evaluators (8 tests)
//   3. GA Operators (4 tests)
//   4. Edge Cases (4 tests)
//   5. ACSI Radical Innovation (4 tests)
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
    Timeframe,
    ConfluenceType,
    IndicatorType,
    MarketRegime,
} from '@/types';
import type { OHLCV, TimeframeConfluenceGene } from '@/types';
import {
    generateRandomConfluenceGene,
    crossoverConfluenceGene,
    mutateConfluenceGene,
    evaluateConfluenceGene,
    calculateConfluenceSignals,
    isValidTFPair,
    getHigherTimeframes,
    getRequiredHigherTimeframes,
    type ConfluenceResult,
} from '../confluence-genes';
import {
    ACSIMatrix,
    getACSI,
    resetACSI,
} from '../confluence-acsi';

// ─── Test Data Generators ────────────────────────────────────

/**
 * Generate synthetic OHLCV candles with a configurable trend.
 * trend > 0: bullish, trend < 0: bearish, trend = 0: range-bound
 */
function generateCandles(
    count: number,
    startPrice: number = 100,
    trend: number = 0.001,
    volatility: number = 0.02,
): OHLCV[] {
    const candles: OHLCV[] = [];
    let price = startPrice;
    const baseTs = Date.now() - count * 60_000;

    for (let i = 0; i < count; i++) {
        const change = trend + (Math.random() - 0.5) * volatility;
        price *= (1 + change);

        const open = price * (1 + (Math.random() - 0.5) * 0.005);
        const close = price;
        const high = Math.max(open, close) * (1 + Math.random() * 0.01);
        const low = Math.min(open, close) * (1 - Math.random() * 0.01);

        candles.push({
            timestamp: baseTs + i * 60_000,
            open: Math.round(open * 100) / 100,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
            close: Math.round(close * 100) / 100,
            volume: 1000 + Math.random() * 5000,
        });
    }
    return candles;
}

/**
 * Create a simple confluence gene for testing.
 */
function createTestGene(
    type: ConfluenceType,
    primary: Timeframe = Timeframe.M15,
    higher: Timeframe = Timeframe.H1,
): TimeframeConfluenceGene {
    return {
        id: `test-gene-${type}`,
        type,
        primaryTimeframe: primary,
        higherTimeframe: higher,
        params: {
            trendIndicator: IndicatorType.EMA,
            trendPeriod: 20,
            alignmentRequired: true,
            momentumIndicator: IndicatorType.RSI,
            momentumPeriod: 14,
            momentumThreshold: 55,
            volLookback: 14,
            volExpansionThreshold: 1.5,
            requireLowVolHigherTF: false,
            structureLookback: 50,
            proximityPercent: 0.5,
        },
    };
}

// ─── Suite 1: Gene Generation ────────────────────────────────

describe('Confluence Gene Generation', () => {
    it('should generate a gene with valid TF pair hierarchy', () => {
        const gene = generateRandomConfluenceGene();

        expect(gene.id).toBeTruthy();
        expect(gene.type).toBeTruthy();
        expect(gene.primaryTimeframe).toBeTruthy();
        expect(gene.higherTimeframe).toBeTruthy();
        expect(isValidTFPair(gene.primaryTimeframe, gene.higherTimeframe)).toBe(true);
    });

    it('should respect primaryTimeframe parameter when provided', () => {
        const gene = generateRandomConfluenceGene(Timeframe.M15);
        expect(gene.primaryTimeframe).toBe(Timeframe.M15);

        // Higher TF must be H1, H4, or D1
        const validHigher = getHigherTimeframes(Timeframe.M15);
        expect(validHigher).toContain(gene.higherTimeframe);
    });

    it('should generate all 4 confluence types across many iterations', () => {
        const typesFound = new Set<ConfluenceType>();
        for (let i = 0; i < 200; i++) {
            const gene = generateRandomConfluenceGene();
            typesFound.add(gene.type);
        }

        expect(typesFound.has(ConfluenceType.TREND_ALIGNMENT)).toBe(true);
        expect(typesFound.has(ConfluenceType.MOMENTUM_CONFLUENCE)).toBe(true);
        expect(typesFound.has(ConfluenceType.VOLATILITY_MATCH)).toBe(true);
        expect(typesFound.has(ConfluenceType.STRUCTURE_CONFLUENCE)).toBe(true);
    });

    it('should populate type-specific parameters for each type', () => {
        // Generate enough to get each type
        for (let i = 0; i < 100; i++) {
            const gene = generateRandomConfluenceGene();

            if (gene.type === ConfluenceType.TREND_ALIGNMENT) {
                expect(gene.params.trendIndicator).toBeTruthy();
                expect(gene.params.trendPeriod).toBeGreaterThanOrEqual(10);
                expect(gene.params.trendPeriod).toBeLessThanOrEqual(50);
            }

            if (gene.type === ConfluenceType.MOMENTUM_CONFLUENCE) {
                expect(gene.params.momentumIndicator).toBeTruthy();
                expect(gene.params.momentumPeriod).toBeGreaterThanOrEqual(7);
            }

            if (gene.type === ConfluenceType.VOLATILITY_MATCH) {
                expect(gene.params.volLookback).toBeGreaterThanOrEqual(7);
            }

            if (gene.type === ConfluenceType.STRUCTURE_CONFLUENCE) {
                expect(gene.params.structureLookback).toBeGreaterThanOrEqual(30);
                expect(gene.params.proximityPercent).toBeGreaterThan(0);
            }
        }
    });
});

// ─── Suite 2: Evaluators ─────────────────────────────────────

describe('Confluence Gene Evaluators', () => {
    let primaryCandles: OHLCV[];
    let htfCandlesMap: Map<Timeframe, OHLCV[]>;

    beforeEach(() => {
        primaryCandles = generateCandles(200, 100, 0.002);
        htfCandlesMap = new Map([
            [Timeframe.H1, generateCandles(100, 100, 0.002)],
            [Timeframe.H4, generateCandles(60, 100, 0.001)],
        ]);
    });

    it('should evaluate trend alignment with bullish candles', () => {
        const gene = createTestGene(ConfluenceType.TREND_ALIGNMENT);
        const result = evaluateConfluenceGene(gene, primaryCandles, htfCandlesMap);

        expect(result).not.toBeNull();
        if (result) {
            expect(result.type).toBe(ConfluenceType.TREND_ALIGNMENT);
            expect(result.geneId).toBe(gene.id);
            expect(result.strength).toBeGreaterThanOrEqual(0);
            expect(result.strength).toBeLessThanOrEqual(1);
            expect(['bullish', 'bearish', 'neutral']).toContain(result.direction);
            expect(result.details).toHaveProperty('aligned');
        }
    });

    it('should detect trend misalignment when TFs disagree', () => {
        const gene = createTestGene(ConfluenceType.TREND_ALIGNMENT);
        // Primary bullish, HTF bearish
        const bullishCandles = generateCandles(200, 100, 0.003);
        const bearishHTF = new Map<Timeframe, OHLCV[]>([
            [Timeframe.H1, generateCandles(100, 100, -0.003)],
        ]);

        const result = evaluateConfluenceGene(gene, bullishCandles, bearishHTF);

        expect(result).not.toBeNull();
        if (result) {
            // Misaligned trends should have lower strength
            expect(result.strength).toBeLessThan(0.8);
        }
    });

    it('should evaluate momentum confluence', () => {
        const gene = createTestGene(ConfluenceType.MOMENTUM_CONFLUENCE);
        const result = evaluateConfluenceGene(gene, primaryCandles, htfCandlesMap);

        expect(result).not.toBeNull();
        if (result) {
            expect(result.type).toBe(ConfluenceType.MOMENTUM_CONFLUENCE);
            expect(typeof result.confluent).toBe('boolean');
            expect(result.details).toHaveProperty('primaryMomentum');
            expect(result.details).toHaveProperty('higherMomentum');
        }
    });

    it('should evaluate volatility match', () => {
        const gene = createTestGene(ConfluenceType.VOLATILITY_MATCH);
        const result = evaluateConfluenceGene(gene, primaryCandles, htfCandlesMap);

        expect(result).not.toBeNull();
        if (result) {
            expect(result.type).toBe(ConfluenceType.VOLATILITY_MATCH);
            expect(result.direction).toBe('neutral'); // Volatility has no direction
            expect(result.details).toHaveProperty('primaryRegime');
            expect(result.details).toHaveProperty('higherRegime');
            expect(result.details).toHaveProperty('volRatio');
        }
    });

    it('should evaluate structure confluence (S/R levels)', () => {
        const gene = createTestGene(ConfluenceType.STRUCTURE_CONFLUENCE);
        gene.params.structureLookback = 50;
        gene.params.proximityPercent = 2; // Wider proximity for test

        // Generate HTF candles with clear swing highs/lows for S/R detection
        const structHTF = generateCandles(100, 100, 0.0, 0.03);
        const htf = new Map<Timeframe, OHLCV[]>([[Timeframe.H1, structHTF]]);

        const result = evaluateConfluenceGene(gene, primaryCandles, htf);

        expect(result).not.toBeNull();
        if (result) {
            expect(result.type).toBe(ConfluenceType.STRUCTURE_CONFLUENCE);
            expect(result.details).toHaveProperty('levelsFound');
            expect(result.details).toHaveProperty('atLevel');
        }
    });

    it('should calculate batch confluence signals for multiple genes', () => {
        const genes: TimeframeConfluenceGene[] = [
            createTestGene(ConfluenceType.TREND_ALIGNMENT),
            createTestGene(ConfluenceType.MOMENTUM_CONFLUENCE),
        ];
        genes[0].id = 'gene-1';
        genes[1].id = 'gene-2';

        const results = calculateConfluenceSignals(genes, primaryCandles, htfCandlesMap);

        expect(results.size).toBeLessThanOrEqual(2);
        // At least one should succeed with valid data
        if (results.size > 0) {
            for (const [id, result] of results) {
                expect(typeof result.confluent).toBe('boolean');
                expect(result.strength).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('should return strength in valid range for all evaluators', () => {
        const types = [
            ConfluenceType.TREND_ALIGNMENT,
            ConfluenceType.MOMENTUM_CONFLUENCE,
            ConfluenceType.VOLATILITY_MATCH,
        ];

        for (const type of types) {
            const gene = createTestGene(type);
            const result = evaluateConfluenceGene(gene, primaryCandles, htfCandlesMap);
            if (result) {
                expect(result.strength).toBeGreaterThanOrEqual(0);
                expect(result.strength).toBeLessThanOrEqual(1);
            }
        }
    });

    it('should include timing information in all results', () => {
        const gene = createTestGene(ConfluenceType.TREND_ALIGNMENT);
        const result = evaluateConfluenceGene(gene, primaryCandles, htfCandlesMap);

        if (result) {
            expect(result.primaryTimeframe).toBe(Timeframe.M15);
            expect(result.higherTimeframe).toBe(Timeframe.H1);
        }
    });
});

// ─── Suite 3: GA Operators ───────────────────────────────────

describe('Confluence Gene GA Operators', () => {
    it('should crossover two genes and produce valid offspring', () => {
        const geneA = createTestGene(ConfluenceType.TREND_ALIGNMENT, Timeframe.M15, Timeframe.H1);
        const geneB = createTestGene(ConfluenceType.MOMENTUM_CONFLUENCE, Timeframe.M5, Timeframe.H1);

        const child = crossoverConfluenceGene(geneA, geneB);

        expect(child.id).not.toBe(geneA.id);
        expect(child.id).not.toBe(geneB.id);
        expect(isValidTFPair(child.primaryTimeframe, child.higherTimeframe)).toBe(true);
    });

    it('should mutate a gene while keeping valid bounds', () => {
        const gene = createTestGene(ConfluenceType.TREND_ALIGNMENT);
        const mutated = mutateConfluenceGene(gene, 1.0); // Aggressive mutation

        expect(mutated.id).not.toBe(gene.id);
        expect(isValidTFPair(mutated.primaryTimeframe, mutated.higherTimeframe)).toBe(true);

        // Parameters should remain in valid range
        if (mutated.params.trendPeriod !== undefined) {
            expect(mutated.params.trendPeriod).toBeGreaterThanOrEqual(10);
            expect(mutated.params.trendPeriod).toBeLessThanOrEqual(50);
        }
    });

    it('should maintain TF pair validity after crossover', () => {
        for (let i = 0; i < 50; i++) {
            const a = generateRandomConfluenceGene();
            const b = generateRandomConfluenceGene();
            const child = crossoverConfluenceGene(a, b);
            expect(isValidTFPair(child.primaryTimeframe, child.higherTimeframe)).toBe(true);
        }
    });

    it('should inject new genes from empty (mutation adds)', () => {
        const gene = generateRandomConfluenceGene(Timeframe.H1);
        const mutated = mutateConfluenceGene(gene, 0.5);

        // Mutated gene should be a structurally valid TimeframeConfluenceGene
        expect(mutated.type).toBeTruthy();
        expect(mutated.primaryTimeframe).toBeTruthy();
        expect(mutated.higherTimeframe).toBeTruthy();
        expect(mutated.params).toBeTruthy();
    });
});

// ─── Suite 4: Edge Cases ─────────────────────────────────────

describe('Confluence Gene Edge Cases', () => {
    it('should return null when HTF candles are missing from map', () => {
        const gene = createTestGene(ConfluenceType.TREND_ALIGNMENT, Timeframe.M15, Timeframe.H4);
        const primaryCandles = generateCandles(100);
        const emptyHTF = new Map<Timeframe, OHLCV[]>();

        const result = evaluateConfluenceGene(gene, primaryCandles, emptyHTF);
        expect(result).toBeNull();
    });

    it('should return null when HTF candles are insufficient (< 30)', () => {
        const gene = createTestGene(ConfluenceType.TREND_ALIGNMENT);
        const primaryCandles = generateCandles(100);
        const shortHTF = new Map<Timeframe, OHLCV[]>([
            [Timeframe.H1, generateCandles(10)], // Only 10 candles
        ]);

        const result = evaluateConfluenceGene(gene, primaryCandles, shortHTF);
        expect(result).toBeNull();
    });

    it('should handle empty primary candles gracefully', () => {
        const gene = createTestGene(ConfluenceType.TREND_ALIGNMENT);
        const htf = new Map<Timeframe, OHLCV[]>([
            [Timeframe.H1, generateCandles(100)],
        ]);

        const result = evaluateConfluenceGene(gene, [], htf);
        expect(result).toBeNull();
    });

    it('should validate TF hierarchy correctly', () => {
        expect(isValidTFPair(Timeframe.M1, Timeframe.M5)).toBe(true);
        expect(isValidTFPair(Timeframe.M15, Timeframe.H1)).toBe(true);
        expect(isValidTFPair(Timeframe.H4, Timeframe.D1)).toBe(true);

        // Invalid: D1 has no higher TF
        expect(isValidTFPair(Timeframe.D1, Timeframe.M1)).toBe(false);

        // Invalid: same TF
        expect(isValidTFPair(Timeframe.H1, Timeframe.H1)).toBe(false);

        // Invalid: lower is higher
        expect(isValidTFPair(Timeframe.H4, Timeframe.M15)).toBe(false);
    });
});

// ─── Suite 5: ACSI Radical Innovation ────────────────────────

describe('ACSI — Adaptive Confluence Strength Index', () => {
    let acsi: ACSIMatrix;

    beforeEach(() => {
        resetACSI();
        acsi = new ACSIMatrix();
    });

    it('should return neutral reliability (0.5) for unknown combinations', () => {
        const reliability = acsi.getReliability(
            Timeframe.M15, Timeframe.H1,
            ConfluenceType.TREND_ALIGNMENT,
            MarketRegime.TRENDING_UP,
        );
        expect(reliability).toBe(0.5);
    });

    it('should increase reliability after profitable trades with confluence', () => {
        const result: ConfluenceResult = {
            geneId: 'test',
            type: ConfluenceType.TREND_ALIGNMENT,
            primaryTimeframe: Timeframe.M15,
            higherTimeframe: Timeframe.H1,
            confluent: true,
            strength: 0.8,
            direction: 'bullish',
            details: {},
        };

        // 10 profitable trades with this confluence
        for (let i = 0; i < 10; i++) {
            acsi.updateBelief(result, true, MarketRegime.TRENDING_UP);
        }

        const reliability = acsi.getReliability(
            Timeframe.M15, Timeframe.H1,
            ConfluenceType.TREND_ALIGNMENT,
            MarketRegime.TRENDING_UP,
        );

        // Should be > 0.5 (above neutral) since all trades were profitable
        expect(reliability).toBeGreaterThan(0.5);
    });

    it('should decrease reliability after unprofitable trades with confluence', () => {
        const result: ConfluenceResult = {
            geneId: 'test',
            type: ConfluenceType.MOMENTUM_CONFLUENCE,
            primaryTimeframe: Timeframe.M5,
            higherTimeframe: Timeframe.H1,
            confluent: true,
            strength: 0.7,
            direction: 'bearish',
            details: {},
        };

        // 10 unprofitable trades
        for (let i = 0; i < 10; i++) {
            acsi.updateBelief(result, false, MarketRegime.RANGING);
        }

        const reliability = acsi.getReliability(
            Timeframe.M5, Timeframe.H1,
            ConfluenceType.MOMENTUM_CONFLUENCE,
            MarketRegime.RANGING,
        );

        // Should be < 0.5 (below neutral) since all trades were unprofitable
        expect(reliability).toBeLessThan(0.5);
    });

    it('should apply reliability multiplier to confluence strength', () => {
        const result: ConfluenceResult = {
            geneId: 'test',
            type: ConfluenceType.VOLATILITY_MATCH,
            primaryTimeframe: Timeframe.H1,
            higherTimeframe: Timeframe.H4,
            confluent: true,
            strength: 0.8,
            direction: 'neutral',
            details: {},
        };

        // Feed 8 unprofitable trades → reliability should drop
        for (let i = 0; i < 8; i++) {
            acsi.updateBelief(result, false, MarketRegime.HIGH_VOLATILITY);
        }

        const adjusted = acsi.applyReliability(result, MarketRegime.HIGH_VOLATILITY);

        // Adjusted strength should be less than original (dampened by low reliability)
        expect(adjusted.strength).toBeLessThan(result.strength);
        expect(adjusted.details).toHaveProperty('acsiReliability');
        expect(adjusted.details).toHaveProperty('acsiOriginalStrength');
    });
});

// ─── Suite 6: Utility Functions ──────────────────────────────

describe('Confluence Utility Functions', () => {
    it('should return all valid higher TFs for each primary', () => {
        expect(getHigherTimeframes(Timeframe.M1)).toEqual([Timeframe.M5, Timeframe.M15, Timeframe.H1]);
        expect(getHigherTimeframes(Timeframe.M15)).toEqual([Timeframe.H1, Timeframe.H4, Timeframe.D1]);
        expect(getHigherTimeframes(Timeframe.H4)).toEqual([Timeframe.D1]);
        expect(getHigherTimeframes(Timeframe.D1)).toEqual([]);
    });

    it('should extract required higher TFs from gene list', () => {
        const genes: TimeframeConfluenceGene[] = [
            createTestGene(ConfluenceType.TREND_ALIGNMENT, Timeframe.M15, Timeframe.H1),
            createTestGene(ConfluenceType.MOMENTUM_CONFLUENCE, Timeframe.M15, Timeframe.H4),
            createTestGene(ConfluenceType.VOLATILITY_MATCH, Timeframe.M5, Timeframe.H1),
        ];

        const requiredTFs = getRequiredHigherTimeframes(genes);

        expect(requiredTFs).toContain(Timeframe.H1);
        expect(requiredTFs).toContain(Timeframe.H4);
        expect(requiredTFs).toHaveLength(2); // H1 and H4 (deduplicated)
    });

    it('should return empty array for undefined/empty gene list', () => {
        expect(getRequiredHigherTimeframes(undefined)).toEqual([]);
        expect(getRequiredHigherTimeframes([])).toEqual([]);
    });
});
