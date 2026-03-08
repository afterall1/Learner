// ============================================================
// Learner: Confluence Genes — Multi-Timeframe Alignment Engine
// ============================================================
// Phase 23: Evaluates whether signals from a higher timeframe
// CONFIRM the signals from the primary timeframe. This is the
// "institutional trader filter" — professionals ALWAYS check
// the higher TF before entering on the lower TF.
//
// 4 Confluence Types:
//   1. TREND_ALIGNMENT     — Do primary + HTF trends agree?
//   2. MOMENTUM_CONFLUENCE — Do momentum oscillators agree?
//   3. VOLATILITY_MATCH    — Is HTF volatility env favorable?
//   4. STRUCTURE_CONFLUENCE — Is price near HTF S/R levels?
//
// The GA evolves the TF pair, indicator choice, and thresholds
// — discovering which multi-TF alignments are predictive.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    OHLCV,
    TimeframeConfluenceGene,
    ConfluenceType,
    Timeframe,
    IndicatorType,
} from '@/types';
import {
    calculateSMA,
    calculateEMA,
    calculateADX,
    calculateRSI,
    calculateMACD,
    calculateStochRSI,
    calculateATR,
} from './signal-engine';
import { applyTemporalDecay, type TemporalDecayConfig } from './confluence-tcdw';

// ─── Random Helpers ──────────────────────────────────────────

function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// ─── Constants ───────────────────────────────────────────────

const ALL_CONFLUENCE_TYPES: ConfluenceType[] = [
    ConfluenceType.TREND_ALIGNMENT,
    ConfluenceType.MOMENTUM_CONFLUENCE,
    ConfluenceType.VOLATILITY_MATCH,
    ConfluenceType.STRUCTURE_CONFLUENCE,
];

const TREND_INDICATORS: IndicatorType[] = [
    IndicatorType.EMA,
    IndicatorType.SMA,
    IndicatorType.ADX,
];

const MOMENTUM_INDICATORS: IndicatorType[] = [
    IndicatorType.RSI,
    IndicatorType.MACD,
    IndicatorType.STOCH_RSI,
];

/**
 * Timeframe hierarchy — each TF maps to valid "higher" TFs.
 * Primary must always be strictly lower than higher.
 */
const TF_HIERARCHY: Record<Timeframe, Timeframe[]> = {
    [Timeframe.M1]: [Timeframe.M5, Timeframe.M15, Timeframe.H1],
    [Timeframe.M5]: [Timeframe.M15, Timeframe.H1, Timeframe.H4],
    [Timeframe.M15]: [Timeframe.H1, Timeframe.H4, Timeframe.D1],
    [Timeframe.H1]: [Timeframe.H4, Timeframe.D1],
    [Timeframe.H4]: [Timeframe.D1],
    [Timeframe.D1]: [], // D1 has no higher TF — no confluence possible
};

// ─── Confluence Signal Result ────────────────────────────────

export interface ConfluenceResult {
    geneId: string;
    type: ConfluenceType;
    primaryTimeframe: Timeframe;
    higherTimeframe: Timeframe;
    /** Overall confluence detected? */
    confluent: boolean;
    /** 0-1 agreement strength */
    strength: number;
    /** Direction bias from confluence analysis */
    direction: 'bullish' | 'bearish' | 'neutral';
    /** Type-specific detail values for dashboard/forensics */
    details: Record<string, number | string | boolean>;
}

// ─── Trend Direction Helper ──────────────────────────────────

type TrendDirection = 'bullish' | 'bearish' | 'neutral';

/**
 * Determine trend direction from candle data using the specified indicator.
 */
function determineTrend(
    candles: OHLCV[],
    indicator: IndicatorType,
    period: number,
): { direction: TrendDirection; strength: number } {
    if (candles.length < period + 10) {
        return { direction: 'neutral', strength: 0 };
    }

    switch (indicator) {
        case IndicatorType.EMA: {
            const ema = calculateEMA(candles, period);
            if (ema.length < 2) return { direction: 'neutral', strength: 0 };
            const currentPrice = candles[candles.length - 1].close;
            const currentEMA = ema[ema.length - 1];
            const prevEMA = ema[ema.length - 2];
            const emaSlope = currentEMA - prevEMA;
            const priceVsEMA = (currentPrice - currentEMA) / currentEMA;
            const direction: TrendDirection = priceVsEMA > 0.001 ? 'bullish' : priceVsEMA < -0.001 ? 'bearish' : 'neutral';
            const strength = Math.min(1, Math.abs(priceVsEMA) * 50 + (emaSlope > 0 ? 0.2 : -0.2) + 0.2);
            return { direction, strength: clamp(strength, 0, 1) };
        }

        case IndicatorType.SMA: {
            const sma = calculateSMA(candles, period);
            if (sma.length < 2) return { direction: 'neutral', strength: 0 };
            const currentPrice = candles[candles.length - 1].close;
            const currentSMA = sma[sma.length - 1];
            const prevSMA = sma[sma.length - 2];
            const smaSlope = currentSMA - prevSMA;
            const priceVsSMA = (currentPrice - currentSMA) / currentSMA;
            const direction: TrendDirection = priceVsSMA > 0.001 ? 'bullish' : priceVsSMA < -0.001 ? 'bearish' : 'neutral';
            const strength = Math.min(1, Math.abs(priceVsSMA) * 50 + (smaSlope > 0 ? 0.2 : -0.2) + 0.2);
            return { direction, strength: clamp(strength, 0, 1) };
        }

        case IndicatorType.ADX: {
            const adx = calculateADX(candles, period);
            if (adx.length < 1) return { direction: 'neutral', strength: 0 };
            const adxValue = adx[adx.length - 1];
            // ADX doesn't give direction, so we use price slope
            const recentClose = candles[candles.length - 1].close;
            const pastClose = candles[Math.max(0, candles.length - period)].close;
            const priceChange = (recentClose - pastClose) / pastClose;
            const direction: TrendDirection = adxValue > 25
                ? (priceChange > 0 ? 'bullish' : 'bearish')
                : 'neutral';
            const strength = clamp(adxValue / 100, 0, 1);
            return { direction, strength };
        }

        default:
            return { direction: 'neutral', strength: 0 };
    }
}

// ─── 1. Trend Alignment Evaluator ────────────────────────────

function evaluateTrendAlignment(
    gene: TimeframeConfluenceGene,
    primaryCandles: OHLCV[],
    higherCandles: OHLCV[],
): ConfluenceResult {
    const indicator = gene.params.trendIndicator ?? IndicatorType.EMA;
    const period = gene.params.trendPeriod ?? 20;
    const alignmentRequired = gene.params.alignmentRequired ?? true;

    const primaryTrend = determineTrend(primaryCandles, indicator, period);
    const higherTrend = determineTrend(higherCandles, indicator, period);

    const aligned = primaryTrend.direction === higherTrend.direction &&
        primaryTrend.direction !== 'neutral';

    // Strength: average of both TF strengths, boosted if aligned
    let strength = (primaryTrend.strength + higherTrend.strength) / 2;
    if (aligned) {
        strength = Math.min(1, strength * 1.3); // 30% confidence boost for alignment
    } else {
        strength *= 0.4; // Penalize disagreement
    }

    const confluent = alignmentRequired ? aligned : true;

    // Direction: prefer higher TF direction (institutional bias)
    const direction: 'bullish' | 'bearish' | 'neutral' = higherTrend.direction;

    return {
        geneId: gene.id,
        type: ConfluenceType.TREND_ALIGNMENT,
        primaryTimeframe: gene.primaryTimeframe,
        higherTimeframe: gene.higherTimeframe,
        confluent,
        strength: Math.round(strength * 1000) / 1000,
        direction,
        details: {
            primaryTrend: primaryTrend.direction,
            higherTrend: higherTrend.direction,
            primaryStrength: Math.round(primaryTrend.strength * 100) / 100,
            higherStrength: Math.round(higherTrend.strength * 100) / 100,
            aligned,
            indicator: indicator as string,
            period,
        },
    };
}

// ─── 2. Momentum Confluence Evaluator ────────────────────────

interface MomentumState {
    value: number;
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: number;
}

function calculateMomentum(
    candles: OHLCV[],
    indicator: IndicatorType,
    period: number,
    threshold: number,
): MomentumState {
    if (candles.length < period + 10) {
        return { value: 50, direction: 'neutral', strength: 0 };
    }

    switch (indicator) {
        case IndicatorType.RSI: {
            const rsi = calculateRSI(candles, period);
            if (rsi.length < 1) return { value: 50, direction: 'neutral', strength: 0 };
            const value = rsi[rsi.length - 1];
            const direction: 'bullish' | 'bearish' | 'neutral' =
                value > threshold ? 'bullish' : value < (100 - threshold) ? 'bearish' : 'neutral';
            const strength = Math.abs(value - 50) / 50;
            return { value, direction, strength: clamp(strength, 0, 1) };
        }

        case IndicatorType.MACD: {
            const macd = calculateMACD(candles);
            if (macd.histogram.length < 2) return { value: 0, direction: 'neutral', strength: 0 };
            const value = macd.histogram[macd.histogram.length - 1];
            const prevValue = macd.histogram[macd.histogram.length - 2];
            const direction: 'bullish' | 'bearish' | 'neutral' =
                value > 0 && value > prevValue ? 'bullish' :
                    value < 0 && value < prevValue ? 'bearish' : 'neutral';
            const maxHist = Math.max(...macd.histogram.slice(-20).map(Math.abs));
            const strength = maxHist > 0 ? Math.abs(value) / maxHist : 0;
            return { value, direction, strength: clamp(strength, 0, 1) };
        }

        case IndicatorType.STOCH_RSI: {
            const stoch = calculateStochRSI(candles, period);
            if (stoch.k.length < 1) return { value: 50, direction: 'neutral', strength: 0 };
            const value = stoch.k[stoch.k.length - 1];
            const direction: 'bullish' | 'bearish' | 'neutral' =
                value > threshold ? 'bullish' : value < (100 - threshold) ? 'bearish' : 'neutral';
            const strength = Math.abs(value - 50) / 50;
            return { value, direction, strength: clamp(strength, 0, 1) };
        }

        default:
            return { value: 50, direction: 'neutral', strength: 0 };
    }
}

function evaluateMomentumConfluence(
    gene: TimeframeConfluenceGene,
    primaryCandles: OHLCV[],
    higherCandles: OHLCV[],
): ConfluenceResult {
    const indicator = gene.params.momentumIndicator ?? IndicatorType.RSI;
    const period = gene.params.momentumPeriod ?? 14;
    const threshold = gene.params.momentumThreshold ?? 55;

    const primaryMom = calculateMomentum(primaryCandles, indicator, period, threshold);
    const higherMom = calculateMomentum(higherCandles, indicator, period, threshold);

    const agrees = primaryMom.direction === higherMom.direction &&
        primaryMom.direction !== 'neutral';

    let strength = (primaryMom.strength + higherMom.strength) / 2;
    if (agrees) {
        strength = Math.min(1, strength * 1.2);
    } else if (primaryMom.direction !== 'neutral' && higherMom.direction !== 'neutral') {
        // Active disagreement — strong negative signal
        strength *= 0.2;
    }

    return {
        geneId: gene.id,
        type: ConfluenceType.MOMENTUM_CONFLUENCE,
        primaryTimeframe: gene.primaryTimeframe,
        higherTimeframe: gene.higherTimeframe,
        confluent: agrees,
        strength: Math.round(strength * 1000) / 1000,
        direction: higherMom.direction,
        details: {
            primaryMomentum: primaryMom.direction,
            higherMomentum: higherMom.direction,
            primaryValue: Math.round(primaryMom.value * 100) / 100,
            higherValue: Math.round(higherMom.value * 100) / 100,
            agreementScore: agrees ? 1 : 0,
            indicator: indicator as string,
            period,
        },
    };
}

// ─── 3. Volatility Match Evaluator ───────────────────────────

interface VolatilityState {
    atr: number;
    normalized: number; // 0-1 relative to recent history
    regime: 'expanding' | 'contracting' | 'calm' | 'extreme';
}

function calculateVolatilityState(
    candles: OHLCV[],
    lookback: number,
    expansionThreshold: number,
): VolatilityState {
    if (candles.length < lookback + 10) {
        return { atr: 0, normalized: 0.5, regime: 'calm' };
    }

    const atrValues = calculateATR(candles, lookback);
    if (atrValues.length < 2) {
        return { atr: 0, normalized: 0.5, regime: 'calm' };
    }

    const currentATR = atrValues[atrValues.length - 1];
    const recentATRs = atrValues.slice(-20);
    const avgATR = recentATRs.reduce((s, v) => s + v, 0) / recentATRs.length;
    const atrRatio = avgATR > 0 ? currentATR / avgATR : 1;

    // Normalize to 0-1 using percentile rank within recent history
    const sorted = [...recentATRs].sort((a, b) => a - b);
    const rank = sorted.findIndex(v => v >= currentATR);
    const normalized = recentATRs.length > 0 ? (rank >= 0 ? rank / recentATRs.length : 1) : 0.5;

    let regime: VolatilityState['regime'];
    if (atrRatio >= expansionThreshold) {
        regime = 'expanding';
    } else if (atrRatio >= expansionThreshold * 1.5) {
        regime = 'extreme';
    } else if (atrRatio <= 1 / expansionThreshold) {
        regime = 'contracting';
    } else {
        regime = 'calm';
    }

    return { atr: currentATR, normalized, regime };
}

function evaluateVolatilityMatch(
    gene: TimeframeConfluenceGene,
    primaryCandles: OHLCV[],
    higherCandles: OHLCV[],
): ConfluenceResult {
    const lookback = gene.params.volLookback ?? 14;
    const expansionThreshold = gene.params.volExpansionThreshold ?? 1.5;
    const requireLowVolHTF = gene.params.requireLowVolHigherTF ?? false;

    const primaryVol = calculateVolatilityState(primaryCandles, lookback, expansionThreshold);
    const higherVol = calculateVolatilityState(higherCandles, lookback, expansionThreshold);

    // Confluence: favorable when HTF is calm or contracting (stable environment)
    // and primary TF shows opportunity (expanding = breakout potential)
    let matched: boolean;
    if (requireLowVolHTF) {
        matched = (higherVol.regime === 'calm' || higherVol.regime === 'contracting');
    } else {
        // General match: both TFs in similar vol regime, or favorable combination
        matched = primaryVol.regime === higherVol.regime ||
            (primaryVol.regime === 'expanding' && higherVol.regime === 'calm');
    }

    const volRatio = higherVol.atr > 0 ? primaryVol.atr / higherVol.atr : 0;
    const strength = matched ? Math.min(1, 0.5 + Math.abs(volRatio - 1) * 0.3) : 0.2;

    // Volatility doesn't have a direction — use neutral
    return {
        geneId: gene.id,
        type: ConfluenceType.VOLATILITY_MATCH,
        primaryTimeframe: gene.primaryTimeframe,
        higherTimeframe: gene.higherTimeframe,
        confluent: matched,
        strength: Math.round(strength * 1000) / 1000,
        direction: 'neutral',
        details: {
            primaryRegime: primaryVol.regime,
            higherRegime: higherVol.regime,
            primaryATR: Math.round(primaryVol.atr * 10000) / 10000,
            higherATR: Math.round(higherVol.atr * 10000) / 10000,
            volRatio: Math.round(volRatio * 1000) / 1000,
            matched,
            requireLowVolHTF,
        },
    };
}

// ─── 4. Structure Confluence Evaluator ───────────────────────

interface SRLevel {
    price: number;
    type: 'support' | 'resistance';
    touches: number; // How many times price tested this level
}

/**
 * Detect Support/Resistance levels from candle highs and lows.
 * Uses a clustering algorithm: group nearby highs/lows into zones.
 */
function detectSRLevels(candles: OHLCV[], lookback: number): SRLevel[] {
    if (candles.length < lookback) return [];

    const recentCandles = candles.slice(-lookback);
    const levels: SRLevel[] = [];

    // Find local highs and lows (swing points)
    const swingHighs: number[] = [];
    const swingLows: number[] = [];

    for (let i = 2; i < recentCandles.length - 2; i++) {
        const c = recentCandles[i];
        const prev1 = recentCandles[i - 1];
        const prev2 = recentCandles[i - 2];
        const next1 = recentCandles[i + 1];
        const next2 = recentCandles[i + 2];

        // Swing high: higher high than 2 neighbors on each side
        if (c.high > prev1.high && c.high > prev2.high &&
            c.high > next1.high && c.high > next2.high) {
            swingHighs.push(c.high);
        }

        // Swing low: lower low than 2 neighbors on each side
        if (c.low < prev1.low && c.low < prev2.low &&
            c.low < next1.low && c.low < next2.low) {
            swingLows.push(c.low);
        }
    }

    // Cluster swing highs into resistance zones (within 0.5% of each other)
    const clusterThreshold = 0.005;
    const clusterLevels = (prices: number[], type: 'support' | 'resistance'): SRLevel[] => {
        if (prices.length === 0) return [];
        const sorted = [...prices].sort((a, b) => a - b);
        const clusters: { sum: number; count: number }[] = [];

        let current = { sum: sorted[0], count: 1 };
        for (let i = 1; i < sorted.length; i++) {
            const avg = current.sum / current.count;
            if (Math.abs(sorted[i] - avg) / avg <= clusterThreshold) {
                current.sum += sorted[i];
                current.count++;
            } else {
                clusters.push(current);
                current = { sum: sorted[i], count: 1 };
            }
        }
        clusters.push(current);

        return clusters
            .filter(c => c.count >= 2) // Require at least 2 touches
            .map(c => ({
                price: Math.round((c.sum / c.count) * 100) / 100,
                type,
                touches: c.count,
            }));
    };

    levels.push(...clusterLevels(swingHighs, 'resistance'));
    levels.push(...clusterLevels(swingLows, 'support'));

    return levels;
}

function evaluateStructureConfluence(
    gene: TimeframeConfluenceGene,
    primaryCandles: OHLCV[],
    higherCandles: OHLCV[],
): ConfluenceResult {
    const structureLookback = gene.params.structureLookback ?? 50;
    const proximityPercent = gene.params.proximityPercent ?? 0.5;

    // Detect S/R on the HIGHER timeframe
    const htfLevels = detectSRLevels(higherCandles, structureLookback);

    if (htfLevels.length === 0 || primaryCandles.length === 0) {
        return {
            geneId: gene.id,
            type: ConfluenceType.STRUCTURE_CONFLUENCE,
            primaryTimeframe: gene.primaryTimeframe,
            higherTimeframe: gene.higherTimeframe,
            confluent: false,
            strength: 0,
            direction: 'neutral',
            details: {
                levelsFound: 0,
                nearestDistance: -1,
                atLevel: false,
            },
        };
    }

    // Check if current price (from primary TF) is near any HTF S/R level
    const currentPrice = primaryCandles[primaryCandles.length - 1].close;
    let nearestLevel: SRLevel | null = null;
    let nearestDistancePercent = Infinity;

    for (const level of htfLevels) {
        const distance = Math.abs(currentPrice - level.price) / level.price * 100;
        if (distance < nearestDistancePercent) {
            nearestDistancePercent = distance;
            nearestLevel = level;
        }
    }

    const atLevel = nearestDistancePercent <= proximityPercent;

    // Strength based on proximity + touches (more touches = stronger level)
    let strength = 0;
    if (atLevel && nearestLevel) {
        const proximityScore = 1 - (nearestDistancePercent / proximityPercent);
        const touchScore = Math.min(1, nearestLevel.touches / 5);
        strength = clamp(proximityScore * 0.6 + touchScore * 0.4, 0, 1);
    }

    // Direction: at support = bullish (bounce expected), at resistance = bearish
    const direction: 'bullish' | 'bearish' | 'neutral' = nearestLevel
        ? (atLevel
            ? (nearestLevel.type === 'support' ? 'bullish' : 'bearish')
            : 'neutral')
        : 'neutral';

    return {
        geneId: gene.id,
        type: ConfluenceType.STRUCTURE_CONFLUENCE,
        primaryTimeframe: gene.primaryTimeframe,
        higherTimeframe: gene.higherTimeframe,
        confluent: atLevel,
        strength: Math.round(strength * 1000) / 1000,
        direction,
        details: {
            levelsFound: htfLevels.length,
            nearestLevel: nearestLevel?.price ?? 0,
            nearestType: nearestLevel?.type ?? 'none',
            nearestDistancePercent: Math.round(nearestDistancePercent * 1000) / 1000,
            nearestTouches: nearestLevel?.touches ?? 0,
            atLevel,
            proximityThreshold: proximityPercent,
        },
    };
}

// ─── Master Confluence Evaluator ─────────────────────────────

/**
 * Evaluate a single confluence gene against primary and higher TF candle data.
 * Returns null if higher TF candles are unavailable or insufficient.
 */
export function evaluateConfluenceGene(
    gene: TimeframeConfluenceGene,
    primaryCandles: OHLCV[],
    higherTimeframeCandles: Map<Timeframe, OHLCV[]>,
): ConfluenceResult | null {
    const htfCandles = higherTimeframeCandles.get(gene.higherTimeframe);

    // Graceful degradation: if HTF candles are unavailable, skip silently
    if (!htfCandles || htfCandles.length < 30) {
        return null;
    }

    // Guard: primary candles must also be sufficient
    if (primaryCandles.length < 30) {
        return null;
    }

    switch (gene.type) {
        case ConfluenceType.TREND_ALIGNMENT:
            return evaluateTrendAlignment(gene, primaryCandles, htfCandles);

        case ConfluenceType.MOMENTUM_CONFLUENCE:
            return evaluateMomentumConfluence(gene, primaryCandles, htfCandles);

        case ConfluenceType.VOLATILITY_MATCH:
            return evaluateVolatilityMatch(gene, primaryCandles, htfCandles);

        case ConfluenceType.STRUCTURE_CONFLUENCE:
            return evaluateStructureConfluence(gene, primaryCandles, htfCandles);

        default:
            return null;
    }
}

/**
 * Evaluate all confluence genes for a strategy.
 * Called from calculateAdvancedSignals() in signal-engine.ts.
 *
 * Phase 26: Optional TCDW integration — when tcdwConfig is provided,
 * each result gets temporal decay applied based on HTF candle freshness.
 */
export function calculateConfluenceSignals(
    genes: TimeframeConfluenceGene[],
    primaryCandles: OHLCV[],
    higherTimeframeCandles: Map<Timeframe, OHLCV[]>,
    tcdwConfig?: TemporalDecayConfig,
    currentTimestamp?: number,
): Map<string, ConfluenceResult> {
    const results = new Map<string, ConfluenceResult>();
    const evalTimestamp = currentTimestamp ?? Date.now();

    for (const gene of genes) {
        const rawResult = evaluateConfluenceGene(gene, primaryCandles, higherTimeframeCandles);
        if (rawResult) {
            let finalResult: ConfluenceResult = rawResult;

            // Phase 26: Apply TCDW temporal decay if configured
            if (tcdwConfig && tcdwConfig.enabled) {
                const htfCandles = higherTimeframeCandles.get(gene.higherTimeframe);
                if (htfCandles && htfCandles.length > 0) {
                    const lastHTFCandle = htfCandles[htfCandles.length - 1];
                    finalResult = applyTemporalDecay(
                        rawResult,
                        evalTimestamp,
                        lastHTFCandle.timestamp,
                        tcdwConfig,
                    );
                }
            }
            results.set(gene.id, finalResult);
        }
    }

    return results;
}

// ─── Gene Generator ──────────────────────────────────────────

/**
 * Generate a random confluence gene with a valid TF pair.
 * The primary TF is used by the island's slot; higher TF is strictly above it.
 *
 * @param primaryTimeframe - If provided, use this as the primary TF.
 *                           Otherwise, pick a random TF that has valid higher TFs.
 */
export function generateRandomConfluenceGene(primaryTimeframe?: Timeframe): TimeframeConfluenceGene {
    // Pick a primary TF that has at least one valid higher TF
    const validPrimaries = Object.entries(TF_HIERARCHY)
        .filter(([, higherTFs]) => higherTFs.length > 0)
        .map(([tf]) => tf as Timeframe);

    const primary = primaryTimeframe && TF_HIERARCHY[primaryTimeframe]?.length > 0
        ? primaryTimeframe
        : randomPick(validPrimaries);

    const higherTFs = TF_HIERARCHY[primary];
    const higher = randomPick(higherTFs);

    const type = randomPick(ALL_CONFLUENCE_TYPES);

    const gene: TimeframeConfluenceGene = {
        id: uuidv4(),
        type,
        primaryTimeframe: primary,
        higherTimeframe: higher,
        params: {},
    };

    // Type-specific parameters
    switch (type) {
        case ConfluenceType.TREND_ALIGNMENT:
            gene.params.trendIndicator = randomPick(TREND_INDICATORS);
            gene.params.trendPeriod = randomInt(10, 50);
            gene.params.alignmentRequired = Math.random() > 0.2; // 80% require alignment
            break;

        case ConfluenceType.MOMENTUM_CONFLUENCE:
            gene.params.momentumIndicator = randomPick(MOMENTUM_INDICATORS);
            gene.params.momentumPeriod = randomInt(7, 21);
            gene.params.momentumThreshold = Math.round(randomFloat(45, 65) * 100) / 100;
            break;

        case ConfluenceType.VOLATILITY_MATCH:
            gene.params.volLookback = randomInt(7, 21);
            gene.params.volExpansionThreshold = Math.round(randomFloat(1.2, 3.0) * 100) / 100;
            gene.params.requireLowVolHigherTF = Math.random() > 0.5;
            break;

        case ConfluenceType.STRUCTURE_CONFLUENCE:
            gene.params.structureLookback = randomInt(30, 100);
            gene.params.proximityPercent = Math.round(randomFloat(0.1, 1.0) * 100) / 100;
            break;
    }

    return gene;
}

// ─── Crossover ───────────────────────────────────────────────

/**
 * Crossover two confluence genes. Blends numeric parameters,
 * randomly picks categorical parameters from either parent.
 * Ensures the resulting TF pair is valid.
 */
export function crossoverConfluenceGene(
    geneA: TimeframeConfluenceGene,
    geneB: TimeframeConfluenceGene,
): TimeframeConfluenceGene {
    const type = Math.random() > 0.5 ? geneA.type : geneB.type;

    // Pick TF pair from one parent, ensuring validity
    let primary: Timeframe;
    let higher: Timeframe;
    if (Math.random() > 0.5 && TF_HIERARCHY[geneA.primaryTimeframe]?.includes(geneA.higherTimeframe)) {
        primary = geneA.primaryTimeframe;
        higher = geneA.higherTimeframe;
    } else if (TF_HIERARCHY[geneB.primaryTimeframe]?.includes(geneB.higherTimeframe)) {
        primary = geneB.primaryTimeframe;
        higher = geneB.higherTimeframe;
    } else {
        // Fallback: generate valid pair
        const validPrimaries = Object.entries(TF_HIERARCHY)
            .filter(([, h]) => h.length > 0)
            .map(([tf]) => tf as Timeframe);
        primary = randomPick(validPrimaries);
        higher = randomPick(TF_HIERARCHY[primary]);
    }

    const blendNum = (a: number | undefined, b: number | undefined, fallback: number): number => {
        const va = a ?? fallback;
        const vb = b ?? fallback;
        return Math.round(((va + vb) / 2) * 100) / 100;
    };

    const child: TimeframeConfluenceGene = {
        id: uuidv4(),
        type,
        primaryTimeframe: primary,
        higherTimeframe: higher,
        params: {
            // Trend params
            trendIndicator: Math.random() > 0.5 ? geneA.params.trendIndicator : geneB.params.trendIndicator,
            trendPeriod: Math.round(blendNum(geneA.params.trendPeriod, geneB.params.trendPeriod, 20)),
            alignmentRequired: Math.random() > 0.5
                ? geneA.params.alignmentRequired
                : geneB.params.alignmentRequired,

            // Momentum params
            momentumIndicator: Math.random() > 0.5 ? geneA.params.momentumIndicator : geneB.params.momentumIndicator,
            momentumPeriod: Math.round(blendNum(geneA.params.momentumPeriod, geneB.params.momentumPeriod, 14)),
            momentumThreshold: blendNum(geneA.params.momentumThreshold, geneB.params.momentumThreshold, 55),

            // Volatility params
            volLookback: Math.round(blendNum(geneA.params.volLookback, geneB.params.volLookback, 14)),
            volExpansionThreshold: blendNum(geneA.params.volExpansionThreshold, geneB.params.volExpansionThreshold, 1.5),
            requireLowVolHigherTF: Math.random() > 0.5
                ? geneA.params.requireLowVolHigherTF
                : geneB.params.requireLowVolHigherTF,

            // Structure params
            structureLookback: Math.round(blendNum(geneA.params.structureLookback, geneB.params.structureLookback, 50)),
            proximityPercent: blendNum(geneA.params.proximityPercent, geneB.params.proximityPercent, 0.5),
        },
    };

    return child;
}

// ─── Mutation ────────────────────────────────────────────────

/**
 * Mutate a confluence gene by perturbing numeric parameters
 * and occasionally swapping categorical ones.
 */
export function mutateConfluenceGene(
    gene: TimeframeConfluenceGene,
    rate: number = 0.3,
): TimeframeConfluenceGene {
    const mutated: TimeframeConfluenceGene = JSON.parse(JSON.stringify(gene));
    mutated.id = uuidv4();

    // Mutate TF pair (rare — 10% of mutation rate)
    if (Math.random() < rate * 0.1) {
        const validPrimaries = Object.entries(TF_HIERARCHY)
            .filter(([, h]) => h.length > 0)
            .map(([tf]) => tf as Timeframe);
        mutated.primaryTimeframe = randomPick(validPrimaries);
        mutated.higherTimeframe = randomPick(TF_HIERARCHY[mutated.primaryTimeframe]);
    }

    // Mutate confluence type (rare — 15% of rate)
    if (Math.random() < rate * 0.15) {
        mutated.type = randomPick(ALL_CONFLUENCE_TYPES);
    }

    // Type-specific mutations
    switch (mutated.type) {
        case ConfluenceType.TREND_ALIGNMENT:
            if (Math.random() < rate && mutated.params.trendPeriod !== undefined) {
                mutated.params.trendPeriod = clamp(
                    mutated.params.trendPeriod + randomInt(-5, 5), 10, 50,
                );
            }
            if (Math.random() < rate * 0.2) {
                mutated.params.trendIndicator = randomPick(TREND_INDICATORS);
            }
            if (Math.random() < rate * 0.3) {
                mutated.params.alignmentRequired = !mutated.params.alignmentRequired;
            }
            break;

        case ConfluenceType.MOMENTUM_CONFLUENCE:
            if (Math.random() < rate && mutated.params.momentumPeriod !== undefined) {
                mutated.params.momentumPeriod = clamp(
                    mutated.params.momentumPeriod + randomInt(-3, 3), 7, 21,
                );
            }
            if (Math.random() < rate && mutated.params.momentumThreshold !== undefined) {
                mutated.params.momentumThreshold = clamp(
                    Math.round((mutated.params.momentumThreshold + randomFloat(-5, 5)) * 100) / 100,
                    45, 65,
                );
            }
            if (Math.random() < rate * 0.2) {
                mutated.params.momentumIndicator = randomPick(MOMENTUM_INDICATORS);
            }
            break;

        case ConfluenceType.VOLATILITY_MATCH:
            if (Math.random() < rate && mutated.params.volLookback !== undefined) {
                mutated.params.volLookback = clamp(
                    mutated.params.volLookback + randomInt(-3, 3), 7, 21,
                );
            }
            if (Math.random() < rate && mutated.params.volExpansionThreshold !== undefined) {
                mutated.params.volExpansionThreshold = clamp(
                    Math.round((mutated.params.volExpansionThreshold + randomFloat(-0.3, 0.3)) * 100) / 100,
                    1.2, 3.0,
                );
            }
            if (Math.random() < rate * 0.3) {
                mutated.params.requireLowVolHigherTF = !mutated.params.requireLowVolHigherTF;
            }
            break;

        case ConfluenceType.STRUCTURE_CONFLUENCE:
            if (Math.random() < rate && mutated.params.structureLookback !== undefined) {
                mutated.params.structureLookback = clamp(
                    mutated.params.structureLookback + randomInt(-10, 10), 30, 100,
                );
            }
            if (Math.random() < rate && mutated.params.proximityPercent !== undefined) {
                mutated.params.proximityPercent = clamp(
                    Math.round((mutated.params.proximityPercent + randomFloat(-0.2, 0.2)) * 100) / 100,
                    0.1, 1.0,
                );
            }
            break;
    }

    return mutated;
}

// ─── TF Hierarchy Exports ────────────────────────────────────

/**
 * Check if a timeframe pair is valid (primary < higher).
 */
export function isValidTFPair(primary: Timeframe, higher: Timeframe): boolean {
    return TF_HIERARCHY[primary]?.includes(higher) ?? false;
}

/**
 * Get all valid higher timeframes for a given primary TF.
 */
export function getHigherTimeframes(primary: Timeframe): Timeframe[] {
    return TF_HIERARCHY[primary] ?? [];
}

/**
 * Get all unique higher TFs needed by a strategy's confluence genes.
 * Used by the HTF candle routing system to know which TFs to fetch.
 */
export function getRequiredHigherTimeframes(
    genes: TimeframeConfluenceGene[] | undefined,
): Timeframe[] {
    if (!genes || genes.length === 0) return [];
    const tfs = new Set<Timeframe>();
    for (const gene of genes) {
        tfs.add(gene.higherTimeframe);
    }
    return Array.from(tfs);
}
