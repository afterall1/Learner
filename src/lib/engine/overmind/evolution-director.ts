// ============================================================
// Learner: Evolution Director — GA Guidance via Opus 4.6
// ============================================================
// Analyzes each generation's results and generates actionable
// directives (mutation suggestions, crossover targets, gene
// proposals) that guide the GA toward better strategies.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type EvolutionDirective,
    type MutationSuggestion,
    type CrossoverSuggestion,
    type GeneProposal,
    type FitnessAdjustment,
    type RSRDSynthesis,
    type OvermindIslandContext,
    OvermindEventType,
} from '@/types/overmind';
import { OpusClient } from './opus-client';
import { buildPostMortemPrompt, getSystemPrompt } from './prompt-engine';
import { isDirectiveObject } from './response-parser';
import { ReasoningJournal } from './reasoning-journal';

// ─── Evolution Director ──────────────────────────────────────

export class EvolutionDirector {
    private directives: Map<string, EvolutionDirective> = new Map();
    private readonly opus: OpusClient;
    private readonly journal: ReasoningJournal;

    constructor(journal: ReasoningJournal) {
        this.opus = OpusClient.getInstance();
        this.journal = journal;
    }

    // ─── Directive Generation ────────────────────────────────

    /**
     * Analyze a generation and generate evolution directives.
     */
    async generateDirectives(
        island: OvermindIslandContext,
    ): Promise<EvolutionDirective | null> {
        if (!this.opus.isAvailable()) {
            return null;
        }

        // Get recent directives for this island (for context continuity)
        const recentDirectives = this.getDirectivesForIsland(island.slotId, 3);

        const prompt = buildPostMortemPrompt(island, recentDirectives);
        const response = await this.opus.analyzeWithSchema(
            getSystemPrompt(),
            prompt,
            isDirectiveObject,
            { temperature: 0.3, budgetTokens: 8_000 },
        );

        if (!response?.content) {
            return null;
        }

        const directive = this.parseDirectiveResponse(response.content, island);

        if (directive) {
            this.directives.set(directive.id, directive);

            // Record in journal
            this.journal.recordEntry(
                OvermindEventType.DIRECTIVE_ISSUED,
                island.slotId,
                {
                    regime: island.currentRegime,
                    generation: island.currentGeneration,
                    populationSize: island.populationSize,
                    bestFitness: island.bestFitness,
                },
                `Directive: ${directive.analysis.substring(0, 200)}`,
                0.7,
                response.usage.totalTokens,
            );
        }

        return directive;
    }

    // ─── Directive Application ───────────────────────────────

    /**
     * Record the impact of an applied directive.
     */
    recordDirectiveImpact(
        directiveId: string,
        fitnessBeforeAvg: number,
        fitnessAfterAvg: number,
        diversityChange: number,
    ): void {
        const directive = this.directives.get(directiveId);
        if (!directive) return;

        directive.applied = true;
        directive.impact = {
            fitnessBeforeAvg,
            fitnessAfterAvg,
            fitnessChange: fitnessAfterAvg - fitnessBeforeAvg,
            diversityChange,
        };
        this.directives.set(directiveId, directive);
    }

    // ─── Queries ─────────────────────────────────────────────

    /**
     * Get recent directives for an island.
     */
    getDirectivesForIsland(slotId: string, limit: number = 5): EvolutionDirective[] {
        return Array.from(this.directives.values())
            .filter(d => d.slotId === slotId)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit);
    }

    /**
     * Get all directives.
     */
    getAllDirectives(): EvolutionDirective[] {
        return Array.from(this.directives.values());
    }

    /**
     * Get average fitness impact of applied directives.
     */
    getAverageImpact(): number {
        const applied = Array.from(this.directives.values())
            .filter(d => d.applied && d.impact !== null);
        if (applied.length === 0) return 0;

        const totalImpact = applied.reduce(
            (sum, d) => sum + (d.impact?.fitnessChange ?? 0),
            0,
        );
        return totalImpact / applied.length;
    }

    /**
     * Get total directives issued.
     */
    getTotalCount(): number {
        return this.directives.size;
    }

    /**
     * Load directives from persistence.
     */
    loadDirectives(directives: EvolutionDirective[]): void {
        for (const d of directives) {
            this.directives.set(d.id, d);
        }
    }

    // ─── Internal ────────────────────────────────────────────

    private parseDirectiveResponse(
        rawContent: unknown,
        island: OvermindIslandContext,
    ): EvolutionDirective | null {
        if (typeof rawContent !== 'object' || rawContent === null) return null;
        const r = rawContent as Record<string, unknown>;

        // Extract population health
        const healthRaw = r.populationHealth as Record<string, unknown> | undefined;
        const populationHealth = {
            diversityAssessment: String(healthRaw?.diversityAssessment || 'Unknown'),
            convergenceRisk: (String(healthRaw?.convergenceRisk || 'medium')) as 'low' | 'medium' | 'high',
            stagnationRisk: (String(healthRaw?.stagnationRisk || 'medium')) as 'low' | 'medium' | 'high',
            recommendedAction: (String(healthRaw?.recommendedAction || 'continue')) as 'continue' | 'increase_mutation' | 'inject_diversity' | 'refocus',
        };

        // Extract mutations
        const mutations: MutationSuggestion[] = this.parseMutations(r.mutations);

        // Extract crossover targets
        const crossoverTargets: CrossoverSuggestion[] = this.parseCrossovers(r.crossoverTargets);

        // Extract gene proposals
        const newGeneProposals: GeneProposal[] = this.parseGeneProposals(r.newGeneProposals);

        // Extract fitness adjustments
        const fitnessAdjustments: FitnessAdjustment[] = this.parseFitnessAdjustments(r.fitnessAdjustments);

        const directive: EvolutionDirective = {
            id: uuidv4(),
            slotId: island.slotId,
            generationNumber: island.currentGeneration,
            analysis: String(r.analysis || 'No analysis provided'),
            populationHealth,
            mutations,
            crossoverTargets,
            newGeneProposals,
            fitnessAdjustments,
            rsrdSyntheses: [],
            applied: false,
            impact: null,
            createdAt: Date.now(),
        };

        return directive;
    }

    private parseMutations(raw: unknown): MutationSuggestion[] {
        if (!Array.isArray(raw)) return [];
        return raw.map((m: unknown) => {
            const r = m as Record<string, unknown>;
            return {
                strategyId: String(r.strategyId || ''),
                strategyName: String(r.strategyName || ''),
                geneType: (String(r.geneType || 'indicator')) as MutationSuggestion['geneType'],
                currentWeakness: String(r.currentWeakness || ''),
                suggestedChange: String(r.suggestedChange || ''),
                expectedImprovement: String(r.expectedImprovement || ''),
                confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
            };
        }).filter(m => m.strategyName.length > 0);
    }

    private parseCrossovers(raw: unknown): CrossoverSuggestion[] {
        if (!Array.isArray(raw)) return [];
        return raw.map((c: unknown) => {
            const r = c as Record<string, unknown>;
            return {
                parentAId: String(r.parentAId || ''),
                parentAName: String(r.parentAName || ''),
                parentBId: String(r.parentBId || ''),
                parentBName: String(r.parentBName || ''),
                preferredGenesFromA: Array.isArray(r.preferredGenesFromA)
                    ? r.preferredGenesFromA.map(String) : [],
                preferredGenesFromB: Array.isArray(r.preferredGenesFromB)
                    ? r.preferredGenesFromB.map(String) : [],
                reasoning: String(r.reasoning || ''),
                confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
            };
        }).filter(c => c.parentAName.length > 0);
    }

    private parseGeneProposals(raw: unknown): GeneProposal[] {
        if (!Array.isArray(raw)) return [];
        return raw.map((g: unknown) => {
            const r = g as Record<string, unknown>;
            return {
                geneFamily: (String(r.geneFamily || 'indicator')) as GeneProposal['geneFamily'],
                description: String(r.description || ''),
                expectedBenefit: String(r.expectedBenefit || ''),
                geneConfig: (typeof r.geneConfig === 'object' && r.geneConfig !== null)
                    ? r.geneConfig as Record<string, unknown>
                    : {},
                noveltyScore: Math.max(0, Math.min(1, Number(r.noveltyScore) || 0.5)),
                confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
            };
        }).filter(g => g.description.length > 0);
    }

    private parseFitnessAdjustments(raw: unknown): FitnessAdjustment[] {
        if (!Array.isArray(raw)) return [];
        return raw.map((f: unknown) => {
            const r = f as Record<string, unknown>;
            return {
                strategyId: String(r.strategyId || ''),
                adjustment: Math.max(-10, Math.min(10, Number(r.adjustment) || 0)),
                reasoning: String(r.reasoning || ''),
            };
        }).filter(f => f.strategyId.length > 0);
    }
}
