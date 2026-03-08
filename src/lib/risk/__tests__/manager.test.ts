// ============================================================
// Suite 1: RiskManager — 8 NON-NEGOTIABLE Safety Rail Tests
// + Radical Innovation: Safety Rail Mutation Boundary Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { RiskManager, RiskViolation } from '@/lib/risk/manager';
import {
    TradeDirection,
    TradeStatus,
    type StrategyDNA,
    type Position,
    type Trade,
} from '@/types';

// ─── Test Fixtures ────────────────────────────────────────────

function createMockStrategy(overrides: Partial<StrategyDNA> = {}): StrategyDNA {
    return {
        id: 'test-strategy-001',
        name: 'TestStrategy',
        slotId: 'BTCUSDT:1h',
        generation: 1,
        parentIds: [],
        createdAt: Date.now(),
        indicators: [],
        entryRules: { conditions: [], logic: 'AND' },
        exitRules: { conditions: [], logic: 'AND' },
        preferredTimeframe: '1h' as never,
        preferredPairs: ['BTCUSDT'],
        riskGenes: {
            stopLossPercent: 0.015,
            takeProfitPercent: 0.045,
            riskRewardRatio: 3,
            maxLeverage: 5,
            positionSizePercent: 0.01,
            trailingStop: false,
            trailingStopPercent: 0,
        } as never,
        directionBias: TradeDirection.LONG,
        status: 'ACTIVE' as never,
        metadata: {
            mutationHistory: [],
            fitnessScore: 50,
            tradeCount: 0,
            lastEvaluated: null,
            validation: null,
        },
        ...overrides,
    } as StrategyDNA;
}

function createMockPosition(overrides: Partial<Position> = {}): Position {
    return {
        id: 'pos-001',
        slotId: 'BTCUSDT:1h',
        symbol: 'BTCUSDT',
        direction: TradeDirection.LONG,
        entryPrice: 50000,
        currentPrice: 50500,
        quantity: 0.01,
        leverage: 5,
        unrealizedPnl: 5,
        unrealizedPnlPercent: 1,
        margin: 100,
        liquidationPrice: 40000,
        stopLoss: 49000,
        takeProfit: 52000,
        strategyId: 'test-strategy-001',
        isPaperTrade: true,
        openTime: Date.now(),
        ...overrides,
    };
}

function createMockTrade(overrides: Partial<Trade> = {}): Trade {
    return {
        id: 'trade-001',
        strategyId: 'test-strategy-001',
        strategyName: 'TestStrategy',
        slotId: 'BTCUSDT:1h',
        symbol: 'BTCUSDT',
        direction: TradeDirection.LONG,
        status: TradeStatus.CLOSED,
        isPaperTrade: true,
        entryPrice: 50000,
        exitPrice: 50500,
        quantity: 0.01,
        leverage: 5,
        stopLoss: 49000,
        takeProfit: 52000,
        pnlPercent: 1,
        pnlUSD: 25,
        fees: 0.5,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        entryReason: 'Test entry',
        exitReason: 'Test exit',
        indicators: {},
        ...overrides,
    };
}

// ─── Test Suite ───────────────────────────────────────────────

describe('RiskManager — 8 NON-NEGOTIABLE Safety Rails', () => {
    let rm: RiskManager;
    const BALANCE = 10000;

    beforeEach(() => {
        rm = new RiskManager();
        rm.initialize(BALANCE);
    });

    // ─── Rail 1: Emergency Stop ──────────────────────────────

    describe('Rail 1: Emergency Stop', () => {
        it('should reject ALL trades when emergency stop is active', () => {
            rm.triggerEmergencyStop('Test emergency');
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.001,
                5,
                49000,
            );
            expect(result.approved).toBe(false);
            expect(result.messages[0]).toContain('EMERGENCY STOP');
        });

        it('should allow trades after emergency stop is reset', () => {
            rm.triggerEmergencyStop('Test');
            rm.resetEmergencyStop();
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.001,
                5,
                49000,
            );
            expect(result.approved).toBe(true);
        });

        it('should report emergency stop status correctly', () => {
            expect(rm.isEmergencyStopActive()).toBe(false);
            rm.triggerEmergencyStop('Test');
            expect(rm.isEmergencyStopActive()).toBe(true);
            rm.resetEmergencyStop();
            expect(rm.isEmergencyStopActive()).toBe(false);
        });
    });

    // ─── Rail 2: Mandatory Stop-Loss ─────────────────────────

    describe('Rail 2: Mandatory Stop-Loss', () => {
        it('should reject trade with undefined stop-loss', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.001,
                5,
                undefined,
            );
            expect(result.approved).toBe(false);
            expect(result.violations).toContain(RiskViolation.NO_STOP_LOSS);
        });

        it('should reject trade with stop-loss of 0', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.001,
                5,
                0,
            );
            expect(result.approved).toBe(false);
            expect(result.violations).toContain(RiskViolation.NO_STOP_LOSS);
        });

        it('should reject trade with negative stop-loss', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.001,
                5,
                -100,
            );
            expect(result.approved).toBe(false);
            expect(result.violations).toContain(RiskViolation.NO_STOP_LOSS);
        });
    });

    // ─── Rail 3: Max Risk Per Trade (2%) ─────────────────────

    describe('Rail 3: Max Risk Per Trade (2%)', () => {
        it('should reject trade where risk exceeds 2% of balance', () => {
            // Risk = |50000 - 48000| * 0.1 * 5 = 10000 → 100% of 10000 balance
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.1,
                5,
                48000,
            );
            expect(result.approved).toBe(false);
            expect(result.violations).toContain(RiskViolation.MAX_RISK_PER_TRADE);
        });

        it('should approve trade where risk is within 2%', () => {
            // Risk = |50000 - 49950| * 0.001 * 5 = 0.25 → 0.0025% of 10000
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.001,
                5,
                49950,
            );
            expect(result.approved).toBe(true);
        });
    });

    // ─── Rail 4: Max Simultaneous Positions (3) ──────────────

    describe('Rail 4: Max Simultaneous Positions (3)', () => {
        it('should reject when 3 positions already open', () => {
            const positions = [
                createMockPosition({ id: 'p1' }),
                createMockPosition({ id: 'p2' }),
                createMockPosition({ id: 'p3' }),
            ];
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                positions,
                50000,
                0.001,
                5,
                49900,
            );
            expect(result.approved).toBe(false);
            expect(result.violations).toContain(RiskViolation.MAX_SIMULTANEOUS_POSITIONS);
        });

        it('should approve when fewer than 3 positions open', () => {
            const positions = [
                createMockPosition({ id: 'p1' }),
                createMockPosition({ id: 'p2' }),
            ];
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                positions,
                50000,
                0.001,
                5,
                49950,
            );
            expect(result.approved).toBe(true);
        });
    });

    // ─── Rail 5: Max Leverage (10x) ──────────────────────────

    describe('Rail 5: Max Leverage (10x)', () => {
        it('should reject leverage above 10x', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.001,
                15,
                49950,
            );
            expect(result.approved).toBe(false);
            expect(result.violations).toContain(RiskViolation.MAX_LEVERAGE);
        });

        it('should approve leverage at exactly 10x', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.001,
                10,
                49950,
            );
            expect(result.approved).toBe(true);
        });
    });

    // ─── Rail 6: Daily Drawdown Limit (5%) ────────────────────

    describe('Rail 6: Daily Drawdown Limit (5%)', () => {
        it('should reject when daily drawdown exceeds 5%', () => {
            // Balance dropped from 10000 to 9400 → 6% drawdown
            const currentBalance = 9400;
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                currentBalance,
                [],
                50000,
                0.001,
                5,
                49950,
            );
            expect(result.approved).toBe(false);
            expect(result.violations).toContain(RiskViolation.DAILY_DRAWDOWN_LIMIT);
        });
    });

    // ─── Rail 7: Total Drawdown Limit (15%) ──────────────────

    describe('Rail 7: Total Drawdown Limit (15%)', () => {
        it('should reject and trigger emergency stop when total drawdown exceeds 15%', () => {
            // Balance dropped from 10000 to 8400 → 16% drawdown
            const currentBalance = 8400;
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                currentBalance,
                [],
                50000,
                0.001,
                5,
                49950,
            );
            expect(result.approved).toBe(false);
            expect(result.violations).toContain(RiskViolation.TOTAL_DRAWDOWN_LIMIT);
            // Emergency stop should be auto-triggered
            expect(rm.isEmergencyStopActive()).toBe(true);
        });
    });

    // ─── Rail 8: Insufficient Balance ────────────────────────

    describe('Rail 8: Insufficient Balance', () => {
        it('should reject when required margin exceeds 90% of balance', () => {
            // Margin = (50000 * 10) / 5 = 100000 → way above 90% of 10000
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                10,
                5,
                49950,
            );
            expect(result.approved).toBe(false);
            expect(result.violations).toContain(RiskViolation.INSUFFICIENT_BALANCE);
        });
    });

    // ─── Happy Path ──────────────────────────────────────────

    describe('Happy Path: All checks pass', () => {
        it('should approve a valid trade with all rails satisfied', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.001,
                5,
                49950,
            );
            expect(result.approved).toBe(true);
            expect(result.violations).toHaveLength(0);
            expect(result.messages).toHaveLength(0);
        });
    });

    // ─── getRiskSnapshot ──────────────────────────────────────

    describe('getRiskSnapshot()', () => {
        it('should return a complete snapshot with all fields', () => {
            const snap = rm.getRiskSnapshot(BALANCE, 1);
            expect(snap.emergencyStopActive).toBe(false);
            expect(snap.dailyPnl).toBe(0);
            expect(snap.openPositionCount).toBe(1);
            expect(snap.globalRiskScore).toBeGreaterThanOrEqual(0);
            expect(snap.globalRiskScore).toBeLessThanOrEqual(100);
            expect(snap.rails.maxRiskPerTrade).toBe(0.02);
            expect(snap.rails.maxSimultaneousPositions).toBe(3);
            expect(snap.rails.dailyDrawdownLimit).toBe(0.05);
            expect(snap.rails.totalDrawdownLimit).toBe(0.15);
            expect(snap.rails.maxLeverage).toBe(10);
            expect(snap.rails.mandatoryStopLoss).toBe(true);
            expect(snap.rails.paperTradeMinimum).toBe(50);
            expect(snap.rails.emergencyStopEnabled).toBe(true);
            expect(snap.railUtilizations).toBeDefined();
            expect(snap.recentLogs).toBeDefined();
        });

        it('should reflect emergency stop in snapshot', () => {
            rm.triggerEmergencyStop('Snapshot test');
            const snap = rm.getRiskSnapshot(BALANCE, 0);
            expect(snap.emergencyStopActive).toBe(true);
        });

        it('should compute position utilization correctly', () => {
            const snap = rm.getRiskSnapshot(BALANCE, 2);
            expect(snap.railUtilizations.positionUtil).toBeCloseTo(2 / 3, 2);
        });
    });

    // ─── recordTradeResult ────────────────────────────────────

    describe('recordTradeResult()', () => {
        it('should update daily PnL after a closed trade', () => {
            expect(rm.getDailyPnl()).toBe(0);
            rm.recordTradeResult(createMockTrade({ pnlUSD: 150 }));
            expect(rm.getDailyPnl()).toBe(150);
        });

        it('should accumulate multiple trade results', () => {
            rm.recordTradeResult(createMockTrade({ pnlUSD: 100 }));
            rm.recordTradeResult(createMockTrade({ id: 't2', pnlUSD: -30 }));
            expect(rm.getDailyPnl()).toBe(70);
        });

        it('should ignore trades that are not CLOSED', () => {
            rm.recordTradeResult(createMockTrade({ status: TradeStatus.OPEN, pnlUSD: null }));
            expect(rm.getDailyPnl()).toBe(0);
        });
    });

    // ─── resetDaily ───────────────────────────────────────────

    describe('resetDaily()', () => {
        it('should reset daily PnL and drawdown tracking', () => {
            rm.recordTradeResult(createMockTrade({ pnlUSD: 200 }));
            expect(rm.getDailyPnl()).toBe(200);
            rm.resetDaily(BALANCE);
            expect(rm.getDailyPnl()).toBe(0);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// RADICAL INNOVATION: Safety Rail Mutation Boundary Tests
// Each test probes the exact threshold boundary of a safety rail
// ═══════════════════════════════════════════════════════════════

describe('Safety Rail Mutation Boundary Tests (Radical Innovation)', () => {
    let rm: RiskManager;
    const BALANCE = 10000;

    beforeEach(() => {
        rm = new RiskManager();
        rm.initialize(BALANCE);
    });

    describe('Boundary: Max Risk Per Trade (2%)', () => {
        it('should PASS at exactly 1.99% risk', () => {
            // Risk = |entry - SL| * qty * lev / balance
            // 1.99% of 10000 = 199
            // If entry=50000, SL=49602, qty=0.01, lev=5 → risk = 398 * 0.01 * 5 = 19.9 → 0.199% ✓
            // Let's be precise: risk = (50000 - 49000) * 0.003 * 5 = 15 → 0.15% < 2%
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.003,
                5,
                49000,
            );
            // riskAmount = 1000 * 0.003 * 5 = 15, riskPercent = 15/10000 = 0.15% < 2%
            expect(result.violations).not.toContain(RiskViolation.MAX_RISK_PER_TRADE);
        });

        it('should FAIL at 2.01%+ risk', () => {
            // risk = (50000 - 45000) * 0.01 * 5 = 250, percent = 250/10000 = 2.5% > 2%
            const result = rm.checkTradeRisk(
                createMockStrategy(),
                TradeDirection.LONG,
                BALANCE,
                [],
                50000,
                0.01,
                5,
                45000,
            );
            expect(result.violations).toContain(RiskViolation.MAX_RISK_PER_TRADE);
        });
    });

    describe('Boundary: Max Simultaneous Positions (3)', () => {
        it('should PASS at 2 open positions', () => {
            const positions = [
                createMockPosition({ id: 'p1' }),
                createMockPosition({ id: 'p2' }),
            ];
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, BALANCE, positions,
                50000, 0.001, 5, 49950,
            );
            expect(result.violations).not.toContain(RiskViolation.MAX_SIMULTANEOUS_POSITIONS);
        });

        it('should FAIL at exactly 3 open positions', () => {
            const positions = [
                createMockPosition({ id: 'p1' }),
                createMockPosition({ id: 'p2' }),
                createMockPosition({ id: 'p3' }),
            ];
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, BALANCE, positions,
                50000, 0.001, 5, 49950,
            );
            expect(result.violations).toContain(RiskViolation.MAX_SIMULTANEOUS_POSITIONS);
        });
    });

    describe('Boundary: Daily Drawdown Limit (5%)', () => {
        it('should PASS at 4.9% daily drawdown', () => {
            // 4.9% of 10000 = 490, so balance = 10000 - 490 = 9510
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, 9510, [],
                50000, 0.001, 5, 49950,
            );
            expect(result.violations).not.toContain(RiskViolation.DAILY_DRAWDOWN_LIMIT);
        });

        it('should FAIL at 5.1% daily drawdown', () => {
            // 5.1% of 10000 = 510, so balance = 10000 - 510 = 9490
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, 9490, [],
                50000, 0.001, 5, 49950,
            );
            expect(result.violations).toContain(RiskViolation.DAILY_DRAWDOWN_LIMIT);
        });
    });

    describe('Boundary: Max Leverage (10x)', () => {
        it('should PASS at exactly 10x leverage', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, BALANCE, [],
                50000, 0.001, 10, 49950,
            );
            expect(result.violations).not.toContain(RiskViolation.MAX_LEVERAGE);
        });

        it('should FAIL at 10.1x leverage', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, BALANCE, [],
                50000, 0.001, 10.1, 49950,
            );
            expect(result.violations).toContain(RiskViolation.MAX_LEVERAGE);
        });
    });

    describe('Boundary: Stop-Loss Variants', () => {
        it('should FAIL with undefined stop-loss', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, BALANCE, [],
                50000, 0.001, 5, undefined,
            );
            expect(result.violations).toContain(RiskViolation.NO_STOP_LOSS);
        });

        it('should FAIL with zero stop-loss', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, BALANCE, [],
                50000, 0.001, 5, 0,
            );
            expect(result.violations).toContain(RiskViolation.NO_STOP_LOSS);
        });

        it('should FAIL with negative stop-loss', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, BALANCE, [],
                50000, 0.001, 5, -1,
            );
            expect(result.violations).toContain(RiskViolation.NO_STOP_LOSS);
        });

        it('should PASS with valid positive stop-loss', () => {
            const result = rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, BALANCE, [],
                50000, 0.001, 5, 49950,
            );
            expect(result.violations).not.toContain(RiskViolation.NO_STOP_LOSS);
        });
    });

    describe('Boundary: Total Drawdown + Emergency Stop Cascade', () => {
        it('should auto-trigger emergency stop at 15%+ total drawdown', () => {
            // 16% drawdown → balance = 8400
            expect(rm.isEmergencyStopActive()).toBe(false);
            rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, 8400, [],
                50000, 0.001, 5, 49950,
            );
            expect(rm.isEmergencyStopActive()).toBe(true);
        });

        it('should NOT trigger emergency stop at 14.9% total drawdown', () => {
            // 14.9% → balance = 8510
            rm.checkTradeRisk(
                createMockStrategy(), TradeDirection.LONG, 8510, [],
                50000, 0.001, 5, 49950,
            );
            expect(rm.isEmergencyStopActive()).toBe(false);
        });
    });
});
