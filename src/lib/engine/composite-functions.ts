// ============================================================
// Learner: Composite Function Genes — Mathematical Evolution
// ============================================================
// Phase 9: The key innovation. This module enables the GA to
// evolve MATHEMATICAL RELATIONSHIPS between indicators and raw
// price data. Instead of "RSI > 70", the AI can discover
// "ABS_DIFF(RSI, NORMALIZE(price_slope)) > threshold" — a
// divergence detector that no human would hardcode.
//
// The operation, inputs, and normalization method all evolve.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    OHLCV,
    CompositeFunctionGene,
    CompositeOperation,
    IndicatorType,
} from '@/types';
import {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateATR,
    calculateADX,
} from './signal-engine';

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

const ALL_OPERATIONS: CompositeOperation[] = [
    CompositeOperation.ADD,
    CompositeOperation.SUBTRACT,
    CompositeOperation.MULTIPLY,
    CompositeOperation.DIVIDE,
    CompositeOperation.MAX,
    CompositeOperation.MIN,
    CompositeOperation.ABS_DIFF,
    CompositeOperation.RATIO,
    CompositeOperation.NORMALIZE_DIFF,
];

const COMPOSITE_INDICATORS: IndicatorType[] = [
    IndicatorType.RSI,
    IndicatorType.EMA,
    IndicatorType.SMA,
    IndicatorType.ATR,
    IndicatorType.ADX,
];

const RAW_FIELDS: Array<'close' | 'high' | 'low' | 'open' | 'volume'> = ['close', 'high', 'low', 'open', 'volume'];
const NORMALIZATIONS: Array<'none' | 'percentile' | 'z_score' | 'min_max'> = ['none', 'percentile', 'z_score', 'min_max'];

// ─── Gene Generator ──────────────────────────────────────────

export function generateRandomCompositeGene(): CompositeFunctionGene {
    const generateInput = (): CompositeFunctionGene['inputA'] => {
        const useRaw = Math.random() < 0.3; // 30% chance of raw price
        if (useRaw) {
            return {
                sourceType: 'raw_price',
                rawField: randomPick(RAW_FIELDS),
                period: randomInt(5, 50),
            };
        }
        return {
            sourceType: 'indicator',
            indicatorType: randomPick(COMPOSITE_INDICATORS),
            period: randomInt(5, 50),
        };
    };

    return {
        id: uuidv4(),
        operation: randomPick(ALL_OPERATIONS),
        inputA: generateInput(),
        inputB: generateInput(),
        outputNormalization: randomPick(NORMALIZATIONS),
        outputPeriod: randomInt(5, 50),
    };
}

// ─── Composite Calculation Engine ────────────────────────────

export interface CompositeResult {
    geneId: string;
    currentValue: number;
    previousValue: number;
    allValues: number[];
}

/**
 * Calculate all composite function values against candle data.
 * Each composite gene takes two input series, applies an operation,
 * then optionally normalizes the output.
 */
export function calculateCompositeSignals(
    genes: CompositeFunctionGene[],
    candles: OHLCV[],
): Map<string, CompositeResult> {
    const results = new Map<string, CompositeResult>();

    for (const gene of genes) {
        if (candles.length < 30) continue;

        const result = calculateSingleComposite(gene, candles);
        if (result) {
            results.set(gene.id, result);
        }
    }

    return results;
}

function calculateSingleComposite(
    gene: CompositeFunctionGene,
    candles: OHLCV[],
): CompositeResult | null {
    // Step 1: Get input series A and B
    const seriesA = getInputSeries(gene.inputA, candles);
    const seriesB = getInputSeries(gene.inputB, candles);

    if (seriesA.length < 2 || seriesB.length < 2) return null;

    // Step 2: Align series to same length
    const minLen = Math.min(seriesA.length, seriesB.length);
    const alignedA = seriesA.slice(-minLen);
    const alignedB = seriesB.slice(-minLen);

    // Step 3: Apply the composite operation
    const rawOutput = applyOperation(gene.operation, alignedA, alignedB);
    if (rawOutput.length < 2) return null;

    // Step 4: Normalize the output
    const normalized = normalizeOutput(rawOutput, gene.outputNormalization, gene.outputPeriod);
    if (normalized.length < 2) return null;

    return {
        geneId: gene.id,
        currentValue: Math.round(normalized[normalized.length - 1] * 10000) / 10000,
        previousValue: Math.round(normalized[normalized.length - 2] * 10000) / 10000,
        allValues: normalized,
    };
}

// ─── Input Series Resolution ─────────────────────────────────

function getInputSeries(
    input: CompositeFunctionGene['inputA'],
    candles: OHLCV[],
): number[] {
    switch (input.sourceType) {
        case 'raw_price':
            return getRawPriceSeries(candles, input.rawField ?? 'close');

        case 'indicator':
            return getIndicatorSeries(candles, input.indicatorType ?? IndicatorType.RSI, input.period ?? 14);

        default:
            return candles.map(c => c.close);
    }
}

function getRawPriceSeries(candles: OHLCV[], field: string): number[] {
    switch (field) {
        case 'close': return candles.map(c => c.close);
        case 'high': return candles.map(c => c.high);
        case 'low': return candles.map(c => c.low);
        case 'open': return candles.map(c => c.open);
        case 'volume': return candles.map(c => c.volume);
        default: return candles.map(c => c.close);
    }
}

function getIndicatorSeries(
    candles: OHLCV[],
    type: IndicatorType,
    period: number,
): number[] {
    switch (type) {
        case IndicatorType.RSI: return calculateRSI(candles, period);
        case IndicatorType.EMA: return calculateEMA(candles, period);
        case IndicatorType.SMA: return calculateSMA(candles, period);
        case IndicatorType.ATR: return calculateATR(candles, period);
        case IndicatorType.ADX: return calculateADX(candles, period);
        default: return calculateSMA(candles, period);
    }
}

// ─── Operation Execution ─────────────────────────────────────

const EPSILON = 1e-10; // Prevent division by zero

function applyOperation(
    op: CompositeOperation,
    seriesA: number[],
    seriesB: number[],
): number[] {
    const len = Math.min(seriesA.length, seriesB.length);
    const result: number[] = [];

    for (let i = 0; i < len; i++) {
        const a = seriesA[i];
        const b = seriesB[i];

        switch (op) {
            case CompositeOperation.ADD:
                result.push(a + b);
                break;
            case CompositeOperation.SUBTRACT:
                result.push(a - b);
                break;
            case CompositeOperation.MULTIPLY:
                result.push(a * b);
                break;
            case CompositeOperation.DIVIDE:
                result.push(Math.abs(b) > EPSILON ? a / b : 0);
                break;
            case CompositeOperation.MAX:
                result.push(Math.max(a, b));
                break;
            case CompositeOperation.MIN:
                result.push(Math.min(a, b));
                break;
            case CompositeOperation.ABS_DIFF:
                result.push(Math.abs(a - b));
                break;
            case CompositeOperation.RATIO:
                result.push(Math.abs(a + b) > EPSILON ? a / (a + b) : 0.5);
                break;
            case CompositeOperation.NORMALIZE_DIFF:
                result.push(Math.abs(a + b) > EPSILON ? (a - b) / (Math.abs(a) + Math.abs(b) + EPSILON) : 0);
                break;
        }
    }

    return result;
}

// ─── Output Normalization ────────────────────────────────────

function normalizeOutput(
    values: number[],
    method: CompositeFunctionGene['outputNormalization'],
    period: number,
): number[] {
    if (method === 'none' || values.length < period) {
        return values;
    }

    switch (method) {
        case 'percentile':
            return normalizePercentile(values, period);
        case 'z_score':
            return normalizeZScore(values, period);
        case 'min_max':
            return normalizeMinMax(values, period);
        default:
            return values;
    }
}

function normalizePercentile(values: number[], period: number): number[] {
    const result: number[] = [];

    for (let i = period - 1; i < values.length; i++) {
        const window = values.slice(i - period + 1, i + 1);
        const sorted = [...window].sort((a, b) => a - b);
        const rank = sorted.indexOf(values[i]);
        result.push((rank / (period - 1)) * 100);
    }

    return result;
}

function normalizeZScore(values: number[], period: number): number[] {
    const result: number[] = [];

    for (let i = period - 1; i < values.length; i++) {
        const window = values.slice(i - period + 1, i + 1);
        const mean = window.reduce((s, v) => s + v, 0) / window.length;
        const variance = window.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (window.length - 1);
        const stdDev = Math.sqrt(variance);
        // Map z-score to 0-100 range (z=-3 → 0, z=0 → 50, z=+3 → 100)
        const zScore = stdDev > EPSILON ? (values[i] - mean) / stdDev : 0;
        result.push(clamp((zScore + 3) / 6 * 100, 0, 100));
    }

    return result;
}

function normalizeMinMax(values: number[], period: number): number[] {
    const result: number[] = [];

    for (let i = period - 1; i < values.length; i++) {
        const window = values.slice(i - period + 1, i + 1);
        const min = Math.min(...window);
        const max = Math.max(...window);
        const range = max - min;
        result.push(range > EPSILON ? ((values[i] - min) / range) * 100 : 50);
    }

    return result;
}

// ─── Crossover & Mutation ────────────────────────────────────

export function crossoverCompositeGene(
    geneA: CompositeFunctionGene,
    geneB: CompositeFunctionGene,
): CompositeFunctionGene {
    return {
        id: uuidv4(),
        operation: Math.random() > 0.5 ? geneA.operation : geneB.operation,
        inputA: Math.random() > 0.5 ? { ...geneA.inputA } : { ...geneB.inputA },
        inputB: Math.random() > 0.5 ? { ...geneA.inputB } : { ...geneB.inputB },
        outputNormalization: Math.random() > 0.5 ? geneA.outputNormalization : geneB.outputNormalization,
        outputPeriod: Math.round((geneA.outputPeriod + geneB.outputPeriod) / 2),
    };
}

export function mutateCompositeGene(gene: CompositeFunctionGene, rate: number = 0.3): CompositeFunctionGene {
    const mutated: CompositeFunctionGene = JSON.parse(JSON.stringify(gene));
    mutated.id = uuidv4();

    // Mutate operation
    if (Math.random() < rate) {
        mutated.operation = randomPick(ALL_OPERATIONS);
    }

    // Mutate input A
    if (Math.random() < rate * 0.5) {
        if (mutated.inputA.sourceType === 'indicator' && mutated.inputA.period !== undefined) {
            mutated.inputA.period = clamp(mutated.inputA.period + randomInt(-5, 5), 5, 50);
        }
    }
    if (Math.random() < rate * 0.2) {
        mutated.inputA.indicatorType = randomPick(COMPOSITE_INDICATORS);
    }

    // Mutate input B
    if (Math.random() < rate * 0.5) {
        if (mutated.inputB.sourceType === 'indicator' && mutated.inputB.period !== undefined) {
            mutated.inputB.period = clamp(mutated.inputB.period + randomInt(-5, 5), 5, 50);
        }
    }
    if (Math.random() < rate * 0.2) {
        mutated.inputB.indicatorType = randomPick(COMPOSITE_INDICATORS);
    }

    // Mutate normalization
    if (Math.random() < rate * 0.3) {
        mutated.outputNormalization = randomPick(NORMALIZATIONS);
    }

    // Mutate output period
    if (Math.random() < rate) {
        mutated.outputPeriod = clamp(mutated.outputPeriod + randomInt(-5, 5), 5, 50);
    }

    return mutated;
}
