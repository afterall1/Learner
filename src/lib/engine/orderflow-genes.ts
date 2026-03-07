// ============================================================
// Learner: Order Flow Intelligence — Gene Family (Phase 9.5)
// ============================================================
// Extends the GA's gene vocabulary to include order flow analysis.
// This gives strategies access to WHY prices move, not just
// THAT they moved. Processes:
//   - Volume Delta (CVD) — cumulative buy vs sell imbalance
//   - Large Trade Detection — institutional footprint
//   - Liquidation Cascades — forced position closures
//   - Funding Rate Dynamics — perpetual futures cost pressure
//   - Volume Absorption — whale activity at key levels
//
// NOTE: Live data integration requires Binance WebSocket streams
// (aggTrade, forceOrder, markPrice). This module provides:
//   1. Gene operators (create, crossover, mutate) — ready now
//   2. Signal computation from aggregated data — ready now
//   3. Synthetic data mode for backtesting — ready now
//   4. Live stream processing — deferred to Binance API phase
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type OrderFlowGene,
    type AggTrade,
    type ForceOrder,
    type VolumeDeltaResult,
    type LargeTradeSignal,
    type CascadeSignal,
    type FundingSignal,
    type AbsorptionSignal,
    type OHLCV,
    TradeDirection,
} from '@/types';

// ─── Gene Operators (GA Integration) ─────────────────────────

/**
 * Generate a random Order Flow Intelligence gene.
 * All parameters are within their valid ranges.
 */
export function generateRandomOFIGene(): OrderFlowGene {
    return {
        id: uuidv4(),
        volumeDeltaWindow: 5 + Math.floor(Math.random() * 96),           // 5-100
        deltaThreshold: 0.2 + Math.random() * 0.6,                       // 0.2-0.8
        largeTradeSizeMultiplier: 3 + Math.random() * 7,                  // 3-10
        liquidationSensitivity: 0.1 + Math.random() * 0.9,               // 0.1-1.0
        fundingRateThreshold: 0.001 + Math.random() * 0.009,             // 0.001-0.01
        absorptionDetectionMode: randomAbsorptionMode(),
        params: {
            cvdMomentumPeriod: 5 + Math.floor(Math.random() * 26),       // 5-30
            largeTradeCooldown: 1 + Math.floor(Math.random() * 10),       // 1-10
            cascadeWindowMs: 1000 + Math.floor(Math.random() * 29000),    // 1000-30000
            absorptionVolumeThreshold: 2.0 + Math.random() * 6.0,        // 2.0-8.0
        },
    };
}

/**
 * Crossover two OFI genes to produce a child.
 * Uses uniform crossover at the parameter level.
 */
export function crossoverOFIGene(
    parentA: OrderFlowGene,
    parentB: OrderFlowGene,
): OrderFlowGene {
    return {
        id: uuidv4(),
        volumeDeltaWindow: Math.random() < 0.5 ? parentA.volumeDeltaWindow : parentB.volumeDeltaWindow,
        deltaThreshold: Math.random() < 0.5 ? parentA.deltaThreshold : parentB.deltaThreshold,
        largeTradeSizeMultiplier: Math.random() < 0.5 ? parentA.largeTradeSizeMultiplier : parentB.largeTradeSizeMultiplier,
        liquidationSensitivity: Math.random() < 0.5 ? parentA.liquidationSensitivity : parentB.liquidationSensitivity,
        fundingRateThreshold: Math.random() < 0.5 ? parentA.fundingRateThreshold : parentB.fundingRateThreshold,
        absorptionDetectionMode: Math.random() < 0.5 ? parentA.absorptionDetectionMode : parentB.absorptionDetectionMode,
        params: {
            cvdMomentumPeriod: Math.random() < 0.5
                ? parentA.params.cvdMomentumPeriod
                : parentB.params.cvdMomentumPeriod,
            largeTradeCooldown: Math.random() < 0.5
                ? parentA.params.largeTradeCooldown
                : parentB.params.largeTradeCooldown,
            cascadeWindowMs: Math.random() < 0.5
                ? parentA.params.cascadeWindowMs
                : parentB.params.cascadeWindowMs,
            absorptionVolumeThreshold: Math.random() < 0.5
                ? parentA.params.absorptionVolumeThreshold
                : parentB.params.absorptionVolumeThreshold,
        },
    };
}

/**
 * Mutate an OFI gene with small perturbations.
 * Each parameter has an independent mutation chance.
 */
export function mutateOFIGene(
    gene: OrderFlowGene,
    mutationRate: number = 0.3,
): OrderFlowGene {
    const mutated = { ...gene, id: uuidv4(), params: { ...gene.params } };

    if (Math.random() < mutationRate) {
        mutated.volumeDeltaWindow = clamp(
            mutated.volumeDeltaWindow + Math.floor((Math.random() - 0.5) * 20),
            5, 100,
        );
    }

    if (Math.random() < mutationRate) {
        mutated.deltaThreshold = clamp(
            mutated.deltaThreshold + (Math.random() - 0.5) * 0.2,
            0.2, 0.8,
        );
    }

    if (Math.random() < mutationRate) {
        mutated.largeTradeSizeMultiplier = clamp(
            mutated.largeTradeSizeMultiplier + (Math.random() - 0.5) * 2,
            3, 10,
        );
    }

    if (Math.random() < mutationRate) {
        mutated.liquidationSensitivity = clamp(
            mutated.liquidationSensitivity + (Math.random() - 0.5) * 0.3,
            0.1, 1.0,
        );
    }

    if (Math.random() < mutationRate) {
        mutated.fundingRateThreshold = clamp(
            mutated.fundingRateThreshold + (Math.random() - 0.5) * 0.004,
            0.001, 0.01,
        );
    }

    if (Math.random() < 0.15) {
        mutated.absorptionDetectionMode = randomAbsorptionMode();
    }

    if (Math.random() < mutationRate) {
        mutated.params.cvdMomentumPeriod = clamp(
            (mutated.params.cvdMomentumPeriod ?? 15) + Math.floor((Math.random() - 0.5) * 10),
            5, 30,
        );
    }

    if (Math.random() < mutationRate) {
        mutated.params.absorptionVolumeThreshold = clamp(
            (mutated.params.absorptionVolumeThreshold ?? 4) + (Math.random() - 0.5) * 2,
            2.0, 8.0,
        );
    }

    return mutated;
}

// ─── Order Flow Analysis Functions ───────────────────────────

/**
 * Compute Volume Delta from aggregated trades.
 * Positive delta = more buy aggression.
 * Negative delta = more sell aggression.
 */
export function computeVolumeDelta(
    trades: AggTrade[],
    windowSize: number = 50,
): VolumeDeltaResult {
    const windowTrades = trades.slice(-windowSize);

    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of windowTrades) {
        if (trade.isBuyerMaker) {
            // isBuyerMaker = true means the taker was a seller (sell aggressor)
            sellVolume += trade.quantity * trade.price;
        } else {
            buyVolume += trade.quantity * trade.price;
        }
    }

    const delta = buyVolume - sellVolume;
    const totalVolume = buyVolume + sellVolume;
    const deltaPercent = totalVolume > 0 ? delta / totalVolume : 0;

    // Calculate trend strength: consistency of delta direction over sub-windows
    const subWindowSize = Math.max(1, Math.floor(windowSize / 5));
    let consistentBars = 0;
    const overallDirection = delta >= 0 ? 1 : -1;

    for (let i = 0; i < 5; i++) {
        const start = i * subWindowSize;
        const end = Math.min(start + subWindowSize, windowTrades.length);
        const subTrades = windowTrades.slice(start, end);

        let subBuy = 0;
        let subSell = 0;
        for (const t of subTrades) {
            if (t.isBuyerMaker) subSell += t.quantity * t.price;
            else subBuy += t.quantity * t.price;
        }

        const subDirection = (subBuy - subSell) >= 0 ? 1 : -1;
        if (subDirection === overallDirection) consistentBars++;
    }

    const trendStrength = consistentBars / 5;

    return {
        delta,
        cumulativeDelta: delta, // In live mode, this would be a running total
        buyVolume,
        sellVolume,
        deltaPercent,
        trendStrength,
    };
}

/**
 * Detect large trades (institutional footprints).
 * A trade is "large" if its volume exceeds the average
 * by a configurable multiplier.
 */
export function detectLargeTrades(
    trades: AggTrade[],
    sizeMultiplier: number = 5,
): LargeTradeSignal[] {
    if (trades.length < 10) return [];

    // Calculate average trade size
    const avgSize = trades.reduce((s, t) => s + t.quantity * t.price, 0) / trades.length;
    const threshold = avgSize * sizeMultiplier;

    const largeTrades: LargeTradeSignal[] = [];
    for (const trade of trades) {
        const value = trade.quantity * trade.price;
        if (value >= threshold) {
            largeTrades.push({
                price: trade.price,
                quantity: trade.quantity,
                totalValue: value,
                isBuy: !trade.isBuyerMaker,
                sizeMultiple: value / avgSize,
                timestamp: trade.timestamp,
            });
        }
    }

    return largeTrades;
}

/**
 * Detect liquidation cascades from Binance forceOrder stream.
 * A cascade = multiple liquidations in the same direction
 * within a short time window.
 */
export function detectLiquidationCascade(
    liquidations: ForceOrder[],
    windowMs: number = 10000,
    sensitivity: number = 0.5,
): CascadeSignal {
    if (liquidations.length < 2) {
        return {
            detected: false,
            direction: TradeDirection.LONG,
            totalLiquidatedQuantity: 0,
            cascadeCount: 0,
            estimatedPriceImpact: 0,
            severity: 0,
        };
    }

    // Group liquidations within the time window
    const now = liquidations[liquidations.length - 1]?.timestamp ?? Date.now();
    const recentLiqs = liquidations.filter(l => now - l.timestamp <= windowMs);

    if (recentLiqs.length < 2) {
        return {
            detected: false,
            direction: TradeDirection.LONG,
            totalLiquidatedQuantity: 0,
            cascadeCount: 0,
            estimatedPriceImpact: 0,
            severity: 0,
        };
    }

    // Count by direction
    const buySide = recentLiqs.filter(l => l.side === 'BUY');
    const sellSide = recentLiqs.filter(l => l.side === 'SELL');

    const dominantSide = buySide.length >= sellSide.length ? buySide : sellSide;
    const direction = dominantSide === buySide ? TradeDirection.SHORT : TradeDirection.LONG;

    const totalQuantity = dominantSide.reduce((s, l) => s + l.quantity, 0);
    const cascadeCount = dominantSide.length;

    // Severity based on count and sensitivity
    const minCascadeForDetection = Math.max(2, Math.ceil(5 * (1 - sensitivity)));
    const detected = cascadeCount >= minCascadeForDetection;

    const severity = Math.min(1, cascadeCount / 10);

    // Rough price impact estimate (assumes linear impact)
    const avgPrice = dominantSide.reduce((s, l) => s + l.averagePrice, 0) / cascadeCount;
    const estimatedPriceImpact = (totalQuantity * avgPrice) / 1_000_000; // Normalized

    return {
        detected,
        direction,
        totalLiquidatedQuantity: totalQuantity,
        cascadeCount,
        estimatedPriceImpact,
        severity,
    };
}

/**
 * Compute funding rate pressure signal.
 * High positive funding = longs pay shorts (long pressure)
 * High negative funding = shorts pay longs (short pressure)
 */
export function computeFundingPressure(
    fundingRate: number,
    nextFundingTimeMs: number,
    threshold: number = 0.005,
): FundingSignal {
    const annualizedRate = fundingRate * 3 * 365; // 3 payments per day
    const extremity = Math.min(1, Math.abs(fundingRate) / threshold);

    let pressure: FundingSignal['pressure'];
    let expectedDirection: TradeDirection;

    if (fundingRate > threshold * 0.5) {
        pressure = 'long_pays';
        expectedDirection = TradeDirection.SHORT; // High funding pushes price down
    } else if (fundingRate < -threshold * 0.5) {
        pressure = 'short_pays';
        expectedDirection = TradeDirection.LONG; // Negative funding pushes price up
    } else {
        pressure = 'neutral';
        expectedDirection = TradeDirection.LONG;
    }

    return {
        currentRate: fundingRate,
        annualizedRate,
        pressure,
        extremity,
        nextFundingIn: nextFundingTimeMs - Date.now(),
        expectedPressureDirection: expectedDirection,
    };
}

/**
 * Detect volume absorption at price levels.
 * Absorption = high volume candle with small net price change.
 * This often indicates institutional accumulation/distribution.
 */
export function detectAbsorption(
    candles: OHLCV[],
    lookback: number = 20,
    volumeThreshold: number = 3.0,
): AbsorptionSignal {
    if (candles.length < lookback + 1) {
        return { detected: false, level: 0, absorptionType: 'bid', strength: 0, volumeAbsorbed: 0 };
    }

    const recent = candles.slice(-lookback);
    const currentCandle = candles[candles.length - 1];

    // Calculate average volume and body size
    const avgVolume = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
    const avgBody = recent.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / recent.length;

    // Current candle characteristics
    const currentBody = Math.abs(currentCandle.close - currentCandle.open);
    const currentVolume = currentCandle.volume;

    // Absorption: high volume but small body (relative to average)
    const volumeRatio = currentVolume / Math.max(avgVolume, 0.001);
    const bodyRatio = avgBody > 0 ? currentBody / avgBody : 1;

    // Absorption detected when: high volume AND small body
    const detected = volumeRatio >= volumeThreshold && bodyRatio < 0.5;

    // Determine absorption type from candle direction
    const absorptionType: 'bid' | 'ask' = currentCandle.close >= currentCandle.open ? 'bid' : 'ask';

    // Strength proportional to volume:body disparity
    const strength = detected ? Math.min(1, (volumeRatio / volumeThreshold) * (1 - bodyRatio)) : 0;

    return {
        detected,
        level: (currentCandle.high + currentCandle.low) / 2,
        absorptionType,
        strength,
        volumeAbsorbed: currentVolume,
    };
}

/**
 * Synthesize aggregated trades from OHLCV candles for backtesting.
 * Creates realistic trade distribution using candle properties.
 *
 * This allows Order Flow genes to be backtested against historical
 * OHLCV data before live aggTrade streams are available.
 */
export function synthesizeAggTradesFromCandles(
    candles: OHLCV[],
    tradesPerCandle: number = 20,
): AggTrade[] {
    const allTrades: AggTrade[] = [];
    let tradeIdCounter = 1;

    for (const candle of candles) {
        const priceRange = candle.high - candle.low;
        const isBullish = candle.close >= candle.open;
        const volumePerTrade = candle.volume / tradesPerCandle;

        for (let i = 0; i < tradesPerCandle; i++) {
            // Distribute trade prices across the candle range
            const t = i / tradesPerCandle;
            const basePrice = candle.low + priceRange * t;
            const noise = (Math.random() - 0.5) * priceRange * 0.1;
            const price = Math.max(candle.low, Math.min(candle.high, basePrice + noise));

            // Bias buyer/seller aggression based on candle direction
            const buyProbability = isBullish ? 0.55 + (t * 0.1) : 0.45 - (t * 0.1);
            const isBuyerMaker = Math.random() > buyProbability;

            // Volume varies: larger trades towards the end of bullish candles
            const volumeMultiplier = 0.5 + Math.random() * 1.5;

            allTrades.push({
                tradeId: tradeIdCounter++,
                price,
                quantity: volumePerTrade * volumeMultiplier,
                timestamp: candle.timestamp + (t * 3_600_000), // Distribute over 1h
                isBuyerMaker,
            });
        }
    }

    return allTrades;
}

// ─── Composite OFI Signal ────────────────────────────────────

/**
 * Compute a composite Order Flow signal from all sub-signals.
 * Returns a bias (-1 to +1) and confidence (0-1) for integration
 * with the main signal engine.
 *
 * Positive bias = bullish order flow
 * Negative bias = bearish order flow
 */
export function computeOFICompositeSignal(
    gene: OrderFlowGene,
    delta: VolumeDeltaResult,
    largeTrades: LargeTradeSignal[],
    cascade: CascadeSignal,
    funding: FundingSignal | null,
    absorption: AbsorptionSignal,
): { bias: number; confidence: number } {
    let biasSum = 0;
    let weightSum = 0;

    // 1. Volume Delta signal (weight: 0.35)
    if (Math.abs(delta.deltaPercent) >= gene.deltaThreshold) {
        biasSum += delta.deltaPercent * 0.35;
        weightSum += 0.35 * delta.trendStrength;
    }

    // 2. Large Trade signal (weight: 0.25)
    if (largeTrades.length > 0) {
        const recentLarge = largeTrades[largeTrades.length - 1];
        const direction = recentLarge.isBuy ? 1 : -1;
        const strength = Math.min(1, recentLarge.sizeMultiple / gene.largeTradeSizeMultiplier);
        biasSum += direction * strength * 0.25;
        weightSum += 0.25;
    }

    // 3. Liquidation Cascade signal (weight: 0.20)
    if (cascade.detected) {
        // Cascade direction = direction of forced closing
        // If shorts are liquidated (forced BUY), price goes up → bullish
        const direction = cascade.direction === TradeDirection.LONG ? 1 : -1;
        biasSum += direction * cascade.severity * 0.20;
        weightSum += 0.20 * cascade.severity;
    }

    // 4. Funding Rate signal (weight: 0.10)
    if (funding && funding.extremity >= gene.fundingRateThreshold) {
        const direction = funding.expectedPressureDirection === TradeDirection.LONG ? 1 : -1;
        biasSum += direction * funding.extremity * 0.10;
        weightSum += 0.10;
    }

    // 5. Absorption signal (weight: 0.10)
    if (absorption.detected) {
        const direction = absorption.absorptionType === 'bid' ? 1 : -1;
        biasSum += direction * absorption.strength * 0.10;
        weightSum += 0.10 * absorption.strength;
    }

    const bias = weightSum > 0 ? clamp(biasSum / weightSum, -1, 1) : 0;
    const confidence = Math.min(1, weightSum);

    return { bias, confidence };
}

// ─── Utilities ───────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function randomAbsorptionMode(): OrderFlowGene['absorptionDetectionMode'] {
    const modes: OrderFlowGene['absorptionDetectionMode'][] = [
        'volume_profile', 'delta_divergence', 'large_trade_cluster',
    ];
    return modes[Math.floor(Math.random() * modes.length)];
}
