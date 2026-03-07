// ============================================================
// Learner: Exchange Circuit Breaker + ExchangeInfo Cache
// ============================================================
// 3-state circuit breaker protecting ALL Binance API calls.
// Prevents cascading failures when the exchange is down.
//
// States:
//   CLOSED    → Normal operation, all requests pass through
//   OPEN      → Tripped after threshold failures, requests rejected
//   HALF_OPEN → Cooldown expired, testing with probe requests
//
// Also includes ExchangeInfoCache — auto-refreshing cache of
// trading filters (minQty, stepSize, tickSize, minNotional).
// Validates and adjusts order parameters before they reach Binance.
// ============================================================

import {
    CircuitBreakerState,
    CircuitBreakerStatus,
    ExchangeSymbolInfo,
} from '@/types';

// ─── Circuit Breaker Configuration ──────────────────────────

interface CircuitBreakerConfig {
    failureThreshold: number;    // Consecutive failures before tripping
    cooldownMs: number;          // Time in OPEN state before HALF_OPEN probe
    halfOpenMaxProbes: number;   // Successful probes needed to close circuit
    monitorWindowMs: number;     // Rolling window for failure counting
}

const DEFAULT_CB_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    cooldownMs: 30000,           // 30 seconds
    halfOpenMaxProbes: 2,
    monitorWindowMs: 60000,      // 1 minute
};

// ─── Circuit Breaker ────────────────────────────────────────

export class ExchangeCircuitBreaker {
    private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
    private failureTimestamps: number[] = [];
    private successfulProbes = 0;
    private lastFailure: number | null = null;
    private lastSuccess: number | null = null;
    private tripCount = 0;
    private trippedAt: number | null = null;
    private readonly config: CircuitBreakerConfig;

    constructor(config: Partial<CircuitBreakerConfig> = {}) {
        this.config = { ...DEFAULT_CB_CONFIG, ...config };
    }

    /**
     * Execute a function through the circuit breaker.
     * @throws Error if circuit is OPEN and cooldown hasn't expired
     */
    async execute<T>(fn: () => Promise<T>, label: string = 'request'): Promise<T> {
        // OPEN → Check if cooldown has passed
        if (this.state === CircuitBreakerState.OPEN) {
            const elapsed = Date.now() - (this.trippedAt ?? 0);
            if (elapsed < this.config.cooldownMs) {
                const remainingMs = this.config.cooldownMs - elapsed;
                throw new CircuitBreakerError(
                    `Circuit breaker OPEN — ${label} rejected. Retry in ${Math.ceil(remainingMs / 1000)}s`,
                    this.getStatus(),
                );
            }
            // Transition to HALF_OPEN for probe
            this.state = CircuitBreakerState.HALF_OPEN;
            this.successfulProbes = 0;
            console.log(`[CircuitBreaker] OPEN → HALF_OPEN: allowing probe for "${label}"`);
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * Record a successful request.
     */
    private onSuccess(): void {
        this.lastSuccess = Date.now();

        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this.successfulProbes++;
            if (this.successfulProbes >= this.config.halfOpenMaxProbes) {
                // Enough successful probes → close circuit
                this.state = CircuitBreakerState.CLOSED;
                this.failureTimestamps = [];
                this.trippedAt = null;
                console.log('[CircuitBreaker] HALF_OPEN → CLOSED: circuit recovered');
            }
        } else {
            // In CLOSED state, prune old failures outside the window
            this.pruneOldFailures();
        }
    }

    /**
     * Record a failed request.
     */
    private onFailure(): void {
        const now = Date.now();
        this.lastFailure = now;
        this.failureTimestamps.push(now);
        this.pruneOldFailures();

        if (this.state === CircuitBreakerState.HALF_OPEN) {
            // Probe failed → back to OPEN
            this.state = CircuitBreakerState.OPEN;
            this.trippedAt = now;
            this.successfulProbes = 0;
            console.warn('[CircuitBreaker] HALF_OPEN → OPEN: probe failed, extending cooldown');
            return;
        }

        // CLOSED state — check if threshold exceeded
        if (this.failureTimestamps.length >= this.config.failureThreshold) {
            this.state = CircuitBreakerState.OPEN;
            this.trippedAt = now;
            this.tripCount++;
            console.error(
                `[CircuitBreaker] CLOSED → OPEN: ${this.failureTimestamps.length} failures in ` +
                `${this.config.monitorWindowMs / 1000}s window (trip #${this.tripCount})`
            );
        }
    }

    /**
     * Remove failure timestamps outside the monitoring window.
     */
    private pruneOldFailures(): void {
        const cutoff = Date.now() - this.config.monitorWindowMs;
        this.failureTimestamps = this.failureTimestamps.filter(t => t > cutoff);
    }

    /**
     * Get current circuit breaker status for monitoring.
     */
    getStatus(): CircuitBreakerStatus {
        let nextProbeAt: number | null = null;
        if (this.state === CircuitBreakerState.OPEN && this.trippedAt) {
            nextProbeAt = this.trippedAt + this.config.cooldownMs;
        }

        return {
            state: this.state,
            failureCount: this.failureTimestamps.length,
            lastFailure: this.lastFailure,
            lastSuccess: this.lastSuccess,
            tripCount: this.tripCount,
            nextProbeAt,
        };
    }

    /**
     * Force-reset the circuit breaker to CLOSED state.
     * Use only for manual intervention / testing.
     */
    reset(): void {
        this.state = CircuitBreakerState.CLOSED;
        this.failureTimestamps = [];
        this.successfulProbes = 0;
        this.trippedAt = null;
        console.log('[CircuitBreaker] Manually reset to CLOSED');
    }
}

// ─── Circuit Breaker Error ──────────────────────────────────

export class CircuitBreakerError extends Error {
    constructor(
        message: string,
        public readonly status: CircuitBreakerStatus,
    ) {
        super(message);
        this.name = 'CircuitBreakerError';
    }
}

// ─── Exchange Info Cache ────────────────────────────────────

interface ExchangeInfoCacheConfig {
    ttlMs: number;               // Time-to-live for cached data
    refreshOnStale: boolean;     // Auto-refresh when accessed while stale
}

const DEFAULT_CACHE_CONFIG: ExchangeInfoCacheConfig = {
    ttlMs: 3600000,              // 1 hour
    refreshOnStale: true,
};

export class ExchangeInfoCache {
    private cache: Map<string, ExchangeSymbolInfo> = new Map();
    private lastRefreshedAt = 0;
    private refreshPromise: Promise<void> | null = null;
    private readonly config: ExchangeInfoCacheConfig;
    private readonly fetchFn: () => Promise<ExchangeSymbolInfo[]>;

    constructor(
        fetchFn: () => Promise<ExchangeSymbolInfo[]>,
        config: Partial<ExchangeInfoCacheConfig> = {},
    ) {
        this.fetchFn = fetchFn;
        this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    }

    /**
     * Get symbol info from cache. Auto-refreshes if stale.
     */
    async getSymbolInfo(symbol: string): Promise<ExchangeSymbolInfo | null> {
        await this.ensureFresh();
        return this.cache.get(symbol.toUpperCase()) ?? null;
    }

    /**
     * Get all cached symbols.
     */
    async getAllSymbols(): Promise<ExchangeSymbolInfo[]> {
        await this.ensureFresh();
        return Array.from(this.cache.values());
    }

    /**
     * Adjust quantity to match exchange filters.
     * Rounds down to nearest stepSize and enforces minQuantity.
     * @throws Error if quantity is below minimum after adjustment
     */
    async adjustQuantity(symbol: string, quantity: number): Promise<number> {
        const info = await this.getSymbolInfo(symbol);
        if (!info) {
            throw new Error(`[ExchangeInfoCache] Unknown symbol: ${symbol}`);
        }

        // Round down to nearest stepSize
        const adjusted = Math.floor(quantity / info.stepSize) * info.stepSize;
        // Round to quantityPrecision to avoid floating point artifacts
        const rounded = parseFloat(adjusted.toFixed(info.quantityPrecision));

        if (rounded < info.minQuantity) {
            throw new Error(
                `[ExchangeInfoCache] Quantity ${rounded} below minimum ${info.minQuantity} for ${symbol}`
            );
        }

        return rounded;
    }

    /**
     * Adjust price to match exchange tick size.
     * Rounds to nearest tickSize.
     */
    async adjustPrice(symbol: string, price: number): Promise<number> {
        const info = await this.getSymbolInfo(symbol);
        if (!info) {
            throw new Error(`[ExchangeInfoCache] Unknown symbol: ${symbol}`);
        }

        const adjusted = Math.round(price / info.tickSize) * info.tickSize;
        return parseFloat(adjusted.toFixed(info.pricePrecision));
    }

    /**
     * Validate order against all exchange filters.
     * Returns null if valid, or a human-readable error message.
     */
    async validateOrder(symbol: string, quantity: number, price: number): Promise<string | null> {
        const info = await this.getSymbolInfo(symbol);
        if (!info) {
            return `Unknown symbol: ${symbol}`;
        }

        if (quantity < info.minQuantity) {
            return `Quantity ${quantity} below minimum ${info.minQuantity} for ${symbol}`;
        }

        // Check step size
        const stepRemainder = quantity % info.stepSize;
        if (stepRemainder > info.stepSize * 0.001) {
            return `Quantity ${quantity} not aligned to stepSize ${info.stepSize} for ${symbol}`;
        }

        // Check notional value
        const notional = quantity * price;
        if (notional < info.minNotional) {
            return `Order notional ${notional.toFixed(2)} USDT below minimum ${info.minNotional} for ${symbol}`;
        }

        // Check tick size
        const tickRemainder = price % info.tickSize;
        if (tickRemainder > info.tickSize * 0.001) {
            return `Price ${price} not aligned to tickSize ${info.tickSize} for ${symbol}`;
        }

        return null; // Valid
    }

    /**
     * Check if cache is populated and fresh.
     */
    isReady(): boolean {
        return this.cache.size > 0 && !this.isStale();
    }

    /**
     * Force a cache refresh.
     */
    async refresh(): Promise<void> {
        // Deduplicate concurrent refresh calls
        if (this.refreshPromise) {
            await this.refreshPromise;
            return;
        }

        this.refreshPromise = this.doRefresh();
        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }
    }

    private async doRefresh(): Promise<void> {
        try {
            const symbols = await this.fetchFn();
            this.cache.clear();
            for (const info of symbols) {
                this.cache.set(info.symbol, info);
            }
            this.lastRefreshedAt = Date.now();
            console.log(`[ExchangeInfoCache] Refreshed: ${symbols.length} symbols cached`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[ExchangeInfoCache] Refresh failed: ${msg}`);
            // Keep stale data rather than clearing cache
            if (this.cache.size === 0) {
                throw new Error(`[ExchangeInfoCache] Initial load failed: ${msg}`);
            }
        }
    }

    private isStale(): boolean {
        return Date.now() - this.lastRefreshedAt > this.config.ttlMs;
    }

    private async ensureFresh(): Promise<void> {
        if (this.isStale() && this.config.refreshOnStale) {
            await this.refresh();
        }
    }
}
