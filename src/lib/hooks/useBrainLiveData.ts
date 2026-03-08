// ============================================================
// Learner: useBrainLiveData — Live Data Bridge for Neural Brain
// ============================================================
// Custom React hook connecting the holographic brain visualization
// to live Cortex/Island engine state.
//
// Dual-mode architecture (matching usePipelineLiveData pattern):
//   LIVE mode:  CortexLiveEngine active → reads real engine state
//   DEMO mode:  No engine → falls back to random demo firing
//
// Data flow:
//   CortexStore + CortexLiveStore + BrainStore
//         ↓ (3-second polling)
//   deriveNeuronActivities() → per-neuron 0-1 intensity
//   deriveSynapseMapping()   → which synapses should fire
//   deriveHudStats()         → real stats for HUD metrics
//   deriveConsciousness()    → composite 0-100 consciousness
//
// Integration:
//   Neural Impulse Event Bus (NIEB) provides sub-second real-time
//   impulses overlaid on the polling baseline.
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useCortexStore, useCortexLiveStore, useBrainStore } from '@/lib/store';
import { getNeuralImpulseBus, type NeuronId, type NeuralActivitySummary } from '@/lib/engine/neural-impulse-bus';
import type { IslandSnapshot, CortexSnapshot, BrainState } from '@/types';
import type { OvermindSnapshot } from '@/types/overmind';

// ─── Types ───────────────────────────────────────────────────

/** Per-neuron activity data derived from live engine state */
export interface NeuronActivity {
    /** Current activity level (0-1) */
    intensity: number;
    /** Human-readable description of what's driving this activity */
    label: string;
    /** Timestamp of the most recent data driving this neuron */
    lastActive: number;
}

/** Synapse activation derived from upstream neuron firing */
export interface SynapseActivation {
    fromId: string;
    toId: string;
    shouldFire: boolean;
    intensity: number;
}

/** HUD stats derived from real engine state */
export interface BrainHudStats {
    totalSignals: number;
    avgActivity: number;
    dominantModule: string;
    learningRate: number;
    experienceLevel: number;
    activeConnections: number;
}

/** Complete data returned by the hook */
export interface BrainLiveData {
    /** Per-neuron activity levels (keyed by NeuronId) */
    neuronActivities: Record<NeuronId, NeuronActivity>;
    /** Which synapses should fire this cycle */
    synapseActivations: SynapseActivation[];
    /** HUD stats for the stats bar */
    hudStats: BrainHudStats;
    /** Consciousness level (0-100) */
    consciousnessLevel: number;
    /** Whether this data comes from a live engine */
    isLive: boolean;
    /** Selected island snapshot (for HUD detail enrichment) */
    selectedIsland: IslandSnapshot | null;
    /** Available islands for selector */
    availableIslands: Array<{ slotId: string; pair: string; timeframe: string }>;
    /** Total impulses from NIEB (monotonically increasing) */
    totalImpulses: number;
}

// ─── Constants ───────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;

/** Synapse connections: from → to (matching brain/page.tsx createSynapses) */
const SYNAPSE_MAP: Array<{ from: NeuronId; to: NeuronId }> = [
    { from: 'bayesian', to: 'evolution' },
    { from: 'metacog', to: 'evolution' },
    { from: 'kdss', to: 'evolution' },
    { from: 'saie', to: 'evolution' },
    { from: 'replay', to: 'evolution' },
    { from: 'mapelites', to: 'evolution' },
    { from: 'market', to: 'bayesian' },
    { from: 'market', to: 'metacog' },
    { from: 'regime', to: 'bayesian' },
    { from: 'regime', to: 'kdss' },
    { from: 'forensics', to: 'bayesian' },
    { from: 'forensics', to: 'replay' },
    { from: 'bayesian', to: 'kdss' },
    { from: 'saie', to: 'kdss' },
    { from: 'bayesian', to: 'metacog' },
    { from: 'evolution', to: 'mapelites' },
    { from: 'evolution', to: 'forensics' },
    { from: 'evolution', to: 'saie' },
];

const ALL_NEURON_IDS: NeuronId[] = [
    'evolution', 'bayesian', 'metacog', 'kdss', 'saie',
    'market', 'forensics', 'replay', 'mapelites', 'regime',
];

// ─── Derivation Helpers ──────────────────────────────────────

/**
 * Derive per-neuron activity levels from live engine state.
 *
 * Each neuron is mapped to specific engine subsystems:
 *   evolution  → generation progress + fitness improvement
 *   bayesian   → forensic learning beliefs + replay confidence
 *   metacog    → Overmind reasoning cycles + CCR episodes
 *   kdss       → strategy synthesis (population diversity, crossover activity)
 *   saie       → fitness evaluation activity (scoring sweeps)
 *   market     → market data flow (ADFI candle throughput)
 *   forensics  → trade forensic analysis (reports generated)
 *   replay     → experience replay memory (patterns stored)
 *   mapelites  → cross-island migration events
 *   regime     → MRTI regime detection + transitions
 */
function deriveNeuronActivities(
    cortexSnapshot: CortexSnapshot | null,
    selectedIsland: IslandSnapshot | null,
    overmindSnapshot: OvermindSnapshot | null | undefined,
    nlebSummary: NeuralActivitySummary,
): Record<NeuronId, NeuronActivity> {
    const now = Date.now();
    const activities: Record<NeuronId, NeuronActivity> = {} as Record<NeuronId, NeuronActivity>;

    // Default: zero activity
    for (const id of ALL_NEURON_IDS) {
        activities[id] = { intensity: 0, label: 'Idle', lastActive: 0 };
    }

    if (!cortexSnapshot || !selectedIsland) return activities;

    // ── EVOLUTION: generation progress + fitness ──
    const genProgress = selectedIsland.currentGeneration > 0
        ? Math.min(1, selectedIsland.currentGeneration / 50) // Normalize to ~50 gen benchmark
        : 0;
    const fitnessLevel = Math.min(1, selectedIsland.bestFitnessAllTime / 80); // 80 = excellence threshold
    const evoIntensity = Math.min(1, genProgress * 0.4 + fitnessLevel * 0.4 + nlebSummary.activities.evolution * 0.2);
    activities.evolution = {
        intensity: evoIntensity,
        label: `Gen ${selectedIsland.currentGeneration} | F:${selectedIsland.bestFitnessAllTime.toFixed(0)}`,
        lastActive: now,
    };

    // ── BAYESIAN (Forensic Learning + Replay Confidence) ──
    const validatedCount = selectedIsland.validatedStrategies.length;
    const bayesianBase = validatedCount > 0 ? Math.min(1, validatedCount / 5) : 0;
    activities.bayesian = {
        intensity: Math.min(1, bayesianBase * 0.5 + nlebSummary.activities.bayesian * 0.5),
        label: validatedCount > 0 ? `${validatedCount} validated` : 'Calibrating',
        lastActive: now,
    };

    // ── METACOG (Overmind reasoning + CCR) ──
    if (overmindSnapshot && overmindSnapshot.isActive) {
        const cycleActivity = Math.min(1, overmindSnapshot.cycleCount / 20);
        const ccrActivity = Math.min(1, overmindSnapshot.episodicMemorySize / 50);
        activities.metacog = {
            intensity: Math.min(1, cycleActivity * 0.4 + ccrActivity * 0.3 + nlebSummary.activities.metacog * 0.3),
            label: `Phase: ${overmindSnapshot.currentPhase} | Cycles: ${overmindSnapshot.cycleCount}`,
            lastActive: now,
        };
    } else {
        activities.metacog = {
            intensity: nlebSummary.activities.metacog * 0.3,
            label: 'Overmind offline',
            lastActive: 0,
        };
    }

    // ── KDSS (Strategy Synthesis — population diversity + crossover) ──
    const mutationRate = selectedIsland.currentMutationRate;
    const synthesisActivity = Math.min(1, mutationRate * 2); // Higher mutation = more synthesis
    const populationSize = selectedIsland.candidateStrategies.length;
    const diversityProxy = Math.min(1, populationSize / 10); // Normalize to ~10 pop
    activities.kdss = {
        intensity: Math.min(1, synthesisActivity * 0.4 + diversityProxy * 0.3 + nlebSummary.activities.kdss * 0.3),
        label: `Pop: ${populationSize} | μ: ${(mutationRate * 100).toFixed(0)}%`,
        lastActive: now,
    };

    // ── SAIE (Surrogate/Evaluator — fitness scoring) ──
    const hasMetrics = selectedIsland.performanceMetrics !== null;
    const metricsActivity = hasMetrics && selectedIsland.performanceMetrics
        ? Math.min(1, selectedIsland.performanceMetrics.totalTrades / 30)
        : 0;
    activities.saie = {
        intensity: Math.min(1, metricsActivity * 0.5 + nlebSummary.activities.saie * 0.5),
        label: hasMetrics ? `${selectedIsland.totalTrades} trades scored` : 'Awaiting data',
        lastActive: hasMetrics ? now : 0,
    };

    // ── MARKET (Market data flow from ADFI) ──
    // NIEB-driven: market neuron fires on each ticker/candle update
    activities.market = {
        intensity: Math.min(1, nlebSummary.activities.market),
        label: 'Data stream',
        lastActive: nlebSummary.activities.market > 0 ? now : 0,
    };

    // ── FORENSICS (Trade forensic analysis) ──
    const tradeCount = selectedIsland.totalTrades;
    const forensicsBase = Math.min(1, tradeCount / 20);
    activities.forensics = {
        intensity: Math.min(1, forensicsBase * 0.5 + nlebSummary.activities.forensics * 0.5),
        label: tradeCount > 0 ? `${tradeCount} analyzed` : 'No trades',
        lastActive: tradeCount > 0 ? now : 0,
    };

    // ── REPLAY (Experience replay memory) ──
    activities.replay = {
        intensity: Math.min(1, nlebSummary.activities.replay * 0.6 + genProgress * 0.4),
        label: `Memory bank active`,
        lastActive: genProgress > 0 ? now : 0,
    };

    // ── MAPELITES (Cross-island migration) ──
    const migrationCount = cortexSnapshot.migrationHistory.length;
    const migrationActivity = Math.min(1, migrationCount / 10);
    activities.mapelites = {
        intensity: Math.min(1, migrationActivity * 0.5 + nlebSummary.activities.mapelites * 0.5),
        label: migrationCount > 0 ? `${migrationCount} migrations` : 'Cross-island idle',
        lastActive: migrationCount > 0 ? now : 0,
    };

    // ── REGIME (MRTI regime detection + transitions) ──
    const hasRegime = selectedIsland.currentRegime !== null;
    activities.regime = {
        intensity: Math.min(1, (hasRegime ? 0.5 : 0.1) + nlebSummary.activities.regime * 0.5),
        label: hasRegime ? `${selectedIsland.currentRegime}` : 'Detecting...',
        lastActive: hasRegime ? now : 0,
    };

    return activities;
}

/**
 * Derive synapse activations from neuron activities.
 * A synapse fires when its source neuron has activity > threshold.
 */
function deriveSynapseActivations(
    activities: Record<NeuronId, NeuronActivity>,
): SynapseActivation[] {
    const FIRE_THRESHOLD = 0.15;

    return SYNAPSE_MAP.map(({ from, to }) => {
        const sourceActivity = activities[from]?.intensity ?? 0;
        return {
            fromId: from,
            toId: to,
            shouldFire: sourceActivity > FIRE_THRESHOLD,
            intensity: sourceActivity,
        };
    });
}

/**
 * Derive HUD stats from live engine state.
 */
function deriveHudStats(
    cortexSnapshot: CortexSnapshot | null,
    selectedIsland: IslandSnapshot | null,
    activities: Record<NeuronId, NeuronActivity>,
    totalImpulses: number,
): BrainHudStats {
    if (!cortexSnapshot || !selectedIsland) {
        return {
            totalSignals: 0,
            avgActivity: 0,
            dominantModule: 'EVO',
            learningRate: 0.05,
            experienceLevel: 0,
            activeConnections: 0,
        };
    }

    // Average activity across all neurons
    const activityValues = ALL_NEURON_IDS.map(id => activities[id]?.intensity ?? 0);
    const avgActivity = activityValues.reduce((s, v) => s + v, 0) / activityValues.length;

    // Find dominant module
    let maxActivity = 0;
    let dominantModule = 'EVO';
    for (const id of ALL_NEURON_IDS) {
        const act = activities[id]?.intensity ?? 0;
        if (act > maxActivity) {
            maxActivity = act;
            dominantModule = id === 'evolution' ? 'EVO'
                : id === 'bayesian' ? 'BAY'
                    : id === 'metacog' ? 'META'
                        : id === 'kdss' ? 'KDSS'
                            : id === 'saie' ? 'SAIE'
                                : id === 'market' ? 'MKT'
                                    : id === 'forensics' ? 'FOR'
                                        : id === 'replay' ? 'EXP'
                                            : id === 'mapelites' ? 'MAP'
                                                : 'REG';
        }
    }

    // Learning rate: fitness improvement rate
    const bestFitness = selectedIsland.bestFitnessAllTime;
    const gen = Math.max(1, selectedIsland.currentGeneration);
    const learningRate = Math.min(0.2, bestFitness / (gen * 100));

    // Experience level: cumulative progress (0-100)
    const experienceLevel = Math.min(100,
        selectedIsland.currentGeneration * 2 +
        selectedIsland.totalTrades * 0.5 +
        selectedIsland.validatedStrategies.length * 10
    );

    // Active connections: synapses with above-threshold activity
    const activeConnections = deriveSynapseActivations(activities)
        .filter(s => s.shouldFire).length;

    return {
        totalSignals: totalImpulses,
        avgActivity: Math.min(1, avgActivity),
        dominantModule,
        learningRate,
        experienceLevel,
        activeConnections,
    };
}

/**
 * Derive consciousness level (0-100) from overall system health.
 *
 * Inspired by IIT (Integrated Information Theory):
 *   Φ = f(integration, differentiation, information)
 *
 * Components:
 *   - Generation progress (exploration maturity)
 *   - Fitness achievement (optimization success)
 *   - Island diversity (system complexity)
 *   - Validation success (generalization ability)
 *   - Trade activity (real-world interaction)
 */
function deriveConsciousnessLevel(
    cortexSnapshot: CortexSnapshot | null,
    selectedIsland: IslandSnapshot | null,
): number {
    if (!cortexSnapshot || !selectedIsland) return 0;

    // 1. Generation progress (0-25)
    const genComponent = Math.min(25, selectedIsland.currentGeneration * 0.5);

    // 2. Fitness achievement (0-25)
    const fitnessComponent = Math.min(25, selectedIsland.bestFitnessAllTime * 0.3);

    // 3. Island diversity / system complexity (0-20)
    const islandComponent = Math.min(20, cortexSnapshot.totalIslands * 4);

    // 4. Validation success (0-15)
    const validationComponent = Math.min(15, selectedIsland.validatedStrategies.length * 5);

    // 5. Trade activity (0-15)
    const tradeComponent = Math.min(15, selectedIsland.totalTrades * 0.5);

    return Math.min(100, Math.round(
        genComponent + fitnessComponent + islandComponent + validationComponent + tradeComponent
    ));
}

// ─── Main Hook ──────────────────────────────────────────────

/**
 * Hook that bridges live Cortex/Island data to the brain visualization.
 *
 * @param selectedSlotId - The island to focus on. If null, uses first island.
 * @returns BrainLiveData or null if no engine state is available.
 */
export function useBrainLiveData(selectedSlotId: string | null): BrainLiveData | null {
    const cortexSnapshot = useCortexStore(state => state.cortexSnapshot);
    const overmindSnapshot = useCortexStore(state => state.overmindSnapshot);
    const liveEngine = useCortexLiveStore(state => state.engine);
    const engineStatus = useCortexLiveStore(state => state.engineStatus);
    const brainState = useBrainStore(state => state.state);

    const [liveData, setLiveData] = useState<BrainLiveData | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Is the system in live mode?
    const isLive = useMemo(() =>
        liveEngine !== null && engineStatus === 'live',
        [liveEngine, engineStatus]
    );

    // Available islands for the selector
    const availableIslands = useMemo(() => {
        if (!cortexSnapshot) return [];
        return cortexSnapshot.islands.map(snap => ({
            slotId: snap.slotId,
            pair: snap.pair,
            timeframe: snap.timeframe as string,
        }));
    }, [cortexSnapshot]);

    // Find the selected island snapshot
    const selectedIsland = useMemo(() => {
        if (!cortexSnapshot) return null;
        const slotId = selectedSlotId ?? cortexSnapshot.islands[0]?.slotId;
        if (!slotId) return null;
        return cortexSnapshot.islands.find(s => s.slotId === slotId) ?? null;
    }, [cortexSnapshot, selectedSlotId]);

    // Core derivation function
    const deriveLiveData = useCallback(() => {
        if (!cortexSnapshot) return;

        try {
            const bus = getNeuralImpulseBus();
            const nlebSummary = bus.getActivitySummary();
            const totalImpulses = bus.getTotalCount();

            const neuronActivities = deriveNeuronActivities(
                cortexSnapshot,
                selectedIsland,
                overmindSnapshot,
                nlebSummary,
            );

            const synapseActivations = deriveSynapseActivations(neuronActivities);

            const hudStats = deriveHudStats(
                cortexSnapshot,
                selectedIsland,
                neuronActivities,
                totalImpulses,
            );

            const consciousnessLevel = deriveConsciousnessLevel(
                cortexSnapshot,
                selectedIsland,
            );

            setLiveData({
                neuronActivities,
                synapseActivations,
                hudStats,
                consciousnessLevel,
                isLive,
                selectedIsland,
                availableIslands,
                totalImpulses,
            });
        } catch (error) {
            console.error('[BrainLive] Error deriving live data:', error);
        }
    }, [cortexSnapshot, selectedIsland, overmindSnapshot, isLive, availableIslands]);

    // Polling interval
    useEffect(() => {
        if (!cortexSnapshot) return;

        // Initial derivation
        deriveLiveData();

        // Set up polling
        intervalRef.current = setInterval(deriveLiveData, POLL_INTERVAL_MS);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [cortexSnapshot, deriveLiveData]);

    // Also re-derive on NIEB impulse events (sub-second response in LIVE mode)
    useEffect(() => {
        if (!isLive) return;

        const bus = getNeuralImpulseBus();
        let lastDeriveTime = 0;
        const MIN_DERIVE_INTERVAL = 500; // Don't re-derive more than 2x/sec

        const unsubscribe = bus.subscribe(() => {
            const now = Date.now();
            if (now - lastDeriveTime >= MIN_DERIVE_INTERVAL) {
                lastDeriveTime = now;
                deriveLiveData();
            }
        });

        return unsubscribe;
    }, [isLive, deriveLiveData]);

    return liveData;
}
