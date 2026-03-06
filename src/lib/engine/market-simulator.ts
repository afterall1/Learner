// ============================================================
// Learner: Market Simulator — Realistic Execution Modeling
// ============================================================
// Simulates real-world market execution conditions including
// slippage, commissions, intra-candle SL/TP detection, and
// adaptive market impact modeling.
//
// Used by the Backtesting Engine to produce realistic trade results
// that accurately reflect what would happen in live Binance Futures.
// ============================================================

import { OHLCV, TradeDirection } from '@/types';

// ─── Configuration ───────────────────────────────────────────

export interface ExecutionConfig {
    commissionRate: number;         // Per-side fee as decimal (0.0004 = 0.04% = Binance taker)
    slippageBps: number;            // Base slippage in basis points (1bp = 0.01%)
    useAdaptiveSlippage: boolean;   // Scale slippage with volatility
    marketImpactEnabled: boolean;   // Model large position price impact
    avgDailyVolume: number;         // Average daily volume for impact calc (USDT)
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
    commissionRate: 0.0004,         // 0.04% taker fee (Binance Futures default)
    slippageBps: 2,                 // 2 basis points base slippage
    useAdaptiveSlippage: true,
    marketImpactEnabled: false,     // Disabled by default (small positions)
    avgDailyVolume: 50_000_000,     // $50M default daily volume
};

// ─── Execution Result ────────────────────────────────────────

export interface ExecutionResult {
    fillPrice: number;              // Final execution price after slippage
    slippageCost: number;           // Slippage cost in USDT
    commissionCost: number;         // Commission cost in USDT
    totalCost: number;              // slippage + commission
    marketImpact: number;           // Market impact cost (if enabled)
}

// ─── Stop/Take-Profit Hit Result ─────────────────────────────

export interface SLTPCheckResult {
    stopLossHit: boolean;
    takeProfitHit: boolean;
    hitPrice: number | null;        // The price where SL or TP was hit
    hitType: 'SL' | 'TP' | null;
}

// ─── Core Functions ──────────────────────────────────────────

/**
 * Calculate adaptive slippage based on volatility.
 * Higher volatility → more slippage (realistic: volatile markets have wider spreads).
 *
 * @param baseSlippageBps - Base slippage in basis points
 * @param atrValues - Recent ATR values for volatility assessment
 * @param currentPrice - Current market price
 * @returns Slippage as a decimal multiplier (e.g., 0.0002 = 2bps)
 */
export function calculateSlippage(
    baseSlippageBps: number,
    atrValues: number[],
    currentPrice: number,
): number {
    if (!atrValues.length || currentPrice <= 0) {
        return baseSlippageBps / 10000;
    }

    const recentATR = atrValues[atrValues.length - 1];
    const avgATR = atrValues.reduce((sum, v) => sum + v, 0) / atrValues.length;

    // Volatility ratio: current ATR vs average ATR
    // If current volatility is 2x average, slippage doubles
    const volatilityRatio = avgATR > 0 ? Math.max(0.5, Math.min(3.0, recentATR / avgATR)) : 1.0;

    const adaptedBps = baseSlippageBps * volatilityRatio;
    return adaptedBps / 10000;
}

/**
 * Calculate commission for a trade.
 *
 * @param notionalValue - Position notional value in USDT (quantity × price × leverage)
 * @param rate - Commission rate as decimal (0.0004 = 0.04%)
 * @returns Commission cost in USDT
 */
export function calculateCommission(notionalValue: number, rate: number): number {
    return Math.abs(notionalValue) * rate;
}

/**
 * Simulate order fill with slippage applied.
 * LONG entries fill at a higher price (buying pushes price up).
 * SHORT entries fill at a lower price (selling pushes price down).
 * Exits reverse the direction of slippage.
 *
 * @param price - Reference price (candle open or close)
 * @param slippageDecimal - Slippage as decimal (from calculateSlippage)
 * @param direction - Trade direction
 * @param isEntry - Whether this is an entry or exit fill
 * @returns Adjusted fill price
 */
export function simulateFill(
    price: number,
    slippageDecimal: number,
    direction: TradeDirection,
    isEntry: boolean,
): number {
    // Entry LONG or Exit SHORT → price moves AGAINST us (higher)
    // Entry SHORT or Exit LONG → price moves AGAINST us (lower)
    const isAdverseMoveUp =
        (direction === TradeDirection.LONG && isEntry) ||
        (direction === TradeDirection.SHORT && !isEntry);

    if (isAdverseMoveUp) {
        return price * (1 + slippageDecimal);
    } else {
        return price * (1 - slippageDecimal);
    }
}

/**
 * Check if stop-loss or take-profit was hit within a candle.
 * Uses the candle's high and low to detect intra-candle touches.
 *
 * For LONG positions:
 *   - SL hit if candle LOW ≤ stopLoss
 *   - TP hit if candle HIGH ≥ takeProfit
 *
 * For SHORT positions:
 *   - SL hit if candle HIGH ≥ stopLoss
 *   - TP hit if candle LOW ≤ takeProfit
 *
 * If BOTH SL and TP are hit in the same candle, we assume the WORST case
 * (SL hit first) — this is a conservative, antibiased approach.
 *
 * @param entryPrice - Position entry price
 * @param stopLossPrice - Stop-loss price level
 * @param takeProfitPrice - Take-profit price level
 * @param candle - Current OHLCV candle
 * @param direction - Position direction
 * @returns SLTPCheckResult with hit status and price
 */
export function checkStopLossAndTakeProfit(
    entryPrice: number,
    stopLossPrice: number,
    takeProfitPrice: number,
    candle: OHLCV,
    direction: TradeDirection,
): SLTPCheckResult {
    let stopLossHit = false;
    let takeProfitHit = false;

    if (direction === TradeDirection.LONG) {
        stopLossHit = candle.low <= stopLossPrice;
        takeProfitHit = candle.high >= takeProfitPrice;
    } else {
        // SHORT: SL is above entry, TP is below entry
        stopLossHit = candle.high >= stopLossPrice;
        takeProfitHit = candle.low <= takeProfitPrice;
    }

    // Both hit in same candle → assume worst case (SL)
    if (stopLossHit && takeProfitHit) {
        return {
            stopLossHit: true,
            takeProfitHit: false,
            hitPrice: stopLossPrice,
            hitType: 'SL',
        };
    }

    if (stopLossHit) {
        return {
            stopLossHit: true,
            takeProfitHit: false,
            hitPrice: stopLossPrice,
            hitType: 'SL',
        };
    }

    if (takeProfitHit) {
        return {
            stopLossHit: false,
            takeProfitHit: true,
            hitPrice: takeProfitPrice,
            hitType: 'TP',
        };
    }

    return {
        stopLossHit: false,
        takeProfitHit: false,
        hitPrice: null,
        hitType: null,
    };
}

/**
 * Simulate a complete order execution: fill + slippage + commission.
 *
 * @param price - Reference price
 * @param quantity - Position quantity
 * @param leverage - Leverage multiplier
 * @param direction - Trade direction
 * @param isEntry - Entry or exit
 * @param config - Execution configuration
 * @param atrValues - ATR values for adaptive slippage
 * @returns Complete execution result
 */
export function simulateExecution(
    price: number,
    quantity: number,
    leverage: number,
    direction: TradeDirection,
    isEntry: boolean,
    config: ExecutionConfig,
    atrValues: number[] = [],
): ExecutionResult {
    // Calculate slippage
    const slippageDecimal = config.useAdaptiveSlippage
        ? calculateSlippage(config.slippageBps, atrValues, price)
        : config.slippageBps / 10000;

    // Get fill price
    const fillPrice = simulateFill(price, slippageDecimal, direction, isEntry);

    // Calculate costs
    const notionalValue = quantity * fillPrice * leverage;
    const slippageCost = Math.abs(fillPrice - price) * quantity * leverage;
    const commissionCost = calculateCommission(notionalValue, config.commissionRate);

    // Market impact (for large positions relative to volume)
    let marketImpact = 0;
    if (config.marketImpactEnabled && config.avgDailyVolume > 0) {
        marketImpact = estimateMarketImpact(notionalValue, config.avgDailyVolume, price);
    }

    return {
        fillPrice,
        slippageCost,
        commissionCost,
        totalCost: slippageCost + commissionCost + marketImpact,
        marketImpact,
    };
}

/**
 * Estimate market impact for large positions.
 * Uses a square-root model: impact ∝ √(orderSize / dailyVolume)
 * This is a simplified version of the Almgren-Chriss model.
 *
 * @param notionalValue - Order notional value in USDT
 * @param avgDailyVolume - Average daily trading volume in USDT
 * @param currentPrice - Current price for impact calculation
 * @returns Estimated market impact cost in USDT
 */
export function estimateMarketImpact(
    notionalValue: number,
    avgDailyVolume: number,
    currentPrice: number,
): number {
    if (avgDailyVolume <= 0 || currentPrice <= 0) return 0;

    // Participation rate: what fraction of daily volume is this order
    const participationRate = Math.abs(notionalValue) / avgDailyVolume;

    // Square-root impact model: impact_bps = 10 * sqrt(participation_rate)
    // 1% of daily volume → ~1bp impact
    // 10% of daily volume → ~3.2bp impact
    const impactBps = 10 * Math.sqrt(participationRate);

    // Cap impact at 50bps (0.5%) — beyond this, order should be split
    const cappedImpactBps = Math.min(impactBps, 50);

    return (cappedImpactBps / 10000) * Math.abs(notionalValue);
}

/**
 * Calculate the position quantity from capital allocation.
 *
 * @param capital - Available capital in USDT
 * @param positionSizePercent - Percentage of capital to use (0-1 scale, e.g., 0.02 = 2%)
 * @param entryPrice - Expected entry price
 * @param leverage - Leverage multiplier
 * @returns Position quantity (number of units)
 */
export function calculatePositionQuantity(
    capital: number,
    positionSizePercent: number,
    entryPrice: number,
    leverage: number,
): number {
    if (entryPrice <= 0 || leverage <= 0) return 0;

    // Capital allocated to this trade
    const allocatedCapital = capital * positionSizePercent;

    // With leverage, position notional = allocated * leverage
    // Quantity = notional / price
    return (allocatedCapital * leverage) / entryPrice;
}

/**
 * Calculate stop-loss and take-profit price levels from risk genes.
 *
 * @param entryPrice - Entry price
 * @param direction - Trade direction
 * @param stopLossPercent - SL distance as percentage (e.g., 2.0 = 2%)
 * @param takeProfitPercent - TP distance as percentage (e.g., 6.0 = 6%)
 * @returns Object with stopLoss and takeProfit price levels
 */
export function calculateSLTPLevels(
    entryPrice: number,
    direction: TradeDirection,
    stopLossPercent: number,
    takeProfitPercent: number,
): { stopLoss: number; takeProfit: number } {
    const slDistance = entryPrice * (stopLossPercent / 100);
    const tpDistance = entryPrice * (takeProfitPercent / 100);

    if (direction === TradeDirection.LONG) {
        return {
            stopLoss: entryPrice - slDistance,
            takeProfit: entryPrice + tpDistance,
        };
    } else {
        return {
            stopLoss: entryPrice + slDistance,
            takeProfit: entryPrice - tpDistance,
        };
    }
}
