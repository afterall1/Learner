// ============================================================
// Learner: ACSI — Adaptive Confluence Strength Index
// ============================================================
// Phase 23 RADICAL INNOVATION: Standard multi-timeframe confluence
// treats all TF combinations equally. The ACSI dynamically learns
// which confluence TF combinations are most predictive in each
// market regime using Bayesian posterior updating.
//
// After each trade closes, the ACSI observes whether confluence
// was active at entry and whether the trade was profitable, then
// updates the reliability posterior for that specific combination.
//
// The signal engine multiplies confluence strength by the ACSI
// reliability score, making unreliable confluences weaker signals.
//
// Key tuple: (primaryTF, higherTF, ConfluenceType, MarketRegime)
// ============================================================

import {
    Timeframe,
    ConfluenceType,
    MarketRegime,
} from '@/types';
import type { ConfluenceResult } from './confluence-genes';

// ─── Bayesian Belief Entry ───────────────────────────────────

interface BetaDistribution {
    /** Alpha: count of successes (confluence + profitable trade) */
    alpha: number;
    /** Beta: count of failures (confluence + unprofitable trade) */
    beta: number;
}

/**
 * Key format: "primaryTF:higherTF:confluenceType:regime"
 */
type BeliefKey = string;

// ─── ACSI Matrix ─────────────────────────────────────────────

export class ACSIMatrix {
    /** Bayesian belief matrix: each key maps to a Beta distribution */
    private beliefs: Map<BeliefKey, BetaDistribution> = new Map();

    /** Minimum observations before ACSI modifies confluence strength */
    private readonly MIN_OBSERVATIONS: number = 5;

    /** Prior: slightly optimistic (we WANT confluence to work) */
    private readonly PRIOR_ALPHA: number = 2;
    private readonly PRIOR_BETA: number = 2;

    // ─── Belief Key Generation ────────────────────────────────

    private makeKey(
        primaryTF: Timeframe,
        higherTF: Timeframe,
        type: ConfluenceType,
        regime: MarketRegime,
    ): BeliefKey {
        return `${primaryTF}:${higherTF}:${type}:${regime}`;
    }

    private getOrCreateBelief(key: BeliefKey): BetaDistribution {
        let belief = this.beliefs.get(key);
        if (!belief) {
            belief = { alpha: this.PRIOR_ALPHA, beta: this.PRIOR_BETA };
            this.beliefs.set(key, belief);
        }
        return belief;
    }

    // ─── Posterior Update ─────────────────────────────────────

    /**
     * Update the Bayesian belief after a trade closes.
     *
     * @param confluenceResult - The confluence result that was active at entry
     * @param tradeProfitable  - Whether the trade was profitable
     * @param regime           - The market regime during the trade
     */
    updateBelief(
        confluenceResult: ConfluenceResult,
        tradeProfitable: boolean,
        regime: MarketRegime,
    ): void {
        const key = this.makeKey(
            confluenceResult.primaryTimeframe,
            confluenceResult.higherTimeframe,
            confluenceResult.type,
            regime,
        );

        const belief = this.getOrCreateBelief(key);

        if (tradeProfitable) {
            // Confluence was present AND trade was profitable → increase alpha
            belief.alpha += 1;
        } else {
            // Confluence was present AND trade was UNprofitable → increase beta
            belief.beta += 1;
        }

        // Cap to prevent extreme values (recency weighting via decay)
        const maxTotal = 100;
        const total = belief.alpha + belief.beta;
        if (total > maxTotal) {
            const scale = maxTotal / total;
            belief.alpha = Math.max(this.PRIOR_ALPHA, belief.alpha * scale);
            belief.beta = Math.max(this.PRIOR_BETA, belief.beta * scale);
        }
    }

    // ─── Reliability Query ───────────────────────────────────

    /**
     * Get the calibrated reliability score for a specific confluence combination.
     * Returns 0-1 where:
     *   - 1.0 = very reliable (confluence strongly predicts profitable trades)
     *   - 0.5 = neutral (no evidence either way, or insufficient data)
     *   - 0.0 = unreliable (confluence predicts UNprofitable trades)
     */
    getReliability(
        primaryTF: Timeframe,
        higherTF: Timeframe,
        type: ConfluenceType,
        regime: MarketRegime,
    ): number {
        const key = this.makeKey(primaryTF, higherTF, type, regime);
        const belief = this.beliefs.get(key);

        if (!belief) {
            return 0.5; // No data → neutral (don't penalize unknown combinations)
        }

        const total = belief.alpha + belief.beta;

        // Insufficient observations → return neutral
        if (total - this.PRIOR_ALPHA - this.PRIOR_BETA < this.MIN_OBSERVATIONS) {
            return 0.5;
        }

        // Beta distribution mean: alpha / (alpha + beta)
        return Math.round((belief.alpha / total) * 1000) / 1000;
    }

    /**
     * Apply ACSI reliability multiplier to a confluence result's strength.
     * This is the "self-calibration" mechanism:
     * - Reliable confluences keep their full strength
     * - Unreliable confluences are dampened
     * - Unknown confluences pass through at 50% weight
     */
    applyReliability(
        result: ConfluenceResult,
        regime: MarketRegime,
    ): ConfluenceResult {
        const reliability = this.getReliability(
            result.primaryTimeframe,
            result.higherTimeframe,
            result.type,
            regime,
        );

        // Adjusted strength = original strength × reliability
        // This means a confluence with 0.8 strength but only 0.3 reliability
        // becomes 0.8 × 0.3 = 0.24 effective strength (heavily dampened)
        const adjustedStrength = Math.round(result.strength * reliability * 1000) / 1000;

        return {
            ...result,
            strength: adjustedStrength,
            details: {
                ...result.details,
                acsiReliability: reliability,
                acsiOriginalStrength: result.strength,
                acsiAdjustedStrength: adjustedStrength,
            },
        };
    }

    // ─── Batch Update ────────────────────────────────────────

    /**
     * Update beliefs for all confluence results that were active during a trade.
     * Called by the trade forensics or island after a trade closes.
     */
    updateFromTradeResults(
        activeConfluences: ConfluenceResult[],
        tradeProfitable: boolean,
        regime: MarketRegime,
    ): void {
        for (const result of activeConfluences) {
            if (result.confluent) {
                // Only update when confluence was actively detected
                this.updateBelief(result, tradeProfitable, regime);
            }
        }
    }

    // ─── Snapshot / Dashboard ────────────────────────────────

    /**
     * Get a snapshot of all ACSI beliefs for dashboard visualization.
     * Returns an array of entries sorted by reliability (descending).
     */
    getSnapshot(): ACSISnapshotEntry[] {
        const entries: ACSISnapshotEntry[] = [];

        for (const [key, belief] of this.beliefs) {
            const parts = key.split(':');
            if (parts.length < 4) continue;

            const [primaryTF, higherTF, type, regime] = parts;
            const total = belief.alpha + belief.beta;
            const observations = total - this.PRIOR_ALPHA - this.PRIOR_BETA;
            const reliability = total > 0 ? Math.round((belief.alpha / total) * 1000) / 1000 : 0.5;

            entries.push({
                primaryTF: primaryTF as Timeframe,
                higherTF: higherTF as Timeframe,
                type: type as ConfluenceType,
                regime: regime as MarketRegime,
                reliability,
                observations: Math.max(0, Math.round(observations)),
                alpha: Math.round(belief.alpha * 100) / 100,
                beta: Math.round(belief.beta * 100) / 100,
            });
        }

        return entries.sort((a, b) => b.reliability - a.reliability);
    }

    /**
     * Get the most reliable confluence configurations per regime.
     * Useful for evolution: strategies can learn which confluences to prefer.
     */
    getTopReliable(regime: MarketRegime, limit: number = 5): ACSISnapshotEntry[] {
        return this.getSnapshot()
            .filter(e => e.regime === regime && e.observations >= this.MIN_OBSERVATIONS)
            .slice(0, limit);
    }

    /**
     * Get total observations across all belief entries.
     */
    getTotalObservations(): number {
        let total = 0;
        for (const belief of this.beliefs.values()) {
            total += (belief.alpha + belief.beta) - this.PRIOR_ALPHA - this.PRIOR_BETA;
        }
        return Math.max(0, Math.round(total));
    }

    /**
     * Clear all beliefs (useful for testing or hard reset).
     */
    reset(): void {
        this.beliefs.clear();
    }
}

// ─── Snapshot Types ──────────────────────────────────────────

export interface ACSISnapshotEntry {
    primaryTF: Timeframe;
    higherTF: Timeframe;
    type: ConfluenceType;
    regime: MarketRegime;
    reliability: number;     // 0-1 posterior mean
    observations: number;    // How many trade outcomes observed
    alpha: number;           // Beta distribution alpha
    beta: number;            // Beta distribution beta
}

// ─── Singleton Pattern ───────────────────────────────────────

let globalACSI: ACSIMatrix | null = null;

/**
 * Get the global ACSI matrix instance.
 * Singleton ensures all islands share the same reliability data.
 */
export function getACSI(): ACSIMatrix {
    if (!globalACSI) {
        globalACSI = new ACSIMatrix();
    }
    return globalACSI;
}

/**
 * Reset the global ACSI (for testing).
 */
export function resetACSI(): void {
    globalACSI = null;
}
