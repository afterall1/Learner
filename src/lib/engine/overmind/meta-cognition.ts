// ============================================================
// Learner: Meta-Cognition Loop — Self-Reflective Improvement
// ============================================================
// Radical Innovation #4 (CCR): The meta-cognition loop runs
// periodically to analyze the Overmind's own decision patterns,
// generate meta-insights, and modify future behavior. This is
// what makes the Overmind genuinely self-improving.
//
// Cycle: REFLECT → COUNTERFACTUAL → SYNTHESIZE → PRIME → PRUNE
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type Episode,
    type MetaInsight,
    type CounterfactualAnalysis,
    OvermindEventType,
} from '@/types/overmind';
import { type MarketRegime } from '@/types';
import { OpusClient } from './opus-client';
import { getSystemPrompt } from './prompt-engine';
import { ReasoningJournal } from './reasoning-journal';
import { EpisodicMemory } from './episodic-memory';
import { CounterfactualEngine } from './counterfactual-engine';

// ─── Configuration ───────────────────────────────────────────

interface MetaCognitionConfig {
    /** How many Overmind cycles between meta-cognition runs */
    cycleInterval: number;
    /** Maximum active meta-insights */
    maxActiveInsights: number;
    /** Minimum confidence for a meta-insight to be active */
    minInsightConfidence: number;
    /** Number of worst episodes to analyze per meta-cycle */
    worstEpisodesToAnalyze: number;
}

const DEFAULT_CONFIG: MetaCognitionConfig = {
    cycleInterval: 10,
    maxActiveInsights: 20,
    minInsightConfidence: 0.4,
    worstEpisodesToAnalyze: 3,
};

// ─── Meta-Cognition Loop ─────────────────────────────────────

export class MetaCognitionLoop {
    private insights: Map<string, MetaInsight> = new Map();
    private readonly config: MetaCognitionConfig;
    private readonly opus: OpusClient;
    private readonly journal: ReasoningJournal;
    private readonly memory: EpisodicMemory;
    private readonly counterfactualEngine: CounterfactualEngine;
    private cyclesSinceLastRun: number = 0;
    private totalReflectionCycles: number = 0;

    constructor(
        journal: ReasoningJournal,
        memory: EpisodicMemory,
        counterfactualEngine: CounterfactualEngine,
        config: Partial<MetaCognitionConfig> = {},
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.opus = OpusClient.getInstance();
        this.journal = journal;
        this.memory = memory;
        this.counterfactualEngine = counterfactualEngine;
    }

    // ─── Main Cycle ──────────────────────────────────────────

    /**
     * Check whether it's time to run a meta-cognition cycle.
     */
    shouldRun(): boolean {
        this.cyclesSinceLastRun++;
        return this.cyclesSinceLastRun >= this.config.cycleInterval;
    }

    /**
     * Run a full meta-cognition cycle:
     * 1. REFLECT: Review recent episodes
     * 2. COUNTERFACTUAL: Analyze worst decisions
     * 3. SYNTHESIZE: Generate meta-insights
     * 4. PRIME: Prepare prompt primers
     * 5. PRUNE: Remove low-value data
     */
    async runCycle(): Promise<MetaInsight[]> {
        this.cyclesSinceLastRun = 0;
        this.totalReflectionCycles++;

        const newInsights: MetaInsight[] = [];

        // ── Step 1: REFLECT ──────────────────────────────────
        const recentEpisodes = this.memory.getRecentEpisodes(20);
        if (recentEpisodes.length < 5) {
            // Not enough data for meaningful reflection
            return [];
        }

        // ── Step 2: COUNTERFACTUAL ───────────────────────────
        const worstEpisodes = this.memory.getWorstEpisodes(
            this.config.worstEpisodesToAnalyze,
        );
        for (const episode of worstEpisodes) {
            if (episode.reflection) continue; // Already analyzed
            try {
                await this.counterfactualEngine.analyzeEpisode(episode);
            } catch (error) {
                console.error('[MetaCognition] Counterfactual analysis error:', error);
            }
        }

        // ── Step 3: SYNTHESIZE ───────────────────────────────
        try {
            const insights = await this.synthesizeMetaInsights(recentEpisodes);
            for (const insight of insights) {
                this.insights.set(insight.id, insight);
                newInsights.push(insight);
            }
        } catch (error) {
            console.error('[MetaCognition] Synthesis error:', error);
        }

        // ── Step 4: PRIME ────────────────────────────────────
        // Prompt primers are built on-demand by CounterfactualEngine.buildPromptPrimer()
        // No action needed here — the priming happens when prompts are constructed.

        // ── Step 5: PRUNE ────────────────────────────────────
        this.pruneInsights();
        this.memory.decayImportance();

        // Also generate causal insights from the episode batch
        try {
            await this.counterfactualEngine.generateCausalInsights(recentEpisodes);
        } catch (error) {
            console.error('[MetaCognition] Causal insight generation error:', error);
        }

        // Record in journal
        this.journal.recordEntry(
            OvermindEventType.CYCLE_COMPLETED,
            null,
            { regime: null, generation: null, populationSize: null, bestFitness: null },
            `Meta-cognition cycle ${this.totalReflectionCycles}: ` +
            `${newInsights.length} new insights, ${this.insights.size} total active, ` +
            `${worstEpisodes.length} episodes analyzed counterfactually`,
            0.8,
            0,
        );

        return newInsights;
    }

    // ─── Synthesis ───────────────────────────────────────────

    /**
     * Synthesize meta-insights from recent episodes using Opus 4.6.
     */
    private async synthesizeMetaInsights(episodes: Episode[]): Promise<MetaInsight[]> {
        if (!this.opus.isAvailable()) {
            return this.synthesizeRuleBasedInsights(episodes);
        }

        const prompt = this.buildMetaCognitionPrompt(episodes);
        const response = await this.opus.analyzeWithSchema(
            getSystemPrompt(),
            prompt,
            (data: unknown): data is unknown[] => Array.isArray(data),
            { temperature: 0.4, budgetTokens: 10_000 },
        );

        if (!response?.content) {
            return this.synthesizeRuleBasedInsights(episodes);
        }

        return this.parseMetaInsightResponse(response.content, episodes);
    }

    /**
     * Rule-based meta-insight synthesis (fallback when API unavailable).
     */
    private synthesizeRuleBasedInsights(episodes: Episode[]): MetaInsight[] {
        const insights: MetaInsight[] = [];
        const resolved = episodes.filter(e => e.outcome !== null);

        if (resolved.length < 5) return [];

        // Pattern 1: Track indicator success rates
        const indicatorStats = new Map<string, { success: number; total: number }>();
        for (const ep of resolved) {
            if (!ep.action.suggestedIndicators?.length) continue;
            for (const indicator of ep.action.suggestedIndicators) {
                const stats = indicatorStats.get(indicator) ?? { success: 0, total: 0 };
                stats.total++;
                if (ep.outcome!.wasSuccessful) stats.success++;
                indicatorStats.set(indicator, stats);
            }
        }

        for (const [indicator, stats] of indicatorStats) {
            if (stats.total < 3) continue;
            const rate = stats.success / stats.total;

            if (rate > 0.7) {
                insights.push({
                    id: uuidv4(),
                    insight: `${indicator} suggestions succeed ${(rate * 100).toFixed(0)}% of the time`,
                    affectedEngine: 'hypothesis',
                    adjustment: {
                        type: 'prefer_indicator',
                        details: { indicator, successRate: rate, sampleSize: stats.total },
                    },
                    confidence: Math.min(0.9, stats.total / 10),
                    supportingEpisodeIds: resolved
                        .filter(e => e.action.suggestedIndicators?.includes(indicator))
                        .map(e => e.id),
                    active: true,
                    createdAt: Date.now(),
                    lastUpdated: Date.now(),
                });
            } else if (rate < 0.3 && stats.total >= 5) {
                insights.push({
                    id: uuidv4(),
                    insight: `${indicator} suggestions only succeed ${(rate * 100).toFixed(0)}% of the time — consider avoiding`,
                    affectedEngine: 'hypothesis',
                    adjustment: {
                        type: 'avoid_indicator',
                        details: { indicator, successRate: rate, sampleSize: stats.total },
                    },
                    confidence: Math.min(0.9, stats.total / 10),
                    supportingEpisodeIds: resolved
                        .filter(e => e.action.suggestedIndicators?.includes(indicator))
                        .map(e => e.id),
                    active: true,
                    createdAt: Date.now(),
                    lastUpdated: Date.now(),
                });
            }
        }

        // Pattern 2: Track regime-specific success rates
        const regimeStats = new Map<string, { success: number; total: number }>();
        for (const ep of resolved) {
            const key = ep.context.regime ?? 'UNKNOWN';
            const stats = regimeStats.get(key) ?? { success: 0, total: 0 };
            stats.total++;
            if (ep.outcome!.wasSuccessful) stats.success++;
            regimeStats.set(key, stats);
        }

        for (const [regime, stats] of regimeStats) {
            if (stats.total < 5 || regime === 'UNKNOWN') continue;
            const rate = stats.success / stats.total;

            if (rate < 0.25) {
                insights.push({
                    id: uuidv4(),
                    insight: `Overmind performance in ${regime} regime is poor (${(rate * 100).toFixed(0)}% success). Re-evaluate approach.`,
                    affectedEngine: 'global',
                    adjustment: {
                        type: 'avoid_regime',
                        details: { regime, successRate: rate, sampleSize: stats.total },
                    },
                    confidence: Math.min(0.8, stats.total / 15),
                    supportingEpisodeIds: resolved
                        .filter(e => e.context.regime === regime)
                        .map(e => e.id),
                    active: true,
                    createdAt: Date.now(),
                    lastUpdated: Date.now(),
                });
            }
        }

        return insights;
    }

    // ─── Prompt Building ─────────────────────────────────────

    private buildMetaCognitionPrompt(episodes: Episode[]): string {
        const resolved = episodes.filter(e => e.outcome !== null);
        const successRate = resolved.length > 0
            ? resolved.filter(e => e.outcome!.wasSuccessful).length / resolved.length
            : 0;
        const avgFitnessChange = resolved.length > 0
            ? resolved.reduce((s, e) => s + (e.outcome!.fitnessChange), 0) / resolved.length
            : 0;

        const episodeSummaries = resolved.slice(0, 15).map((e, i) => {
            const o = e.outcome!;
            return `${i + 1}. [${e.type}] ${e.context.pair}/${e.context.regime ?? '?'} G${e.context.generation}: ` +
                `"${e.action.summary}" → ${o.wasSuccessful ? '✅' : '❌'} ` +
                `Δfit=${o.fitnessChange > 0 ? '+' : ''}${o.fitnessChange.toFixed(1)}` +
                (e.reflection ? ` | Reflection: ${e.reflection.substring(0, 80)}...` : '');
        }).join('\n');

        const existingInsights = this.getActiveInsights().slice(0, 5).map((ins, i) =>
            `${i + 1}. [${ins.affectedEngine}] ${ins.insight} (confidence: ${ins.confidence.toFixed(2)})`,
        ).join('\n');

        return `You are the Overmind's meta-cognitive system. Your job is to analyze your own decision
patterns and identify ways to improve future decisions.

## Performance Summary
- Success Rate: ${(successRate * 100).toFixed(1)}%
- Average Fitness Change: ${avgFitnessChange > 0 ? '+' : ''}${avgFitnessChange.toFixed(1)}
- Episodes Analyzed: ${resolved.length}

## Recent Episodes
${episodeSummaries}

## Existing Meta-Insights
${existingInsights || 'None yet.'}

## Task
Generate 2-4 NEW meta-insights (not duplicates of existing ones). Each should be:
1. A behavioral adjustment the Overmind should make
2. Supported by evidence from the episodes above
3. Specific enough to be actionable

Respond as JSON array:
\`\`\`json
[
  {
    "insight": "description of what was learned",
    "affectedEngine": "hypothesis|director|adversarial|emergent|rsrd|global",
    "adjustmentType": "prefer_indicator|avoid_indicator|prefer_regime|avoid_regime|adjust_confidence|modify_prompt|adjust_mutation_bias",
    "adjustmentDetails": {},
    "confidence": 0.0-1.0,
    "supportingEpisodeIndices": [1, 3, 7]
  }
]
\`\`\``;
    }

    // ─── Response Parsing ────────────────────────────────────

    private parseMetaInsightResponse(
        rawContent: unknown,
        episodes: Episode[],
    ): MetaInsight[] {
        const items: unknown[] = Array.isArray(rawContent) ? rawContent : [];
        const resolved = episodes.filter(e => e.outcome !== null);

        return items.map((item: unknown) => {
            const r = item as Record<string, unknown>;
            const adjustmentType = String(r.adjustmentType ?? 'modify_prompt') as MetaInsight['adjustment']['type'];
            const indices = Array.isArray(r.supportingEpisodeIndices)
                ? (r.supportingEpisodeIndices as number[])
                : [];
            const supportingIds = indices
                .filter(i => i >= 1 && i <= resolved.length)
                .map(i => resolved[i - 1].id);

            return {
                id: uuidv4(),
                insight: String(r.insight ?? ''),
                affectedEngine: String(r.affectedEngine ?? 'global') as MetaInsight['affectedEngine'],
                adjustment: {
                    type: adjustmentType,
                    details: (typeof r.adjustmentDetails === 'object' && r.adjustmentDetails !== null)
                        ? r.adjustmentDetails as Record<string, unknown>
                        : {},
                },
                confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
                supportingEpisodeIds: supportingIds,
                active: true,
                createdAt: Date.now(),
                lastUpdated: Date.now(),
            };
        }).filter(i => i.insight.length > 0 && i.confidence >= this.config.minInsightConfidence);
    }

    // ─── Queries ─────────────────────────────────────────────

    /**
     * Get all currently active meta-insights.
     */
    getActiveInsights(): MetaInsight[] {
        return Array.from(this.insights.values())
            .filter(i => i.active)
            .sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Get active insights for a specific engine.
     */
    getInsightsForEngine(
        engine: MetaInsight['affectedEngine'],
    ): MetaInsight[] {
        return this.getActiveInsights()
            .filter(i => i.affectedEngine === engine || i.affectedEngine === 'global');
    }

    /**
     * Get total number of active insights.
     */
    getActiveCount(): number {
        return Array.from(this.insights.values()).filter(i => i.active).length;
    }

    /**
     * Calculate self-improvement rate.
     * Measures whether the Overmind's decision quality is improving over time.
     * Returns a value between -1 (getting worse) and +1 (improving).
     */
    calculateSelfImprovementRate(): number {
        const recentEpisodes = this.memory.getRecentEpisodes(50);
        const resolved = recentEpisodes.filter(e => e.outcome !== null);

        if (resolved.length < 10) return 0;

        // Split into halves — older vs newer
        const midpoint = Math.floor(resolved.length / 2);
        const olderHalf = resolved.slice(midpoint);
        const newerHalf = resolved.slice(0, midpoint);

        const olderAvg = olderHalf.reduce((s, e) => s + e.outcome!.fitnessChange, 0) / olderHalf.length;
        const newerAvg = newerHalf.reduce((s, e) => s + e.outcome!.fitnessChange, 0) / newerHalf.length;

        // Normalize to [-1, 1]
        const maxDelta = Math.max(Math.abs(olderAvg), Math.abs(newerAvg), 1);
        const rate = (newerAvg - olderAvg) / maxDelta;

        return Math.max(-1, Math.min(1, Math.round(rate * 100) / 100));
    }

    /**
     * Get total reflection cycles completed.
     */
    getTotalReflectionCycles(): number {
        return this.totalReflectionCycles;
    }

    // ─── Lifecycle ───────────────────────────────────────────

    /**
     * Prune inactive or low-confidence insights to stay within capacity.
     */
    private pruneInsights(): void {
        const all = Array.from(this.insights.values());

        // Deactivate insights that have decayed below threshold
        for (const insight of all) {
            // Decay confidence slightly each meta-cycle
            insight.confidence *= 0.95;
            if (insight.confidence < this.config.minInsightConfidence) {
                insight.active = false;
            }
        }

        // If still over capacity, remove oldest inactive
        if (this.insights.size > this.config.maxActiveInsights * 2) {
            const inactive = all
                .filter(i => !i.active)
                .sort((a, b) => a.lastUpdated - b.lastUpdated);

            const toRemove = this.insights.size - this.config.maxActiveInsights;
            for (let i = 0; i < toRemove && i < inactive.length; i++) {
                this.insights.delete(inactive[i].id);
            }
        }
    }

    // ─── Persistence ─────────────────────────────────────────

    /**
     * Serialize insights for persistence.
     */
    serializeInsights(): MetaInsight[] {
        return Array.from(this.insights.values());
    }

    /**
     * Deserialize insights from persistence.
     */
    deserializeInsights(insights: MetaInsight[]): void {
        this.insights.clear();
        for (const insight of insights) {
            this.insights.set(insight.id, insight);
        }
    }
}
