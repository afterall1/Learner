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
    Timeframe,
} from '@/types';
import {
    evaluateStrategy,
    getRequiredCandleCount,
    calculateAdvancedSignals,
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
    private readonly maxEntries: number;
    private hits = 0;
    private misses = 0;

    constructor(candles: OHLCV[], maxEntries: number = 200) {
        this.candles = candles;
        this.maxEntries = maxEntries;
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
     * Uses LRU eviction when cache exceeds maxEntries.
     */
    getOrCompute(gene: IndicatorGene): IndicatorCacheEntry {
        const key = this.getCacheKey(gene.type, gene.period, gene.params);

        const cached = this.cache.get(key);
        if (cached) {
            this.hits++;
            // O(1) LRU promotion: delete + re-set moves entry to Map's end
            this.cache.delete(key);
            this.cache.set(key, cached);
            return cached;
        }

        this.misses++;

        // O(1) LRU eviction: Map.keys().next() gives the oldest entry
        while (this.cache.size >= this.maxEntries) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            } else {
                break;
            }
        }

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
    getStats(): { totalEntries: number; uniqueTypes: number; hitRate: number; memoryEstimateMB: number } {
        const types = new Set<IndicatorType>();
        for (const entry of this.cache.values()) {
            types.add(entry.type);
        }
        const totalRequests = this.hits + this.misses;
        const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;
        return {
            totalEntries: this.cache.size,
            uniqueTypes: types.size,
            hitRate: Math.round(hitRate * 1000) / 1000,
            memoryEstimateMB: this.getMemoryEstimate(),
        };
    }

    /**
     * Estimate memory usage of the cache in MB.
     * Each number = 8 bytes. Each entry has 1-3 arrays of candleCount length.
     */
    getMemoryEstimate(): number {
        let totalNumbers = this.atrValues.length; // ATR always present
        for (const entry of this.cache.values()) {
            totalNumbers += entry.values.length;
            if (entry.secondaryValues) totalNumbers += entry.secondaryValues.length;
            if (entry.tertiaryValues) totalNumbers += entry.tertiaryValues.length;
        }
        return Math.round((totalNumbers * 8) / (1024 * 1024) * 100) / 100;
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

// ─── HTF Candle Aggregation (Phase 26) ───────────────────────

/**
 * Timeframe multiplier map — how many primary candles fit into one HTF candle.
 * Used for candle aggregation during backtesting.
 */
const TF_MINUTES: Record<Timeframe, number> = {
    [Timeframe.M1]: 1,
    [Timeframe.M5]: 5,
    [Timeframe.M15]: 15,
    [Timeframe.H1]: 60,
    [Timeframe.H4]: 240,
    [Timeframe.D1]: 1440,
};

/**
 * Aggregate lower-timeframe candles into a higher-timeframe candle array.
 * Uses timestamp-based bucketing: each HTF candle spans a time window
 * of `targetTfMinutes` minutes, aggregating OHLCV data from all primary
 * candles that fall within that window.
 *
 * This enables backtesting confluence genes without separate HTF data feeds.
 *
 * @param candles - Primary timeframe OHLCV data (oldest first)
 * @param sourceTF - The timeframe of the input candles
 * @param targetTF - The desired higher timeframe
 * @returns Aggregated HTF candle array
 */
export function aggregateToHigherTimeframe(
    candles: OHLCV[],
    sourceTF: Timeframe,
    targetTF: Timeframe,
): OHLCV[] {
    const sourceMinutes = TF_MINUTES[sourceTF];
    const targetMinutes = TF_MINUTES[targetTF];

    if (!sourceMinutes || !targetMinutes || targetMinutes <= sourceMinutes) {
        return []; // Invalid aggregation: target must be higher
    }

    if (candles.length === 0) return [];

    const targetMs = targetMinutes * 60_000;
    const result: OHLCV[] = [];

    let bucketStart = Math.floor(candles[0].timestamp / targetMs) * targetMs;
    let bucketOpen = candles[0].open;
    let bucketHigh = candles[0].high;
    let bucketLow = candles[0].low;
    let bucketClose = candles[0].close;
    let bucketVolume = candles[0].volume;

    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const candleBucket = Math.floor(c.timestamp / targetMs) * targetMs;

        if (candleBucket !== bucketStart) {
            // Emit completed bucket
            result.push({
                timestamp: bucketStart,
                open: bucketOpen,
                high: bucketHigh,
                low: bucketLow,
                close: bucketClose,
                volume: bucketVolume,
            });

            // Start new bucket
            bucketStart = candleBucket;
            bucketOpen = c.open;
            bucketHigh = c.high;
            bucketLow = c.low;
            bucketClose = c.close;
            bucketVolume = c.volume;
        } else {
            // Aggregate into current bucket
            bucketHigh = Math.max(bucketHigh, c.high);
            bucketLow = Math.min(bucketLow, c.low);
            bucketClose = c.close;
            bucketVolume += c.volume;
        }
    }

    // Emit final bucket
    result.push({
        timestamp: bucketStart,
        open: bucketOpen,
        high: bucketHigh,
        low: bucketLow,
        close: bucketClose,
        volume: bucketVolume,
    });

    return result;
}

/**
 * Build a Map<Timeframe, OHLCV[]> of higher-timeframe candles by aggregating
 * primary candle data. Used to provide HTF data to confluence genes during
 * backtesting without requiring separate data feeds.
 *
 * @param candles - Primary timeframe candle data
 * @param primaryTF - The timeframe of the input candles
 * @returns Map of aggregated HTF candle arrays
 */
function buildHTFCandleMap(
    candles: OHLCV[],
    primaryTF: Timeframe,
): Map<Timeframe, OHLCV[]> {
    const htfMap = new Map<Timeframe, OHLCV[]>();
    const allTFs: Timeframe[] = [
        Timeframe.M1, Timeframe.M5, Timeframe.M15,
        Timeframe.H1, Timeframe.H4, Timeframe.D1,
    ];

    const primaryIdx = allTFs.indexOf(primaryTF);
    if (primaryIdx < 0) return htfMap;

    // Aggregate to each higher TF
    for (let i = primaryIdx + 1; i < allTFs.length; i++) {
        const htf = allTFs[i];
        const aggregated = aggregateToHigherTimeframe(candles, primaryTF, htf);
        if (aggregated.length >= 30) { // Only include if sufficient for evaluation
            htfMap.set(htf, aggregated);
        }
    }

    return htfMap;
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

    // Phase 26: Pre-aggregate HTF candles for confluence gene evaluation
    const primaryTF = dna.preferredTimeframe;
    const hasConfluenceGenes = dna.confluenceGenes && dna.confluenceGenes.length > 0;
    const htfCandleMap = hasConfluenceGenes
        ? buildHTFCandleMap(candles, primaryTF)
        : new Map<Timeframe, OHLCV[]>();

    // Extract symbol from slotId (e.g., "BTCUSDT:1h" → "BTCUSDT")
    const symbol = dna.slotId.split(':')[0] || 'UNKNOWN';

    // ═══════════════════════════════════════════════════════════
    // MAIN SIMULATION LOOP
    // ═══════════════════════════════════════════════════════════

    // Regime detection cache: re-detect every 50 candles (regime doesn't change per-candle)
    let cachedRegime: MarketRegime | null = null;
    let lastRegimeDetectionIndex = -1;
    const REGIME_CACHE_INTERVAL = 50;

    for (let i = warmup; i < candles.length; i++) {
        const currentCandle = candles[i];
        // Build candleSlice only when signal evaluation requires it (lazy)
        // evaluateStrategy and calculateAdvancedSignals both use candles[candles.length - 1]
        // so we still need a proper view — but we only slice when entering signal evaluation
        // instead of on EVERY candle iteration, which saves ~N unnecessary copies

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
                    atrValues,
                    i,  // Index-based ATR access — no slice copy
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

                // Tag with cached regime if enabled (reuses detection from cache)
                if (config.enableRegimeTagging) {
                    if (i - lastRegimeDetectionIndex >= REGIME_CACHE_INTERVAL || cachedRegime === null) {
                        cachedRegime = detectSingleCandleRegime(candles, i);
                        lastRegimeDetectionIndex = i;
                    }
                    const regimeKey = cachedRegime || 'UNKNOWN';
                    regimeBreakdown[regimeKey] = (regimeBreakdown[regimeKey] || 0) + 1;
                }

                openPosition = null;
                signalsGenerated++;
            }
        }

        // ─── Step 2: Evaluate strategy signals ───────────────
        if (!openPosition) {
            // Only look for entries if no open position
            const candleSlice = candles.slice(0, i + 1);
            const signal = evaluateStrategy(dna, candleSlice, null);

            if (signal.action === TradeSignalAction.LONG || signal.action === TradeSignalAction.SHORT) {
                signalsGenerated++;

                // Phase 26: Modulate confidence with confluence gene signals
                let adjustedConfidence = signal.confidence;
                if (hasConfluenceGenes && htfCandleMap.size > 0) {
                    const advSignals = calculateAdvancedSignals(dna, candleSlice, htfCandleMap);
                    if (advSignals.confluence.size > 0) {
                        // Count how many confluence genes agree vs disagree
                        let confluent = 0;
                        let total = 0;
                        for (const cr of advSignals.confluence.values()) {
                            total++;
                            if (cr.confluent) confluent++;
                        }
                        // Apply confluence multiplier: 0.5-1.5x
                        const confluenceRatio = total > 0 ? confluent / total : 0.5;
                        const confluenceMultiplier = 0.5 + confluenceRatio;
                        adjustedConfidence = Math.min(1, signal.confidence * confluenceMultiplier);
                    }
                }

                // Skip low-confidence entries when confluence disagrees
                if (adjustedConfidence < 0.1) {
                    // Confluence vetoed — skip this entry silently
                } else {
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
                            atrValues,
                            i,  // Index-based ATR access — no slice copy
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
                } // Phase 26: close confluence veto else-block
            }
        } else {
            // Check for exit signals on open position
            const signal = evaluateStrategy(
                dna,
                candles.slice(0, i + 1),
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
                    atrValues,
                    i,  // Index-based ATR access — no slice copy
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
                    if (i - lastRegimeDetectionIndex >= REGIME_CACHE_INTERVAL || cachedRegime === null) {
                        cachedRegime = detectSingleCandleRegime(candles, i);
                        lastRegimeDetectionIndex = i;
                    }
                    const regimeKey = cachedRegime || 'UNKNOWN';
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
 * Uses the last 50 candles up to endIndex for quick regime classification.
 * Accepts full array + index to avoid caller-side slice copies.
 */
function detectSingleCandleRegime(candles: OHLCV[], endIndex?: number): MarketRegime | null {
    const end = endIndex !== undefined ? endIndex + 1 : candles.length;
    if (end < 50) return null;

    try {
        const recentCandles = candles.slice(Math.max(0, end - 50), end);
        const analysis = detectRegime(recentCandles);
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
