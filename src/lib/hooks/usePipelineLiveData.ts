// ============================================================
// Learner: usePipelineLiveData — Live Data Bridge for Pipeline Dashboard
// ============================================================
// Bridges Cortex/Island engine state to the exact data shapes
// expected by the pipeline dashboard panels.
//
// When Cortex is active: extracts REAL data from the selected Island.
// When Cortex is inactive: returns null → caller falls back to demo data.
//
// Data derives from:
//   - EvolutionEngine.getGenerations()      → GenerationData[]
//   - Island.validatedStrategies            → GateResult[]
//   - StrategyRoster.getAllEntries()         → RosterEntry[]
//   - ExperienceReplayMemory.getAllPatterns()→ ReplayCell[]
//   - Island.getSnapshot().state            → PipelineStage + StageState
// ============================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useCortexStore } from '@/lib/store';
import { useCortexLiveStore } from '@/lib/store';
import type { Cortex } from '@/lib/engine/cortex';
import type { Island } from '@/lib/engine/island';
import { computeGenomeHealth, type GenomeHealthSnapshot } from '@/lib/engine/evolution-health';
import type {
    RegimeTransitionForecast,
    TransitionMatrixSnapshot,
} from '@/lib/engine/regime-intelligence';
import type {
    OvermindSnapshot,
    OvermindPhase,
    ReasoningEntry,
} from '@/types/overmind';
import type {
    EvolutionGeneration,
    MarketRegime,
    StrategyValidation,
    RosterEntry as EngineRosterEntry,
    ExperiencePattern,
    BrainState,
    IslandSnapshot,
    RiskSnapshot,
} from '@/types';
import { RosterState } from '@/types';

// ─── Dashboard Panel Types (matching pipeline/page.tsx) ──────

export interface GenerationData {
    gen: number;
    bestFitness: number;
    avgFitness: number;
    diversity: number;
    mutationRate: number;
    seededCount: number;
    validated: boolean;
    validationResult: 'pass' | 'fail' | null;
}

export interface GateResult {
    name: string;
    score: number;
    maxScore: number;
    passed: boolean | null;
    detail: string;
}

export interface DashboardRosterEntry {
    name: string;
    state: 'active' | 'hibernating' | 'retired';
    bestRegime: string;
    confidence: number;
    activations: number;
}

export interface ReplayCell {
    regime: string;
    patternType: string;
    confidence: number;
    sampleCount: number;
    avgFitness: number;
}

type PipelineStage =
    | 'genesis'
    | 'paper_trading'
    | 'evaluation'
    | 'validation'
    | 'roster_bank'
    | 'replay_record'
    | 'evolution';

interface StageState {
    status: 'idle' | 'active' | 'complete' | 'failed';
}

// ─── Return Type ─────────────────────────────────────────────

export interface PipelineLiveData {
    /** Selected island's snapshot */
    islandSnapshot: IslandSnapshot;
    /** Generation fitness history for the chart */
    generations: GenerationData[];
    /** 4-Gate validation results for the active/latest strategy */
    gates: GateResult[];
    /** How many gates have been revealed (all if validation done) */
    gateIdx: number;
    /** Strategy roster entries */
    roster: DashboardRosterEntry[];
    /** Experience replay heatmap cells */
    replayCells: ReplayCell[];
    /** Pipeline stage states derived from BrainState */
    stages: Record<PipelineStage, StageState>;
    /** Current active strategy name */
    currentStrategyName: string;
    /** Trade progress (for paper_trading stage) */
    tradeProgress: number;
    /** Available islands for the selector */
    availableIslands: Array<{ slotId: string; pair: string; timeframe: string }>;
    /** Whether live data is available */
    isLive: boolean;
    /** ADFI telemetry (radical innovation) — null when not available */
    telemetry: LiveTelemetrySnapshot | null;
    /** CIRPN propagation status (radical innovation) — null when not available */
    propagation: LivePropagationSnapshot | null;
    /** Evolution Heartbeat: genome health snapshot — null when not available */
    genomeHealth: GenomeHealthSnapshot | null;
    /** MRTI: Regime transition forecast + matrix snapshot — null when not available */
    mrtiSnapshot: MRTISnapshot | null;
    /** Strategic Overmind live state — null when not available */
    overmindLive: OvermindLiveSnapshot | null;
    /** Risk Manager GLOBAL state — null when not available */
    riskLive: RiskSnapshot | null;
}

/** Simplified telemetry snapshot for dashboard rendering (no Maps) */
export interface LiveTelemetrySnapshot {
    candlesPerMinute: number;
    totalCandles: number;
    totalTickers: number;
    avgLatencyMs: number;
    maxLatencyMs: number;
    gapsDetected: number;
    gapsRepaired: number;
    gapsPending: number;
    reconnects: number;
    uptimeMs: number;
}

/** Simplified propagation snapshot for dashboard rendering */
export interface LivePropagationSnapshot {
    totalRegimeEvents: number;
    leaderPairs: string[];
    followerPairs: string[];
    activeWarnings: Array<{
        sourcePair: string;
        targetPair: string;
        predictedRegime: string;
        expectedArrivalMs: number;
        confidence: number;
    }>;
    relationships: Array<{
        leaderPair: string;
        followerPair: string;
        avgLagMs: number;
        correlationStrength: number;
        sampleCount: number;
    }>;
}

/** MRTI snapshot for dashboard rendering */
export interface MRTISnapshot {
    /** Current regime transition forecast */
    forecast: RegimeTransitionForecast;
    /** Full 5×5 transition matrix snapshot */
    matrixSnapshot: TransitionMatrixSnapshot;
    /** Whether the MRTI engine is calibrated */
    isCalibrated: boolean;
}

/** Overmind live snapshot for dashboard rendering */
export interface OvermindLiveSnapshot {
    /** Whether the Overmind is active (API key present + enabled) */
    isActive: boolean;
    /** Current 6-phase lifecycle phase */
    currentPhase: OvermindPhase;
    /** Total cycles completed */
    cycleCount: number;
    /** Total hypotheses generated (lifetime) */
    totalHypotheses: number;
    /** Currently active (non-archived, non-invalidated) hypotheses */
    activeHypotheses: number;
    /** Hypothesis success rate (0-1) */
    hypothesisSuccessRate: number;
    /** Total directives issued */
    totalDirectives: number;
    /** Average directive fitness impact */
    avgDirectiveImpact: number;
    /** Tokens used this hour */
    tokensUsedThisHour: number;
    /** Token budget remaining this hour */
    tokenBudgetRemaining: number;
    /** Total tokens used lifetime */
    tokensUsedLifetime: number;
    /** Emergent indicators discovered */
    emergentIndicatorsDiscovered: number;
    /** RSRD syntheses performed */
    rsrdSynthesesTotalPerformed: number;
    /** Adversarial tests run */
    adversarialTestsRun: number;
    /** Average resilience score */
    avgResilienceScore: number;
    /** Recent reasoning entries */
    recentInsights: ReasoningEntry[];
    /** Per-island hypothesis counts */
    hypothesesByIsland: Record<string, number>;
    // CCR metrics
    /** Episodes in episodic memory */
    episodicMemorySize: number;
    /** Active meta-cognitive insights */
    metaInsightsActive: number;
    /** Self-improvement rate from CCR learning */
    selfImprovementRate: number;
    /** Total counterfactual analyses */
    counterfactualsGenerated: number;
    // PSPP metrics
    /** Active pre-positioning actions */
    activePrePositions: number;
    /** Prediction accuracy rate (0-1) */
    predictionAccuracyRate: number;
    /** Islands with imminent transition */
    imminentTransitions: number;
}

// ─── Data Derivation Functions ───────────────────────────────

/**
 * Derive GenerationData[] from EvolutionEngine generations.
 */
function deriveGenerations(island: Island): GenerationData[] {
    const engine = island.getEvolutionEngine();
    const generations = engine.getGenerations();

    return generations.map((gen: EvolutionGeneration) => {
        // Find if any strategy in this generation was validated
        const bestStrategy = gen.population.find(s => s.id === gen.bestStrategyId);
        const validation = bestStrategy?.metadata?.validation as StrategyValidation | undefined;
        const validated = !!validation;
        const validationResult: 'pass' | 'fail' | null = validated
            ? (validation!.overallPassed ? 'pass' : 'fail')
            : null;

        // Calculate diversity from population fitness spread
        const fitnesses = gen.population.map(s => s.metadata.fitnessScore);
        const maxFit = Math.max(...fitnesses, 1);
        const minFit = Math.min(...fitnesses, 0);
        const diversity = maxFit > 0 ? (maxFit - minFit) / maxFit : 0;

        // Count seeded strategies (those with 'Seeded' in name)
        const seededCount = gen.population.filter(s =>
            s.name.toLowerCase().includes('seeded') ||
            s.name.toLowerCase().includes('legacy'),
        ).length;

        return {
            gen: gen.generationNumber,
            bestFitness: Math.round(gen.bestFitnessScore * 10) / 10,
            avgFitness: Math.round(gen.averageFitnessScore * 10) / 10,
            diversity: Math.round(diversity * 100) / 100,
            mutationRate: Math.round(gen.metrics.mutationRate * 100) / 100,
            seededCount,
            validated,
            validationResult,
        };
    });
}

/**
 * Derive GateResult[] from the most recent validation.
 */
function deriveGates(island: Island): { gates: GateResult[]; gateIdx: number } {
    const snapshot = island.getSnapshot();
    const allStrategies = [
        ...(snapshot.activeStrategy ? [snapshot.activeStrategy] : []),
        ...snapshot.validatedStrategies,
        ...snapshot.retiredStrategies.slice(-5),
    ];

    // Find the most recent strategy with validation data
    let latestValidation: StrategyValidation | null = null;
    for (const strategy of allStrategies) {
        const val = strategy.metadata?.validation as StrategyValidation | undefined;
        if (val && (!latestValidation || val.validatedAt > latestValidation.validatedAt)) {
            latestValidation = val;
        }
    }

    if (!latestValidation) {
        // No validation yet — return empty gates
        return {
            gates: [
                { name: 'Walk-Forward', score: 0, maxScore: 100, passed: null, detail: 'Pending' },
                { name: 'Monte Carlo', score: 0, maxScore: 100, passed: null, detail: 'Pending' },
                { name: 'Overfitting', score: 0, maxScore: 100, passed: null, detail: 'Pending' },
                { name: 'Regime Div.', score: 0, maxScore: 5, passed: null, detail: 'Pending' },
            ],
            gateIdx: 0,
        };
    }

    const gates: GateResult[] = latestValidation.gates.map(g => ({
        name: g.gateName.replace('Walk-Forward Analysis', 'Walk-Forward')
            .replace('Monte Carlo Permutation', 'Monte Carlo')
            .replace('Overfitting Detection', 'Overfitting')
            .replace('Regime Diversity', 'Regime Div.'),
        score: g.score,
        maxScore: g.gateName === 'Regime Diversity' ? 5 : 100,
        passed: g.passed,
        detail: g.passed ? 'PASS' : 'FAIL',
    }));

    return { gates, gateIdx: gates.length }; // All revealed
}

/**
 * Derive DashboardRosterEntry[] from StrategyRoster.
 */
function deriveRoster(island: Island): DashboardRosterEntry[] {
    const roster = island.getRoster();
    const entries = roster.getAllEntries();

    return entries.map((entry: EngineRosterEntry) => {
        let state: 'active' | 'hibernating' | 'retired';
        switch (entry.state) {
            case RosterState.ACTIVE:
                state = 'active';
                break;
            case RosterState.RETIRED:
                state = 'retired';
                break;
            default:
                state = 'hibernating';
        }

        return {
            name: entry.strategy.name,
            state,
            bestRegime: entry.bestRegime,
            confidence: Math.round(entry.confidenceScore),
            activations: entry.activationCount,
        };
    });
}

/**
 * Derive ReplayCell[] from ExperienceReplayMemory.
 */
function deriveReplayCells(island: Island): ReplayCell[] {
    const memory = island.getExperienceMemory();
    const allPatterns = memory.getAllPatterns();

    // Group patterns by regime × patternType
    const cellMap = new Map<string, {
        regime: string;
        patternType: string;
        totalConfidence: number;
        totalFitness: number;
        sampleCount: number;
        count: number;
    }>();

    for (const pattern of allPatterns) {
        const key = `${pattern.regime}|${pattern.type}`;
        const existing = cellMap.get(key);

        if (existing) {
            existing.totalConfidence += pattern.confidenceScore;
            existing.totalFitness += pattern.avgFitness;
            existing.sampleCount += pattern.sampleCount;
            existing.count += 1;
        } else {
            cellMap.set(key, {
                regime: pattern.regime,
                patternType: pattern.type,
                totalConfidence: pattern.confidenceScore,
                totalFitness: pattern.avgFitness,
                sampleCount: pattern.sampleCount,
                count: 1,
            });
        }
    }

    return Array.from(cellMap.values()).map(cell => ({
        regime: cell.regime,
        patternType: cell.patternType,
        confidence: Math.round((cell.totalConfidence / cell.count) * 100) / 100,
        sampleCount: cell.sampleCount,
        avgFitness: Math.round((cell.totalFitness / cell.count) * 10) / 10,
    }));
}

/**
 * Map BrainState to Pipeline stages.
 */
function derivePipelineStages(brainState: BrainState): Record<PipelineStage, StageState> {
    const idle: StageState = { status: 'idle' };
    const complete: StageState = { status: 'complete' };
    const active: StageState = { status: 'active' };

    const stages: Record<PipelineStage, StageState> = {
        genesis: idle,
        paper_trading: idle,
        evaluation: idle,
        validation: idle,
        roster_bank: idle,
        replay_record: idle,
        evolution: idle,
    };

    // Map BrainState to the appropriate pipeline stages
    switch (brainState) {
        case 'EXPLORING':
            stages.genesis = active;
            break;
        case 'TRADING':
            stages.genesis = complete;
            stages.paper_trading = active;
            break;
        case 'EVALUATING':
            stages.genesis = complete;
            stages.paper_trading = complete;
            stages.evaluation = active;
            break;
        case 'VALIDATING':
            stages.genesis = complete;
            stages.paper_trading = complete;
            stages.evaluation = complete;
            stages.validation = active;
            break;
        case 'EVOLVING':
            stages.genesis = complete;
            stages.paper_trading = complete;
            stages.evaluation = complete;
            stages.validation = complete;
            stages.roster_bank = complete;
            stages.replay_record = complete;
            stages.evolution = active;
            break;
        default:
            // IDLE, PAUSED, EMERGENCY_STOP
            break;
    }

    return stages;
}

// ─── Main Hook ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;

/**
 * Hook that bridges live Cortex/Island data to the pipeline dashboard.
 *
 * @param selectedSlotId - The island to display data for. If null, uses first island.
 * @returns PipelineLiveData or null if Cortex is not initialized.
 */
export function usePipelineLiveData(selectedSlotId: string | null): PipelineLiveData | null {
    const cortex = useCortexStore(state => state.cortex);
    const cortexSnapshot = useCortexStore(state => state.cortexSnapshot);
    const liveEngine = useCortexLiveStore(state => state.engine);
    const [liveData, setLiveData] = useState<PipelineLiveData | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Available islands for the selector
    const availableIslands = useMemo(() => {
        if (!cortexSnapshot) return [];
        return cortexSnapshot.islands.map(snap => ({
            slotId: snap.slotId,
            pair: snap.pair,
            timeframe: snap.timeframe,
        }));
    }, [cortexSnapshot]);

    // Derive live data from the selected island
    const deriveLiveData = useCallback(() => {
        if (!cortex || !cortexSnapshot) return;

        // Determine which slot to show
        const slotId = selectedSlotId ?? cortexSnapshot.islands[0]?.slotId;
        if (!slotId) return;

        const island = (cortex as Cortex).getIsland(slotId);
        if (!island) return;

        const snapshot = island.getSnapshot();

        try {
            const generations = deriveGenerations(island);
            const { gates, gateIdx } = deriveGates(island);
            const roster = deriveRoster(island);
            const replayCells = deriveReplayCells(island);
            const stages = derivePipelineStages(snapshot.state);

            setLiveData({
                islandSnapshot: snapshot,
                generations: generations.length > 0 ? generations : [{
                    gen: 1,
                    bestFitness: 0,
                    avgFitness: 0,
                    diversity: 0,
                    mutationRate: 0.3,
                    seededCount: 0,
                    validated: false,
                    validationResult: null,
                }],
                gates,
                gateIdx,
                roster,
                replayCells,
                stages,
                currentStrategyName: snapshot.activeStrategy?.name ?? 'No Active Strategy',
                tradeProgress: Math.min(30, snapshot.totalTrades),
                availableIslands,
                isLive: true,
                telemetry: deriveTelemetry(),
                propagation: derivePropagation(),
                genomeHealth: deriveGenomeHealth(island),
                mrtiSnapshot: deriveMRTISnapshot(island),
                overmindLive: deriveOvermindSnapshot(),
                riskLive: deriveRiskSnapshot(),
            });
        } catch (error) {
            console.error('[PipelineLive] Error deriving live data:', error);
        }
    }, [cortex, cortexSnapshot, selectedSlotId, availableIslands, liveEngine]);

    // Derive ADFI telemetry from CortexLiveEngine
    function deriveTelemetry(): LiveTelemetrySnapshot | null {
        if (!liveEngine) return null;
        try {
            const adfi = liveEngine.getAdfi();
            const tel = adfi.getFlowTelemetry();
            return {
                candlesPerMinute: tel.candlesProcessedPerMinute,
                totalCandles: tel.candlesProcessedTotal,
                totalTickers: tel.tickersProcessedTotal,
                avgLatencyMs: tel.avgCandleLatencyMs,
                maxLatencyMs: tel.maxCandleLatencyMs,
                gapsDetected: tel.gapsDetected,
                gapsRepaired: tel.gapsRepaired,
                gapsPending: tel.gapsPending,
                reconnects: tel.reconnectCount,
                uptimeMs: tel.uptimeMs,
            };
        } catch {
            return null;
        }
    }

    // Derive CIRPN propagation from CortexLiveEngine
    function derivePropagation(): LivePropagationSnapshot | null {
        if (!liveEngine) return null;
        try {
            const status = liveEngine.getRegimePropagationStatus();
            return {
                totalRegimeEvents: status.totalRegimeEvents,
                leaderPairs: status.leaderPairs,
                followerPairs: status.followerPairs,
                activeWarnings: status.activeWarnings.map(w => ({
                    sourcePair: w.sourcePair,
                    targetPair: w.targetPair,
                    predictedRegime: w.predictedRegime,
                    expectedArrivalMs: w.expectedArrivalMs,
                    confidence: w.confidence,
                })),
                relationships: status.knownRelationships.map(r => ({
                    leaderPair: r.leaderPair,
                    followerPair: r.followerPair,
                    avgLagMs: r.avgLagMs,
                    correlationStrength: r.correlationStrength,
                    sampleCount: r.sampleCount,
                })),
            };
        } catch {
            return null;
        }
    }

    // Derive genome health from EvolutionHealthAnalyzer
    function deriveGenomeHealth(island: Island): GenomeHealthSnapshot | null {
        try {
            return computeGenomeHealth(island);
        } catch {
            return null;
        }
    }

    // Derive MRTI forecast + matrix from RegimeIntelligence
    function deriveMRTISnapshot(island: Island): MRTISnapshot | null {
        try {
            const mrti = island.getRegimeIntelligence();
            if (!mrti.isCalibrated()) return null;

            const forecast = island.getRegimeForecast();
            if (!forecast) return null;

            return {
                forecast,
                matrixSnapshot: mrti.getMatrixSnapshot(),
                isCalibrated: true,
            };
        } catch {
            return null;
        }
    }

    // Derive Overmind snapshot from CortexSnapshot
    function deriveOvermindSnapshot(): OvermindLiveSnapshot | null {
        if (!cortexSnapshot?.overmindSnapshot) return null;
        try {
            const s = cortexSnapshot.overmindSnapshot;
            return {
                isActive: s.isActive,
                currentPhase: s.currentPhase,
                cycleCount: s.cycleCount,
                totalHypotheses: s.totalHypotheses,
                activeHypotheses: s.activeHypotheses,
                hypothesisSuccessRate: s.hypothesisSuccessRate,
                totalDirectives: s.totalDirectives,
                avgDirectiveImpact: s.avgDirectiveImpact,
                tokensUsedThisHour: s.tokensUsedThisHour,
                tokenBudgetRemaining: s.tokenBudgetRemaining,
                tokensUsedLifetime: s.tokensUsedLifetime,
                emergentIndicatorsDiscovered: s.emergentIndicatorsDiscovered,
                rsrdSynthesesTotalPerformed: s.rsrdSynthesesTotalPerformed,
                adversarialTestsRun: s.adversarialTestsRun,
                avgResilienceScore: s.avgResilienceScore,
                recentInsights: s.recentInsights,
                hypothesesByIsland: s.hypothesesByIsland,
                episodicMemorySize: s.episodicMemorySize,
                metaInsightsActive: s.metaInsightsActive,
                selfImprovementRate: s.selfImprovementRate,
                counterfactualsGenerated: s.counterfactualsGenerated,
                activePrePositions: s.activePrePositions,
                predictionAccuracyRate: s.predictionAccuracyRate,
                imminentTransitions: s.imminentTransitions,
            };
        } catch {
            return null;
        }
    }

    // Derive Risk snapshot from CortexSnapshot
    function deriveRiskSnapshot(): RiskSnapshot | null {
        if (!cortexSnapshot?.riskSnapshot) return null;
        try {
            return cortexSnapshot.riskSnapshot;
        } catch {
            return null;
        }
    }

    // Initial derivation
    useEffect(() => {
        deriveLiveData();
    }, [deriveLiveData]);

    // Polling for updates
    useEffect(() => {
        if (!cortex) return;

        intervalRef.current = setInterval(deriveLiveData, POLL_INTERVAL_MS);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [cortex, deriveLiveData]);

    return liveData;
}
