// ============================================================
// Learner: Predictive Orchestrator — MRTI ↔ Overmind Bridge
// ============================================================
// Radical Innovation #6: Predictive Strategic Pre-Positioning (PSPP)
//
// Bridges MRTI's real-time regime transition forecasts into the
// Overmind's hypothesis/directive pipeline. When MRTI detects an
// imminent regime change (transitionRisk > threshold), this module:
//   1. Translates the forecast into pre-positioning actions
//   2. Generates targeted hypotheses for the PREDICTED regime
//   3. Tracks prediction accuracy for self-calibration
//   4. Records episodes in Episodic Memory for CCR learning
//
// This transforms the system from REACTIVE (switch after change)
// to ANTICIPATORY (prepare before change).
//
// Council: López de Prado, Hamilton, Lo, Sutton, Taleb, Dalio
// ============================================================

import { type MarketRegime, type Timeframe, IndicatorType } from '@/types';
import {
    type PrePositionAction,
    type PredictionRecord,
    type PredictionAccuracy,
    type MarketHypothesis,
    type OvermindIslandContext,
    HypothesisStatus,
} from '@/types/overmind';
import { type RegimeTransitionForecast } from '../regime-intelligence';

// ─── Configuration ───────────────────────────────────────────

interface PredictiveOrchestratorConfig {
    /** Transition risk threshold to trigger PREPARE-level pre-positioning (0-1) */
    prepareRiskThreshold: number;
    /** Transition risk threshold to trigger SWITCH-level pre-positioning (0-1) */
    switchRiskThreshold: number;
    /** Maximum number of concurrent pre-positioning actions */
    maxConcurrentPrePositions: number;
    /** How many candles before a pre-position expires if no transition occurred */
    expirationCandles: number;
    /** Cooldown (in cycles) after a pre-position is resolved for the same slot */
    slotCooldownCycles: number;
    /** Maximum number of prediction records to retain */
    maxPredictionHistory: number;
}

const DEFAULT_CONFIG: PredictiveOrchestratorConfig = {
    prepareRiskThreshold: 0.35,
    switchRiskThreshold: 0.65,
    maxConcurrentPrePositions: 6,
    expirationCandles: 200,
    slotCooldownCycles: 3,
    maxPredictionHistory: 100,
};

// ─── Regime → Indicator Bias Map ─────────────────────────────

/** Maps predicted regimes to suggested indicators for pre-positioning hypotheses */
const REGIME_INDICATOR_BIAS: Record<MarketRegime, {
    preferred: IndicatorType[];
    description: string;
}> = {
    TRENDING_UP: {
        preferred: [IndicatorType.EMA, IndicatorType.MACD, IndicatorType.ADX],
        description: 'Trend-following indicators for uptrend capture',
    },
    TRENDING_DOWN: {
        preferred: [IndicatorType.EMA, IndicatorType.MACD, IndicatorType.ADX],
        description: 'Trend-following indicators for downtrend capture',
    },
    RANGING: {
        preferred: [IndicatorType.RSI, IndicatorType.BOLLINGER, IndicatorType.STOCH_RSI],
        description: 'Mean-reversion indicators for range-bound markets',
    },
    HIGH_VOLATILITY: {
        preferred: [IndicatorType.ATR, IndicatorType.BOLLINGER, IndicatorType.ADX],
        description: 'Volatility-aware indicators for turbulent markets',
    },
    LOW_VOLATILITY: {
        preferred: [IndicatorType.RSI, IndicatorType.EMA, IndicatorType.STOCH_RSI],
        description: 'Tight-range indicators for calm markets',
    },
};

// ─── Predictive Orchestrator ─────────────────────────────────

export class PredictiveOrchestrator {
    private readonly config: PredictiveOrchestratorConfig;
    /** Active and historical pre-positioning actions */
    private prePositions: Map<string, PrePositionAction> = new Map();
    /** Cooldown tracker: slotId → remaining cooldown cycles */
    private slotCooldowns: Map<string, number> = new Map();
    /** Prediction accuracy records */
    private predictionHistory: PredictionRecord[] = [];
    /** Previous forecasts per island (for detecting regime changes) */
    private previousRegimes: Map<string, MarketRegime> = new Map();

    constructor(config: Partial<PredictiveOrchestratorConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ═════════════════════════════════════════════════════════
    // PUBLIC API
    // ═════════════════════════════════════════════════════════

    /**
     * Ingest MRTI forecasts from all islands and determine which islands
     * need pre-positioning. This is called during the Overmind's OBSERVE phase.
     *
     * Returns slots that need pre-positioning action.
     */
    evaluateForecasts(
        forecasts: Map<string, RegimeTransitionForecast>,
        islandContexts: OvermindIslandContext[],
    ): PrePositionAction[] {
        const newActions: PrePositionAction[] = [];

        // First: resolve any existing pre-positions where regime actually changed
        this.resolveCompletedPrePositions(forecasts);

        // Second: expire stale pre-positions
        this.expireStalePrePositions();

        // Third: tick down cooldowns
        this.tickCooldowns();

        // Fourth: evaluate each island for new pre-positioning needs
        for (const [slotId, forecast] of forecasts) {
            // Check if this slot is on cooldown
            if ((this.slotCooldowns.get(slotId) ?? 0) > 0) continue;

            // Check if we already have an active pre-position for this slot
            if (this.hasActivePrePosition(slotId)) continue;

            // Check concurrent limit
            if (this.getActivePrePositions().length >= this.config.maxConcurrentPrePositions) break;

            // Check if forecast warrants pre-positioning
            if (forecast.recommendation === 'HOLD') continue;
            if (forecast.transitionRisk < this.config.prepareRiskThreshold) continue;

            // Find island context for this slot
            const ctx = islandContexts.find(i => i.slotId === slotId);
            if (!ctx) continue;

            // Create pre-positioning action
            const action = this.createPrePositionAction(slotId, ctx, forecast);
            this.prePositions.set(action.id, action);
            newActions.push(action);
        }

        return newActions;
    }

    /**
     * Generate pre-positioning hypotheses for the given actions.
     * These hypotheses are optimized for the PREDICTED regime.
     */
    generatePrePositionHypotheses(
        actions: PrePositionAction[],
        islandContexts: OvermindIslandContext[],
    ): MarketHypothesis[] {
        const hypotheses: MarketHypothesis[] = [];

        for (const action of actions) {
            const ctx = islandContexts.find(i => i.slotId === action.slotId);
            if (!ctx) continue;

            const regimeBias = REGIME_INDICATOR_BIAS[action.predictedRegime];
            if (!regimeBias) continue;

            // Generate a hypothesis tailored to the predicted regime
            const hypothesis: MarketHypothesis = {
                id: `PSP-${action.id}`,
                slotId: action.slotId,
                pair: action.pair,
                timeframe: ctx.timeframe as Timeframe,
                regime: action.predictedRegime,
                hypothesis: `Pre-positioning: ${action.pair} rejim geçişi yaklaşıyor `
                    + `(risk: ${(action.transitionRisk * 100).toFixed(0)}%). `
                    + `${action.currentRegime} → ${action.predictedRegime} geçişi bekleniyor. `
                    + `${regimeBias.description} ile ön-hazırlık yapılmalı.`,
                confidence: Math.min(0.9, action.transitionRisk * 1.2),
                evidence: [
                    {
                        type: 'regime',
                        description: `MRTI transition risk: ${(action.transitionRisk * 100).toFixed(1)}%`,
                        weight: action.transitionRisk,
                    },
                    {
                        type: 'historical',
                        description: `Estimated ${action.estimatedCandlesRemaining} candles remaining in ${action.currentRegime}`,
                        weight: 0.5,
                    },
                    ...action.activeWarnings.map(w => ({
                        type: 'technical' as const,
                        description: `Early warning: ${w}`,
                        weight: 0.6,
                    })),
                ],
                suggestedDNA: {},
                suggestedIndicators: regimeBias.preferred,
                status: HypothesisStatus.PROPOSED,
                seedStrategyId: null,
                outcome: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            // Link hypothesis to the pre-position action
            action.prePositionHypothesisId = hypothesis.id;
            action.status = 'active';

            hypotheses.push(hypothesis);
        }

        return hypotheses;
    }

    /**
     * Resolve a pre-positioning action when the actual regime change is observed.
     * Called by the Overmind when MRTI detects that the regime DID change.
     */
    resolvePrediction(
        slotId: string,
        actualRegime: MarketRegime,
        prePositionedFitness: number | null,
    ): void {
        const activeAction = this.getActivePrePositionForSlot(slotId);
        if (!activeAction) return;

        const correct = activeAction.predictedRegime === actualRegime;
        activeAction.predictionCorrect = correct;
        activeAction.actualRegime = actualRegime;
        activeAction.prePositionedFitness = prePositionedFitness;
        activeAction.status = correct ? 'resolved_correct' : 'resolved_incorrect';
        activeAction.resolvedAt = Date.now();

        // Record prediction accuracy
        this.predictionHistory.push({
            slotId,
            predictedRegime: activeAction.predictedRegime,
            actualRegime,
            transitionRisk: activeAction.transitionRisk,
            correct,
            timestamp: Date.now(),
        });

        // Trim history
        if (this.predictionHistory.length > this.config.maxPredictionHistory) {
            this.predictionHistory = this.predictionHistory.slice(-this.config.maxPredictionHistory);
        }

        // Set cooldown for this slot
        this.slotCooldowns.set(slotId, this.config.slotCooldownCycles);
    }

    // ═════════════════════════════════════════════════════════
    // QUERY API (for Dashboard + Snapshot)
    // ═════════════════════════════════════════════════════════

    /** Get all currently active (pending or active) pre-positioning actions */
    getActivePrePositions(): PrePositionAction[] {
        return Array.from(this.prePositions.values())
            .filter(p => p.status === 'pending' || p.status === 'active');
    }

    /** Get all pre-positioning actions (including resolved) */
    getAllPrePositions(): PrePositionAction[] {
        return Array.from(this.prePositions.values());
    }

    /** Get prediction accuracy statistics */
    getPredictionAccuracy(): PredictionAccuracy {
        const total = this.predictionHistory.length;
        const correct = this.predictionHistory.filter(p => p.correct).length;

        // Per-regime accuracy
        const perRegime: Record<string, { total: number; correct: number; rate: number }> = {};
        for (const record of this.predictionHistory) {
            const key = record.predictedRegime;
            if (!perRegime[key]) {
                perRegime[key] = { total: 0, correct: 0, rate: 0 };
            }
            perRegime[key].total++;
            if (record.correct) perRegime[key].correct++;
            perRegime[key].rate = perRegime[key].total > 0
                ? perRegime[key].correct / perRegime[key].total
                : 0;
        }

        return {
            totalPredictions: total,
            correctPredictions: correct,
            accuracyRate: total > 0 ? correct / total : 0,
            perRegimeAccuracy: perRegime as PredictionAccuracy['perRegimeAccuracy'],
            recentPredictions: this.predictionHistory.slice(-20),
        };
    }

    /** Get count of islands with imminent transitions (for snapshot) */
    getImminentTransitionCount(): number {
        return this.getActivePrePositions().length;
    }

    /** Check if a slot has an active pre-position */
    hasActivePrePosition(slotId: string): boolean {
        return this.getActivePrePositions().some(p => p.slotId === slotId);
    }

    // ═════════════════════════════════════════════════════════
    // SERIALIZATION (for persistence)
    // ═════════════════════════════════════════════════════════

    /** Serialize for IndexedDB / Supabase persistence */
    serialize(): {
        prePositions: PrePositionAction[];
        predictionHistory: PredictionRecord[];
        slotCooldowns: Record<string, number>;
        previousRegimes: Record<string, MarketRegime>;
    } {
        return {
            prePositions: Array.from(this.prePositions.values()),
            predictionHistory: this.predictionHistory,
            slotCooldowns: Object.fromEntries(this.slotCooldowns),
            previousRegimes: Object.fromEntries(this.previousRegimes),
        };
    }

    /** Deserialize from persistence */
    deserialize(data: {
        prePositions?: PrePositionAction[];
        predictionHistory?: PredictionRecord[];
        slotCooldowns?: Record<string, number>;
        previousRegimes?: Record<string, MarketRegime>;
    }): void {
        if (data.prePositions) {
            this.prePositions.clear();
            for (const p of data.prePositions) {
                this.prePositions.set(p.id, p);
            }
        }
        if (data.predictionHistory) {
            this.predictionHistory = data.predictionHistory;
        }
        if (data.slotCooldowns) {
            this.slotCooldowns = new Map(Object.entries(data.slotCooldowns).map(
                ([k, v]) => [k, v as number],
            ));
        }
        if (data.previousRegimes) {
            this.previousRegimes = new Map(Object.entries(data.previousRegimes) as [string, MarketRegime][]);
        }
    }

    // ═════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═════════════════════════════════════════════════════════

    /** Create a new pre-position action from MRTI forecast */
    private createPrePositionAction(
        slotId: string,
        ctx: OvermindIslandContext,
        forecast: RegimeTransitionForecast,
    ): PrePositionAction {
        const triggerRec = forecast.transitionRisk >= this.config.switchRiskThreshold
            ? 'SWITCH' as const
            : 'PREPARE' as const;

        return {
            id: `PSP-${slotId}-${Date.now()}`,
            slotId,
            pair: ctx.pair,
            currentRegime: forecast.currentRegime,
            predictedRegime: forecast.predictedNextRegime,
            transitionRisk: forecast.transitionRisk,
            estimatedCandlesRemaining: forecast.estimatedCandlesRemaining,
            triggerRecommendation: triggerRec,
            activeWarnings: forecast.earlyWarnings.map(w => w.description),
            prePositionHypothesisId: null,
            status: 'pending',
            predictionCorrect: null,
            actualRegime: null,
            prePositionedFitness: null,
            createdAt: Date.now(),
            resolvedAt: null,
        };
    }

    /** Resolve pre-positions where we can detect regime has changed */
    private resolveCompletedPrePositions(
        forecasts: Map<string, RegimeTransitionForecast>,
    ): void {
        for (const action of this.getActivePrePositions()) {
            const currentForecast = forecasts.get(action.slotId);
            if (!currentForecast) continue;

            const previousRegime = this.previousRegimes.get(action.slotId);
            const currentRegime = currentForecast.currentRegime;

            // Check if regime actually changed since pre-position was created
            if (previousRegime && previousRegime !== currentRegime
                && action.currentRegime === previousRegime) {
                this.resolvePrediction(action.slotId, currentRegime, null);
            }
        }

        // Update previous regimes
        for (const [slotId, forecast] of forecasts) {
            this.previousRegimes.set(slotId, forecast.currentRegime);
        }
    }

    /** Expire pre-positions that have been pending too long */
    private expireStalePrePositions(): void {
        const now = Date.now();
        for (const action of this.getActivePrePositions()) {
            // Estimate time elapsed in candles (rough: 1 candle ≈ 60s for 1m, varies)
            const ageMs = now - action.createdAt;
            const ageMinutes = ageMs / 60_000;

            // If action has been active for more than expirationCandles worth of time
            // Use generous estimate: assume 1 candle = 1 minute for safety
            if (ageMinutes > this.config.expirationCandles) {
                action.status = 'expired';
                action.resolvedAt = now;
            }
        }
    }

    /** Tick down cooldowns by one cycle */
    private tickCooldowns(): void {
        for (const [slotId, remaining] of this.slotCooldowns) {
            if (remaining <= 1) {
                this.slotCooldowns.delete(slotId);
            } else {
                this.slotCooldowns.set(slotId, remaining - 1);
            }
        }
    }

    /** Get the active pre-position for a specific slot */
    private getActivePrePositionForSlot(slotId: string): PrePositionAction | undefined {
        return this.getActivePrePositions().find(p => p.slotId === slotId);
    }
}
