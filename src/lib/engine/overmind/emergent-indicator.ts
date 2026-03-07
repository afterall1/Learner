// ============================================================
// Learner: Emergent Indicator Discovery Engine
// ============================================================
// Radical Innovation #2: Emergent Indicator Discovery (EID)
// Uses Opus 4.6 to reason about raw price patterns and propose
// ENTIRELY NEW indicators that don't exist in standard TA.
// Discovered indicators are encoded as CompositeFunctionGenes.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type EmergentIndicator,
    type OvermindIslandContext,
    OvermindEventType,
} from '@/types/overmind';
import {
    type CompositeFunctionGene,
    MarketRegime,
    CompositeOperation,
    type IndicatorType,
} from '@/types';
import { OpusClient } from './opus-client';
import { buildEmergentIndicatorPrompt, getSystemPrompt } from './prompt-engine';
import { isEmergentIndicatorArray } from './response-parser';
import { ReasoningJournal } from './reasoning-journal';

// ─── Emergent Indicator Engine ───────────────────────────────

export class EmergentIndicatorEngine {
    private indicators: Map<string, EmergentIndicator> = new Map();
    private readonly opus: OpusClient;
    private readonly journal: ReasoningJournal;

    constructor(journal: ReasoningJournal) {
        this.opus = OpusClient.getInstance();
        this.journal = journal;
    }

    // ─── Indicator Discovery ─────────────────────────────────

    /**
     * Discover novel indicators for an island via Opus 4.6 reasoning.
     */
    async discoverIndicators(
        island: OvermindIslandContext,
        existingIndicators: string[] = ['RSI', 'EMA', 'SMA', 'MACD', 'BOLLINGER', 'ADX', 'ATR', 'STOCH_RSI', 'VOLUME'],
    ): Promise<EmergentIndicator[]> {
        if (!this.opus.isAvailable()) {
            return [];
        }

        const prompt = buildEmergentIndicatorPrompt(
            existingIndicators,
            island.currentRegime,
            island,
        );

        const response = await this.opus.analyzeWithSchema(
            getSystemPrompt(),
            prompt,
            isEmergentIndicatorArray,
            { temperature: 0.8, budgetTokens: 8_000 },
        );

        if (!response?.content) {
            return [];
        }

        const discovered = this.parseIndicatorResponse(response.content, island);

        // Record in journal
        for (const indicator of discovered) {
            this.journal.recordEntry(
                OvermindEventType.INDICATOR_DISCOVERED,
                island.slotId,
                {
                    regime: island.currentRegime,
                    generation: island.currentGeneration,
                    populationSize: null,
                    bestFitness: island.bestFitness,
                },
                `Discovered indicator: ${indicator.name} — ${indicator.formula}`,
                0.6,
                response.usage.totalTokens / Math.max(1, discovered.length), // Split token cost
            );
        }

        return discovered;
    }

    /**
     * Convert an emergent indicator into a CompositeFunctionGene
     * that can be injected into strategy DNA.
     */
    convertToCompositeGene(indicator: EmergentIndicator): CompositeFunctionGene {
        return indicator.compositeGene;
    }

    /**
     * Mark an indicator as validated after backtesting.
     */
    validateIndicator(indicatorId: string, fitness: number): void {
        const indicator = this.indicators.get(indicatorId);
        if (!indicator) return;

        indicator.validated = true;
        indicator.validationFitness = fitness;
        this.indicators.set(indicatorId, indicator);
    }

    /**
     * Record that a strategy adopted this indicator.
     */
    recordAdoption(indicatorId: string): void {
        const indicator = this.indicators.get(indicatorId);
        if (!indicator) return;

        indicator.adoptionCount++;
        this.indicators.set(indicatorId, indicator);
    }

    // ─── Queries ─────────────────────────────────────────────

    /**
     * Get indicators that have been validated through backtesting.
     */
    getProvenIndicators(): EmergentIndicator[] {
        return Array.from(this.indicators.values()).filter(i => i.validated);
    }

    /**
     * Get the full indicator library.
     */
    getIndicatorLibrary(): EmergentIndicator[] {
        return Array.from(this.indicators.values());
    }

    /**
     * Get total discovered indicators.
     */
    getTotalDiscovered(): number {
        return this.indicators.size;
    }

    /**
     * Get total validated indicators.
     */
    getTotalValidated(): number {
        return Array.from(this.indicators.values()).filter(i => i.validated).length;
    }

    /**
     * Load indicators from persistence.
     */
    loadIndicators(indicators: EmergentIndicator[]): void {
        for (const i of indicators) {
            this.indicators.set(i.id, i);
        }
    }

    // ─── Internal ────────────────────────────────────────────

    private parseIndicatorResponse(
        rawContent: unknown,
        island: OvermindIslandContext,
    ): EmergentIndicator[] {
        let rawIndicators: unknown[] = [];

        if (Array.isArray(rawContent)) {
            rawIndicators = rawContent;
        } else if (typeof rawContent === 'object' && rawContent !== null) {
            const obj = rawContent as Record<string, unknown>;
            if (Array.isArray(obj.indicators)) {
                rawIndicators = obj.indicators;
            }
        }

        const results: EmergentIndicator[] = [];

        for (const raw of rawIndicators) {
            if (typeof raw !== 'object' || raw === null) continue;
            const r = raw as Record<string, unknown>;

            const id = uuidv4();

            // Parse the composite gene configuration
            const geneConfig = r.compositeGene as Record<string, unknown> | undefined;
            const compositeGene: CompositeFunctionGene = {
                id,
                operation: (String(geneConfig?.operation || 'RATIO')) as CompositeOperation,
                inputA: {
                    sourceType: 'indicator' as const,
                    indicatorType: (String(geneConfig?.inputA || 'RSI')) as IndicatorType,
                    period: Number(geneConfig?.periodA) || 14,
                },
                inputB: {
                    sourceType: 'indicator' as const,
                    indicatorType: (String(geneConfig?.inputB || 'EMA')) as IndicatorType,
                    period: Number(geneConfig?.periodB) || 14,
                },
                outputNormalization: (String(geneConfig?.normalization || 'z_score')) as 'none' | 'percentile' | 'z_score' | 'min_max',
                outputPeriod: Number(geneConfig?.outputPeriod) || 20,
            };

            const indicator: EmergentIndicator = {
                id,
                name: String(r.name || 'Unknown Indicator'),
                description: String(r.description || ''),
                formula: String(r.formula || ''),
                compositeGene,
                reasoning: String(r.reasoning || ''),
                expectedEdge: String(r.expectedEdge || ''),
                bestRegime: (String(r.bestRegime || island.currentRegime || 'RANGING')) as MarketRegime,
                validated: false,
                validationFitness: null,
                adoptionCount: 0,
                createdAt: Date.now(),
            };

            results.push(indicator);
            this.indicators.set(id, indicator);
        }

        return results;
    }
}
