// ============================================================
// Learner: Metacognitive Monitor — Self-Awareness Layer
// ============================================================
// Phase 19 Module C: The radical elevation — a system that
// monitors the cognitive system ITSELF.
//
// Metacognition = "thinking about thinking"
//
// This module:
//   1. Monitors calibration quality (is the calibrator calibrated?)
//   2. Detects belief drift (are beliefs changing too fast/slow?)
//   3. Computes epistemic uncertainty (how much DON'T we know?)
//   4. Adjusts position aggressiveness based on system confidence
//   5. Maintains a Decision Journal for explainable AI
//
// Key innovation: Creates a closed-loop between confidence
// and action — when the system is uncertain about its own
// beliefs, it automatically reduces risk exposure.
//
// "Epistemic humility is the ultimate risk management."
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type DecisionJournalEntry,
    type MetacognitiveSnapshot,
    type MarketIntelligence,
    type MarketMood,
    type SignalBelief,
} from '@/types';
import { SignalBeliefTracker } from './bayesian-signal-calibrator';

// ─── Calibration Quality Assessment ──────────────────────────

/**
 * Assess how well-calibrated the Bayesian beliefs are.
 *
 * A well-calibrated system means:
 *   - When it says "70% confidence" ← it wins ~70% of the time
 *   - When it says "30% confidence" ← it wins ~30% of the time
 *
 * We measure this using the Brier Score:
 *   BS = (1/N) Σ (confidence_i - outcome_i)²
 *   where outcome_i = 1 (success) or 0 (failure)
 *
 * Perfect calibration = 0, worst = 1.
 * We invert this to return 0-1 where 1 = perfectly calibrated.
 */
function assessCalibrationQuality(
    decisions: DecisionJournalEntry[],
): number {
    const resolved = decisions.filter(d => d.outcome !== undefined);
    if (resolved.length < 10) return 0.5; // Not enough data

    let brierSum = 0;
    for (const decision of resolved) {
        const confidence = decision.signalConfidence;
        const outcome = decision.outcome!.wasCorrect ? 1 : 0;
        brierSum += (confidence - outcome) ** 2;
    }

    const brierScore = brierSum / resolved.length;

    // Invert and clamp: 0 (worst) → 1 (perfect)
    return Math.max(0, Math.min(1, 1 - brierScore));
}

// ─── Belief Drift Detection ─────────────────────────────────

/**
 * Detect how fast beliefs are changing.
 *
 * High drift = beliefs are volatile (market regime may be shifting)
 * Low drift = beliefs are stable (market is consistent)
 *
 * Measured as the average absolute change in calibrated confidence
 * across all beliefs between current and previous snapshots.
 *
 * Returns 0-1 where 0 = no drift, 1 = maximum drift.
 */
function detectBeliefDrift(
    currentBeliefs: SignalBelief[],
    previousConfidences: Map<string, number>,
): number {
    if (currentBeliefs.length === 0 || previousConfidences.size === 0) return 0;

    let totalDrift = 0;
    let comparedCount = 0;

    for (const belief of currentBeliefs) {
        const key = `${belief.key.indicatorType}|${belief.key.condition}|${belief.key.regime}`;
        const previousConf = previousConfidences.get(key);

        if (previousConf !== undefined) {
            totalDrift += Math.abs(belief.calibratedConfidence - previousConf);
            comparedCount++;
        }
    }

    if (comparedCount === 0) return 0;

    // Normalize: max possible drift per belief = 1.0
    return Math.min(1, totalDrift / comparedCount);
}

// ─── Epistemic Uncertainty ───────────────────────────────────

/**
 * Compute aggregate epistemic uncertainty across the system.
 *
 * Sources of uncertainty:
 *   1. Belief variance (Beta posterior spread)
 *   2. Low sample counts (few observations)
 *   3. Market intelligence staleness
 *   4. Calibration quality (meta-uncertainty)
 *
 * Returns 0-1 where 0 = fully confident, 1 = maximally uncertain.
 */
function computeEpistemicUncertainty(
    beliefs: SignalBelief[],
    calibrationQuality: number,
    marketIntelligence: MarketIntelligence | null,
): number {
    // 1. Average belief uncertainty (from Beta variance)
    let avgBeliefVariance = 0.25; // Prior when no data
    if (beliefs.length > 0) {
        let totalVariance = 0;
        for (const belief of beliefs) {
            const { alpha, beta } = belief.posterior;
            const total = alpha + beta;
            const variance = total > 0
                ? (alpha * beta) / (total * total * (total + 1))
                : 0.25;
            totalVariance += variance;
        }
        avgBeliefVariance = totalVariance / beliefs.length;
    }

    // Normalize: Beta(2,2) has variance 0.05, Beta(1,1) has variance 0.0833
    const beliefUncertainty = Math.min(1, avgBeliefVariance / 0.1);

    // 2. Sample count uncertainty (few observations = high uncertainty)
    const avgSampleCount = beliefs.length > 0
        ? beliefs.reduce((s, b) => s + b.sampleCount, 0) / beliefs.length
        : 0;
    const sampleUncertainty = Math.exp(-avgSampleCount / 20); // Decays to 0 as samples grow

    // 3. Market intelligence staleness
    let intelligenceUncertainty = 0.5; // Default when no intelligence
    if (marketIntelligence) {
        intelligenceUncertainty = Math.min(1, marketIntelligence.dataAge / 3600); // Stale after 1 hour
    }

    // 4. Meta-uncertainty (1 - calibration quality)
    const metaUncertainty = 1 - calibrationQuality;

    // Weighted combination
    return Math.min(1, Math.max(0,
        beliefUncertainty * 0.3 +
        sampleUncertainty * 0.3 +
        intelligenceUncertainty * 0.2 +
        metaUncertainty * 0.2,
    ));
}

// ─── Aggressiveness Adjustment ───────────────────────────────

/**
 * Adjust position aggressiveness based on epistemic uncertainty.
 *
 * When the system is highly uncertain about its own beliefs,
 * it automatically reduces position sizes — "epistemic humility."
 *
 * This is distinct from the Market Intelligence aggressiveness:
 *   - MI: adjusts for market conditions (fear/greed, volatility)
 *   - Meta: adjusts for SELF-KNOWLEDGE quality
 *
 * Combined: final_multiplier = MI_multiplier × Meta_multiplier
 *
 * Returns 0.5-1.0 multiplier.
 */
function computeMetaAggressiveness(
    epistemicUncertainty: number,
    beliefDriftRate: number,
): number {
    // High uncertainty → less aggressive
    let multiplier = 1.0 - epistemicUncertainty * 0.4;

    // High drift → even less aggressive (regime is shifting)
    if (beliefDriftRate > 0.3) {
        multiplier -= 0.1;
    }

    return Math.max(0.5, Math.min(1.0, multiplier));
}

// ─── Metacognitive Monitor ───────────────────────────────────

/**
 * MetacognitiveMonitor — The self-awareness layer of the ACC.
 *
 * This is the "thinking about thinking" module that:
 * 1. Monitors the Bayesian calibrator's calibration quality
 * 2. Detects when beliefs are drifting faster than expected
 * 3. Computes aggregate epistemic uncertainty
 * 4. Adjusts position sizing based on self-confidence
 * 5. Maintains a Decision Journal for explainable AI
 *
 * The Decision Journal creates a complete audit trail of
 * every trading decision with its reasoning chain, enabling
 * post-hoc analysis of WHY the agent made specific trades.
 */
export class MetacognitiveMonitor {
    private journal: DecisionJournalEntry[] = [];
    private maxJournalSize: number = 500;
    private previousConfidences: Map<string, number> = new Map();
    private lastCalibrationQuality: number = 0.5;
    private lastBeliefDrift: number = 0;
    private lastEpistemicUncertainty: number = 0.5;

    /**
     * Log a trading decision with full reasoning context.
     *
     * Call this BEFORE executing the trade to record the
     * pre-trade reasoning chain.
     */
    logDecision(
        strategyId: string,
        action: DecisionJournalEntry['action'],
        signalConfidence: number,
        marketIntelligence: MarketIntelligence | null,
        epistemicUncertainty: number,
        aggressiveness: number,
        reasoning: string[],
    ): string {
        const id = uuidv4();
        const marketMood: MarketMood = marketIntelligence?.fearGreedClassification ?? 'NEUTRAL';

        const entry: DecisionJournalEntry = {
            id,
            timestamp: Date.now(),
            strategyId,
            action,
            signalConfidence,
            marketMood,
            epistemicUncertainty,
            aggressiveness,
            reasoning,
        };

        this.journal.push(entry);

        // Evict oldest entries if over capacity
        if (this.journal.length > this.maxJournalSize) {
            this.journal = this.journal.slice(-this.maxJournalSize);
        }

        return id;
    }

    /**
     * Record the outcome of a trade decision.
     * Call this when the trade closes.
     */
    recordOutcome(
        decisionId: string,
        pnlPercent: number,
        lessonLearned: string,
    ): void {
        const entry = this.journal.find(e => e.id === decisionId);
        if (!entry) return;

        entry.outcome = {
            pnlPercent,
            wasCorrect: pnlPercent > 0,
            lessonLearned,
        };
    }

    /**
     * Perform a full metacognitive assessment.
     *
     * Call this periodically (e.g., after each generation or trading cycle)
     * to update the system's self-awareness.
     */
    assess(
        calibrator: SignalBeliefTracker,
        marketIntelligence: MarketIntelligence | null,
    ): MetacognitiveSnapshot {
        const reliabilityMatrix = calibrator.getReliabilityMatrix();
        const beliefs = reliabilityMatrix.beliefs;

        // 1. Calibration quality
        this.lastCalibrationQuality = assessCalibrationQuality(this.journal);

        // 2. Belief drift
        this.lastBeliefDrift = detectBeliefDrift(beliefs, this.previousConfidences);

        // Save current confidences for next drift calculation
        this.previousConfidences.clear();
        for (const belief of beliefs) {
            const key = `${belief.key.indicatorType}|${belief.key.condition}|${belief.key.regime}`;
            this.previousConfidences.set(key, belief.calibratedConfidence);
        }

        // 3. Epistemic uncertainty
        this.lastEpistemicUncertainty = computeEpistemicUncertainty(
            beliefs,
            this.lastCalibrationQuality,
            marketIntelligence,
        );

        // 4. Meta-aggressiveness
        const aggressivenessMultiplier = computeMetaAggressiveness(
            this.lastEpistemicUncertainty,
            this.lastBeliefDrift,
        );

        // 5. Decision accuracy
        const resolvedDecisions = this.journal.filter(d => d.outcome !== undefined);
        const correctDecisions = resolvedDecisions.filter(d => d.outcome!.wasCorrect);
        const correctDecisionRate = resolvedDecisions.length > 0
            ? correctDecisions.length / resolvedDecisions.length
            : 0.5;

        // 6. Average signal confidence
        const recentDecisions = this.journal.slice(-20);
        const avgSignalConfidence = recentDecisions.length > 0
            ? recentDecisions.reduce((s, d) => s + d.signalConfidence, 0) / recentDecisions.length
            : 0.5;

        return {
            calibrationQuality: this.lastCalibrationQuality,
            beliefDriftRate: this.lastBeliefDrift,
            epistemicUncertainty: this.lastEpistemicUncertainty,
            aggressivenessMultiplier,
            recentDecisions: recentDecisions,
            totalDecisions: this.journal.length,
            correctDecisionRate,
            avgSignalConfidence,
        };
    }

    /**
     * Get the current epistemic uncertainty level.
     */
    getEpistemicUncertainty(): number {
        return this.lastEpistemicUncertainty;
    }

    /**
     * Get the current calibration quality.
     */
    getCalibrationQuality(): number {
        return this.lastCalibrationQuality;
    }

    /**
     * Get the current belief drift rate.
     */
    getBeliefDriftRate(): number {
        return this.lastBeliefDrift;
    }

    /**
     * Get the combined aggressiveness multiplier
     * (meta-uncertainty adjusted).
     */
    getMetaAggressiveness(): number {
        return computeMetaAggressiveness(
            this.lastEpistemicUncertainty,
            this.lastBeliefDrift,
        );
    }

    /**
     * Generate a human-readable reasoning chain for a decision.
     *
     * This is the "explainable AI" component — creates a
     * natural language description of WHY a trade decision
     * was made, based on all available signals.
     */
    generateReasoningChain(
        signalConfidence: number,
        marketIntelligence: MarketIntelligence | null,
        epistemicUncertainty: number,
    ): string[] {
        const reasoning: string[] = [];

        // Signal confidence reasoning
        if (signalConfidence > 0.7) {
            reasoning.push(`High signal confidence (${(signalConfidence * 100).toFixed(0)}%) — Bayesian beliefs strongly support this trade`);
        } else if (signalConfidence > 0.5) {
            reasoning.push(`Moderate signal confidence (${(signalConfidence * 100).toFixed(0)}%) — beliefs mildly support this trade`);
        } else {
            reasoning.push(`Low signal confidence (${(signalConfidence * 100).toFixed(0)}%) — weak historical support for this signal combination`);
        }

        // Market intelligence reasoning
        if (marketIntelligence) {
            const fgi = marketIntelligence.fearGreedIndex;
            reasoning.push(`Market mood: ${marketIntelligence.fearGreedClassification} (F&G: ${fgi})`);

            if (marketIntelligence.fundingBias !== 'NEUTRAL') {
                reasoning.push(`Funding bias: ${marketIntelligence.fundingBias} (rate: ${(marketIntelligence.fundingRate * 100).toFixed(4)}%)`);
            }

            if (marketIntelligence.volatilityPercentile > 80) {
                reasoning.push(`⚠️ Elevated volatility (${marketIntelligence.volatilityPercentile.toFixed(0)}th percentile) — reducing exposure`);
            }
        }

        // Epistemic uncertainty reasoning
        if (epistemicUncertainty > 0.7) {
            reasoning.push(`⚠️ High epistemic uncertainty (${(epistemicUncertainty * 100).toFixed(0)}%) — system knowledge is limited, reducing position size`);
        } else if (epistemicUncertainty < 0.3) {
            reasoning.push(`✅ Low epistemic uncertainty (${(epistemicUncertainty * 100).toFixed(0)}%) — system is confident in its beliefs`);
        }

        // Calibration quality reasoning
        if (this.lastCalibrationQuality < 0.4) {
            reasoning.push(`⚠️ Calibration quality is poor (${(this.lastCalibrationQuality * 100).toFixed(0)}%) — past confidence predictions have been inaccurate`);
        }

        // Belief drift reasoning
        if (this.lastBeliefDrift > 0.3) {
            reasoning.push(`🔄 Significant belief drift detected (${(this.lastBeliefDrift * 100).toFixed(0)}%) — market regime may be shifting`);
        }

        return reasoning;
    }

    /**
     * Get the Decision Journal entries.
     */
    getJournal(): DecisionJournalEntry[] {
        return [...this.journal];
    }

    /**
     * Get journal statistics.
     */
    getJournalStats(): {
        totalEntries: number;
        resolvedEntries: number;
        pendingEntries: number;
        winRate: number;
    } {
        const resolved = this.journal.filter(d => d.outcome !== undefined);
        const wins = resolved.filter(d => d.outcome!.wasCorrect);

        return {
            totalEntries: this.journal.length,
            resolvedEntries: resolved.length,
            pendingEntries: this.journal.length - resolved.length,
            winRate: resolved.length > 0 ? wins.length / resolved.length : 0,
        };
    }
}
