// ============================================================
// Learner: Overmind Directive Applicator (ODA)
// ============================================================
// Phase 24 Radical Innovation: Closes the Reasoning→Action loop.
//
// The Strategic Overmind generates directives (mutations, crossover
// suggestions, gene proposals, fitness adjustments, hypothesis seeds)
// but previously these were NEVER applied to the GA pipeline.
//
// ODA converts Overmind output into concrete GA operations:
//   - MutationSuggestion    → Targeted gene mutation on strategy
//   - CrossoverSuggestion   → Forced crossover of specific parents
//   - GeneProposal          → New gene injected into strategy
//   - FitnessAdjustment     → Fitness bonus/penalty via metadata
//   - RSRDSynthesis         → Synthesized strategy injected into population
//   - MarketHypothesis      → Partial DNA → full strategy → population seed
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type {
    EvolutionDirective,
    MutationSuggestion,
    CrossoverSuggestion,
    GeneProposal,
    FitnessAdjustment,
    RSRDSynthesis,
    MarketHypothesis,
} from '@/types/overmind';
import type {
    StrategyDNA,
    IndicatorGene,
    IndicatorType,
} from '@/types';
import {
    crossover,
    mutate,
    generateRandomStrategy,
} from '../strategy-dna';

// ─── Result Types ────────────────────────────────────────────

export interface DirectiveApplicationResult {
    /** How many mutations were applied */
    mutationsApplied: number;
    /** How many crossovers were executed */
    crossoversExecuted: number;
    /** How many new genes were injected */
    genesInjected: number;
    /** How many fitness adjustments were made */
    fitnessAdjustmentsApplied: number;
    /** How many RSRD strategies were synthesized and injected */
    rsrdStrategiesInjected: number;
    /** Strategies modified or created */
    affectedStrategyIds: string[];
    /** New strategies created (from hypothesis seeds, RSRD, gene proposals) */
    newStrategies: StrategyDNA[];
    /** Errors encountered during application */
    errors: string[];
}

// ─── Directive Applicator ────────────────────────────────────

export class DirectiveApplicator {

    /**
     * Apply a full EvolutionDirective to a strategy population.
     * Returns a result describing what was changed.
     */
    applyDirective(
        directive: EvolutionDirective,
        population: StrategyDNA[],
    ): DirectiveApplicationResult {
        const result: DirectiveApplicationResult = {
            mutationsApplied: 0,
            crossoversExecuted: 0,
            genesInjected: 0,
            fitnessAdjustmentsApplied: 0,
            rsrdStrategiesInjected: 0,
            affectedStrategyIds: [],
            newStrategies: [],
            errors: [],
        };

        // Build strategy lookup
        const strategyMap = new Map<string, StrategyDNA>();
        for (const strat of population) {
            strategyMap.set(strat.id, strat);
        }

        // 1. Apply mutation suggestions
        for (const mutation of directive.mutations) {
            try {
                this.applyMutation(mutation, strategyMap, result);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                result.errors.push(`Mutation failed for ${mutation.strategyId}: ${msg}`);
            }
        }

        // 2. Execute crossover suggestions
        for (const crossoverSuggestion of directive.crossoverTargets) {
            try {
                this.applyCrossover(crossoverSuggestion, strategyMap, result);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                result.errors.push(`Crossover failed for ${crossoverSuggestion.parentAId}×${crossoverSuggestion.parentBId}: ${msg}`);
            }
        }

        // 3. Inject new gene proposals
        for (const proposal of directive.newGeneProposals) {
            try {
                this.applyGeneProposal(proposal, population, result);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                result.errors.push(`Gene proposal failed: ${msg}`);
            }
        }

        // 4. Apply fitness adjustments
        this.applyFitnessAdjustments(directive.fitnessAdjustments, strategyMap, result);

        // 5. Inject RSRD syntheses
        for (const rsrd of directive.rsrdSyntheses) {
            try {
                this.applyRSRDSynthesis(rsrd, result);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                result.errors.push(`RSRD synthesis injection failed: ${msg}`);
            }
        }

        return result;
    }

    /**
     * Apply a MarketHypothesis as a seed strategy in a population.
     * Converts partial suggestedDNA into a full StrategyDNA.
     */
    applyHypothesisSeed(
        hypothesis: MarketHypothesis,
    ): StrategyDNA | null {
        if (!hypothesis.suggestedDNA && hypothesis.suggestedIndicators.length === 0) {
            return null;
        }

        // Generate a random base strategy
        const base = generateRandomStrategy();

        // Override with hypothesis suggestions
        const seed: StrategyDNA = {
            ...base,
            id: uuidv4(),
            name: `Hyp-${hypothesis.hypothesis.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '')}`,
            metadata: {
                ...base.metadata,
                overmindOrigin: 'hypothesis',
                hypothesisId: hypothesis.id,
            },
        };

        // Apply suggested DNA overrides
        if (hypothesis.suggestedDNA) {
            const suggested = hypothesis.suggestedDNA;

            // Risk gene overrides
            if (suggested.riskGenes) {
                seed.riskGenes = {
                    ...seed.riskGenes,
                    ...suggested.riskGenes,
                };
            }

            // Indicator overrides
            if (suggested.indicators && suggested.indicators.length > 0) {
                seed.indicators = suggested.indicators;
            }

            // Entry/exit rule overrides
            if (suggested.entryRules) {
                seed.entryRules = suggested.entryRules;
            }
            if (suggested.exitRules) {
                seed.exitRules = suggested.exitRules;
            }
        }

        // Apply suggested indicator types to existing genes
        if (hypothesis.suggestedIndicators.length > 0) {
            for (let i = 0; i < Math.min(hypothesis.suggestedIndicators.length, seed.indicators.length); i++) {
                seed.indicators[i].type = hypothesis.suggestedIndicators[i];
            }
        }

        return seed;
    }

    // ─── Private Application Methods ─────────────────────────

    private applyMutation(
        mutation: MutationSuggestion,
        strategies: Map<string, StrategyDNA>,
        result: DirectiveApplicationResult,
    ): void {
        const strategy = strategies.get(mutation.strategyId);
        if (!strategy) return;

        // Apply a targeted mutation to the strategy with high rate to ensure change
        const mutated = mutate(strategy, 0.8);
        mutated.id = strategy.id; // Preserve ID (in-place mutation)
        mutated.name = `${strategy.name}-ODA`;

        // Copy mutated core genes back to original
        strategy.indicators = mutated.indicators;
        strategy.entryRules = mutated.entryRules;
        strategy.exitRules = mutated.exitRules;
        strategy.riskGenes = mutated.riskGenes;

        // Copy mutated advanced genes based on geneType
        if (mutation.geneType === 'microstructure' && mutated.microstructureGenes) {
            strategy.microstructureGenes = mutated.microstructureGenes;
        }
        if (mutation.geneType === 'priceAction' && mutated.priceActionGenes) {
            strategy.priceActionGenes = mutated.priceActionGenes;
        }
        if (mutation.geneType === 'composite' && mutated.compositeGenes) {
            strategy.compositeGenes = mutated.compositeGenes;
        }
        if (mutation.geneType === 'dc' && mutated.dcGenes) {
            strategy.dcGenes = mutated.dcGenes;
        }
        if (mutation.geneType === 'confluence' && mutated.confluenceGenes) {
            strategy.confluenceGenes = mutated.confluenceGenes;
        }

        // Record mutation origin
        strategy.metadata.directiveId = mutation.strategyId;
        strategy.metadata.mutationHistory.push(`ODA-${mutation.geneType}-${Date.now()}`);

        result.mutationsApplied++;
        result.affectedStrategyIds.push(strategy.id);
    }

    private applyCrossover(
        suggestion: CrossoverSuggestion,
        strategies: Map<string, StrategyDNA>,
        result: DirectiveApplicationResult,
    ): void {
        const parentA = strategies.get(suggestion.parentAId);
        const parentB = strategies.get(suggestion.parentBId);
        if (!parentA || !parentB) return;

        // Use the standard crossover function
        const child = crossover(parentA, parentB, parentA.generation + 1);
        child.name = `ODA-Cross-${parentA.name.substring(0, 10)}×${parentB.name.substring(0, 10)}`;

        result.crossoversExecuted++;
        result.newStrategies.push(child);
        result.affectedStrategyIds.push(child.id);
    }

    private applyGeneProposal(
        proposal: GeneProposal,
        population: StrategyDNA[],
        result: DirectiveApplicationResult,
    ): void {
        if (population.length === 0) return;

        // Find a random strategy to receive the new gene
        const targetIdx = Math.floor(Math.random() * population.length);
        const target = population[targetIdx];

        // For indicator gene proposals, inject as a new indicator gene
        if (proposal.geneFamily === 'indicator' && proposal.geneConfig) {
            const newGene: IndicatorGene = {
                id: uuidv4(),
                type: (proposal.geneConfig.type as IndicatorType) || target.indicators[0]?.type,
                period: (proposal.geneConfig.period as number) || 14,
                params: (proposal.geneConfig.params as Record<string, number>) || {},
            };

            // Replace the weakest indicator (last one) or add if under 5
            if (target.indicators.length < 5) {
                target.indicators.push(newGene);
            } else {
                target.indicators[target.indicators.length - 1] = newGene;
            }
        }

        result.genesInjected++;
        result.affectedStrategyIds.push(target.id);
    }

    private applyFitnessAdjustments(
        adjustments: FitnessAdjustment[],
        strategies: Map<string, StrategyDNA>,
        result: DirectiveApplicationResult,
    ): void {
        for (const adj of adjustments) {
            const strategy = strategies.get(adj.strategyId);
            if (!strategy) continue;

            // Apply fitness adjustment directly to metadata.fitnessScore
            strategy.metadata.fitnessScore += adj.adjustment;

            // Record in mutation history for traceability
            strategy.metadata.mutationHistory.push(
                `ODA-Fitness-${adj.adjustment > 0 ? '+' : ''}${adj.adjustment.toFixed(1)}-${Date.now()}`,
            );

            result.fitnessAdjustmentsApplied++;
            result.affectedStrategyIds.push(strategy.id);
        }
    }

    private applyRSRDSynthesis(
        rsrd: RSRDSynthesis,
        result: DirectiveApplicationResult,
    ): void {
        if (!rsrd.resultDNA) return;

        // Ensure the synthesized DNA has a valid ID and overmind origin
        const synthesized: StrategyDNA = {
            ...rsrd.resultDNA,
            id: rsrd.resultDNA.id || uuidv4(),
            name: rsrd.resultDNA.name || `RSRD-${rsrd.id.substring(0, 8)}`,
            metadata: {
                ...rsrd.resultDNA.metadata,
                overmindOrigin: 'rsrd' as const,
            },
        };

        result.rsrdStrategiesInjected++;
        result.newStrategies.push(synthesized);
        result.affectedStrategyIds.push(synthesized.id);
    }
}

// ─── Singleton Access ────────────────────────────────────────

let instance: DirectiveApplicator | null = null;

export function getDirectiveApplicator(): DirectiveApplicator {
    if (!instance) {
        instance = new DirectiveApplicator();
    }
    return instance;
}

export function resetDirectiveApplicator(): void {
    instance = null;
}
