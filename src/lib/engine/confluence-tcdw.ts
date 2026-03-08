// ============================================================
// Learner: TCDW — Temporal Confluence Decay Window
// ============================================================
// Phase 26 RADICAL INNOVATION: Standard multi-timeframe confluence
// treats all HTF signals as equally weighted regardless of when the
// HTF candle closed. This is a critical blind spot — a 4H candle
// that closed 5 minutes ago is FAR more relevant than one that
// closed 3 hours ago.
//
// TCDW models this temporal dimension:
//   decayFactor = max(0, 1 - (elapsed / duration)^decayPower)
//
// The decayPower is EVOLVABLE — the GA discovers which decay
// curve shapes work best for each confluence type × regime pair.
//
// Decay Shapes:
//   0.5 = √ curve — slow initial decay, sharp at end (trend following)
//   1.0 = linear — steady decay
//   2.0 = quadratic — fast initial decay, slow tail (momentum)
//   3.0 = cubic — very aggressive initial decay (scalping)
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { Timeframe, ConfluenceType } from '@/types';
import type { ConfluenceResult } from './confluence-genes';

// ─── Configuration ──────────────────────────────────────────

/**
 * Per-confluence-type decay configuration.
 * Each type can have a different decay power, allowing the GA to
 * learn that e.g. Trend Alignment decays slowly while Momentum
 * Confluence decays quickly.
 */
export interface TemporalDecayConfig {
    id: string;
    /** Decay power per confluence type. Controls the decay curve shape. */
    decayPowers: Record<ConfluenceType, number>;
    /** Minimum decay factor — floor that prevents signals from hitting zero.
     *  0.1 means even the stalest signal retains 10% of its original strength. */
    minimumDecay: number;
    /** Whether to enable temporal decay at all (allows GA to disable it) */
    enabled: boolean;
}

// ─── Timeframe Duration Map ─────────────────────────────────

const TF_DURATION_MS: Record<Timeframe, number> = {
    [Timeframe.M1]: 60_000,
    [Timeframe.M5]: 300_000,
    [Timeframe.M15]: 900_000,
    [Timeframe.H1]: 3_600_000,
    [Timeframe.H4]: 14_400_000,
    [Timeframe.D1]: 86_400_000,
};

// ─── Core Decay Function ────────────────────────────────────

/**
 * Calculate the temporal decay factor for a confluence signal.
 *
 * @param currentTimestamp - Current evaluation timestamp (ms)
 * @param htfCandleCloseTimestamp - When the HTF candle closed (ms)
 * @param htfTimeframe - The higher timeframe
 * @param decayPower - Controls decay curve shape (0.5-3.0)
 * @param minimumDecay - Floor value to prevent total signal death
 * @returns Decay factor in [minimumDecay, 1.0]
 */
export function calculateTemporalDecay(
    currentTimestamp: number,
    htfCandleCloseTimestamp: number,
    htfTimeframe: Timeframe,
    decayPower: number = 1.0,
    minimumDecay: number = 0.1,
): number {
    const htfDuration = TF_DURATION_MS[htfTimeframe];
    if (!htfDuration || htfDuration <= 0) return 1.0;

    const elapsed = Math.max(0, currentTimestamp - htfCandleCloseTimestamp);

    // If we're past the full HTF duration, return minimum
    if (elapsed >= htfDuration) return minimumDecay;

    // If elapsed is 0, the candle just closed — full strength
    if (elapsed <= 0) return 1.0;

    // Core decay: 1 - (elapsed/duration)^power
    const normalizedElapsed = elapsed / htfDuration;
    const rawDecay = 1 - Math.pow(normalizedElapsed, decayPower);

    // Apply minimum floor
    return Math.max(minimumDecay, Math.round(rawDecay * 1000) / 1000);
}

/**
 * Apply temporal decay to a ConfluenceResult, attenuating its strength
 * based on how stale the HTF candle data is.
 *
 * @param result - Original confluence evaluation result
 * @param currentTimestamp - Current evaluation timestamp
 * @param htfCandleCloseTimestamp - When the highest TF candle closed
 * @param config - TCDW configuration
 * @returns New ConfluenceResult with decayed strength + TCDW metadata
 */
export function applyTemporalDecay(
    result: ConfluenceResult,
    currentTimestamp: number,
    htfCandleCloseTimestamp: number,
    config: TemporalDecayConfig,
): ConfluenceResult {
    if (!config.enabled) return result;

    const decayPower = config.decayPowers[result.type] ?? 1.0;
    const decayFactor = calculateTemporalDecay(
        currentTimestamp,
        htfCandleCloseTimestamp,
        result.higherTimeframe,
        decayPower,
        config.minimumDecay,
    );

    const originalStrength = result.strength;
    const decayedStrength = Math.round(originalStrength * decayFactor * 1000) / 1000;

    return {
        ...result,
        strength: decayedStrength,
        details: {
            ...result.details,
            tcdwDecayFactor: decayFactor,
            tcdwDecayPower: decayPower,
            tcdwOriginalStrength: originalStrength,
            tcdwElapsedMs: Math.max(0, currentTimestamp - htfCandleCloseTimestamp),
        },
    };
}

// ─── GA Operators ───────────────────────────────────────────

const DECAY_POWER_MIN = 0.3;
const DECAY_POWER_MAX = 3.0;
const MIN_DECAY_MIN = 0.0;
const MIN_DECAY_MAX = 0.3;

function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Generate a random TCDW configuration.
 * Called when initializing a new strategy genome.
 */
export function generateRandomDecayConfig(): TemporalDecayConfig {
    return {
        id: uuidv4(),
        decayPowers: {
            [ConfluenceType.TREND_ALIGNMENT]: Math.round(randomFloat(0.3, 1.5) * 100) / 100,
            [ConfluenceType.MOMENTUM_CONFLUENCE]: Math.round(randomFloat(1.0, 3.0) * 100) / 100,
            [ConfluenceType.VOLATILITY_MATCH]: Math.round(randomFloat(0.5, 2.0) * 100) / 100,
            [ConfluenceType.STRUCTURE_CONFLUENCE]: Math.round(randomFloat(0.3, 1.0) * 100) / 100,
        },
        minimumDecay: Math.round(randomFloat(0.05, 0.25) * 100) / 100,
        enabled: Math.random() > 0.15, // 85% chance of being enabled
    };
}

/**
 * Crossover two TCDW configurations.
 * Blends numeric parameters from both parents.
 */
export function crossoverDecayConfig(
    a: TemporalDecayConfig,
    b: TemporalDecayConfig,
): TemporalDecayConfig {
    const blendNum = (va: number, vb: number): number => {
        return Math.round(((va + vb) / 2) * 100) / 100;
    };

    const decayPowers = {} as Record<ConfluenceType, number>;
    for (const type of Object.values(ConfluenceType)) {
        decayPowers[type] = blendNum(
            a.decayPowers[type] ?? 1.0,
            b.decayPowers[type] ?? 1.0,
        );
    }

    return {
        id: uuidv4(),
        decayPowers,
        minimumDecay: blendNum(a.minimumDecay, b.minimumDecay),
        enabled: Math.random() > 0.5 ? a.enabled : b.enabled,
    };
}

/**
 * Mutate a TCDW configuration.
 * Perturbs numeric parameters within valid bounds.
 */
export function mutateDecayConfig(
    config: TemporalDecayConfig,
    rate: number = 0.3,
): TemporalDecayConfig {
    const mutated: TemporalDecayConfig = JSON.parse(JSON.stringify(config));
    mutated.id = uuidv4();

    // Mutate each decay power independently
    for (const type of Object.values(ConfluenceType)) {
        if (Math.random() < rate) {
            const current = mutated.decayPowers[type] ?? 1.0;
            const perturbation = randomFloat(-0.5, 0.5);
            mutated.decayPowers[type] = Math.round(
                clamp(current + perturbation, DECAY_POWER_MIN, DECAY_POWER_MAX) * 100,
            ) / 100;
        }
    }

    // Mutate minimum decay
    if (Math.random() < rate) {
        const perturbation = randomFloat(-0.1, 0.1);
        mutated.minimumDecay = Math.round(
            clamp(mutated.minimumDecay + perturbation, MIN_DECAY_MIN, MIN_DECAY_MAX) * 100,
        ) / 100;
    }

    // Rare toggle of enabled flag (5% of mutation rate)
    if (Math.random() < rate * 0.05) {
        mutated.enabled = !mutated.enabled;
    }

    return mutated;
}
