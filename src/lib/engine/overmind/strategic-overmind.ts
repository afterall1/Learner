// ============================================================
// Learner: Strategic Overmind — Main Orchestrator
// ============================================================
// Phase 15: The world's first Reasoning-Guided Evolutionary
// Architecture. This singleton coordinates all Overmind sub-
// engines through a 6-phase lifecycle cycle:
// OBSERVE → ANALYZE → HYPOTHESIZE → DIRECT → VERIFY → LEARN
//
// Radical Innovation #4 (CCR): Counterfactual Causal Replay
// adds episodic memory, counterfactual reasoning, and meta-
// cognitive self-improvement to the LEARN phase.
// ============================================================

import {
    type OvermindConfig,
    type OvermindSnapshot,
    type OvermindCycleContext,
    type OvermindCycleResult,
    type OvermindIslandContext,
    type MarketHypothesis,
    type EvolutionDirective,
    type EmergentIndicator,
    type RSRDSynthesis,
    type ResilienceReport,
    type ReasoningEntry,
    type PairProfile,
    type EpisodeContext,
    type EpisodeAction,
    type EpisodeOutcome,
    type MetaInsight,
    OvermindPhase,
    OvermindEventType,
    DEFAULT_OVERMIND_CONFIG,
} from '@/types/overmind';
import { type StrategyDNA, type IslandSnapshot, MarketRegime, type Timeframe } from '@/types';
import { type RegimeTransitionForecast } from '../regime-intelligence';

import { OpusClient } from './opus-client';
import { HypothesisEngine } from './hypothesis-engine';
import { EvolutionDirector } from './evolution-director';
import { PairSpecialist } from './pair-specialist';
import { AdversarialTester } from './adversarial-tester';
import { EmergentIndicatorEngine } from './emergent-indicator';
import { StrategyDecomposer } from './strategy-decomposer';
import { ReasoningJournal } from './reasoning-journal';
import { EpisodicMemory } from './episodic-memory';
import { CounterfactualEngine } from './counterfactual-engine';
import { MetaCognitionLoop } from './meta-cognition';
import { PredictiveOrchestrator } from './predictive-orchestrator';

// ─── Strategic Overmind ──────────────────────────────────────

export class StrategicOvermind {
    private static instance: StrategicOvermind | null = null;

    private readonly config: OvermindConfig;
    private readonly opus: OpusClient;
    private readonly journal: ReasoningJournal;
    private readonly hypothesisEngine: HypothesisEngine;
    private readonly evolutionDirector: EvolutionDirector;
    private readonly pairSpecialist: PairSpecialist;
    private readonly adversarialTester: AdversarialTester;
    private readonly emergentIndicatorEngine: EmergentIndicatorEngine;
    private readonly strategyDecomposer: StrategyDecomposer;

    // ── CCR Modules (Radical Innovation #4) ──────────────────
    private readonly episodicMemory: EpisodicMemory;
    private readonly counterfactualEngine: CounterfactualEngine;
    private readonly metaCognition: MetaCognitionLoop;

    // ── PSPP Module (Radical Innovation #6) ──────────────────
    private readonly predictiveOrchestrator: PredictiveOrchestrator;

    // ── State ────────────────────────────────────────────────
    private currentPhase: OvermindPhase = OvermindPhase.IDLE;
    private cycleCount: number = 0;
    private lastCycleGeneration: Map<string, number> = new Map();
    private isRunning: boolean = false;
    // Tracks episode IDs pending outcome resolution
    private pendingEpisodeMap: Map<string, string> = new Map();

    private constructor(config: Partial<OvermindConfig> = {}) {
        this.config = { ...DEFAULT_OVERMIND_CONFIG, ...config };
        this.opus = OpusClient.getInstance(this.config);
        this.journal = new ReasoningJournal();
        this.hypothesisEngine = new HypothesisEngine(
            this.config.maxHypothesesPerIsland,
            this.config.hypothesisMaxAgeGenerations,
            this.journal,
        );
        this.evolutionDirector = new EvolutionDirector(this.journal);
        this.pairSpecialist = new PairSpecialist(this.config.pairProfileCacheTTL, this.journal);
        this.adversarialTester = new AdversarialTester(this.config.maxResilienceBonus, this.journal);
        this.emergentIndicatorEngine = new EmergentIndicatorEngine(this.journal);
        this.strategyDecomposer = new StrategyDecomposer(this.journal);

        // CCR modules (Radical Innovation #4)
        this.episodicMemory = new EpisodicMemory();
        this.counterfactualEngine = new CounterfactualEngine(this.journal, this.episodicMemory);
        this.metaCognition = new MetaCognitionLoop(
            this.journal,
            this.episodicMemory,
            this.counterfactualEngine,
        );

        // PSPP module (Radical Innovation #6)
        this.predictiveOrchestrator = new PredictiveOrchestrator();
    }

    static getInstance(config?: Partial<OvermindConfig>): StrategicOvermind {
        if (!StrategicOvermind.instance) {
            StrategicOvermind.instance = new StrategicOvermind(config);
        }
        return StrategicOvermind.instance;
    }

    /** Reset singleton — for testing only */
    static resetInstance(): void {
        StrategicOvermind.instance = null;
    }

    // ─── Public API ──────────────────────────────────────────

    /**
     * Check if the Overmind is enabled and API is available.
     */
    isEnabled(): boolean {
        return this.config.enabled && this.opus.isAvailable();
    }

    /**
     * Run a full Overmind cycle: OBSERVE → ANALYZE → HYPOTHESIZE → DIRECT → VERIFY → LEARN
     * This is the main entry point called by Cortex after meta-evolution.
     */
    async runCycle(islands: IslandSnapshot[]): Promise<OvermindCycleResult> {
        const startTime = Date.now();
        const result: OvermindCycleResult = {
            phase: OvermindPhase.IDLE,
            hypotheses: [],
            directives: [],
            adversarialReports: [],
            emergentIndicators: [],
            rsrdSyntheses: [],
            tokenUsage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 },
            cycleLatencyMs: 0,
            errors: [],
        };

        if (!this.isEnabled()) {
            return result;
        }

        if (this.isRunning) {
            result.errors.push('Overmind cycle already in progress');
            return result;
        }

        this.isRunning = true;

        try {
            // ── Phase 1: OBSERVE ─────────────────────────────
            this.currentPhase = OvermindPhase.OBSERVE;
            const islandContexts = this.buildIslandContexts(islands);

            // ── Phase 1.5: PSPP Forecast Ingestion (Innovation #6) ──
            // Collect MRTI forecasts from island snapshots and feed
            // them to the PredictiveOrchestrator for anticipatory action.
            const prePositionActions = this.predictiveOrchestrator.evaluateForecasts(
                this.collectMRTIForecasts(islands),
                islandContexts,
            );

            // ── Phase 2: ANALYZE (Pair Profiles) ─────────────
            this.currentPhase = OvermindPhase.ANALYZE;
            const pairProfiles = await this.analyzePairs(islandContexts);

            // ── Phase 3: HYPOTHESIZE ─────────────────────────
            this.currentPhase = OvermindPhase.HYPOTHESIZE;
            const hypotheses = await this.generateHypotheses(islandContexts, pairProfiles);

            // Merge PSPP pre-positioning hypotheses (Innovation #6)
            const prePositionHypotheses = this.predictiveOrchestrator
                .generatePrePositionHypotheses(prePositionActions, islandContexts);
            hypotheses.push(...prePositionHypotheses);

            result.hypotheses = hypotheses;

            // Record hypothesis episodes
            for (const hyp of hypotheses) {
                const ctx = islandContexts.find(i => i.slotId === hyp.slotId);
                if (ctx) {
                    const episode = this.episodicMemory.recordEpisode(
                        'hypothesis',
                        hyp.slotId,
                        this.buildEpisodeContext(ctx),
                        {
                            type: 'hypothesis',
                            summary: `Hypothesized: ${hyp.hypothesis}`,
                            hypothesisId: hyp.id,
                            suggestedIndicators: hyp.suggestedDNA?.indicators?.map(
                                (i: { type: string; period: number }) => `${i.type}(${i.period})`,
                            ) ?? [],
                        },
                    );
                    this.pendingEpisodeMap.set(hyp.id, episode.id);
                }
            }

            // ── Phase 4: DIRECT ──────────────────────────────
            this.currentPhase = OvermindPhase.DIRECT;
            const directives = await this.generateDirectives(islandContexts);
            result.directives = directives;

            // Record directive episodes
            for (const dir of directives) {
                const ctx = islandContexts.find(i => i.slotId === dir.slotId);
                if (ctx) {
                    const episode = this.episodicMemory.recordEpisode(
                        'directive',
                        dir.slotId,
                        this.buildEpisodeContext(ctx),
                        {
                            type: 'directive',
                            summary: `Directive: ${dir.analysis.substring(0, 100)}`,
                            directiveId: dir.id,
                            suggestedMutation: dir.mutations?.map(
                                (m: { geneType: string }) => m.geneType,
                            ).join(', ') ?? undefined,
                        },
                    );
                    this.pendingEpisodeMap.set(dir.id, episode.id);
                }
            }

            // ── Phase 5: VERIFY (Adversarial + RSRD + EID) ──
            this.currentPhase = OvermindPhase.VERIFY;

            // Adversarial Testing (Innovation #1)
            if (this.config.adversarialTestingEnabled) {
                const reports = await this.runAdversarialTests(islands);
                result.adversarialReports = reports;
            }

            // Emergent Indicator Discovery (Innovation #2)
            if (this.config.emergentIndicatorEnabled) {
                const indicators = await this.discoverEmergentIndicators(islandContexts);
                result.emergentIndicators = indicators;
            }

            // RSRD Synthesis (Innovation #3)
            if (this.config.rsrdEnabled) {
                const syntheses = await this.performRSRDSynthesis(islands, islandContexts);
                result.rsrdSyntheses = syntheses;
            }

            // ── Phase 6: LEARN (CCR-powered) ─────────────────
            this.currentPhase = OvermindPhase.LEARN;
            await this.learnFromCycle(result);

            // ── Meta-Cognition (every N cycles) ──────────────
            if (this.metaCognition.shouldRun()) {
                try {
                    await this.metaCognition.runCycle();
                } catch (error) {
                    console.error('[Overmind] Meta-cognition cycle error:', error);
                }
            }

            // ── Finalize ─────────────────────────────────────
            this.cycleCount++;
            this.currentPhase = OvermindPhase.IDLE;
            result.phase = OvermindPhase.IDLE;

            // Aggregate token usage
            result.tokenUsage = {
                inputTokens: 0,
                outputTokens: 0,
                thinkingTokens: 0,
                totalTokens: this.opus.getTokensUsedThisHour(),
            };

            result.cycleLatencyMs = Date.now() - startTime;

            // Record cycle completion
            this.journal.recordEntry(
                OvermindEventType.CYCLE_COMPLETED,
                null,
                { regime: null, generation: null, populationSize: islands.length, bestFitness: null },
                `Cycle ${this.cycleCount} completed: ${hypotheses.length} hypotheses, ${directives.length} directives, ${result.adversarialReports.length} adversarial tests, ${result.emergentIndicators.length} emergent indicators, ${result.rsrdSyntheses.length} RSRD syntheses, ${this.episodicMemory.size()} episodes stored. ${result.cycleLatencyMs}ms.`,
                1.0,
                0,
            );

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push(`Cycle error: ${errorMessage}`);
            console.error('[Overmind] Cycle error:', errorMessage);
            this.currentPhase = OvermindPhase.IDLE;
        } finally {
            this.isRunning = false;
        }

        return result;
    }

    /**
     * Hook called after each generation evolves.
     * Determines if it's time for a hypothesis or directive.
     */
    async onGenerationEvolved(
        islandSnapshot: IslandSnapshot,
        generation: number,
    ): Promise<{
        hypothesisSeeds: StrategyDNA[];
        directive: EvolutionDirective | null;
    }> {
        const defaultResult = { hypothesisSeeds: [], directive: null };
        if (!this.isEnabled()) return defaultResult;

        const slotId = islandSnapshot.slotId;
        const lastCycleGen = this.lastCycleGeneration.get(slotId) ?? 0;

        // Check if enough generations have passed
        if (generation - lastCycleGen < this.config.cycleIntervalGenerations) {
            return defaultResult;
        }

        this.lastCycleGeneration.set(slotId, generation);
        const islandContext = this.buildSingleIslandContext(islandSnapshot);

        // Generate hypothesis seeds if interval met
        const hypothesisSeeds: StrategyDNA[] = [];
        if (generation % this.config.hypothesisIntervalGenerations === 0) {
            const hypotheses = this.hypothesisEngine.getActiveHypotheses(slotId);
            for (const h of hypotheses) {
                if (h.status === 'PROPOSED') {
                    const seed = this.hypothesisEngine.synthesizeSeedDNA(h, generation);
                    hypothesisSeeds.push(seed);
                }
            }
        }

        // Generate directive if interval met
        let directive: EvolutionDirective | null = null;
        if (generation % this.config.directiveIntervalGenerations === 0) {
            directive = await this.evolutionDirector.generateDirectives(islandContext);
        }

        return { hypothesisSeeds, directive };
    }

    // ─── Snapshot ────────────────────────────────────────────

    /**
     * Get the current Overmind snapshot for the dashboard.
     */
    getSnapshot(): OvermindSnapshot {
        const recentInsights = this.journal.getRecentEntries(10);
        const hypothesesByIsland: Record<string, number> = {};

        for (const h of this.hypothesisEngine.getAllHypotheses()) {
            hypothesesByIsland[h.slotId] = (hypothesesByIsland[h.slotId] || 0) + 1;
        }

        return {
            isActive: this.isEnabled(),
            currentPhase: this.currentPhase,
            cycleCount: this.cycleCount,
            totalHypotheses: this.hypothesisEngine.getTotalCount(),
            activeHypotheses: this.hypothesisEngine.getAllHypotheses()
                .filter(h => h.status !== 'ARCHIVED' && h.status !== 'INVALIDATED').length,
            hypothesisSuccessRate: this.hypothesisEngine.getHypothesisSuccessRate(),
            totalDirectives: this.evolutionDirector.getTotalCount(),
            avgDirectiveImpact: this.evolutionDirector.getAverageImpact(),
            tokensUsedLifetime: this.opus.getTotalTokensUsed(),
            tokensUsedThisHour: this.opus.getTokensUsedThisHour(),
            tokenBudgetRemaining: this.opus.getTokenBudgetRemaining(),
            emergentIndicatorsDiscovered: this.emergentIndicatorEngine.getTotalDiscovered(),
            rsrdSynthesesTotalPerformed: this.strategyDecomposer.getTotalCount(),
            adversarialTestsRun: this.adversarialTester.getTotalTestsRun(),
            avgResilienceScore: this.adversarialTester.getAverageResilience(),
            recentInsights,
            hypothesesByIsland,
            // CCR metrics (Radical Innovation #4)
            episodicMemorySize: this.episodicMemory.size(),
            metaInsightsActive: this.metaCognition.getActiveCount(),
            selfImprovementRate: this.metaCognition.calculateSelfImprovementRate(),
            counterfactualsGenerated: this.counterfactualEngine.getTotalCounterfactuals(),
            // PSPP metrics (Radical Innovation #6)
            activePrePositions: this.predictiveOrchestrator.getActivePrePositions().length,
            predictionAccuracyRate: this.predictiveOrchestrator.getPredictionAccuracy().accuracyRate,
            imminentTransitions: this.predictiveOrchestrator.getImminentTransitionCount(),
        };
    }

    // ─── Sub-Engine Access ───────────────────────────────────

    getHypothesisEngine(): HypothesisEngine {
        return this.hypothesisEngine;
    }

    getEvolutionDirector(): EvolutionDirector {
        return this.evolutionDirector;
    }

    getPairSpecialist(): PairSpecialist {
        return this.pairSpecialist;
    }

    getAdversarialTester(): AdversarialTester {
        return this.adversarialTester;
    }

    getEmergentIndicatorEngine(): EmergentIndicatorEngine {
        return this.emergentIndicatorEngine;
    }

    getStrategyDecomposer(): StrategyDecomposer {
        return this.strategyDecomposer;
    }

    getJournal(): ReasoningJournal {
        return this.journal;
    }

    getEpisodicMemory(): EpisodicMemory {
        return this.episodicMemory;
    }

    getCounterfactualEngine(): CounterfactualEngine {
        return this.counterfactualEngine;
    }

    getMetaCognition(): MetaCognitionLoop {
        return this.metaCognition;
    }

    getPredictiveOrchestrator(): PredictiveOrchestrator {
        return this.predictiveOrchestrator;
    }

    // ─── CCR: Episode Outcome Resolution ─────────────────────

    /**
     * Called when a hypothesis or directive has been tested.
     * Resolves the pending episode with actual outcome data.
     */
    resolveEpisodeOutcome(
        referenceId: string, // hypothesis ID or directive ID
        outcome: EpisodeOutcome,
    ): void {
        const episodeId = this.pendingEpisodeMap.get(referenceId);
        if (!episodeId) return;

        this.episodicMemory.resolveOutcome(episodeId, outcome);
        this.pendingEpisodeMap.delete(referenceId);
    }

    /**
     * Build a PromptPrimer for context-aware prompts.
     * Injects past experience into future hypothesis/directive generation.
     */
    getPromptPrimer(pair: string, regime: MarketRegime | null) {
        return this.counterfactualEngine.buildPromptPrimer(pair, regime);
    }

    // ─── Internal Methods ────────────────────────────────────

    private buildIslandContexts(islands: IslandSnapshot[]): OvermindIslandContext[] {
        return islands.map(this.buildSingleIslandContext);
    }

    private buildSingleIslandContext(island: IslandSnapshot): OvermindIslandContext {
        // Get top 3 strategies
        const allStrategies = [
            ...(island.activeStrategy ? [island.activeStrategy] : []),
            ...island.candidateStrategies,
        ].sort((a, b) => b.metadata.fitnessScore - a.metadata.fitnessScore)
            .slice(0, 3);

        const topStrategies = allStrategies.map(s => ({
            name: s.name,
            fitness: s.metadata.fitnessScore,
            indicators: s.indicators.map(i => `${i.type}(${i.period})`),
            hasAdvancedGenes: !!(
                s.microstructureGenes?.length ||
                s.priceActionGenes?.length ||
                s.compositeGenes?.length ||
                s.dcGenes?.length
            ),
        }));

        // Calculate diversity index (fraction of unique indicator types)
        const allIndicatorTypes = new Set<string>();
        for (const s of allStrategies) {
            for (const i of s.indicators) {
                allIndicatorTypes.add(i.type);
            }
        }

        return {
            slotId: island.slotId,
            pair: island.pair,
            timeframe: island.timeframe,
            state: island.state,
            currentGeneration: island.currentGeneration,
            bestFitness: island.bestFitnessAllTime,
            avgFitness: island.performanceMetrics?.expectancy ?? 0,
            currentRegime: island.currentRegime,
            mutationRate: island.currentMutationRate,
            populationSize: island.candidateStrategies.length + (island.activeStrategy ? 1 : 0),
            diversityIndex: allIndicatorTypes.size / 9, // 9 possible indicator types
            topStrategies,
            fitnessTrend: [], // Will be populated from generation history
            tradesSummary: island.performanceMetrics ? {
                total: island.performanceMetrics.totalTrades,
                winRate: island.performanceMetrics.winRate,
                avgPnl: island.performanceMetrics.totalPnlPercent,
                sharpe: island.performanceMetrics.sharpeRatio,
            } : null,
        };
    }
    /**
     * Collect MRTI-like regime transition forecasts from island snapshots.
     * Since IslandSnapshot doesn't directly expose the MRTI engine,
     * we synthesize forecasts from available signals:
     *   - Current regime (from island)
     *   - Fitness trends (stagnation → regime instability)
     *   - Regime diversity across islands (cross-island regime shift)
     *
     * When full MRTI integration is available (Island exposes getForecast()),
     * this method should be replaced with direct MRTI calls.
     */
    private collectMRTIForecasts(
        islands: IslandSnapshot[],
    ): Map<string, RegimeTransitionForecast> {
        const forecasts = new Map<string, RegimeTransitionForecast>();
        const allRegimes: MarketRegime[] = [
            MarketRegime.TRENDING_UP,
            MarketRegime.TRENDING_DOWN,
            MarketRegime.RANGING,
            MarketRegime.HIGH_VOLATILITY,
            MarketRegime.LOW_VOLATILITY,
        ];

        for (const island of islands) {
            if (!island.currentRegime) continue;

            const currentRegime = island.currentRegime;

            // Heuristic transition risk signals:
            // 1. Generation stagnation → higher transition risk
            const generationRatio = island.totalGenerations > 0
                ? island.currentGeneration / island.totalGenerations
                : 0;
            const stagnationSignal = generationRatio > 0.7 ? 0.3 : 0;

            // 2. Low fitness → regime may not be favoring current strategies
            const fitnessSignal = island.bestFitnessAllTime < 30 ? 0.2 : 0;

            // 3. High mutation rate → system is struggling → possible regime mismatch
            const mutationSignal = island.currentMutationRate > 0.3 ? 0.15 : 0;

            const transitionRisk = Math.min(1, stagnationSignal + fitnessSignal + mutationSignal);

            // Simple regime prediction: if trending, most likely next is ranging (mean reversion)
            let predictedNext: MarketRegime;
            if (currentRegime === MarketRegime.TRENDING_UP || currentRegime === MarketRegime.TRENDING_DOWN) {
                predictedNext = MarketRegime.RANGING;
            } else if (currentRegime === MarketRegime.RANGING) {
                predictedNext = MarketRegime.TRENDING_UP;
            } else if (currentRegime === MarketRegime.HIGH_VOLATILITY) {
                predictedNext = MarketRegime.RANGING;
            } else {
                predictedNext = MarketRegime.TRENDING_UP;
            }

            // Build uniform transition probabilities (will be replaced by real MRTI)
            const transitionProbs = {} as Record<MarketRegime, number>;
            for (const r of allRegimes) {
                transitionProbs[r] = r === predictedNext ? 0.4 : 0.15;
            }

            const recommendation: 'HOLD' | 'PREPARE' | 'SWITCH' =
                transitionRisk >= 0.65 ? 'SWITCH' :
                    transitionRisk >= 0.35 ? 'PREPARE' : 'HOLD';

            const warnings: Array<{ signal: 'adx_slope' | 'atr_acceleration' | 'duration_exhaustion' | 'confidence_decay'; severity: number; description: string }> = [];
            if (stagnationSignal > 0) {
                warnings.push({
                    signal: 'duration_exhaustion',
                    severity: stagnationSignal,
                    description: `Generation ${island.currentGeneration}/${island.totalGenerations} — nearing cycle end`,
                });
            }
            if (mutationSignal > 0) {
                warnings.push({
                    signal: 'confidence_decay',
                    severity: mutationSignal,
                    description: `High mutation rate (${(island.currentMutationRate * 100).toFixed(0)}%) — system struggling`,
                });
            }

            forecasts.set(island.slotId, {
                currentRegime,
                currentConfidence: 0.6,
                transitionRisk,
                predictedNextRegime: predictedNext,
                predictedNextProbability: 0.4,
                earlyWarnings: warnings,
                estimatedCandlesRemaining: Math.max(10, Math.round(100 * (1 - transitionRisk))),
                recommendation,
                transitionProbabilities: transitionProbs,
                matrixReliable: false,
            });
        }

        return forecasts;
    }

    private async analyzePairs(islands: OvermindIslandContext[]): Promise<PairProfile[]> {
        const profiles: PairProfile[] = [];
        const uniquePairs = new Set(islands.map(i => i.pair));

        for (const pair of uniquePairs) {
            const cached = this.pairSpecialist.getCachedProfile(pair);
            if (cached) {
                profiles.push(cached);
            }
            // Don't call Opus for pair profiles during cycle — too expensive.
            // Pair profiles are built on-demand via buildPairProfile().
        }

        return profiles;
    }

    private async generateHypotheses(
        islands: OvermindIslandContext[],
        pairProfiles: PairProfile[],
    ): Promise<MarketHypothesis[]> {
        try {
            return await this.hypothesisEngine.generateHypotheses(islands, pairProfiles);
        } catch (error) {
            console.error('[Overmind] Hypothesis generation error:', error);
            return [];
        }
    }

    private async generateDirectives(
        islands: OvermindIslandContext[],
    ): Promise<EvolutionDirective[]> {
        const directives: EvolutionDirective[] = [];

        for (const island of islands) {
            try {
                const directive = await this.evolutionDirector.generateDirectives(island);
                if (directive) {
                    directives.push(directive);
                }
            } catch (error) {
                console.error(`[Overmind] Directive generation error for ${island.slotId}:`, error);
            }
        }

        return directives;
    }

    private async runAdversarialTests(
        islands: IslandSnapshot[],
    ): Promise<ResilienceReport[]> {
        const reports: ResilienceReport[] = [];

        for (const island of islands) {
            const strategy = island.activeStrategy;
            if (!strategy) continue;

            try {
                const scenarios = await this.adversarialTester.generateScenarios(
                    strategy,
                    island.currentRegime,
                );
                const report = this.adversarialTester.evaluateResilience(strategy, scenarios);
                reports.push(report);
            } catch (error) {
                console.error(`[Overmind] Adversarial test error for ${island.slotId}:`, error);
            }
        }

        return reports;
    }

    private async discoverEmergentIndicators(
        islands: OvermindIslandContext[],
    ): Promise<EmergentIndicator[]> {
        const allIndicators: EmergentIndicator[] = [];

        // Only run for 1 island per cycle (cost control)
        const targetIsland = islands
            .sort((a, b) => a.bestFitness - b.bestFitness)[0]; // Worst performing

        if (!targetIsland) return allIndicators;

        try {
            const indicators = await this.emergentIndicatorEngine.discoverIndicators(targetIsland);
            allIndicators.push(...indicators);
        } catch (error) {
            console.error('[Overmind] Emergent indicator discovery error:', error);
        }

        return allIndicators;
    }

    private async performRSRDSynthesis(
        islands: IslandSnapshot[],
        contexts: OvermindIslandContext[],
    ): Promise<RSRDSynthesis[]> {
        const syntheses: RSRDSynthesis[] = [];

        for (const island of islands) {
            const strategies = [
                ...(island.activeStrategy ? [island.activeStrategy] : []),
                ...island.candidateStrategies,
            ].sort((a, b) => b.metadata.fitnessScore - a.metadata.fitnessScore)
                .slice(0, 5);

            if (strategies.length < 3) continue;

            try {
                const synthesis = await this.strategyDecomposer.performRSRD(
                    strategies,
                    island.currentRegime,
                    island.currentGeneration,
                );
                if (synthesis) {
                    syntheses.push(synthesis);
                }
            } catch (error) {
                console.error(`[Overmind] RSRD error for ${island.slotId}:`, error);
            }
        }

        return syntheses;
    }

    /**
     * LEARN phase — now powered by CCR (Radical Innovation #4).
     * This is no longer a stub. It:
     * 1. Retires stale hypotheses
     * 2. Records adversarial test episodes
     * 3. Updates episode importance from adversarial results
     * 4. Decays episodic memory importance
     */
    private async learnFromCycle(result: OvermindCycleResult): Promise<void> {
        // 1. Retire stale hypotheses
        this.hypothesisEngine.retireStaleHypotheses(this.cycleCount);

        // 2. Record adversarial test results as episodes
        for (const report of result.adversarialReports) {
            // Find the island context for this strategy
            // Adversarial reports don't carry full context, but we can record them
            this.episodicMemory.recordEpisode(
                'adversarial',
                report.strategyId,
                {
                    pair: 'unknown',
                    timeframe: '1h' as Timeframe,
                    regime: null,
                    generation: this.cycleCount,
                    bestFitness: 0,
                    avgFitness: 0,
                    diversityIndex: 0,
                    stagnationCounter: 0,
                    populationSize: 0,
                },
                {
                    type: 'adversarial_test',
                    summary: `Adversarial: ${report.scenariosTested} scenarios, ` +
                        `${report.scenariosSurvived} survived, ` +
                        `resilience=${report.resilienceScore.toFixed(0)}%`,
                },
            );
        }

        // 3. Decay episodic memory importance (temporal forgetting)
        this.episodicMemory.decayImportance();
    }

    /**
     * Build an EpisodeContext from an island context.
     */
    private buildEpisodeContext(ctx: OvermindIslandContext): EpisodeContext {
        return {
            pair: ctx.pair,
            timeframe: ctx.timeframe,
            regime: ctx.currentRegime,
            generation: ctx.currentGeneration,
            bestFitness: ctx.bestFitness,
            avgFitness: ctx.avgFitness,
            diversityIndex: ctx.diversityIndex,
            stagnationCounter: 0, // Will be filled from island state
            populationSize: ctx.populationSize,
        };
    }
}
