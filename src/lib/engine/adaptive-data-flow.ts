// ============================================================
// Learner: Adaptive Data Flow Intelligence (ADFI)
// ============================================================
// Radical Innovation — Self-monitoring, self-healing data pipeline.
//
// Three capabilities:
//   1. GAP DETECTION + AUTO-REPAIR
//      Detects missing candles after WS reconnection and auto-fetches
//      them via REST to maintain seamless candle history.
//
//   2. REGIME-ADAPTIVE EVOLUTION FREQUENCY
//      Dynamically adjusts candlesPerEvolution based on market regime:
//      - VOLATILE → evolve every 5 candles (strategy decay is fast)
//      - TRENDING → evolve every 15 candles (let trends play out)
//      - RANGING  → evolve every 10 candles (default)
//      - BREAKOUT → evolve every 3 candles (urgent adaptation needed)
//
//   3. DATA FLOW TELEMETRY
//      Observable metrics: candles/sec throughput, WS latency,
//      gap count, reconnect count, backfill operations.
//      Exposed via getFlowTelemetry() for the dashboard.
// ============================================================

import {
    ConnectionStatus,
    MarketRegime,
} from '@/types';
import type {
    OHLCV,
    Timeframe,
} from '@/types';
import type { EvolutionScheduler } from './evolution-scheduler';

// ─── Types ──────────────────────────────────────────────────

export interface DataFlowTelemetry {
    // Throughput
    candlesProcessedTotal: number;
    candlesProcessedPerMinute: number;
    tickersProcessedTotal: number;

    // Reliability
    gapsDetected: number;
    gapsRepaired: number;
    gapsPending: number;
    reconnectCount: number;

    // Latency
    avgCandleLatencyMs: number;
    maxCandleLatencyMs: number;

    // Adaptive evolution
    currentEvolutionFrequency: Map<string, number>; // slotId → candlesPerEvolution
    regimeOverrides: Map<string, MarketRegime>;

    // Status
    uptimeMs: number;
    lastUpdate: number;
}

export interface GapInfo {
    slotId: string;
    pair: string;
    timeframe: Timeframe;
    expectedTimestamp: number;
    actualTimestamp: number;
    missedCandles: number;
    repaired: boolean;
    repairedAt: number | null;
}

interface ThroughputTracker {
    timestamps: number[];      // Timestamps of recent candle arrivals
    windowMs: number;          // Sliding window size (60s)
}

// ─── Regime-based Evolution Frequency Map ────────────────────

const REGIME_EVOLUTION_FREQUENCY: Record<MarketRegime, number> = {
    [MarketRegime.HIGH_VOLATILITY]: 5,    // Fast decay → evolve often
    [MarketRegime.TRENDING_UP]: 15,       // Let trends play out
    [MarketRegime.TRENDING_DOWN]: 15,     // Let trends play out
    [MarketRegime.RANGING]: 10,           // Default
    [MarketRegime.LOW_VOLATILITY]: 8,     // Slower markets, moderate pace
};

// ─── Adaptive Data Flow Intelligence ────────────────────────

type BackfillFunction = (pair: string, timeframe: Timeframe, startTime: number, endTime: number) => Promise<OHLCV[]>;
type CandleInjector = (slotId: string, candles: OHLCV[]) => void;

export class AdaptiveDataFlowIntelligence {
    private evolutionScheduler: EvolutionScheduler;
    private backfillFn: BackfillFunction | null = null;
    private candleInjector: CandleInjector | null = null;

    // Telemetry
    private candlesProcessedTotal = 0;
    private tickersProcessedTotal = 0;
    private gapHistory: GapInfo[] = [];
    private reconnectCount = 0;
    private startedAt: number = Date.now();

    // Latency tracking
    private latencySamples: number[] = [];
    private readonly MAX_LATENCY_SAMPLES = 100;

    // Throughput tracking
    private throughput: ThroughputTracker = {
        timestamps: [],
        windowMs: 60_000,
    };

    // Regime tracking per slot
    private slotRegimes: Map<string, MarketRegime> = new Map();
    private slotEvolutionFrequency: Map<string, number> = new Map();

    // Last known candle timestamps per slot (for gap detection)
    private lastCandleTimestamps: Map<string, number> = new Map();

    constructor(evolutionScheduler: EvolutionScheduler) {
        this.evolutionScheduler = evolutionScheduler;
    }

    // ─── Configuration ──────────────────────────────────────

    /**
     * Set the function used to backfill gaps via REST API.
     * Signature: (pair, timeframe, startTime, endTime) → OHLCV[]
     */
    setBackfillFunction(fn: BackfillFunction): void {
        this.backfillFn = fn;
    }

    /**
     * Set the function used to inject backfilled candles into the system.
     * Typically calls Cortex.updateMarketData(slotId, candles).
     */
    setCandleInjector(fn: CandleInjector): void {
        this.candleInjector = fn;
    }

    // ─── Event Handlers (called by CortexLiveEngine) ────────

    /**
     * Called every time a candle closes. Handles:
     * - Gap detection
     * - Throughput tracking
     * - Latency measurement
     */
    onCandleProcessed(
        slotId: string,
        pair: string,
        timeframe: Timeframe,
        candle: OHLCV,
        timeframeMs: number,
    ): void {
        this.candlesProcessedTotal++;

        // Throughput tracking
        const now = Date.now();
        this.throughput.timestamps.push(now);
        this.throughput.timestamps = this.throughput.timestamps.filter(
            (t) => now - t <= this.throughput.windowMs,
        );

        // Latency measurement (time since candle should have closed)
        const expectedCloseTime = candle.timestamp + timeframeMs;
        const latency = Math.max(0, now - expectedCloseTime);
        this.latencySamples.push(latency);
        if (this.latencySamples.length > this.MAX_LATENCY_SAMPLES) {
            this.latencySamples.shift();
        }

        // Gap detection
        const lastTimestamp = this.lastCandleTimestamps.get(slotId);
        if (lastTimestamp !== undefined) {
            const expectedNextTimestamp = lastTimestamp + timeframeMs;
            const timeDiff = candle.timestamp - expectedNextTimestamp;

            // If more than 1.5x the timeframe has passed, there's a gap
            if (timeDiff > timeframeMs * 0.5) {
                const missedCandles = Math.round(timeDiff / timeframeMs);
                const gap: GapInfo = {
                    slotId,
                    pair,
                    timeframe,
                    expectedTimestamp: expectedNextTimestamp,
                    actualTimestamp: candle.timestamp,
                    missedCandles,
                    repaired: false,
                    repairedAt: null,
                };
                this.gapHistory.push(gap);

                console.warn(
                    `[ADFI] 🕳️ GAP DETECTED: ${slotId} — ${missedCandles} candles missing ` +
                    `(expected ${new Date(expectedNextTimestamp).toISOString()}, ` +
                    `got ${new Date(candle.timestamp).toISOString()})`,
                );

                // Auto-repair
                this.repairGap(gap);
            }
        }

        this.lastCandleTimestamps.set(slotId, candle.timestamp);
    }

    /**
     * Called when tickers are processed.
     */
    onTickersProcessed(count: number): void {
        this.tickersProcessedTotal += count;
    }

    /**
     * Called when WS connection status changes.
     */
    onConnectionStatusChange(status: ConnectionStatus): void {
        if (status === ConnectionStatus.RECONNECTING) {
            this.reconnectCount++;
            console.log(
                `[ADFI] 🔄 Reconnect #${this.reconnectCount} — will check for gaps on next candle`,
            );
        }
    }

    /**
     * Called when a regime is detected/changed for a slot.
     * Adjusts evolution frequency for that slot.
     */
    onRegimeUpdate(slotId: string, regime: MarketRegime): void {
        const previousRegime = this.slotRegimes.get(slotId);
        if (previousRegime === regime) return; // No change

        this.slotRegimes.set(slotId, regime);

        // Determine new evolution frequency based on regime
        const newFrequency = REGIME_EVOLUTION_FREQUENCY[regime] ?? 10;
        const oldFrequency = this.slotEvolutionFrequency.get(slotId) ?? 10;

        if (newFrequency !== oldFrequency) {
            this.slotEvolutionFrequency.set(slotId, newFrequency);

            // Apply to scheduler
            this.evolutionScheduler.updateConfig({
                candlesPerEvolution: newFrequency,
            });

            console.log(
                `[ADFI] 🎛️ ADAPTIVE EVOLUTION: ${slotId} regime ${previousRegime ?? 'UNKNOWN'} → ${regime}` +
                ` | Evolution frequency: ${oldFrequency} → ${newFrequency} candles`,
            );
        }
    }

    // ─── Telemetry ──────────────────────────────────────────

    /**
     * Get the full data flow telemetry snapshot.
     */
    getFlowTelemetry(): DataFlowTelemetry {
        const now = Date.now();

        // Calculate candles per minute
        const recentCandles = this.throughput.timestamps.filter(
            (t) => now - t <= this.throughput.windowMs,
        );
        const candlesPerMinute = recentCandles.length;

        // Latency stats
        const avgLatency = this.latencySamples.length > 0
            ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
            : 0;
        const maxLatency = this.latencySamples.length > 0
            ? Math.max(...this.latencySamples)
            : 0;

        // Gap stats
        const gapsRepaired = this.gapHistory.filter((g) => g.repaired).length;
        const gapsPending = this.gapHistory.filter((g) => !g.repaired).length;

        return {
            candlesProcessedTotal: this.candlesProcessedTotal,
            candlesProcessedPerMinute: candlesPerMinute,
            tickersProcessedTotal: this.tickersProcessedTotal,
            gapsDetected: this.gapHistory.length,
            gapsRepaired,
            gapsPending,
            reconnectCount: this.reconnectCount,
            avgCandleLatencyMs: Math.round(avgLatency),
            maxCandleLatencyMs: Math.round(maxLatency),
            currentEvolutionFrequency: new Map(this.slotEvolutionFrequency),
            regimeOverrides: new Map(this.slotRegimes),
            uptimeMs: now - this.startedAt,
            lastUpdate: now,
        };
    }

    /**
     * Get gap history for inspection.
     */
    getGapHistory(): GapInfo[] {
        return [...this.gapHistory];
    }

    /**
     * Get unrepaired gaps.
     */
    getPendingGaps(): GapInfo[] {
        return this.gapHistory.filter((g) => !g.repaired);
    }

    // ─── Gap Repair ─────────────────────────────────────────

    private async repairGap(gap: GapInfo): Promise<void> {
        if (!this.backfillFn || !this.candleInjector) {
            console.warn(
                `[ADFI] Cannot repair gap for ${gap.slotId}: backfill/injector not configured`,
            );
            return;
        }

        try {
            console.log(
                `[ADFI] 🔧 REPAIRING GAP: ${gap.slotId} — fetching ${gap.missedCandles} candles via REST`,
            );

            const candles = await this.backfillFn(
                gap.pair,
                gap.timeframe,
                gap.expectedTimestamp,
                gap.actualTimestamp,
            );

            if (candles.length > 0) {
                this.candleInjector(gap.slotId, candles);
                gap.repaired = true;
                gap.repairedAt = Date.now();

                console.log(
                    `[ADFI] ✅ GAP REPAIRED: ${gap.slotId} — ${candles.length} candles backfilled`,
                );
            } else {
                console.warn(
                    `[ADFI] ⚠️ Gap repair returned 0 candles for ${gap.slotId}`,
                );
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error(
                `[ADFI] ❌ Gap repair failed for ${gap.slotId}: ${msg}`,
            );
        }
    }
}
