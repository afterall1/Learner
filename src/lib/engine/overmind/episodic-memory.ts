// ============================================================
// Learner: Episodic Memory — Persistent Decision History
// ============================================================
// Radical Innovation #4 (CCR): Stores structured episodes of
// every Overmind decision with full context → action → outcome.
// Enables the Overmind to remember what it tried before and
// learn from its own successes and failures across sessions.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type Episode,
    type EpisodeType,
    type EpisodeContext,
    type EpisodeAction,
    type EpisodeOutcome,
} from '@/types/overmind';
import { type MarketRegime, type Timeframe } from '@/types';

// ─── Configuration ───────────────────────────────────────────

interface EpisodicMemoryConfig {
    /** Maximum number of episodes to retain */
    maxEpisodes: number;
    /** Minimum importance score to avoid eviction */
    minImportanceForRetention: number;
    /** How quickly importance decays per cycle (multiplier) */
    importanceDecayRate: number;
}

const DEFAULT_CONFIG: EpisodicMemoryConfig = {
    maxEpisodes: 500,
    minImportanceForRetention: 0.1,
    importanceDecayRate: 0.98,
};

// ─── Episodic Memory ─────────────────────────────────────────

export class EpisodicMemory {
    private episodes: Map<string, Episode> = new Map();
    private readonly config: EpisodicMemoryConfig;

    constructor(config: Partial<EpisodicMemoryConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ─── Recording ───────────────────────────────────────────

    /**
     * Record a new episode when the Overmind makes a decision.
     * Outcome is null initially — will be resolved later.
     */
    recordEpisode(
        type: EpisodeType,
        slotId: string,
        context: EpisodeContext,
        action: EpisodeAction,
    ): Episode {
        const episode: Episode = {
            id: uuidv4(),
            type,
            timestamp: Date.now(),
            slotId,
            context,
            action,
            outcome: null,
            reflection: null,
            importanceScore: this.calculateInitialImportance(type, context),
        };

        this.episodes.set(episode.id, episode);

        // Prune if over capacity
        if (this.episodes.size > this.config.maxEpisodes) {
            this.prune();
        }

        return episode;
    }

    /**
     * Resolve the outcome of a previously recorded episode.
     * Called when generation results arrive after the episode was created.
     */
    resolveOutcome(episodeId: string, outcome: EpisodeOutcome): void {
        const episode = this.episodes.get(episodeId);
        if (!episode) return;

        episode.outcome = outcome;

        // Update importance based on outcome magnitude
        const fitnessImpact = Math.abs(outcome.fitnessChange);
        if (fitnessImpact > 10) {
            // High-impact episodes are more important to remember
            episode.importanceScore = Math.min(1.0, episode.importanceScore + 0.2);
        }

        // Failures with clear causal attribution are extremely valuable
        if (!outcome.wasSuccessful && outcome.causalFactors.length > 0) {
            episode.importanceScore = Math.min(1.0, episode.importanceScore + 0.3);
        }
    }

    /**
     * Add a reflection to an episode (from Opus 4.6 counterfactual analysis).
     */
    addReflection(episodeId: string, reflection: string): void {
        const episode = this.episodes.get(episodeId);
        if (!episode) return;
        episode.reflection = reflection;
    }

    // ─── Queries ─────────────────────────────────────────────

    /**
     * Find episodes with similar context to a given context.
     * Uses cosine-like similarity on normalized context vectors.
     */
    findSimilarEpisodes(
        context: EpisodeContext,
        topN: number = 5,
    ): Episode[] {
        const scored: Array<{ episode: Episode; similarity: number }> = [];

        for (const episode of this.episodes.values()) {
            if (!episode.outcome) continue; // Only resolved episodes
            const similarity = this.contextSimilarity(context, episode.context);
            scored.push({ episode, similarity });
        }

        return scored
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topN)
            .map(s => s.episode);
    }

    /**
     * Get all episodes for a specific trading pair.
     */
    getEpisodesForPair(pair: string): Episode[] {
        return Array.from(this.episodes.values())
            .filter(e => e.context.pair === pair)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get all episodes for a specific market regime.
     */
    getEpisodesForRegime(regime: MarketRegime): Episode[] {
        return Array.from(this.episodes.values())
            .filter(e => e.context.regime === regime)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get the N most recent episodes.
     */
    getRecentEpisodes(n: number = 10): Episode[] {
        return Array.from(this.episodes.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, n);
    }

    /**
     * Get the N episodes with worst fitness outcomes (for counterfactual analysis).
     */
    getWorstEpisodes(n: number = 5): Episode[] {
        return Array.from(this.episodes.values())
            .filter(e => e.outcome !== null)
            .sort((a, b) => (a.outcome!.fitnessChange) - (b.outcome!.fitnessChange))
            .slice(0, n);
    }

    /**
     * Get episodes with pending outcomes.
     */
    getPendingEpisodes(): Episode[] {
        return Array.from(this.episodes.values())
            .filter(e => e.outcome === null);
    }

    /**
     * Get episodes by type.
     */
    getEpisodesByType(type: EpisodeType): Episode[] {
        return Array.from(this.episodes.values())
            .filter(e => e.type === type)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get resolved episodes for a specific pair + regime combination.
     */
    getResolvedEpisodesForContext(pair: string, regime: MarketRegime | null): Episode[] {
        return Array.from(this.episodes.values())
            .filter(e =>
                e.outcome !== null &&
                e.context.pair === pair &&
                (regime === null || e.context.regime === regime),
            )
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get total episode count.
     */
    size(): number {
        return this.episodes.size;
    }

    /**
     * Calculate success rate across all resolved episodes.
     */
    getSuccessRate(): number {
        const resolved = Array.from(this.episodes.values())
            .filter(e => e.outcome !== null);
        if (resolved.length === 0) return 0;
        const successes = resolved.filter(e => e.outcome!.wasSuccessful).length;
        return successes / resolved.length;
    }

    /**
     * Calculate average fitness change across resolved episodes.
     */
    getAverageFitnessChange(): number {
        const resolved = Array.from(this.episodes.values())
            .filter(e => e.outcome !== null);
        if (resolved.length === 0) return 0;
        const total = resolved.reduce((sum, e) => sum + e.outcome!.fitnessChange, 0);
        return total / resolved.length;
    }

    // ─── Lifecycle ───────────────────────────────────────────

    /**
     * Apply importance decay to all episodes.
     * Called once per Overmind cycle.
     */
    decayImportance(): void {
        for (const episode of this.episodes.values()) {
            episode.importanceScore *= this.config.importanceDecayRate;
        }
    }

    /**
     * Prune lowest-importance episodes to maintain capacity.
     */
    private prune(): void {
        const episodes = Array.from(this.episodes.values())
            .sort((a, b) => a.importanceScore - b.importanceScore);

        const toRemove = episodes.length - this.config.maxEpisodes;
        for (let i = 0; i < toRemove; i++) {
            const episode = episodes[i];
            if (episode.importanceScore < this.config.minImportanceForRetention) {
                this.episodes.delete(episode.id);
            }
        }
    }

    // ─── Persistence ─────────────────────────────────────────

    /**
     * Serialize all episodes for persistence (IndexedDB / Supabase).
     */
    serialize(): Episode[] {
        return Array.from(this.episodes.values());
    }

    /**
     * Deserialize episodes from persistence.
     */
    deserialize(episodes: Episode[]): void {
        this.episodes.clear();
        for (const episode of episodes) {
            this.episodes.set(episode.id, episode);
        }
    }

    // ─── Internal ────────────────────────────────────────────

    /**
     * Calculate initial importance score based on episode type and context.
     * - Hypothesis episodes are highly important (new exploration)
     * - Directive episodes during stagnation are important
     * - RSRD syntheses are always important (expensive operation)
     */
    private calculateInitialImportance(type: EpisodeType, context: EpisodeContext): number {
        let importance = 0.5;

        switch (type) {
            case 'hypothesis':
                importance = 0.7;
                break;
            case 'directive':
                // More important during stagnation
                importance = context.stagnationCounter > 2 ? 0.8 : 0.5;
                break;
            case 'rsrd':
                importance = 0.9; // RSRD is expensive, always important
                break;
            case 'emergent':
                importance = 0.8; // Novel indicator discoveries
                break;
            case 'adversarial':
                importance = 0.6;
                break;
        }

        return importance;
    }

    /**
     * Calculate similarity between two episode contexts.
     * Returns 0-1 (1 = identical context).
     *
     * Uses weighted normalized difference across context dimensions:
     * - pair match (exact): 0.25
     * - regime match (exact): 0.20
     * - fitness proximity: 0.15
     * - diversity proximity: 0.15
     * - generation proximity: 0.10
     * - timeframe match: 0.10
     * - stagnation proximity: 0.05
     */
    private contextSimilarity(a: EpisodeContext, b: EpisodeContext): number {
        let similarity = 0;

        // Pair match (exact)
        if (a.pair === b.pair) similarity += 0.25;

        // Regime match (exact)
        if (a.regime === b.regime) similarity += 0.20;

        // Best fitness proximity (normalized by max observed)
        const maxFitness = Math.max(a.bestFitness, b.bestFitness, 1);
        const fitnessDiff = Math.abs(a.bestFitness - b.bestFitness) / maxFitness;
        similarity += (1 - fitnessDiff) * 0.15;

        // Diversity proximity
        const diversityDiff = Math.abs(a.diversityIndex - b.diversityIndex);
        similarity += (1 - diversityDiff) * 0.15;

        // Generation proximity (within 20 generations = similar)
        const genDiff = Math.abs(a.generation - b.generation);
        similarity += Math.max(0, 1 - genDiff / 20) * 0.10;

        // Timeframe match
        if (a.timeframe === b.timeframe) similarity += 0.10;

        // Stagnation proximity
        const stagDiff = Math.abs(a.stagnationCounter - b.stagnationCounter);
        similarity += Math.max(0, 1 - stagDiff / 5) * 0.05;

        return Math.round(similarity * 100) / 100;
    }
}
