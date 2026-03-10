// ============================================================
// Learner: Boot Resilience Scorecard — Persistent Boot Telemetry
// ============================================================
// Phase 39 — RADICAL INNOVATION
//
// PURPOSE: Persists boot telemetry across browser sessions using
// localStorage. Tracks phase timing history, computes performance
// trends, and detects regressions in boot speed.
//
// Architecture:
//   1. Persistent History — Last 20 boot records in localStorage
//   2. Phase Trend Analysis — Linear regression per phase (IMPROVING/STABLE/DEGRADING)
//   3. Regression Detection — Alerts when current boot is >2σ slower than baseline
//   4. Boot Reliability Score — Tracks success/failure ratio across sessions
//
// Usage:
//   import { getBootScorecard } from './boot-resilience-scorecard';
//   const scorecard = getBootScorecard();
//   scorecard.recordBoot(bootState); // After each boot
//   const report = scorecard.getReport(); // For dashboard display
//
// ============================================================

import type { BootPhase, BootState } from '@/types';
import { bootLog } from '@/lib/utils/logger';

// ─── Constants ──────────────────────────────────────────────

const STORAGE_KEY = 'learner::boot-resilience-scorecard';
const MAX_HISTORY = 20;
const REGRESSION_SIGMA = 2; // Alert when > mean + 2σ

// ─── Types ──────────────────────────────────────────────────

export interface BootRecord {
    timestamp: number;
    totalDurationMs: number;
    phaseDurations: Partial<Record<string, number>>;
    success: boolean;
    mode: 'LIVE' | 'DEMO';
    recoveryTier: string | null; // Which tier succeeded (null = FULL, or tier name)
    healthGrade: string | null;
}

export type TrendDirection = 'IMPROVING' | 'STABLE' | 'DEGRADING';

export interface PhaseTrend {
    phase: string;
    meanMs: number;
    stdDevMs: number;
    trend: TrendDirection;
    slope: number; // ms per boot (negative = improving)
    sampleCount: number;
    lastMs: number;
    regressionDetected: boolean; // Current > mean + 2σ
}

export interface BootReliability {
    totalBoots: number;
    successRate: number; // 0-100%
    avgDurationMs: number;
    bestDurationMs: number;
    worstDurationMs: number;
    consecutiveSuccesses: number;
    lastFailureAge: number | null; // How many boots since last failure
}

export interface ScorecardReport {
    reliability: BootReliability;
    phaseTrends: PhaseTrend[];
    regressionsDetected: string[]; // Phase names with active regressions
    overallTrend: TrendDirection;
    historyCount: number;
}

// ─── Scorecard Class ────────────────────────────────────────

export class BootResilienceScorecard {
    private history: BootRecord[] = [];

    constructor() {
        this.loadFromStorage();
    }

    // ─── Public API ─────────────────────────────────────────

    /**
     * Record a boot attempt. Call after each resilientBoot completes.
     */
    recordBoot(state: BootState, recoveryTier?: string | null, healthGrade?: string | null): void {
        const record: BootRecord = {
            timestamp: Date.now(),
            totalDurationMs: state.bootDurationMs,
            phaseDurations: { ...state.phaseDurations },
            success: state.phase === ('READY' as BootPhase),
            mode: state.envStatus === 'valid' ? 'LIVE' : 'DEMO',
            recoveryTier: recoveryTier ?? null,
            healthGrade: healthGrade ?? null,
        };

        this.history.push(record);

        // Cap at MAX_HISTORY
        if (this.history.length > MAX_HISTORY) {
            this.history = this.history.slice(-MAX_HISTORY);
        }

        this.saveToStorage();

        bootLog.info('[Scorecard] Boot recorded', {
            duration: record.totalDurationMs,
            success: record.success,
            mode: record.mode,
            historySize: this.history.length,
        });
    }

    /**
     * Generate a comprehensive scorecard report.
     */
    getReport(): ScorecardReport {
        const reliability = this.computeReliability();
        const phaseTrends = this.computePhaseTrends();
        const regressionsDetected = phaseTrends
            .filter(t => t.regressionDetected)
            .map(t => t.phase);

        const overallTrend = this.computeOverallTrend(phaseTrends);

        return {
            reliability,
            phaseTrends,
            regressionsDetected,
            overallTrend,
            historyCount: this.history.length,
        };
    }

    /**
     * Get raw history for display.
     */
    getHistory(): BootRecord[] {
        return [...this.history];
    }

    /**
     * Clear all stored history.
     */
    clearHistory(): void {
        this.history = [];
        this.saveToStorage();
        bootLog.info('[Scorecard] History cleared');
    }

    // ─── Internal: Reliability ──────────────────────────────

    private computeReliability(): BootReliability {
        if (this.history.length === 0) {
            return {
                totalBoots: 0,
                successRate: 0,
                avgDurationMs: 0,
                bestDurationMs: 0,
                worstDurationMs: 0,
                consecutiveSuccesses: 0,
                lastFailureAge: null,
            };
        }

        const successful = this.history.filter(h => h.success);
        const durations = successful.map(h => h.totalDurationMs);

        // Consecutive successes from end
        let consecutive = 0;
        for (let i = this.history.length - 1; i >= 0; i--) {
            if (this.history[i].success) consecutive++;
            else break;
        }

        // Last failure age
        let lastFailureAge: number | null = null;
        for (let i = this.history.length - 1; i >= 0; i--) {
            if (!this.history[i].success) {
                lastFailureAge = this.history.length - 1 - i;
                break;
            }
        }

        return {
            totalBoots: this.history.length,
            successRate: this.history.length > 0
                ? Math.round((successful.length / this.history.length) * 100)
                : 0,
            avgDurationMs: durations.length > 0
                ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
                : 0,
            bestDurationMs: durations.length > 0 ? Math.min(...durations) : 0,
            worstDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
            consecutiveSuccesses: consecutive,
            lastFailureAge,
        };
    }

    // ─── Internal: Phase Trend Analysis ─────────────────────

    private computePhaseTrends(): PhaseTrend[] {
        const BOOT_PHASES = [
            'ENV_CHECK', 'PERSISTENCE', 'CORTEX_SPAWN',
            'HISTORICAL_SEED', 'WS_CONNECT', 'EVOLUTION_START', 'READY',
        ];

        return BOOT_PHASES.map(phase => this.computeSinglePhaseTrend(phase));
    }

    private computeSinglePhaseTrend(phase: string): PhaseTrend {
        const samples = this.history
            .filter(h => h.success && h.phaseDurations[phase] != null)
            .map(h => h.phaseDurations[phase]!);

        if (samples.length === 0) {
            return {
                phase,
                meanMs: 0,
                stdDevMs: 0,
                trend: 'STABLE',
                slope: 0,
                sampleCount: 0,
                lastMs: 0,
                regressionDetected: false,
            };
        }

        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length;
        const stdDev = Math.sqrt(variance);
        const lastMs = samples[samples.length - 1];

        // Linear regression: slope = trend direction
        const slope = this.linearRegressionSlope(samples);

        // Regression detection: current > mean + 2σ
        const regressionThreshold = mean + REGRESSION_SIGMA * stdDev;
        const regressionDetected = samples.length >= 3 && lastMs > regressionThreshold && stdDev > 0;

        // Trend classification
        let trend: TrendDirection = 'STABLE';
        if (samples.length >= 3) {
            const normalizedSlope = mean > 0 ? slope / mean : 0;
            if (normalizedSlope < -0.05) trend = 'IMPROVING';
            else if (normalizedSlope > 0.05) trend = 'DEGRADING';
        }

        return {
            phase,
            meanMs: Math.round(mean),
            stdDevMs: Math.round(stdDev),
            trend,
            slope: Math.round(slope * 100) / 100,
            sampleCount: samples.length,
            lastMs: Math.round(lastMs),
            regressionDetected,
        };
    }

    private linearRegressionSlope(values: number[]): number {
        const n = values.length;
        if (n < 2) return 0;

        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += values[i];
            sumXY += i * values[i];
            sumXX += i * i;
        }

        const denominator = n * sumXX - sumX * sumX;
        if (denominator === 0) return 0;

        return (n * sumXY - sumX * sumY) / denominator;
    }

    // ─── Internal: Overall Trend ────────────────────────────

    private computeOverallTrend(phaseTrends: PhaseTrend[]): TrendDirection {
        const activeTrends = phaseTrends.filter(t => t.sampleCount >= 3);
        if (activeTrends.length === 0) return 'STABLE';

        const improving = activeTrends.filter(t => t.trend === 'IMPROVING').length;
        const degrading = activeTrends.filter(t => t.trend === 'DEGRADING').length;

        if (degrading > improving) return 'DEGRADING';
        if (improving > degrading) return 'IMPROVING';
        return 'STABLE';
    }

    // ─── Internal: Storage ──────────────────────────────────

    private loadFromStorage(): void {
        try {
            if (typeof window === 'undefined') return;
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.history = parsed.slice(-MAX_HISTORY);
                }
            }
        } catch (error) {
            bootLog.warn('[Scorecard] Failed to load history', {
                error: error instanceof Error ? error.message : 'unknown',
            });
            this.history = [];
        }
    }

    private saveToStorage(): void {
        try {
            if (typeof window === 'undefined') return;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
        } catch (error) {
            bootLog.warn('[Scorecard] Failed to save history', {
                error: error instanceof Error ? error.message : 'unknown',
            });
        }
    }
}

// ─── Singleton ──────────────────────────────────────────────

let scorecardInstance: BootResilienceScorecard | null = null;

export function getBootScorecard(): BootResilienceScorecard {
    if (!scorecardInstance) {
        scorecardInstance = new BootResilienceScorecard();
    }
    return scorecardInstance;
}
