// ============================================================
// Learner: Market Regime Detector — Context-Aware Classification
// ============================================================
// Council Decision: Dr. Koza's mandate — strategies must prove
// they work across multiple market regimes, not just one.
// ============================================================

import {
    OHLCV,
    MarketRegime,
    Trade,
} from '@/types';

// ─── Regime Detection Configuration ─────────────────────────

export interface RegimeDetectorConfig {
    adxPeriod: number;           // ADX lookback for trend strength (default: 14)
    adxTrendThreshold: number;   // ADX above this = trending (default: 25)
    adxRangeThreshold: number;   // ADX below this = ranging (default: 20)
    atrPeriod: number;           // ATR lookback for volatility (default: 14)
    volatilityHighPercentile: number;  // ATR above this percentile = high vol (0.75)
    volatilityLowPercentile: number;   // ATR below this percentile = low vol (0.25)
    smaPeriod: number;           // SMA period for direction bias (50)
}

export const DEFAULT_REGIME_CONFIG: RegimeDetectorConfig = {
    adxPeriod: 14,
    adxTrendThreshold: 25,
    adxRangeThreshold: 20,
    atrPeriod: 14,
    volatilityHighPercentile: 0.75,
    volatilityLowPercentile: 0.25,
    smaPeriod: 50,
};

// ─── Regime Analysis Result ──────────────────────────────────

export interface RegimeAnalysis {
    currentRegime: MarketRegime;
    confidence: number;           // 0-1 confidence in regime classification
    adxValue: number;
    atrValue: number;
    atrPercentile: number;        // Where current ATR sits vs history (0-1)
    smaDirection: 'above' | 'below';
    regimeHistory: MarketRegime[];
    regimeDuration: number;       // How many candles in current regime
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Detect the current market regime from OHLCV candle data.
 * Uses ADX for trend strength, ATR for volatility, and SMA for direction.
 *
 * Classification logic:
 * - ADX > 25 + price above SMA → TRENDING_UP
 * - ADX > 25 + price below SMA → TRENDING_DOWN
 * - ADX < 20 + ATR < 25th percentile → LOW_VOLATILITY
 * - ADX < 20 + ATR > 75th percentile → HIGH_VOLATILITY
 * - Everything else → RANGING
 */
export function detectRegime(
    candles: OHLCV[],
    config: Partial<RegimeDetectorConfig> = {}
): RegimeAnalysis {
    const cfg: RegimeDetectorConfig = { ...DEFAULT_REGIME_CONFIG, ...config };

    if (candles.length < Math.max(cfg.adxPeriod, cfg.atrPeriod, cfg.smaPeriod) + 10) {
        return createDefaultAnalysis();
    }

    // Calculate indicators
    const adxValue = calculateADX(candles, cfg.adxPeriod);
    const atrValue = calculateATR(candles, cfg.atrPeriod);
    const atrHistory = calculateATRHistory(candles, cfg.atrPeriod);
    const atrPercentile = calculatePercentile(atrHistory, atrValue);
    const smaValue = calculateSMA(candles, cfg.smaPeriod);
    const currentPrice = candles[candles.length - 1].close;
    const smaDirection: 'above' | 'below' = currentPrice >= smaValue ? 'above' : 'below';

    // Classify regime
    let currentRegime: MarketRegime;
    let confidence: number;

    if (adxValue >= cfg.adxTrendThreshold) {
        // Strong trend
        if (smaDirection === 'above') {
            currentRegime = MarketRegime.TRENDING_UP;
            confidence = Math.min(1, (adxValue - cfg.adxTrendThreshold) / 25 + 0.5);
        } else {
            currentRegime = MarketRegime.TRENDING_DOWN;
            confidence = Math.min(1, (adxValue - cfg.adxTrendThreshold) / 25 + 0.5);
        }
    } else if (adxValue <= cfg.adxRangeThreshold) {
        // No trend — classify by volatility
        if (atrPercentile >= cfg.volatilityHighPercentile) {
            currentRegime = MarketRegime.HIGH_VOLATILITY;
            confidence = Math.min(1, atrPercentile);
        } else if (atrPercentile <= cfg.volatilityLowPercentile) {
            currentRegime = MarketRegime.LOW_VOLATILITY;
            confidence = Math.min(1, 1 - atrPercentile);
        } else {
            currentRegime = MarketRegime.RANGING;
            confidence = 0.5;
        }
    } else {
        // Ambiguous zone (ADX between range and trend thresholds)
        currentRegime = MarketRegime.RANGING;
        confidence = 0.3;
    }

    // Calculate regime history for recent candles
    const regimeHistory = getRegimeHistorySampled(candles, cfg, 20);

    // Calculate how long we've been in current regime
    let regimeDuration = 1;
    for (let i = regimeHistory.length - 2; i >= 0; i--) {
        if (regimeHistory[i] === currentRegime) {
            regimeDuration++;
        } else {
            break;
        }
    }

    return {
        currentRegime,
        confidence: Math.round(confidence * 100) / 100,
        adxValue: Math.round(adxValue * 100) / 100,
        atrValue: Math.round(atrValue * 100) / 100,
        atrPercentile: Math.round(atrPercentile * 10000) / 10000,
        smaDirection,
        regimeHistory,
        regimeDuration,
    };
}

/**
 * Get the regime history for a set of candles at sampled intervals.
 * Useful for understanding regime transitions over a longer period.
 */
export function getRegimeHistory(
    candles: OHLCV[],
    config: Partial<RegimeDetectorConfig> = {},
    windowSize: number = 50
): MarketRegime[] {
    const cfg: RegimeDetectorConfig = { ...DEFAULT_REGIME_CONFIG, ...config };
    const minCandles = Math.max(cfg.adxPeriod, cfg.atrPeriod, cfg.smaPeriod) + 10;

    if (candles.length < minCandles + windowSize) {
        return [MarketRegime.RANGING];
    }

    const regimes: MarketRegime[] = [];
    for (let i = minCandles; i <= candles.length; i += windowSize) {
        const windowCandles = candles.slice(0, i);
        const analysis = detectRegime(windowCandles, cfg);
        regimes.push(analysis.currentRegime);
    }

    return regimes;
}

/**
 * Calculate regime diversity for a set of trades.
 * Returns the number of unique market regimes the trades span.
 * A strategy must have trades in ≥ 2 regimes to be considered robust.
 */
export function calculateRegimeDiversity(
    tradeRegimes: MarketRegime[]
): { uniqueRegimes: number; regimeCounts: Record<MarketRegime, number>; isDiverse: boolean } {
    const regimeCounts: Record<string, number> = {};

    for (const regime of tradeRegimes) {
        regimeCounts[regime] = (regimeCounts[regime] ?? 0) + 1;
    }

    const uniqueRegimes = Object.keys(regimeCounts).length;

    return {
        uniqueRegimes,
        regimeCounts: regimeCounts as Record<MarketRegime, number>,
        isDiverse: uniqueRegimes >= 2,
    };
}

/**
 * Assign a market regime to a trade based on OHLCV data at trade entry time.
 * This is used to tag each trade with its market context.
 */
export function classifyTradeRegime(
    trade: Trade,
    candles: OHLCV[],
    config: Partial<RegimeDetectorConfig> = {}
): MarketRegime {
    // Find candles up to trade entry time
    const relevantCandles = candles.filter(c => c.timestamp <= trade.entryTime);

    if (relevantCandles.length < 60) {
        return MarketRegime.RANGING; // Default if insufficient data
    }

    const analysis = detectRegime(relevantCandles, config);
    return analysis.currentRegime;
}

// ─── Technical Indicator Calculations ────────────────────────

/**
 * Calculate Average Directional Index (ADX).
 * ADX measures trend strength regardless of direction.
 * ADX > 25 = trending, < 20 = ranging.
 */
export function calculateADX(candles: OHLCV[], period: number): number {
    if (candles.length < period * 2) return 15; // Default to low/ranging

    const trueRanges: number[] = [];
    const plusDMs: number[] = [];
    const minusDMs: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];

        // True Range
        const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        );
        trueRanges.push(tr);

        // Directional Movement
        const upMove = curr.high - prev.high;
        const downMove = prev.low - curr.low;

        plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Smoothed values using Wilder's smoothing
    const smoothedTR = wilderSmooth(trueRanges, period);
    const smoothedPlusDM = wilderSmooth(plusDMs, period);
    const smoothedMinusDM = wilderSmooth(minusDMs, period);

    if (smoothedTR <= 0) return 15;

    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;
    const diSum = plusDI + minusDI;

    if (diSum <= 0) return 15;

    const dx = Math.abs(plusDI - minusDI) / diSum * 100;
    return dx; // Simplified ADX (single-period DX)
}

/**
 * Calculate Average True Range (ATR) for volatility measurement.
 */
export function calculateATR(candles: OHLCV[], period: number): number {
    if (candles.length < period + 1) return 0;

    const trueRanges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];
        const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        );
        trueRanges.push(tr);
    }

    // Latest ATR = average of last `period` true ranges
    const recentTRs = trueRanges.slice(-period);
    return recentTRs.reduce((s, v) => s + v, 0) / recentTRs.length;
}

/**
 * Calculate ATR values for each point in history (for percentile computation).
 */
function calculateATRHistory(candles: OHLCV[], period: number): number[] {
    const atrValues: number[] = [];
    const minCandles = period + 1;

    for (let i = minCandles; i <= candles.length; i++) {
        const slice = candles.slice(0, i);
        atrValues.push(calculateATR(slice, period));
    }

    return atrValues;
}

/**
 * Calculate Simple Moving Average.
 */
function calculateSMA(candles: OHLCV[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1]?.close ?? 0;
    const slice = candles.slice(-period);
    return slice.reduce((s, c) => s + c.close, 0) / slice.length;
}

/**
 * Wilder's exponential smoothing (used for ADX calculation).
 */
function wilderSmooth(values: number[], period: number): number {
    if (values.length < period) return 0;

    // Initial value = simple average of first `period` values
    let smoothed = values.slice(0, period).reduce((s, v) => s + v, 0) / period;

    // Apply Wilder's smoothing for remaining values
    for (let i = period; i < values.length; i++) {
        smoothed = (smoothed * (period - 1) + values[i]) / period;
    }

    return smoothed;
}

/**
 * Calculate percentile rank of a value within a sorted distribution.
 */
function calculatePercentile(values: number[], target: number): number {
    if (values.length === 0) return 0.5;
    const sorted = [...values].sort((a, b) => a - b);
    const countBelow = sorted.filter(v => v < target).length;
    return countBelow / sorted.length;
}

/**
 * Get sampled regime history (every N candles) for efficiency.
 */
function getRegimeHistorySampled(
    candles: OHLCV[],
    config: RegimeDetectorConfig,
    sampleCount: number
): MarketRegime[] {
    const minCandles = Math.max(config.adxPeriod, config.atrPeriod, config.smaPeriod) + 10;
    if (candles.length < minCandles) return [MarketRegime.RANGING];

    const step = Math.max(1, Math.floor((candles.length - minCandles) / sampleCount));
    const regimes: MarketRegime[] = [];

    for (let i = minCandles; i <= candles.length; i += step) {
        const windowCandles = candles.slice(0, i);
        // Lightweight regime detection (reuse calculate functions)
        const adxValue = calculateADX(windowCandles, config.adxPeriod);
        const currentPrice = windowCandles[windowCandles.length - 1].close;
        const smaValue = calculateSMA(windowCandles, config.smaPeriod);
        const atrValue = calculateATR(windowCandles, config.atrPeriod);
        const atrHistory = calculateATRHistory(windowCandles, config.atrPeriod);
        const atrPercentile = calculatePercentile(atrHistory, atrValue);

        let regime: MarketRegime;
        if (adxValue >= config.adxTrendThreshold) {
            regime = currentPrice >= smaValue ? MarketRegime.TRENDING_UP : MarketRegime.TRENDING_DOWN;
        } else if (adxValue <= config.adxRangeThreshold) {
            if (atrPercentile >= config.volatilityHighPercentile) {
                regime = MarketRegime.HIGH_VOLATILITY;
            } else if (atrPercentile <= config.volatilityLowPercentile) {
                regime = MarketRegime.LOW_VOLATILITY;
            } else {
                regime = MarketRegime.RANGING;
            }
        } else {
            regime = MarketRegime.RANGING;
        }

        regimes.push(regime);
    }

    return regimes;
}

/**
 * Create default analysis when insufficient data is available.
 */
function createDefaultAnalysis(): RegimeAnalysis {
    return {
        currentRegime: MarketRegime.RANGING,
        confidence: 0,
        adxValue: 0,
        atrValue: 0,
        atrPercentile: 0.5,
        smaDirection: 'above',
        regimeHistory: [MarketRegime.RANGING],
        regimeDuration: 0,
    };
}
