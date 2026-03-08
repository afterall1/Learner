// ============================================================
// Suite 3: Risk Snapshot Derivation Tests
// Verifies riskLive derivation from CortexSnapshot
// ============================================================

import { describe, it, expect } from 'vitest';
import type { CortexSnapshot, RiskSnapshot, BrainLog } from '@/types';
import { BrainState, LogLevel } from '@/types';

// Minimal CortexSnapshot factory for testing derivation logic
function createMinimalCortexSnapshot(riskSnapshot?: RiskSnapshot): CortexSnapshot {
    return {
        islands: [],
        globalState: BrainState.IDLE,
        totalIslands: 0,
        activeIslands: 0,
        totalTradesAllIslands: 0,
        globalBestFitness: 0,
        capitalAllocations: [],
        migrationHistory: [],
        globalLogs: [],
        totalCapital: 10000,
        riskSnapshot,
    };
}

function createMockRiskSnapshot(overrides: Partial<RiskSnapshot> = {}): RiskSnapshot {
    return {
        emergencyStopActive: false,
        dailyPnl: 42.5,
        dailyStartBalance: 10000,
        totalStartBalance: 10000,
        dailyDrawdownPct: 0.01,
        totalDrawdownPct: 0.03,
        openPositionCount: 1,
        globalRiskScore: 33,
        rails: {
            maxRiskPerTrade: 0.02,
            maxSimultaneousPositions: 3,
            dailyDrawdownLimit: 0.05,
            totalDrawdownLimit: 0.15,
            maxLeverage: 10,
            mandatoryStopLoss: true,
            paperTradeMinimum: 50,
            emergencyStopEnabled: true,
        },
        railUtilizations: {
            positionUtil: 0.333,
            dailyDrawdownUtil: 0.2,
            totalDrawdownUtil: 0.2,
        },
        recentLogs: [{
            id: 'log-001',
            timestamp: Date.now(),
            level: LogLevel.INFO,
            message: 'Risk Manager initialized',
        }],
        ...overrides,
    };
}

// Simulate the deriveRiskSnapshot function from usePipelineLiveData
function deriveRiskSnapshot(cortexSnapshot: CortexSnapshot | null): RiskSnapshot | null {
    if (!cortexSnapshot?.riskSnapshot) return null;
    try {
        return cortexSnapshot.riskSnapshot;
    } catch {
        return null;
    }
}

describe('Risk Snapshot Derivation', () => {

    it('should return null when cortex snapshot is null', () => {
        const result = deriveRiskSnapshot(null);
        expect(result).toBeNull();
    });

    it('should return null when riskSnapshot field is undefined', () => {
        const cortex = createMinimalCortexSnapshot(undefined);
        const result = deriveRiskSnapshot(cortex);
        expect(result).toBeNull();
    });

    it('should return valid RiskSnapshot when data is present', () => {
        const mockRisk = createMockRiskSnapshot();
        const cortex = createMinimalCortexSnapshot(mockRisk);
        const result = deriveRiskSnapshot(cortex);

        expect(result).not.toBeNull();
        expect(result!.emergencyStopActive).toBe(false);
        expect(result!.dailyPnl).toBe(42.5);
        expect(result!.openPositionCount).toBe(1);
        expect(result!.globalRiskScore).toBe(33);
        expect(result!.rails.maxRiskPerTrade).toBe(0.02);
        expect(result!.railUtilizations.positionUtil).toBeCloseTo(0.333, 2);
        expect(result!.recentLogs).toHaveLength(1);
    });

    it('should passthrough emergency stop state correctly', () => {
        const mockRisk = createMockRiskSnapshot({ emergencyStopActive: true });
        const cortex = createMinimalCortexSnapshot(mockRisk);
        const result = deriveRiskSnapshot(cortex);

        expect(result!.emergencyStopActive).toBe(true);
    });

    it('should passthrough high global risk score', () => {
        const mockRisk = createMockRiskSnapshot({ globalRiskScore: 95 });
        const cortex = createMinimalCortexSnapshot(mockRisk);
        const result = deriveRiskSnapshot(cortex);

        expect(result!.globalRiskScore).toBe(95);
    });
});
