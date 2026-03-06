// ============================================================
// Learner: Signal Engine — StrategyDNA → Live Trade Signals
// ============================================================
// The brain-to-muscle connection. Takes a StrategyDNA genome and
// evaluates its indicator genes + signal rules against live OHLCV
// data to produce actionable LONG/SHORT/HOLD decisions.
//
// This is the critical missing piece that transforms the GA from
// a theoretical optimizer into a live trading decision maker.
// ============================================================

import {
    StrategyDNA,
    OHLCV,
    IndicatorType,
    IndicatorGene,
    SignalRule,
    SignalCondition,
    TradeSignal,
    TradeSignalAction,
    SignalResult,
    TradeDirection,
} from '@/types';

// ─── Indicator Calculation Functions ─────────────────────────

/**
 * Calculate Simple Moving Average (SMA).
 * SMA = sum(close[i]..close[i+period]) / period
 */
export function calculateSMA(candles: OHLCV[], period: number): number[] {
    const result: number[] = [];
    if (candles.length < period) return result;

    for (let i = period - 1; i < candles.length; i++) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) {
            sum += candles[j].close;
        }
        result.push(sum / period);
    }
    return result;
}

/**
 * Calculate Exponential Moving Average (EMA).
 * EMA = close * multiplier + prevEMA * (1 - multiplier)
 * multiplier = 2 / (period + 1)
 */
export function calculateEMA(candles: OHLCV[], period: number): number[] {
    const result: number[] = [];
    if (candles.length < period) return result;

    const multiplier = 2 / (period + 1);

    // Seed with SMA of first 'period' candles
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[i].close;
    }
    let ema = sum / period;
    result.push(ema);

    for (let i = period; i < candles.length; i++) {
        ema = (candles[i].close - ema) * multiplier + ema;
        result.push(ema);
    }
    return result;
}

/**
 * Calculate Relative Strength Index (RSI).
 * RSI = 100 - (100 / (1 + RS))
 * RS = avgGain / avgLoss (Wilder's smoothing)
 */
export function calculateRSI(candles: OHLCV[], period: number): number[] {
    const result: number[] = [];
    if (candles.length < period + 1) return result;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // Initial average gain/loss (simple average of first 'period' values)
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 0; i < period; i++) {
        avgGain += gains[i];
        avgLoss += losses[i];
    }
    avgGain /= period;
    avgLoss /= period;

    // First RSI value
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - (100 / (1 + rs)));

    // Subsequent RSI values using Wilder's smoothing
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        const smoothedRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + smoothedRS)));
    }
    return result;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence).
 * MACD Line = EMA(fast) - EMA(slow)
 * Signal Line = EMA(MACD Line, signal period)
 * Histogram = MACD Line - Signal Line
 */
export function calculateMACD(
    candles: OHLCV[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
    const fastEMA = calculateEMA(candles, fastPeriod);
    const slowEMA = calculateEMA(candles, slowPeriod);

    // Align fast and slow EMA (fast starts at index fastPeriod-1, slow at slowPeriod-1)
    const offset = slowPeriod - fastPeriod;
    const macdLine: number[] = [];

    for (let i = 0; i < slowEMA.length; i++) {
        macdLine.push(fastEMA[i + offset] - slowEMA[i]);
    }

    if (macdLine.length < signalPeriod) {
        return { macdLine, signalLine: [], histogram: [] };
    }

    // Calculate signal line as EMA of MACD line
    const signalMultiplier = 2 / (signalPeriod + 1);
    let signalSum = 0;
    for (let i = 0; i < signalPeriod; i++) {
        signalSum += macdLine[i];
    }
    let signalEMA = signalSum / signalPeriod;
    const signalLine: number[] = [signalEMA];

    for (let i = signalPeriod; i < macdLine.length; i++) {
        signalEMA = (macdLine[i] - signalEMA) * signalMultiplier + signalEMA;
        signalLine.push(signalEMA);
    }

    // Histogram: MACD - Signal (aligned)
    const histogram: number[] = [];
    const signalOffset = signalPeriod - 1;
    for (let i = 0; i < signalLine.length; i++) {
        histogram.push(macdLine[i + signalOffset] - signalLine[i]);
    }

    return { macdLine, signalLine, histogram };
}

/**
 * Calculate Bollinger Bands.
 * Middle = SMA(period)
 * Upper = Middle + stdDev * multiplier
 * Lower = Middle - stdDev * multiplier
 */
export function calculateBollinger(
    candles: OHLCV[],
    period: number = 20,
    stdDevMultiplier: number = 2,
): { upper: number[]; middle: number[]; lower: number[] } {
    const middle = calculateSMA(candles, period);
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < middle.length; i++) {
        const startIdx = i; // i is the index within result, map back to candles
        let sumSqDiff = 0;
        for (let j = startIdx; j < startIdx + period; j++) {
            const diff = candles[j].close - middle[i];
            sumSqDiff += diff * diff;
        }
        const stdDev = Math.sqrt(sumSqDiff / period);
        upper.push(middle[i] + stdDev * stdDevMultiplier);
        lower.push(middle[i] - stdDev * stdDevMultiplier);
    }

    return { upper, middle, lower };
}

/**
 * Calculate Average Directional Index (ADX).
 * Uses Wilder's smoothing for +DI, -DI, and DX components.
 */
export function calculateADX(candles: OHLCV[], period: number = 14): number[] {
    const result: number[] = [];
    if (candles.length < period * 2 + 1) return result;

    // Calculate True Range, +DM, -DM
    const tr: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;
        const prevHigh = candles[i - 1].high;
        const prevLow = candles[i - 1].low;

        // True Range
        tr.push(Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose),
        ));

        // Directional Movement
        const upMove = high - prevHigh;
        const downMove = prevLow - low;

        plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Wilder's smoothing for first period values
    let smoothedTR = 0;
    let smoothedPlusDM = 0;
    let smoothedMinusDM = 0;

    for (let i = 0; i < period; i++) {
        smoothedTR += tr[i];
        smoothedPlusDM += plusDM[i];
        smoothedMinusDM += minusDM[i];
    }

    const dx: number[] = [];

    // Calculate DI and DX values
    const calcDX = (): number => {
        const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
        const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
        const diSum = plusDI + minusDI;
        return diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    };

    dx.push(calcDX());

    // Continue Wilder's smoothing
    for (let i = period; i < tr.length; i++) {
        smoothedTR = smoothedTR - (smoothedTR / period) + tr[i];
        smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
        smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
        dx.push(calcDX());
    }

    // ADX = Wilder's MA of DX
    if (dx.length < period) return result;

    let adxSum = 0;
    for (let i = 0; i < period; i++) {
        adxSum += dx[i];
    }
    let adx = adxSum / period;
    result.push(adx);

    for (let i = period; i < dx.length; i++) {
        adx = ((adx * (period - 1)) + dx[i]) / period;
        result.push(adx);
    }

    return result;
}

/**
 * Calculate Average True Range (ATR).
 * ATR = Wilder's smoothed average of True Range values.
 */
export function calculateATR(candles: OHLCV[], period: number = 14): number[] {
    const result: number[] = [];
    if (candles.length < period + 1) return result;

    // Calculate True Range
    const tr: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;
        tr.push(Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose),
        ));
    }

    // First ATR = simple average
    let atr = 0;
    for (let i = 0; i < period; i++) {
        atr += tr[i];
    }
    atr /= period;
    result.push(atr);

    // Subsequent ATR values using Wilder's smoothing
    for (let i = period; i < tr.length; i++) {
        atr = ((atr * (period - 1)) + tr[i]) / period;
        result.push(atr);
    }

    return result;
}

/**
 * Calculate Stochastic RSI.
 * StochRSI = (RSI - lowest RSI) / (highest RSI - lowest RSI)
 * %K = SMA(StochRSI, kPeriod)
 * %D = SMA(%K, dPeriod)
 */
export function calculateStochRSI(
    candles: OHLCV[],
    rsiPeriod: number = 14,
    stochPeriod: number = 14,
    kPeriod: number = 3,
    dPeriod: number = 3,
): { k: number[]; d: number[] } {
    const rsiValues = calculateRSI(candles, rsiPeriod);
    if (rsiValues.length < stochPeriod) return { k: [], d: [] };

    // Calculate raw Stochastic RSI
    const stochRSI: number[] = [];
    for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
        let lowest = Infinity;
        let highest = -Infinity;
        for (let j = i - stochPeriod + 1; j <= i; j++) {
            lowest = Math.min(lowest, rsiValues[j]);
            highest = Math.max(highest, rsiValues[j]);
        }
        const range = highest - lowest;
        stochRSI.push(range > 0 ? ((rsiValues[i] - lowest) / range) * 100 : 50);
    }

    // %K = SMA of StochRSI
    const k: number[] = [];
    if (stochRSI.length >= kPeriod) {
        for (let i = kPeriod - 1; i < stochRSI.length; i++) {
            let sum = 0;
            for (let j = i - kPeriod + 1; j <= i; j++) {
                sum += stochRSI[j];
            }
            k.push(sum / kPeriod);
        }
    }

    // %D = SMA of %K
    const d: number[] = [];
    if (k.length >= dPeriod) {
        for (let i = dPeriod - 1; i < k.length; i++) {
            let sum = 0;
            for (let j = i - dPeriod + 1; j <= i; j++) {
                sum += k[j];
            }
            d.push(sum / dPeriod);
        }
    }

    return { k, d };
}

/**
 * Calculate Volume Moving Average.
 */
export function calculateVolumeMA(candles: OHLCV[], period: number): number[] {
    const result: number[] = [];
    if (candles.length < period) return result;

    for (let i = period - 1; i < candles.length; i++) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) {
            sum += candles[j].volume;
        }
        result.push(sum / period);
    }
    return result;
}

// ─── Indicator Value Calculator ──────────────────────────────
// Maps IndicatorGene → calculated values for the most recent candle

export interface IndicatorCalculationResult {
    indicatorId: string;
    type: IndicatorType;
    currentValue: number;
    previousValue: number;  // For cross detection
    allValues: number[];    // Full series for advanced analysis
}

/**
 * Calculate all indicator values for a strategy's indicator genes.
 * Returns the current and previous values needed for signal evaluation.
 */
export function calculateIndicators(
    genes: IndicatorGene[],
    candles: OHLCV[],
): Map<string, IndicatorCalculationResult> {
    const results = new Map<string, IndicatorCalculationResult>();

    for (const gene of genes) {
        let values: number[] = [];
        const period = gene.period;

        switch (gene.type) {
            case IndicatorType.RSI:
                values = calculateRSI(candles, period);
                break;

            case IndicatorType.EMA:
                values = calculateEMA(candles, period);
                break;

            case IndicatorType.SMA:
                values = calculateSMA(candles, period);
                break;

            case IndicatorType.MACD: {
                const fast = gene.params.fastPeriod ?? 12;
                const slow = gene.params.slowPeriod ?? 26;
                const signal = gene.params.signalPeriod ?? 9;
                const macd = calculateMACD(candles, fast, slow, signal);
                // Use histogram as the primary MACD value for signal evaluation
                values = macd.histogram;
                break;
            }

            case IndicatorType.BOLLINGER: {
                const stdDev = gene.params.stdDev ?? 2;
                const bollinger = calculateBollinger(candles, period, stdDev);
                // Use %B = (price - lower) / (upper - lower) for signal evaluation
                values = [];
                for (let i = 0; i < bollinger.middle.length; i++) {
                    const range = bollinger.upper[i] - bollinger.lower[i];
                    if (range > 0) {
                        const candleIdx = i + period - 1;
                        values.push(((candles[candleIdx].close - bollinger.lower[i]) / range) * 100);
                    } else {
                        values.push(50);
                    }
                }
                break;
            }

            case IndicatorType.ADX:
                values = calculateADX(candles, period);
                break;

            case IndicatorType.ATR:
                values = calculateATR(candles, period);
                break;

            case IndicatorType.STOCH_RSI: {
                const kPeriod = gene.params.kPeriod ?? 3;
                const dPeriod = gene.params.dPeriod ?? 3;
                const stoch = calculateStochRSI(candles, period, period, kPeriod, dPeriod);
                // Use %K line as primary value
                values = stoch.k;
                break;
            }

            case IndicatorType.VOLUME: {
                const volumeMA = calculateVolumeMA(candles, period);
                // Volume ratio: current volume / average volume
                values = [];
                for (let i = 0; i < volumeMA.length; i++) {
                    const candleIdx = i + period - 1;
                    values.push(volumeMA[i] > 0 ? (candles[candleIdx].volume / volumeMA[i]) * 100 : 100);
                }
                break;
            }
        }

        if (values.length >= 2) {
            results.set(gene.id, {
                indicatorId: gene.id,
                type: gene.type,
                currentValue: values[values.length - 1],
                previousValue: values[values.length - 2],
                allValues: values,
            });
        } else if (values.length === 1) {
            results.set(gene.id, {
                indicatorId: gene.id,
                type: gene.type,
                currentValue: values[0],
                previousValue: values[0],
                allValues: values,
            });
        }
    }

    return results;
}

// ─── Signal Rule Evaluator ───────────────────────────────────

/**
 * Evaluate a single signal rule against calculated indicator values.
 */
export function evaluateSignalRule(
    rule: SignalRule,
    indicators: Map<string, IndicatorCalculationResult>,
): boolean {
    const indicator = indicators.get(rule.indicatorId);
    if (!indicator) return false;

    const current = indicator.currentValue;
    const previous = indicator.previousValue;
    const threshold = rule.threshold;

    switch (rule.condition) {
        case SignalCondition.ABOVE:
            return current > threshold;

        case SignalCondition.BELOW:
            return current < threshold;

        case SignalCondition.CROSS_ABOVE:
            // Previous was below threshold, current is above
            return previous <= threshold && current > threshold;

        case SignalCondition.CROSS_BELOW:
            // Previous was above threshold, current is below
            return previous >= threshold && current < threshold;

        case SignalCondition.BETWEEN:
            return current >= threshold && current <= (rule.secondaryThreshold ?? threshold);

        case SignalCondition.INCREASING:
            return current > previous;

        case SignalCondition.DECREASING:
            return current < previous;

        default:
            return false;
    }
}

/**
 * Evaluate a set of entry signal rules (AND logic — all must trigger).
 */
export function evaluateEntrySignals(
    rules: SignalRule[],
    indicators: Map<string, IndicatorCalculationResult>,
): SignalResult {
    if (rules.length === 0) {
        return { triggered: false, confidence: 0, indicatorValues: {} };
    }

    let triggeredCount = 0;
    const indicatorValues: Record<string, number> = {};

    for (const rule of rules) {
        const triggered = evaluateSignalRule(rule, indicators);
        if (triggered) triggeredCount++;

        const indicator = indicators.get(rule.indicatorId);
        if (indicator) {
            indicatorValues[`${indicator.type}_${indicator.indicatorId}`] = indicator.currentValue;
        }
    }

    const allTriggered = triggeredCount === rules.length;
    const confidence = rules.length > 0 ? triggeredCount / rules.length : 0;

    return {
        triggered: allTriggered,
        confidence,
        indicatorValues,
    };
}

/**
 * Evaluate a set of exit signal rules (OR logic — any can trigger exit).
 */
export function evaluateExitSignals(
    rules: SignalRule[],
    indicators: Map<string, IndicatorCalculationResult>,
): SignalResult {
    if (rules.length === 0) {
        return { triggered: false, confidence: 0, indicatorValues: {} };
    }

    let triggeredCount = 0;
    const indicatorValues: Record<string, number> = {};

    for (const rule of rules) {
        const triggered = evaluateSignalRule(rule, indicators);
        if (triggered) triggeredCount++;

        const indicator = indicators.get(rule.indicatorId);
        if (indicator) {
            indicatorValues[`${indicator.type}_${indicator.indicatorId}`] = indicator.currentValue;
        }
    }

    const anyTriggered = triggeredCount > 0;
    const confidence = rules.length > 0 ? triggeredCount / rules.length : 0;

    return {
        triggered: anyTriggered,
        confidence,
        indicatorValues,
    };
}

// ─── Main Signal Engine ──────────────────────────────────────

/**
 * Determine the minimum number of candles required to evaluate
 * all indicators in a strategy's DNA.
 */
export function getRequiredCandleCount(dna: StrategyDNA): number {
    let maxPeriod = 0;

    for (const gene of dna.indicators) {
        let effectivePeriod = gene.period;

        // Some indicators require more history than just their period
        switch (gene.type) {
            case IndicatorType.MACD: {
                const slow = gene.params.slowPeriod ?? 26;
                const signal = gene.params.signalPeriod ?? 9;
                effectivePeriod = slow + signal;
                break;
            }
            case IndicatorType.ADX:
                effectivePeriod = gene.period * 2 + 1;
                break;
            case IndicatorType.STOCH_RSI:
                effectivePeriod = gene.period * 2 + (gene.params.kPeriod ?? 3) + (gene.params.dPeriod ?? 3);
                break;
            default:
                effectivePeriod = gene.period;
        }

        maxPeriod = Math.max(maxPeriod, effectivePeriod);
    }

    // Add buffer of 10 candles for stable calculations
    return maxPeriod + 10;
}

/**
 * Generate a trade signal by evaluating a StrategyDNA against market data.
 *
 * This is the core function that transforms evolved genomes into trading decisions.
 *
 * @param dna - The strategy genome to evaluate
 * @param candles - Historical OHLCV candle data (newest last)
 * @param currentDirection - Current open position direction (null if no position)
 * @returns TradeSignal with action, confidence, and reasoning
 */
export function evaluateStrategy(
    dna: StrategyDNA,
    candles: OHLCV[],
    currentDirection: TradeDirection | null = null,
): TradeSignal {
    const timestamp = Date.now();
    const baseSignal: Omit<TradeSignal, 'action' | 'confidence' | 'reason' | 'indicators'> = {
        strategyId: dna.id,
        slotId: dna.slotId,
        timestamp,
    };

    // Guard: insufficient data
    const requiredCandles = getRequiredCandleCount(dna);
    if (candles.length < requiredCandles) {
        return {
            ...baseSignal,
            action: TradeSignalAction.HOLD,
            confidence: 0,
            reason: `Insufficient candle data: ${candles.length}/${requiredCandles} required`,
            indicators: {},
        };
    }

    // Step 1: Calculate all indicator values
    const indicators = calculateIndicators(dna.indicators, candles);

    // Guard: not enough indicators calculated
    if (indicators.size === 0) {
        return {
            ...baseSignal,
            action: TradeSignalAction.HOLD,
            confidence: 0,
            reason: 'No indicators could be calculated from available data',
            indicators: {},
        };
    }

    // Collect all indicator values for the signal snapshot
    const indicatorSnapshot: Record<string, number> = {};
    for (const [id, calc] of indicators.entries()) {
        indicatorSnapshot[id] = calc.currentValue;
    }

    // Step 2: Check EXIT signals first (if we have an open position)
    if (currentDirection !== null) {
        const exitResult = evaluateExitSignals(
            dna.exitRules.exitSignals,
            indicators,
        );

        if (exitResult.triggered) {
            const exitAction = currentDirection === TradeDirection.LONG
                ? TradeSignalAction.EXIT_LONG
                : TradeSignalAction.EXIT_SHORT;

            const exitReasons: string[] = [];
            for (const rule of dna.exitRules.exitSignals) {
                if (evaluateSignalRule(rule, indicators)) {
                    const ind = indicators.get(rule.indicatorId);
                    if (ind) {
                        exitReasons.push(
                            `${ind.type} ${rule.condition} ${rule.threshold.toFixed(2)} (value: ${ind.currentValue.toFixed(4)})`,
                        );
                    }
                }
            }

            return {
                ...baseSignal,
                action: exitAction,
                confidence: exitResult.confidence,
                reason: `Exit triggered: ${exitReasons.join(', ')}`,
                indicators: { ...indicatorSnapshot, ...exitResult.indicatorValues },
            };
        }
    }

    // Step 3: Evaluate ENTRY signals (only if no position or strategy allows adding)
    if (currentDirection === null) {
        const entryResult = evaluateEntrySignals(
            dna.entryRules.entrySignals,
            indicators,
        );

        if (entryResult.triggered) {
            // Determine direction from strategy bias or indicator analysis
            const direction = determineDirection(dna, indicators);
            const action = direction === TradeDirection.LONG
                ? TradeSignalAction.LONG
                : TradeSignalAction.SHORT;

            const entryReasons: string[] = [];
            for (const rule of dna.entryRules.entrySignals) {
                const ind = indicators.get(rule.indicatorId);
                if (ind) {
                    entryReasons.push(
                        `${ind.type} ${rule.condition} ${rule.threshold.toFixed(2)} (value: ${ind.currentValue.toFixed(4)})`,
                    );
                }
            }

            return {
                ...baseSignal,
                action,
                confidence: entryResult.confidence,
                reason: `Entry: ${direction} — ${entryReasons.join(', ')}`,
                indicators: { ...indicatorSnapshot, ...entryResult.indicatorValues },
            };
        }
    }

    // Step 4: No signal triggered — HOLD
    return {
        ...baseSignal,
        action: TradeSignalAction.HOLD,
        confidence: 0,
        reason: 'No entry or exit conditions met',
        indicators: indicatorSnapshot,
    };
}

// ─── Direction Determination ─────────────────────────────────

/**
 * Determine trade direction based on strategy bias and market indicators.
 * If the strategy has a directionBias, use that.
 * Otherwise, use trend indicators to determine direction.
 */
function determineDirection(
    dna: StrategyDNA,
    indicators: Map<string, IndicatorCalculationResult>,
): TradeDirection {
    // If strategy has a fixed bias, use it
    if (dna.directionBias !== null) {
        return dna.directionBias;
    }

    // Otherwise, analyze indicators for trend direction
    let bullishScore = 0;
    let bearishScore = 0;

    for (const [, calc] of indicators.entries()) {
        switch (calc.type) {
            case IndicatorType.RSI:
                if (calc.currentValue > 50) bullishScore++;
                else bearishScore++;
                break;

            case IndicatorType.MACD:
                // Positive histogram = bullish
                if (calc.currentValue > 0) bullishScore++;
                else bearishScore++;
                break;

            case IndicatorType.EMA:
            case IndicatorType.SMA:
                // Price above MA = bullish
                if (calc.currentValue > 0 && calc.currentValue < calc.previousValue) bearishScore++;
                else if (calc.currentValue > calc.previousValue) bullishScore++;
                break;

            case IndicatorType.STOCH_RSI:
                if (calc.currentValue > 50) bullishScore++;
                else bearishScore++;
                break;

            case IndicatorType.BOLLINGER:
                // %B > 50 = above middle band = bullish
                if (calc.currentValue > 50) bullishScore++;
                else bearishScore++;
                break;

            default:
                break;
        }
    }

    return bullishScore >= bearishScore ? TradeDirection.LONG : TradeDirection.SHORT;
}
