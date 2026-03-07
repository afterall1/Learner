// ============================================================
// Learner: Counterfactual Engine — "What Would Have Happened?"
// ============================================================
// Radical Innovation #4 (CCR): Uses Opus 4.6 to perform causal
// counterfactual analysis on past Overmind decisions. Generates
// alternative scenarios and actionable insights that improve
// future decision quality.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type Episode,
    type CounterfactualAnalysis,
    type CausalInsight,
    type PromptPrimer,
    type OvermindIslandContext,
    OvermindEventType,
} from '@/types/overmind';
import { type MarketRegime } from '@/types';
import { OpusClient } from './opus-client';
import { getSystemPrompt } from './prompt-engine';
import { ReasoningJournal } from './reasoning-journal';
import { EpisodicMemory } from './episodic-memory';

// ─── Counterfactual Engine ───────────────────────────────────

export class CounterfactualEngine {
    private counterfactuals: Map<string, CounterfactualAnalysis[]> = new Map();
    private causalInsights: CausalInsight[] = [];
    private readonly opus: OpusClient;
    private readonly journal: ReasoningJournal;
    private readonly memory: EpisodicMemory;

    constructor(journal: ReasoningJournal, memory: EpisodicMemory) {
        this.opus = OpusClient.getInstance();
        this.journal = journal;
        this.memory = memory;
    }

    // ─── Counterfactual Analysis ─────────────────────────────

    /**
     * Analyze a resolved episode and generate counterfactual alternatives.
     * Asks Opus: "What WOULD have happened if...?"
     */
    async analyzeEpisode(episode: Episode): Promise<CounterfactualAnalysis[]> {
        if (!episode.outcome) return [];
        if (!this.opus.isAvailable()) {
            return this.generateRuleBasedCounterfactuals(episode);
        }

        const prompt = this.buildCounterfactualPrompt(episode);
        const response = await this.opus.analyzeWithSchema(
            getSystemPrompt(),
            prompt,
            (data: unknown): data is unknown[] => Array.isArray(data),
            { temperature: 0.5, budgetTokens: 8_000 },
        );

        if (!response?.content) {
            return this.generateRuleBasedCounterfactuals(episode);
        }

        const analyses = this.parseCounterfactualResponse(
            response.content,
            episode.id,
        );

        // Store
        const existing = this.counterfactuals.get(episode.id) ?? [];
        this.counterfactuals.set(episode.id, [...existing, ...analyses]);

        // Add reflection to episode
        if (analyses.length > 0) {
            const bestAlternative = analyses.sort(
                (a, b) => b.predictedFitnessChange - a.predictedFitnessChange,
            )[0];
            this.memory.addReflection(
                episode.id,
                `Best alternative: ${bestAlternative.alternativeAction} ` +
                `(predicted +${bestAlternative.predictedFitnessChange} fitness). ` +
                `Reason: ${bestAlternative.reasoning}`,
            );
        }

        // Record in journal
        this.journal.recordEntry(
            OvermindEventType.CYCLE_COMPLETED,
            episode.slotId,
            {
                regime: episode.context.regime,
                generation: episode.context.generation,
                populationSize: episode.context.populationSize,
                bestFitness: episode.context.bestFitness,
            },
            `Counterfactual analysis for episode ${episode.id}: ` +
            `${analyses.length} alternatives generated`,
            0.6,
            response.usage.totalTokens,
        );

        return analyses;
    }

    /**
     * Generate causal insights by analyzing patterns across multiple episodes.
     */
    async generateCausalInsights(episodes: Episode[]): Promise<CausalInsight[]> {
        if (episodes.length < 3) return []; // Need minimum episodes for patterns

        const resolvedEpisodes = episodes.filter(e => e.outcome !== null);
        if (resolvedEpisodes.length < 3) return [];

        if (!this.opus.isAvailable()) {
            return this.generateRuleBasedInsights(resolvedEpisodes);
        }

        const prompt = this.buildCausalInsightPrompt(resolvedEpisodes);
        const response = await this.opus.analyzeWithSchema(
            getSystemPrompt(),
            prompt,
            (data: unknown): data is unknown[] => Array.isArray(data),
            { temperature: 0.4, budgetTokens: 10_000 },
        );

        if (!response?.content) {
            return this.generateRuleBasedInsights(resolvedEpisodes);
        }

        const insights = this.parseCausalInsightResponse(response.content);
        this.causalInsights.push(...insights);

        return insights;
    }

    /**
     * Build a prompt primer for future prompts based on past episodes.
     * This is the KEY output that makes the Overmind self-improving.
     */
    buildPromptPrimer(
        pair: string,
        regime: MarketRegime | null,
    ): PromptPrimer {
        const relevantEpisodes = this.memory.getResolvedEpisodesForContext(pair, regime)
            .slice(0, 10); // Last 10 relevant episodes

        const previousAttempts = relevantEpisodes
            .filter(e => e.outcome !== null)
            .slice(0, 5) // Keep concise
            .map(e => ({
                action: e.action.summary,
                outcome: e.outcome!.wasSuccessful
                    ? `Success: fitness +${e.outcome!.fitnessChange.toFixed(1)}`
                    : `Failed: fitness ${e.outcome!.fitnessChange.toFixed(1)}`,
                lesson: e.reflection ?? 'No reflection available',
            }));

        // Build avoid/prefer lists from episode outcomes
        const avoidList: string[] = [];
        const preferList: string[] = [];

        for (const episode of relevantEpisodes) {
            if (!episode.outcome) continue;

            if (episode.outcome.wasSuccessful && episode.outcome.fitnessChange > 5) {
                // Strong success
                if (episode.action.suggestedIndicators?.length) {
                    preferList.push(
                        `${episode.action.suggestedIndicators.join(' + ')} ` +
                        `(fitness +${episode.outcome.fitnessChange.toFixed(1)} in ${episode.context.regime ?? 'unknown'} regime)`,
                    );
                }
            } else if (!episode.outcome.wasSuccessful && episode.outcome.fitnessChange < -5) {
                // Strong failure
                if (episode.action.suggestedIndicators?.length) {
                    avoidList.push(
                        `${episode.action.suggestedIndicators.join(' + ')} ` +
                        `(fitness ${episode.outcome.fitnessChange.toFixed(1)} in ${episode.context.regime ?? 'unknown'} regime)`,
                    );
                }
            }
        }

        // Get relevant causal insights
        const metaInsights = this.causalInsights
            .filter(i => i.pair === pair || i.pair === 'global')
            .filter(i => i.regime === null || i.regime === regime)
            .sort((a, b) => b.evidenceStrength - a.evidenceStrength)
            .slice(0, 3)
            .map(i => i.recommendation);

        return {
            pair,
            regime,
            previousAttempts,
            metaInsights,
            avoidList: [...new Set(avoidList)].slice(0, 5),
            preferList: [...new Set(preferList)].slice(0, 5),
        };
    }

    // ─── Queries ─────────────────────────────────────────────

    /**
     * Get all counterfactual analyses for an episode.
     */
    getCounterfactualsForEpisode(episodeId: string): CounterfactualAnalysis[] {
        return this.counterfactuals.get(episodeId) ?? [];
    }

    /**
     * Get total count of counterfactuals generated.
     */
    getTotalCounterfactuals(): number {
        let total = 0;
        for (const analyses of this.counterfactuals.values()) {
            total += analyses.length;
        }
        return total;
    }

    /**
     * Get all causal insights.
     */
    getCausalInsights(): CausalInsight[] {
        return [...this.causalInsights];
    }

    // ─── Internal: Prompt Building ───────────────────────────

    private buildCounterfactualPrompt(episode: Episode): string {
        const outcome = episode.outcome!;
        const causalSummary = outcome.causalFactors.length > 0
            ? outcome.causalFactors.map(f =>
                `  - ${f.type}: contribution=${f.contribution.toFixed(2)}, ` +
                `confidence=${f.confidence.toFixed(2)}, evidence="${f.evidence}"`,
            ).join('\n')
            : '  No causal factors recorded.';

        return `You are analyzing a past Overmind decision to generate counterfactual alternatives.

## Episode Details
- **Type**: ${episode.type}
- **Pair**: ${episode.context.pair}
- **Timeframe**: ${episode.context.timeframe}
- **Regime**: ${episode.context.regime ?? 'Unknown'}
- **Generation**: ${episode.context.generation}
- **Best Fitness at Time**: ${episode.context.bestFitness}
- **Diversity Index**: ${episode.context.diversityIndex.toFixed(2)}
- **Stagnation Counter**: ${episode.context.stagnationCounter}

## Action Taken
- **Type**: ${episode.action.type}
- **Summary**: ${episode.action.summary}
- **Indicators Suggested**: ${episode.action.suggestedIndicators?.join(', ') ?? 'None'}

## Actual Outcome
- **Fitness Change**: ${outcome.fitnessChange > 0 ? '+' : ''}${outcome.fitnessChange.toFixed(1)}
- **Seed Survived**: ${outcome.seedSurvived ? 'Yes' : 'No'}
- **Generations to Converge**: ${outcome.generationsToConverge}
- **Was Successful**: ${outcome.wasSuccessful ? 'Yes' : 'No'}

## Causal Factors (from Trade Forensics)
${causalSummary}

## Task
Generate exactly 3 counterfactual alternatives. For each, explain:
1. What alternative action could have been taken instead
2. How much fitness improvement you predict vs the actual outcome
3. Why you believe this alternative would perform differently (causal reasoning)

Respond as a JSON array:
\`\`\`json
[
  {
    "alternativeAction": "string describing the alternative",
    "predictedFitnessChange": number,
    "reasoning": "string explaining why",
    "causalInsight": "string describing the causal principle learned",
    "confidence": 0.0-1.0
  }
]
\`\`\``;
    }

    private buildCausalInsightPrompt(episodes: Episode[]): string {
        const episodeSummaries = episodes.slice(0, 15).map((e, i) => {
            const outcome = e.outcome!;
            return `  ${i + 1}. [${e.type}] ${e.context.pair} ${e.context.regime ?? 'unknown'} G${e.context.generation}: ` +
                `"${e.action.summary}" → ` +
                `${outcome.wasSuccessful ? '✅' : '❌'} fitness ${outcome.fitnessChange > 0 ? '+' : ''}${outcome.fitnessChange.toFixed(1)}`;
        }).join('\n');

        return `You are analyzing patterns across multiple Overmind decision episodes to identify
causal insights — recurring patterns that explain WHY certain decisions succeed or fail.

## Episodes
${episodeSummaries}

## Task
Identify 2-4 causal patterns that emerge from these episodes. Each pattern should be:
1. Actionable — the Overmind can change behavior based on it
2. Supported by multiple episodes — not a one-off observation
3. Causal, not correlational — explain the mechanism

Respond as JSON array:
\`\`\`json
[
  {
    "pattern": "description of the causal pattern",
    "pair": "specific pair or 'global'",
    "regime": "specific regime or null",
    "evidenceStrength": 0.0-1.0,
    "recommendation": "what the Overmind should do differently"
  }
]
\`\`\``;
    }

    // ─── Internal: Response Parsing ──────────────────────────

    private parseCounterfactualResponse(
        rawContent: unknown,
        episodeId: string,
    ): CounterfactualAnalysis[] {
        const items: unknown[] = Array.isArray(rawContent)
            ? rawContent
            : [];

        return items.map((item: unknown) => {
            const r = item as Record<string, unknown>;
            return {
                id: uuidv4(),
                episodeId,
                alternativeAction: String(r.alternativeAction ?? 'Unknown alternative'),
                predictedFitnessChange: Number(r.predictedFitnessChange) || 0,
                reasoning: String(r.reasoning ?? ''),
                causalInsight: String(r.causalInsight ?? ''),
                confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
                createdAt: Date.now(),
            };
        }).filter(c => c.alternativeAction !== 'Unknown alternative');
    }

    private parseCausalInsightResponse(rawContent: unknown): CausalInsight[] {
        const items: unknown[] = Array.isArray(rawContent) ? rawContent : [];

        return items.map((item: unknown) => {
            const r = item as Record<string, unknown>;
            const regime = r.regime ? String(r.regime) : null;
            return {
                id: uuidv4(),
                pattern: String(r.pattern ?? ''),
                pair: String(r.pair ?? 'global'),
                regime: regime as MarketRegime | null,
                evidenceStrength: Math.max(0, Math.min(1, Number(r.evidenceStrength) || 0.5)),
                supportingEpisodeIds: [],
                recommendation: String(r.recommendation ?? ''),
                createdAt: Date.now(),
            };
        }).filter(i => i.pattern.length > 0);
    }

    // ─── Internal: Rule-Based Fallbacks ──────────────────────

    private generateRuleBasedCounterfactuals(episode: Episode): CounterfactualAnalysis[] {
        if (!episode.outcome) return [];

        const analyses: CounterfactualAnalysis[] = [];
        const outcome = episode.outcome;

        // Counterfactual 1: Opposite indicator suggestion
        if (episode.action.suggestedIndicators?.length) {
            const currentIndicators = episode.action.suggestedIndicators;
            const alternatives: Record<string, string> = {
                'RSI': 'MACD',
                'MACD': 'RSI',
                'EMA': 'BBANDS',
                'BBANDS': 'EMA',
                'StochRSI': 'RSI',
                'ADX': 'ATR',
            };
            const altIndicator = alternatives[currentIndicators[0]] ?? 'EMA';

            analyses.push({
                id: uuidv4(),
                episodeId: episode.id,
                alternativeAction: `Use ${altIndicator} instead of ${currentIndicators[0]}`,
                predictedFitnessChange: outcome.wasSuccessful ? -2 : 5,
                reasoning: outcome.wasSuccessful
                    ? 'Original choice was correct; alternatives likely worse'
                    : `${currentIndicators[0]} may not suit ${episode.context.regime ?? 'this'} regime`,
                causalInsight: `Indicator selection sensitivity in ${episode.context.regime ?? 'unknown'} regime`,
                confidence: 0.4,
                createdAt: Date.now(),
            });
        }

        // Counterfactual 2: Different regime timing
        if (!outcome.wasSuccessful && episode.context.stagnationCounter > 2) {
            analyses.push({
                id: uuidv4(),
                episodeId: episode.id,
                alternativeAction: 'Act earlier — intervene before stagnation deepens',
                predictedFitnessChange: 3,
                reasoning: `Stagnation was at ${episode.context.stagnationCounter} when action was taken. ` +
                    'Earlier intervention might have prevented fitness plateau.',
                causalInsight: 'Intervention timing correlates with outcome quality',
                confidence: 0.35,
                createdAt: Date.now(),
            });
        }

        return analyses;
    }

    private generateRuleBasedInsights(episodes: Episode[]): CausalInsight[] {
        const insights: CausalInsight[] = [];

        // Pattern: Success rate by regime
        const regimeGroups = new Map<string, { total: number; successes: number }>();
        for (const ep of episodes) {
            if (!ep.outcome) continue;
            const key = ep.context.regime ?? 'UNKNOWN';
            const group = regimeGroups.get(key) ?? { total: 0, successes: 0 };
            group.total++;
            if (ep.outcome.wasSuccessful) group.successes++;
            regimeGroups.set(key, group);
        }

        for (const [regime, stats] of regimeGroups) {
            if (stats.total < 3) continue;
            const rate = stats.successes / stats.total;

            if (rate > 0.7) {
                insights.push({
                    id: uuidv4(),
                    pattern: `Overmind decisions in ${regime} regime have ${(rate * 100).toFixed(0)}% success rate`,
                    pair: 'global',
                    regime: regime as MarketRegime,
                    evidenceStrength: Math.min(0.9, stats.total / 10),
                    supportingEpisodeIds: [],
                    recommendation: `Continue current strategy for ${regime} regime — it's working well`,
                    createdAt: Date.now(),
                });
            } else if (rate < 0.3) {
                insights.push({
                    id: uuidv4(),
                    pattern: `Overmind decisions in ${regime} regime have only ${(rate * 100).toFixed(0)}% success rate`,
                    pair: 'global',
                    regime: regime as MarketRegime,
                    evidenceStrength: Math.min(0.9, stats.total / 10),
                    supportingEpisodeIds: [],
                    recommendation: `Fundamentally rethink approach for ${regime} regime — current strategy is failing`,
                    createdAt: Date.now(),
                });
            }
        }

        return insights;
    }
}
