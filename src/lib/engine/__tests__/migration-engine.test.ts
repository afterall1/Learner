// ============================================================
// Learner: Migration Engine — Comprehensive Test Suite
// ============================================================
// Phase 25: Tests for migration.ts utility functions
//
// 2 Suites, 10 Tests:
//   1. calculateMigrationAffinity (6 tests)
//   2. adaptMigrant (4 tests)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    Timeframe,
    IndicatorType,
    SignalCondition,
    StrategyStatus,
    type StrategyDNA,
} from '@/types';
import { createTradingSlot, type TradingSlot } from '@/types/trading-slot';
import {
    calculateMigrationAffinity,
    adaptMigrant,
} from '../migration';

// ─── Test Slot Factory ───────────────────────────────────────

function slot(pair: string, tf: Timeframe): TradingSlot {
    return createTradingSlot(pair, tf);
}

function createTestStrategy(slotId: string = 'BTCUSDT:1h'): StrategyDNA {
    return {
        id: 'strat-original',
        name: 'OriginalStrategy',
        slotId,
        generation: 5,
        parentIds: ['parent-1'],
        createdAt: Date.now() - 100000,
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
            mutationHistory: ['mutation-1', 'mutation-2'],
            fitnessScore: 65,
            tradeCount: 50,
            lastEvaluated: Date.now(),
            validation: null,
        },
    };
}

// ─── Suite 1: Migration Affinity ─────────────────────────────

describe('calculateMigrationAffinity', () => {
    it('should return 1.0 for same slot', () => {
        const s = slot('BTCUSDT', Timeframe.H1);
        expect(calculateMigrationAffinity(s, s)).toBe(1.0);
    });

    it('should return 0.8 for same pair, different timeframe', () => {
        const source = slot('BTCUSDT', Timeframe.H1);
        const target = slot('BTCUSDT', Timeframe.M15);
        expect(calculateMigrationAffinity(source, target)).toBe(0.8);
    });

    it('should return 0.5 for same timeframe, different pair', () => {
        const source = slot('BTCUSDT', Timeframe.H1);
        const target = slot('SOLUSDT', Timeframe.H1);
        expect(calculateMigrationAffinity(source, target)).toBe(0.5);
    });

    it('should return 0.4 for same market cap tier (both top-cap)', () => {
        const source = slot('BTCUSDT', Timeframe.H1);
        const target = slot('ETHUSDT', Timeframe.M15);
        expect(calculateMigrationAffinity(source, target)).toBe(0.4);
    });

    it('should return 0.4 for same market cap tier (both mid-cap)', () => {
        const source = slot('BNBUSDT', Timeframe.H4);
        const target = slot('SOLUSDT', Timeframe.M5);
        expect(calculateMigrationAffinity(source, target)).toBe(0.4);
    });

    it('should return low affinity for completely different slots', () => {
        const source = slot('BTCUSDT', Timeframe.M1);
        const target = slot('ADAUSDT', Timeframe.D1);
        const affinity = calculateMigrationAffinity(source, target);
        expect(affinity).toBeLessThanOrEqual(0.3);
    });
});

// ─── Suite 2: adaptMigrant ───────────────────────────────────

describe('adaptMigrant', () => {
    it('should re-scope strategy to target slot', () => {
        const strategy = createTestStrategy('BTCUSDT:1h');
        const target = slot('ETHUSDT', Timeframe.M15);
        const adapted = adaptMigrant(strategy, target);

        expect(adapted.slotId).toBe('ETHUSDT:15m');
        expect(adapted.preferredPairs).toEqual(['ETHUSDT']);
        expect(adapted.preferredTimeframe).toBe(Timeframe.M15);
    });

    it('should generate new ID (not same as original)', () => {
        const strategy = createTestStrategy();
        const target = slot('ETHUSDT', Timeframe.H4);
        const adapted = adaptMigrant(strategy, target);

        expect(adapted.id).not.toBe(strategy.id);
    });

    it('should reset performance metadata', () => {
        const strategy = createTestStrategy();
        strategy.metadata.fitnessScore = 80;
        strategy.metadata.tradeCount = 200;

        const target = slot('SOLUSDT', Timeframe.H1);
        const adapted = adaptMigrant(strategy, target);

        expect(adapted.metadata.fitnessScore).toBe(0);
        expect(adapted.metadata.tradeCount).toBe(0);
        expect(adapted.metadata.lastEvaluated).toBeNull();
        expect(adapted.metadata.validation).toBeNull();
        expect(adapted.status).toBe(StrategyStatus.PAPER);
    });

    it('should preserve indicator genes and add migration to history', () => {
        const strategy = createTestStrategy();
        const target = slot('ETHUSDT', Timeframe.H4);
        const adapted = adaptMigrant(strategy, target);

        // Indicator genes preserved
        expect(adapted.indicators).toHaveLength(strategy.indicators.length);
        expect(adapted.indicators[0].type).toBe(strategy.indicators[0].type);

        // Risk genes preserved
        expect(adapted.riskGenes.stopLossPercent).toBe(strategy.riskGenes.stopLossPercent);

        // Migration history recorded
        expect(adapted.metadata.mutationHistory.length).toBeGreaterThan(strategy.metadata.mutationHistory.length);
        const lastEntry = adapted.metadata.mutationHistory[adapted.metadata.mutationHistory.length - 1];
        expect(lastEntry).toContain('migration:');

        // Lineage tracking
        expect(adapted.parentIds).toContain(strategy.id);
    });
});
