// ============================================================
// Learner: Forensic Learning Engine — Closed-Loop Intelligence
// ============================================================
// Phase 12.1: CLOSES the feedback loop.
//
// Trade Forensics extracts lessons from every trade. This engine
// aggregates those lessons into Bayesian beliefs and converts
// them into concrete fitness modifiers that the Evolution Engine
// uses when scoring strategies.
//
// BEFORE: Trade → Forensics → Lessons → [DEAD END]
// AFTER:  Trade → Forensics → Lessons → Beliefs → Fitness Modifiers → Evolution
//
// Council: David Blei (Bayesian), Rich Sutton (credit assignment),
//          López de Prado (forensics), Andrew Lo (adaptive)
// ============================================================

import {
    MarketRegime,
    TradeLessonType,
    TradeLesson,
    StrategyDNA,
} from '@/types';

// ─── Configuration ───────────────────────────────────────────

export interface ForensicLearningConfig {
    maxBeliefs: number;                     // Max belief entries to store
    decayRate: number;                      // Exponential decay per generation (0.98 = 2% per gen)
    minConfidence: number;                  // Minimum confidence to apply modifier
    minSamples: number;                     // Minimum lesson count to form a belief
    maxModifier: number;                    // Max fitness modifier (±)
    forgettingThreshold: number;            // Belief weight below this = forgotten
}

export const DEFAULT_LEARNING_CONFIG: ForensicLearningConfig = {
    maxBeliefs: 300,
    decayRate: 0.98,
    minConfidence: 0.4,
    minSamples: 3,
    maxModifier: 10,
    forgettingThreshold: 0.05,
};

// ─── Belief Types ────────────────────────────────────────────

/**
 * A single Bayesian belief formed from accumulated trade lessons.
 * Beliefs represent the system's learned understanding of strategy-regime
 * interactions and are used to modify fitness scores.
 */
interface ForensicBelief {
    id: string;                             // regime:lessonType composite key
    regime: MarketRegime;
    lessonType: TradeLessonType;
    sampleCount: number;                    // How many lessons contributed
    avgSeverity: number;                    // Average severity of contributing lessons
    avgConfidence: number;                  // Average confidence of lessons
    weight: number;                         // Bayesian weight (decays over time)
    lastUpdated: number;                    // Timestamp of last lesson ingestion
    generationAtLastUpdate: number;         // Generation when last updated
}

// ─── Modifier Weights ────────────────────────────────────────

/**
 * Each lesson type has a base modifier direction and magnitude.
 * NEGATIVE = penalize matching strategies.
 * POSITIVE = reward matching strategies.
 */
const LESSON_TYPE_MODIFIERS: Record<TradeLessonType, {
    direction: number;         // -1 or +1
    maxMagnitude: number;      // Max points this lesson type can contribute
    appliesToSimilarDNA: boolean; // Does this modifier affect strategies with similar genes?
}> = {
    [TradeLessonType.AVOID_REGIME]: {
        direction: -1,
        maxMagnitude: 5,
        appliesToSimilarDNA: false, // Regime-wide penalty, not DNA-specific
    },
    [TradeLessonType.PREFER_REGIME]: {
        direction: +1,
        maxMagnitude: 4,
        appliesToSimilarDNA: false,
    },
    [TradeLessonType.TIGHTEN_SL]: {
        direction: -1,
        maxMagnitude: 3,
        appliesToSimilarDNA: true, // Penalize strategies with wide SL genes
    },
    [TradeLessonType.LOOSEN_SL]: {
        direction: -1,
        maxMagnitude: 3,
        appliesToSimilarDNA: true, // Penalize strategies with tight SL genes
    },
    [TradeLessonType.IMPROVE_ENTRY]: {
        direction: -1,
        maxMagnitude: 2,
        appliesToSimilarDNA: true,
    },
    [TradeLessonType.IMPROVE_EXIT]: {
        direction: -1,
        maxMagnitude: 2,
        appliesToSimilarDNA: true,
    },
    [TradeLessonType.INDICATOR_UNRELIABLE]: {
        direction: -1,
        maxMagnitude: 4,
        appliesToSimilarDNA: true,
    },
    [TradeLessonType.REGIME_TRANSITION_RISK]: {
        direction: -1,
        maxMagnitude: 3,
        appliesToSimilarDNA: false,
    },
};

// ─── Forensic Learning Engine ────────────────────────────────

/**
 * Aggregates trade forensic lessons into Bayesian beliefs and
 * converts them into fitness modifiers for the Evolution Engine.
 *
 * This is the component that CLOSES the feedback loop:
 * Lessons → Beliefs → Fitness Modifiers → Smarter Evolution
 */
export class ForensicLearningEngine {
    private readonly config: ForensicLearningConfig;
    private beliefs: Map<string, ForensicBelief> = new Map();
    private currentGeneration: number = 0;
    private totalLessonsIngested: number = 0;

    constructor(config: Partial<ForensicLearningConfig> = {}) {
        this.config = { ...DEFAULT_LEARNING_CONFIG, ...config };
    }

    // ── Lesson Ingestion ─────────────────────────────────────

    /**
     * Ingest a batch of lessons from a trade forensic report.
     * Each lesson updates the corresponding belief via Bayesian update.
     */
    ingestLessons(lessons: TradeLesson[]): void {
        for (const lesson of lessons) {
            this.ingestSingleLesson(lesson);
        }
    }

    /**
     * Ingest a single lesson and update the corresponding belief.
     */
    private ingestSingleLesson(lesson: TradeLesson): void {
        const beliefId = `${lesson.regime}:${lesson.type}`;
        const existing = this.beliefs.get(beliefId);

        if (existing) {
            // Bayesian update: weighted running average
            const totalWeight = existing.sampleCount + 1;
            existing.avgSeverity =
                (existing.avgSeverity * existing.sampleCount + lesson.severity) / totalWeight;
            existing.avgConfidence =
                (existing.avgConfidence * existing.sampleCount + lesson.confidence) / totalWeight;
            existing.sampleCount = totalWeight;
            existing.weight = Math.min(1, existing.weight + 0.1); // Strengthen with evidence
            existing.lastUpdated = Date.now();
            existing.generationAtLastUpdate = this.currentGeneration;
        } else {
            // New belief
            const belief: ForensicBelief = {
                id: beliefId,
                regime: lesson.regime,
                lessonType: lesson.type,
                sampleCount: 1,
                avgSeverity: lesson.severity,
                avgConfidence: lesson.confidence,
                weight: 0.3, // Low initial weight (need evidence)
                lastUpdated: Date.now(),
                generationAtLastUpdate: this.currentGeneration,
            };
            this.beliefs.set(beliefId, belief);
        }

        this.totalLessonsIngested++;

        // Evict weak beliefs if over capacity
        if (this.beliefs.size > this.config.maxBeliefs) {
            this.evictWeakestBeliefs();
        }
    }

    // ── Fitness Modifier Calculation ─────────────────────────

    /**
     * Calculate the forensic fitness modifier for a strategy in a given regime.
     * Returns a number from -maxModifier to +maxModifier that should be
     * ADDED to the strategy's fitness score.
     *
     * This is the core output of the learning engine — the signal that
     * closes the feedback loop.
     */
    calculateForensicModifier(
        strategy: StrategyDNA,
        regime: MarketRegime,
    ): number {
        if (this.beliefs.size === 0) return 0;

        let totalModifier = 0;

        for (const [, belief] of this.beliefs) {
            // Only apply beliefs for the current regime
            if (belief.regime !== regime) continue;

            // Check minimum confidence and samples
            if (belief.avgConfidence < this.config.minConfidence) continue;
            if (belief.sampleCount < this.config.minSamples) continue;

            const lessonConfig = LESSON_TYPE_MODIFIERS[belief.lessonType];

            // Check DNA similarity for DNA-specific modifiers
            if (lessonConfig.appliesToSimilarDNA) {
                const similarity = this.assessDNASimilarity(strategy, belief);
                if (similarity < 0.3) continue; // Not similar enough — skip
            }

            // Calculate this belief's contribution
            const magnitude = belief.avgSeverity
                * belief.weight
                * belief.avgConfidence
                * lessonConfig.maxMagnitude;

            totalModifier += lessonConfig.direction * magnitude;
        }

        // Clamp to configured max
        return Math.round(
            Math.max(-this.config.maxModifier, Math.min(this.config.maxModifier, totalModifier))
            * 100
        ) / 100;
    }

    // ── DNA Similarity Assessment ────────────────────────────

    /**
     * Assess how similar a strategy's DNA is to the patterns that
     * generated a particular belief. Uses structural trait matching.
     *
     * Returns 0-1 (0 = no match, 1 = exact pattern match).
     */
    private assessDNASimilarity(strategy: StrategyDNA, belief: ForensicBelief): number {
        let matchScore = 0;
        let checkCount = 0;

        // ── SL-related beliefs: check risk gene similarity ──
        if (belief.lessonType === TradeLessonType.TIGHTEN_SL) {
            checkCount++;
            // Strategies with wide SL (high stopLoss%) match this belief
            if (strategy.riskGenes.stopLossPercent > 3) {
                matchScore += 1;
            } else if (strategy.riskGenes.stopLossPercent > 2) {
                matchScore += 0.5;
            }
        }

        if (belief.lessonType === TradeLessonType.LOOSEN_SL) {
            checkCount++;
            // Strategies with tight SL (low stopLoss%) match this belief
            if (strategy.riskGenes.stopLossPercent < 1.5) {
                matchScore += 1;
            } else if (strategy.riskGenes.stopLossPercent < 2) {
                matchScore += 0.5;
            }
        }

        // ── Indicator-related beliefs: check indicator overlap ──
        if (belief.lessonType === TradeLessonType.INDICATOR_UNRELIABLE) {
            checkCount++;
            // All strategies with indicators match somewhat
            // (specific indicator matching would need lesson details we don't store yet)
            matchScore += strategy.indicators.length > 2 ? 0.6 : 0.3;
        }

        // ── Entry/Exit beliefs: basic match ──
        if (belief.lessonType === TradeLessonType.IMPROVE_ENTRY ||
            belief.lessonType === TradeLessonType.IMPROVE_EXIT) {
            checkCount++;
            // All strategies match entry/exit lessons to some extent
            matchScore += 0.4;
        }

        if (checkCount === 0) return 0.5; // Default moderate match for unspecified types
        return matchScore / checkCount;
    }

    // ── Generation Lifecycle ─────────────────────────────────

    /**
     * Called when a new generation starts.
     * Applies temporal decay to all beliefs (forgetting curve).
     */
    advanceGeneration(): void {
        this.currentGeneration++;

        for (const [id, belief] of this.beliefs) {
            // Exponential decay: older beliefs weaken
            const generationsSinceUpdate =
                this.currentGeneration - belief.generationAtLastUpdate;
            belief.weight *= Math.pow(this.config.decayRate, generationsSinceUpdate);

            // Forget very weak beliefs
            if (belief.weight < this.config.forgettingThreshold) {
                this.beliefs.delete(id);
            }
        }
    }

    // ── Maintenance ──────────────────────────────────────────

    /**
     * Evict the weakest beliefs when over capacity.
     */
    private evictWeakestBeliefs(): void {
        const sorted = Array.from(this.beliefs.entries())
            .sort(([, a], [, b]) => a.weight - b.weight);

        const toEvict = sorted.slice(0, sorted.length - this.config.maxBeliefs);
        for (const [id] of toEvict) {
            this.beliefs.delete(id);
        }
    }

    // ── Query / Stats ────────────────────────────────────────

    /**
     * Get all active beliefs for a regime.
     */
    getBeliefsForRegime(regime: MarketRegime): ForensicBelief[] {
        return Array.from(this.beliefs.values())
            .filter(b => b.regime === regime)
            .sort((a, b) => b.weight - a.weight);
    }

    /**
     * Get the strongest beliefs across all regimes.
     */
    getStrongestBeliefs(topN: number = 10): ForensicBelief[] {
        return Array.from(this.beliefs.values())
            .sort((a, b) => b.weight * b.avgSeverity - a.weight * a.avgSeverity)
            .slice(0, topN);
    }

    /**
     * Get learning engine statistics.
     */
    getStats(): {
        totalBeliefs: number;
        totalLessonsIngested: number;
        currentGeneration: number;
        beliefsByRegime: Record<string, number>;
        strongestBelief: { regime: string; type: string; weight: number } | null;
    } {
        const beliefsByRegime: Record<string, number> = {};
        let strongestBelief: { regime: string; type: string; weight: number } | null = null;
        let maxWeight = 0;

        for (const [, belief] of this.beliefs) {
            beliefsByRegime[belief.regime] = (beliefsByRegime[belief.regime] ?? 0) + 1;
            const effectiveWeight = belief.weight * belief.avgSeverity;
            if (effectiveWeight > maxWeight) {
                maxWeight = effectiveWeight;
                strongestBelief = {
                    regime: belief.regime,
                    type: belief.lessonType,
                    weight: Math.round(effectiveWeight * 1000) / 1000,
                };
            }
        }

        return {
            totalBeliefs: this.beliefs.size,
            totalLessonsIngested: this.totalLessonsIngested,
            currentGeneration: this.currentGeneration,
            beliefsByRegime,
            strongestBelief,
        };
    }

    /**
     * Check if the engine has enough data to produce meaningful modifiers.
     */
    hasLearned(): boolean {
        return this.totalLessonsIngested >= this.config.minSamples;
    }
}
