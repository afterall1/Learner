// ============================================================
// Suite 2: Cortex Risk Integration Tests
// Verifies RiskManager singleton is wired into Cortex
// ============================================================

import { describe, it, expect } from 'vitest';
import { Cortex } from '@/lib/engine/cortex';

describe('Cortex — Risk Manager Integration', () => {

    it('should include riskSnapshot in getSnapshot()', () => {
        const cortex = new Cortex({ totalCapital: 10000 });
        cortex.initialize();
        const snapshot = cortex.getSnapshot();

        expect(snapshot.riskSnapshot).toBeDefined();
        expect(snapshot.riskSnapshot).not.toBeNull();
    });

    it('should have correct riskSnapshot structure', () => {
        const cortex = new Cortex({ totalCapital: 10000 });
        cortex.initialize();
        const snap = cortex.getSnapshot();
        const risk = snap.riskSnapshot!;

        // Core fields
        expect(typeof risk.emergencyStopActive).toBe('boolean');
        expect(typeof risk.dailyPnl).toBe('number');
        expect(typeof risk.dailyDrawdownPct).toBe('number');
        expect(typeof risk.totalDrawdownPct).toBe('number');
        expect(typeof risk.openPositionCount).toBe('number');
        expect(typeof risk.globalRiskScore).toBe('number');

        // Rails
        expect(risk.rails.maxRiskPerTrade).toBe(0.02);
        expect(risk.rails.maxSimultaneousPositions).toBe(3);
        expect(risk.rails.dailyDrawdownLimit).toBe(0.05);
        expect(risk.rails.totalDrawdownLimit).toBe(0.15);
        expect(risk.rails.maxLeverage).toBe(10);
        expect(risk.rails.mandatoryStopLoss).toBe(true);
        expect(risk.rails.paperTradeMinimum).toBe(50);
        expect(risk.rails.emergencyStopEnabled).toBe(true);

        // Utilizations
        expect(typeof risk.railUtilizations.positionUtil).toBe('number');
        expect(typeof risk.railUtilizations.dailyDrawdownUtil).toBe('number');
        expect(typeof risk.railUtilizations.totalDrawdownUtil).toBe('number');

        // Logs
        expect(Array.isArray(risk.recentLogs)).toBe(true);
    });

    it('should trigger RiskManager emergency stop on emergencyStopAll()', () => {
        const cortex = new Cortex({ totalCapital: 10000 });
        cortex.initialize();

        // Before emergency stop
        let snap = cortex.getSnapshot();
        expect(snap.riskSnapshot!.emergencyStopActive).toBe(false);

        // Trigger emergency stop
        cortex.emergencyStopAll();

        // After emergency stop
        snap = cortex.getSnapshot();
        expect(snap.riskSnapshot!.emergencyStopActive).toBe(true);
    });
});
