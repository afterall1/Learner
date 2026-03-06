// ============================================================
// Learner: Price Action Genes — Candlestick Patterns & Structure
// ============================================================
// Phase 9: Advanced gene type for price action pattern recognition.
// Unlike hardcoded pattern libraries, ALL detection thresholds are
// evolvable parameters — the GA discovers what "engulfing" means
// for each specific market, rather than using textbook definitions.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    OHLCV,
    PriceActionGene,
    PriceActionPatternType,
    CandlestickFormation,
} from '@/types';

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

const ALL_PA_TYPES: PriceActionPatternType[] = [
    PriceActionPatternType.CANDLESTICK_PATTERN,
    PriceActionPatternType.STRUCTURAL_BREAK,
    PriceActionPatternType.SWING_SEQUENCE,
    PriceActionPatternType.COMPRESSION,
    PriceActionPatternType.GAP_ANALYSIS,
];

const ALL_FORMATIONS: CandlestickFormation[] = [
    CandlestickFormation.ENGULFING,
    CandlestickFormation.DOJI,
    CandlestickFormation.HAMMER,
    CandlestickFormation.SHOOTING_STAR,
    CandlestickFormation.MORNING_STAR,
    CandlestickFormation.EVENING_STAR,
    CandlestickFormation.THREE_SOLDIERS,
    CandlestickFormation.THREE_CROWS,
    CandlestickFormation.PINBAR,
    CandlestickFormation.INSIDE_BAR,
];

// ─── Gene Generator ──────────────────────────────────────────

export function generateRandomPriceActionGene(type?: PriceActionPatternType): PriceActionGene {
    const geneType = type ?? randomPick(ALL_PA_TYPES);

    const base: PriceActionGene = {
        id: uuidv4(),
        type: geneType,
        params: {},
    };

    switch (geneType) {
        case PriceActionPatternType.CANDLESTICK_PATTERN:
            base.params = {
                formation: randomPick(ALL_FORMATIONS),
                bodyRatioMin: Math.round(randomFloat(0.05, 0.6) * 100) / 100,
                wickRatioMin: Math.round(randomFloat(0.1, 0.7) * 100) / 100,
                confirmationBars: randomInt(0, 3),
            };
            break;

        case PriceActionPatternType.STRUCTURAL_BREAK:
            base.params = {
                breakLookback: randomInt(5, 50),
                breakDirection: randomPick(['bullish', 'bearish', 'both'] as const),
                retestRequired: Math.random() > 0.5,
            };
            break;

        case PriceActionPatternType.SWING_SEQUENCE:
            base.params = {
                swingLookback: randomInt(3, 20),
                sequenceLength: randomInt(2, 5),
                minSwingPercent: Math.round(randomFloat(0.1, 2.0) * 100) / 100,
            };
            break;

        case PriceActionPatternType.COMPRESSION:
            base.params = {
                compressionBars: randomInt(3, 20),
                compressionRatio: Math.round(randomFloat(0.3, 0.8) * 100) / 100,
                breakoutMultiplier: Math.round(randomFloat(1.2, 3.0) * 100) / 100,
            };
            break;

        case PriceActionPatternType.GAP_ANALYSIS:
            base.params = {
                gapMinATR: Math.round(randomFloat(0.3, 2.0) * 100) / 100,
                gapDirection: randomPick(['up', 'down', 'both'] as const),
                fillExpected: Math.random() > 0.5,
            };
            break;
    }

    return base;
}

// ─── Price Action Calculation Engine ─────────────────────────

export interface PriceActionResult {
    geneId: string;
    type: PriceActionPatternType;
    currentValue: number;      // 0-100 signal value
    previousValue: number;     // Previous bar value
    detected: boolean;         // Pattern detected
    direction: 'bullish' | 'bearish' | 'neutral';
    patternDescription: string; // Human-readable description
}

export function calculatePriceActionSignals(
    genes: PriceActionGene[],
    candles: OHLCV[],
): Map<string, PriceActionResult> {
    const results = new Map<string, PriceActionResult>();

    for (const gene of genes) {
        if (candles.length < 5) continue;

        const result = calculateSinglePriceAction(gene, candles);
        if (result) {
            results.set(gene.id, result);
        }
    }

    return results;
}

function calculateSinglePriceAction(
    gene: PriceActionGene,
    candles: OHLCV[],
): PriceActionResult | null {
    switch (gene.type) {
        case PriceActionPatternType.CANDLESTICK_PATTERN:
            return detectCandlestickPattern(gene, candles);
        case PriceActionPatternType.STRUCTURAL_BREAK:
            return detectStructuralBreak(gene, candles);
        case PriceActionPatternType.SWING_SEQUENCE:
            return analyzeSwingSequence(gene, candles);
        case PriceActionPatternType.COMPRESSION:
            return detectCompression(gene, candles);
        case PriceActionPatternType.GAP_ANALYSIS:
            return analyzeGaps(gene, candles);
        default:
            return null;
    }
}

// ─── Candlestick Pattern Detection ────────────────────────────
// Thresholds are EVOLVABLE — the GA discovers market-specific definitions

function detectCandlestickPattern(gene: PriceActionGene, candles: OHLCV[]): PriceActionResult {
    const formation = gene.params.formation ?? CandlestickFormation.ENGULFING;
    const bodyRatioMin = gene.params.bodyRatioMin ?? 0.3;
    const wickRatioMin = gene.params.wickRatioMin ?? 0.3;

    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const prevPrev = candles.length >= 3 ? candles[candles.length - 3] : prev;

    const cRange = current.high - current.low;
    const cBody = Math.abs(current.close - current.open);
    const cBodyRatio = cRange > 0 ? cBody / cRange : 0;
    const isBullish = current.close > current.open;

    const pRange = prev.high - prev.low;
    const pBody = Math.abs(prev.close - prev.open);
    const pBullish = prev.close > prev.open;

    let detected = false;
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let description = '';

    switch (formation) {
        case CandlestickFormation.ENGULFING:
            detected = cBody > pBody * (1 + bodyRatioMin) && isBullish !== pBullish;
            direction = isBullish ? 'bullish' : 'bearish';
            description = `${direction} engulfing (body ratio: ${cBodyRatio.toFixed(2)})`;
            break;

        case CandlestickFormation.DOJI:
            detected = cBodyRatio < bodyRatioMin;
            direction = 'neutral';
            description = `Doji (body ratio: ${cBodyRatio.toFixed(2)})`;
            break;

        case CandlestickFormation.HAMMER: {
            const lowerWick = Math.min(current.open, current.close) - current.low;
            const lowerWickRatio = cRange > 0 ? lowerWick / cRange : 0;
            detected = lowerWickRatio >= wickRatioMin && cBodyRatio <= (1 - bodyRatioMin);
            direction = 'bullish';
            description = `Hammer (lower wick: ${lowerWickRatio.toFixed(2)})`;
            break;
        }

        case CandlestickFormation.SHOOTING_STAR: {
            const upperWick = current.high - Math.max(current.open, current.close);
            const upperWickRatio = cRange > 0 ? upperWick / cRange : 0;
            detected = upperWickRatio >= wickRatioMin && cBodyRatio <= (1 - bodyRatioMin);
            direction = 'bearish';
            description = `Shooting Star (upper wick: ${upperWickRatio.toFixed(2)})`;
            break;
        }

        case CandlestickFormation.PINBAR: {
            const upperW = current.high - Math.max(current.open, current.close);
            const lowerW = Math.min(current.open, current.close) - current.low;
            const maxWick = Math.max(upperW, lowerW);
            const maxWickRatio = cRange > 0 ? maxWick / cRange : 0;
            detected = maxWickRatio >= wickRatioMin && cBodyRatio <= bodyRatioMin;
            direction = upperW > lowerW ? 'bearish' : 'bullish';
            description = `Pinbar (wick: ${maxWickRatio.toFixed(2)}, ${direction})`;
            break;
        }

        case CandlestickFormation.INSIDE_BAR:
            detected = current.high <= prev.high && current.low >= prev.low;
            direction = 'neutral';
            description = 'Inside Bar — consolidation';
            break;

        case CandlestickFormation.THREE_SOLDIERS: {
            if (candles.length < 3) break;
            const c1 = prevPrev, c2 = prev, c3 = current;
            const allBullish = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
            const eachHigher = c2.close > c1.close && c3.close > c2.close;
            const bodyRatioOk = cBodyRatio >= bodyRatioMin;
            detected = allBullish && eachHigher && bodyRatioOk;
            direction = 'bullish';
            description = 'Three White Soldiers';
            break;
        }

        case CandlestickFormation.THREE_CROWS: {
            if (candles.length < 3) break;
            const c1 = prevPrev, c2 = prev, c3 = current;
            const allBearish = c1.close < c1.open && c2.close < c2.open && c3.close < c3.open;
            const eachLower = c2.close < c1.close && c3.close < c2.close;
            const bodyOk = cBodyRatio >= bodyRatioMin;
            detected = allBearish && eachLower && bodyOk;
            direction = 'bearish';
            description = 'Three Black Crows';
            break;
        }

        case CandlestickFormation.MORNING_STAR: {
            if (candles.length < 3) break;
            const bearishFirst = prevPrev.close < prevPrev.open;
            const smallMiddle = pRange > 0 ? pBody / pRange < bodyRatioMin : false;
            const bullishLast = isBullish && cBodyRatio >= bodyRatioMin;
            detected = bearishFirst && smallMiddle && bullishLast;
            direction = 'bullish';
            description = 'Morning Star';
            break;
        }

        case CandlestickFormation.EVENING_STAR: {
            if (candles.length < 3) break;
            const bullishFirst = prevPrev.close > prevPrev.open;
            const smallMid = pRange > 0 ? pBody / pRange < bodyRatioMin : false;
            const bearishLast = !isBullish && cBodyRatio >= bodyRatioMin;
            detected = bullishFirst && smallMid && bearishLast;
            direction = 'bearish';
            description = 'Evening Star';
            break;
        }
    }

    const signalValue = detected ? (direction === 'bullish' ? 80 : direction === 'bearish' ? 20 : 50) : 50;

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: signalValue,
        previousValue: 50,
        detected,
        direction,
        patternDescription: description || formation,
    };
}

// ─── Structural Break Detection ──────────────────────────────

function detectStructuralBreak(gene: PriceActionGene, candles: OHLCV[]): PriceActionResult {
    const lookback = gene.params.breakLookback ?? 20;
    const breakDir = gene.params.breakDirection ?? 'both';

    if (candles.length < lookback + 1) {
        return createEmptyPAResult(gene);
    }

    const lookbackCandles = candles.slice(-(lookback + 1), -1);
    const current = candles[candles.length - 1];

    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (const c of lookbackCandles) {
        highestHigh = Math.max(highestHigh, c.high);
        lowestLow = Math.min(lowestLow, c.low);
    }

    const bullishBreak = current.close > highestHigh && (breakDir === 'bullish' || breakDir === 'both');
    const bearishBreak = current.close < lowestLow && (breakDir === 'bearish' || breakDir === 'both');
    const detected = bullishBreak || bearishBreak;
    const direction: 'bullish' | 'bearish' | 'neutral' = bullishBreak ? 'bullish' : bearishBreak ? 'bearish' : 'neutral';

    const range = highestHigh - lowestLow;
    let signalValue = 50;
    if (bullishBreak && range > 0) {
        signalValue = clamp(70 + ((current.close - highestHigh) / range) * 30, 70, 100);
    } else if (bearishBreak && range > 0) {
        signalValue = clamp(30 - ((lowestLow - current.close) / range) * 30, 0, 30);
    }

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: Math.round(signalValue * 100) / 100,
        previousValue: 50,
        detected,
        direction,
        patternDescription: detected ? `${lookback}-bar ${direction} break` : 'No break',
    };
}

// ─── Swing Sequence Analysis ─────────────────────────────────

function analyzeSwingSequence(gene: PriceActionGene, candles: OHLCV[]): PriceActionResult {
    const lookback = gene.params.swingLookback ?? 5;
    const seqLength = gene.params.sequenceLength ?? 3;
    const minSwing = gene.params.minSwingPercent ?? 0.5;

    if (candles.length < lookback * seqLength) {
        return createEmptyPAResult(gene);
    }

    // Find swing points
    const swingHighs: number[] = [];
    const swingLows: number[] = [];

    for (let i = lookback; i < candles.length - lookback; i++) {
        let isSwingHigh = true;
        let isSwingLow = true;

        for (let j = 1; j <= lookback; j++) {
            if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
                isSwingHigh = false;
            }
            if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
                isSwingLow = false;
            }
        }

        if (isSwingHigh) swingHighs.push(candles[i].high);
        if (isSwingLow) swingLows.push(candles[i].low);
    }

    // Check for higher-highs + higher-lows (uptrend) or lower-highs + lower-lows (downtrend)
    let bullishCount = 0;
    let bearishCount = 0;

    for (let i = 1; i < swingHighs.length; i++) {
        const changePct = swingHighs[i - 1] > 0
            ? ((swingHighs[i] - swingHighs[i - 1]) / swingHighs[i - 1]) * 100
            : 0;
        if (changePct > minSwing) bullishCount++;
        if (changePct < -minSwing) bearishCount++;
    }

    const detected = bullishCount >= seqLength || bearishCount >= seqLength;
    const direction: 'bullish' | 'bearish' | 'neutral' = bullishCount >= seqLength ? 'bullish'
        : bearishCount >= seqLength ? 'bearish' : 'neutral';

    const strength = Math.max(bullishCount, bearishCount);
    const signalValue = direction === 'bullish' ? clamp(50 + strength * 10, 50, 100)
        : direction === 'bearish' ? clamp(50 - strength * 10, 0, 50) : 50;

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: signalValue,
        previousValue: 50,
        detected,
        direction,
        patternDescription: detected ? `${direction} swing sequence (${strength} swings)` : 'No sequence',
    };
}

// ─── Compression Detection ───────────────────────────────────

function detectCompression(gene: PriceActionGene, candles: OHLCV[]): PriceActionResult {
    const bars = gene.params.compressionBars ?? 10;
    const ratio = gene.params.compressionRatio ?? 0.6;
    const breakoutMult = gene.params.breakoutMultiplier ?? 1.5;

    if (candles.length < bars + 2) {
        return createEmptyPAResult(gene);
    }

    const lookback = candles.slice(-(bars + 1), -1);
    const current = candles[candles.length - 1];

    // Calculate initial range and final range
    const initialRange = lookback[0].high - lookback[0].low;
    const finalRange = lookback[lookback.length - 1].high - lookback[lookback.length - 1].low;

    const isCompressed = initialRange > 0 && (finalRange / initialRange) <= ratio;

    // Check for breakout
    const avgRange = lookback.reduce((s, c) => s + (c.high - c.low), 0) / lookback.length;
    const currentRange = current.high - current.low;
    const isBreakout = avgRange > 0 && (currentRange / avgRange) >= breakoutMult;

    const detected = isCompressed || (isCompressed && isBreakout);
    const direction: 'bullish' | 'bearish' | 'neutral' = isBreakout
        ? (current.close > current.open ? 'bullish' : 'bearish') : 'neutral';

    let signalValue = 50;
    if (isCompressed && isBreakout) {
        signalValue = direction === 'bullish' ? 85 : 15;
    } else if (isCompressed) {
        signalValue = 50; // Compression without breakout = wait
    }

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: signalValue,
        previousValue: 50,
        detected,
        direction,
        patternDescription: isBreakout ? `Compression breakout (${direction})` : isCompressed ? 'Compressing' : 'No compression',
    };
}

// ─── Gap Analysis ────────────────────────────────────────────

function analyzeGaps(gene: PriceActionGene, candles: OHLCV[]): PriceActionResult {
    const gapMinATR = gene.params.gapMinATR ?? 0.5;
    const gapDir = gene.params.gapDirection ?? 'both';

    if (candles.length < 15) {
        return createEmptyPAResult(gene);
    }

    // Calculate ATR(14)
    let atrSum = 0;
    for (let i = candles.length - 15; i < candles.length - 1; i++) {
        const tr = Math.max(
            candles[i + 1].high - candles[i + 1].low,
            Math.abs(candles[i + 1].high - candles[i].close),
            Math.abs(candles[i + 1].low - candles[i].close),
        );
        atrSum += tr;
    }
    const atr = atrSum / 14;
    if (atr <= 0) return createEmptyPAResult(gene);

    const prev = candles[candles.length - 2];
    const current = candles[candles.length - 1];

    const gapUp = current.open - prev.close;
    const gapDown = prev.close - current.open;
    const gapInATR = Math.max(gapUp, gapDown) / atr;

    const isGapUp = gapUp > 0 && gapInATR >= gapMinATR && (gapDir === 'up' || gapDir === 'both');
    const isGapDown = gapDown > 0 && gapInATR >= gapMinATR && (gapDir === 'down' || gapDir === 'both');
    const detected = isGapUp || isGapDown;

    const direction: 'bullish' | 'bearish' | 'neutral' = isGapUp ? 'bullish' : isGapDown ? 'bearish' : 'neutral';
    const signalValue = isGapUp ? clamp(60 + gapInATR * 10, 60, 100) : isGapDown ? clamp(40 - gapInATR * 10, 0, 40) : 50;

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: Math.round(signalValue * 100) / 100,
        previousValue: 50,
        detected,
        direction,
        patternDescription: detected ? `Gap ${direction} (${gapInATR.toFixed(1)} ATR)` : 'No gap',
    };
}

// ─── Crossover & Mutation ────────────────────────────────────

export function crossoverPriceActionGene(geneA: PriceActionGene, geneB: PriceActionGene): PriceActionGene {
    if (geneA.type !== geneB.type) {
        return { ...(Math.random() > 0.5 ? geneA : geneB), id: uuidv4() };
    }

    const child: PriceActionGene = {
        id: uuidv4(),
        type: geneA.type,
        params: {},
    };

    const allKeys = new Set([...Object.keys(geneA.params), ...Object.keys(geneB.params)]);
    for (const key of allKeys) {
        const valA = (geneA.params as Record<string, unknown>)[key];
        const valB = (geneB.params as Record<string, unknown>)[key];

        if (typeof valA === 'number' && typeof valB === 'number') {
            (child.params as Record<string, number>)[key] = Math.round(((valA + valB) / 2) * 100) / 100;
        } else {
            (child.params as Record<string, unknown>)[key] = Math.random() > 0.5 ? valA : valB;
        }
    }

    return child;
}

export function mutatePriceActionGene(gene: PriceActionGene, rate: number = 0.3): PriceActionGene {
    const mutated: PriceActionGene = JSON.parse(JSON.stringify(gene));
    mutated.id = uuidv4();

    const p = mutated.params;
    if (Math.random() < rate && p.bodyRatioMin !== undefined) {
        p.bodyRatioMin = clamp(Math.round((p.bodyRatioMin + randomFloat(-0.15, 0.15)) * 100) / 100, 0.05, 0.9);
    }
    if (Math.random() < rate && p.wickRatioMin !== undefined) {
        p.wickRatioMin = clamp(Math.round((p.wickRatioMin + randomFloat(-0.15, 0.15)) * 100) / 100, 0.1, 0.9);
    }
    if (Math.random() < rate && p.breakLookback !== undefined) {
        p.breakLookback = clamp(p.breakLookback + randomInt(-5, 5), 5, 50);
    }
    if (Math.random() < rate && p.swingLookback !== undefined) {
        p.swingLookback = clamp(p.swingLookback + randomInt(-3, 3), 3, 20);
    }
    if (Math.random() < rate && p.compressionBars !== undefined) {
        p.compressionBars = clamp(p.compressionBars + randomInt(-3, 3), 3, 20);
    }
    if (Math.random() < rate && p.compressionRatio !== undefined) {
        p.compressionRatio = clamp(Math.round((p.compressionRatio + randomFloat(-0.1, 0.1)) * 100) / 100, 0.3, 0.8);
    }
    if (Math.random() < rate && p.gapMinATR !== undefined) {
        p.gapMinATR = clamp(Math.round((p.gapMinATR + randomFloat(-0.3, 0.3)) * 100) / 100, 0.3, 2.0);
    }
    // Rare formation mutation
    if (Math.random() < rate * 0.2 && p.formation !== undefined) {
        p.formation = randomPick(ALL_FORMATIONS);
    }

    return mutated;
}

// ─── Utility ─────────────────────────────────────────────────

function createEmptyPAResult(gene: PriceActionGene): PriceActionResult {
    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: 50,
        previousValue: 50,
        detected: false,
        direction: 'neutral',
        patternDescription: 'Insufficient data',
    };
}
