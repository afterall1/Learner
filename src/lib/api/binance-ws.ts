// ============================================================
// Learner: Binance WebSocket Manager — Real-Time Market Streams
// ============================================================
// Client-side WebSocket manager for Binance Futures streams.
// Handles multiple concurrent stream subscriptions, automatic
// reconnection with exponential backoff, and circuit breaker.
//
// Public market streams (klines, tickers) do NOT require auth.
// ============================================================

import {
    OHLCV,
    MarketTick,
    ConnectionStatus,
    BinanceKlineEvent,
    BinanceMiniTickerEvent,
} from '@/types';

// ─── Event Types ─────────────────────────────────────────────

export type KlineCallback = (symbol: string, interval: string, candle: OHLCV, isClosed: boolean) => void;
export type TickerCallback = (tickers: MarketTick[]) => void;
export type StatusCallback = (status: ConnectionStatus) => void;
export type ErrorCallback = (error: string) => void;

// ─── Configuration ───────────────────────────────────────────

interface WebSocketManagerConfig {
    baseUrl: string;
    reconnectDelayMs: number;
    maxReconnectDelayMs: number;
    maxReconnectAttempts: number;
    pingIntervalMs: number;
}

const DEFAULT_WS_CONFIG: WebSocketManagerConfig = {
    baseUrl: 'wss://stream.binancefuture.com/ws',
    reconnectDelayMs: 1000,
    maxReconnectDelayMs: 30000,
    maxReconnectAttempts: 10,
    pingIntervalMs: 30000,
};

// ─── WebSocket Manager ──────────────────────────────────────

export class BinanceWebSocketManager {
    private config: WebSocketManagerConfig;
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
    private activeStreams: Set<string> = new Set();

    // Callbacks
    private onKline: KlineCallback | null = null;
    private onTicker: TickerCallback | null = null;
    private onStatus: StatusCallback | null = null;
    private onError: ErrorCallback | null = null;

    constructor(config: Partial<WebSocketManagerConfig> = {}) {
        this.config = { ...DEFAULT_WS_CONFIG, ...config };
    }

    // ─── Public API ────────────────────────────────────────────

    /**
     * Register callback for kline/candlestick updates.
     */
    setKlineCallback(callback: KlineCallback): void {
        this.onKline = callback;
    }

    /**
     * Register callback for ticker updates.
     */
    setTickerCallback(callback: TickerCallback): void {
        this.onTicker = callback;
    }

    /**
     * Register callback for connection status changes.
     */
    setStatusCallback(callback: StatusCallback): void {
        this.onStatus = callback;
    }

    /**
     * Register callback for errors.
     */
    setErrorCallback(callback: ErrorCallback): void {
        this.onError = callback;
    }

    /**
     * Subscribe to kline streams for specific symbols and intervals.
     * Example: subscribeKlines([{ symbol: 'btcusdt', interval: '1h' }])
     */
    subscribeKlines(subscriptions: Array<{ symbol: string; interval: string }>): void {
        for (const sub of subscriptions) {
            const stream = `${sub.symbol.toLowerCase()}@kline_${sub.interval}`;
            this.activeStreams.add(stream);
        }
        this.reconnectWithNewStreams();
    }

    /**
     * Subscribe to all mini tickers (all symbols, 1s updates).
     */
    subscribeAllMiniTickers(): void {
        this.activeStreams.add('!miniTicker@arr');
        this.reconnectWithNewStreams();
    }

    /**
     * Unsubscribe from specific streams.
     */
    unsubscribe(streams: string[]): void {
        for (const stream of streams) {
            this.activeStreams.delete(stream);
        }
        if (this.activeStreams.size === 0) {
            this.disconnect();
        } else {
            this.reconnectWithNewStreams();
        }
    }

    /**
     * Connect with current stream subscriptions.
     */
    connect(): void {
        if (this.activeStreams.size === 0) {
            this.emitError('No streams to subscribe to');
            return;
        }

        this.setStatus(ConnectionStatus.CONNECTING);
        this.createConnection();
    }

    /**
     * Disconnect and clean up all resources.
     */
    disconnect(): void {
        this.clearReconnectTimer();
        this.clearPingTimer();

        if (this.ws) {
            // Remove event handlers to prevent reconnection
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.onopen = null;
            this.ws.close();
            this.ws = null;
        }

        this.reconnectAttempts = 0;
        this.setStatus(ConnectionStatus.DISCONNECTED);
    }

    /**
     * Get the current connection status.
     */
    getStatus(): ConnectionStatus {
        return this.status;
    }

    /**
     * Get the list of active stream subscriptions.
     */
    getActiveStreams(): string[] {
        return Array.from(this.activeStreams);
    }

    // ─── Internal: Connection Management ───────────────────────

    private createConnection(): void {
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }

        const streams = Array.from(this.activeStreams);
        if (streams.length === 0) return;

        const streamString = streams.join('/');
        const url = `${this.config.baseUrl}/${streamString}`;

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('[BinanceWS] Connected to', streams.length, 'streams');
                this.reconnectAttempts = 0;
                this.setStatus(ConnectionStatus.CONNECTED);
                this.startPingTimer();
            };

            this.ws.onmessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data as string);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('[BinanceWS] Message parse error:', error);
                }
            };

            this.ws.onerror = (event: Event) => {
                console.error('[BinanceWS] WebSocket error:', event);
                this.emitError('WebSocket connection error');
            };

            this.ws.onclose = (event: CloseEvent) => {
                console.warn(`[BinanceWS] Disconnected (code: ${event.code}, reason: ${event.reason})`);
                this.clearPingTimer();
                this.scheduleReconnect();
            };
        } catch (error) {
            console.error('[BinanceWS] Connection failed:', error);
            this.emitError(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.error('[BinanceWS] Max reconnect attempts reached — circuit open');
            this.setStatus(ConnectionStatus.CIRCUIT_OPEN);
            this.emitError('Max reconnection attempts exhausted. Manual intervention required.');
            return;
        }

        this.setStatus(ConnectionStatus.RECONNECTING);

        const delay = Math.min(
            this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts),
            this.config.maxReconnectDelayMs,
        );

        this.reconnectAttempts++;
        console.log(`[BinanceWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            this.createConnection();
        }, delay);
    }

    private reconnectWithNewStreams(): void {
        // If connected, disconnect and reconnect with new stream set
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.onclose = null; // Prevent automatic reconnect
            this.ws.close();
            this.ws = null;
            this.reconnectAttempts = 0; // Fresh connection, not a failure
        }

        this.clearReconnectTimer();
        this.connect();
    }

    // ─── Internal: Message Handling ────────────────────────────

    private handleMessage(data: Record<string, unknown>): void {
        // Combined stream format: { stream: "...", data: {...} }
        const eventData = (data.data ?? data) as Record<string, unknown>;
        const eventType = eventData.e as string;

        if (!eventType) {
            // Could be an array (mini ticker array)
            if (Array.isArray(data)) {
                this.handleMiniTickerArray(data as unknown as BinanceMiniTickerEvent[]);
                return;
            }
            if (Array.isArray(data.data)) {
                this.handleMiniTickerArray(data.data as unknown as BinanceMiniTickerEvent[]);
                return;
            }
            return;
        }

        switch (eventType) {
            case 'kline':
                this.handleKline(eventData as unknown as BinanceKlineEvent);
                break;
            case '24hrMiniTicker':
                // Single ticker - wrap in array
                this.handleMiniTickerArray([eventData as unknown as BinanceMiniTickerEvent]);
                break;
            default:
                // Unknown event type — log but don't crash
                console.debug('[BinanceWS] Unhandled event type:', eventType);
        }
    }

    private handleKline(event: BinanceKlineEvent): void {
        if (!this.onKline) return;

        const k = event.k;
        const candle: OHLCV = {
            timestamp: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
        };

        this.onKline(k.s, k.i, candle, k.x);
    }

    private handleMiniTickerArray(tickers: BinanceMiniTickerEvent[]): void {
        if (!this.onTicker || tickers.length === 0) return;

        const marketTicks: MarketTick[] = tickers.map((t) => ({
            symbol: t.s,
            price: parseFloat(t.c),
            volume24h: parseFloat(t.v),
            priceChange24h: parseFloat(t.c) - parseFloat(t.o),
            priceChangePercent24h: parseFloat(t.o) > 0
                ? ((parseFloat(t.c) - parseFloat(t.o)) / parseFloat(t.o)) * 100
                : 0,
            high24h: parseFloat(t.h),
            low24h: parseFloat(t.l),
            timestamp: t.E,
        }));

        this.onTicker(marketTicks);
    }

    // ─── Internal: Health Monitoring ───────────────────────────

    private startPingTimer(): void {
        this.clearPingTimer();
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Binance uses the WebSocket protocol ping/pong mechanism internally.
                // We send a raw ping frame to test connection liveness.
                try {
                    this.ws.send(JSON.stringify({ method: 'PING' }));
                } catch {
                    // If ping fails, the connection will close and trigger reconnect
                }
            }
        }, this.config.pingIntervalMs);
    }

    private clearPingTimer(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    // ─── Internal: Status & Error ──────────────────────────────

    private setStatus(status: ConnectionStatus): void {
        if (this.status === status) return;
        this.status = status;
        if (this.onStatus) {
            this.onStatus(status);
        }
    }

    private emitError(message: string): void {
        if (this.onError) {
            this.onError(message);
        }
    }
}
