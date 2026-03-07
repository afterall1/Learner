// ============================================================
// Learner: Hypothesis Engine — Market Hypothesis Generation
// ============================================================
// Uses Opus 4.6 to generate trading hypotheses — structured
// beliefs about what strategies should work and why.
// Translates hypotheses into seed StrategyDNA for the GA.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type MarketHypothesis,
    type OvermindIslandContext,
    type PairProfile,
    type HypothesisOutcome,
    type OpusResponse,
    HypothesisStatus,
    OvermindEventType,
} from '@/types/overmind';
import {
    type StrategyDNA,
    type IndicatorGene,
    type IndicatorType,
    type Timeframe,
    MarketRegime,
    StrategyStatus,
    TradeDirection,
} from '@/types';
import { OpusClient } from './opus-client';
import { buildHypothesisPrompt, getSystemPrompt } from './prompt-engine';
import { isHypothesisArray } from './response-parser';
import { ReasoningJournal } from './reasoning-journal';
import { generateRandomStrategy } from '../strategy-dna';

// ─── Hypothesis Engine ───────────────────────────────────────

export class HypothesisEngine {
    private hypotheses: Map<string, MarketHypothesis> = new Map();
    private readonly maxPerIsland: number;
    private readonly maxAgeGenerations: number;
    private readonly opus: OpusClient;
    private readonly journal: ReasoningJournal;

    constructor(
        maxPerIsland: number = 5,
        maxAgeGenerations: number = 20,
        journal: ReasoningJournal,
    ) {
        this.maxPerIsland = maxPerIsland;
        this.maxAgeGenerations = maxAgeGenerations;
        this.opus = OpusClient.getInstance();
        this.journal = journal;
    }

    // ─── Hypothesis Generation ───────────────────────────────

    /**
     * Generate market hypotheses for underperforming or stagnating islands.
     * Returns newly generated hypotheses.
     */
    async generateHypotheses(
        islands: OvermindIslandContext[],
        pairProfiles: PairProfile[],
    ): Promise<MarketHypothesis[]> {
        if (!this.opus.isAvailable()) {
            return [];
        }

        // Filter to islands that need hypotheses
        const needsHypotheses = islands.filter(island => {
            const existing = this.getActiveHypotheses(island.slotId);
            if (existing.length >= this.maxPerIsland) return false;

            // Underperforming or stagnating
            const isUnderperforming = island.bestFitness < 50;
            const isStagnating = island.fitnessTrend.length >= 3 &&
                Math.abs(island.fitnessTrend[island.fitnessTrend.length - 1] -
                    island.fitnessTrend[island.fitnessTrend.length - 3]) < 2;

            return isUnderperforming || isStagnating;
        });

        if (needsHypotheses.length === 0) {
            return [];
        }

        const activeHypotheses = Array.from(this.hypotheses.values())
            .filter(h => h.status !== HypothesisStatus.ARCHIVED && h.status !== HypothesisStatus.INVALIDATED);

        const prompt = buildHypothesisPrompt(needsHypotheses, pairProfiles, activeHypotheses);
        const response: OpusResponse<Array<{
            hypothesis: string;
            confidence: number;
            evidence: unknown[];
        }>> | null = await this.opus.analyzeWithSchema(
            getSystemPrompt(),
            prompt,
            isHypothesisArray,
            { temperature: 0.7, budgetTokens: 10_000 },
        );

        if (!response?.content) {
            return [];
        }

        // Parse the raw response to extract hypotheses array
        const rawHypotheses = this.extractHypothesesFromResponse(response, needsHypotheses);

        // Record in journal
        for (const hyp of rawHypotheses) {
            this.journal.recordEntry(
                OvermindEventType.HYPOTHESIS_GENERATED,
                hyp.slotId,
                {
                    regime: hyp.regime,
                    generation: null,
                    populationSize: null,
                    bestFitness: null,
                },
                `Hypothesis: ${hyp.hypothesis}`,
                hyp.confidence,
                response.usage.totalTokens,
            );
        }

        return rawHypotheses;
    }

    /**
     * Synthesize a StrategyDNA seed from a hypothesis.
     * The seed is a starting point for the GA, not a final strategy.
     */
    synthesizeSeedDNA(hypothesis: MarketHypothesis, generation: number): StrategyDNA {
        // Start with a random strategy as base
        const baseDNA = generateRandomStrategy(generation);

        // Apply hypothesis-suggested modifications
        const seed: StrategyDNA = {
            ...baseDNA,
            id: uuidv4(),
            name: `Hyp: ${hypothesis.hypothesis.substring(0, 30)}...`,
            slotId: hypothesis.slotId,
            generation,
            parentIds: [],
            preferredPairs: [hypothesis.pair],
            preferredTimeframe: hypothesis.timeframe,
            status: StrategyStatus.PAPER,
            metadata: {
                ...baseDNA.metadata,
                overmindOrigin: 'hypothesis',
                hypothesisId: hypothesis.id,
            },
        };

        // Apply direction bias from hypothesis
        const suggestedDNA = hypothesis.suggestedDNA;
        if (suggestedDNA.directionBias !== undefined) {
            seed.directionBias = suggestedDNA.directionBias;
        }

        // Apply risk genes from hypothesis (clamped to safety rails)
        if (suggestedDNA.riskGenes) {
            seed.riskGenes = {
                stopLossPercent: Math.max(0.5, Math.min(5.0, suggestedDNA.riskGenes.stopLossPercent ?? seed.riskGenes.stopLossPercent)),
                takeProfitPercent: Math.max(1.0, Math.min(15.0, suggestedDNA.riskGenes.takeProfitPercent ?? seed.riskGenes.takeProfitPercent)),
                positionSizePercent: Math.max(0.5, Math.min(2.0, suggestedDNA.riskGenes.positionSizePercent ?? seed.riskGenes.positionSizePercent)),
                maxLeverage: Math.max(1, Math.min(10, suggestedDNA.riskGenes.maxLeverage ?? seed.riskGenes.maxLeverage)),
            };
        }

        // Update hypothesis status
        hypothesis.status = HypothesisStatus.SEEDED;
        hypothesis.seedStrategyId = seed.id;
        hypothesis.updatedAt = Date.now();
        this.hypotheses.set(hypothesis.id, hypothesis);

        return seed;
    }

    // ─── Outcome Tracking ────────────────────────────────────

    /**
     * Track the fitness outcome of a hypothesis-derived seed strategy.
     */
    trackOutcome(hypothesisId: string, actualFitness: number, generationsElapsed: number): void {
        const hypothesis = this.hypotheses.get(hypothesisId);
        if (!hypothesis) return;

        const expectedFitness = hypothesis.confidence * 100; // Rough expectation
        const outcome: HypothesisOutcome = {
            validated: actualFitness >= expectedFitness * 0.7, // 70% of expected = success
            actualFitness,
            expectedFitness,
            generationsToConverge: generationsElapsed,
            lessonsLearned: actualFitness >= expectedFitness
                ? `Hypothesis validated: ${hypothesis.hypothesis.substring(0, 50)}`
                : `Hypothesis underperformed: expected ${expectedFitness.toFixed(1)}, got ${actualFitness.toFixed(1)}`,
            verifiedAt: Date.now(),
        };

        hypothesis.outcome = outcome;
        hypothesis.status = outcome.validated
            ? HypothesisStatus.VALIDATED
            : HypothesisStatus.INVALIDATED;
        hypothesis.updatedAt = Date.now();
        this.hypotheses.set(hypothesis.id, hypothesis);
    }

    /**
     * Retire stale hypotheses that haven't been validated within maxAge generations.
     */
    retireStaleHypotheses(currentGeneration: number): number {
        let retired = 0;
        for (const [id, hypothesis] of this.hypotheses.entries()) {
            if (
                hypothesis.status === HypothesisStatus.PROPOSED ||
                hypothesis.status === HypothesisStatus.SEEDED ||
                hypothesis.status === HypothesisStatus.TESTING
            ) {
                // Check age (rough: generation-based)
                const ageGenEstimate = currentGeneration - (hypothesis.createdAt / 60000); // rough
                if (this.hypotheses.size > this.maxPerIsland * 10) {
                    hypothesis.status = HypothesisStatus.ARCHIVED;
                    hypothesis.updatedAt = Date.now();
                    this.hypotheses.set(id, hypothesis);
                    retired++;
                }
            }
        }
        return retired;
    }

    // ─── Queries ─────────────────────────────────────────────

    /**
     * Get active hypotheses for a specific island.
     */
    getActiveHypotheses(slotId: string): MarketHypothesis[] {
        return Array.from(this.hypotheses.values()).filter(
            h => h.slotId === slotId &&
                h.status !== HypothesisStatus.ARCHIVED &&
                h.status !== HypothesisStatus.INVALIDATED,
        );
    }

    /**
     * Get all hypotheses (for persistence).
     */
    getAllHypotheses(): MarketHypothesis[] {
        return Array.from(this.hypotheses.values());
    }

    /**
     * Get hypothesis success rate (validated / (validated + invalidated)).
     */
    getHypothesisSuccessRate(): number {
        const validated = Array.from(this.hypotheses.values()).filter(
            h => h.status === HypothesisStatus.VALIDATED,
        ).length;
        const invalidated = Array.from(this.hypotheses.values()).filter(
            h => h.status === HypothesisStatus.INVALIDATED,
        ).length;
        const total = validated + invalidated;
        return total > 0 ? validated / total : 0;
    }

    /**
     * Get total hypothesis count.
     */
    getTotalCount(): number {
        return this.hypotheses.size;
    }

    /**
     * Load hypotheses from persistence.
     */
    loadHypotheses(hypotheses: MarketHypothesis[]): void {
        for (const h of hypotheses) {
            this.hypotheses.set(h.id, h);
        }
    }

    // ─── Internal ────────────────────────────────────────────

    private extractHypothesesFromResponse(
        response: OpusResponse<unknown>,
        islands: OvermindIslandContext[],
    ): MarketHypothesis[] {
        const results: MarketHypothesis[] = [];
        const rawContent = response.content;

        // Handle various response shapes
        let rawHypotheses: unknown[] = [];
        if (Array.isArray(rawContent)) {
            rawHypotheses = rawContent;
        } else if (rawContent && typeof rawContent === 'object' && 'hypotheses' in (rawContent as Record<string, unknown>)) {
            rawHypotheses = (rawContent as Record<string, unknown>).hypotheses as unknown[];
        }

        for (const raw of rawHypotheses) {
            if (typeof raw !== 'object' || raw === null) continue;
            const r = raw as Record<string, unknown>;

            const slotId = String(r.slotId || '');
            const island = islands.find(i => i.slotId === slotId) || islands[0];
            if (!island) continue;

            const hypothesis: MarketHypothesis = {
                id: uuidv4(),
                slotId: island.slotId,
                pair: island.pair,
                timeframe: island.timeframe as Timeframe,
                regime: (r.regime as MarketRegime) || island.currentRegime || MarketRegime.RANGING,
                hypothesis: String(r.hypothesis || 'Unknown hypothesis'),
                confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
                evidence: Array.isArray(r.evidence) ? r.evidence.map((e: unknown) => {
                    const ev = e as Record<string, unknown>;
                    return {
                        type: (String(ev.type || 'technical')) as 'technical' | 'microstructure' | 'correlation' | 'historical' | 'regime',
                        description: String(ev.description || ''),
                        weight: Number(ev.weight) || 0.5,
                    };
                }) : [],
                suggestedDNA: (r.suggestedDNA as Partial<StrategyDNA>) || {},
                suggestedIndicators: Array.isArray(r.suggestedIndicators)
                    ? r.suggestedIndicators.map((i: unknown) => String(i) as IndicatorType)
                    : [],
                status: HypothesisStatus.PROPOSED,
                seedStrategyId: null,
                outcome: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            results.push(hypothesis);
            this.hypotheses.set(hypothesis.id, hypothesis);
        }

        return results;
    }
}
