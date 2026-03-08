// ============================================================
// Learner: Strategic Overmind — Type System
// ============================================================
// Phase 15: The world's first Reasoning-Guided Evolutionary
// Architecture (RGEA). Types for the Claude Opus 4.6 meta-
// cognitive layer that guides genetic evolution with LLM reasoning.
// ============================================================

import {
    MarketRegime,
    Timeframe,
    StrategyDNA,
    PerformanceMetrics,
    IndicatorType,
    CompositeFunctionGene,
    IslandSnapshot,
    CortexSnapshot,
    BrainLog,
} from './index';

// ─── Overmind Lifecycle ──────────────────────────────────────

export enum OvermindPhase {
    IDLE = 'IDLE',
    OBSERVE = 'OBSERVE',
    ANALYZE = 'ANALYZE',
    HYPOTHESIZE = 'HYPOTHESIZE',
    DIRECT = 'DIRECT',
    VERIFY = 'VERIFY',
    LEARN = 'LEARN',
}

export enum HypothesisStatus {
    PROPOSED = 'PROPOSED',
    SEEDED = 'SEEDED',
    TESTING = 'TESTING',
    VALIDATED = 'VALIDATED',
    INVALIDATED = 'INVALIDATED',
    ARCHIVED = 'ARCHIVED',
}

export enum OvermindEventType {
    HYPOTHESIS_GENERATED = 'HYPOTHESIS_GENERATED',
    DIRECTIVE_ISSUED = 'DIRECTIVE_ISSUED',
    ADVERSARIAL_TEST = 'ADVERSARIAL_TEST',
    INDICATOR_DISCOVERED = 'INDICATOR_DISCOVERED',
    RSRD_SYNTHESIS = 'RSRD_SYNTHESIS',
    CYCLE_COMPLETED = 'CYCLE_COMPLETED',
    HYPOTHESIS_VALIDATED = 'HYPOTHESIS_VALIDATED',
    HYPOTHESIS_INVALIDATED = 'HYPOTHESIS_INVALIDATED',
    BUDGET_WARNING = 'BUDGET_WARNING',
}

// ─── Overmind Configuration ──────────────────────────────────

export interface OvermindConfig {
    /** Whether the Overmind is enabled (requires ANTHROPIC_API_KEY) */
    enabled: boolean;
    /** Claude model identifier */
    model: string;
    /** Max tokens per hour budget (controls cost) */
    maxTokensPerHour: number;
    /** Max API calls per hour (rate limiting) */
    maxCallsPerHour: number;
    /** Generations between full Overmind cycles */
    cycleIntervalGenerations: number;
    /** Generations between hypothesis generation */
    hypothesisIntervalGenerations: number;
    /** Generations between directive generation */
    directiveIntervalGenerations: number;
    /** Max active hypotheses per island */
    maxHypothesesPerIsland: number;
    /** Hypothesis max age in generations before retirement */
    hypothesisMaxAgeGenerations: number;
    /** Default thinking budget tokens for adaptive thinking */
    defaultBudgetTokens: number;
    /** Temperature for creative analysis (hypotheses, indicators) */
    creativeTemperature: number;
    /** Temperature for analytical tasks (post-mortem, directives) */
    analyticalTemperature: number;
    /** Enable adversarial testing (Radical Innovation #1) */
    adversarialTestingEnabled: boolean;
    /** Enable emergent indicator discovery (Radical Innovation #2) */
    emergentIndicatorEnabled: boolean;
    /** Enable RSRD synthesis (Radical Innovation #3) */
    rsrdEnabled: boolean;
    /** Pair profile cache TTL in milliseconds (default: 24h) */
    pairProfileCacheTTL: number;
    /** Max resilience bonus from adversarial testing */
    maxResilienceBonus: number;
}

export const DEFAULT_OVERMIND_CONFIG: OvermindConfig = {
    enabled: true,
    model: 'claude-opus-4-6',
    maxTokensPerHour: 100_000,
    maxCallsPerHour: 20,
    cycleIntervalGenerations: 5,
    hypothesisIntervalGenerations: 5,
    directiveIntervalGenerations: 3,
    maxHypothesesPerIsland: 5,
    hypothesisMaxAgeGenerations: 20,
    defaultBudgetTokens: 8_000,
    creativeTemperature: 0.7,
    analyticalTemperature: 0.3,
    adversarialTestingEnabled: true,
    emergentIndicatorEnabled: true,
    rsrdEnabled: true,
    pairProfileCacheTTL: 24 * 60 * 60 * 1000,
    maxResilienceBonus: 5,
};

// ─── Market Hypothesis ───────────────────────────────────────

export interface HypothesisEvidence {
    type: 'technical' | 'microstructure' | 'correlation' | 'historical' | 'regime';
    description: string;
    weight: number; // 0-1 how strong this evidence is
}

export interface HypothesisOutcome {
    validated: boolean;
    actualFitness: number;
    expectedFitness: number;
    generationsToConverge: number;
    lessonsLearned: string;
    verifiedAt: number;
}

export interface MarketHypothesis {
    id: string;
    slotId: string;
    pair: string;
    timeframe: Timeframe;
    regime: MarketRegime;
    /** Natural language hypothesis statement */
    hypothesis: string;
    /** AI's confidence in this hypothesis (0-1) */
    confidence: number;
    /** Supporting evidence for the hypothesis */
    evidence: HypothesisEvidence[];
    /** Partial DNA configuration derived from the hypothesis */
    suggestedDNA: Partial<StrategyDNA>;
    /** Suggested indicator types for this hypothesis */
    suggestedIndicators: IndicatorType[];
    /** Current lifecycle status */
    status: HypothesisStatus;
    /** ID of the seed strategy created from this hypothesis */
    seedStrategyId: string | null;
    /** Outcome tracking after testing */
    outcome: HypothesisOutcome | null;
    createdAt: number;
    updatedAt: number;
}

// ─── Evolution Directive ─────────────────────────────────────

export interface MutationSuggestion {
    strategyId: string;
    strategyName: string;
    /** Which gene type to modify */
    geneType: 'indicator' | 'signal' | 'risk' | 'microstructure' | 'priceAction' | 'composite' | 'dc' | 'confluence';
    /** Natural language description of current weakness */
    currentWeakness: string;
    /** Specific suggested change */
    suggestedChange: string;
    /** Expected improvement from this mutation */
    expectedImprovement: string;
    /** How confident the AI is in this suggestion (0-1) */
    confidence: number;
}

export interface CrossoverSuggestion {
    parentAId: string;
    parentAName: string;
    parentBId: string;
    parentBName: string;
    /** Which genes should come from parent A */
    preferredGenesFromA: string[];
    /** Which genes should come from parent B */
    preferredGenesFromB: string[];
    /** Why these parents complement each other */
    reasoning: string;
    confidence: number;
}

export interface GeneProposal {
    /** Which gene family this belongs to */
    geneFamily: 'indicator' | 'microstructure' | 'priceAction' | 'composite' | 'dc' | 'confluence';
    /** Natural language description */
    description: string;
    /** Expected benefit to strategy performance */
    expectedBenefit: string;
    /** Detailed gene configuration (partial JSON) */
    geneConfig: Record<string, unknown>;
    /** How novel this gene is (0-1) */
    noveltyScore: number;
    confidence: number;
}

export interface FitnessAdjustment {
    strategyId: string;
    /** Adjustment amount (-10 to +10) */
    adjustment: number;
    /** Why this adjustment is recommended */
    reasoning: string;
}

export interface EvolutionDirective {
    id: string;
    slotId: string;
    generationNumber: number;
    /** High-level analysis of the current generation */
    analysis: string;
    /** Population health assessment */
    populationHealth: {
        diversityAssessment: string;
        convergenceRisk: 'low' | 'medium' | 'high';
        stagnationRisk: 'low' | 'medium' | 'high';
        recommendedAction: 'continue' | 'increase_mutation' | 'inject_diversity' | 'refocus';
    };
    /** Specific mutation suggestions */
    mutations: MutationSuggestion[];
    /** Guided crossover suggestions */
    crossoverTargets: CrossoverSuggestion[];
    /** New gene proposals */
    newGeneProposals: GeneProposal[];
    /** Fitness adjustments based on deeper analysis */
    fitnessAdjustments: FitnessAdjustment[];
    /** Strategies synthesized via RSRD to inject */
    rsrdSyntheses: RSRDSynthesis[];
    /** Was this directive applied to the evolution pipeline? */
    applied: boolean;
    /** Impact measurement after application */
    impact: {
        fitnessBeforeAvg: number;
        fitnessAfterAvg: number;
        fitnessChange: number;
        diversityChange: number;
    } | null;
    createdAt: number;
}

// ─── Pair Profile ────────────────────────────────────────────

export interface PairProfile {
    pair: string;
    /** Liquidity assessment (0-1, higher = more liquid) */
    liquidityScore: number;
    /** Typical daily ATR as percentage */
    avgDailyVolatilityPercent: number;
    /** How often each regime occurs (0-1 per regime) */
    regimeFrequency: Record<MarketRegime, number>;
    /** Dominant market character */
    dominantBehavior: 'trending' | 'ranging' | 'volatile' | 'mixed';
    /** Correlation with other pairs */
    correlationMap: Record<string, number>;
    /** Natural language summary of pair characteristics */
    characterSummary: string;
    /** AI-suggested strategy archetypes for this pair */
    suggestedArchetypes: PairArchetype[];
    /** Pair-specific patterns the AI identified */
    identifiedPatterns: string[];
    /** When this profile was created */
    createdAt: number;
    /** When this profile expires (TTL) */
    expiresAt: number;
}

export interface PairArchetype {
    name: string;
    description: string;
    bestRegime: MarketRegime;
    suggestedIndicators: IndicatorType[];
    suggestedRiskProfile: {
        stopLossRange: [number, number];
        takeProfitRange: [number, number];
        leverageRange: [number, number];
    };
    confidence: number;
}

// ─── Adversarial Co-Evolution (Radical Innovation #1) ────────

export interface ScenarioCondition {
    /** What market variable is affected */
    variable: 'volatility' | 'liquidity' | 'spread' | 'correlation' | 'regime' | 'volume' | 'gap';
    /** How the variable changes */
    change: 'spike' | 'collapse' | 'invert' | 'whipsaw' | 'freeze' | 'jump';
    /** Severity of the change (0-1) */
    magnitude: number;
    /** Natural language description */
    description: string;
}

export interface AdversarialScenario {
    id: string;
    name: string;
    /** Detailed scenario description */
    description: string;
    /** Conditions that define this scenario */
    conditions: ScenarioCondition[];
    /** What vulnerabilities this scenario targets */
    targetedVulnerabilities: string[];
    severity: 'critical' | 'high' | 'medium' | 'low';
    /** The AI's reasoning for why this would break the strategy */
    adversarialReasoning: string;
}

export interface AdversarialResult {
    scenarioId: string;
    scenarioName: string;
    strategyId: string;
    strategyName: string;
    /** Did the strategy survive? */
    survived: boolean;
    /** Performance under adversarial conditions (0-100) */
    performanceScore: number;
    /** Identified weakness */
    vulnerabilityExposed: string | null;
    /** Suggested hardening */
    hardeningSuggestion: string | null;
}

export interface ResilienceReport {
    strategyId: string;
    /** Overall resilience score (0-100) */
    resilienceScore: number;
    /** Scenarios tested */
    scenariosTested: number;
    /** Scenarios survived */
    scenariosSurvived: number;
    /** Detailed results per scenario */
    results: AdversarialResult[];
    /** Critical vulnerabilities */
    criticalVulnerabilities: string[];
    /** Fitness bonus earned (0 to maxResilienceBonus) */
    fitnessBonus: number;
    testedAt: number;
}

// ─── Emergent Indicator Discovery (Radical Innovation #2) ────

export interface EmergentIndicator {
    id: string;
    /** Human-readable name for the indicator */
    name: string;
    /** What this indicator measures */
    description: string;
    /** The mathematical formula (natural language) */
    formula: string;
    /** Translated to a CompositeFunctionGene */
    compositeGene: CompositeFunctionGene;
    /** Why the AI thinks this indicator would work */
    reasoning: string;
    /** Expected edge this provides */
    expectedEdge: string;
    /** Which regime this indicator is optimal for */
    bestRegime: MarketRegime;
    /** Has this indicator been validated via backtesting? */
    validated: boolean;
    /** Validation fitness score (if validated) */
    validationFitness: number | null;
    /** How many strategies currently use this indicator */
    adoptionCount: number;
    createdAt: number;
}

// ─── RSRD Synthesis (Radical Innovation #3) ──────────────────

export interface StrategyAtom {
    /** Which component this atom represents */
    component: 'entry_signal' | 'exit_signal' | 'risk_profile' | 'indicator_setup' | 'advanced_gene';
    /** Source strategy ID */
    sourceStrategyId: string;
    sourceStrategyName: string;
    /** Natural language description of what this atom does */
    description: string;
    /** Why this atom is effective */
    reasoning: string;
    /** Which regime this atom excels in */
    bestRegime: MarketRegime;
    /** Fitness contribution of this atom (estimated) */
    estimatedFitnessContribution: number;
    /** The actual gene data */
    geneData: Record<string, unknown>;
}

export interface RSRDSynthesis {
    id: string;
    /** Source strategies that were decomposed */
    sourceStrategies: Array<{
        id: string;
        name: string;
        fitness: number;
    }>;
    /** Atoms selected from source strategies */
    selectedAtoms: StrategyAtom[];
    /** Why these atoms are compatible */
    compatibilityReasoning: string;
    /** Expected synergy effect */
    expectedSynergy: string;
    /** The synthesized StrategyDNA */
    resultDNA: StrategyDNA | null;
    /** Confidence in the synthesis (0-1) */
    confidence: number;
    /** Outcome tracking */
    outcome: {
        actualFitness: number;
        surpassedParents: boolean;
    } | null;
    createdAt: number;
}

// ─── Reasoning Journal ───────────────────────────────────────

export interface ReasoningEntry {
    id: string;
    timestamp: number;
    type: OvermindEventType;
    slotId: string | null;
    /** Structured context that was provided to the AI */
    context: {
        regime: MarketRegime | null;
        generation: number | null;
        populationSize: number | null;
        bestFitness: number | null;
    };
    /** The AI's full reasoning text */
    reasoning: string;
    /** Confidence level (0-1) */
    confidence: number;
    /** Was the reasoning validated? */
    outcomeVerified: boolean;
    /** Was the prediction correct? */
    outcomeCorrect: boolean | null;
    /** Token usage for this entry */
    tokensUsed: number;
}

// ─── Overmind Snapshots ──────────────────────────────────────

export interface OvermindSnapshot {
    /** Whether the Overmind is active (API key present + enabled) */
    isActive: boolean;
    /** Current lifecycle phase */
    currentPhase: OvermindPhase;
    /** Total Overmind cycles completed */
    cycleCount: number;
    /** Total hypotheses generated (lifetime) */
    totalHypotheses: number;
    /** Currently active hypotheses */
    activeHypotheses: number;
    /** Hypothesis success rate (0-1) */
    hypothesisSuccessRate: number;
    /** Total directives issued (lifetime) */
    totalDirectives: number;
    /** Average directive fitness impact */
    avgDirectiveImpact: number;
    /** Total tokens used (lifetime) */
    tokensUsedLifetime: number;
    /** Tokens used this hour */
    tokensUsedThisHour: number;
    /** Budget remaining this hour */
    tokenBudgetRemaining: number;
    /** Emergent indicators discovered (lifetime) */
    emergentIndicatorsDiscovered: number;
    /** RSRD syntheses performed (lifetime) */
    rsrdSynthesesTotalPerformed: number;
    /** Adversarial tests run (lifetime) */
    adversarialTestsRun: number;
    /** Average resilience across tested strategies */
    avgResilienceScore: number;
    /** Recent reasoning entries for display */
    recentInsights: ReasoningEntry[];
    /** Per-island hypothesis counts */
    hypothesesByIsland: Record<string, number>;

    // ─── CCR Metrics (Radical Innovation #4) ─────────────────
    /** Number of episodes stored in episodic memory */
    episodicMemorySize: number;
    /** Number of active meta-insights */
    metaInsightsActive: number;
    /** Self-improvement rate (fitness delta trend from CCR) */
    selfImprovementRate: number;
    /** Total counterfactual analyses performed */
    counterfactualsGenerated: number;

    // ─── PSPP Metrics (Radical Innovation #6) ────────────────
    /** Number of currently active pre-positioning actions */
    activePrePositions: number;
    /** Prediction accuracy rate (0-1) from MRTI → Overmind bridge */
    predictionAccuracyRate: number;
    /** Number of islands with imminent transition (transitionRisk > threshold) */
    imminentTransitions: number;
}

export interface OvermindStats {
    totalCycles: number;
    totalHypotheses: number;
    hypothesisSuccessRate: number;
    totalDirectives: number;
    avgDirectiveFitnessImpact: number;
    totalEmergentIndicators: number;
    validatedEmergentIndicators: number;
    totalRSRDSyntheses: number;
    rsrdSuccessRate: number;
    totalAdversarialTests: number;
    avgResilienceScore: number;
    totalTokensUsed: number;
    estimatedCostUSD: number;
    uptime: number;
}

// ─── Opus API Types ──────────────────────────────────────────

export interface OpusRequestOptions {
    /** Max thinking budget tokens for adaptive thinking */
    budgetTokens?: number;
    /** Response temperature (0-1) */
    temperature?: number;
    /** Maximum response tokens */
    maxTokens?: number;
    /** Request timeout in ms */
    timeoutMs?: number;
}

export interface OpusResponse<T = string> {
    /** Parsed response content */
    content: T | null;
    /** Raw response text */
    rawText: string;
    /** Whether parsing succeeded */
    parseSuccess: boolean;
    /** Parsing warnings */
    warnings: string[];
    /** Token usage */
    usage: {
        inputTokens: number;
        outputTokens: number;
        thinkingTokens: number;
        totalTokens: number;
    };
    /** Response latency in ms */
    latencyMs: number;
}

// ─── Overmind Context (for passing to Opus) ──────────────────

export interface OvermindIslandContext {
    slotId: string;
    pair: string;
    timeframe: Timeframe;
    state: string;
    currentGeneration: number;
    bestFitness: number;
    avgFitness: number;
    currentRegime: MarketRegime | null;
    mutationRate: number;
    populationSize: number;
    diversityIndex: number;
    /** Top 3 strategies summarized */
    topStrategies: Array<{
        name: string;
        fitness: number;
        indicators: string[];
        hasAdvancedGenes: boolean;
    }>;
    /** Recent fitness trend (last 5 generations) */
    fitnessTrend: number[];
    /** Trades summary for current generation */
    tradesSummary: {
        total: number;
        winRate: number;
        avgPnl: number;
        sharpe: number;
    } | null;
}

export interface OvermindCycleContext {
    /** All island contexts */
    islands: OvermindIslandContext[];
    /** Total capital across all islands */
    totalCapital: number;
    /** Global best fitness across all islands */
    globalBestFitness: number;
    /** Active hypotheses */
    activeHypotheses: MarketHypothesis[];
    /** Recent directives and their impacts */
    recentDirectives: EvolutionDirective[];
    /** Pair profiles */
    pairProfiles: PairProfile[];
    /** Recent reasoning entries for continuity */
    recentReasoning: ReasoningEntry[];
}

export interface OvermindCycleResult {
    phase: OvermindPhase;
    hypotheses: MarketHypothesis[];
    directives: EvolutionDirective[];
    adversarialReports: ResilienceReport[];
    emergentIndicators: EmergentIndicator[];
    rsrdSyntheses: RSRDSynthesis[];
    tokenUsage: {
        inputTokens: number;
        outputTokens: number;
        thinkingTokens: number;
        totalTokens: number;
    };
    cycleLatencyMs: number;
    errors: string[];
}

// ─── Predictive Strategic Pre-Positioning (Radical Innovation #6) ─

/** Status of a pre-positioning action */
export type PrePositionStatus = 'pending' | 'active' | 'resolved_correct' | 'resolved_incorrect' | 'expired';

/** A proactive strategy pre-positioning action triggered by MRTI forecast */
export interface PrePositionAction {
    id: string;
    /** Which island this pre-position targets */
    slotId: string;
    /** The trading pair */
    pair: string;
    /** Current regime when the pre-position was triggered */
    currentRegime: MarketRegime;
    /** The predicted next regime (from MRTI) */
    predictedRegime: MarketRegime;
    /** Transition risk score that triggered this action (0-1) */
    transitionRisk: number;
    /** Estimated candles remaining before transition */
    estimatedCandlesRemaining: number;
    /** MRTI recommendation that triggered this (PREPARE or SWITCH) */
    triggerRecommendation: 'PREPARE' | 'SWITCH';
    /** Early warning signals that were active */
    activeWarnings: string[];
    /** Hypothesis ID generated for pre-positioning (if any) */
    prePositionHypothesisId: string | null;
    /** Status of this pre-positioning action */
    status: PrePositionStatus;
    /** Was the prediction correct? (null if pending) */
    predictionCorrect: boolean | null;
    /** Actual regime that materialized (null if pending) */
    actualRegime: MarketRegime | null;
    /** Fitness of pre-positioned strategy at transition time (null if pending) */
    prePositionedFitness: number | null;
    /** Timestamp */
    createdAt: number;
    /** When this was resolved */
    resolvedAt: number | null;
}

/** Record of a single prediction for accuracy tracking */
export interface PredictionRecord {
    slotId: string;
    predictedRegime: MarketRegime;
    actualRegime: MarketRegime;
    transitionRisk: number;
    correct: boolean;
    timestamp: number;
}

/** Aggregate prediction accuracy stats */
export interface PredictionAccuracy {
    /** Total predictions made */
    totalPredictions: number;
    /** Number of correct predictions */
    correctPredictions: number;
    /** Overall accuracy rate (0-1) */
    accuracyRate: number;
    /** Accuracy per regime */
    perRegimeAccuracy: Record<MarketRegime, { total: number; correct: number; rate: number }>;
    /** Recent prediction history (last 20) */
    recentPredictions: PredictionRecord[];
}

// ─── Counterfactual Causal Replay (Radical Innovation #4) ────

/** Type of Overmind decision stored as an episode */
export type EpisodeType = 'hypothesis' | 'directive' | 'rsrd' | 'emergent' | 'adversarial';

/** Context snapshot at the time an Overmind decision was made */
export interface EpisodeContext {
    pair: string;
    timeframe: Timeframe;
    regime: MarketRegime | null;
    generation: number;
    bestFitness: number;
    avgFitness: number;
    diversityIndex: number;
    stagnationCounter: number;
    populationSize: number;
}

/** The action the Overmind took */
export interface EpisodeAction {
    /** Type of action (e.g., 'hypothesized RSI divergence entry') */
    type: string;
    /** Natural language summary */
    summary: string;
    /** Linked hypothesis ID (if hypothesis episode) */
    hypothesisId?: string;
    /** Linked directive ID (if directive episode) */
    directiveId?: string;
    /** Indicators that were suggested */
    suggestedIndicators?: string[];
    /** Mutation that was suggested */
    suggestedMutation?: string;
}

/** Outcome of an Overmind episode after GA evaluation */
export interface EpisodeOutcome {
    /** Fitness change after the action was applied */
    fitnessChange: number;
    /** Whether the seed/synthesis survived selection */
    seedSurvived: boolean;
    /** How many generations until convergence (or timeout) */
    generationsToConverge: number;
    /** Causal factors from Trade Forensics (Phase 12) */
    causalFactors: Array<{
        type: string;
        contribution: number;
        confidence: number;
        evidence: string;
    }>;
    /** Was this action ultimately successful? */
    wasSuccessful: boolean;
}

/** A single stored Overmind decision episode */
export interface Episode {
    id: string;
    type: EpisodeType;
    timestamp: number;
    slotId: string;

    /** What the Overmind saw at decision time */
    context: EpisodeContext;
    /** What the Overmind decided */
    action: EpisodeAction;
    /** What actually happened (null = pending) */
    outcome: EpisodeOutcome | null;
    /** Opus 4.6's post-hoc reflection on why it succeeded/failed */
    reflection: string | null;

    /** Importance score for retention priority (0-1) */
    importanceScore: number;
}

/** A counterfactual alternative generated by Opus 4.6 */
export interface CounterfactualAnalysis {
    id: string;
    /** Which episode this counterfactual is about */
    episodeId: string;
    /** The alternative action that could have been taken */
    alternativeAction: string;
    /** Predicted fitness change vs actual */
    predictedFitnessChange: number;
    /** Opus's reasoning for why the alternative would differ */
    reasoning: string;
    /** Causal insight derived from the comparison */
    causalInsight: string;
    /** Confidence in this counterfactual prediction (0-1) */
    confidence: number;
    createdAt: number;
}

/** A cross-episode causal pattern identified by the CounterfactualEngine */
export interface CausalInsight {
    id: string;
    /** Natural language description of the causal pattern */
    pattern: string;
    /** Which pair this insight applies to (or 'global') */
    pair: string;
    /** Which regime this is relevant for (or null = all regimes) */
    regime: MarketRegime | null;
    /** How strong the evidence is (0-1) */
    evidenceStrength: number;
    /** Episode IDs that support this insight */
    supportingEpisodeIds: string[];
    /** Actionable recommendation */
    recommendation: string;
    createdAt: number;
}

/** A meta-insight produced by the MetaCognitionLoop */
export interface MetaInsight {
    id: string;
    /** What the Overmind learned about its own behavior */
    insight: string;
    /** Which sub-engine this affects */
    affectedEngine: 'hypothesis' | 'director' | 'adversarial' | 'emergent' | 'rsrd' | 'global';
    /** Specific behavioral adjustment */
    adjustment: {
        type: 'prefer_indicator' | 'avoid_indicator' | 'prefer_regime' |
        'avoid_regime' | 'adjust_confidence' | 'modify_prompt' | 'adjust_mutation_bias';
        /** Serialized adjustment parameters */
        details: Record<string, unknown>;
    };
    /** How confident the Overmind is in this self-assessment (0-1) */
    confidence: number;
    /** Episodes that support this insight */
    supportingEpisodeIds: string[];
    /** Is this insight still active? */
    active: boolean;
    createdAt: number;
    /** When this insight was last reinforced or weakened */
    lastUpdated: number;
}

/** Context primer injected into future prompts based on past episodes */
export interface PromptPrimer {
    /** Which pair this primer is for */
    pair: string;
    /** Which regime this primer is for */
    regime: MarketRegime | null;
    /** Previous attempts and their outcomes (concise) */
    previousAttempts: Array<{
        action: string;
        outcome: string;
        lesson: string;
    }>;
    /** Active meta-insights relevant to this context */
    metaInsights: string[];
    /** Specific things to avoid based on past failures */
    avoidList: string[];
    /** Specific things to prefer based on past successes */
    preferList: string[];
}
