// ============================================================
// Learner: Atomic Order Lifecycle Engine (AOLE)
// ============================================================
// State machine that manages multi-leg orders as atomic units.
//
// Core Invariant:
//   A position NEVER exists without stop-loss protection.
//   If SL placement fails → EMERGENCY_CLOSE (market-close).
//
// Lifecycle:
//   PENDING → SETTING_LEVERAGE → PLACING_ENTRY → ENTRY_FILLED
//   → PLACING_SL → SL_PLACED → PLACING_TP → FULLY_ARMED
//
// Failure Paths:
//   Entry fails → FAILED (nothing to rollback)
//   SL fails (after retries) → EMERGENCY_CLOSE → ROLLED_BACK
//   TP fails → SL_ONLY (acceptable: SL exists)
// ============================================================

import type {
    OrderLifecycleState,
    OrderGroupConfig,
    OrderGroup,
    OrderResult,
    StateTransition,
    ExecutionRecord,
} from '@/types';
import { BinanceRestClient, BinanceApiError } from './binance-rest';
import { ExchangeInfoCache } from './exchange-circuit-breaker';

// ─── Lifecycle Callbacks ────────────────────────────────────

export interface LifecycleCallbacks {
    onStateChange: (group: OrderGroup, transition: StateTransition) => void;
    onFullyArmed: (group: OrderGroup) => void;
    onEmergencyClose: (group: OrderGroup, reason: string) => void;
    onFailed: (group: OrderGroup, reason: string) => void;
    onExecutionRecord: (record: ExecutionRecord) => void;
}

// ─── Order Lifecycle Engine ─────────────────────────────────

export class OrderLifecycleEngine {
    private readonly client: BinanceRestClient;
    private readonly infoCache: ExchangeInfoCache;
    private readonly callbacks: Partial<LifecycleCallbacks>;
    private activeGroups: Map<string, OrderGroup> = new Map();

    constructor(
        client: BinanceRestClient,
        infoCache: ExchangeInfoCache,
        callbacks: Partial<LifecycleCallbacks> = {},
    ) {
        this.client = client;
        this.infoCache = infoCache;
        this.callbacks = callbacks;
    }

    // ─── Public API ─────────────────────────────────────────

    /**
     * Execute a complete multi-leg order atomically.
     * Returns the OrderGroup with final state.
     */
    async executeAtomicOrder(config: OrderGroupConfig): Promise<OrderGroup> {
        // Pre-validation
        this.validateConfig(config);

        // Create order group
        const group = this.createGroup(config);
        this.activeGroups.set(group.groupId, group);

        try {
            // Phase 1: Set leverage
            await this.phaseLeverage(group);

            // Phase 2: Place entry
            await this.phaseEntry(group);

            // Phase 3: Place SL (with retries — CRITICAL)
            await this.phaseStopLoss(group);

            // Phase 4: Place TP (optional, failure acceptable)
            if (config.takeProfitPrice) {
                await this.phaseTakeProfit(group);
            } else {
                // No TP configured — SL_ONLY is terminal
                this.transition(group, 'SL_ONLY' as OrderLifecycleState, 'No take-profit configured');
            }

            return group;
        } catch (error) {
            // If we reach here with an unhandled error, ensure cleanup
            const currentState = group.state as string;
            if (currentState === 'ENTRY_FILLED' || currentState === 'PLACING_SL') {
                // Position exists without SL — EMERGENCY
                await this.emergencyClose(group, error instanceof Error ? error.message : 'Unknown error');
            }
            return group;
        } finally {
            group.completedAt = Date.now();
        }
    }

    /**
     * Get a specific order group by ID.
     */
    getGroup(groupId: string): OrderGroup | null {
        return this.activeGroups.get(groupId) ?? null;
    }

    /**
     * Get all active (non-terminal) order groups.
     */
    getActiveGroups(): OrderGroup[] {
        return Array.from(this.activeGroups.values()).filter(g => {
            const state = g.state as string;
            return state !== 'CLOSED' && state !== 'FAILED' && state !== 'ROLLED_BACK';
        });
    }

    /**
     * Get all order groups.
     */
    getAllGroups(): OrderGroup[] {
        return Array.from(this.activeGroups.values());
    }

    // ─── Phase Implementations ──────────────────────────────

    /**
     * Phase 1: Set leverage for the symbol.
     */
    private async phaseLeverage(group: OrderGroup): Promise<void> {
        this.transition(group, 'SETTING_LEVERAGE' as OrderLifecycleState, 'Setting leverage');

        const leverage = Math.min(group.config.leverage, 10);

        try {
            await this.client.setLeverage(group.config.symbol, leverage);

            // Also set margin type if specified
            if (group.config.marginType) {
                try {
                    await this.client.setMarginType(group.config.symbol, group.config.marginType);
                } catch (error) {
                    // Margin type error is non-fatal (already set case)
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    console.warn(`[AOLE:${group.groupId}] Margin type warning: ${msg}`);
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.transition(group, 'FAILED' as OrderLifecycleState, `Leverage setting failed: ${msg}`, undefined, msg);
            this.callbacks.onFailed?.(group, msg);
            throw error;
        }
    }

    /**
     * Phase 2: Place the entry order.
     */
    private async phaseEntry(group: OrderGroup): Promise<void> {
        this.transition(group, 'PLACING_ENTRY' as OrderLifecycleState, 'Placing entry order');

        const { symbol, side, quantity, entryType, entryPrice } = group.config;
        const submissionTime = Date.now();
        let submissionPrice: number;

        try {
            // Adjust quantity/price to exchange filters
            const adjustedQty = await this.infoCache.adjustQuantity(symbol, quantity);
            let adjustedPrice: number | undefined;

            if (entryType === 'LIMIT' && entryPrice) {
                adjustedPrice = await this.infoCache.adjustPrice(symbol, entryPrice);
                submissionPrice = adjustedPrice;
            } else {
                // For MARKET orders, get current price for execution quality tracking
                submissionPrice = await this.client.getLatestPrice(symbol);
            }

            const orderResult = await this.client.placeOrder({
                symbol,
                side: side as 'BUY' | 'SELL',
                type: entryType,
                quantity: adjustedQty,
                price: adjustedPrice,
                timeInForce: entryType === 'LIMIT' ? 'GTC' : undefined,
            });

            group.entryOrder = orderResult;

            // Record execution quality
            const fillPrice = orderResult.avgPrice || orderResult.price;
            if (fillPrice > 0) {
                const slippageBps = Math.abs((fillPrice - submissionPrice) / submissionPrice) * 10000;
                group.executionQuality = {
                    orderId: orderResult.orderId,
                    groupId: group.groupId,
                    symbol,
                    side: group.config.side,
                    expectedPrice: submissionPrice,
                    fillPrice,
                    slippageBps,
                    latencyMs: Date.now() - submissionTime,
                    orderBookSpreadBps: 0, // Will be enriched by ExecutionQualityTracker
                    fillRatio: orderResult.origQty > 0 ? orderResult.executedQty / orderResult.origQty : 0,
                    timestamp: Date.now(),
                };
                this.callbacks.onExecutionRecord?.(group.executionQuality);
            }

            this.transition(
                group,
                'ENTRY_FILLED' as OrderLifecycleState,
                `Entry filled at ${fillPrice}`,
                orderResult.orderId,
            );
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.transition(group, 'FAILED' as OrderLifecycleState, `Entry failed: ${msg}`, undefined, msg);
            this.callbacks.onFailed?.(group, msg);
            throw error;
        }
    }

    /**
     * Phase 3: Place the stop-loss order WITH RETRIES.
     * This is the MOST CRITICAL phase. If SL fails after all retries,
     * we EMERGENCY_CLOSE the position to prevent naked exposure.
     */
    private async phaseStopLoss(group: OrderGroup): Promise<void> {
        this.transition(group, 'PLACING_SL' as OrderLifecycleState, 'Placing stop-loss order');

        const { symbol, side, stopLossPrice } = group.config;
        const maxRetries = group.config.maxSlRetries;
        const slSide = side === 'BUY' ? 'SELL' : 'BUY'; // Opposite side for SL

        // Use the filled quantity from entry (handles partial fills)
        const entryQty = group.entryOrder?.executedQty ?? group.config.quantity;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const adjustedQty = await this.infoCache.adjustQuantity(symbol, entryQty);
                const adjustedPrice = await this.infoCache.adjustPrice(symbol, stopLossPrice);

                const slResult = await this.client.placeOrder({
                    symbol,
                    side: slSide as 'BUY' | 'SELL',
                    type: 'STOP_MARKET',
                    quantity: adjustedQty,
                    stopPrice: adjustedPrice,
                    reduceOnly: true,
                });

                group.slOrder = slResult;
                group.slRetryCount = attempt;

                this.transition(
                    group,
                    'SL_PLACED' as OrderLifecycleState,
                    `SL placed at ${adjustedPrice} (attempt ${attempt + 1})`,
                    slResult.orderId,
                );

                return; // SUCCESS — SL is in place
            } catch (error) {
                group.slRetryCount = attempt + 1;
                const msg = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[AOLE:${group.groupId}] SL attempt ${attempt + 1}/${maxRetries + 1} failed: ${msg}`);

                if (attempt < maxRetries) {
                    // Wait before retry (exponential backoff)
                    await this.sleep(1000 * Math.pow(2, attempt));
                }
            }
        }

        // ALL RETRIES EXHAUSTED — EMERGENCY CLOSE
        console.error(`[AOLE:${group.groupId}] ⚠️ SL FAILED after ${maxRetries + 1} attempts — EMERGENCY CLOSE`);
        await this.emergencyClose(group, `SL placement failed after ${maxRetries + 1} attempts`);
    }

    /**
     * Phase 4: Place the take-profit order.
     * Failure is ACCEPTABLE — SL exists, position is protected.
     */
    private async phaseTakeProfit(group: OrderGroup): Promise<void> {
        this.transition(group, 'PLACING_TP' as OrderLifecycleState, 'Placing take-profit order');

        const { symbol, side, takeProfitPrice } = group.config;
        if (!takeProfitPrice) return;

        const tpSide = side === 'BUY' ? 'SELL' : 'BUY';
        const entryQty = group.entryOrder?.executedQty ?? group.config.quantity;

        try {
            const adjustedQty = await this.infoCache.adjustQuantity(symbol, entryQty);
            const adjustedPrice = await this.infoCache.adjustPrice(symbol, takeProfitPrice);

            const tpResult = await this.client.placeOrder({
                symbol,
                side: tpSide as 'BUY' | 'SELL',
                type: 'TAKE_PROFIT_MARKET',
                quantity: adjustedQty,
                stopPrice: adjustedPrice,
                reduceOnly: true,
            });

            group.tpOrder = tpResult;

            this.transition(
                group,
                'FULLY_ARMED' as OrderLifecycleState,
                `TP placed at ${adjustedPrice} — position FULLY ARMED`,
                tpResult.orderId,
            );

            this.callbacks.onFullyArmed?.(group);
        } catch (error) {
            // TP failure is ACCEPTABLE — SL exists
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[AOLE:${group.groupId}] TP placement failed (non-critical): ${msg}`);

            this.transition(
                group,
                'SL_ONLY' as OrderLifecycleState,
                `TP failed: ${msg}. SL in place — position protected.`,
                undefined,
                msg,
            );
        }
    }

    /**
     * EMERGENCY CLOSE: Market-close the position immediately.
     * Called when SL placement fails after all retries.
     */
    private async emergencyClose(group: OrderGroup, reason: string): Promise<void> {
        this.transition(
            group,
            'EMERGENCY_CLOSE' as OrderLifecycleState,
            `EMERGENCY CLOSE: ${reason}`,
            undefined,
            reason,
        );

        const { symbol, side } = group.config;
        const closeSide = side === 'BUY' ? 'SELL' : 'BUY';
        const entryQty = group.entryOrder?.executedQty ?? group.config.quantity;

        try {
            const adjustedQty = await this.infoCache.adjustQuantity(symbol, entryQty);

            const closeResult = await this.client.placeOrder({
                symbol,
                side: closeSide as 'BUY' | 'SELL',
                type: 'MARKET',
                quantity: adjustedQty,
                reduceOnly: true,
            });

            group.emergencyCloseOrder = closeResult;

            this.transition(
                group,
                'ROLLED_BACK' as OrderLifecycleState,
                `Emergency close executed at ${closeResult.avgPrice || closeResult.price}`,
                closeResult.orderId,
            );

            this.callbacks.onEmergencyClose?.(group, reason);
        } catch (closeError) {
            // Even emergency close failed — log CRITICAL error
            const msg = closeError instanceof Error ? closeError.message : 'Unknown error';
            console.error(
                `[AOLE:${group.groupId}] ⛔ CRITICAL: Emergency close ALSO failed: ${msg}. ` +
                `MANUAL INTERVENTION REQUIRED for ${symbol} position.`
            );

            this.transition(
                group,
                'FAILED' as OrderLifecycleState,
                `CRITICAL: Emergency close failed: ${msg}. Manual intervention required.`,
                undefined,
                msg,
            );

            this.callbacks.onFailed?.(group, `CRITICAL: Both SL and emergency close failed for ${symbol}`);
        }
    }

    // ─── Internal Helpers ───────────────────────────────────

    private createGroup(config: OrderGroupConfig): OrderGroup {
        return {
            groupId: this.generateId(),
            config,
            state: 'PENDING' as OrderLifecycleState,
            stateHistory: [],
            entryOrder: null,
            slOrder: null,
            tpOrder: null,
            emergencyCloseOrder: null,
            slRetryCount: 0,
            createdAt: Date.now(),
            completedAt: null,
            executionQuality: null,
        };
    }

    private transition(
        group: OrderGroup,
        toState: OrderLifecycleState,
        reason: string,
        orderId?: number,
        error?: string,
    ): void {
        const transition: StateTransition = {
            fromState: group.state,
            toState,
            timestamp: Date.now(),
            reason,
            orderId,
            error,
        };

        group.stateHistory.push(transition);
        group.state = toState;

        console.log(
            `[AOLE:${group.groupId}] ${String(transition.fromState)} → ${String(toState)}: ${reason}`
        );

        this.callbacks.onStateChange?.(group, transition);
    }

    private validateConfig(config: OrderGroupConfig): void {
        if (!config.symbol) throw new Error('[AOLE] symbol is required');
        if (!config.side) throw new Error('[AOLE] side is required');
        if (!config.quantity || config.quantity <= 0) throw new Error('[AOLE] quantity must be positive');
        if (!config.stopLossPrice || config.stopLossPrice <= 0) throw new Error('[AOLE] stopLossPrice is MANDATORY');
        if (config.leverage > 10) throw new Error('[AOLE] leverage cannot exceed 10 (Risk Manager Rule #4)');

        if (config.entryType === 'LIMIT' && !config.entryPrice) {
            throw new Error('[AOLE] entryPrice required for LIMIT orders');
        }

        // Validate SL direction
        if (config.side === 'BUY' && config.entryPrice && config.stopLossPrice >= config.entryPrice) {
            throw new Error('[AOLE] LONG SL must be below entry price');
        }
        if (config.side === 'SELL' && config.entryPrice && config.stopLossPrice <= config.entryPrice) {
            throw new Error('[AOLE] SHORT SL must be above entry price');
        }
    }

    private generateId(): string {
        // UUID v4-like (adequate for client-side IDs)
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
