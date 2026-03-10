// ============================================================
// Suite 12: Boot Resilience Sentinel Tests
// Verifies 4-tier auto-recovery, circuit breaker, health scoring,
// probe caching, boot fingerprinting, and config degradation.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BootState, BootPhase, BootConfig } from '@/types';

// ─── Configurable Mock State ────────────────────────────────
// These globals control the behavior of the mocked SystemBootstrap.
// Tests set these before calling sentinel methods.

let mockIgniteHandler: (config?: Partial<BootConfig>) => Promise<BootState>;
let mockShutdownCount = 0;
let mockSetOnStateChangeCount = 0;

function createBootState(overrides: Partial<BootState> = {}): BootState {
    return {
        phase: 'READY' as BootPhase,
        progress: {
            phase: 'READY' as BootPhase,
            overallPercent: 100,
            message: 'System live',
            slotProgress: { completed: 2, total: 2, currentSlot: '' },
        },
        envStatus: 'valid',
        persistenceStatus: 'hydrated',
        cortexStatus: 'spawned',
        seedStatus: 'complete',
        wsStatus: 'connected',
        evolutionStatus: 'active',
        bootDurationMs: 5000,
        phaseDurations: {
            ENV_CHECK: 100,
            PERSISTENCE: 50,
            CORTEX_SPAWN: 30,
            HISTORICAL_SEED: 3000,
            WS_CONNECT: 20,
            EVOLUTION_START: 10,
            READY: 5,
        } as Partial<Record<BootPhase, number>>,
        error: null,
        hasBooted: true,
        ...overrides,
    };
}

function createErrorState(msg: string): BootState {
    return createBootState({
        phase: 'ERROR' as BootPhase,
        error: msg,
        hasBooted: false,
        envStatus: 'invalid',
        bootDurationMs: 1000,
    });
}

// ─── Hoisted Mock ───────────────────────────────────────────
// vi.mock is hoisted above imports. The mock factory uses the
// global mockIgniteHandler so tests can control ignite behavior.

vi.mock('@/lib/engine/system-bootstrap', () => ({
    getSystemBootstrap: vi.fn(() => ({
        ignite: vi.fn(async (config?: Partial<BootConfig>) => {
            return mockIgniteHandler(config);
        }),
        shutdown: vi.fn(async () => { mockShutdownCount++; }),
        setOnStateChange: vi.fn(() => { mockSetOnStateChangeCount++; }),
        getBootState: vi.fn(() => createErrorState('All tiers exhausted')),
    })),
    SystemBootstrap: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
    bootLog: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// Import AFTER mocking
import { BootResilienceSentinel } from '@/lib/engine/boot-resilience-sentinel';

// ─── Test Suite ─────────────────────────────────────────────

describe('Boot Resilience Sentinel', () => {
    let sentinel: BootResilienceSentinel;

    beforeEach(() => {
        sentinel = new BootResilienceSentinel();
        mockShutdownCount = 0;
        mockSetOnStateChangeCount = 0;
        // Default: always succeed
        mockIgniteHandler = async () => createBootState();
    });

    // ═══ 1. 4-Tier Auto-Recovery ═══════════════════════════

    describe('4-Tier Auto-Recovery', () => {

        it('should succeed on first attempt (FULL tier) without recovery', async () => {
            mockIgniteHandler = async () => createBootState();

            const result = await sentinel.resilientBoot();

            expect(result.phase).toBe('READY');
            const state = sentinel.getState();
            expect(state.isRecovering).toBe(false);
            expect(state.recoveryAttempts).toHaveLength(1);
            expect(state.recoveryAttempts[0].tier).toBe('FULL');
            expect(state.recoveryAttempts[0].result).toBe('success');
            expect(state.totalBootsSucceeded).toBe(1);
            expect(mockShutdownCount).toBe(0);
        });

        it('should cascade to tier 2 (REDUCED_PAIRS) when tier 1 fails', async () => {
            let callCount = 0;
            mockIgniteHandler = async () => {
                callCount++;
                if (callCount === 1) return createErrorState('ENV_CHECK failed');
                return createBootState();
            };

            const result = await sentinel.resilientBoot({ pairs: ['BTCUSDT', 'ETHUSDT'] });

            expect(result.phase).toBe('READY');
            expect(callCount).toBe(2);
            expect(mockShutdownCount).toBe(1);

            const state = sentinel.getState();
            expect(state.recoveryAttempts).toHaveLength(2);
            expect(state.recoveryAttempts[0].result).toBe('failed');
            expect(state.recoveryAttempts[0].tier).toBe('FULL');
            expect(state.recoveryAttempts[1].result).toBe('success');
            expect(state.recoveryAttempts[1].tier).toBe('REDUCED_PAIRS');
        });

        it('should cascade through tiers 1→2→3 when first two fail', async () => {
            let callCount = 0;
            mockIgniteHandler = async () => {
                callCount++;
                if (callCount <= 2) return createErrorState('fail');
                return createBootState();
            };

            const result = await sentinel.resilientBoot();

            expect(result.phase).toBe('READY');
            expect(callCount).toBe(3);
            expect(mockShutdownCount).toBe(2);

            const state = sentinel.getState();
            expect(state.recoveryAttempts).toHaveLength(3);
            expect(state.recoveryAttempts[2].tier).toBe('FRESH_START');
            expect(state.recoveryAttempts[2].result).toBe('success');
        });

        it('should track isRecovering=true for attempts after the first', async () => {
            const recoveryStates: boolean[] = [];
            sentinel.setOnStateChange((s) => {
                if (s.currentRecoveryTier !== null) {
                    recoveryStates.push(s.isRecovering);
                }
            });

            let callCount = 0;
            mockIgniteHandler = async () => {
                callCount++;
                if (callCount === 1) return createErrorState('fail');
                return createBootState();
            };

            await sentinel.resilientBoot();

            expect(recoveryStates.some(r => r === false)).toBe(true);  // Tier 1
            expect(recoveryStates.some(r => r === true)).toBe(true);   // Tier 2+
        });

        it('should handle thrown exceptions during ignite gracefully', async () => {
            let callCount = 0;
            mockIgniteHandler = async () => {
                callCount++;
                if (callCount === 1) throw new Error('Network timeout');
                return createBootState();
            };

            const result = await sentinel.resilientBoot();

            expect(result.phase).toBe('READY');
            const state = sentinel.getState();
            expect(state.recoveryAttempts[0].result).toBe('failed');
            expect(state.recoveryAttempts[0].errorMessage).toBe('Network timeout');
            expect(state.recoveryAttempts[1].result).toBe('success');
        });
    });

    // ═══ 2. Circuit Breaker ═════════════════════════════════

    describe('Circuit Breaker', () => {

        it('should trip circuit breaker when all 4 tiers fail', async () => {
            mockIgniteHandler = async () => createErrorState('persistent failure');

            const result = await sentinel.resilientBoot();

            expect(result.phase).toBe('ERROR');

            const state = sentinel.getState();
            expect(state.circuitBreakerTripped).toBe(true);
            expect(state.isRecovering).toBe(false);
            expect(state.currentRecoveryTier).toBeNull();
            expect(state.totalBootsAttempted).toBe(1);
            expect(state.totalBootsSucceeded).toBe(0);
            expect(state.recoveryAttempts).toHaveLength(4);
        });

        it('should increment totalBootsAttempted but not totalBootsSucceeded on full failure', async () => {
            mockIgniteHandler = async () => createErrorState('fail');

            await sentinel.resilientBoot();

            const state = sentinel.getState();
            expect(state.totalBootsAttempted).toBe(1);
            expect(state.totalBootsSucceeded).toBe(0);
        });

        it('should call shutdown between all failed tiers', async () => {
            mockIgniteHandler = async () => createErrorState('fail');

            await sentinel.resilientBoot();

            // Each failed tier calls shutdown before next attempt
            expect(mockShutdownCount).toBe(4);
        });
    });

    // ═══ 3. Boot Health Score ════════════════════════════════

    describe('Boot Health Score', () => {

        it('should return null health score before any boot', () => {
            expect(sentinel.getHealthScore()).toBeNull();
        });

        it('should compute health score after successful boot', async () => {
            mockIgniteHandler = async () => createBootState();

            await sentinel.resilientBoot();

            const health = sentinel.getHealthScore();
            expect(health).not.toBeNull();
            expect(health!.overall).toBeGreaterThanOrEqual(0);
            expect(health!.overall).toBeLessThanOrEqual(100);
            expect(['A+', 'A', 'B', 'C', 'D', 'F']).toContain(health!.grade);
        });

        it('should have valid component scores (0-100 each)', async () => {
            mockIgniteHandler = async () => createBootState();

            await sentinel.resilientBoot();

            const health = sentinel.getHealthScore()!;
            expect(health.components.phaseSpeed).toBeGreaterThanOrEqual(0);
            expect(health.components.phaseSpeed).toBeLessThanOrEqual(100);
            expect(health.components.probeHealth).toBeGreaterThanOrEqual(0);
            expect(health.components.probeHealth).toBeLessThanOrEqual(100);
            expect(health.components.historyRate).toBeGreaterThanOrEqual(0);
            expect(health.components.historyRate).toBeLessThanOrEqual(100);
            expect(health.components.latency).toBeGreaterThanOrEqual(0);
            expect(health.components.latency).toBeLessThanOrEqual(100);
        });

        it('should assign correct grade thresholds', async () => {
            mockIgniteHandler = async () => createBootState();
            await sentinel.resilientBoot();

            const health = sentinel.getHealthScore()!;
            if (health.overall >= 95) expect(health.grade).toBe('A+');
            else if (health.overall >= 90) expect(health.grade).toBe('A');
            else if (health.overall >= 80) expect(health.grade).toBe('B');
            else if (health.overall >= 70) expect(health.grade).toBe('C');
            else if (health.overall >= 60) expect(health.grade).toBe('D');
            else expect(health.grade).toBe('F');
        });
    });

    // ═══ 4. Probe Cache ═════════════════════════════════════

    describe('Probe Cache', () => {

        it('should report probe not fresh initially', () => {
            expect(sentinel.isProbeFresh()).toBe(false);
        });

        it('should invalidate probe cache when called', () => {
            sentinel.invalidateProbeCache();

            const state = sentinel.getState();
            expect(state.lastProbeTimestamp).toBe(0);
            expect(state.lastProbeFingerprint).toBeNull();
        });
    });

    // ═══ 5. Boot Fingerprint ════════════════════════════════

    describe('Boot Fingerprint', () => {

        it('should compute boot fingerprint from config', async () => {
            mockIgniteHandler = async () => createBootState();

            await sentinel.resilientBoot({ pairs: ['BTCUSDT'] });

            const state = sentinel.getState();
            expect(state.bootFingerprint).toBeTruthy();
            expect(typeof state.bootFingerprint).toBe('string');
            expect(state.bootFingerprint!.length).toBeGreaterThanOrEqual(4);
        });

        it('should produce different fingerprints for different configs', async () => {
            mockIgniteHandler = async () => createBootState();

            await sentinel.resilientBoot({ pairs: ['BTCUSDT'] });
            const fp1 = sentinel.getState().bootFingerprint;

            sentinel = new BootResilienceSentinel();
            await sentinel.resilientBoot({ pairs: ['ETHUSDT', 'SOLUSDT'] });
            const fp2 = sentinel.getState().bootFingerprint;

            expect(fp1).not.toBe(fp2);
        });

        it('should produce same fingerprint for same config', async () => {
            const config = { pairs: ['BTCUSDT', 'ETHUSDT'], totalCapital: 5000 };
            mockIgniteHandler = async () => createBootState();

            await sentinel.resilientBoot(config);
            const fp1 = sentinel.getState().bootFingerprint;

            sentinel = new BootResilienceSentinel();
            await sentinel.resilientBoot(config);
            const fp2 = sentinel.getState().bootFingerprint;

            expect(fp1).toBe(fp2);
        });
    });

    // ═══ 6. Config Degradation ══════════════════════════════

    describe('Config Degradation', () => {

        it('should pass full config on tier 1 (FULL)', async () => {
            const receivedConfigs: Partial<BootConfig>[] = [];
            mockIgniteHandler = async (config) => {
                receivedConfigs.push(config ?? {});
                return createBootState();
            };

            await sentinel.resilientBoot({ pairs: ['BTCUSDT', 'ETHUSDT'] });

            expect(receivedConfigs[0].pairs).toEqual(['BTCUSDT', 'ETHUSDT']);
        });

        it('should reduce pairs to BTCUSDT on tier 2 (REDUCED_PAIRS)', async () => {
            const receivedConfigs: Partial<BootConfig>[] = [];
            let callCount = 0;
            mockIgniteHandler = async (config) => {
                receivedConfigs.push(config ?? {});
                callCount++;
                if (callCount === 1) return createErrorState('fail');
                return createBootState();
            };

            await sentinel.resilientBoot({ pairs: ['BTCUSDT', 'ETHUSDT'] });

            expect(receivedConfigs[1].pairs).toEqual(['BTCUSDT']);
        });

        it('should skip persistence on tier 3 (FRESH_START)', async () => {
            const receivedConfigs: Partial<BootConfig>[] = [];
            let callCount = 0;
            mockIgniteHandler = async (config) => {
                receivedConfigs.push(config ?? {});
                callCount++;
                if (callCount <= 2) return createErrorState('fail');
                return createBootState();
            };

            await sentinel.resilientBoot({ pairs: ['BTCUSDT', 'ETHUSDT'] });

            expect(receivedConfigs[2].skipPersistence).toBe(true);
            expect(receivedConfigs[2].pairs).toEqual(['BTCUSDT']);
        });

        it('should force demo fallback on tier 4 (DEMO_FALLBACK)', async () => {
            const receivedConfigs: Partial<BootConfig>[] = [];
            let callCount = 0;
            mockIgniteHandler = async (config) => {
                receivedConfigs.push(config ?? {});
                callCount++;
                if (callCount <= 3) return createErrorState('fail');
                return createBootState();
            };

            await sentinel.resilientBoot({ pairs: ['BTCUSDT', 'ETHUSDT'], totalCapital: 5000 });

            expect(receivedConfigs[3].autoTrade).toBe(false);
            expect(receivedConfigs[3].skipPersistence).toBe(true);
            expect(receivedConfigs[3].totalCapital).toBe(5000);
        });
    });

    // ═══ 7. State Change Notifications ══════════════════════

    describe('State Change Notifications', () => {

        it('should fire state change callbacks during resilient boot', async () => {
            let notificationCount = 0;
            sentinel.setOnStateChange(() => { notificationCount++; });

            mockIgniteHandler = async () => createBootState();
            await sentinel.resilientBoot();

            // At least 3: fingerprint, tier start, success
            expect(notificationCount).toBeGreaterThanOrEqual(3);
        });

        it('should fire more notifications with more recovery tiers', async () => {
            let singleTierCount = 0;
            sentinel.setOnStateChange(() => { singleTierCount++; });
            mockIgniteHandler = async () => createBootState();
            await sentinel.resilientBoot();

            // Reset
            sentinel = new BootResilienceSentinel();
            let multiTierCount = 0;
            sentinel.setOnStateChange(() => { multiTierCount++; });
            let callCount = 0;
            mockIgniteHandler = async () => {
                callCount++;
                if (callCount <= 2) return createErrorState('fail');
                return createBootState();
            };
            await sentinel.resilientBoot();

            expect(multiTierCount).toBeGreaterThan(singleTierCount);
        });
    });
});
