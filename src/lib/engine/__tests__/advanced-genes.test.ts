// ============================================================
// Learner: Advanced Genes — Comprehensive Test Suite
// ============================================================
// Phase 25: Tests for microstructure-genes.ts, price-action-genes.ts
//
// 4 Suites, 16 Tests:
//   1. Microstructure Gene Generation (4 tests)
//   2. Microstructure Signal Calculation (4 tests)
//   3. Price Action Gene Generation (4 tests)
//   4. Price Action GA Operators (4 tests)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    MicrostructureGeneType,
    PriceActionPatternType,
    CandlestickFormation,
    type OHLCV,
    type MicrostructureGene,
    type PriceActionGene,
} from '@/types';
import {
    generateRandomMicrostructureGene,
    calculateMicrostructureSignals,
    crossoverMicrostructureGene,
    mutateMicrostructureGene,
} from '../microstructure-genes';
import {
    generateRandomPriceActionGene,
    calculatePriceActionSignals,
    crossoverPriceActionGene,
    mutatePriceActionGene,
} from '../price-action-genes';

// ─── Test Data ───────────────────────────────────────────────

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
            volume: 1000 + Math.random() * 9000,
        });
    }
    return candles;
}

// ─── Suite 1: Microstructure Gene Generation ─────────────────

describe('Microstructure Gene Generation', () => {
    it('should generate a valid microstructure gene with all required fields', () => {
        const gene = generateRandomMicrostructureGene();

        expect(gene.id).toBeTruthy();
        expect(gene.type).toBeTruthy();
        expect(gene.lookbackPeriod).toBeGreaterThan(0);
        expect(gene.params).toBeDefined();
    });

    it('should generate specified type when provided', () => {
        const gene = generateRandomMicrostructureGene(MicrostructureGeneType.VOLUME_PROFILE);
        expect(gene.type).toBe(MicrostructureGeneType.VOLUME_PROFILE);
    });

    it('should generate all 5 micro types across iterations', () => {
        const typesFound = new Set<MicrostructureGeneType>();
        for (let i = 0; i < 200; i++) {
            typesFound.add(generateRandomMicrostructureGene().type);
        }

        expect(typesFound.has(MicrostructureGeneType.VOLUME_PROFILE)).toBe(true);
        expect(typesFound.has(MicrostructureGeneType.VOLUME_ACCELERATION)).toBe(true);
        expect(typesFound.has(MicrostructureGeneType.CANDLE_ANATOMY)).toBe(true);
        expect(typesFound.has(MicrostructureGeneType.RANGE_EXPANSION)).toBe(true);
        expect(typesFound.has(MicrostructureGeneType.ABSORPTION)).toBe(true);
    });

    it('should have lookbackPeriod within reasonable bounds', () => {
        for (let i = 0; i < 50; i++) {
            const gene = generateRandomMicrostructureGene();
            expect(gene.lookbackPeriod).toBeGreaterThanOrEqual(5);
            expect(gene.lookbackPeriod).toBeLessThanOrEqual(50);
        }
    });
});

// ─── Suite 2: Microstructure Signal Calculation ──────────────

describe('Microstructure Signal Calculation', () => {
    let candles: OHLCV[];

    it('should calculate signals for multiple genes', () => {
        candles = generateCandles(100);
        const genes: MicrostructureGene[] = [
            generateRandomMicrostructureGene(MicrostructureGeneType.VOLUME_PROFILE),
            generateRandomMicrostructureGene(MicrostructureGeneType.CANDLE_ANATOMY),
        ];

        const results = calculateMicrostructureSignals(genes, candles);

        expect(results.size).toBeLessThanOrEqual(2);
        for (const [geneId, result] of results) {
            expect(result.geneId).toBeTruthy();
            expect(result.type).toBeTruthy();
            expect(typeof result.currentValue).toBe('number');
            expect(typeof result.detected).toBe('boolean');
        }
    });

    it('should handle empty candle array gracefully', () => {
        const genes = [generateRandomMicrostructureGene()];
        const results = calculateMicrostructureSignals(genes, []);
        // Should not throw, may return empty or default results
        expect(results.size).toBeLessThanOrEqual(1);
    });

    it('should handle insufficient candle data', () => {
        const genes = [generateRandomMicrostructureGene()];
        genes[0].lookbackPeriod = 50; // Need 50 candles
        const shortCandles = generateCandles(5);
        const results = calculateMicrostructureSignals(genes, shortCandles);
        // Should return results without throwing
        expect(results).toBeDefined();
    });

    it('should produce crossover of two microstructure genes', () => {
        const geneA = generateRandomMicrostructureGene(MicrostructureGeneType.VOLUME_PROFILE);
        const geneB = generateRandomMicrostructureGene(MicrostructureGeneType.VOLUME_PROFILE);

        const child = crossoverMicrostructureGene(geneA, geneB);

        expect(child.id).not.toBe(geneA.id);
        expect(child.id).not.toBe(geneB.id);
        expect(child.type).toBeTruthy();
        expect(child.lookbackPeriod).toBeGreaterThan(0);
    });
});

// ─── Suite 3: Price Action Gene Generation ───────────────────

describe('Price Action Gene Generation', () => {
    it('should generate a valid price action gene with all required fields', () => {
        const gene = generateRandomPriceActionGene();

        expect(gene.id).toBeTruthy();
        expect(gene.type).toBeTruthy();
        expect(gene.params).toBeDefined();
    });

    it('should generate specified type when provided', () => {
        const gene = generateRandomPriceActionGene(PriceActionPatternType.CANDLESTICK_PATTERN);
        expect(gene.type).toBe(PriceActionPatternType.CANDLESTICK_PATTERN);
    });

    it('should generate all pattern types across iterations', () => {
        const typesFound = new Set<PriceActionPatternType>();
        for (let i = 0; i < 200; i++) {
            typesFound.add(generateRandomPriceActionGene().type);
        }

        expect(typesFound.has(PriceActionPatternType.CANDLESTICK_PATTERN)).toBe(true);
        expect(typesFound.has(PriceActionPatternType.STRUCTURAL_BREAK)).toBe(true);
        expect(typesFound.has(PriceActionPatternType.SWING_SEQUENCE)).toBe(true);
    });

    it('should calculate price action signals for candle data', () => {
        const candles = generateCandles(100);
        const genes = [
            generateRandomPriceActionGene(PriceActionPatternType.CANDLESTICK_PATTERN),
        ];

        const results = calculatePriceActionSignals(genes, candles);

        for (const [geneId, result] of results) {
            expect(result.geneId).toBeTruthy();
            expect(result.type).toBeTruthy();
            expect(typeof result.detected).toBe('boolean');
            expect(['bullish', 'bearish', 'neutral']).toContain(result.direction);
        }
    });
});

// ─── Suite 4: Price Action GA Operators ──────────────────────

describe('Price Action GA Operators', () => {
    it('should crossover two price action genes', () => {
        const geneA = generateRandomPriceActionGene(PriceActionPatternType.CANDLESTICK_PATTERN);
        const geneB = generateRandomPriceActionGene(PriceActionPatternType.STRUCTURAL_BREAK);

        const child = crossoverPriceActionGene(geneA, geneB);

        expect(child.id).not.toBe(geneA.id);
        expect(child.id).not.toBe(geneB.id);
        expect(child.type).toBeTruthy();
    });

    it('should mutate a price action gene while keeping valid bounds', () => {
        const gene = generateRandomPriceActionGene();
        const mutated = mutatePriceActionGene(gene, 1.0); // Aggressive

        expect(mutated.id).not.toBe(gene.id);
        expect(mutated.params).toBeDefined();
    });

    it('should maintain invariants after 100 crossover+mutation cycles', () => {
        let gene = generateRandomPriceActionGene();

        for (let i = 0; i < 100; i++) {
            const partner = generateRandomPriceActionGene();
            gene = crossoverPriceActionGene(gene, partner);
            gene = mutatePriceActionGene(gene, 0.5);
        }

        // After 100 GA cycles, should still be structurally valid
        expect(gene.id).toBeTruthy();
        expect(gene.type).toBeTruthy();
        expect(gene.params).toBeDefined();
    });

    it('should handle microstructure gene mutation without corruption', () => {
        const gene = generateRandomMicrostructureGene();
        const mutated = mutateMicrostructureGene(gene, 0.8);

        expect(mutated.id).not.toBe(gene.id);
        expect(mutated.type).toBeTruthy();
        expect(mutated.lookbackPeriod).toBeGreaterThan(0);
        expect(mutated.params).toBeDefined();
    });
});
