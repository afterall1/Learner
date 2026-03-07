// ============================================================
// Learner: Binance REST API Client — Server-Side Proxy
// ============================================================
// REST client for Binance Futures API.
// Runs server-side only (Next.js API Routes) to protect secrets.
// 
// Features:
// - Testnet/Production URL switching (defaults to testnet)
// - HMAC SHA256 authentication for private endpoints
// - Rate limiting with queue-based throttle
// - Exponential backoff retry for GET requests (NEVER retry POST)
// - All error codes handled per binance-integration skill
// ============================================================

import crypto from 'crypto';
import {
    OHLCV,
    MarketTick,
    ExchangeSymbolInfo,
    Timeframe,
    OrderResult,
    PositionInfo,
    OrderBookSnapshot,
    AdaptiveRateStatus,
} from '@/types';

// ─── Configuration ───────────────────────────────────────────

interface BinanceRestConfig {
    apiKey: string;
    apiSecret: string;
    isTestnet: boolean;
}

interface BinanceBaseUrls {
    rest: string;
    ws: string;
}

function getBaseUrls(isTestnet: boolean): BinanceBaseUrls {
    if (isTestnet) {
        return {
            rest: 'https://testnet.binancefuture.com',
            ws: 'wss://stream.binancefuture.com/ws',
        };
    }
    return {
        rest: 'https://fapi.binance.com',
        ws: 'wss://fstream.binance.com/ws',
    };
}

// ─── Retry Configuration ────────────────────────────────────

const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    backoffMultiplier: 2,
};

// Error codes to classify
const RETRYABLE_ERROR_CODES = new Set([-1000, -1003, -1021]);
const NON_RETRYABLE_ERROR_CODES = new Set([-2010, -2019, -4003]);

// ─── Adaptive Rate Governor (AOLE Sub-Innovation 2) ─────────
// Reads X-MBX-USED-WEIGHT-1m and X-MBX-ORDER-COUNT-1m from
// every Binance response to dynamically adjust concurrency.
//
// Weight Utilization → Concurrency:
//   < 50%  → 10 (aggressive)
//   50-75% → 5  (normal)
//   75-92% → 2  (cautious)
//   > 92%  → 1  (emergency) + 5s pause

class AdaptiveRateGovernor {
    private queue: Array<() => void> = [];
    private activeRequests = 0;
    private maxConcurrent = 5;           // Dynamically adjusted
    private readonly intervalMs: number;
    private timer: ReturnType<typeof setInterval> | null = null;

    // Rate limit state from response headers
    private usedWeight1m = 0;
    private orderCount1m = 0;
    private readonly maxWeight1m = 2400;
    private readonly maxOrderCount1m = 300;
    private pauseUntil = 0;              // Timestamp: block all requests until this time

    constructor(intervalMs: number = 200) {
        this.intervalMs = intervalMs;
    }

    async acquire(): Promise<void> {
        // Check if we're in emergency pause
        const now = Date.now();
        if (now < this.pauseUntil) {
            const waitMs = this.pauseUntil - now;
            console.warn(`[RateGovernor] Emergency pause: waiting ${waitMs}ms`);
            await new Promise<void>(r => setTimeout(r, waitMs));
        }

        if (this.activeRequests < this.maxConcurrent) {
            this.activeRequests++;
            return;
        }

        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.activeRequests++;
                resolve();
            });

            if (!this.timer) {
                this.timer = setInterval(() => {
                    this.processQueue();
                }, this.intervalMs);
            }
        });
    }

    release(): void {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        this.processQueue();
    }

    /**
     * Update rate limit state from Binance response headers.
     * Called after every API response.
     */
    updateFromHeaders(headers: Headers): void {
        const weightStr = headers.get('X-MBX-USED-WEIGHT-1m');
        const orderStr = headers.get('X-MBX-ORDER-COUNT-1m');

        if (weightStr) {
            this.usedWeight1m = parseInt(weightStr, 10);
        }
        if (orderStr) {
            this.orderCount1m = parseInt(orderStr, 10);
        }

        this.adjustConcurrency();
    }

    /**
     * Get current adaptive rate status for monitoring.
     */
    getStatus(): AdaptiveRateStatus {
        return {
            usedWeight1m: this.usedWeight1m,
            maxWeight1m: this.maxWeight1m,
            orderCount1m: this.orderCount1m,
            maxOrderCount1m: this.maxOrderCount1m,
            weightUtilization: this.usedWeight1m / this.maxWeight1m,
            orderUtilization: this.orderCount1m / this.maxOrderCount1m,
            currentConcurrency: this.maxConcurrent,
            lastUpdated: Date.now(),
        };
    }

    private adjustConcurrency(): void {
        const utilization = this.usedWeight1m / this.maxWeight1m;
        const orderUtil = this.orderCount1m / this.maxOrderCount1m;
        const prevConcurrency = this.maxConcurrent;

        if (utilization > 0.92 || orderUtil > 0.90) {
            // EMERGENCY: almost at limit
            this.maxConcurrent = 1;
            this.pauseUntil = Date.now() + 5000; // 5s pause
            console.error(
                `[RateGovernor] EMERGENCY: weight=${this.usedWeight1m}/${this.maxWeight1m} ` +
                `orders=${this.orderCount1m}/${this.maxOrderCount1m} → concurrency=1, pausing 5s`
            );
        } else if (utilization > 0.75 || orderUtil > 0.67) {
            // CAUTIOUS
            this.maxConcurrent = 2;
        } else if (utilization > 0.50) {
            // NORMAL
            this.maxConcurrent = 5;
        } else {
            // AGGRESSIVE
            this.maxConcurrent = 10;
        }

        if (prevConcurrency !== this.maxConcurrent) {
            console.log(
                `[RateGovernor] Concurrency ${prevConcurrency}→${this.maxConcurrent} ` +
                `(weight: ${(utilization * 100).toFixed(1)}%, orders: ${(orderUtil * 100).toFixed(1)}%)`
            );
        }
    }

    private processQueue(): void {
        while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
            const next = this.queue.shift();
            if (next) next();
        }

        if (this.queue.length === 0 && this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    destroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.queue = [];
        this.activeRequests = 0;
    }
}

// ─── Binance Error ───────────────────────────────────────────

export class BinanceApiError extends Error {
    constructor(
        message: string,
        public readonly code: number,
        public readonly statusCode: number,
        public readonly retryable: boolean,
    ) {
        super(message);
        this.name = 'BinanceApiError';
    }
}

// ─── Main Client ─────────────────────────────────────────────

export class BinanceRestClient {
    private readonly config: BinanceRestConfig;
    private readonly baseUrl: string;
    private readonly rateLimiter: AdaptiveRateGovernor;
    private serverTimeDelta: number = 0;  // ms difference: server - local
    private lastTimeSyncAt: number = 0;

    constructor(config: Partial<BinanceRestConfig> = {}) {
        this.config = {
            apiKey: config.apiKey ?? process.env.BINANCE_API_KEY ?? '',
            apiSecret: config.apiSecret ?? process.env.BINANCE_API_SECRET ?? '',
            isTestnet: config.isTestnet ?? (process.env.BINANCE_TESTNET !== 'false'),
        };

        const urls = getBaseUrls(this.config.isTestnet);
        this.baseUrl = urls.rest;
        this.rateLimiter = new AdaptiveRateGovernor(200);
    }

    // ─── Public Market Data Endpoints ──────────────────────────

    /**
     * Fetch historical kline/candlestick data.
     * No authentication required.
     */
    async getKlines(
        symbol: string,
        interval: Timeframe | string,
        limit: number = 500,
        startTime?: number,
        endTime?: number,
    ): Promise<OHLCV[]> {
        const params: Record<string, string | number> = {
            symbol: symbol.toUpperCase(),
            interval,
            limit: Math.min(limit, 1500),
        };
        if (startTime) params.startTime = startTime;
        if (endTime) params.endTime = endTime;

        const data = await this.publicGet('/fapi/v1/klines', params);

        if (!Array.isArray(data)) {
            throw new BinanceApiError('Invalid klines response format', -1, 500, false);
        }

        return data.map((k: (string | number)[]): OHLCV => ({
            timestamp: Number(k[0]),
            open: parseFloat(String(k[1])),
            high: parseFloat(String(k[2])),
            low: parseFloat(String(k[3])),
            close: parseFloat(String(k[4])),
            volume: parseFloat(String(k[5])),
        }));
    }

    /**
     * Fetch 24hr ticker price change statistics.
     * If symbol is omitted, returns ALL symbols.
     */
    async get24hrTicker(symbol?: string): Promise<MarketTick | MarketTick[]> {
        const params: Record<string, string | number> = {};
        if (symbol) params.symbol = symbol.toUpperCase();

        const data = await this.publicGet('/fapi/v1/ticker/24hr', params);

        const mapTicker = (t: Record<string, string>): MarketTick => ({
            symbol: t.symbol,
            price: parseFloat(t.lastPrice),
            volume24h: parseFloat(t.volume),
            priceChange24h: parseFloat(t.priceChange),
            priceChangePercent24h: parseFloat(t.priceChangePercent),
            high24h: parseFloat(t.highPrice),
            low24h: parseFloat(t.lowPrice),
            timestamp: Number(t.closeTime),
        });

        if (Array.isArray(data)) {
            return data.map(mapTicker);
        }
        return mapTicker(data);
    }

    /**
     * Fetch latest price for a symbol.
     */
    async getLatestPrice(symbol: string): Promise<number> {
        const data = await this.publicGet('/fapi/v1/ticker/price', {
            symbol: symbol.toUpperCase(),
        });
        return parseFloat(data.price);
    }

    /**
     * Fetch exchange trading rules and symbol info.
     * Results are cached by the caller (API route) for 1 hour.
     */
    async getExchangeInfo(): Promise<ExchangeSymbolInfo[]> {
        const data = await this.publicGet('/fapi/v1/exchangeInfo', {});

        if (!data.symbols || !Array.isArray(data.symbols)) {
            throw new BinanceApiError('Invalid exchangeInfo response', -1, 500, false);
        }

        return data.symbols.map((s: Record<string, unknown>): ExchangeSymbolInfo => {
            const filters = s.filters as Array<Record<string, string>>;

            const lotSizeFilter = filters.find((f) => f.filterType === 'LOT_SIZE');
            const priceFilter = filters.find((f) => f.filterType === 'PRICE_FILTER');
            const minNotionalFilter = filters.find((f) => f.filterType === 'MIN_NOTIONAL');

            return {
                symbol: String(s.symbol),
                pricePrecision: Number(s.pricePrecision),
                quantityPrecision: Number(s.quantityPrecision),
                minQuantity: lotSizeFilter ? parseFloat(lotSizeFilter.minQty) : 0.001,
                stepSize: lotSizeFilter ? parseFloat(lotSizeFilter.stepSize) : 0.001,
                tickSize: priceFilter ? parseFloat(priceFilter.tickSize) : 0.01,
                minNotional: minNotionalFilter ? parseFloat(minNotionalFilter.notional) : 5,
                maxLeverage: 125, // Fetched separately per-symbol if needed
            };
        });
    }

    /**
     * Fetch funding rate for a symbol.
     */
    async getFundingRate(symbol: string, limit: number = 1): Promise<Array<{
        symbol: string;
        fundingRate: number;
        fundingTime: number;
    }>> {
        const data = await this.publicGet('/fapi/v1/fundingRate', {
            symbol: symbol.toUpperCase(),
            limit,
        });

        if (!Array.isArray(data)) return [];

        return data.map((r: Record<string, string | number>) => ({
            symbol: String(r.symbol),
            fundingRate: parseFloat(String(r.fundingRate)),
            fundingTime: Number(r.fundingTime),
        }));
    }

    // ─── Authenticated Endpoints ───────────────────────────────

    /**
     * Get account balances and position information.
     */
    async getAccountInfo(): Promise<{
        totalWalletBalance: number;
        availableBalance: number;
        totalUnrealizedProfit: number;
        positions: Array<{
            symbol: string;
            positionAmt: number;
            entryPrice: number;
            unrealizedProfit: number;
            leverage: number;
            isolated: boolean;
        }>;
    }> {
        const data = await this.signedGet('/fapi/v2/account', {});

        return {
            totalWalletBalance: parseFloat(data.totalWalletBalance),
            availableBalance: parseFloat(data.availableBalance),
            totalUnrealizedProfit: parseFloat(data.totalUnrealizedProfit),
            positions: (data.positions as Array<Record<string, string>>)
                .filter((p) => parseFloat(p.positionAmt) !== 0)
                .map((p) => ({
                    symbol: p.symbol,
                    positionAmt: parseFloat(p.positionAmt),
                    entryPrice: parseFloat(p.entryPrice),
                    unrealizedProfit: parseFloat(p.unRealizedProfit),
                    leverage: parseInt(p.leverage, 10),
                    isolated: p.isolated === 'true',
                })),
        };
    }

    /**
     * Set leverage for a symbol.
     */
    async setLeverage(symbol: string, leverage: number): Promise<{ symbol: string; leverage: number }> {
        const data = await this.signedPost('/fapi/v1/leverage', {
            symbol: symbol.toUpperCase(),
            leverage: Math.min(leverage, 10), // Risk Manager cap enforced here
        });

        return {
            symbol: data.symbol,
            leverage: data.leverage,
        };
    }

    /**
     * Set margin type for a symbol (ISOLATED or CROSSED).
     * Only call when NOT in a position — Binance rejects if position exists.
     */
    async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<{ success: boolean }> {
        try {
            await this.signedPost('/fapi/v1/marginType', {
                symbol: symbol.toUpperCase(),
                marginType,
            });
            return { success: true };
        } catch (error) {
            // Binance returns -4046 if margin type is already set
            if (error instanceof BinanceApiError && error.code === -4046) {
                return { success: true }; // Already set, not an error
            }
            throw error;
        }
    }

    // ─── Order Execution Endpoints ────────────────────────────

    /**
     * Place a new order on Binance Futures.
     * 
     * CRITICAL SAFETY RULES:
     * - NEVER retried (POST request — duplicate order risk)
     * - Leverage capped at 10 (Risk Manager Rule #4)
     * - stopLoss is REQUIRED (type-enforced via OrderRequest)
     * - Quantity/Price should be pre-adjusted via ExchangeInfoCache
     */
    async placeOrder(params: {
        symbol: string;
        side: 'BUY' | 'SELL';
        type: 'LIMIT' | 'MARKET' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
        quantity: number;
        price?: number;
        stopPrice?: number;
        timeInForce?: 'GTC' | 'IOC' | 'FOK';
        reduceOnly?: boolean;
        newClientOrderId?: string;
    }): Promise<OrderResult> {
        const orderParams: Record<string, string | number> = {
            symbol: params.symbol.toUpperCase(),
            side: params.side,
            type: params.type,
            quantity: params.quantity,
        };

        // LIMIT orders require price and timeInForce
        if (params.type === 'LIMIT') {
            if (!params.price) {
                throw new BinanceApiError('LIMIT order requires price', -1, 400, false);
            }
            orderParams.price = params.price;
            orderParams.timeInForce = params.timeInForce ?? 'GTC';
        }

        // STOP_MARKET and TAKE_PROFIT_MARKET require stopPrice
        if ((params.type === 'STOP_MARKET' || params.type === 'TAKE_PROFIT_MARKET') && params.stopPrice) {
            orderParams.stopPrice = params.stopPrice;
        }

        if (params.reduceOnly) {
            orderParams.reduceOnly = 'true';
        }

        if (params.newClientOrderId) {
            orderParams.newClientOrderId = params.newClientOrderId;
        }

        const data = await this.signedPost('/fapi/v1/order', orderParams);

        return this.mapOrderResult(data);
    }

    /**
     * Cancel a specific order by orderId or clientOrderId.
     * NEVER retried — order may already be filled.
     */
    async cancelOrder(symbol: string, orderId?: number, clientOrderId?: string): Promise<OrderResult> {
        if (!orderId && !clientOrderId) {
            throw new BinanceApiError('Either orderId or origClientOrderId is required', -1, 400, false);
        }

        const params: Record<string, string | number> = {
            symbol: symbol.toUpperCase(),
        };

        if (orderId) params.orderId = orderId;
        if (clientOrderId) params.origClientOrderId = clientOrderId;

        const data = await this.signedDelete('/fapi/v1/order', params);

        return this.mapOrderResult(data);
    }

    /**
     * Cancel ALL open orders for a symbol.
     * Emergency function — use with caution.
     */
    async cancelAllOrders(symbol: string): Promise<{ code: number; msg: string }> {
        const data = await this.signedDelete('/fapi/v1/allOpenOrders', {
            symbol: symbol.toUpperCase(),
        });

        return {
            code: data.code ?? 200,
            msg: data.msg ?? 'success',
        };
    }

    /**
     * Get all open orders for a symbol (or all symbols if omitted).
     */
    async getOpenOrders(symbol?: string): Promise<OrderResult[]> {
        const params: Record<string, string | number> = {};
        if (symbol) params.symbol = symbol.toUpperCase();

        const data = await this.signedGet('/fapi/v1/openOrders', params);

        if (!Array.isArray(data)) return [];
        return data.map((o: Record<string, unknown>) => this.mapOrderResult(o));
    }

    /**
     * Get position risk for all symbols or a specific symbol.
     * Returns only positions with non-zero amounts.
     */
    async getPositionRisk(symbol?: string): Promise<PositionInfo[]> {
        const params: Record<string, string | number> = {};
        if (symbol) params.symbol = symbol.toUpperCase();

        const data = await this.signedGet('/fapi/v2/positionRisk', params);

        if (!Array.isArray(data)) return [];

        return data
            .filter((p: Record<string, string>) => parseFloat(p.positionAmt) !== 0)
            .map((p: Record<string, string>): PositionInfo => ({
                symbol: p.symbol,
                side: parseFloat(p.positionAmt) > 0 ? 'LONG' : 'SHORT',
                positionAmt: parseFloat(p.positionAmt),
                entryPrice: parseFloat(p.entryPrice),
                markPrice: parseFloat(p.markPrice),
                unrealizedProfit: parseFloat(p.unRealizedProfit),
                leverage: parseInt(p.leverage, 10),
                marginType: p.marginType as 'isolated' | 'cross',
                isolatedMargin: parseFloat(p.isolatedMargin ?? '0'),
                liquidationPrice: parseFloat(p.liquidationPrice),
                maxNotionalValue: parseFloat(p.maxNotionalValue ?? '0'),
                notional: parseFloat(p.notional ?? '0'),
                updateTime: parseInt(p.updateTime, 10),
            }));
    }

    /**
     * Get order book depth for a symbol.
     */
    async getOrderBook(symbol: string, limit: 5 | 10 | 20 | 50 | 100 = 10): Promise<OrderBookSnapshot> {
        const data = await this.publicGet('/fapi/v1/depth', {
            symbol: symbol.toUpperCase(),
            limit,
        });

        return {
            symbol: symbol.toUpperCase(),
            lastUpdateId: data.lastUpdateId,
            bids: (data.bids as string[][]).map(([p, q]) => ({
                price: parseFloat(p),
                quantity: parseFloat(q),
            })),
            asks: (data.asks as string[][]).map(([p, q]) => ({
                price: parseFloat(p),
                quantity: parseFloat(q),
            })),
            timestamp: Date.now(),
        };
    }

    // ─── Utility Methods ───────────────────────────────────────

    /**
     * Check if the client has valid API credentials configured.
     */
    hasCredentials(): boolean {
        return this.config.apiKey.length > 0 && this.config.apiSecret.length > 0;
    }

    /**
     * Check if running in testnet mode.
     */
    isTestnet(): boolean {
        return this.config.isTestnet;
    }

    /**
     * Get the WebSocket base URL for the current environment.
     */
    getWebSocketUrl(): string {
        return getBaseUrls(this.config.isTestnet).ws;
    }

    /**
     * Clean up resources.
     */
    destroy(): void {
        this.rateLimiter.destroy();
    }

    /**
     * Get the current rate limit status from the Adaptive Rate Governor.
     */
    getRateStatus(): AdaptiveRateStatus {
        return this.rateLimiter.getStatus();
    }

    // ─── Internal: Order Result Mapper ─────────────────────────

    private mapOrderResult(data: Record<string, unknown>): OrderResult {
        return {
            orderId: Number(data.orderId),
            clientOrderId: String(data.clientOrderId ?? ''),
            symbol: String(data.symbol),
            side: String(data.side) as OrderResult['side'],
            type: String(data.type) as OrderResult['type'],
            status: String(data.status) as OrderResult['status'],
            price: parseFloat(String(data.price ?? '0')),
            avgPrice: parseFloat(String(data.avgPrice ?? '0')),
            origQty: parseFloat(String(data.origQty ?? '0')),
            executedQty: parseFloat(String(data.executedQty ?? '0')),
            cumQuote: parseFloat(String(data.cumQuote ?? data.cumQty ?? '0')),
            reduceOnly: data.reduceOnly === true || data.reduceOnly === 'true',
            stopPrice: parseFloat(String(data.stopPrice ?? '0')),
            timeInForce: String(data.timeInForce ?? 'GTC'),
            updateTime: Number(data.updateTime ?? Date.now()),
            workingType: (String(data.workingType ?? 'CONTRACT_PRICE')) as OrderResult['workingType'],
        };
    }

    // ─── Internal: HTTP Methods ────────────────────────────────

    private async publicGet(
        endpoint: string,
        params: Record<string, string | number>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        return this.requestWithRetry('GET', endpoint, params, false);
    }

    private async signedGet(
        endpoint: string,
        params: Record<string, string | number>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        return this.requestWithRetry('GET', endpoint, params, true);
    }

    private async signedPost(
        endpoint: string,
        params: Record<string, string | number>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        // NEVER retry POST requests (risk of duplicate orders)
        return this.request('POST', endpoint, params, true);
    }

    private async signedDelete(
        endpoint: string,
        params: Record<string, string | number>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        // NEVER retry DELETE requests (order may already be filled/cancelled)
        return this.request('DELETE', endpoint, params, true);
    }

    private async requestWithRetry(
        method: string,
        endpoint: string,
        params: Record<string, string | number>,
        signed: boolean,
        attempt: number = 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        try {
            return await this.request(method, endpoint, params, signed);
        } catch (error) {
            if (
                error instanceof BinanceApiError &&
                error.retryable &&
                attempt < RETRY_CONFIG.maxRetries
            ) {
                const delay = Math.min(
                    RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
                    RETRY_CONFIG.maxDelayMs,
                );
                await this.sleep(delay);
                return this.requestWithRetry(method, endpoint, params, signed, attempt + 1);
            }
            throw error;
        }
    }

    private async request(
        method: string,
        endpoint: string,
        params: Record<string, string | number>,
        signed: boolean,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        await this.rateLimiter.acquire();

        try {
            let allParams = { ...params };

            if (signed) {
                await this.syncServerTime();
                const timestamp = Date.now() + this.serverTimeDelta;
                allParams = { ...allParams, timestamp };

                const queryString = Object.entries(allParams)
                    .map(([k, v]) => `${k}=${v}`)
                    .join('&');

                const signature = crypto
                    .createHmac('sha256', this.config.apiSecret)
                    .update(queryString)
                    .digest('hex');

                allParams = { ...allParams, signature };
            }

            const queryString = Object.entries(allParams)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');

            const url = method === 'GET'
                ? `${this.baseUrl}${endpoint}?${queryString}`
                : `${this.baseUrl}${endpoint}`;

            const headers: Record<string, string> = {
                'Content-Type': 'application/x-www-form-urlencoded',
            };

            if (signed) {
                headers['X-MBX-APIKEY'] = this.config.apiKey;
            }

            const fetchOptions: RequestInit = {
                method,
                headers,
            };

            if (method === 'POST' || method === 'DELETE') {
                fetchOptions.body = queryString;
            }

            const response = await fetch(url, fetchOptions);

            // Adaptive Rate Governor: read weight/order headers
            this.rateLimiter.updateFromHeaders(response.headers);

            const data = await response.json();

            if (!response.ok) {
                const code = data?.code ?? -1;
                const msg = data?.msg ?? `HTTP ${response.status}`;
                const retryable = RETRYABLE_ERROR_CODES.has(code) && !NON_RETRYABLE_ERROR_CODES.has(code);

                throw new BinanceApiError(
                    `Binance API Error: ${msg} (code: ${code})`,
                    code,
                    response.status,
                    retryable,
                );
            }

            return data;
        } finally {
            this.rateLimiter.release();
        }
    }

    // ─── Internal: Time Sync ───────────────────────────────────

    private async syncServerTime(): Promise<void> {
        // Re-sync every 5 minutes
        const SYNC_INTERVAL = 5 * 60 * 1000;
        if (Date.now() - this.lastTimeSyncAt < SYNC_INTERVAL) return;

        try {
            const localBefore = Date.now();
            const response = await fetch(`${this.baseUrl}/fapi/v1/time`);
            const data = await response.json();
            const localAfter = Date.now();

            const serverTime = data.serverTime;
            const roundTrip = localAfter - localBefore;
            // Estimate server time at midpoint of request
            this.serverTimeDelta = serverTime - (localBefore + roundTrip / 2);
            this.lastTimeSyncAt = Date.now();
        } catch (error) {
            console.warn('[BinanceREST] Time sync failed, using local time:', error);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
