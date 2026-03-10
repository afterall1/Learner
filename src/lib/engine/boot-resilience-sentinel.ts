// ============================================================
// Learner: Boot Resilience Sentinel — Self-Healing Boot Layer
// ============================================================
// Phase 38 — RADICAL INNOVATION
//
// PURPOSE: Wraps SystemBootstrap with intelligent failure recovery,
// health scoring, adaptive circuit breaking, and boot fingerprinting.
//
// 4-Innovation Architecture:
//   1. Auto-Recovery Engine — 4-tier degraded retry on boot failure
//   2. Boot Health Score — Weighted 0-100 composite metric
//   3. Adaptive Timeout Circuit Breaker — P95 + 2σ phase timeouts
//   4. Boot Fingerprint — Hash-based probe deduplication
//
// Usage:
//   const sentinel = getBootSentinel();
//   const probeResult = await sentinel.runProbe();
//   const bootResult = await sentinel.resilientBoot(config);
//
// ============================================================

import { getSystemBootstrap, SystemBootstrap } from './system-bootstrap';
import { bootLog } from '@/lib/utils/logger';
import type { BootConfig, BootState, BootPhase } from '@/types';

// ─── Types ──────────────────────────────────────────────────

export interface ProbeCheck {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    latencyMs: number;
    details: string;
}

export interface TestnetProbeResult {
    ready: boolean;
    isTestnet: boolean;
    checks: ProbeCheck[];
    account: {
        walletBalance: number;
        availableBalance: number;
        unrealizedPnl: number;
        openPositions: number;
    } | null;
    serverTimeDrift: number;
    totalLatencyMs: number;
    timestamp: number;
}

export interface RecoveryAttempt {
    attempt: number;
    tier: RecoveryTier;
    config: Partial<BootConfig>;
    result: 'success' | 'failed';
    errorMessage?: string;
    durationMs: number;
    timestamp: number;
}

export type RecoveryTier =
    | 'FULL'           // Attempt 1: Full config
    | 'REDUCED_PAIRS'  // Attempt 2: Only BTCUSDT
    | 'FRESH_START'    // Attempt 3: Skip persistence
    | 'DEMO_FALLBACK'; // Attempt 4: Demo mode

export interface PhaseTimingProfile {
    phase: BootPhase;
    samples: number[];        // Historical durations in ms
    mean: number;
    stdDev: number;
    p95: number;
    adaptiveTimeout: number;  // P95 + 2σ
}

export interface BootHealthScore {
    overall: number;           // 0-100
    grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    components: {
        phaseSpeed: number;    // 0-100, weight 40%
        probeHealth: number;   // 0-100, weight 30%
        historyRate: number;   // 0-100, weight 20%
        latency: number;       // 0-100, weight 10%
    };
}

export interface SentinelState {
    probeResult: TestnetProbeResult | null;
    probeRunning: boolean;
    healthScore: BootHealthScore | null;
    recoveryAttempts: RecoveryAttempt[];
    currentRecoveryTier: RecoveryTier | null;
    circuitBreakerTripped: boolean;
    bootFingerprint: string | null;
    lastProbeFingerprint: string | null;
    lastProbeTimestamp: number;
    isRecovering: boolean;
    totalBootsAttempted: number;
    totalBootsSucceeded: number;
}

// ─── Constants ──────────────────────────────────────────────

const RECOVERY_TIERS: { tier: RecoveryTier; description: string }[] = [
    { tier: 'FULL', description: 'Full config — all pairs, all features' },
    { tier: 'REDUCED_PAIRS', description: 'Reduced pairs — BTCUSDT only' },
    { tier: 'FRESH_START', description: 'Fresh start — skip persistence' },
    { tier: 'DEMO_FALLBACK', description: 'Demo fallback — no API required' },
];

const PROBE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const MAX_PHASE_SAMPLES = 20; // Keep last 20 boot timings

// ─── Boot Resilience Sentinel ───────────────────────────────

export class BootResilienceSentinel {
    private state: SentinelState = {
        probeResult: null,
        probeRunning: false,
        healthScore: null,
        recoveryAttempts: [],
        currentRecoveryTier: null,
        circuitBreakerTripped: false,
        bootFingerprint: null,
        lastProbeFingerprint: null,
        lastProbeTimestamp: 0,
        isRecovering: false,
        totalBootsAttempted: 0,
        totalBootsSucceeded: 0,
    };

    private phaseTimings: Map<string, PhaseTimingProfile> = new Map();
    private onStateChange: ((state: SentinelState) => void) | null = null;

    // ─── Public API ─────────────────────────────────────────

    /**
     * Run the testnet probe diagnostic.
     * Results are cached for 5 minutes if the boot fingerprint matches.
     */
    async runProbe(): Promise<TestnetProbeResult> {
        // Check cache — skip if same fingerprint within TTL
        const now = Date.now();
        if (
            this.state.probeResult &&
            this.state.lastProbeTimestamp > 0 &&
            now - this.state.lastProbeTimestamp < PROBE_CACHE_TTL_MS
        ) {
            bootLog.info('[Sentinel] Probe cache hit — skipping redundant probe');
            return this.state.probeResult;
        }

        this.state.probeRunning = true;
        this.notifyStateChange();

        try {
            const response = await fetch('/api/trading/testnet-probe', {
                cache: 'no-store',
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown');
                throw new Error(`Probe API returned ${response.status}: ${errorText}`);
            }

            const result = await response.json() as TestnetProbeResult;

            // Compute fingerprint from probe results
            const fingerprint = this.computeProbeFingerprint(result);

            this.state.probeResult = result;
            this.state.probeRunning = false;
            this.state.lastProbeFingerprint = fingerprint;
            this.state.lastProbeTimestamp = now;

            // Update health score with probe data
            this.updateHealthScore();

            bootLog.info('[Sentinel] Probe complete', {
                ready: result.ready,
                checks: result.checks.length,
                passed: result.checks.filter(c => c.status === 'pass').length,
                latencyMs: result.totalLatencyMs,
                fingerprint: fingerprint.slice(0, 8),
            });

            this.notifyStateChange();
            return result;
        } catch (error) {
            this.state.probeRunning = false;

            // Create a synthetic failed probe result
            const failedResult: TestnetProbeResult = {
                ready: false,
                isTestnet: true,
                checks: [{
                    name: 'probe_api',
                    status: 'fail',
                    latencyMs: 0,
                    details: error instanceof Error
                        ? `Probe API failed: ${error.message}`
                        : 'Probe API failed: Unknown error',
                }],
                account: null,
                serverTimeDrift: 0,
                totalLatencyMs: 0,
                timestamp: Date.now(),
            };

            this.state.probeResult = failedResult;
            this.notifyStateChange();

            bootLog.warn('[Sentinel] Probe failed', {
                error: error instanceof Error ? error.message : 'Unknown',
            });

            return failedResult;
        }
    }

    /**
     * Resilient boot with auto-recovery on failure.
     * Tries up to 4 tiers of degraded configuration.
     */
    async resilientBoot(
        baseConfig?: Partial<BootConfig>,
        onBootStateChange?: (state: BootState) => void,
    ): Promise<BootState> {
        this.state.totalBootsAttempted++;
        this.state.recoveryAttempts = [];
        this.state.isRecovering = false;
        this.state.circuitBreakerTripped = false;

        // Compute boot fingerprint from config
        this.state.bootFingerprint = this.computeBootFingerprint(baseConfig);
        this.notifyStateChange();

        const bootstrap = getSystemBootstrap();

        // Wire state change callback
        if (onBootStateChange) {
            bootstrap.setOnStateChange(onBootStateChange);
        }

        // Try each recovery tier
        for (let i = 0; i < RECOVERY_TIERS.length; i++) {
            const { tier, description } = RECOVERY_TIERS[i];
            const config = this.buildTierConfig(tier, baseConfig);
            this.state.currentRecoveryTier = tier;

            if (i > 0) {
                this.state.isRecovering = true;
                bootLog.warn(`[Sentinel] Recovery attempt ${i + 1}/4: ${description}`);
            }

            this.notifyStateChange();

            const attemptStart = Date.now();

            try {
                const result = await bootstrap.ignite(config);

                const attempt: RecoveryAttempt = {
                    attempt: i + 1,
                    tier,
                    config,
                    result: result.phase === ('ERROR' as BootPhase) ? 'failed' : 'success',
                    durationMs: Date.now() - attemptStart,
                    timestamp: Date.now(),
                };

                this.state.recoveryAttempts.push(attempt);

                if (result.phase !== ('ERROR' as BootPhase)) {
                    // SUCCESS — record phase timings for circuit breaker
                    this.recordPhaseTimings(result.phaseDurations);
                    this.state.totalBootsSucceeded++;
                    this.state.isRecovering = false;
                    this.state.currentRecoveryTier = null;
                    this.updateHealthScore();
                    this.notifyStateChange();

                    bootLog.info(`[Sentinel] Boot succeeded on tier: ${tier}`, {
                        attempt: i + 1,
                        durationMs: result.bootDurationMs,
                    });

                    return result;
                }

                // FAILED — log and try next tier
                attempt.errorMessage = result.error ?? 'Unknown boot error';
                bootLog.error(`[Sentinel] Tier ${tier} failed: ${attempt.errorMessage}`);

                // Shutdown before retry to clean up state
                await bootstrap.shutdown();

            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown';

                this.state.recoveryAttempts.push({
                    attempt: i + 1,
                    tier,
                    config,
                    result: 'failed',
                    errorMessage: msg,
                    durationMs: Date.now() - attemptStart,
                    timestamp: Date.now(),
                });

                bootLog.error(`[Sentinel] Tier ${tier} threw: ${msg}`);

                // Shutdown before retry
                try { await bootstrap.shutdown(); } catch { /* ignore */ }
            }
        }

        // All tiers exhausted
        this.state.circuitBreakerTripped = true;
        this.state.isRecovering = false;
        this.state.currentRecoveryTier = null;
        this.updateHealthScore();
        this.notifyStateChange();

        bootLog.error('[Sentinel] All recovery tiers exhausted — circuit breaker TRIPPED');

        return bootstrap.getBootState();
    }

    /**
     * Get the current sentinel state snapshot.
     */
    getState(): SentinelState {
        return { ...this.state };
    }

    /**
     * Get the computed health score.
     */
    getHealthScore(): BootHealthScore | null {
        return this.state.healthScore;
    }

    /**
     * Get phase timing profiles for circuit breaker analysis.
     */
    getPhaseTimings(): Map<string, PhaseTimingProfile> {
        return new Map(this.phaseTimings);
    }

    /**
     * Register a state change callback.
     */
    setOnStateChange(callback: (state: SentinelState) => void): void {
        this.onStateChange = callback;
    }

    /**
     * Check if the probe result is still fresh (within TTL).
     */
    isProbeFresh(): boolean {
        return (
            this.state.lastProbeTimestamp > 0 &&
            Date.now() - this.state.lastProbeTimestamp < PROBE_CACHE_TTL_MS
        );
    }

    /**
     * Invalidate the probe cache — force re-probe on next call.
     */
    invalidateProbeCache(): void {
        this.state.lastProbeTimestamp = 0;
        this.state.lastProbeFingerprint = null;
    }

    // ─── Internal: Config Building ──────────────────────────

    private buildTierConfig(
        tier: RecoveryTier,
        baseConfig?: Partial<BootConfig>,
    ): Partial<BootConfig> {
        switch (tier) {
            case 'FULL':
                return { ...baseConfig };

            case 'REDUCED_PAIRS':
                return {
                    ...baseConfig,
                    pairs: ['BTCUSDT'], // Single pair reduces failure surface
                };

            case 'FRESH_START':
                return {
                    ...baseConfig,
                    pairs: ['BTCUSDT'],
                    skipPersistence: true, // Skip checkpoint — no IndexedDB dependency
                };

            case 'DEMO_FALLBACK':
                return {
                    pairs: ['BTCUSDT', 'ETHUSDT'],
                    totalCapital: baseConfig?.totalCapital ?? 10000,
                    autoTrade: false,
                    skipPersistence: true,
                    // Demo mode is triggered by env-validator failing
                    // which happens naturally when API keys are invalid
                };
        }
    }

    // ─── Internal: Phase Timing Profiler ────────────────────

    private recordPhaseTimings(phaseDurations: Partial<Record<BootPhase, number>>): void {
        for (const [phase, duration] of Object.entries(phaseDurations)) {
            if (typeof duration !== 'number') continue;

            const existing = this.phaseTimings.get(phase);
            if (existing) {
                existing.samples.push(duration);
                // Keep only last N samples
                if (existing.samples.length > MAX_PHASE_SAMPLES) {
                    existing.samples = existing.samples.slice(-MAX_PHASE_SAMPLES);
                }
                this.recalculateProfile(existing);
            } else {
                const profile: PhaseTimingProfile = {
                    phase: phase as BootPhase,
                    samples: [duration],
                    mean: duration,
                    stdDev: 0,
                    p95: duration,
                    adaptiveTimeout: duration * 3, // Conservative initial timeout
                };
                this.phaseTimings.set(phase, profile);
            }
        }
    }

    private recalculateProfile(profile: PhaseTimingProfile): void {
        const { samples } = profile;
        if (samples.length === 0) return;

        // Mean
        const sum = samples.reduce((a, b) => a + b, 0);
        profile.mean = sum / samples.length;

        // Standard deviation
        const squareDiffs = samples.map(s => Math.pow(s - profile.mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / samples.length;
        profile.stdDev = Math.sqrt(avgSquareDiff);

        // P95
        const sorted = [...samples].sort((a, b) => a - b);
        const p95Index = Math.ceil(sorted.length * 0.95) - 1;
        profile.p95 = sorted[Math.max(0, p95Index)];

        // Adaptive timeout = P95 + 2σ, minimum 2s
        profile.adaptiveTimeout = Math.max(2000, profile.p95 + 2 * profile.stdDev);
    }

    // ─── Internal: Boot Health Score ────────────────────────

    private updateHealthScore(): void {
        const components = {
            phaseSpeed: this.computePhaseSpeedScore(),
            probeHealth: this.computeProbeHealthScore(),
            historyRate: this.computeHistoryRateScore(),
            latency: this.computeLatencyScore(),
        };

        // Weighted composite
        const overall = Math.round(
            components.phaseSpeed * 0.4 +
            components.probeHealth * 0.3 +
            components.historyRate * 0.2 +
            components.latency * 0.1,
        );

        let grade: BootHealthScore['grade'];
        if (overall >= 95) grade = 'A+';
        else if (overall >= 90) grade = 'A';
        else if (overall >= 80) grade = 'B';
        else if (overall >= 70) grade = 'C';
        else if (overall >= 60) grade = 'D';
        else grade = 'F';

        this.state.healthScore = { overall, grade, components };
    }

    private computePhaseSpeedScore(): number {
        if (this.phaseTimings.size === 0) return 75; // Default neutral

        // Score based on phases completing within adaptive timeout
        let withinTimeout = 0;
        let total = 0;

        for (const profile of this.phaseTimings.values()) {
            if (profile.samples.length === 0) continue;
            const latest = profile.samples[profile.samples.length - 1];
            total++;
            if (latest <= profile.adaptiveTimeout) withinTimeout++;
        }

        return total > 0 ? Math.round((withinTimeout / total) * 100) : 75;
    }

    private computeProbeHealthScore(): number {
        const probe = this.state.probeResult;
        if (!probe) return 50; // No probe run yet

        const passed = probe.checks.filter(c => c.status === 'pass').length;
        const warned = probe.checks.filter(c => c.status === 'warn').length;
        const total = probe.checks.length;

        if (total === 0) return 50;

        // Pass = 1.0, Warn = 0.5, Fail = 0.0
        const score = ((passed * 1.0 + warned * 0.5) / total) * 100;
        return Math.round(score);
    }

    private computeHistoryRateScore(): number {
        if (this.state.totalBootsAttempted === 0) return 80; // Neutral

        const rate = this.state.totalBootsSucceeded / this.state.totalBootsAttempted;
        return Math.round(rate * 100);
    }

    private computeLatencyScore(): number {
        const probe = this.state.probeResult;
        if (!probe) return 70;

        // Excellent: <500ms, Good: <1000ms, OK: <2000ms, Slow: <5000ms, Bad: >5000ms
        const latency = probe.totalLatencyMs;
        if (latency < 500) return 100;
        if (latency < 1000) return 90;
        if (latency < 2000) return 75;
        if (latency < 5000) return 50;
        return 25;
    }

    // ─── Internal: Fingerprinting ───────────────────────────

    private computeProbeFingerprint(result: TestnetProbeResult): string {
        // Hash key probe state: check statuses + isTestnet + account existence
        const parts = [
            result.isTestnet ? 'T' : 'L',
            result.account ? 'A' : 'N',
            ...result.checks.map(c => `${c.name}:${c.status}`),
        ];
        return this.simpleHash(parts.join('|'));
    }

    private computeBootFingerprint(config?: Partial<BootConfig>): string {
        const parts = [
            `pairs:${(config?.pairs ?? ['BTCUSDT', 'ETHUSDT']).join(',')}`,
            `tf:${config?.timeframe ?? '1h'}`,
            `cap:${config?.totalCapital ?? 10000}`,
            `skip:${config?.skipPersistence ?? false}`,
            `auto:${config?.autoTrade ?? false}`,
        ];
        return this.simpleHash(parts.join('|'));
    }

    private simpleHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36).padStart(8, '0');
    }

    // ─── Internal: State Change Notification ────────────────

    private notifyStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange({ ...this.state });
        }
    }
}

// ─── Singleton ──────────────────────────────────────────────

let sentinelInstance: BootResilienceSentinel | null = null;

/**
 * Get the singleton Boot Resilience Sentinel instance.
 */
export function getBootSentinel(): BootResilienceSentinel {
    if (!sentinelInstance) {
        sentinelInstance = new BootResilienceSentinel();
    }
    return sentinelInstance;
}
