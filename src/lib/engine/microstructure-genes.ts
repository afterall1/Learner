// ============================================================
// Learner: Microstructure Genes — Volume, Candle Anatomy & Order Flow
// ============================================================
// Phase 9: Advanced gene type that analyzes market microstructure
// patterns invisible to standard indicators. These genes let the
// GA discover strategies based on volume dynamics, candle morphology,
// range analysis, and absorption (whale activity) detection.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    OHLCV,
    MicrostructureGene,
    MicrostructureGeneType,
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

// ─── Gene Generator ──────────────────────────────────────────

const ALL_MICRO_TYPES: MicrostructureGeneType[] = [
    MicrostructureGeneType.VOLUME_PROFILE,
    MicrostructureGeneType.VOLUME_ACCELERATION,
    MicrostructureGeneType.CANDLE_ANATOMY,
    MicrostructureGeneType.RANGE_EXPANSION,
    MicrostructureGeneType.ABSORPTION,
];

/**
 * Generate a random microstructure gene for evolution.
 * Each gene type has its own parameter ranges that the GA will explore.
 */
export function generateRandomMicrostructureGene(type?: MicrostructureGeneType): MicrostructureGene {
    const geneType = type ?? randomPick(ALL_MICRO_TYPES);

    const base: MicrostructureGene = {
        id: uuidv4(),
        type: geneType,
        lookbackPeriod: randomInt(5, 30),
        params: {},
    };

    switch (geneType) {
        case MicrostructureGeneType.VOLUME_PROFILE:
            base.params = {
                priceBuckets: randomInt(5, 20),
                concentrationThreshold: Math.round(randomFloat(0.3, 0.8) * 100) / 100,
            };
            break;

        case MicrostructureGeneType.VOLUME_ACCELERATION:
            base.params = {
                accelerationPeriod: randomInt(2, 10),
                spikeMultiplier: Math.round(randomFloat(1.5, 5.0) * 100) / 100,
            };
            break;

        case MicrostructureGeneType.CANDLE_ANATOMY:
            base.params = {
                bodyRatioThreshold: Math.round(randomFloat(0.1, 0.9) * 100) / 100,
                shadowDominance: randomPick(['upper', 'lower', 'balanced'] as const),
                dominanceThreshold: Math.round(randomFloat(0.3, 0.8) * 100) / 100,
            };
            break;

        case MicrostructureGeneType.RANGE_EXPANSION:
            base.params = {
                expansionMultiplier: Math.round(randomFloat(1.2, 3.0) * 100) / 100,
                contractionRatio: Math.round(randomFloat(0.3, 0.7) * 100) / 100,
                sequenceLength: randomInt(2, 5),
            };
            break;

        case MicrostructureGeneType.ABSORPTION:
            base.params = {
                candleSizeMultiplier: Math.round(randomFloat(1.5, 4.0) * 100) / 100,
                maxNetMovementPercent: Math.round(randomFloat(0.1, 0.5) * 100) / 100,
            };
            break;
    }

    return base;
}

// ─── Microstructure Calculation Engine ────────────────────────

export interface MicrostructureResult {
    geneId: string;
    type: MicrostructureGeneType;
    currentValue: number;      // Normalized 0-100 signal value
    previousValue: number;     // Previous bar value for cross detection
    rawValue: number;          // Raw calculated value before normalization
    detected: boolean;         // Whether the pattern/condition was detected
}

/**
 * Calculate all microstructure gene values against candle data.
 */
export function calculateMicrostructureSignals(
    genes: MicrostructureGene[],
    candles: OHLCV[],
): Map<string, MicrostructureResult> {
    const results = new Map<string, MicrostructureResult>();

    for (const gene of genes) {
        if (candles.length < gene.lookbackPeriod + 2) continue;

        const result = calculateSingleMicrostructure(gene, candles);
        if (result) {
            results.set(gene.id, result);
        }
    }

    return results;
}

function calculateSingleMicrostructure(
    gene: MicrostructureGene,
    candles: OHLCV[],
): MicrostructureResult | null {
    switch (gene.type) {
        case MicrostructureGeneType.VOLUME_PROFILE:
            return calculateVolumeProfile(gene, candles);
        case MicrostructureGeneType.VOLUME_ACCELERATION:
            return calculateVolumeAcceleration(gene, candles);
        case MicrostructureGeneType.CANDLE_ANATOMY:
            return analyzeCandleAnatomy(gene, candles);
        case MicrostructureGeneType.RANGE_EXPANSION:
            return detectRangeExpansion(gene, candles);
        case MicrostructureGeneType.ABSORPTION:
            return detectAbsorption(gene, candles);
        default:
            return null;
    }
}

// ─── Volume Profile ───────────────────────────────────────────
// Divides price range into buckets and measures volume concentration

function calculateVolumeProfile(gene: MicrostructureGene, candles: OHLCV[]): MicrostructureResult {
    const lookback = candles.slice(-gene.lookbackPeriod);
    const buckets = gene.params.priceBuckets ?? 10;
    const threshold = gene.params.concentrationThreshold ?? 0.5;

    // Find price range
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const c of lookback) {
        minPrice = Math.min(minPrice, c.low);
        maxPrice = Math.max(maxPrice, c.high);
    }

    const range = maxPrice - minPrice;
    if (range <= 0) {
        return createEmptyResult(gene, false);
    }

    const bucketSize = range / buckets;
    const volumeByBucket = new Array(buckets).fill(0);
    let totalVolume = 0;

    // Distribute volume across price buckets
    for (const c of lookback) {
        const midPrice = (c.high + c.low) / 2;
        const bucketIdx = Math.min(buckets - 1, Math.floor((midPrice - minPrice) / bucketSize));
        volumeByBucket[bucketIdx] += c.volume;
        totalVolume += c.volume;
    }

    if (totalVolume <= 0) {
        return createEmptyResult(gene, false);
    }

    // Find the highest volume bucket (Point of Control)
    let maxBucketVolume = 0;
    let pocBucket = 0;
    for (let i = 0; i < buckets; i++) {
        if (volumeByBucket[i] > maxBucketVolume) {
            maxBucketVolume = volumeByBucket[i];
            pocBucket = i;
        }
    }

    const concentration = maxBucketVolume / totalVolume;
    const currentPrice = candles[candles.length - 1].close;
    const pocPrice = minPrice + (pocBucket + 0.5) * bucketSize;

    // Signal: how close is current price to the Point of Control?
    const distanceToPOC = Math.abs(currentPrice - pocPrice) / range;
    const rawValue = concentration;
    const detected = concentration >= threshold && distanceToPOC < 0.2;
    const normalizedValue = clamp((1 - distanceToPOC) * 100, 0, 100);

    // Previous bar calculation
    const prevCandles = candles.slice(0, -1);
    const prevLookback = prevCandles.slice(-gene.lookbackPeriod);
    let prevValue = normalizedValue;
    if (prevLookback.length >= gene.lookbackPeriod) {
        const prevPrice = prevCandles[prevCandles.length - 1].close;
        const prevDist = Math.abs(prevPrice - pocPrice) / range;
        prevValue = clamp((1 - prevDist) * 100, 0, 100);
    }

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: Math.round(normalizedValue * 100) / 100,
        previousValue: Math.round(prevValue * 100) / 100,
        rawValue: Math.round(rawValue * 10000) / 10000,
        detected,
    };
}

// ─── Volume Acceleration ──────────────────────────────────────
// Rate of change of volume — detect accumulation/distribution

function calculateVolumeAcceleration(gene: MicrostructureGene, candles: OHLCV[]): MicrostructureResult {
    const lookback = candles.slice(-gene.lookbackPeriod);
    const accelPeriod = gene.params.accelerationPeriod ?? 3;
    const spikeMultiplier = gene.params.spikeMultiplier ?? 2.0;

    if (lookback.length < accelPeriod + 1) {
        return createEmptyResult(gene, false);
    }

    // Calculate average volume for the lookback
    const volumes = lookback.map(c => c.volume);
    const avgVolume = volumes.reduce((s, v) => s + v, 0) / volumes.length;

    if (avgVolume <= 0) {
        return createEmptyResult(gene, false);
    }

    // Volume rate of change: compare recent vs lookback average
    const recentVolumes = volumes.slice(-accelPeriod);
    const recentAvg = recentVolumes.reduce((s, v) => s + v, 0) / recentVolumes.length;
    const acceleration = recentAvg / avgVolume;

    const detected = acceleration >= spikeMultiplier;
    const normalizedValue = clamp(acceleration / spikeMultiplier * 50, 0, 100);

    // Previous bar
    const prevVolumes = volumes.slice(-(accelPeriod + 1), -1);
    const prevAvg = prevVolumes.length > 0
        ? prevVolumes.reduce((s, v) => s + v, 0) / prevVolumes.length
        : recentAvg;
    const prevAccel = prevAvg / avgVolume;
    const prevNormalized = clamp(prevAccel / spikeMultiplier * 50, 0, 100);

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: Math.round(normalizedValue * 100) / 100,
        previousValue: Math.round(prevNormalized * 100) / 100,
        rawValue: Math.round(acceleration * 10000) / 10000,
        detected,
    };
}

// ─── Candle Anatomy ───────────────────────────────────────────
// Body:wick ratios and shadow dominance analysis

function analyzeCandleAnatomy(gene: MicrostructureGene, candles: OHLCV[]): MicrostructureResult {
    const bodyRatioThreshold = gene.params.bodyRatioThreshold ?? 0.5;
    const shadowDom = gene.params.shadowDominance ?? 'balanced';
    const domThreshold = gene.params.dominanceThreshold ?? 0.5;

    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const analyzeCandle = (c: OHLCV): { bodyRatio: number; upperShadow: number; lowerShadow: number; signalValue: number; detected: boolean } => {
        const totalRange = c.high - c.low;
        if (totalRange <= 0) return { bodyRatio: 0, upperShadow: 0, lowerShadow: 0, signalValue: 50, detected: false };

        const body = Math.abs(c.close - c.open);
        const bodyRatio = body / totalRange;

        const upperWick = c.high - Math.max(c.open, c.close);
        const lowerWick = Math.min(c.open, c.close) - c.low;

        const upperShadow = upperWick / totalRange;
        const lowerShadow = lowerWick / totalRange;

        let signalValue = bodyRatio * 100;
        let detected = false;

        switch (shadowDom) {
            case 'upper':
                signalValue = upperShadow * 100;
                detected = upperShadow >= domThreshold && bodyRatio >= bodyRatioThreshold;
                break;
            case 'lower':
                signalValue = lowerShadow * 100;
                detected = lowerShadow >= domThreshold && bodyRatio >= bodyRatioThreshold;
                break;
            case 'balanced':
                signalValue = bodyRatio * 100;
                detected = bodyRatio >= bodyRatioThreshold;
                break;
        }

        return { bodyRatio, upperShadow, lowerShadow, signalValue, detected };
    };

    const currentAnalysis = analyzeCandle(current);
    const previousAnalysis = analyzeCandle(previous);

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: Math.round(currentAnalysis.signalValue * 100) / 100,
        previousValue: Math.round(previousAnalysis.signalValue * 100) / 100,
        rawValue: Math.round(currentAnalysis.bodyRatio * 10000) / 10000,
        detected: currentAnalysis.detected,
    };
}

// ─── Range Expansion / Contraction ────────────────────────────
// Detects sequences of expanding or contracting true range

function detectRangeExpansion(gene: MicrostructureGene, candles: OHLCV[]): MicrostructureResult {
    const lookback = candles.slice(-gene.lookbackPeriod);
    const expansionMult = gene.params.expansionMultiplier ?? 2.0;
    const contractionRatio = gene.params.contractionRatio ?? 0.5;
    const seqLen = gene.params.sequenceLength ?? 3;

    if (lookback.length < seqLen + 1) {
        return createEmptyResult(gene, false);
    }

    // Calculate true ranges
    const trueRanges: number[] = [];
    for (let i = 1; i < lookback.length; i++) {
        const high = lookback[i].high;
        const low = lookback[i].low;
        const prevClose = lookback[i - 1].close;
        trueRanges.push(Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose),
        ));
    }

    // Average true range for the lookback
    const avgTR = trueRanges.reduce((s, v) => s + v, 0) / trueRanges.length;
    if (avgTR <= 0) return createEmptyResult(gene, false);

    // Check for expansion or contraction sequences
    const recentTRs = trueRanges.slice(-seqLen);
    const recentAvg = recentTRs.reduce((s, v) => s + v, 0) / recentTRs.length;

    const isExpansion = recentAvg >= avgTR * expansionMult;
    const isContraction = recentAvg <= avgTR * contractionRatio;

    // Expansion = high signal (70-100), Contraction = low signal (0-30), Normal = 50
    let signalValue = 50;
    if (isExpansion) {
        signalValue = clamp(70 + (recentAvg / avgTR - expansionMult) * 30, 70, 100);
    } else if (isContraction) {
        signalValue = clamp(30 - (1 - recentAvg / avgTR) * 30, 0, 30);
    }

    // Previous calculation
    const prevTRs = trueRanges.slice(-(seqLen + 1), -1);
    const prevAvg = prevTRs.length > 0 ? prevTRs.reduce((s, v) => s + v, 0) / prevTRs.length : recentAvg;
    let prevSignal = 50;
    if (prevAvg >= avgTR * expansionMult) {
        prevSignal = clamp(70 + (prevAvg / avgTR - expansionMult) * 30, 70, 100);
    } else if (prevAvg <= avgTR * contractionRatio) {
        prevSignal = clamp(30 - (1 - prevAvg / avgTR) * 30, 0, 30);
    }

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: Math.round(signalValue * 100) / 100,
        previousValue: Math.round(prevSignal * 100) / 100,
        rawValue: Math.round((recentAvg / avgTR) * 10000) / 10000,
        detected: isExpansion || isContraction,
    };
}

// ─── Absorption Detection ────────────────────────────────────
// Large candle range + small net price movement = whale activity

function detectAbsorption(gene: MicrostructureGene, candles: OHLCV[]): MicrostructureResult {
    const lookback = candles.slice(-gene.lookbackPeriod);
    const candleSizeMult = gene.params.candleSizeMultiplier ?? 2.0;
    const maxNetMove = gene.params.maxNetMovementPercent ?? 0.3;

    // Calculate average candle size
    const candleSizes = lookback.map(c => c.high - c.low);
    const avgSize = candleSizes.reduce((s, v) => s + v, 0) / candleSizes.length;
    if (avgSize <= 0) return createEmptyResult(gene, false);

    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    const analyzeAbsorption = (c: OHLCV): { signalValue: number; detected: boolean } => {
        const candleSize = c.high - c.low;
        const netMovement = Math.abs(c.close - c.open);
        const midPrice = (c.high + c.low) / 2;
        const netMovePercent = midPrice > 0 ? (netMovement / midPrice) * 100 : 0;

        const isLargeCandle = candleSize >= avgSize * candleSizeMult;
        const isSmallNetMove = netMovePercent <= maxNetMove;
        const detected = isLargeCandle && isSmallNetMove;

        // Signal: higher when larger candle with smaller net movement
        const sizeRatio = candleSize / avgSize;
        const absorptionStrength = isSmallNetMove
            ? clamp(sizeRatio / candleSizeMult * 50 + 25, 0, 100)
            : clamp(50 - sizeRatio * 10, 0, 50);

        return { signalValue: absorptionStrength, detected };
    };

    const currentResult = analyzeAbsorption(current);
    const previousResult = analyzeAbsorption(previous);

    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: Math.round(currentResult.signalValue * 100) / 100,
        previousValue: Math.round(previousResult.signalValue * 100) / 100,
        rawValue: Math.round((current.high - current.low) / avgSize * 10000) / 10000,
        detected: currentResult.detected,
    };
}

// ─── Crossover & Mutation Operators ──────────────────────────

/**
 * Crossover two microstructure genes by blending their parameters.
 */
export function crossoverMicrostructureGene(
    geneA: MicrostructureGene,
    geneB: MicrostructureGene,
): MicrostructureGene {
    // If same type, blend parameters. If different, pick one randomly.
    if (geneA.type !== geneB.type) {
        return { ...(Math.random() > 0.5 ? geneA : geneB), id: uuidv4() };
    }

    const child: MicrostructureGene = {
        id: uuidv4(),
        type: geneA.type,
        lookbackPeriod: Math.round((geneA.lookbackPeriod + geneB.lookbackPeriod) / 2),
        params: {},
    };

    // Blend numeric params from both parents
    const allKeys = new Set([...Object.keys(geneA.params), ...Object.keys(geneB.params)]);
    for (const key of allKeys) {
        const valA = (geneA.params as Record<string, unknown>)[key];
        const valB = (geneB.params as Record<string, unknown>)[key];

        if (typeof valA === 'number' && typeof valB === 'number') {
            (child.params as Record<string, number>)[key] = Math.round(((valA + valB) / 2) * 100) / 100;
        } else if (typeof valA === 'string' || typeof valB === 'string') {
            (child.params as Record<string, unknown>)[key] = Math.random() > 0.5 ? valA : valB;
        } else {
            (child.params as Record<string, unknown>)[key] = valA ?? valB;
        }
    }

    return child;
}

/**
 * Mutate a microstructure gene by perturbing its parameters.
 */
export function mutateMicrostructureGene(gene: MicrostructureGene, rate: number = 0.3): MicrostructureGene {
    const mutated: MicrostructureGene = JSON.parse(JSON.stringify(gene));
    mutated.id = uuidv4();

    // Mutate lookback period
    if (Math.random() < rate) {
        mutated.lookbackPeriod = clamp(mutated.lookbackPeriod + randomInt(-5, 5), 3, 50);
    }

    // Mutate type-specific params
    const params = mutated.params;
    if (Math.random() < rate && params.priceBuckets !== undefined) {
        params.priceBuckets = clamp(params.priceBuckets + randomInt(-3, 3), 5, 20);
    }
    if (Math.random() < rate && params.concentrationThreshold !== undefined) {
        params.concentrationThreshold = clamp(
            Math.round((params.concentrationThreshold + randomFloat(-0.1, 0.1)) * 100) / 100, 0.3, 0.8,
        );
    }
    if (Math.random() < rate && params.spikeMultiplier !== undefined) {
        params.spikeMultiplier = clamp(
            Math.round((params.spikeMultiplier + randomFloat(-0.5, 0.5)) * 100) / 100, 1.5, 5.0,
        );
    }
    if (Math.random() < rate && params.bodyRatioThreshold !== undefined) {
        params.bodyRatioThreshold = clamp(
            Math.round((params.bodyRatioThreshold + randomFloat(-0.15, 0.15)) * 100) / 100, 0.1, 0.9,
        );
    }
    if (Math.random() < rate && params.expansionMultiplier !== undefined) {
        params.expansionMultiplier = clamp(
            Math.round((params.expansionMultiplier + randomFloat(-0.3, 0.3)) * 100) / 100, 1.2, 3.0,
        );
    }
    if (Math.random() < rate && params.candleSizeMultiplier !== undefined) {
        params.candleSizeMultiplier = clamp(
            Math.round((params.candleSizeMultiplier + randomFloat(-0.5, 0.5)) * 100) / 100, 1.5, 4.0,
        );
    }

    return mutated;
}

// ─── Utility ─────────────────────────────────────────────────

function createEmptyResult(gene: MicrostructureGene, detected: boolean): MicrostructureResult {
    return {
        geneId: gene.id,
        type: gene.type,
        currentValue: 50,
        previousValue: 50,
        rawValue: 0,
        detected,
    };
}
