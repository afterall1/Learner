// ============================================================
// Learner: Market Intelligence Cortex — External Awareness
// ============================================================
// Phase 19 Module B: Integrates external market data to give
// the trading agent awareness beyond its internal indicators.
//
// Data sources:
//   1. Fear & Greed Index (Alternative.me API) — crowd sentiment
//   2. Funding Rates (Binance) — market positioning bias
//   3. Volatility Context — internal ATR-based vol percentile
//
// Output: A composite MarketIntelligence score and an
// aggressiveness multiplier that adjusts position sizing.
//
// Contrarian logic:
//   - Extreme Fear + bullish signals → increase aggressiveness
//   - Extreme Greed + bullish signals → decrease aggressiveness
//   - This implements "buy fear, sell greed" at the signal level
// ============================================================

import {
    type MarketIntelligence,
    type IntelligenceConfig,
    type MarketMood,
    type OHLCV,
    DEFAULT_INTELLIGENCE_CONFIG,
} from '@/types';

// ─── Market Mood Classification ──────────────────────────────

/**
 * Classify Fear & Greed Index into a MarketMood category.
 */
function classifyMood(
    fgIndex: number,
    config: IntelligenceConfig,
): MarketMood {
    if (fgIndex <= config.extremeFearThreshold) return 'EXTREME_FEAR';
    if (fgIndex <= 40) return 'FEAR';
    if (fgIndex <= 60) return 'NEUTRAL';
    if (fgIndex >= config.extremeGreedThreshold) return 'EXTREME_GREED';
    return 'GREED';
}

/**
 * Classify funding rate into a directional bias.
 */
function classifyFundingBias(
    rate: number,
): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    if (rate > 0.0001) return 'BULLISH';   // Longs paying shorts
    if (rate < -0.0001) return 'BEARISH';   // Shorts paying longs
    return 'NEUTRAL';
}

// ─── Volatility Percentile ───────────────────────────────────

/**
 * Compute the percentile of current volatility vs historical.
 * Uses ATR as the volatility proxy.
 *
 * @param candles - Historical OHLCV data (at least 200 candles)
 * @param atrPeriod - ATR lookback period
 * @returns 0-100 percentile
 */
function computeVolatilityPercentile(
    candles: OHLCV[],
    atrPeriod: number = 14,
): number {
    if (candles.length < atrPeriod + 50) return 50; // Not enough data

    // Calculate ATR for each candle from atrPeriod onward
    const atrValues: number[] = [];

    for (let i = atrPeriod; i < candles.length; i++) {
        let atrSum = 0;
        for (let j = i - atrPeriod; j < i; j++) {
            const high = candles[j + 1]?.high ?? candles[j].high;
            const low = candles[j + 1]?.low ?? candles[j].low;
            const prevClose = candles[j].close;
            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose),
            );
            atrSum += tr;
        }
        atrValues.push(atrSum / atrPeriod);
    }

    if (atrValues.length === 0) return 50;

    const currentATR = atrValues[atrValues.length - 1];
    const belowCount = atrValues.filter(atr => atr <= currentATR).length;

    return (belowCount / atrValues.length) * 100;
}

// ─── Aggressiveness Multiplier ───────────────────────────────

/**
 * Compute the aggressiveness multiplier based on market conditions.
 *
 * Contrarian logic:
 *   Extreme Fear  → MORE aggressive (others are panicking, opportunities exist)
 *   Extreme Greed → LESS aggressive (market is overheated, risk is high)
 *
 * Volatility adjustment:
 *   Very high vol (>90th percentile) → reduce aggressiveness by 20%
 *   Very low vol (<10th percentile) → reduce aggressiveness by 10% (breakout incoming)
 *
 * Returns: 0.5 to 1.5 multiplier for position sizing
 */
function computeAggressiveness(
    fearGreedIndex: number,
    volatilityPercentile: number,
    fundingRate: number,
): number {
    let multiplier = 1.0;

    // Fear/Greed contrarian adjustment (-0.3 to +0.3)
    if (fearGreedIndex <= 20) {
        // Extreme fear — be more aggressive (contrarian buy)
        multiplier += 0.25;
    } else if (fearGreedIndex <= 35) {
        multiplier += 0.10;
    } else if (fearGreedIndex >= 80) {
        // Extreme greed — be less aggressive (contrarian sell)
        multiplier -= 0.30;
    } else if (fearGreedIndex >= 65) {
        multiplier -= 0.15;
    }

    // Volatility adjustment (-0.2 to 0)
    if (volatilityPercentile > 90) {
        multiplier -= 0.20; // High vol → reduce size
    } else if (volatilityPercentile < 10) {
        multiplier -= 0.10; // Very low vol → potential breakout
    }

    // Extreme funding rate adjustment (-0.1 to 0)
    if (Math.abs(fundingRate) > 0.001) {
        // Very extreme funding → crowded trade, be careful
        multiplier -= 0.10;
    }

    return Math.max(0.5, Math.min(1.5, multiplier));
}

// ─── Composite Score ─────────────────────────────────────────

/**
 * Compute a composite market mood score from all sources.
 *
 * Returns -1 to +1:
 *   -1 = extremely bearish conditions
 *    0 = neutral/uncertain
 *   +1 = extremely bullish conditions
 *
 * Note: This reflects the MARKET MOOD, not a trading signal.
 * The contrarian logic in aggressiveness is separate.
 */
function computeCompositeScore(
    fearGreedIndex: number,
    fundingRate: number,
    volatilityPercentile: number,
): number {
    // Fear/Greed component: -1 to +1
    const fgComponent = (fearGreedIndex - 50) / 50;

    // Funding rate component: -1 to +1
    const fundingComponent = Math.max(-1, Math.min(1, fundingRate * 5000));

    // Volatility component: high vol = bearish pressure
    const volComponent = volatilityPercentile > 70 ? -0.3 : volatilityPercentile < 30 ? 0.2 : 0;

    // Weighted combination
    const composite = fgComponent * 0.5 + fundingComponent * 0.3 + volComponent * 0.2;

    return Math.max(-1, Math.min(1, composite));
}

// ─── Market Intelligence Cortex ──────────────────────────────

/**
 * MarketIntelligenceCortex — Central hub for external market data.
 *
 * Maintains a cached MarketIntelligence snapshot that:
 *   1. Fetches Fear & Greed Index from public API
 *   2. Monitors funding rates from Binance data
 *   3. Computes internal volatility context from candle data
 *   4. Produces a composite intelligence score
 *   5. Calculates an aggressiveness multiplier for position sizing
 */
export class MarketIntelligenceCortex {
    private config: IntelligenceConfig;
    private lastIntelligence: MarketIntelligence | null = null;
    private lastFetchTime: number = 0;
    private historicalCandles: OHLCV[] = [];
    private latestFundingRate: number = 0;

    constructor(config: Partial<IntelligenceConfig> = {}) {
        this.config = { ...DEFAULT_INTELLIGENCE_CONFIG, ...config };
    }

    /**
     * Update the cortex with latest candle data.
     * Call this with each new candle to keep volatility context current.
     */
    updateCandles(candles: OHLCV[]): void {
        this.historicalCandles = candles;
    }

    /**
     * Update the latest funding rate.
     * Call this when new funding rate data arrives from Binance.
     */
    updateFundingRate(rate: number): void {
        this.latestFundingRate = rate;
    }

    /**
     * Get current market intelligence.
     * Returns cached data if fresh enough, otherwise fetches new data.
     */
    async getIntelligence(): Promise<MarketIntelligence> {
        const now = Date.now();

        // Return cached if fresh enough
        if (this.lastIntelligence && (now - this.lastFetchTime) < this.config.fetchIntervalMs) {
            return {
                ...this.lastIntelligence,
                dataAge: (now - this.lastFetchTime) / 1000,
            };
        }

        // Fetch fresh data
        const intelligence = await this.fetchAndComputeIntelligence();
        this.lastIntelligence = intelligence;
        this.lastFetchTime = now;

        return intelligence;
    }

    /**
     * Get synchronous intelligence (from cache only, no fetch).
     * Use this in hot paths where async is not desirable.
     */
    getIntelligenceSync(): MarketIntelligence {
        if (this.lastIntelligence) {
            return {
                ...this.lastIntelligence,
                dataAge: (Date.now() - this.lastFetchTime) / 1000,
            };
        }

        // Return neutral defaults if no data yet
        return this.createNeutralIntelligence();
    }

    /**
     * Check if intelligence data is stale.
     */
    isStale(): boolean {
        if (!this.lastIntelligence) return true;
        return (Date.now() - this.lastFetchTime) > this.config.maxDataAgeMs;
    }

    /**
     * Fetch Fear & Greed Index from Alternative.me API.
     * Gracefully degrades to synthetic computation on failure.
     */
    private async fetchFearGreedIndex(): Promise<number> {
        if (!this.config.enableFearGreed) return 50;

        try {
            const response = await fetch(this.config.fearGreedApiUrl);
            if (!response.ok) {
                console.warn(`[MarketIntelligence] F&G API returned ${response.status}`);
                return this.computeSyntheticFearGreed();
            }

            const data = await response.json() as {
                data?: Array<{ value?: string }>;
            };

            const value = parseInt(data?.data?.[0]?.value ?? '50', 10);
            return isNaN(value) ? 50 : Math.max(0, Math.min(100, value));
        } catch (error) {
            console.warn('[MarketIntelligence] F&G API fetch failed, using synthetic:', error);
            return this.computeSyntheticFearGreed();
        }
    }

    /**
     * Compute a synthetic Fear & Greed Index from internal candle data.
     * Used as fallback when the API is unavailable.
     *
     * Based on:
     *   - 14d price return (momentum)
     *   - 14d volatility vs 30d average
     *   - Volume trend
     */
    private computeSyntheticFearGreed(): number {
        if (this.historicalCandles.length < 30) return 50;

        const recent = this.historicalCandles.slice(-30);
        const last14 = recent.slice(-14);

        // 14d Price return → momentum signal
        const priceReturn = (last14[last14.length - 1].close - last14[0].close) / last14[0].close;
        const momentumScore = Math.max(0, Math.min(100, 50 + priceReturn * 500));

        // Volatility: current vs average
        const recentVol = last14.reduce((s, c) => s + (c.high - c.low) / c.close, 0) / 14;
        const avgVol = recent.reduce((s, c) => s + (c.high - c.low) / c.close, 0) / 30;
        const volRatio = avgVol > 0 ? recentVol / avgVol : 1;
        const volScore = Math.max(0, Math.min(100, 50 - (volRatio - 1) * 100));

        // Volume trend
        const recentVolume = last14.reduce((s, c) => s + c.volume, 0) / 14;
        const avgVolume = recent.reduce((s, c) => s + c.volume, 0) / 30;
        const volumeScore = avgVolume > 0
            ? Math.max(0, Math.min(100, 50 + (recentVolume / avgVolume - 1) * 50))
            : 50;

        // Weighted average
        return Math.round(momentumScore * 0.5 + volScore * 0.3 + volumeScore * 0.2);
    }

    /**
     * Fetch and compute all intelligence components.
     */
    private async fetchAndComputeIntelligence(): Promise<MarketIntelligence> {
        let sourcesAvailable = 0;

        // 1. Fear & Greed Index
        const fearGreedIndex = await this.fetchFearGreedIndex();
        sourcesAvailable++;

        // 2. Funding Rate
        const fundingRate = this.config.enableFundingRate ? this.latestFundingRate : 0;
        if (this.config.enableFundingRate && this.latestFundingRate !== 0) {
            sourcesAvailable++;
        }

        // 3. Volatility Context
        const volatilityPercentile = this.config.enableVolatilityContext
            ? computeVolatilityPercentile(this.historicalCandles)
            : 50;
        if (this.config.enableVolatilityContext && this.historicalCandles.length > 50) {
            sourcesAvailable++;
        }

        // 4. Compute derived values
        const fearGreedClassification = classifyMood(fearGreedIndex, this.config);
        const fundingBias = classifyFundingBias(fundingRate);
        const compositeScore = computeCompositeScore(fearGreedIndex, fundingRate, volatilityPercentile);
        const aggressivenessMultiplier = computeAggressiveness(
            fearGreedIndex,
            volatilityPercentile,
            fundingRate,
        );

        return {
            fearGreedIndex,
            fearGreedClassification,
            fundingRate,
            fundingBias,
            volatilityPercentile,
            compositeScore,
            aggressivenessMultiplier,
            timestamp: Date.now(),
            dataAge: 0,
            sourcesAvailable,
        };
    }

    /**
     * Create neutral intelligence (no external data).
     */
    private createNeutralIntelligence(): MarketIntelligence {
        return {
            fearGreedIndex: 50,
            fearGreedClassification: 'NEUTRAL',
            fundingRate: 0,
            fundingBias: 'NEUTRAL',
            volatilityPercentile: 50,
            compositeScore: 0,
            aggressivenessMultiplier: 1.0,
            timestamp: Date.now(),
            dataAge: 0,
            sourcesAvailable: 0,
        };
    }
}
