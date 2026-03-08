// ============================================================
// Learner: CortexLiveEngine — Live Market ↔ Cortex Orchestrator
// ============================================================
// Central orchestration service that bridges:
//   Binance REST/WebSocket → MarketDataService → Cortex → Stores
//
// Boot Sequence (4 phases):
//   1. Seed: Fetch 500 historical candles per slot via REST
//   2. Subscribe: Wire WS streams for all active pairs
//   3. Wire: Connect callbacks (candle close, tickers, health)
//   4. Connect: Start WebSocket + health monitoring
//
// On each candle close:
//   → Route to Cortex.updateMarketData(slotId, candles)
//   → Notify EvolutionScheduler for auto-evolution trigger
//   → Refresh CortexStore snapshot
//
// Lifecycle: initialize() → start() → stop()
// ============================================================

import { Cortex } from './cortex';
import { cortexLog } from '@/lib/utils/logger';
import { EvolutionScheduler } from './evolution-scheduler';
import { AdaptiveDataFlowIntelligence, type DataFlowTelemetry } from './adaptive-data-flow';
import {
    RegimePropagationNetwork,
    type PropagationNetworkStatus,
    type CrossIslandWarning,
} from './regime-propagation';
import { MarketDataService } from '../api/market-data-service';
import { getHigherTimeframes } from './confluence-genes';
import { LiveTradeExecutor, type LiveTradeConfig } from '../api/live-trade-executor';
import {
    ConnectionStatus,
    Timeframe,
    OHLCV,
    type CortexLiveStatus,
    type EvolutionSchedulerConfig,
    type MarketTick,
} from '@/types';
import { TradingSlot } from '@/types/trading-slot';

// ─── Configuration ──────────────────────────────────────────

interface CortexLiveConfig {
    /** Number of historical candles to seed per slot. Default: 500 */
    seedCandleCount: number;
    /** Base URL for the internal klines API proxy. Default: '/api/binance/klines' */
    klinesApiUrl: string;
    /** WebSocket URL override. Default: testnet */
    wsUrl?: string;
    /** Whether to subscribe to all mini tickers. Default: true */
    subscribeAllTickers: boolean;
    /** Evolution scheduler config overrides */
    evolutionConfig?: Partial<EvolutionSchedulerConfig>;
}

const DEFAULT_LIVE_CONFIG: CortexLiveConfig = {
    seedCandleCount: 500,
    klinesApiUrl: '/api/binance/klines',
    subscribeAllTickers: true,
};

// ─── CortexLiveEngine ───────────────────────────────────────

export class CortexLiveEngine {
    private cortex: Cortex;
    private config: CortexLiveConfig;
    private marketDataService: MarketDataService;
    private evolutionScheduler: EvolutionScheduler;
    private adfi: AdaptiveDataFlowIntelligence;
    private regimePropagation: RegimePropagationNetwork;
    private tradeExecutor: LiveTradeExecutor | null = null;
    private autoTradeEnabled: boolean = false;
    private slots: TradingSlot[] = [];
    private phase: CortexLiveStatus['phase'] = 'idle';
    private startedAt: number | null = null;
    private lastError: string | null = null;
    private seedProgress = { completed: 0, total: 0, currentSlot: '' };

    // Callbacks for store integration
    private onTickerUpdate: ((tickers: MarketTick[]) => void) | null = null;
    private onConnectionChange: ((status: ConnectionStatus) => void) | null = null;
    private onSnapshotRefresh: (() => void) | null = null;

    constructor(cortex: Cortex, config: Partial<CortexLiveConfig> = {}) {
        this.cortex = cortex;
        this.config = { ...DEFAULT_LIVE_CONFIG, ...config };
        this.marketDataService = new MarketDataService(this.config.wsUrl);
        this.evolutionScheduler = new EvolutionScheduler(cortex, this.config.evolutionConfig);
        this.adfi = new AdaptiveDataFlowIntelligence(this.evolutionScheduler);
        this.regimePropagation = new RegimePropagationNetwork();

        // Wire CIRPN warning callback → route to target Island
        this.regimePropagation.setWarningCallback((warning: CrossIslandWarning) => {
            const targetIsland = this.cortex.getIsland(warning.targetSlotId);
            if (targetIsland) {
                targetIsland.receiveCrossIslandWarning({
                    sourcePair: warning.sourcePair,
                    predictedRegime: warning.predictedRegime,
                    expectedArrivalMs: warning.expectedArrivalMs,
                    confidence: warning.confidence,
                });
            }
        });

        // Wire ADFI backfill + injector
        this.adfi.setBackfillFunction(async (pair, timeframe, startTime, endTime) => {
            const url = `${this.config.klinesApiUrl}?symbol=${pair}&interval=${timeframe}&startTime=${startTime}&endTime=${endTime}&limit=1500`;
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json() as { klines: Array<{ openTime: number; open: number; high: number; low: number; close: number; volume: number }> };
            if (!data.klines || !Array.isArray(data.klines)) return [];
            return data.klines.map((k) => ({
                timestamp: k.openTime,
                open: k.open,
                high: k.high,
                low: k.low,
                close: k.close,
                volume: k.volume,
            }));
        });

        this.adfi.setCandleInjector((slotId, candles) => {
            this.cortex.updateMarketData(slotId, candles);
        });
    }

    // ─── Public API ─────────────────────────────────────────

    /**
     * Initialize with trading slots and seed historical data.
     * This is Phase 1 + 2 + 3 of the boot sequence.
     */
    async initialize(slots: TradingSlot[]): Promise<void> {
        this.slots = slots;
        this.phase = 'seeding';

        try {
            // Phase 1: Seed historical data
            await this.seedHistoricalData(slots);

            // Phase 2: Subscribe to WebSocket streams
            this.subscribeStreams(slots);

            // Phase 3: Wire callbacks
            this.wireCallbacks();

            // Register slots with scheduler
            this.evolutionScheduler.registerSlots(slots.map(s => s.id));

            // Register slots with CIRPN propagation network
            for (const slot of slots) {
                this.regimePropagation.registerSlot(slot.id, slot.pair);
            }

            cortexLog.info(`Initialized — ${slots.length} slots seeded and subscribed`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.phase = 'error';
            this.lastError = msg;
            cortexLog.error('Initialization failed', { error: msg });
            throw error;
        }
    }

    /**
     * Start the live data connection (Phase 4).
     */
    async start(): Promise<void> {
        if (this.phase !== 'seeding' && this.phase !== 'stopped') {
            // Allow start after seeding or after stop
            if (this.phase === 'idle') {
                throw new Error('[CortexLive] Must call initialize() before start()');
            }
            if (this.phase === 'live') {
                cortexLog.warn('Already running');
                return;
            }
        }

        this.phase = 'connecting';
        this.startedAt = Date.now();

        try {
            this.marketDataService.start();
            this.phase = 'live';
            cortexLog.info('🟢 LIVE — WebSocket connected, data flowing');
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.phase = 'error';
            this.lastError = msg;
            cortexLog.error('Start failed', { error: msg });
            throw error;
        }
    }

    /**
     * Stop all connections and clean up.
     */
    stop(): void {
        this.marketDataService.stop();
        this.phase = 'stopped';
        cortexLog.info('🔴 STOPPED');
    }

    /**
     * Get the full status of the engine.
     */
    getStatus(): CortexLiveStatus {
        return {
            phase: this.phase,
            seedProgress: { ...this.seedProgress },
            activeSlots: this.slots.map(s => s.id),
            connectionStatus: this.marketDataService.getConnectionStatus(),
            uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
            startedAt: this.startedAt,
            lastError: this.lastError,
        };
    }

    /**
     * Get the evolution scheduler for status/control.
     */
    getEvolutionScheduler(): EvolutionScheduler {
        return this.evolutionScheduler;
    }

    /**
     * Get the underlying MarketDataService for advanced control.
     */
    getMarketDataService(): MarketDataService {
        return this.marketDataService;
    }

    /**
     * Get the ADFI telemetry for dashboard observability.
     */
    getFlowTelemetry(): DataFlowTelemetry {
        return this.adfi.getFlowTelemetry();
    }

    /**
     * Get the ADFI instance for advanced control.
     */
    getAdfi(): AdaptiveDataFlowIntelligence {
        return this.adfi;
    }

    /**
     * Get the CIRPN status for dashboard observability.
     */
    getRegimePropagationStatus(): PropagationNetworkStatus {
        return this.regimePropagation.getStatus();
    }

    /**
     * Get the RegimePropagationNetwork instance for advanced control.
     */
    getRegimePropagation(): RegimePropagationNetwork {
        return this.regimePropagation;
    }

    // ─── Store Integration Callbacks ────────────────────────

    setOnTickerUpdate(callback: (tickers: MarketTick[]) => void): void {
        this.onTickerUpdate = callback;
    }

    setOnConnectionChange(callback: (status: ConnectionStatus) => void): void {
        this.onConnectionChange = callback;
    }

    setOnSnapshotRefresh(callback: () => void): void {
        this.onSnapshotRefresh = callback;
    }

    setOnEvolutionComplete(callback: (
        slotId: string,
        genNumber: number,
        bestFitness: number,
        durationMs: number,
    ) => void): void {
        this.evolutionScheduler.setOnEvolutionComplete((slotId, genNumber, bestFitness, durationMs) => {
            // Forward to user callback
            callback(slotId, genNumber, bestFitness, durationMs);

            // Phase 24: Trigger Overmind generation hook
            this.cortex.onEvolutionCycleComplete(slotId, genNumber, bestFitness);
        });
    }

    // ─── Auto-Trade Control ───────────────────────────────────

    /**
     * Enable/disable auto-trade execution.
     * When enabled, champion strategy signals trigger real testnet orders.
     */
    setAutoTrade(enabled: boolean, config?: Partial<LiveTradeConfig>): void {
        this.autoTradeEnabled = enabled;
        if (enabled && !this.tradeExecutor) {
            this.tradeExecutor = new LiveTradeExecutor(this.cortex, config);
            cortexLog.info('🔥 Auto-trade ENABLED — LiveTradeExecutor wired');
        } else if (!enabled && this.tradeExecutor) {
            this.tradeExecutor.destroy();
            this.tradeExecutor = null;
            cortexLog.info('⏹️ Auto-trade DISABLED');
        }
    }

    isAutoTradeEnabled(): boolean {
        return this.autoTradeEnabled;
    }

    getTradeExecutor(): LiveTradeExecutor | null {
        return this.tradeExecutor;
    }

    // ─── HTF Requirement Computation ─────────────────────────

    /**
     * Phase 26: Compute all pair:timeframe combinations needed for HTF
     * confluence gene data. For each pair, finds every TF strictly above
     * any slot's own TF — these are the HTF streams that must be seeded
     * and subscribed so that Cortex.routeHTFCandles() can distribute them.
     *
     * @returns Map<pair, Set<htf>> — additional TFs needed beyond slot TFs
     */
    private computeHTFRequirements(
        slots: TradingSlot[],
    ): Map<string, Set<Timeframe>> {
        const htfNeeds = new Map<string, Set<Timeframe>>();

        for (const slot of slots) {
            const higherTFs = getHigherTimeframes(slot.timeframe as Timeframe);
            if (higherTFs.length === 0) continue;

            const existing = htfNeeds.get(slot.pair) ?? new Set<Timeframe>();
            for (const htf of higherTFs) {
                existing.add(htf);
            }
            htfNeeds.set(slot.pair, existing);
        }

        // Remove any TFs that are already island slot TFs (they'll be seeded normally)
        for (const slot of slots) {
            const needs = htfNeeds.get(slot.pair);
            if (needs) {
                needs.delete(slot.timeframe as Timeframe);
                if (needs.size === 0) htfNeeds.delete(slot.pair);
            }
        }

        return htfNeeds;
    }

    // ─── Phase 1: Seed Historical Data ──────────────────────

    private async seedHistoricalData(slots: TradingSlot[]): Promise<void> {
        // Deduplicate pairs — each pair needs one REST call per timeframe
        const pairTimeframes = new Map<string, Set<Timeframe>>();
        for (const slot of slots) {
            const tfs = pairTimeframes.get(slot.pair) ?? new Set();
            tfs.add(slot.timeframe);
            pairTimeframes.set(slot.pair, tfs);
        }

        // Phase 26: Compute HTF requirements for confluence gene data
        const htfRequirements = this.computeHTFRequirements(slots);

        // Count total seed operations (slot TFs + HTF TFs)
        let totalOps = 0;
        for (const tfs of pairTimeframes.values()) {
            totalOps += tfs.size;
        }
        for (const htfs of htfRequirements.values()) {
            totalOps += htfs.size;
        }
        this.seedProgress = { completed: 0, total: totalOps, currentSlot: '' };

        // Fetch historical data sequentially to avoid rate limits
        for (const [pair, timeframes] of pairTimeframes) {
            for (const tf of timeframes) {
                const slotId = `${pair}:${tf}`;
                this.seedProgress.currentSlot = slotId;

                try {
                    const candles = await this.fetchHistoricalCandles(pair, tf);

                    if (candles.length > 0) {
                        // Seed the MarketDataService buffer
                        this.marketDataService.seedCandleHistory(slotId, candles);

                        // Push to Cortex for MRTI calibration
                        this.cortex.updateMarketData(slotId, candles);

                        // Phase 26: Also push to candle cache for HTF routing
                        this.cortex.updateCandleCache(pair, tf, candles);

                        cortexLog.info(`📊 Seeded ${slotId}: ${candles.length} candles`, {
                            from: new Date(candles[0].timestamp).toISOString(),
                            to: new Date(candles[candles.length - 1].timestamp).toISOString(),
                        });
                    } else {
                        cortexLog.warn(`No candles returned for ${slotId}`);
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    cortexLog.error(`Seed failed for ${slotId}`, { error: msg });
                    // Continue with other slots — don't abort the whole boot
                }

                this.seedProgress.completed++;
            }
        }

        // Phase 26: Seed HTF candles for confluence gene evaluation
        if (htfRequirements.size > 0) {
            cortexLog.info('🔗 Seeding HTF confluence data', {
                requirements: [...htfRequirements.entries()].map(([p, tfs]) => `${p}→[${[...tfs].join(',')}]`).join(', '),
            });

            for (const [pair, htfTimeframes] of htfRequirements) {
                for (const htf of htfTimeframes) {
                    const htfKey = `${pair}:${htf}[HTF]`;
                    this.seedProgress.currentSlot = htfKey;

                    try {
                        const candles = await this.fetchHistoricalCandles(pair, htf);

                        if (candles.length > 0) {
                            // Push to Cortex candle cache — routeHTFCandles() will distribute
                            this.cortex.updateCandleCache(pair, htf, candles);

                            // Also seed MDS buffer so WS updates can build on this history
                            const htfSlotId = `${pair}:${htf}`;
                            this.marketDataService.seedCandleHistory(htfSlotId, candles);

                            cortexLog.info(`🔗 HTF Seeded ${pair}:${htf}: ${candles.length} candles`);
                        } else {
                            cortexLog.warn(`No HTF candles for ${pair}:${htf}`);
                        }
                    } catch (error) {
                        const msg = error instanceof Error ? error.message : 'Unknown error';
                        cortexLog.error(`HTF seed failed for ${pair}:${htf}`, { error: msg });
                        // Non-critical: confluence will gracefully degrade with null results
                    }

                    this.seedProgress.completed++;
                }
            }
        }
    }

    private async fetchHistoricalCandles(
        pair: string,
        timeframe: Timeframe,
    ): Promise<OHLCV[]> {
        const url = `${this.config.klinesApiUrl}?symbol=${pair}&interval=${timeframe}&limit=${this.config.seedCandleCount}`;

        const response = await fetch(url);
        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'unknown');
            throw new Error(
                `Klines API returned ${response.status}: ${errorBody}`,
            );
        }

        const data = await response.json() as {
            klines: Array<{
                openTime: number;
                open: number;
                high: number;
                low: number;
                close: number;
                volume: number;
            }>;
        };

        if (!data.klines || !Array.isArray(data.klines)) {
            throw new Error('Invalid klines response format');
        }

        return data.klines.map((k) => ({
            timestamp: k.openTime,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
            volume: k.volume,
        }));
    }

    // ─── Phase 2: Subscribe WebSocket Streams ───────────────

    private subscribeStreams(slots: TradingSlot[]): void {
        // Group by pair → collect timeframes
        const pairTimeframes = new Map<string, Timeframe[]>();
        for (const slot of slots) {
            const existing = pairTimeframes.get(slot.pair) ?? [];
            if (!existing.includes(slot.timeframe)) {
                existing.push(slot.timeframe);
            }
            pairTimeframes.set(slot.pair, existing);
        }

        // Phase 26: Add HTF timeframes for confluence gene data
        const htfRequirements = this.computeHTFRequirements(slots);
        let htfStreamCount = 0;
        for (const [pair, htfTimeframes] of htfRequirements) {
            const existing = pairTimeframes.get(pair) ?? [];
            for (const htf of htfTimeframes) {
                if (!existing.includes(htf)) {
                    existing.push(htf);
                    htfStreamCount++;
                }
            }
            pairTimeframes.set(pair, existing);
        }

        // Subscribe each pair with all its timeframes (slot + HTF combined)
        for (const [pair, timeframes] of pairTimeframes) {
            this.marketDataService.subscribePair(pair, timeframes);
        }

        // Subscribe to all tickers for dashboard
        if (this.config.subscribeAllTickers) {
            this.marketDataService.subscribeAllTickers();
        }

        cortexLog.info('📡 Subscribed streams', {
            pairs: pairTimeframes.size,
            slots: slots.length,
            htfStreams: htfStreamCount,
            tickers: this.config.subscribeAllTickers ? 'ON' : 'OFF',
        });
    }

    // ─── Phase 3: Wire Callbacks ────────────────────────────

    private wireCallbacks(): void {
        // Candle close → route to Cortex + evolution scheduler
        this.marketDataService.setCandleCloseCallback(
            (slotId: string, pair: string, timeframe: Timeframe, candles: OHLCV[]) => {
                this.handleCandleClose(slotId, pair, timeframe, candles);
            },
        );

        // Ticker updates → forward to store
        this.marketDataService.setTickerUpdateCallback(
            (tickers: MarketTick[]) => {
                if (this.onTickerUpdate) {
                    this.onTickerUpdate(tickers);
                }
                // ADFI telemetry
                this.adfi.onTickersProcessed(tickers.length);
            },
        );

        // Connection status → forward to store
        this.marketDataService.setConnectionChangeCallback(
            (status: ConnectionStatus) => {
                if (this.onConnectionChange) {
                    this.onConnectionChange(status);
                }
                // ADFI connection tracking
                this.adfi.onConnectionStatusChange(status);
            },
        );

        // Data health monitoring
        this.marketDataService.setDataHealthCallback(
            () => {
                // Periodic health check — no-op for now, stores poll when needed
            },
        );
    }

    // ─── Candle Close Handler ───────────────────────────────

    private handleCandleClose(slotId: string, pair: string, timeframe: Timeframe, candles: OHLCV[]): void {
        try {
            // 1. Route to Cortex → Island → regime detection + MRTI + forensics
            this.cortex.updateMarketData(slotId, candles);

            // 1b. Phase 23: Route to shared candle cache for HTF confluence gene routing
            this.cortex.updateCandleCache(pair, timeframe, candles);

            // 2. ADFI: gap detection + telemetry + adaptive evolution
            const lastCandle = candles[candles.length - 1];
            if (lastCandle) {
                const timeframeMs = this.getTimeframeMs(timeframe);
                this.adfi.onCandleProcessed(slotId, pair, timeframe, lastCandle, timeframeMs);

                // Update regime for adaptive evolution frequency
                const island = this.cortex.getIsland(slotId);
                const currentRegime = island?.getSnapshot().currentRegime;
                if (currentRegime) {
                    this.adfi.onRegimeUpdate(slotId, currentRegime);

                    // Feed regime to CIRPN propagation network
                    this.regimePropagation.onRegimeDetected(slotId, pair, currentRegime);
                }
            }

            // 3. Notify evolution scheduler
            this.evolutionScheduler.onCandleClose(slotId);

            // 4. Phase 27: Auto-trade execution — evaluate champion signal → order
            if (this.autoTradeEnabled && this.tradeExecutor) {
                // Check exit signals for existing positions
                this.tradeExecutor.checkExitSignals(slotId, candles).catch((err) => {
                    cortexLog.error(`Exit signal check error for ${slotId}`, {
                        error: err instanceof Error ? err.message : 'Unknown',
                    });
                });

                // Evaluate for new entries
                this.tradeExecutor.evaluateAndExecute(slotId, candles).then((executed) => {
                    if (executed) {
                        cortexLog.info(`📈 Trade executed for ${slotId}`);
                        // Refresh snapshot to update dashboard
                        if (this.onSnapshotRefresh) this.onSnapshotRefresh();
                    }
                }).catch((err) => {
                    cortexLog.error(`Trade execution error for ${slotId}`, {
                        error: err instanceof Error ? err.message : 'Unknown',
                    });
                });
            }

            // 5. Refresh snapshot for dashboard
            if (this.onSnapshotRefresh) {
                this.onSnapshotRefresh();
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            cortexLog.error(`Candle close handler error for ${slotId}`, { error: msg });
        }
    }

    private getTimeframeMs(tf: Timeframe): number {
        switch (tf) {
            case Timeframe.M1: return 60_000;
            case Timeframe.M5: return 300_000;
            case Timeframe.M15: return 900_000;
            case Timeframe.H1: return 3_600_000;
            case Timeframe.H4: return 14_400_000;
            case Timeframe.D1: return 86_400_000;
        }
    }
}
