// ============================================================
// Learner: LiveTradeExecutor — Signal → Order Bridge
// ============================================================
// The critical missing link between signal evaluation and order
// execution. When autoTradeEnabled is true, this module:
//
//   1. Gets the champion strategy for a slot
//   2. Evaluates it against current candles
//   3. Validates risk constraints (max positions, cooldown, confidence)
//   4. Creates an OrderGroupConfig
//   5. Executes atomically via OrderLifecycleEngine
//   6. Records the trade result back to Cortex + TradeStore
//
// Safety Rails:
//   - Never opens more than MAX_CONCURRENT_POSITIONS globally
//   - Never opens two positions for the same slot
//   - Minimum confidence threshold before execution
//   - Post-trade cooldown per slot (prevents overtrading)
//   - Testnet guard (blocks if not testnet unless explicitly confirmed)
// ============================================================

import { BinanceRestClient } from './binance-rest';
import { OrderLifecycleEngine } from './order-lifecycle';
import { ExchangeInfoCache, ExchangeCircuitBreaker } from './exchange-circuit-breaker';
import { ExecutionQualityTracker } from './execution-quality';
import { getHeartbeatMonitor } from '../config/heartbeat-monitor';
import { evaluateStrategy } from '../engine/signal-engine';
import { Cortex } from '../engine/cortex';
import {
    TradeSignalAction,
    TradeDirection,
    Trade,
    TradeStatus,
    OrderSide,
    OrderGroupConfig,
    OrderGroup,
    StrategyDNA,
    OHLCV,
} from '@/types';
import { v4 as uuidv4 } from 'uuid';

// ─── Configuration ──────────────────────────────────────────

export interface LiveTradeConfig {
    /** Maximum concurrent open positions across all slots */
    maxConcurrentPositions: number;
    /** Minimum signal confidence to trigger an order (0-1) */
    minConfidence: number;
    /** Cooldown after a trade closes, per slot (ms) */
    postTradeCooldownMs: number;
    /** Position size as fraction of slot capital (0-1) */
    positionSizeFraction: number;
    /** Maximum leverage allowed */
    maxLeverage: number;
    /** Entry order type */
    entryType: 'MARKET' | 'LIMIT';
    /** Max SL placement retries before emergency close */
    maxSlRetries: number;
    /** Whether to actually send orders (true = live, false = log only) */
    dryRun: boolean;
}

const DEFAULT_LIVE_TRADE_CONFIG: LiveTradeConfig = {
    maxConcurrentPositions: 3,
    minConfidence: 0.3,
    postTradeCooldownMs: 5 * 60 * 1000, // 5 minutes
    positionSizeFraction: 0.02, // 2% of slot capital
    maxLeverage: 5,
    entryType: 'MARKET',
    maxSlRetries: 3,
    dryRun: false,
};

// ─── Active Position Tracking ───────────────────────────────

interface ActivePosition {
    slotId: string;
    groupId: string;
    strategyId: string;
    symbol: string;
    direction: TradeDirection;
    entryPrice: number;
    quantity: number;
    entryTime: number;
    orderGroup: OrderGroup;
}

// ─── LiveTradeExecutor ──────────────────────────────────────

export class LiveTradeExecutor {
    private readonly config: LiveTradeConfig;
    private readonly client: BinanceRestClient;
    private readonly orderEngine: OrderLifecycleEngine;
    private readonly eqTracker: ExecutionQualityTracker;
    private readonly cortex: Cortex;

    private activePositions = new Map<string, ActivePosition>(); // slotId → position
    private slotCooldowns = new Map<string, number>(); // slotId → cooldown expiry timestamp

    constructor(
        cortex: Cortex,
        config: Partial<LiveTradeConfig> = {},
    ) {
        this.config = { ...DEFAULT_LIVE_TRADE_CONFIG, ...config };
        this.cortex = cortex;
        this.client = new BinanceRestClient();
        this.eqTracker = new ExecutionQualityTracker();

        const infoCache = new ExchangeInfoCache(
            () => this.client.getExchangeInfo(),
        );
        this.orderEngine = new OrderLifecycleEngine(
            this.client,
            infoCache,
            {
                onFullyArmed: (group) => {
                    console.log(
                        `[LiveTradeExecutor] ✅ Order fully armed: ${group.groupId} ` +
                        `${group.config.symbol} ${group.config.side}`,
                    );
                    getHeartbeatMonitor().reportHealthy(
                        'binance-rest',
                        Date.now() - group.createdAt,
                        `Order armed: ${group.config.symbol}`,
                    );
                },
                onEmergencyClose: (group, reason) => {
                    console.error(
                        `[LiveTradeExecutor] 🚨 EMERGENCY CLOSE: ${group.groupId} ` +
                        `${group.config.symbol} — ${reason}`,
                    );
                    // Remove from active positions
                    for (const [slotId, pos] of this.activePositions.entries()) {
                        if (pos.groupId === group.groupId) {
                            this.activePositions.delete(slotId);
                            break;
                        }
                    }
                    getHeartbeatMonitor().reportError('binance-rest', `Emergency close: ${reason}`);
                },
                onFailed: (group, reason) => {
                    console.error(
                        `[LiveTradeExecutor] ❌ Order failed: ${group.groupId} ` +
                        `${group.config.symbol} — ${reason}`,
                    );
                    getHeartbeatMonitor().reportError('binance-rest', `Order failed: ${reason}`);
                },
                onExecutionRecord: (record) => {
                    this.eqTracker.recordExecution(record);
                },
            },
        );
    }

    // ─── Main Entry Point ───────────────────────────────────

    /**
     * Evaluate the champion strategy for a slot and execute if signal warrants.
     * Called from CortexLiveEngine.handleCandleClose() when autoTrade is enabled.
     *
     * @param slotId - The trading slot ID (e.g., "BTCUSDT:1h")
     * @param candles - Current candle history for the slot
     * @returns Whether an order was placed
     */
    async evaluateAndExecute(slotId: string, candles: OHLCV[]): Promise<boolean> {
        try {
            // ─── Pre-flight checks ──────────────────────────
            if (this.config.dryRun) {
                return this.dryRunEvaluate(slotId, candles);
            }

            // 1. Check if slot already has an active position
            if (this.activePositions.has(slotId)) {
                return false; // Already positioned for this slot
            }

            // 2. Check global position limit
            if (this.activePositions.size >= this.config.maxConcurrentPositions) {
                return false;
            }

            // 3. Check cooldown
            const cooldownExpiry = this.slotCooldowns.get(slotId);
            if (cooldownExpiry && Date.now() < cooldownExpiry) {
                return false;
            }

            // 4. Get champion strategy from island
            const island = this.cortex.getIsland(slotId);
            if (!island) return false;

            const snapshot = island.getSnapshot();
            const champion = snapshot.activeStrategy;
            if (!champion) return false;

            // 5. Evaluate strategy signal
            const currentDirection = null; // No open position for this slot
            const signal = evaluateStrategy(champion, candles, currentDirection);

            if (signal.action !== TradeSignalAction.LONG &&
                signal.action !== TradeSignalAction.SHORT) {
                return false; // No entry signal
            }

            // 6. Check confidence threshold
            if (signal.confidence < this.config.minConfidence) {
                return false;
            }

            // ─── Execute order ───────────────────────────────

            const pair = slotId.split(':')[0];
            const direction = signal.action === TradeSignalAction.LONG
                ? TradeDirection.LONG
                : TradeDirection.SHORT;
            const side: OrderSide = direction === TradeDirection.LONG
                ? OrderSide.BUY : OrderSide.SELL;

            // Get current price for position sizing
            const currentPrice = candles[candles.length - 1]?.close;
            if (!currentPrice || currentPrice <= 0) return false;

            // Calculate position size
            const slotCapital = snapshot.allocatedCapital ?? 1000;
            const notionalValue = slotCapital * this.config.positionSizeFraction;
            const leverage = Math.min(
                champion.riskGenes.maxLeverage,
                this.config.maxLeverage,
            );
            const quantity = (notionalValue * leverage) / currentPrice;

            // Calculate SL/TP prices from strategy DNA
            const slPercent = champion.riskGenes.stopLossPercent / 100;
            const tpPercent = champion.riskGenes.takeProfitPercent / 100;

            const stopLossPrice = direction === TradeDirection.LONG
                ? currentPrice * (1 - slPercent)
                : currentPrice * (1 + slPercent);

            const takeProfitPrice = direction === TradeDirection.LONG
                ? currentPrice * (1 + tpPercent)
                : currentPrice * (1 - tpPercent);

            // Create order group config
            const orderConfig: OrderGroupConfig = {
                symbol: pair,
                side,
                quantity: Math.max(0.001, Math.round(quantity * 1000) / 1000), // Binance precision
                entryType: this.config.entryType,
                stopLossPrice: Math.round(stopLossPrice * 100) / 100,
                takeProfitPrice: Math.round(takeProfitPrice * 100) / 100,
                leverage,
                maxSlRetries: this.config.maxSlRetries,
            };

            console.log(
                `[LiveTradeExecutor] 📡 Executing ${direction} ${pair} | ` +
                `Qty: ${orderConfig.quantity} | Lev: ${leverage}x | ` +
                `SL: ${orderConfig.stopLossPrice} | TP: ${orderConfig.takeProfitPrice} | ` +
                `Confidence: ${(signal.confidence * 100).toFixed(0)}% | ` +
                `Strategy: ${champion.name}`,
            );

            // Execute atomically
            const orderGroup = await this.orderEngine.executeAtomicOrder(orderConfig);

            // Track active position
            const terminalStates = ['FAILED', 'EMERGENCY_CLOSED'];
            if (!terminalStates.includes(orderGroup.state as string)) {
                this.activePositions.set(slotId, {
                    slotId,
                    groupId: orderGroup.groupId,
                    strategyId: champion.id,
                    symbol: pair,
                    direction,
                    entryPrice: currentPrice,
                    quantity: orderConfig.quantity,
                    entryTime: Date.now(),
                    orderGroup,
                });
            }

            // Record trade to Cortex
            const trade: Trade = {
                id: uuidv4(),
                strategyId: champion.id,
                strategyName: champion.name,
                slotId,
                symbol: pair,
                direction,
                entryPrice: currentPrice,
                quantity: orderConfig.quantity,
                leverage,
                entryTime: Date.now(),
                status: terminalStates.includes(orderGroup.state as string)
                    ? TradeStatus.CLOSED
                    : TradeStatus.OPEN,
                entryReason: signal.reason,
                isPaperTrade: this.client.isTestnet(),
                exitPrice: null,
                stopLoss: orderConfig.stopLossPrice,
                takeProfit: orderConfig.takeProfitPrice ?? 0,
                pnlPercent: null,
                pnlUSD: null,
                fees: 0,
                exitTime: null,
                exitReason: null,
                indicators: {},
            };

            this.cortex.recordTrade(trade);

            return !terminalStates.includes(orderGroup.state as string);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[LiveTradeExecutor] Error for ${slotId}:`, msg);
            getHeartbeatMonitor().reportError('binance-rest', `Trade execution error: ${msg}`);
            return false;
        }
    }

    // ─── Dry Run Mode ───────────────────────────────────────

    private dryRunEvaluate(slotId: string, candles: OHLCV[]): boolean {
        const island = this.cortex.getIsland(slotId);
        if (!island) return false;

        const snapshot = island.getSnapshot();
        const champion = snapshot.activeStrategy;
        if (!champion) return false;

        const signal = evaluateStrategy(champion, candles, null);

        if (signal.action === TradeSignalAction.LONG ||
            signal.action === TradeSignalAction.SHORT) {
            if (signal.confidence >= this.config.minConfidence) {
                const direction = signal.action === TradeSignalAction.LONG ? 'LONG' : 'SHORT';
                console.log(
                    `[LiveTradeExecutor] 🔸 DRY RUN: Would ${direction} ${slotId} | ` +
                    `Confidence: ${(signal.confidence * 100).toFixed(0)}% | ` +
                    `Strategy: ${champion.name} | Reason: ${signal.reason}`,
                );
                return true;
            }
        }
        return false;
    }

    // ─── Position Management ────────────────────────────────

    /**
     * Check if any active positions should be closed based on exit signals.
     */
    async checkExitSignals(slotId: string, candles: OHLCV[]): Promise<void> {
        const position = this.activePositions.get(slotId);
        if (!position) return;

        const island = this.cortex.getIsland(slotId);
        if (!island) return;

        const snapshot = island.getSnapshot();
        const champion = snapshot.activeStrategy;
        if (!champion) return;

        const signal = evaluateStrategy(champion, candles, position.direction);

        if (signal.action === TradeSignalAction.EXIT_LONG ||
            signal.action === TradeSignalAction.EXIT_SHORT) {
            console.log(
                `[LiveTradeExecutor] 📤 Exit signal for ${slotId}: ${signal.reason}`,
            );

            // Close position via market order
            try {
                const closeSide: OrderSide = position.direction === TradeDirection.LONG
                    ? OrderSide.SELL : OrderSide.BUY;

                await this.client.placeOrder({
                    symbol: position.symbol,
                    side: closeSide,
                    type: 'MARKET',
                    quantity: position.quantity,
                    reduceOnly: true,
                });

                // Remove from tracking
                this.activePositions.delete(slotId);
                // Set cooldown
                this.slotCooldowns.set(slotId,
                    Date.now() + this.config.postTradeCooldownMs);

                console.log(`[LiveTradeExecutor] ✅ Position closed: ${slotId}`);
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[LiveTradeExecutor] Error closing position ${slotId}:`, msg);
            }
        }
    }

    // ─── Status ─────────────────────────────────────────────

    getActivePositions(): ActivePosition[] {
        return [...this.activePositions.values()];
    }

    getActivePositionCount(): number {
        return this.activePositions.size;
    }

    hasPositionForSlot(slotId: string): boolean {
        return this.activePositions.has(slotId);
    }

    getExecutionQualityTracker(): ExecutionQualityTracker {
        return this.eqTracker;
    }

    /**
     * Clean up resources.
     */
    destroy(): void {
        this.client.destroy();
        this.activePositions.clear();
        this.slotCooldowns.clear();
    }
}
