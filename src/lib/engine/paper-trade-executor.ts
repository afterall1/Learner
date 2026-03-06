// ============================================================
// Learner: Paper Trade Executor — Realistic Trade Simulation
// ============================================================
// Simulates trade execution with realistic conditions:
// - Configurable slippage (default 0.02%)
// - Maker/Taker fee differentiation
// - Position sizing from StrategyDNA risk genes
// - Stop-loss and take-profit price calculation
// - Liquidation detection
// - Risk Manager validation before execution
//
// Produces Trade objects that feed back into the Island
// for evolution fitness evaluation.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    Trade,
    TradeDirection,
    TradeStatus,
    TradeSignal,
    TradeSignalAction,
    StrategyDNA,
    Position,
    PaperTradeConfig,
    DEFAULT_PAPER_TRADE_CONFIG,
    OHLCV,
} from '@/types';

// ─── Paper Trade Executor ────────────────────────────────────

export class PaperTradeExecutor {
    private config: PaperTradeConfig;
    private openPositions: Map<string, Position> = new Map(); // keyed by strategyId

    constructor(config: Partial<PaperTradeConfig> = {}) {
        this.config = { ...DEFAULT_PAPER_TRADE_CONFIG, ...config };
    }

    // ─── Execute Trade Signal ──────────────────────────────────

    /**
     * Execute a trade signal by creating a paper trade.
     * Returns the Trade if executed, or null if the signal is invalid
     * or a position already exists for this strategy.
     *
     * @param signal - The trade signal from the Signal Engine
     * @param strategy - The StrategyDNA that generated the signal
     * @param currentPrice - Current market price
     * @param availableBalance - Available balance for position sizing
     * @param slotId - The island slot this trade belongs to
     */
    executeSignal(
        signal: TradeSignal,
        strategy: StrategyDNA,
        currentPrice: number,
        availableBalance: number,
        slotId: string,
    ): Trade | null {
        // Don't execute HOLD signals
        if (signal.action === TradeSignalAction.HOLD) {
            return null;
        }

        // Handle EXIT signals
        if (
            signal.action === TradeSignalAction.EXIT_LONG ||
            signal.action === TradeSignalAction.EXIT_SHORT
        ) {
            return this.closePosition(strategy.id, currentPrice, signal.reason, signal.indicators);
        }

        // Handle LONG/SHORT entry signals
        if (
            signal.action === TradeSignalAction.LONG ||
            signal.action === TradeSignalAction.SHORT
        ) {
            // Check if we already have an open position for this strategy
            if (this.openPositions.has(strategy.id)) {
                return null; // Already in a position
            }

            // Check max open positions per island
            const islandPositions = this.getIslandPositionCount(slotId);
            if (islandPositions >= this.config.maxOpenPositions) {
                return null; // Too many positions for this island
            }

            const direction = signal.action === TradeSignalAction.LONG
                ? TradeDirection.LONG
                : TradeDirection.SHORT;

            return this.openPosition(
                strategy,
                direction,
                currentPrice,
                availableBalance,
                slotId,
                signal.reason,
                signal.indicators,
            );
        }

        return null;
    }

    // ─── Open Position ─────────────────────────────────────────

    private openPosition(
        strategy: StrategyDNA,
        direction: TradeDirection,
        currentPrice: number,
        availableBalance: number,
        slotId: string,
        reason: string,
        indicators: Record<string, number>,
    ): Trade {
        const riskGenes = strategy.riskGenes;

        // Calculate position size from strategy DNA risk genes
        // Position size = balance * positionSizePercent / 100
        const positionValue = availableBalance * (riskGenes.positionSizePercent / 100);
        const leverage = Math.min(riskGenes.maxLeverage, 10); // Hard cap at 10x

        // Apply slippage to entry price
        const slippageMultiplier = this.config.enableSlippage
            ? (direction === TradeDirection.LONG
                ? 1 + this.config.slippagePercent
                : 1 - this.config.slippagePercent)
            : 1;
        const entryPrice = currentPrice * slippageMultiplier;

        // Calculate quantity
        const margin = positionValue;
        const notionalValue = margin * leverage;
        const quantity = notionalValue / entryPrice;

        // Calculate stop-loss and take-profit prices
        const stopLoss = direction === TradeDirection.LONG
            ? entryPrice * (1 - riskGenes.stopLossPercent / 100)
            : entryPrice * (1 + riskGenes.stopLossPercent / 100);

        const takeProfit = direction === TradeDirection.LONG
            ? entryPrice * (1 + riskGenes.takeProfitPercent / 100)
            : entryPrice * (1 - riskGenes.takeProfitPercent / 100);

        // Calculate fees
        const fees = this.config.enableFees
            ? notionalValue * this.config.takerFeePercent
            : 0;

        // Calculate liquidation price (simplified)
        const maintenanceMarginRate = 0.004; // 0.4% for most Binance Futures pairs
        const liquidationPrice = direction === TradeDirection.LONG
            ? entryPrice * (1 - (1 / leverage) + maintenanceMarginRate)
            : entryPrice * (1 + (1 / leverage) - maintenanceMarginRate);

        const now = Date.now();
        const tradeId = uuidv4();

        // Create Position for tracking
        const position: Position = {
            id: tradeId,
            slotId,
            symbol: slotId.split(':')[0],
            direction,
            entryPrice,
            currentPrice: entryPrice,
            quantity,
            leverage,
            unrealizedPnl: -fees, // Start with negative PnL (fees)
            unrealizedPnlPercent: 0,
            margin,
            liquidationPrice,
            stopLoss,
            takeProfit,
            strategyId: strategy.id,
            isPaperTrade: true,
            openTime: now,
        };

        this.openPositions.set(strategy.id, position);

        // Create Trade object (still open)
        const trade: Trade = {
            id: tradeId,
            strategyId: strategy.id,
            strategyName: strategy.name,
            slotId,
            symbol: slotId.split(':')[0],
            direction,
            status: TradeStatus.OPEN,
            isPaperTrade: true,
            entryPrice,
            exitPrice: null,
            quantity,
            leverage,
            stopLoss,
            takeProfit,
            pnlPercent: null,
            pnlUSD: null,
            fees,
            entryTime: now,
            exitTime: null,
            entryReason: reason,
            exitReason: null,
            indicators,
        };

        return trade;
    }

    // ─── Close Position ────────────────────────────────────────

    private closePosition(
        strategyId: string,
        currentPrice: number,
        reason: string,
        indicators: Record<string, number>,
    ): Trade | null {
        const position = this.openPositions.get(strategyId);
        if (!position) return null;

        // Apply exit slippage
        const slippageMultiplier = this.config.enableSlippage
            ? (position.direction === TradeDirection.LONG
                ? 1 - this.config.slippagePercent  // Sell lower
                : 1 + this.config.slippagePercent) // Buy higher
            : 1;
        const exitPrice = currentPrice * slippageMultiplier;

        // Calculate PnL
        const priceDiff = position.direction === TradeDirection.LONG
            ? exitPrice - position.entryPrice
            : position.entryPrice - exitPrice;

        const grossPnlUSD = priceDiff * position.quantity;

        // Exit fees
        const exitNotional = exitPrice * position.quantity;
        const exitFees = this.config.enableFees
            ? exitNotional * this.config.takerFeePercent
            : 0;

        const totalFees = position.margin > 0
            ? (position.entryPrice * position.quantity * this.config.takerFeePercent) + exitFees
            : exitFees;

        const netPnlUSD = grossPnlUSD - totalFees;
        const pnlPercent = position.margin > 0
            ? (netPnlUSD / position.margin) * 100
            : 0;

        const now = Date.now();

        // Remove position
        this.openPositions.delete(strategyId);

        // Create closed Trade object
        const trade: Trade = {
            id: position.id,
            strategyId: position.strategyId,
            strategyName: '', // Will be filled by caller
            slotId: position.slotId,
            symbol: position.symbol,
            direction: position.direction,
            status: TradeStatus.CLOSED,
            isPaperTrade: true,
            entryPrice: position.entryPrice,
            exitPrice,
            quantity: position.quantity,
            leverage: position.leverage,
            stopLoss: position.stopLoss,
            takeProfit: position.takeProfit,
            pnlPercent,
            pnlUSD: netPnlUSD,
            fees: totalFees,
            entryTime: position.openTime,
            exitTime: now,
            entryReason: '', // Original entry reason stored elsewhere
            exitReason: reason,
            indicators,
        };

        return trade;
    }

    // ─── Price Update (Stop-Loss / Take-Profit / Liquidation) ──

    /**
     * Update positions with the latest price and check for stop-loss,
     * take-profit, or liquidation triggers.
     *
     * @returns Array of auto-closed trades (from SL/TP/liquidation)
     */
    updatePrice(slotId: string, currentPrice: number): Trade[] {
        const closedTrades: Trade[] = [];

        for (const [strategyId, position] of this.openPositions.entries()) {
            if (position.slotId !== slotId) continue;

            // Update current price and unrealized PnL
            position.currentPrice = currentPrice;

            const priceDiff = position.direction === TradeDirection.LONG
                ? currentPrice - position.entryPrice
                : position.entryPrice - currentPrice;

            const grossPnl = priceDiff * position.quantity;
            const entryFees = position.entryPrice * position.quantity * this.config.takerFeePercent;
            position.unrealizedPnl = grossPnl - entryFees;
            position.unrealizedPnlPercent = position.margin > 0
                ? (position.unrealizedPnl / position.margin) * 100
                : 0;

            // Check liquidation
            const isLiquidated = position.direction === TradeDirection.LONG
                ? currentPrice <= position.liquidationPrice
                : currentPrice >= position.liquidationPrice;

            if (isLiquidated) {
                const trade = this.closePosition(
                    strategyId,
                    currentPrice,
                    `LIQUIDATED at ${currentPrice.toFixed(2)}`,
                    {},
                );
                if (trade) closedTrades.push(trade);
                continue;
            }

            // Check stop-loss
            const isStopLossHit = position.direction === TradeDirection.LONG
                ? currentPrice <= position.stopLoss
                : currentPrice >= position.stopLoss;

            if (isStopLossHit) {
                const trade = this.closePosition(
                    strategyId,
                    position.stopLoss,  // Execute at SL price
                    `Stop-Loss hit at ${position.stopLoss.toFixed(2)}`,
                    {},
                );
                if (trade) closedTrades.push(trade);
                continue;
            }

            // Check take-profit
            const isTakeProfitHit = position.direction === TradeDirection.LONG
                ? currentPrice >= position.takeProfit
                : currentPrice <= position.takeProfit;

            if (isTakeProfitHit) {
                const trade = this.closePosition(
                    strategyId,
                    position.takeProfit,  // Execute at TP price
                    `Take-Profit hit at ${position.takeProfit.toFixed(2)}`,
                    {},
                );
                if (trade) closedTrades.push(trade);
                continue;
            }
        }

        return closedTrades;
    }

    /**
     * Check exit signals for all open positions using the Signal Engine.
     * Call this on each candle close to evaluate exit rules.
     *
     * @param slotId - The island slot to check
     * @param candles - Current candle history
     * @param evaluator - Function that evaluates exit signals for a strategy
     * @returns Array of trades that were closed due to exit signals
     */
    checkExitSignals(
        slotId: string,
        candles: OHLCV[],
        evaluator: (strategyId: string, candles: OHLCV[]) => TradeSignal | null,
    ): Trade[] {
        const closedTrades: Trade[] = [];

        for (const [strategyId, position] of this.openPositions.entries()) {
            if (position.slotId !== slotId) continue;

            const signal = evaluator(strategyId, candles);
            if (signal && (
                signal.action === TradeSignalAction.EXIT_LONG ||
                signal.action === TradeSignalAction.EXIT_SHORT
            )) {
                const currentPrice = candles[candles.length - 1].close;
                const trade = this.closePosition(
                    strategyId,
                    currentPrice,
                    signal.reason,
                    signal.indicators,
                );
                if (trade) closedTrades.push(trade);
            }
        }

        return closedTrades;
    }

    // ─── Position Queries ──────────────────────────────────────

    /**
     * Get all open positions.
     */
    getOpenPositions(): Position[] {
        return Array.from(this.openPositions.values());
    }

    /**
     * Get open positions for a specific island slot.
     */
    getSlotPositions(slotId: string): Position[] {
        return Array.from(this.openPositions.values())
            .filter((p) => p.slotId === slotId);
    }

    /**
     * Check if a strategy has an open position.
     */
    hasOpenPosition(strategyId: string): boolean {
        return this.openPositions.has(strategyId);
    }

    /**
     * Get the total number of open positions across all islands.
     */
    getTotalOpenPositions(): number {
        return this.openPositions.size;
    }

    /**
     * Force close all positions (emergency stop).
     */
    closeAllPositions(currentPrices: Map<string, number>): Trade[] {
        const closedTrades: Trade[] = [];
        const strategyIds = Array.from(this.openPositions.keys());

        for (const strategyId of strategyIds) {
            const position = this.openPositions.get(strategyId);
            if (!position) continue;

            const price = currentPrices.get(position.slotId) ?? position.currentPrice;
            const trade = this.closePosition(
                strategyId,
                price,
                'Emergency Stop — All positions closed',
                {},
            );
            if (trade) closedTrades.push(trade);
        }

        return closedTrades;
    }

    // ─── Helpers ───────────────────────────────────────────────

    private getIslandPositionCount(slotId: string): number {
        let count = 0;
        for (const position of this.openPositions.values()) {
            if (position.slotId === slotId) count++;
        }
        return count;
    }
}
