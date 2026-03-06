// ============================================================
// Learner: Backtesting Engine — Historical Strategy Simulation
// ============================================================
// The critical missing piece that transforms Learner from a
// theoretical architecture into a functional evolution system.
//
// This engine processes historical OHLCV candles and simulates
// strategy execution with realistic fills, SL/TP management,
// and equity curve tracking. It produces Trade[] records that
// feed directly into the existing evaluator and validation
// pipeline.
//
// KEY INNOVATION: Parallel Fitness Landscape Mapping (PFLM)
// Pre-computes an IndicatorCache for all candles once, then
// evaluates multiple strategies against the shared cache.
// Performance: O(N+M) instead of O(N×M).
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    StrategyDNA,
    OHLCV,
    Trade,
    TradeDirection,
    TradeStatus,
    TradeSignalAction,
    IndicatorGene,
    IndicatorType,
    PerformanceMetrics,
    MarketRegime,
} from '@/types';
import {
    evaluateStrategy,
    getRequiredCandleCount,
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollinger,
    calculateADX,
    calculateATR,
    calculateStochRSI,
    calculateVolumeMA,
} from './signal-engine';
import { evaluatePerformance, calculateFitnessScore, calculateNoveltyBonus } from './evaluator';
import { detectRegime } from './regime-detector';
import {
    ExecutionConfig,
    DEFAULT_EXECUTION_CONFIG,
    simulateExecution,
    checkStopLossAndTakeProfit,
    calculatePositionQuantity,
    calculateSLTPLevels,
} from './market-simulator';

// ─── Configuration ───────────────────────────────────────────

export interface BacktestConfig {
    initialCapital: number;           // Starting balance in USDT
    execution: ExecutionConfig;       // Execution modeling config
    maxOpenPositions: number;         // Max concurrent positions (1 for simplicity)
    warmupCandles: number;            // Candles reserved for indicator warmup
    enableRegimeTagging: boolean;     // Tag each trade with market regime
    enableEquityCurve: boolean;       // Track equity point per candle (memory cost)
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
    initialCapital: 10000,
    execution: DEFAULT_EXECUTION_CONFIG,
    maxOpenPositions: 1,
    warmupCandles: 200,               // Reserve 200 candles for indicator warmup
    enableRegimeTagging: true,
    enableEquityCurve: true,
};

// ─── Equity Curve Point ──────────────────────────────────────

export interface EquityPoint {
    timestamp: number;
    balance: number;                  // Account balance at this timestamp
    drawdown: number;                 // Current drawdown from peak (as percentage)
    openPositionPnl: number;          // Unrealized PnL of open position
}

// ─── Backtest Result ─────────────────────────────────────────

export interface BacktestResult {
    strategyId: string;
    strategyName: string;
    trades: Trade[];                  // All completed simulated trades
    equityCurve: EquityPoint[];       // Balance snapshot at each candle
    metrics: PerformanceMetrics;      // Full performance metrics
    fitnessScore: number;             // Composite fitness with complexity penalty + novelty bonus
    totalFees: number;                // Total commission + slippage cost
    candlesProcessed: number;         // Total candles evaluated
    signalsGenerated: number;         // Total entry/exit signals
    executionTimeMs: number;          // Wall-clock simulation time
    regimeBreakdown: Record<string, number> | null; // Trade count per regime
}

// ─── Indicator Cache (PFLM Innovation) ───────────────────────

/**
 * Pre-computed indicator values for an entire candle series.
 * This is the core of Parallel Fitness Landscape Mapping.
 *
 * Key insight: Most strategies share the same indicator TYPES
 * (RSI, EMA, MACD) — only the periods differ. By computing
 * each (type, period) combination once and caching the result,
 * we avoid redundant calculation across the population.
 */
export interface IndicatorCacheEntry {
    type: IndicatorType;
    period: number;
    params: Record<string, number>;   // Extra params (e.g. fastPeriod for MACD)
    values: number[];                 // Computed values aligned with candle array
    secondaryValues?: number[];       // For indicators with dual outputs (MACD signal, Bollinger bands)
    tertiaryValues?: number[];        // For triple outputs (MACD histogram)
}

export class IndicatorCache {
    private cache: Map<string, IndicatorCacheEntry> = new Map();
    private candles: OHLCV[];
    private atrValues: number[] = [];

    constructor(candles: OHLCV[]) {
        this.candles = candles;
        // Always pre-compute ATR(14) for slippage modeling
        this.atrValues = calculateATR(candles, 14);
    }

    /**
     * Generate a unique cache key for an indicator configuration.
     */
    private getCacheKey(type: IndicatorType, period: number, params: Record<string, number>): string {
        const paramStr = Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        return `${type}:${period}:${paramStr}`;
    }

    /**
     * Get or compute indicator values for a given gene configuration.
     * If this (type, period, params) was already computed, returns cached result.
     */
    getOrCompute(gene: IndicatorGene): IndicatorCacheEntry {
        const key = this.getCacheKey(gene.type, gene.period, gene.params);

        const cached = this.cache.get(key);
        if (cached) return cached;

        // Compute the indicator for the full candle series
        const entry = this.computeIndicator(gene);
        this.cache.set(key, entry);
        return entry;
    }

    /**
     * Compute a single indicator across all candles.
     */
    private computeIndicator(gene: IndicatorGene): IndicatorCacheEntry {
        const entry: IndicatorCacheEntry = {
            type: gene.type,
            period: gene.period,
            params: gene.params,
            values: [],
        };

        switch (gene.type) {
            case IndicatorType.RSI:
                entry.values = calculateRSI(this.candles, gene.period);
                break;

            case IndicatorType.EMA:
                entry.values = calculateEMA(this.candles, gene.period);
                break;

            case IndicatorType.SMA:
                entry.values = calculateSMA(this.candles, gene.period);
                break;

            case IndicatorType.MACD: {
                const fast = gene.params.fastPeriod || 12;
                const slow = gene.params.slowPeriod || 26;
                const sig = gene.params.signalPeriod || 9;
                const macd = calculateMACD(this.candles, fast, slow, sig);
                entry.values = macd.macdLine;
                entry.secondaryValues = macd.signalLine;
                entry.tertiaryValues = macd.histogram;
                break;
            }

            case IndicatorType.BOLLINGER: {
                const stdDev = gene.params.stdDev || 2;
                const bb = calculateBollinger(this.candles, gene.period, stdDev);
                entry.values = bb.middle;
                entry.secondaryValues = bb.upper;
                entry.tertiaryValues = bb.lower;
                break;
            }

            case IndicatorType.ADX:
                entry.values = calculateADX(this.candles, gene.period);
                break;

            case IndicatorType.ATR:
                entry.values = calculateATR(this.candles, gene.period);
                break;

            case IndicatorType.VOLUME:
                entry.values = calculateVolumeMA(this.candles, gene.period);
                break;

            case IndicatorType.STOCH_RSI: {
                const kPeriod = gene.params.kPeriod || 3;
                const dPeriod = gene.params.dPeriod || 3;
                const stoch = calculateStochRSI(this.candles, gene.period, gene.period, kPeriod, dPeriod);
                entry.values = stoch.k;
                entry.secondaryValues = stoch.d;
                break;
            }

            default:
                entry.values = new Array(this.candles.length).fill(0);
        }

        return entry;
    }

    /**
     * Get the pre-computed ATR values (always available).
     */
    getATRValues(): number[] {
        return this.atrValues;
    }

    /**
     * Get cache statistics for monitoring.
     */
    getStats(): { totalEntries: number; uniqueTypes: number } {
        const types = new Set<IndicatorType>();
        for (const entry of this.cache.values()) {
            types.add(entry.type);
        }
        return { totalEntries: this.cache.size, uniqueTypes: types.size };
    }
}

// ─── Open Position Tracking ──────────────────────────────────

interface SimulatedPosition {
    id: string;
    strategyId: string;
    strategyName: string;
    slotId: string;
    symbol: string;
    direction: TradeDirection;
    entryPrice: number;
    quantity: number;
    leverage: number;
    stopLoss: number;
    takeProfit: number;
    entryTime: number;
    entryReason: string;
    entryIndicators: Record<string, number>;
    entryFees: number;
}

// ─── Core Backtesting Functions ──────────────────────────────

/**
 * Run a complete backtest of a StrategyDNA against historical candle data.
 *
 * This is the core simulation loop that:
 * 1. Iterates through each candle chronologically
 * 2. Checks open positions for SL/TP hits (intra-candle)
 * 3. Evaluates entry/exit signals via the signal engine
 * 4. Simulates realistic execution (slippage + fees)
 * 5. Tracks equity curve and regime per trade
 *
 * @param dna - Strategy genome to test
 * @param candles - Historical OHLCV data (oldest first)
 * @param config - Backtest configuration
 * @param indicatorCache - Optional pre-computed indicator cache (PFLM)
 * @returns Complete backtest result
 */
export function runBacktest(
    dna: StrategyDNA,
    candles: OHLCV[],
    config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
    indicatorCache?: IndicatorCache,
): BacktestResult {
    const startTime = performance.now();

    // State
    let balance = config.initialCapital;
    let peakBalance = balance;
    let totalFees = 0;
    let signalsGenerated = 0;
    const trades: Trade[] = [];
    const equityCurve: EquityPoint[] = [];
    let openPosition: SimulatedPosition | null = null;
    const regimeBreakdown: Record<string, number> = {};

    // Determine warmup period
    const requiredCandles = getRequiredCandleCount(dna);
    const warmup = Math.max(config.warmupCandles, requiredCandles);

    if (candles.length <= warmup) {
        return createEmptyResult(dna, 0, performance.now() - startTime);
    }

    // Build or reuse indicator cache
    const cache = indicatorCache || new IndicatorCache(candles);
    const atrValues = cache.getATRValues();

    // Pre-compute indicators for this strategy's genes using cache
    for (const gene of dna.indicators) {
        cache.getOrCompute(gene);
    }

    // Extract symbol from slotId (e.g., "BTCUSDT:1h" → "BTCUSDT")
    const symbol = dna.slotId.split(':')[0] || 'UNKNOWN';

    // ═══════════════════════════════════════════════════════════
    // MAIN SIMULATION LOOP
    // ═══════════════════════════════════════════════════════════

    for (let i = warmup; i < candles.length; i++) {
        const currentCandle = candles[i];
        const candleSlice = candles.slice(0, i + 1); // All candles up to current

        // ─── Step 1: Check open position for SL/TP hits ──────
        if (openPosition) {
            const sltpResult = checkStopLossAndTakeProfit(
                openPosition.entryPrice,
                openPosition.stopLoss,
                openPosition.takeProfit,
                currentCandle,
                openPosition.direction,
            );

            if (sltpResult.hitType) {
                // Close position via SL or TP
                const exitPrice = sltpResult.hitPrice!;
                const exitExecution = simulateExecution(
                    exitPrice,
                    openPosition.quantity,
                    openPosition.leverage,
                    openPosition.direction,
                    false,  // isEntry = false
                    config.execution,
                    atrValues.slice(0, i + 1),
                );

                const exitReason = sltpResult.hitType === 'SL'
                    ? `Stop-Loss hit at ${exitPrice.toFixed(2)}`
                    : `Take-Profit hit at ${exitPrice.toFixed(2)}`;

                // Calculate PnL
                const pnlResult = calculatePnL(
                    openPosition.entryPrice,
                    exitExecution.fillPrice,
                    openPosition.quantity,
                    openPosition.leverage,
                    openPosition.direction,
                    openPosition.entryFees + exitExecution.totalCost,
                );

                const trade = createTradeRecord(
                    openPosition,
                    exitExecution.fillPrice,
                    currentCandle.timestamp,
                    exitReason,
                    pnlResult,
                    exitExecution.totalCost,
                );

                trades.push(trade);
                totalFees += exitExecution.totalCost;
                balance += pnlResult.pnlUSD;

                // Tag with regime if enabled
                if (config.enableRegimeTagging) {
                    const regime = detectSingleCandleRegime(candleSlice);
                    const regimeKey = regime || 'UNKNOWN';
                    regimeBreakdown[regimeKey] = (regimeBreakdown[regimeKey] || 0) + 1;
                }

                openPosition = null;
                signalsGenerated++;
            }
        }

        // ─── Step 2: Evaluate strategy signals ───────────────
        if (!openPosition) {
            // Only look for entries if no open position
            const signal = evaluateStrategy(dna, candleSlice, null);

            if (signal.action === TradeSignalAction.LONG || signal.action === TradeSignalAction.SHORT) {
                signalsGenerated++;

                const direction = signal.action === TradeSignalAction.LONG
                    ? TradeDirection.LONG
                    : TradeDirection.SHORT;

                // Calculate position size
                const quantity = calculatePositionQuantity(
                    balance,
                    dna.riskGenes.positionSizePercent / 100,
                    currentCandle.close,
                    dna.riskGenes.maxLeverage,
                );

                if (quantity > 0 && balance > 0) {
                    // Simulate entry execution
                    const entryExecution = simulateExecution(
                        currentCandle.close,
                        quantity,
                        dna.riskGenes.maxLeverage,
                        direction,
                        true,  // isEntry = true
                        config.execution,
                        atrValues.slice(0, i + 1),
                    );

                    // Calculate SL/TP levels
                    const { stopLoss, takeProfit } = calculateSLTPLevels(
                        entryExecution.fillPrice,
                        direction,
                        dna.riskGenes.stopLossPercent,
                        dna.riskGenes.takeProfitPercent,
                    );

                    totalFees += entryExecution.totalCost;

                    openPosition = {
                        id: uuidv4(),
                        strategyId: dna.id,
                        strategyName: dna.name,
                        slotId: dna.slotId,
                        symbol,
                        direction,
                        entryPrice: entryExecution.fillPrice,
                        quantity,
                        leverage: dna.riskGenes.maxLeverage,
                        stopLoss,
                        takeProfit,
                        entryTime: currentCandle.timestamp,
                        entryReason: signal.reason,
                        entryIndicators: signal.indicators,
                        entryFees: entryExecution.totalCost,
                    };
                }
            }
        } else {
            // Check for exit signals on open position
            const signal = evaluateStrategy(
                dna,
                candleSlice,
                openPosition.direction,
            );

            if (signal.action === TradeSignalAction.EXIT_LONG ||
                signal.action === TradeSignalAction.EXIT_SHORT) {
                signalsGenerated++;

                const exitExecution = simulateExecution(
                    currentCandle.close,
                    openPosition.quantity,
                    openPosition.leverage,
                    openPosition.direction,
                    false,
                    config.execution,
                    atrValues.slice(0, i + 1),
                );

                const pnlResult = calculatePnL(
                    openPosition.entryPrice,
                    exitExecution.fillPrice,
                    openPosition.quantity,
                    openPosition.leverage,
                    openPosition.direction,
                    openPosition.entryFees + exitExecution.totalCost,
                );

                const trade = createTradeRecord(
                    openPosition,
                    exitExecution.fillPrice,
                    currentCandle.timestamp,
                    signal.reason,
                    pnlResult,
                    exitExecution.totalCost,
                );

                trades.push(trade);
                totalFees += exitExecution.totalCost;
                balance += pnlResult.pnlUSD;

                if (config.enableRegimeTagging) {
                    const regime = detectSingleCandleRegime(candleSlice);
                    const regimeKey = regime || 'UNKNOWN';
                    regimeBreakdown[regimeKey] = (regimeBreakdown[regimeKey] || 0) + 1;
                }

                openPosition = null;
            }
        }

        // ─── Step 3: Track equity curve ──────────────────────
        if (config.enableEquityCurve) {
            const unrealizedPnl = openPosition
                ? calculateUnrealizedPnL(openPosition, currentCandle.close)
                : 0;

            const totalEquity = balance + unrealizedPnl;
            peakBalance = Math.max(peakBalance, totalEquity);
            const drawdown = peakBalance > 0
                ? ((peakBalance - totalEquity) / peakBalance) * 100
                : 0;

            equityCurve.push({
                timestamp: currentCandle.timestamp,
                balance: totalEquity,
                drawdown,
                openPositionPnl: unrealizedPnl,
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // FINALIZATION
    // ═══════════════════════════════════════════════════════════

    // Force-close any open position at last candle
    if (openPosition) {
        const lastCandle = candles[candles.length - 1];
        const exitExecution = simulateExecution(
            lastCandle.close,
            openPosition.quantity,
            openPosition.leverage,
            openPosition.direction,
            false,
            config.execution,
            atrValues,
        );

        const pnlResult = calculatePnL(
            openPosition.entryPrice,
            exitExecution.fillPrice,
            openPosition.quantity,
            openPosition.leverage,
            openPosition.direction,
            openPosition.entryFees + exitExecution.totalCost,
        );

        const trade = createTradeRecord(
            openPosition,
            exitExecution.fillPrice,
            lastCandle.timestamp,
            'Backtest ended — force close',
            pnlResult,
            exitExecution.totalCost,
        );

        trades.push(trade);
        totalFees += exitExecution.totalCost;
        balance += pnlResult.pnlUSD;
    }

    // Calculate performance metrics and fitness
    const metrics = trades.length > 0
        ? evaluatePerformance(trades)
        : createEmptyMetrics();

    const baseFitness = calculateFitnessScore(metrics, dna);
    const noveltyBonus = calculateNoveltyBonus(dna);
    const fitnessScore = Math.min(100, baseFitness + noveltyBonus);

    const executionTimeMs = performance.now() - startTime;

    return {
        strategyId: dna.id,
        strategyName: dna.name,
        trades,
        equityCurve,
        metrics,
        fitnessScore,
        totalFees,
        candlesProcessed: candles.length - warmup,
        signalsGenerated,
        executionTimeMs,
        regimeBreakdown: config.enableRegimeTagging ? regimeBreakdown : null,
    };
}

/**
 * Batch backtest multiple strategies against the same candle data.
 * Uses PFLM: builds a shared IndicatorCache once, then evaluates
 * each strategy against it.
 *
 * For a population of N strategies with M unique indicator configs:
 *   - Without PFLM: O(N × M × candleCount)
 *   - With PFLM:    O(M × candleCount + N × candleCount)
 *
 * @param strategies - Array of strategy genomes to test
 * @param candles - Historical OHLCV data
 * @param config - Backtest configuration
 * @returns Array of backtest results, sorted by fitness (descending)
 */
export function batchBacktest(
    strategies: StrategyDNA[],
    candles: OHLCV[],
    config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
): BacktestResult[] {
    // Build shared indicator cache (PFLM)
    const cache = new IndicatorCache(candles);

    // Pre-warm cache with ALL indicator genes from ALL strategies
    // This deduplicates identical (type, period, params) combinations
    for (const dna of strategies) {
        for (const gene of dna.indicators) {
            cache.getOrCompute(gene);
        }
    }

    // Run each strategy against the shared cache
    const results: BacktestResult[] = strategies.map(dna =>
        runBacktest(dna, candles, config, cache),
    );

    // Sort by fitness (descending)
    results.sort((a, b) => b.fitnessScore - a.fitnessScore);

    return results;
}

/**
 * Quick fitness evaluation via backtesting.
 * Runs a lean backtest (no equity curve, no regime tagging)
 * and returns just the fitness score.
 *
 * Used for rapid GA fitness evaluation during evolution.
 */
export function quickFitness(
    dna: StrategyDNA,
    candles: OHLCV[],
    indicatorCache?: IndicatorCache,
): number {
    const leanConfig: BacktestConfig = {
        ...DEFAULT_BACKTEST_CONFIG,
        enableEquityCurve: false,
        enableRegimeTagging: false,
    };

    const result = runBacktest(dna, candles, leanConfig, indicatorCache);
    return result.fitnessScore;
}

// ─── Helper Functions ────────────────────────────────────────

interface PnLResult {
    pnlPercent: number;
    pnlUSD: number;
}

/**
 * Calculate profit/loss for a closed position.
 */
function calculatePnL(
    entryPrice: number,
    exitPrice: number,
    quantity: number,
    leverage: number,
    direction: TradeDirection,
    totalFees: number,
): PnLResult {
    let priceDiff: number;
    if (direction === TradeDirection.LONG) {
        priceDiff = exitPrice - entryPrice;
    } else {
        priceDiff = entryPrice - exitPrice;
    }

    const grossPnlUSD = priceDiff * quantity * leverage;
    const netPnlUSD = grossPnlUSD - totalFees;
    const pnlPercent = entryPrice > 0
        ? (priceDiff / entryPrice) * 100 * leverage
        : 0;

    return {
        pnlPercent,
        pnlUSD: netPnlUSD,
    };
}

/**
 * Calculate unrealized PnL for an open position.
 */
function calculateUnrealizedPnL(position: SimulatedPosition, currentPrice: number): number {
    let priceDiff: number;
    if (position.direction === TradeDirection.LONG) {
        priceDiff = currentPrice - position.entryPrice;
    } else {
        priceDiff = position.entryPrice - currentPrice;
    }
    return priceDiff * position.quantity * position.leverage;
}

/**
 * Create a Trade record from a closed simulated position.
 */
function createTradeRecord(
    position: SimulatedPosition,
    exitPrice: number,
    exitTime: number,
    exitReason: string,
    pnl: PnLResult,
    exitFees: number,
): Trade {
    return {
        id: uuidv4(),
        strategyId: position.strategyId,
        strategyName: position.strategyName,
        slotId: position.slotId,
        symbol: position.symbol,
        direction: position.direction,
        status: TradeStatus.CLOSED,
        isPaperTrade: true,  // Backtest trades are always "paper"
        entryPrice: position.entryPrice,
        exitPrice,
        quantity: position.quantity,
        leverage: position.leverage,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        pnlPercent: pnl.pnlPercent,
        pnlUSD: pnl.pnlUSD,
        fees: position.entryFees + exitFees,
        entryTime: position.entryTime,
        exitTime,
        entryReason: position.entryReason,
        exitReason,
        indicators: position.entryIndicators,
    };
}

/**
 * Detect market regime at a single point in time.
 * Uses the last 50 candles for quick regime classification.
 */
function detectSingleCandleRegime(candles: OHLCV[]): MarketRegime | null {
    if (candles.length < 50) return null;

    try {
        const analysis = detectRegime(candles.slice(-50));
        return analysis.currentRegime;
    } catch {
        return null;
    }
}

/**
 * Create empty performance metrics.
 */
function createEmptyMetrics(): PerformanceMetrics {
    return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        maxDrawdownDuration: 0,
        averageRR: 0,
        expectancy: 0,
        totalPnlPercent: 0,
        totalPnlUSD: 0,
        averageWinPercent: 0,
        averageLossPercent: 0,
        largestWinPercent: 0,
        largestLossPercent: 0,
        consecutiveWins: 0,
        consecutiveLosses: 0,
        averageHoldTime: 0,
    };
}

/**
 * Create an empty backtest result for edge cases.
 */
function createEmptyResult(
    dna: StrategyDNA,
    candlesProcessed: number,
    executionTimeMs: number,
): BacktestResult {
    return {
        strategyId: dna.id,
        strategyName: dna.name,
        trades: [],
        equityCurve: [],
        metrics: createEmptyMetrics(),
        fitnessScore: 0,
        totalFees: 0,
        candlesProcessed,
        signalsGenerated: 0,
        executionTimeMs,
        regimeBreakdown: null,
    };
}
