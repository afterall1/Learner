// ============================================================
// Learner: Cross-Island Regime Propagation Network (CIRPN)
// ============================================================
// Radical Innovation — Turns independent islands into an
// interconnected intelligence network.
//
// In crypto markets, regime shifts are CORRELATED:
//   BTC HIGH_VOLATILITY → ETH follows in ~5-15 min
//   BTC TRENDING_UP → ALTs follow in ~15-60 min
//
// CIRPN detects these lead-lag patterns and propagates early
// warnings from "leader" pairs to "follower" pairs BEFORE
// the follower's own MRTI detects the shift locally.
//
// Three components:
//   1. RegimeCorrelationTracker — records timestamped regime events
//   2. LeadLagDetector — identifies leader/follower relationships
//   3. WarningPropagator — emits CrossIslandWarning to followers
// ============================================================

import {
    MarketRegime,
} from '@/types';

// ─── Types ──────────────────────────────────────────────────

export interface RegimeChangeEvent {
    slotId: string;
    pair: string;
    fromRegime: MarketRegime;
    toRegime: MarketRegime;
    timestamp: number;
}

export interface LeadLagRelationship {
    leaderPair: string;
    followerPair: string;
    /** Average time (ms) between leader shift and follower shift */
    avgLagMs: number;
    /** Correlation strength (0-1) — how reliably leader predicts follower */
    correlationStrength: number;
    /** Number of observed correlated transitions */
    sampleCount: number;
    /** Last time this relationship was observed */
    lastObserved: number;
}

export interface CrossIslandWarning {
    sourceSlotId: string;
    targetSlotId: string;
    sourcePair: string;
    targetPair: string;
    predictedRegime: MarketRegime;
    /** Estimated ms until regime arrives at follower */
    expectedArrivalMs: number;
    /** Confidence in this prediction (0-1) */
    confidence: number;
    issuedAt: number;
}

export interface PropagationNetworkStatus {
    totalRegimeEvents: number;
    knownRelationships: LeadLagRelationship[];
    activeWarnings: CrossIslandWarning[];
    leaderPairs: string[];
    followerPairs: string[];
}

// ─── Configuration ──────────────────────────────────────────

interface PropagationConfig {
    /** Max time window (ms) to consider two regime shifts as correlated. Default: 60 minutes */
    correlationWindowMs: number;
    /** Minimum observed correlations to establish a relationship. Default: 3 */
    minSamplesForRelationship: number;
    /** Minimum correlation strength to propagate warnings. Default: 0.5 */
    minCorrelationForWarning: number;
    /** Maximum regime events to keep in history. Default: 200 */
    maxEventHistory: number;
    /** Time (ms) after which active warnings expire. Default: 30 minutes */
    warningExpiryMs: number;
}

const DEFAULT_PROPAGATION_CONFIG: PropagationConfig = {
    correlationWindowMs: 60 * 60 * 1000,      // 60 minutes
    minSamplesForRelationship: 3,
    minCorrelationForWarning: 0.5,
    maxEventHistory: 200,
    warningExpiryMs: 30 * 60 * 1000,           // 30 minutes
};

// ─── Regime Correlation Tracker ─────────────────────────────

/**
 * Records timestamped regime change events and detects
 * temporal correlations between pairs.
 */
class RegimeCorrelationTracker {
    private events: RegimeChangeEvent[] = [];
    private config: PropagationConfig;

    // Per-pair regime state tracking
    private currentRegimes: Map<string, MarketRegime> = new Map();

    constructor(config: PropagationConfig) {
        this.config = config;
    }

    /**
     * Record a regime change event. Returns true if this was
     * an actual CHANGE (not a repeat of the current regime).
     */
    recordRegimeEvent(slotId: string, pair: string, newRegime: MarketRegime): RegimeChangeEvent | null {
        const previousRegime = this.currentRegimes.get(pair);

        // Only record actual changes
        if (previousRegime === newRegime) {
            return null;
        }

        const event: RegimeChangeEvent = {
            slotId,
            pair,
            fromRegime: previousRegime ?? MarketRegime.RANGING,
            toRegime: newRegime,
            timestamp: Date.now(),
        };

        this.events.push(event);
        this.currentRegimes.set(pair, newRegime);

        // Trim history
        if (this.events.length > this.config.maxEventHistory) {
            this.events = this.events.slice(-this.config.maxEventHistory);
        }

        return event;
    }

    /**
     * Find all regime events from OTHER pairs that occurred
     * within the correlation window AFTER the given event.
     * These are potential "followers" of the given event.
     */
    findCorrelatedFollowers(leaderEvent: RegimeChangeEvent): Array<{
        followerEvent: RegimeChangeEvent;
        lagMs: number;
    }> {
        const results: Array<{
            followerEvent: RegimeChangeEvent;
            lagMs: number;
        }> = [];

        for (const event of this.events) {
            // Skip same pair
            if (event.pair === leaderEvent.pair) continue;

            // Must be AFTER the leader event
            const lagMs = event.timestamp - leaderEvent.timestamp;
            if (lagMs <= 0) continue;

            // Must be within correlation window
            if (lagMs > this.config.correlationWindowMs) continue;

            // Must transition to the SAME regime
            if (event.toRegime !== leaderEvent.toRegime) continue;

            results.push({
                followerEvent: event,
                lagMs,
            });
        }

        return results;
    }

    /**
     * Get all events for a specific pair.
     */
    getEventsForPair(pair: string): RegimeChangeEvent[] {
        return this.events.filter(e => e.pair === pair);
    }

    /**
     * Get total event count.
     */
    getTotalEvents(): number {
        return this.events.length;
    }

    /**
     * Get all tracked pairs.
     */
    getTrackedPairs(): string[] {
        return [...this.currentRegimes.keys()];
    }

    /**
     * Get current regime for a pair.
     */
    getCurrentRegime(pair: string): MarketRegime | undefined {
        return this.currentRegimes.get(pair);
    }
}

// ─── Lead-Lag Detector ──────────────────────────────────────

/**
 * Analyzes regime change event history to identify which pairs
 * are "leaders" (shift first) and which are "followers" (shift after).
 */
class LeadLagDetector {
    private relationships: Map<string, LeadLagRelationship> = new Map();
    private config: PropagationConfig;

    constructor(config: PropagationConfig) {
        this.config = config;
    }

    /**
     * Update lead-lag relationships based on a new regime event
     * and its correlated followers.
     */
    updateRelationships(
        leaderEvent: RegimeChangeEvent,
        followers: Array<{ followerEvent: RegimeChangeEvent; lagMs: number }>,
    ): void {
        for (const { followerEvent, lagMs } of followers) {
            const key = `${leaderEvent.pair}→${followerEvent.pair}`;
            const existing = this.relationships.get(key);

            if (existing) {
                // Update running average
                const newSampleCount = existing.sampleCount + 1;
                const newAvgLag = (existing.avgLagMs * existing.sampleCount + lagMs) / newSampleCount;

                // Correlation strength increases with more samples, up to 1.0
                // Logistic growth: approaches 1.0 asymptotically
                const newStrength = 1 - (1 / (1 + newSampleCount * 0.3));

                this.relationships.set(key, {
                    leaderPair: leaderEvent.pair,
                    followerPair: followerEvent.pair,
                    avgLagMs: Math.round(newAvgLag),
                    correlationStrength: Math.round(newStrength * 1000) / 1000,
                    sampleCount: newSampleCount,
                    lastObserved: Date.now(),
                });
            } else {
                // New relationship
                this.relationships.set(key, {
                    leaderPair: leaderEvent.pair,
                    followerPair: followerEvent.pair,
                    avgLagMs: lagMs,
                    correlationStrength: 0.231, // 1 - 1/(1 + 0.3) ≈ 0.231 for first observation
                    sampleCount: 1,
                    lastObserved: Date.now(),
                });
            }
        }
    }

    /**
     * Get all established relationships (meeting minimum sample threshold).
     */
    getEstablishedRelationships(): LeadLagRelationship[] {
        const results: LeadLagRelationship[] = [];

        for (const rel of this.relationships.values()) {
            if (rel.sampleCount >= this.config.minSamplesForRelationship) {
                results.push({ ...rel });
            }
        }

        return results.sort((a, b) => b.correlationStrength - a.correlationStrength);
    }

    /**
     * Get all follower pairs for a given leader pair.
     * Only returns relationships meeting minimum correlation strength.
     */
    getFollowersFor(leaderPair: string): LeadLagRelationship[] {
        const results: LeadLagRelationship[] = [];

        for (const rel of this.relationships.values()) {
            if (
                rel.leaderPair === leaderPair &&
                rel.sampleCount >= this.config.minSamplesForRelationship &&
                rel.correlationStrength >= this.config.minCorrelationForWarning
            ) {
                results.push({ ...rel });
            }
        }

        return results;
    }

    /**
     * Identify pairs that are predominantly "leaders" (shift first).
     */
    identifyLeaderPairs(): string[] {
        const leaderScores: Map<string, number> = new Map();
        const followerScores: Map<string, number> = new Map();

        for (const rel of this.relationships.values()) {
            if (rel.sampleCount < this.config.minSamplesForRelationship) continue;

            const leaderScore = (leaderScores.get(rel.leaderPair) ?? 0) + rel.correlationStrength;
            leaderScores.set(rel.leaderPair, leaderScore);

            const followerScore = (followerScores.get(rel.followerPair) ?? 0) + rel.correlationStrength;
            followerScores.set(rel.followerPair, followerScore);
        }

        // A pair is a "leader" if its leader score exceeds its follower score
        const leaders: string[] = [];
        for (const [pair, score] of leaderScores.entries()) {
            const fScore = followerScores.get(pair) ?? 0;
            if (score > fScore) {
                leaders.push(pair);
            }
        }

        return leaders;
    }

    /**
     * Get all relationships (including immature ones).
     */
    getAllRelationships(): LeadLagRelationship[] {
        return [...this.relationships.values()];
    }
}

// ─── Regime Propagation Network ─────────────────────────────

type WarningCallback = (warning: CrossIslandWarning) => void;

/**
 * Main CIRPN orchestrator. Combines correlation tracking with
 * lead-lag detection to propagate early warnings across islands.
 *
 * Usage:
 *   const network = new RegimePropagationNetwork();
 *   network.setWarningCallback(warning => island.receiveCrossIslandWarning(warning));
 *   network.onRegimeDetected(slotId, pair, regime);
 */
export class RegimePropagationNetwork {
    private config: PropagationConfig;
    private correlationTracker: RegimeCorrelationTracker;
    private leadLagDetector: LeadLagDetector;
    private activeWarnings: CrossIslandWarning[] = [];
    private onWarning: WarningCallback | null = null;

    // Slot → pair mapping for reverse lookup
    private slotToPair: Map<string, string> = new Map();
    private pairToSlots: Map<string, string[]> = new Map();

    constructor(config: Partial<PropagationConfig> = {}) {
        this.config = { ...DEFAULT_PROPAGATION_CONFIG, ...config };
        this.correlationTracker = new RegimeCorrelationTracker(this.config);
        this.leadLagDetector = new LeadLagDetector(this.config);
    }

    // ─── Configuration ──────────────────────────────────────

    /**
     * Set callback for when a cross-island warning is emitted.
     * The CortexLiveEngine wires this to Island.receiveCrossIslandWarning().
     */
    setWarningCallback(callback: WarningCallback): void {
        this.onWarning = callback;
    }

    /**
     * Register a slot → pair mapping.
     * Must be called during initialization for each active slot.
     */
    registerSlot(slotId: string, pair: string): void {
        this.slotToPair.set(slotId, pair);
        const slots = this.pairToSlots.get(pair) ?? [];
        if (!slots.includes(slotId)) {
            slots.push(slotId);
        }
        this.pairToSlots.set(pair, slots);
    }

    // ─── Event Handling ─────────────────────────────────────

    /**
     * Called when an island detects a regime change.
     * This is the main entry point for the propagation engine.
     *
     * Flow:
     *   1. Record the regime change event
     *   2. Look backward: has THIS event been predicted by a leader shift?
     *   3. Look forward: does THIS event predict follower shifts?
     *   4. Update lead-lag relationships
     *   5. Emit warnings to follower islands
     */
    onRegimeDetected(slotId: string, pair: string, newRegime: MarketRegime): void {
        // 1. Record the event
        const event = this.correlationTracker.recordRegimeEvent(slotId, pair, newRegime);
        if (!event) return; // Not an actual change

        console.log(
            `[CIRPN] 🌊 Regime change: ${pair} → ${event.toRegime} (from ${event.fromRegime})`,
        );

        // 2. Look backward: find leaders that predicted this event
        // (This updates existing relationships retro-actively)
        this.retroactiveCorrelationCheck(event);

        // 3. Look forward: check if this pair is a known leader
        const followers = this.leadLagDetector.getFollowersFor(pair);

        if (followers.length > 0) {
            // 4. Emit warnings to all follower islands
            for (const relationship of followers) {
                this.emitWarning(event, relationship);
            }
        }

        // 5. Clean up expired warnings
        this.cleanExpiredWarnings();
    }

    // ─── Status ─────────────────────────────────────────────

    /**
     * Get the full status of the propagation network.
     */
    getStatus(): PropagationNetworkStatus {
        this.cleanExpiredWarnings();

        const leaders = this.leadLagDetector.identifyLeaderPairs();
        const allRelationships = this.leadLagDetector.getEstablishedRelationships();
        const followerPairs = [...new Set(allRelationships.map(r => r.followerPair))];

        return {
            totalRegimeEvents: this.correlationTracker.getTotalEvents(),
            knownRelationships: allRelationships,
            activeWarnings: [...this.activeWarnings],
            leaderPairs: leaders,
            followerPairs,
        };
    }

    /**
     * Get established lead-lag relationships.
     */
    getRelationships(): LeadLagRelationship[] {
        return this.leadLagDetector.getEstablishedRelationships();
    }

    /**
     * Get currently active warnings.
     */
    getActiveWarnings(): CrossIslandWarning[] {
        this.cleanExpiredWarnings();
        return [...this.activeWarnings];
    }

    // ─── Private Methods ────────────────────────────────────

    /**
     * Check backwards in event history to find leader events
     * that correlate with this new follower event.
     */
    private retroactiveCorrelationCheck(followerEvent: RegimeChangeEvent): void {
        // Look for events from OTHER pairs that shifted to the SAME regime
        // BEFORE this event (within the correlation window)
        const potentialLeaders: Array<{
            followerEvent: RegimeChangeEvent;
            lagMs: number;
        }> = [];

        // For each tracked pair, find recent events to the same regime
        for (const trackedPair of this.correlationTracker.getTrackedPairs()) {
            if (trackedPair === followerEvent.pair) continue;

            const pairEvents = this.correlationTracker.getEventsForPair(trackedPair);
            for (const leaderCandidate of pairEvents) {
                // Must have shifted to the same regime
                if (leaderCandidate.toRegime !== followerEvent.toRegime) continue;

                // Must have happened BEFORE follower
                const lagMs = followerEvent.timestamp - leaderCandidate.timestamp;
                if (lagMs <= 0) continue;
                if (lagMs > this.config.correlationWindowMs) continue;

                potentialLeaders.push({
                    followerEvent,
                    lagMs,
                });

                // Update the lead-lag detector with this observation
                this.leadLagDetector.updateRelationships(leaderCandidate, [{
                    followerEvent,
                    lagMs,
                }]);
            }
        }

        if (potentialLeaders.length > 0) {
            console.log(
                `[CIRPN] 📊 Retroactive correlation: ${followerEvent.pair} correlated with ` +
                `${potentialLeaders.length} leader event(s)`,
            );
        }
    }

    /**
     * Emit a cross-island warning to all slots belonging to the follower pair.
     */
    private emitWarning(leaderEvent: RegimeChangeEvent, relationship: LeadLagRelationship): void {
        const followerSlots = this.pairToSlots.get(relationship.followerPair);
        if (!followerSlots || followerSlots.length === 0) return;

        const timeSinceLeaderShift = Date.now() - leaderEvent.timestamp;
        const expectedArrivalMs = Math.max(0, relationship.avgLagMs - timeSinceLeaderShift);

        for (const targetSlotId of followerSlots) {
            const warning: CrossIslandWarning = {
                sourceSlotId: leaderEvent.slotId,
                targetSlotId,
                sourcePair: leaderEvent.pair,
                targetPair: relationship.followerPair,
                predictedRegime: leaderEvent.toRegime,
                expectedArrivalMs,
                confidence: relationship.correlationStrength,
                issuedAt: Date.now(),
            };

            this.activeWarnings.push(warning);

            console.log(
                `[CIRPN] ⚡ WARNING: ${leaderEvent.pair} → ${relationship.followerPair}:${targetSlotId}` +
                ` | Predicted: ${leaderEvent.toRegime}` +
                ` | ETA: ${Math.round(expectedArrivalMs / 1000)}s` +
                ` | Confidence: ${(relationship.correlationStrength * 100).toFixed(0)}%` +
                ` | Based on ${relationship.sampleCount} observations (avg lag: ${Math.round(relationship.avgLagMs / 1000)}s)`,
            );

            // Emit to callback
            if (this.onWarning) {
                this.onWarning(warning);
            }
        }
    }

    /**
     * Remove expired warnings.
     */
    private cleanExpiredWarnings(): void {
        const now = Date.now();
        this.activeWarnings = this.activeWarnings.filter(
            w => now - w.issuedAt < this.config.warningExpiryMs,
        );
    }
}
