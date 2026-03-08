// ============================================================
// Learner: Backtest Performance Profiler
// ============================================================
// Phase 34 RADICAL INNOVATION: Self-aware performance telemetry
// for the backtesting pipeline. Measures real-time execution
// costs, memory pressure, cache efficiency, and produces
// actionable diagnostics for adaptive tuning.
//
// Key innovation: The profiler doesn't just measure — it
// RECOMMENDS. It analyzes bottleneck patterns and suggests
// optimal cache sizes, regime detection intervals, and
// population batch sizes based on observed workload.
//
// Usage:
//   const profiler = BacktestProfiler.getInstance();
//   profiler.startSession('BTCUSDT:1h', 20, 1000);
//   // ... run backtests ...
//   profiler.endSession();
//   const report = profiler.getReport();
//   console.log(report.recommendations);
// ============================================================

// ─── Profiler Types ──────────────────────────────────────────

export interface PhaseTimer {
    name: string;
    startMs: number;
    endMs: number;
    durationMs: number;
}

export interface CacheProfileSnapshot {
    totalEntries: number;
    hitRate: number;
    memoryMB: number;
    evictions: number;
    hotIndicators: Array<{ key: string; hits: number }>;
}

export interface BacktestSessionProfile {
    sessionId: string;
    slotId: string;
    populationSize: number;
    candleCount: number;
    timestamp: number;

    // Timing breakdown
    totalDurationMs: number;
    phases: PhaseTimer[];
    avgPerStrategyMs: number;
    fastestStrategyMs: number;
    slowestStrategyMs: number;

    // Cache efficiency
    cacheProfile: CacheProfileSnapshot;

    // Memory pressure
    peakMemoryMB: number;
    gcPausesEstimate: number;

    // Signal evaluation stats
    signalEvaluations: number;
    regimeDetections: number;
    regimeCacheHits: number;
    regimeCacheMissRate: number;

    // Slice elimination stats
    sliceCopiesAvoided: number;
    estimatedBytesSaved: number;
}

export interface PerformanceRecommendation {
    category: 'CACHE_SIZE' | 'POPULATION' | 'CANDLE_COUNT' | 'REGIME_INTERVAL' | 'BATCH_STRATEGY';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
    currentValue: number;
    recommendedValue: number;
}

export interface ProfilerReport {
    totalSessions: number;
    avgSessionDurationMs: number;
    avgPerStrategyMs: number;
    avgCacheHitRate: number;
    totalSliceCopiesAvoided: number;
    totalEstimatedBytesSaved: number;
    recommendations: PerformanceRecommendation[];
    recentSessions: BacktestSessionProfile[];
}

// ─── Profiler Implementation ─────────────────────────────────

const MAX_SESSION_HISTORY = 20;
const BYTES_PER_NUMBER = 8;
const OHLCV_FIELDS = 6; // timestamp, open, high, low, close, volume

/**
 * Singleton performance profiler for the backtest pipeline.
 * Tracks execution metrics across evolution cycles and produces
 * tuning recommendations.
 */
export class BacktestProfiler {
    private static instance: BacktestProfiler | null = null;

    private sessions: BacktestSessionProfile[] = [];
    private currentSession: Partial<BacktestSessionProfile> | null = null;
    private phaseStack: PhaseTimer[] = [];
    private strategyTimings: number[] = [];

    // Counters for current session
    private signalEvalCount = 0;
    private regimeDetectCount = 0;
    private regimeCacheHitCount = 0;
    private sliceCopiesAvoided = 0;

    private constructor() { }

    static getInstance(): BacktestProfiler {
        if (!BacktestProfiler.instance) {
            BacktestProfiler.instance = new BacktestProfiler();
        }
        return BacktestProfiler.instance;
    }

    /**
     * Reset singleton for testing purposes.
     */
    static reset(): void {
        BacktestProfiler.instance = null;
    }

    // ─── Session Lifecycle ───────────────────────────────────

    /**
     * Start a new profiling session (one evolution cycle).
     */
    startSession(slotId: string, populationSize: number, candleCount: number): void {
        this.currentSession = {
            sessionId: `${slotId}-${Date.now()}`,
            slotId,
            populationSize,
            candleCount,
            timestamp: Date.now(),
            totalDurationMs: 0,
            phases: [],
            avgPerStrategyMs: 0,
            fastestStrategyMs: Infinity,
            slowestStrategyMs: 0,
            signalEvaluations: 0,
            regimeDetections: 0,
            regimeCacheHits: 0,
            regimeCacheMissRate: 0,
            sliceCopiesAvoided: 0,
            estimatedBytesSaved: 0,
            peakMemoryMB: 0,
            gcPausesEstimate: 0,
        };
        this.phaseStack = [];
        this.strategyTimings = [];
        this.signalEvalCount = 0;
        this.regimeDetectCount = 0;
        this.regimeCacheHitCount = 0;
        this.sliceCopiesAvoided = 0;
    }

    /**
     * End the current session and store the profile.
     */
    endSession(cacheProfile?: CacheProfileSnapshot): void {
        if (!this.currentSession) return;

        const session = this.currentSession as BacktestSessionProfile;

        // Finalize timings
        session.phases = [...this.phaseStack];
        session.totalDurationMs = this.phaseStack.reduce((sum, p) => sum + p.durationMs, 0);

        if (this.strategyTimings.length > 0) {
            const sorted = [...this.strategyTimings].sort((a, b) => a - b);
            session.avgPerStrategyMs = Math.round(
                sorted.reduce((s, t) => s + t, 0) / sorted.length * 100,
            ) / 100;
            session.fastestStrategyMs = Math.round(sorted[0] * 100) / 100;
            session.slowestStrategyMs = Math.round(sorted[sorted.length - 1] * 100) / 100;
        }

        // Signal and regime stats
        session.signalEvaluations = this.signalEvalCount;
        session.regimeDetections = this.regimeDetectCount;
        session.regimeCacheHits = this.regimeCacheHitCount;
        const totalRegimeChecks = this.regimeDetectCount + this.regimeCacheHitCount;
        session.regimeCacheMissRate = totalRegimeChecks > 0
            ? Math.round((this.regimeDetectCount / totalRegimeChecks) * 1000) / 1000
            : 0;

        // Slice elimination savings
        session.sliceCopiesAvoided = this.sliceCopiesAvoided;
        session.estimatedBytesSaved = this.sliceCopiesAvoided *
            (session.candleCount / 2) * OHLCV_FIELDS * BYTES_PER_NUMBER;

        // Cache profile
        session.cacheProfile = cacheProfile || {
            totalEntries: 0,
            hitRate: 0,
            memoryMB: 0,
            evictions: 0,
            hotIndicators: [],
        };

        // Memory estimate
        session.peakMemoryMB = Math.round(
            (session.cacheProfile.memoryMB +
                (session.candleCount * OHLCV_FIELDS * BYTES_PER_NUMBER / (1024 * 1024)) +
                (this.strategyTimings.length * 0.1)) * 100,
        ) / 100;
        session.gcPausesEstimate = Math.floor(session.peakMemoryMB / 50);

        // Store
        this.sessions.push(session);
        if (this.sessions.length > MAX_SESSION_HISTORY) {
            this.sessions.shift();
        }

        this.currentSession = null;
    }

    // ─── Phase Tracking ──────────────────────────────────────

    /**
     * Begin timing a named phase (e.g., 'cache_warmup', 'batch_backtest', 'stress_matrix').
     */
    beginPhase(name: string): void {
        this.phaseStack.push({
            name,
            startMs: performance.now(),
            endMs: 0,
            durationMs: 0,
        });
    }

    /**
     * End the most recently started phase.
     */
    endPhase(): void {
        const phase = this.phaseStack[this.phaseStack.length - 1];
        if (phase && phase.endMs === 0) {
            phase.endMs = performance.now();
            phase.durationMs = Math.round((phase.endMs - phase.startMs) * 100) / 100;
        }
    }

    /**
     * Record a completed strategy backtest timing.
     */
    recordStrategyTiming(durationMs: number): void {
        this.strategyTimings.push(durationMs);
    }

    // ─── Counter Increments ──────────────────────────────────

    recordSignalEvaluation(): void {
        this.signalEvalCount++;
    }

    recordRegimeDetection(): void {
        this.regimeDetectCount++;
    }

    recordRegimeCacheHit(): void {
        this.regimeCacheHitCount++;
    }

    recordSliceCopyAvoided(count: number = 1): void {
        this.sliceCopiesAvoided += count;
    }

    // ─── Report Generation ───────────────────────────────────

    /**
     * Generate a comprehensive performance report with recommendations.
     */
    getReport(): ProfilerReport {
        const sessions = this.sessions;

        if (sessions.length === 0) {
            return {
                totalSessions: 0,
                avgSessionDurationMs: 0,
                avgPerStrategyMs: 0,
                avgCacheHitRate: 0,
                totalSliceCopiesAvoided: 0,
                totalEstimatedBytesSaved: 0,
                recommendations: [],
                recentSessions: [],
            };
        }

        const avgDuration = sessions.reduce((s, p) => s + p.totalDurationMs, 0) / sessions.length;
        const avgPerStrategy = sessions.reduce((s, p) => s + p.avgPerStrategyMs, 0) / sessions.length;
        const avgCacheHit = sessions.reduce((s, p) => s + p.cacheProfile.hitRate, 0) / sessions.length;
        const totalCopiesAvoided = sessions.reduce((s, p) => s + p.sliceCopiesAvoided, 0);
        const totalBytesSaved = sessions.reduce((s, p) => s + p.estimatedBytesSaved, 0);

        const recommendations = this.generateRecommendations(sessions);

        return {
            totalSessions: sessions.length,
            avgSessionDurationMs: Math.round(avgDuration),
            avgPerStrategyMs: Math.round(avgPerStrategy * 100) / 100,
            avgCacheHitRate: Math.round(avgCacheHit * 1000) / 1000,
            totalSliceCopiesAvoided: totalCopiesAvoided,
            totalEstimatedBytesSaved: Math.round(totalBytesSaved),
            recommendations,
            recentSessions: sessions.slice(-5),
        };
    }

    /**
     * Get a compact summary for dashboard display.
     */
    getSummary(): {
        sessionsProfiled: number;
        avgMs: number;
        cacheHitRate: number;
        bytesSavedMB: number;
        recommendations: number;
    } {
        const report = this.getReport();
        return {
            sessionsProfiled: report.totalSessions,
            avgMs: report.avgSessionDurationMs,
            cacheHitRate: report.avgCacheHitRate,
            bytesSavedMB: Math.round(report.totalEstimatedBytesSaved / (1024 * 1024) * 100) / 100,
            recommendations: report.recommendations.length,
        };
    }

    // ─── Recommendation Engine ───────────────────────────────

    /**
     * Analyze session history and generate tuning recommendations.
     * This is the "self-aware" part — the profiler observes patterns
     * and suggests parameter adjustments.
     */
    private generateRecommendations(sessions: BacktestSessionProfile[]): PerformanceRecommendation[] {
        const recommendations: PerformanceRecommendation[] = [];
        const recent = sessions.slice(-5);

        if (recent.length === 0) return recommendations;

        // ─── 1. Cache Size Recommendation ────────────────────
        const avgHitRate = recent.reduce((s, p) => s + p.cacheProfile.hitRate, 0) / recent.length;
        const avgEntries = recent.reduce((s, p) => s + p.cacheProfile.totalEntries, 0) / recent.length;

        if (avgHitRate < 0.6 && avgEntries > 50) {
            // Low hit rate but many entries → cache is too small, entries being evicted
            recommendations.push({
                category: 'CACHE_SIZE',
                severity: 'WARNING',
                message: `Cache hit rate is ${(avgHitRate * 100).toFixed(1)}% — indicators are being evicted. Increase IndicatorCache maxEntries.`,
                currentValue: Math.round(avgEntries),
                recommendedValue: Math.round(avgEntries * 2),
            });
        } else if (avgHitRate > 0.95 && avgEntries < 50) {
            recommendations.push({
                category: 'CACHE_SIZE',
                severity: 'INFO',
                message: `Cache hit rate is excellent at ${(avgHitRate * 100).toFixed(1)}%. Current capacity is sufficient.`,
                currentValue: Math.round(avgEntries),
                recommendedValue: Math.round(avgEntries),
            });
        }

        // ─── 2. Per-Strategy Duration ────────────────────────
        const avgStrategyMs = recent.reduce((s, p) => s + p.avgPerStrategyMs, 0) / recent.length;

        if (avgStrategyMs > 100) {
            // Individual strategy backtest taking >100ms — might need leaner config
            recommendations.push({
                category: 'BATCH_STRATEGY',
                severity: avgStrategyMs > 500 ? 'CRITICAL' : 'WARNING',
                message: `Avg backtest/strategy is ${avgStrategyMs.toFixed(0)}ms. Consider disabling equity curve tracking for fitness-only evaluation.`,
                currentValue: Math.round(avgStrategyMs),
                recommendedValue: 50,
            });
        }

        // ─── 3. Regime Detection Efficiency ──────────────────
        const avgMissRate = recent.reduce((s, p) => s + p.regimeCacheMissRate, 0) / recent.length;

        if (avgMissRate > 0.5) {
            recommendations.push({
                category: 'REGIME_INTERVAL',
                severity: 'INFO',
                message: `Regime cache miss rate is ${(avgMissRate * 100).toFixed(0)}%. Consider increasing the detection interval beyond 50 candles.`,
                currentValue: 50,
                recommendedValue: 100,
            });
        }

        // ─── 4. Population Size vs Duration ──────────────────
        const avgPopSize = recent.reduce((s, p) => s + p.populationSize, 0) / recent.length;
        const avgDuration = recent.reduce((s, p) => s + p.totalDurationMs, 0) / recent.length;

        if (avgDuration > 5000 && avgPopSize > 30) {
            recommendations.push({
                category: 'POPULATION',
                severity: 'WARNING',
                message: `Evolution cycle takes ${(avgDuration / 1000).toFixed(1)}s for ${Math.round(avgPopSize)} strategies. Consider reducing population size or using quickFitness.`,
                currentValue: Math.round(avgPopSize),
                recommendedValue: Math.min(20, Math.round(avgPopSize * 0.7)),
            });
        }

        // ─── 5. Candle Count Efficiency ──────────────────────
        const avgCandles = recent.reduce((s, p) => s + p.candleCount, 0) / recent.length;

        if (avgCandles > 2000 && avgStrategyMs > 200) {
            recommendations.push({
                category: 'CANDLE_COUNT',
                severity: 'WARNING',
                message: `Processing ${Math.round(avgCandles)} candles per strategy at ${avgStrategyMs.toFixed(0)}ms each. Consider using most-recent-N window for initial fitness screening.`,
                currentValue: Math.round(avgCandles),
                recommendedValue: Math.min(1000, Math.round(avgCandles * 0.6)),
            });
        }

        return recommendations;
    }
}
