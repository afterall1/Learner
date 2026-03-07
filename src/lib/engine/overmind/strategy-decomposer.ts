// ============================================================
// Learner: Strategy Decomposer — RSRD Synthesis
// ============================================================
// Radical Innovation #3: Recursive Strategy Decomposition &
// Recombination (RSRD). Uses Opus 4.6 to decompose strategies
// into semantic atoms, reason about compatibility, and
// synthesize new strategies from N parents' best components.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type RSRDSynthesis,
    type StrategyAtom,
    type OvermindIslandContext,
    OvermindEventType,
} from '@/types/overmind';
import {
    type StrategyDNA,
    MarketRegime,
    StrategyStatus,
} from '@/types';
import { OpusClient } from './opus-client';
import { buildRSRDPrompt, getSystemPrompt } from './prompt-engine';
import { isRSRDObject } from './response-parser';
import { ReasoningJournal } from './reasoning-journal';
import { generateRandomStrategy, crossover } from '../strategy-dna';

// ─── Strategy Decomposer ─────────────────────────────────────

export class StrategyDecomposer {
    private syntheses: Map<string, RSRDSynthesis> = new Map();
    private readonly opus: OpusClient;
    private readonly journal: ReasoningJournal;

    constructor(journal: ReasoningJournal) {
        this.opus = OpusClient.getInstance();
        this.journal = journal;
    }

    // ─── RSRD Pipeline ───────────────────────────────────────

    /**
     * Perform the full RSRD pipeline:
     * 1. Decompose top strategies into semantic atoms
     * 2. Reason about atom compatibility
     * 3. Synthesize new strategy from best atoms
     */
    async performRSRD(
        topStrategies: StrategyDNA[],
        regime: MarketRegime | null,
        generation: number,
    ): Promise<RSRDSynthesis | null> {
        if (!this.opus.isAvailable() || topStrategies.length < 3) {
            return null;
        }

        // Prepare strategy summaries for the prompt
        const strategySummaries = topStrategies.slice(0, 5).map(s => ({
            name: s.name,
            fitness: s.metadata.fitnessScore,
            indicators: s.indicators.map(i => `${i.type}(${i.period})`),
            hasAdvancedGenes: !!(
                s.microstructureGenes?.length ||
                s.priceActionGenes?.length ||
                s.compositeGenes?.length ||
                s.dcGenes?.length
            ),
            riskGenes: s.riskGenes,
        }));

        const prompt = buildRSRDPrompt(strategySummaries, regime);
        const response = await this.opus.analyzeWithSchema(
            getSystemPrompt(),
            prompt,
            isRSRDObject,
            { temperature: 0.6, budgetTokens: 10_000 },
        );

        if (!response?.content) {
            return null;
        }

        const synthesis = this.parseSynthesisResponse(
            response.content,
            topStrategies,
            generation,
        );

        if (synthesis) {
            this.syntheses.set(synthesis.id, synthesis);

            // Record in journal
            this.journal.recordEntry(
                OvermindEventType.RSRD_SYNTHESIS,
                null,
                {
                    regime,
                    generation,
                    populationSize: topStrategies.length,
                    bestFitness: Math.max(...topStrategies.map(s => s.metadata.fitnessScore)),
                },
                `RSRD synthesis: Combined ${synthesis.selectedAtoms.length} atoms from ${synthesis.sourceStrategies.length} parents. ${synthesis.compatibilityReasoning.substring(0, 100)}`,
                synthesis.confidence,
                response.usage.totalTokens,
            );
        }

        return synthesis;
    }

    /**
     * Track the outcome of a synthesized strategy.
     */
    trackOutcome(synthesisId: string, actualFitness: number, bestParentFitness: number): void {
        const synthesis = this.syntheses.get(synthesisId);
        if (!synthesis) return;

        synthesis.outcome = {
            actualFitness,
            surpassedParents: actualFitness > bestParentFitness,
        };
        this.syntheses.set(synthesisId, synthesis);
    }

    // ─── Queries ─────────────────────────────────────────────

    /**
     * Get all syntheses.
     */
    getAllSyntheses(): RSRDSynthesis[] {
        return Array.from(this.syntheses.values());
    }

    /**
     * Get RSRD success rate (syntheses that surpassed parents).
     */
    getSuccessRate(): number {
        const withOutcome = Array.from(this.syntheses.values())
            .filter(s => s.outcome !== null);
        if (withOutcome.length === 0) return 0;

        const surpassed = withOutcome.filter(s => s.outcome?.surpassedParents === true).length;
        return surpassed / withOutcome.length;
    }

    /**
     * Get total syntheses performed.
     */
    getTotalCount(): number {
        return this.syntheses.size;
    }

    /**
     * Load syntheses from persistence.
     */
    loadSyntheses(syntheses: RSRDSynthesis[]): void {
        for (const s of syntheses) {
            this.syntheses.set(s.id, s);
        }
    }

    // ─── Internal ────────────────────────────────────────────

    /**
     * Create a StrategyDNA from RSRD synthesis output.
     * This combines the best atoms from multiple parents into a new genome.
     */
    createSynthesizedDNA(
        synthesis: RSRDSynthesis,
        sourceStrategies: StrategyDNA[],
        generation: number,
    ): StrategyDNA | null {
        if (sourceStrategies.length < 2) return null;

        // Start with crossover of top two parents as base
        const parentA = sourceStrategies[0];
        const parentB = sourceStrategies[1];
        const baseDNA = crossover(parentA, parentB, generation);

        // Apply RSRD modifications based on atoms
        const synthesized: StrategyDNA = {
            ...baseDNA,
            id: uuidv4(),
            name: `RSRD: ${synthesis.compatibilityReasoning.substring(0, 25)}...`,
            parentIds: sourceStrategies.map(s => s.id),
            metadata: {
                ...baseDNA.metadata,
                overmindOrigin: 'rsrd',
            },
        };

        // Apply risk genes from atom with best risk profile
        const riskAtom = synthesis.selectedAtoms.find(a => a.component === 'risk_profile');
        if (riskAtom) {
            const riskSource = sourceStrategies.find(
                s => s.name === riskAtom.sourceStrategyName,
            );
            if (riskSource) {
                synthesized.riskGenes = { ...riskSource.riskGenes };
            }
        }

        // Apply advanced genes from atoms
        const advancedAtom = synthesis.selectedAtoms.find(a => a.component === 'advanced_gene');
        if (advancedAtom) {
            const advSource = sourceStrategies.find(
                s => s.name === advancedAtom.sourceStrategyName,
            );
            if (advSource) {
                if (advSource.microstructureGenes?.length) {
                    synthesized.microstructureGenes = [...advSource.microstructureGenes];
                }
                if (advSource.priceActionGenes?.length) {
                    synthesized.priceActionGenes = [...advSource.priceActionGenes];
                }
                if (advSource.compositeGenes?.length) {
                    synthesized.compositeGenes = [...advSource.compositeGenes];
                }
                if (advSource.dcGenes?.length) {
                    synthesized.dcGenes = [...advSource.dcGenes];
                }
            }
        }

        // Apply direction bias from entry atom
        const entryAtom = synthesis.selectedAtoms.find(a => a.component === 'entry_signal');
        if (entryAtom) {
            const entrySource = sourceStrategies.find(
                s => s.name === entryAtom.sourceStrategyName,
            );
            if (entrySource) {
                synthesized.directionBias = entrySource.directionBias;
                synthesized.entryRules = { ...entrySource.entryRules };
            }
        }

        // Apply exit rules from exit atom
        const exitAtom = synthesis.selectedAtoms.find(a => a.component === 'exit_signal');
        if (exitAtom) {
            const exitSource = sourceStrategies.find(
                s => s.name === exitAtom.sourceStrategyName,
            );
            if (exitSource) {
                synthesized.exitRules = { ...exitSource.exitRules };
            }
        }

        return synthesized;
    }

    private parseSynthesisResponse(
        rawContent: unknown,
        topStrategies: StrategyDNA[],
        generation: number,
    ): RSRDSynthesis | null {
        if (typeof rawContent !== 'object' || rawContent === null) return null;
        const r = rawContent as Record<string, unknown>;

        // Parse selected atoms
        const atoms: StrategyAtom[] = [];
        if (Array.isArray(r.selectedAtoms)) {
            for (const raw of r.selectedAtoms) {
                if (typeof raw !== 'object' || raw === null) continue;
                const a = raw as Record<string, unknown>;
                atoms.push({
                    component: (String(a.component || 'entry_signal')) as StrategyAtom['component'],
                    sourceStrategyId: String(a.sourceStrategyId || ''),
                    sourceStrategyName: String(a.sourceStrategyName || ''),
                    description: String(a.description || ''),
                    reasoning: String(a.reasoning || ''),
                    bestRegime: (String(a.bestRegime || 'RANGING')) as MarketRegime,
                    estimatedFitnessContribution: Number(a.estimatedFitnessContribution) || 0,
                    geneData: (typeof a.geneData === 'object' && a.geneData !== null)
                        ? a.geneData as Record<string, unknown>
                        : {},
                });
            }
        }

        if (atoms.length === 0) return null;

        const synthesis: RSRDSynthesis = {
            id: uuidv4(),
            sourceStrategies: topStrategies.slice(0, 5).map(s => ({
                id: s.id,
                name: s.name,
                fitness: s.metadata.fitnessScore,
            })),
            selectedAtoms: atoms,
            compatibilityReasoning: String(r.compatibilityReasoning || ''),
            expectedSynergy: String(r.expectedSynergy || ''),
            resultDNA: null, // Will be created via createSynthesizedDNA
            confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
            outcome: null,
            createdAt: Date.now(),
        };

        // Create the synthesized DNA
        synthesis.resultDNA = this.createSynthesizedDNA(synthesis, topStrategies, generation);

        return synthesis;
    }
}
