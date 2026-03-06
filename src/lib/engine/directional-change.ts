// ============================================================
// Learner: Directional Change Genes — Event-Based Price Analysis
// ============================================================
// Phase 9 RADICAL INNOVATION: Based on Prof. Michael Kampouridis's
// Directional Changes (DC) framework. Instead of analyzing price at
// fixed time intervals (1h, 4h candles), DC re-segments price data
// based on EVENTS — whenever price reverses by a configurable θ%.
//
// This produces two alternating event types:
//   DC Event:   Price reverses by θ% → trend change detected
//   Overshoot:  Price continues beyond DC point → trend extension
//
// The GA evolves the θ threshold, discovering market-specific
// optimal reversal thresholds invisible to traditional analysis.
//
// Reference: Kampouridis et al., "Market dynamics via DC event counting"
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    OHLCV,
    DirectionalChangeGene,
    DCEvent,
    DCEventType,
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

const ALL_DC_EVENT_TYPES: DCEventType[] = [
    DCEventType.UPTURN,
    DCEventType.DOWNTURN,
    DCEventType.UPWARD_OVERSHOOT,
    DCEventType.DOWNWARD_OVERSHOOT,
];

// ─── Gene Generator ──────────────────────────────────────────

export function generateRandomDCGene(): DirectionalChangeGene {
    return {
        id: uuidv4(),
        theta: Math.round(randomFloat(0.1, 5.0) * 100) / 100,
        params: {
            signalOn: randomPick(ALL_DC_EVENT_TYPES),
            requiredConsecutive: randomInt(1, 3),
            overshootThreshold: Math.round(randomFloat(0.5, 3.0) * 100) / 100,
            maxDuration: randomInt(10, 100),
            trendRatio: Math.random() > 0.5,
            reversalMagnitude: Math.random() > 0.5,
            oscillationCount: Math.random() > 0.5,
            lookbackEvents: randomInt(5, 30),
        },
    };
}

// ─── DC Event Detection Engine ───────────────────────────────

/**
 * Convert an OHLCV series into Directional Change events.
 * This is the core algorithm from the DC literature:
 *
 * 1. Start tracking from the first candle
 * 2. If price moves UP by θ% from the last extreme LOW → UPTURN event
 * 3. If price moves DOWN by θ% from the last extreme HIGH → DOWNTURN event
 * 4. Between DC events, the price "overshoots" in the DC direction
 */
export function detectDirectionalChanges(
    candles: OHLCV[],
    theta: number, // Reversal threshold in %
): DCEvent[] {
    if (candles.length < 2 || theta <= 0) return [];

    const events: DCEvent[] = [];
    const thetaDecimal = theta / 100;

    // State machine
    let mode: 'uptrend' | 'downtrend' = candles[1].close >= candles[0].close ? 'uptrend' : 'downtrend';
    let extremeHigh = candles[0].high;
    let extremeLow = candles[0].low;
    let extremeHighIdx = 0;
    let extremeLowIdx = 0;
    let lastDCIdx = 0;

    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];

        if (mode === 'uptrend') {
            // Track the highest point during uptrend
            if (c.high > extremeHigh) {
                extremeHigh = c.high;
                extremeHighIdx = i;
            }

            // Check for downturn: price dropped θ% from extreme high
            const dropPercent = (extremeHigh - c.low) / extremeHigh;
            if (dropPercent >= thetaDecimal) {
                // DOWNTURN detected
                events.push({
                    type: DCEventType.DOWNTURN,
                    price: c.low,
                    timestamp: c.timestamp,
                    magnitude: Math.round(dropPercent * 100 * 100) / 100,
                    duration: i - lastDCIdx,
                });

                // Check for upward overshoot (the move from last DC to extreme)
                if (extremeHighIdx > lastDCIdx) {
                    const overshootMag = extremeLow > 0
                        ? ((extremeHigh - extremeLow) / extremeLow) * 100 - theta
                        : 0;
                    if (overshootMag > 0) {
                        events.push({
                            type: DCEventType.UPWARD_OVERSHOOT,
                            price: extremeHigh,
                            timestamp: candles[extremeHighIdx].timestamp,
                            magnitude: Math.round(overshootMag * 100) / 100,
                            duration: extremeHighIdx - lastDCIdx,
                        });
                    }
                }

                // Switch to downtrend
                mode = 'downtrend';
                extremeLow = c.low;
                extremeLowIdx = i;
                lastDCIdx = i;
            }
        } else {
            // Downtrend mode
            // Track the lowest point during downtrend
            if (c.low < extremeLow) {
                extremeLow = c.low;
                extremeLowIdx = i;
            }

            // Check for upturn: price rose θ% from extreme low
            const risePercent = extremeLow > 0 ? (c.high - extremeLow) / extremeLow : 0;
            if (risePercent >= thetaDecimal) {
                // UPTURN detected
                events.push({
                    type: DCEventType.UPTURN,
                    price: c.high,
                    timestamp: c.timestamp,
                    magnitude: Math.round(risePercent * 100 * 100) / 100,
                    duration: i - lastDCIdx,
                });

                // Check for downward overshoot
                if (extremeLowIdx > lastDCIdx) {
                    const overshootMag = extremeHigh > 0
                        ? ((extremeHigh - extremeLow) / extremeHigh) * 100 - theta
                        : 0;
                    if (overshootMag > 0) {
                        events.push({
                            type: DCEventType.DOWNWARD_OVERSHOOT,
                            price: extremeLow,
                            timestamp: candles[extremeLowIdx].timestamp,
                            magnitude: Math.round(overshootMag * 100) / 100,
                            duration: extremeLowIdx - lastDCIdx,
                        });
                    }
                }

                // Switch to uptrend
                mode = 'uptrend';
                extremeHigh = c.high;
                extremeHighIdx = i;
                lastDCIdx = i;
            }
        }
    }

    return events;
}

// ─── DC-Derived Indicators ───────────────────────────────────

export interface DCIndicators {
    /** Trend ratio: total upturn duration / total downturn duration */
    trendRatio: number;
    /** Average magnitude of all DC events */
    avgMagnitude: number;
    /** Count of DC events in the lookback */
    oscillationCount: number;
    /** Ratio of upturns to total DC events */
    upturnRatio: number;
    /** Average duration between events */
    avgDuration: number;
    /** Latest event type */
    latestEventType: DCEventType | null;
    /** Latest event magnitude */
    latestMagnitude: number;
}

/**
 * Calculate DC-derived indicators from a series of DC events.
 */
export function calculateDCIndicators(
    events: DCEvent[],
    lookbackEvents: number = 20,
): DCIndicators {
    const recentEvents = events.slice(-lookbackEvents);

    if (recentEvents.length === 0) {
        return {
            trendRatio: 1,
            avgMagnitude: 0,
            oscillationCount: 0,
            upturnRatio: 0.5,
            avgDuration: 0,
            latestEventType: null,
            latestMagnitude: 0,
        };
    }

    let totalUpturnDuration = 0;
    let totalDownturnDuration = 0;
    let totalMagnitude = 0;
    let upturnCount = 0;
    let dcCount = 0;

    for (const event of recentEvents) {
        totalMagnitude += event.magnitude;

        if (event.type === DCEventType.UPTURN) {
            totalUpturnDuration += event.duration;
            upturnCount++;
            dcCount++;
        } else if (event.type === DCEventType.DOWNTURN) {
            totalDownturnDuration += event.duration;
            dcCount++;
        }
    }

    const trendRatio = totalDownturnDuration > 0
        ? totalUpturnDuration / totalDownturnDuration
        : totalUpturnDuration > 0 ? 2.0 : 1.0;

    const avgDuration = recentEvents.reduce((s, e) => s + e.duration, 0) / recentEvents.length;
    const latestEvent = recentEvents[recentEvents.length - 1];

    return {
        trendRatio: Math.round(trendRatio * 10000) / 10000,
        avgMagnitude: Math.round((totalMagnitude / recentEvents.length) * 100) / 100,
        oscillationCount: dcCount,
        upturnRatio: dcCount > 0 ? Math.round((upturnCount / dcCount) * 10000) / 10000 : 0.5,
        avgDuration: Math.round(avgDuration * 100) / 100,
        latestEventType: latestEvent.type,
        latestMagnitude: latestEvent.magnitude,
    };
}

// ─── DC Signal Evaluation ────────────────────────────────────

export interface DCSignalResult {
    geneId: string;
    currentValue: number;       // 0-100 normalized signal
    previousValue: number;
    events: DCEvent[];          // All detected events
    indicators: DCIndicators;   // DC-derived metrics
    signalTriggered: boolean;   // Whether the configured signal event was detected
}

/**
 * Evaluate a DC gene against candle data.
 * Detects directional change events and calculates DC-derived indicators.
 */
export function evaluateDCGene(
    gene: DirectionalChangeGene,
    candles: OHLCV[],
): DCSignalResult | null {
    if (candles.length < 20) return null;

    // Detect all DC events for this θ value
    const events = detectDirectionalChanges(candles, gene.theta);

    if (events.length === 0) {
        return {
            geneId: gene.id,
            currentValue: 50,
            previousValue: 50,
            events: [],
            indicators: calculateDCIndicators([]),
            signalTriggered: false,
        };
    }

    // Calculate DC indicators
    const indicators = calculateDCIndicators(events, gene.params.lookbackEvents ?? 20);

    // Check if the configured signal event type was detected
    const targetType = gene.params.signalOn;
    const requiredConsecutive = gene.params.requiredConsecutive ?? 1;
    const overshootThreshold = gene.params.overshootThreshold ?? 1.0;
    const maxDuration = gene.params.maxDuration ?? 50;

    // Filter recent events matching the signal type
    const matchingEvents = events.filter(e =>
        e.type === targetType &&
        e.magnitude >= (targetType === DCEventType.UPWARD_OVERSHOOT || targetType === DCEventType.DOWNWARD_OVERSHOOT
            ? overshootThreshold
            : 0) &&
        e.duration <= maxDuration,
    );

    // Check consecutive requirement
    let consecutiveCount = 0;
    let signalTriggered = false;
    for (let i = matchingEvents.length - 1; i >= 0; i--) {
        consecutiveCount++;
        if (consecutiveCount >= requiredConsecutive) {
            signalTriggered = true;
            break;
        }
        // Check if consecutive (within 2 events of each other in the overall sequence)
        if (i > 0) {
            const idxInAll = events.indexOf(matchingEvents[i]);
            const prevIdxInAll = events.indexOf(matchingEvents[i - 1]);
            if (idxInAll - prevIdxInAll > 2) {
                consecutiveCount = 0; // Reset: gap too large
            }
        }
    }

    // Calculate signal value
    let signalValue = 50;

    if (signalTriggered) {
        // Signal triggered: set value based on direction
        if (targetType === DCEventType.UPTURN || targetType === DCEventType.UPWARD_OVERSHOOT) {
            signalValue = clamp(70 + indicators.latestMagnitude * 2, 70, 100);
        } else {
            signalValue = clamp(30 - indicators.latestMagnitude * 2, 0, 30);
        }
    } else {
        // No signal: use trend ratio as ambient value
        signalValue = clamp(indicators.trendRatio * 25 + 25, 10, 90);
    }

    // Previous value: check if signal was triggered one event ago
    const prevEvents = events.slice(0, -1);
    const prevIndicators = calculateDCIndicators(prevEvents, gene.params.lookbackEvents ?? 20);
    const prevValue = clamp(prevIndicators.trendRatio * 25 + 25, 10, 90);

    return {
        geneId: gene.id,
        currentValue: Math.round(signalValue * 100) / 100,
        previousValue: Math.round(prevValue * 100) / 100,
        events,
        indicators,
        signalTriggered,
    };
}

// ─── Crossover & Mutation ────────────────────────────────────

export function crossoverDCGene(
    geneA: DirectionalChangeGene,
    geneB: DirectionalChangeGene,
): DirectionalChangeGene {
    return {
        id: uuidv4(),
        theta: Math.round(((geneA.theta + geneB.theta) / 2) * 100) / 100,
        params: {
            signalOn: Math.random() > 0.5 ? geneA.params.signalOn : geneB.params.signalOn,
            requiredConsecutive: Math.round(
                ((geneA.params.requiredConsecutive ?? 1) + (geneB.params.requiredConsecutive ?? 1)) / 2,
            ),
            overshootThreshold: Math.round(
                (((geneA.params.overshootThreshold ?? 1) + (geneB.params.overshootThreshold ?? 1)) / 2) * 100,
            ) / 100,
            maxDuration: Math.round(
                ((geneA.params.maxDuration ?? 50) + (geneB.params.maxDuration ?? 50)) / 2,
            ),
            trendRatio: Math.random() > 0.5 ? geneA.params.trendRatio : geneB.params.trendRatio,
            reversalMagnitude: Math.random() > 0.5 ? geneA.params.reversalMagnitude : geneB.params.reversalMagnitude,
            oscillationCount: Math.random() > 0.5 ? geneA.params.oscillationCount : geneB.params.oscillationCount,
            lookbackEvents: Math.round(
                ((geneA.params.lookbackEvents ?? 20) + (geneB.params.lookbackEvents ?? 20)) / 2,
            ),
        },
    };
}

export function mutateDCGene(gene: DirectionalChangeGene, rate: number = 0.3): DirectionalChangeGene {
    const mutated: DirectionalChangeGene = JSON.parse(JSON.stringify(gene));
    mutated.id = uuidv4();

    // Mutate θ — the most important parameter
    if (Math.random() < rate) {
        mutated.theta = clamp(
            Math.round((mutated.theta + randomFloat(-0.5, 0.5)) * 100) / 100,
            0.1, 5.0,
        );
    }

    // Mutate signal type (rare)
    if (Math.random() < rate * 0.2) {
        mutated.params.signalOn = randomPick(ALL_DC_EVENT_TYPES);
    }

    // Mutate consecutive requirement
    if (Math.random() < rate) {
        mutated.params.requiredConsecutive = clamp(
            (mutated.params.requiredConsecutive ?? 1) + randomInt(-1, 1),
            1, 3,
        );
    }

    // Mutate overshoot threshold
    if (Math.random() < rate && mutated.params.overshootThreshold !== undefined) {
        mutated.params.overshootThreshold = clamp(
            Math.round((mutated.params.overshootThreshold + randomFloat(-0.5, 0.5)) * 100) / 100,
            0.5, 3.0,
        );
    }

    // Mutate max duration
    if (Math.random() < rate && mutated.params.maxDuration !== undefined) {
        mutated.params.maxDuration = clamp(
            mutated.params.maxDuration + randomInt(-10, 10),
            10, 100,
        );
    }

    // Toggle indicator flags
    if (Math.random() < rate * 0.3) {
        mutated.params.trendRatio = !mutated.params.trendRatio;
    }
    if (Math.random() < rate * 0.3) {
        mutated.params.reversalMagnitude = !mutated.params.reversalMagnitude;
    }

    // Mutate lookback events
    if (Math.random() < rate && mutated.params.lookbackEvents !== undefined) {
        mutated.params.lookbackEvents = clamp(
            mutated.params.lookbackEvents + randomInt(-5, 5),
            5, 30,
        );
    }

    return mutated;
}
