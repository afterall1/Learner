// ============================================================
// Learner: Strategy Roster — Regime-Aware Validated Strategy Bank
// ============================================================
// The Roster banks validated strategies per-regime instead of
// discarding them. When the market regime changes, the system
// instantly activates the best strategy for the new conditions.
//
// This transforms Learner from "find one strategy, discard when
// it degrades" to "build a portfolio of regime-specialists that
// collectively handle ANY market condition."
//
// Council Decision: Dr. Andrew Lo's Adaptive Markets Hypothesis —
// strategies are like species in an ecosystem. They don't die when
// conditions change, they hibernate and return when their niche
// reopens.
// ============================================================

import {
    StrategyDNA,
    MarketRegime,
    PerformanceMetrics,
    RosterEntry,
    RosterState,
    RosterSnapshot,
} from '@/types';
import { evaluatePerformance, calculateFitnessScore } from './evaluator';

// ─── Configuration ───────────────────────────────────────────

export interface StrategyRosterConfig {
    maxRosterSize: number;             // Max strategies per roster (LRU eviction)
    minConfidenceForActivation: number; // Min confidence score to activate (0-100)
    recencyDecayFactor: number;         // How fast old scores decay (0-1, lower = faster)
    regimeTransitionCooldown: number;   // Min ms between regime switches
    minTradesForRegimeScore: number;    // Min trades in a regime for reliable scoring
}

export const DEFAULT_ROSTER_CONFIG: StrategyRosterConfig = {
    maxRosterSize: 15,
    minConfidenceForActivation: 25,
    recencyDecayFactor: 0.95,
    regimeTransitionCooldown: 60000,    // 1 minute cooldown
    minTradesForRegimeScore: 10,
};

// ─── Strategy Roster ─────────────────────────────────────────

export class StrategyRoster {
    private readonly config: StrategyRosterConfig;
    private entries: Map<string, RosterEntry> = new Map();
    private activeStrategyId: string | null = null;
    private currentRegime: MarketRegime = MarketRegime.RANGING;
    private lastRegimeTransitionAt: number = 0;

    constructor(config: Partial<StrategyRosterConfig> = {}) {
        this.config = { ...DEFAULT_ROSTER_CONFIG, ...config };
    }

    // ─── Core Operations ──────────────────────────────────────

    /**
     * Add a validated strategy to the Roster.
     * Called when a strategy passes the 4-Gate Validation Pipeline.
     * The strategy is scored for its current regime and banked.
     */
    addToRoster(
        strategy: StrategyDNA,
        currentRegime: MarketRegime,
        trades: import('@/types').Trade[],
    ): RosterEntry {
        // Check if roster is full — evict worst performer
        if (this.entries.size >= this.config.maxRosterSize) {
            this.evictWorstEntry();
        }

        // Calculate regime-specific performance
        const metrics = evaluatePerformance(trades);
        const fitness = calculateFitnessScore(metrics, strategy);

        // Initialize regime performance map
        const regimePerformance = this.createEmptyRegimePerformance();
        regimePerformance[currentRegime] = metrics;

        // Initialize regime scores
        const regimeScores = this.createEmptyRegimeScores();
        regimeScores[currentRegime] = fitness;

        const entry: RosterEntry = {
            strategy,
            regimePerformance,
            bestRegime: currentRegime,
            regimeScores,
            state: RosterState.HIBERNATING,
            activationCount: 0,
            totalTradesWhileActive: 0,
            totalPnlContribution: 0,
            lastActivated: 0,
            lastHibernated: null,
            addedAt: Date.now(),
            confidenceScore: Math.min(100, fitness),
        };

        this.entries.set(strategy.id, entry);

        // If no active strategy and regime matches, auto-activate
        if (this.activeStrategyId === null && fitness >= this.config.minConfidenceForActivation) {
            this.activateStrategy(strategy.id);
        }

        return entry;
    }

    /**
     * Handle a market regime transition.
     * This is the key operation — when the regime changes, find the
     * best strategy in the Roster for the new conditions and activate it.
     *
     * Returns the newly activated strategy, or null if no suitable strategy exists.
     */
    handleRegimeTransition(newRegime: MarketRegime): RosterEntry | null {
        // Cooldown check — prevent rapid-fire switching
        const now = Date.now();
        if (now - this.lastRegimeTransitionAt < this.config.regimeTransitionCooldown) {
            return this.getActiveEntry();
        }

        const previousRegime = this.currentRegime;
        this.currentRegime = newRegime;
        this.lastRegimeTransitionAt = now;

        // If regime didn't actually change, no action needed
        if (previousRegime === newRegime) {
            return this.getActiveEntry();
        }

        // Hibernate current active strategy
        if (this.activeStrategyId !== null) {
            this.hibernateStrategy(this.activeStrategyId);
        }

        // Find best strategy for new regime
        const bestCandidate = this.findBestForRegime(newRegime);
        if (bestCandidate !== null) {
            this.activateStrategy(bestCandidate.strategy.id);
            return bestCandidate;
        }

        // No suitable strategy found — signal that evolution is needed
        return null;
    }

    /**
     * Update regime-specific performance for the active strategy.
     * Called after each trade completes while a Roster strategy is active.
     */
    recordTradeResult(
        strategyId: string,
        regime: MarketRegime,
        trades: import('@/types').Trade[],
    ): void {
        const entry = this.entries.get(strategyId);
        if (!entry) return;

        // Update regime-specific metrics
        const metrics = evaluatePerformance(trades);
        const fitness = calculateFitnessScore(metrics, entry.strategy);

        entry.regimePerformance[regime] = metrics;
        entry.regimeScores[regime] = this.calculateRegimeScore(
            fitness,
            entry.confidenceScore,
            entry.lastActivated,
        );

        entry.totalTradesWhileActive = trades.length;
        entry.totalPnlContribution = metrics.totalPnlUSD;

        // Recalculate best regime
        entry.bestRegime = this.findBestRegimeForEntry(entry);

        // Update confidence: successful trades increase confidence
        if (metrics.totalTrades >= this.config.minTradesForRegimeScore) {
            const performanceDelta = fitness > 50 ? 2 : fitness > 30 ? 0 : -3;
            entry.confidenceScore = Math.max(0, Math.min(100,
                entry.confidenceScore + performanceDelta,
            ));
        }
    }

    // ─── Strategy Lifecycle ───────────────────────────────────

    /**
     * Activate a strategy from the Roster.
     */
    activateStrategy(strategyId: string): boolean {
        const entry = this.entries.get(strategyId);
        if (!entry) return false;

        // Hibernate current active
        if (this.activeStrategyId !== null && this.activeStrategyId !== strategyId) {
            this.hibernateStrategy(this.activeStrategyId);
        }

        entry.state = RosterState.ACTIVE;
        entry.activationCount++;
        entry.lastActivated = Date.now();
        entry.lastHibernated = null;
        this.activeStrategyId = strategyId;

        return true;
    }

    /**
     * Hibernate a strategy — put it to sleep but keep it in the Roster.
     * The strategy can be reactivated when its regime returns.
     */
    hibernateStrategy(strategyId: string): boolean {
        const entry = this.entries.get(strategyId);
        if (!entry) return false;

        entry.state = RosterState.HIBERNATING;
        entry.lastHibernated = Date.now();

        if (this.activeStrategyId === strategyId) {
            this.activeStrategyId = null;
        }

        return true;
    }

    /**
     * Retire a strategy — mark it as permanently inactive.
     * Done when a strategy consistently fails across multiple regime reactivations.
     */
    retireStrategy(strategyId: string): boolean {
        const entry = this.entries.get(strategyId);
        if (!entry) return false;

        entry.state = RosterState.RETIRED;
        entry.lastHibernated = Date.now();

        if (this.activeStrategyId === strategyId) {
            this.activeStrategyId = null;
        }

        return true;
    }

    // ─── Query Methods ────────────────────────────────────────

    /**
     * Find the best strategy for a given regime.
     * Uses confidence-weighted regime scoring with recency decay.
     */
    findBestForRegime(regime: MarketRegime): RosterEntry | null {
        let bestEntry: RosterEntry | null = null;
        let bestScore = -1;

        for (const entry of this.entries.values()) {
            if (entry.state === RosterState.RETIRED) continue;

            const score = entry.regimeScores[regime];
            if (score > bestScore && score >= this.config.minConfidenceForActivation) {
                bestScore = score;
                bestEntry = entry;
            }
        }

        return bestEntry;
    }

    /**
     * Get strategies that cover a specific regime, sorted by score (descending).
     */
    getStrategiesForRegime(regime: MarketRegime): RosterEntry[] {
        const candidates: RosterEntry[] = [];

        for (const entry of this.entries.values()) {
            if (entry.state === RosterState.RETIRED) continue;
            if (entry.regimeScores[regime] > 0) {
                candidates.push(entry);
            }
        }

        return candidates.sort((a, b) => b.regimeScores[regime] - a.regimeScores[regime]);
    }

    /**
     * Get regimes that have NO coverage (no strategies in the Roster).
     * These are "blind spots" where evolution needs to focus.
     */
    getUncoveredRegimes(): MarketRegime[] {
        const allRegimes = Object.values(MarketRegime);
        return allRegimes.filter(regime => {
            const strategies = this.getStrategiesForRegime(regime);
            return strategies.length === 0;
        });
    }

    // ─── MRTI Integration ────────────────────────────────────

    /**
     * Phase 11: Pre-warm a strategy for a predicted future regime.
     * Called by MRTI when transitionRisk > prepareThreshold.
     *
     * Unlike handleRegimeTransition (which immediately switches),
     * this method IDENTIFIES the best candidate WITHOUT activating it.
     * The entry is returned so the Island can prepare for instant activation.
     *
     * Returns the pre-warmed RosterEntry, or null if no suitable candidate exists.
     */
    preWarmForRegime(predictedRegime: MarketRegime): RosterEntry | null {
        return this.findBestForRegime(predictedRegime);
    }

    /**
     * Phase 11: Check if roster has coverage for a predicted regime.
     * Used by Cortex to evaluate global regime risk.
     */
    hasCoverageForRegime(regime: MarketRegime): boolean {
        const best = this.findBestForRegime(regime);
        return best !== null;
    }

    /**
     * Get the currently active Roster entry.
     */
    getActiveEntry(): RosterEntry | null {
        if (this.activeStrategyId === null) return null;
        return this.entries.get(this.activeStrategyId) ?? null;
    }

    /**
     * Get the active strategy's DNA.
     */
    getActiveStrategy(): StrategyDNA | null {
        const entry = this.getActiveEntry();
        return entry?.strategy ?? null;
    }

    /**
     * Check if the Roster has a suitable strategy for a given regime.
     */
    hasStrategyForRegime(regime: MarketRegime): boolean {
        return this.findBestForRegime(regime) !== null;
    }

    /**
     * Get the current regime.
     */
    getCurrentRegime(): MarketRegime {
        return this.currentRegime;
    }

    /**
     * Get all Roster entries (for persistence or dashboard).
     */
    getAllEntries(): RosterEntry[] {
        return Array.from(this.entries.values());
    }

    /**
     * Get a full snapshot of the Roster for the dashboard.
     */
    getSnapshot(): RosterSnapshot {
        const entries = Array.from(this.entries.values());
        const activeEntry = this.getActiveEntry();
        const hibernating = entries.filter(e => e.state === RosterState.HIBERNATING);
        const retired = entries.filter(e => e.state === RosterState.RETIRED);

        // Calculate regime coverage
        const regimeCoverage = this.createEmptyRegimeScores();
        const bestFitnessPerRegime = this.createEmptyRegimeScores();

        for (const entry of entries) {
            if (entry.state === RosterState.RETIRED) continue;
            for (const regime of Object.values(MarketRegime)) {
                if (entry.regimeScores[regime] > 0) {
                    regimeCoverage[regime]++;
                    if (entry.regimeScores[regime] > bestFitnessPerRegime[regime]) {
                        bestFitnessPerRegime[regime] = entry.regimeScores[regime];
                    }
                }
            }
        }

        const totalRosterPnl = entries.reduce((sum, e) => sum + e.totalPnlContribution, 0);

        return {
            totalStrategies: entries.length,
            activeStrategy: activeEntry,
            hibernatingStrategies: hibernating,
            retiredCount: retired.length,
            regimeCoverage: regimeCoverage as Record<MarketRegime, number>,
            bestFitnessPerRegime: bestFitnessPerRegime as Record<MarketRegime, number>,
            totalRosterPnl: Math.round(totalRosterPnl * 100) / 100,
        };
    }

    // ─── Internal Methods ─────────────────────────────────────

    /**
     * Calculate confidence-weighted regime score.
     * Score = fitness × confidence × recency
     *
     * This ensures:
     * - High-fitness strategies rank higher
     * - Well-validated strategies rank higher
     * - Recently successful strategies rank higher
     */
    private calculateRegimeScore(
        fitness: number,
        confidence: number,
        lastActivatedAt: number,
    ): number {
        // Recency factor: decays over time
        const hoursSinceActivation = lastActivatedAt > 0
            ? (Date.now() - lastActivatedAt) / (1000 * 60 * 60)
            : 0;

        // Decay: 95% retention per hour (configurable)
        const recencyFactor = hoursSinceActivation > 0
            ? Math.pow(this.config.recencyDecayFactor, hoursSinceActivation / 24)
            : 1.0;

        // Confidence normalized to 0-1
        const confidenceFactor = confidence / 100;

        // Weighted score: fitness is primary, confidence and recency are modifiers
        const score = fitness * (0.6 + 0.25 * confidenceFactor + 0.15 * recencyFactor);

        return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
    }

    /**
     * Find the best regime for a Roster entry based on its regime scores.
     */
    private findBestRegimeForEntry(entry: RosterEntry): MarketRegime {
        let bestRegime = MarketRegime.RANGING;
        let bestScore = -1;

        for (const regime of Object.values(MarketRegime)) {
            if (entry.regimeScores[regime] > bestScore) {
                bestScore = entry.regimeScores[regime];
                bestRegime = regime;
            }
        }

        return bestRegime;
    }

    /**
     * Evict the worst-performing entry from the Roster.
     * Uses LRU + fitness: retires the entry with the lowest
     * combined score across all regimes that was least recently active.
     */
    private evictWorstEntry(): void {
        let worstId: string | null = null;
        let worstScore = Infinity;

        for (const [id, entry] of this.entries) {
            // Never evict the active strategy
            if (id === this.activeStrategyId) continue;

            // Calculate aggregate score: sum of all regime scores * recency
            const totalRegimeScore = Object.values(entry.regimeScores).reduce((s, v) => s + v, 0);
            const recencyPenalty = entry.lastActivated > 0
                ? 1 / (1 + (Date.now() - entry.lastActivated) / (1000 * 60 * 60 * 24))
                : 0.1;

            const combinedScore = totalRegimeScore * recencyPenalty;

            if (combinedScore < worstScore) {
                worstScore = combinedScore;
                worstId = id;
            }
        }

        if (worstId !== null) {
            this.retireStrategy(worstId);
            this.entries.delete(worstId);
        }
    }

    /**
     * Create an empty regime performance map.
     */
    private createEmptyRegimePerformance(): Record<MarketRegime, PerformanceMetrics | null> {
        return {
            [MarketRegime.TRENDING_UP]: null,
            [MarketRegime.TRENDING_DOWN]: null,
            [MarketRegime.RANGING]: null,
            [MarketRegime.HIGH_VOLATILITY]: null,
            [MarketRegime.LOW_VOLATILITY]: null,
        };
    }

    /**
     * Create an empty regime scores map.
     */
    private createEmptyRegimeScores(): Record<MarketRegime, number> {
        return {
            [MarketRegime.TRENDING_UP]: 0,
            [MarketRegime.TRENDING_DOWN]: 0,
            [MarketRegime.RANGING]: 0,
            [MarketRegime.HIGH_VOLATILITY]: 0,
            [MarketRegime.LOW_VOLATILITY]: 0,
        };
    }
}
