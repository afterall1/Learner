// ============================================================
// Learner: Market Data Service — WebSocket ↔ Cortex Bridge
// ============================================================
// Single coordinator that subscribes to WebSocket streams,
// normalizes incoming data, accumulates kline candles, and
// dispatches completed candles to the matching Cortex Islands.
//
// Also handles:
// - Data gap detection (pauses Islands with stale data)
// - Live ticker dispatch to MarketStore
// - Connection health broadcasting
// ============================================================

import { OHLCV, MarketTick, Timeframe, ConnectionStatus, DataHealth } from '@/types';
import { BinanceWebSocketManager } from './binance-ws';

// ─── Types ───────────────────────────────────────────────────

export interface MarketDataSubscription {
    pair: string;
    timeframes: Timeframe[];
}

// Callback types for integration with stores and engines
export type CandleCloseCallback = (slotId: string, pair: string, timeframe: Timeframe, candles: OHLCV[]) => void;
export type TickerUpdateCallback = (tickers: MarketTick[]) => void;
export type ConnectionChangeCallback = (status: ConnectionStatus) => void;
export type DataHealthCallback = (health: DataHealth[]) => void;

// ─── Candle Accumulator ──────────────────────────────────────

interface CandleBuffer {
    pair: string;
    timeframe: Timeframe;
    slotId: string;
    candles: OHLCV[];
    maxCandles: number;
    lastClosedTimestamp: number;
}

// ─── Timeframe to Milliseconds ──────────────────────────────

function timeframeToMs(tf: Timeframe): number {
    switch (tf) {
        case Timeframe.M1: return 60 * 1000;
        case Timeframe.M5: return 5 * 60 * 1000;
        case Timeframe.M15: return 15 * 60 * 1000;
        case Timeframe.H1: return 60 * 60 * 1000;
        case Timeframe.H4: return 4 * 60 * 60 * 1000;
        case Timeframe.D1: return 24 * 60 * 60 * 1000;
    }
}

// ─── Market Data Service ─────────────────────────────────────

export class MarketDataService {
    private wsManager: BinanceWebSocketManager;
    private subscriptions: Map<string, MarketDataSubscription> = new Map();
    private candleBuffers: Map<string, CandleBuffer> = new Map();
    private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;

    // Callbacks
    private onCandleClose: CandleCloseCallback | null = null;
    private onTickerUpdate: TickerUpdateCallback | null = null;
    private onConnectionChange: ConnectionChangeCallback | null = null;
    private onDataHealth: DataHealthCallback | null = null;

    // Health monitoring
    private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
    private readonly HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
    private readonly MAX_CANDLE_HISTORY = 500;       // Keep 500 candles per buffer
    private readonly STALE_MULTIPLIER = 2;           // Data is stale if > 2x expected interval

    constructor(wsUrl?: string) {
        this.wsManager = new BinanceWebSocketManager(
            wsUrl ? { baseUrl: wsUrl } : undefined,
        );
        this.setupWsCallbacks();
    }

    // ─── Public API ────────────────────────────────────────────

    /**
     * Set callback for when a candle closes (complete OHLCV bar is ready).
     */
    setCandleCloseCallback(callback: CandleCloseCallback): void {
        this.onCandleClose = callback;
    }

    /**
     * Set callback for real-time ticker updates.
     */
    setTickerUpdateCallback(callback: TickerUpdateCallback): void {
        this.onTickerUpdate = callback;
    }

    /**
     * Set callback for connection status changes.
     */
    setConnectionChangeCallback(callback: ConnectionChangeCallback): void {
        this.onConnectionChange = callback;
    }

    /**
     * Set callback for data health updates.
     */
    setDataHealthCallback(callback: DataHealthCallback): void {
        this.onDataHealth = callback;
    }

    /**
     * Subscribe to market data for a pair across multiple timeframes.
     * Creates one WebSocket kline stream per pair+timeframe combo.
     */
    subscribePair(pair: string, timeframes: Timeframe[]): void {
        const normalizedPair = pair.toUpperCase();

        // Store subscription
        this.subscriptions.set(normalizedPair, {
            pair: normalizedPair,
            timeframes,
        });

        // Create candle buffers for each pair+timeframe
        for (const tf of timeframes) {
            const slotId = `${normalizedPair}:${tf}`;
            if (!this.candleBuffers.has(slotId)) {
                this.candleBuffers.set(slotId, {
                    pair: normalizedPair,
                    timeframe: tf,
                    slotId,
                    candles: [],
                    maxCandles: this.MAX_CANDLE_HISTORY,
                    lastClosedTimestamp: 0,
                });
            }
        }

        // Subscribe to WebSocket kline streams
        const klineSubscriptions = timeframes.map((tf) => ({
            symbol: normalizedPair.toLowerCase(),
            interval: tf,
        }));

        this.wsManager.subscribeKlines(klineSubscriptions);
    }

    /**
     * Subscribe to all mini tickers for live price feeds.
     */
    subscribeAllTickers(): void {
        this.wsManager.subscribeAllMiniTickers();
    }

    /**
     * Unsubscribe from a pair's data streams.
     */
    unsubscribePair(pair: string): void {
        const normalizedPair = pair.toUpperCase();
        const sub = this.subscriptions.get(normalizedPair);
        if (!sub) return;

        // Remove candle buffers
        for (const tf of sub.timeframes) {
            const slotId = `${normalizedPair}:${tf}`;
            this.candleBuffers.delete(slotId);
        }

        // Remove WebSocket streams
        const streams = sub.timeframes.map(
            (tf) => `${normalizedPair.toLowerCase()}@kline_${tf}`,
        );
        this.wsManager.unsubscribe(streams);

        this.subscriptions.delete(normalizedPair);
    }

    /**
     * Seed a candle buffer with historical data (from REST API).
     * Call this BEFORE connecting WebSocket to have warm history.
     */
    seedCandleHistory(slotId: string, candles: OHLCV[]): void {
        const buffer = this.candleBuffers.get(slotId);
        if (!buffer) return;

        // Replace buffer with historical candles
        buffer.candles = candles.slice(-this.MAX_CANDLE_HISTORY);
        if (buffer.candles.length > 0) {
            buffer.lastClosedTimestamp = buffer.candles[buffer.candles.length - 1].timestamp;
        }
    }

    /**
     * Get the current candle history for a specific slot.
     */
    getCandleHistory(slotId: string): OHLCV[] {
        const buffer = this.candleBuffers.get(slotId);
        return buffer ? [...buffer.candles] : [];
    }

    /**
     * Start the WebSocket connection and health monitoring.
     */
    start(): void {
        this.wsManager.connect();
        this.startHealthCheck();
    }

    /**
     * Stop all connections and clean up.
     */
    stop(): void {
        this.wsManager.disconnect();
        this.stopHealthCheck();
        this.candleBuffers.clear();
        this.subscriptions.clear();
    }

    /**
     * Get current connection status.
     */
    getConnectionStatus(): ConnectionStatus {
        return this.connectionStatus;
    }

    /**
     * Get all active subscriptions.
     */
    getSubscriptions(): MarketDataSubscription[] {
        return Array.from(this.subscriptions.values());
    }

    /**
     * Get data health for all active slots.
     */
    getDataHealth(): DataHealth[] {
        const now = Date.now();
        const healthList: DataHealth[] = [];

        for (const [slotId, buffer] of this.candleBuffers.entries()) {
            const expectedInterval = timeframeToMs(buffer.timeframe);
            const timeSinceLastCandle = buffer.lastClosedTimestamp > 0
                ? now - buffer.lastClosedTimestamp
                : Infinity;

            const missedCandles = buffer.lastClosedTimestamp > 0
                ? Math.floor(timeSinceLastCandle / expectedInterval) - 1
                : 0;

            healthList.push({
                slotId,
                lastCandleTime: buffer.lastClosedTimestamp,
                expectedInterval,
                missedCandles: Math.max(0, missedCandles),
                isStale: timeSinceLastCandle > expectedInterval * this.STALE_MULTIPLIER,
                lastUpdated: now,
            });
        }

        return healthList;
    }

    // ─── Internal: WebSocket Callbacks ─────────────────────────

    private setupWsCallbacks(): void {
        this.wsManager.setKlineCallback(
            (symbol: string, interval: string, candle: OHLCV, isClosed: boolean) => {
                this.handleKlineUpdate(symbol.toUpperCase(), interval, candle, isClosed);
            },
        );

        this.wsManager.setTickerCallback((tickers: MarketTick[]) => {
            if (this.onTickerUpdate) {
                // Filter to only symbols we're subscribed to
                const subscribedSymbols = new Set(this.subscriptions.keys());
                const filteredTickers = subscribedSymbols.size > 0
                    ? tickers.filter((t) => subscribedSymbols.has(t.symbol))
                    : tickers;

                if (filteredTickers.length > 0) {
                    this.onTickerUpdate(filteredTickers);
                }
            }
        });

        this.wsManager.setStatusCallback((status: ConnectionStatus) => {
            this.connectionStatus = status;
            if (this.onConnectionChange) {
                this.onConnectionChange(status);
            }
        });

        this.wsManager.setErrorCallback((error: string) => {
            console.error('[MarketData] WebSocket error:', error);
        });
    }

    private handleKlineUpdate(
        symbol: string,
        interval: string,
        candle: OHLCV,
        isClosed: boolean,
    ): void {
        const slotId = `${symbol}:${interval}`;
        const buffer = this.candleBuffers.get(slotId);

        if (!buffer) return;

        if (isClosed) {
            // Candle is complete — add to history and dispatch
            this.addCandleToBuffer(buffer, candle);
            buffer.lastClosedTimestamp = candle.timestamp;

            // Dispatch to listeners with full candle history
            if (this.onCandleClose) {
                this.onCandleClose(
                    slotId,
                    buffer.pair,
                    buffer.timeframe,
                    [...buffer.candles],
                );
            }
        } else {
            // Candle is still forming — update the last candle in buffer
            // (for real-time price display, not for signal evaluation)
            if (buffer.candles.length > 0) {
                const lastCandle = buffer.candles[buffer.candles.length - 1];
                if (lastCandle.timestamp === candle.timestamp) {
                    // Update in-progress candle
                    buffer.candles[buffer.candles.length - 1] = candle;
                }
            }
        }
    }

    private addCandleToBuffer(buffer: CandleBuffer, candle: OHLCV): void {
        // Check for duplicate timestamps
        if (buffer.candles.length > 0) {
            const lastCandle = buffer.candles[buffer.candles.length - 1];
            if (lastCandle.timestamp === candle.timestamp) {
                // Replace the last candle (was an in-progress update)
                buffer.candles[buffer.candles.length - 1] = candle;
                return;
            }
        }

        buffer.candles.push(candle);

        // Trim to max size
        if (buffer.candles.length > buffer.maxCandles) {
            buffer.candles = buffer.candles.slice(-buffer.maxCandles);
        }
    }

    // ─── Internal: Health Monitoring ───────────────────────────

    private startHealthCheck(): void {
        this.stopHealthCheck();
        this.healthCheckTimer = setInterval(() => {
            const health = this.getDataHealth();
            if (this.onDataHealth) {
                this.onDataHealth(health);
            }
        }, this.HEALTH_CHECK_INTERVAL);
    }

    private stopHealthCheck(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
}
