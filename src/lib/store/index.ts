// ============================================================
// Learner: Zustand Stores — Real-time State Management
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createIndexedDBStorage, saveTrade as persistTrade } from './persistence';
import {
    BrainState,
    BrainLog,
    StrategyDNA,
    Trade,
    Position,
    EvolutionGeneration,
    PerformanceMetrics,
    PortfolioSummary,
    DashboardConfig,
    Timeframe,
    MarketTick,
    LogLevel,
    MarketRegime,
    RegimeGeneMemory,
    OHLCV,
    CortexSnapshot,
    IslandSnapshot,
    IslandAllocation,
    MigrationEvent,
    ConnectionStatus,
    DataHealth,
} from '@/types';
import type { OvermindSnapshot } from '@/types/overmind';
import { TradingSlot } from '@/types/trading-slot';
import { AIBrain, BrainSnapshot } from '@/lib/engine/brain';
import { Cortex } from '@/lib/engine/cortex';
import { CortexLiveEngine } from '@/lib/engine/cortex-live-engine';

// ─── Brain Store ─────────────────────────────────────────────

interface BrainStoreState {
    brain: AIBrain | null;
    state: BrainState;
    activeStrategy: StrategyDNA | null;
    candidateStrategies: StrategyDNA[];
    currentGeneration: number;
    totalGenerations: number;
    totalTrades: number;
    bestFitnessAllTime: number;
    logs: BrainLog[];
    lastActivity: number;
    evolutionHistory: EvolutionGeneration[];
    performanceMetrics: PerformanceMetrics | null;
    // Validation & Promotion state
    validationQueue: StrategyDNA[];
    validatedStrategies: StrategyDNA[];
    retiredStrategies: StrategyDNA[];
    currentMutationRate: number;
    strategyMemory: RegimeGeneMemory;
    currentRegime: MarketRegime | null;

    // Actions
    initialize: () => void;
    start: () => void;
    pause: () => void;
    resume: () => void;
    emergencyStop: () => void;
    recordTrade: (trade: Trade) => void;
    updateFromSnapshot: (snapshot: BrainSnapshot) => void;
    updateMarketData: (candles: OHLCV[]) => void;
}

export const useBrainStore = create<BrainStoreState>()((set, get) => ({
    brain: null,
    state: BrainState.IDLE,
    activeStrategy: null,
    candidateStrategies: [],
    currentGeneration: 0,
    totalGenerations: 0,
    totalTrades: 0,
    bestFitnessAllTime: 0,
    logs: [],
    lastActivity: Date.now(),
    evolutionHistory: [],
    performanceMetrics: null,
    validationQueue: [],
    validatedStrategies: [],
    retiredStrategies: [],
    currentMutationRate: 0.3,
    strategyMemory: { entries: [], totalStrategiesTested: 0, generationsProcessed: 0 },
    currentRegime: null,

    initialize: () => {
        const brain = new AIBrain();
        set({ brain });
    },

    start: () => {
        const { brain } = get();
        if (!brain) return;
        const snapshot = brain.start();
        get().updateFromSnapshot(snapshot);
    },

    pause: () => {
        const { brain } = get();
        if (!brain) return;
        const snapshot = brain.pause();
        get().updateFromSnapshot(snapshot);
    },

    resume: () => {
        const { brain } = get();
        if (!brain) return;
        const snapshot = brain.resume();
        get().updateFromSnapshot(snapshot);
    },

    emergencyStop: () => {
        const { brain } = get();
        if (!brain) return;
        const snapshot = brain.emergencyStop();
        get().updateFromSnapshot(snapshot);
    },

    recordTrade: (trade: Trade) => {
        const { brain } = get();
        if (!brain) return;
        const snapshot = brain.recordTrade(trade);
        get().updateFromSnapshot(snapshot);
    },

    updateFromSnapshot: (snapshot: BrainSnapshot) => {
        set({
            state: snapshot.state,
            activeStrategy: snapshot.activeStrategy,
            candidateStrategies: snapshot.candidateStrategies,
            currentGeneration: snapshot.currentGeneration,
            totalGenerations: snapshot.totalGenerations,
            totalTrades: snapshot.totalTrades,
            bestFitnessAllTime: snapshot.bestFitnessAllTime,
            logs: snapshot.logs,
            lastActivity: snapshot.lastActivity,
            evolutionHistory: snapshot.evolutionHistory,
            performanceMetrics: snapshot.performanceMetrics,
            validationQueue: snapshot.validationQueue,
            validatedStrategies: snapshot.validatedStrategies,
            retiredStrategies: snapshot.retiredStrategies,
            currentMutationRate: snapshot.currentMutationRate,
            strategyMemory: snapshot.strategyMemory,
            currentRegime: snapshot.currentRegime,
        });
    },

    updateMarketData: (candles: OHLCV[]) => {
        const { brain } = get();
        if (!brain) return;
        brain.updateMarketData(candles);
    },
}));

// ─── Cortex Store (Multi-Island) ─────────────────────────────

interface CortexStoreState {
    cortex: Cortex | null;
    cortexSnapshot: CortexSnapshot | null;
    islands: IslandSnapshot[];
    globalState: BrainState;
    totalIslands: number;
    activeIslands: number;
    totalTradesAllIslands: number;
    globalBestFitness: number;
    capitalAllocations: IslandAllocation[];
    migrationHistory: MigrationEvent[];
    totalCapital: number;
    /** Strategic Overmind snapshot (Phase 15 + CCR) */
    overmindSnapshot: OvermindSnapshot | null;

    // Actions
    initializeCortex: (slots?: TradingSlot[], totalCapital?: number) => void;
    addIsland: (slot: TradingSlot) => void;
    removeIsland: (slotId: string) => void;
    pauseIsland: (slotId: string) => void;
    resumeIsland: (slotId: string) => void;
    pauseAll: () => void;
    resumeAll: () => void;
    emergencyStopAll: () => void;
    recordTrade: (trade: Trade) => void;
    updateMarketDataForPair: (pair: string, candles: OHLCV[]) => void;
    rebalanceCapital: () => void;
    refreshSnapshot: () => void;
}

export const useCortexStore = create<CortexStoreState>()((set, get) => ({
    cortex: null,
    cortexSnapshot: null,
    islands: [],
    globalState: BrainState.IDLE,
    totalIslands: 0,
    activeIslands: 0,
    totalTradesAllIslands: 0,
    globalBestFitness: 0,
    capitalAllocations: [],
    migrationHistory: [],
    totalCapital: 10000,
    overmindSnapshot: null,

    initializeCortex: (slots, totalCapital) => {
        const cortex = new Cortex({
            totalCapital: totalCapital ?? 10000,
        });
        const snapshot = cortex.initialize(slots);
        set({
            cortex,
            cortexSnapshot: snapshot,
            islands: snapshot.islands,
            globalState: snapshot.globalState,
            totalIslands: snapshot.totalIslands,
            activeIslands: snapshot.activeIslands,
            totalTradesAllIslands: snapshot.totalTradesAllIslands,
            globalBestFitness: snapshot.globalBestFitness,
            capitalAllocations: snapshot.capitalAllocations,
            migrationHistory: snapshot.migrationHistory,
            totalCapital: snapshot.totalCapital,
            overmindSnapshot: snapshot.overmindSnapshot ?? null,
        });
    },

    addIsland: (slot) => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.spawnIsland(slot);
        get().refreshSnapshot();
    },

    removeIsland: (slotId) => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.retireIsland(slotId);
        get().refreshSnapshot();
    },

    pauseIsland: (slotId) => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.pauseIsland(slotId);
        get().refreshSnapshot();
    },

    resumeIsland: (slotId) => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.resumeIsland(slotId);
        get().refreshSnapshot();
    },

    pauseAll: () => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.pauseAll();
        get().refreshSnapshot();
    },

    resumeAll: () => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.resumeAll();
        get().refreshSnapshot();
    },

    emergencyStopAll: () => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.emergencyStopAll();
        get().refreshSnapshot();
    },

    recordTrade: (trade) => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.recordTrade(trade);
        get().refreshSnapshot();
    },

    updateMarketDataForPair: (pair, candles) => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.updateMarketDataForPair(pair, candles);
    },

    rebalanceCapital: () => {
        const { cortex } = get();
        if (!cortex) return;
        cortex.rebalanceCapital();
        get().refreshSnapshot();
    },

    refreshSnapshot: () => {
        const { cortex } = get();
        if (!cortex) return;
        const snapshot = cortex.getSnapshot();
        set({
            cortexSnapshot: snapshot,
            islands: snapshot.islands,
            globalState: snapshot.globalState,
            totalIslands: snapshot.totalIslands,
            activeIslands: snapshot.activeIslands,
            totalTradesAllIslands: snapshot.totalTradesAllIslands,
            globalBestFitness: snapshot.globalBestFitness,
            capitalAllocations: snapshot.capitalAllocations,
            migrationHistory: snapshot.migrationHistory,
            totalCapital: snapshot.totalCapital,
            overmindSnapshot: snapshot.overmindSnapshot ?? null,
        });
    },
}));

// ─── Portfolio Store ─────────────────────────────────────────

interface PortfolioStoreState {
    summary: PortfolioSummary;
    positions: Position[];

    // Actions
    updateSummary: (summary: Partial<PortfolioSummary>) => void;
    setPositions: (positions: Position[]) => void;
    addPosition: (position: Position) => void;
    removePosition: (positionId: string) => void;
}

export const usePortfolioStore = create<PortfolioStoreState>()(
    persist(
        (set, get) => ({
            summary: {
                totalBalance: 10000,
                availableBalance: 10000,
                unrealizedPnl: 0,
                todayPnl: 0,
                todayPnlPercent: 0,
                weekPnl: 0,
                weekPnlPercent: 0,
                allTimePnl: 0,
                allTimePnlPercent: 0,
                activePositions: 0,
                totalTrades: 0,
            },
            positions: [],

            updateSummary: (partial) => {
                set((s) => ({
                    summary: { ...s.summary, ...partial },
                }));
            },

            setPositions: (positions) => {
                set({
                    positions,
                    summary: { ...get().summary, activePositions: positions.length },
                });
            },

            addPosition: (position) => {
                set((s) => ({
                    positions: [...s.positions, position],
                    summary: { ...s.summary, activePositions: s.positions.length + 1 },
                }));
            },

            removePosition: (positionId) => {
                set((s) => ({
                    positions: s.positions.filter(p => p.id !== positionId),
                    summary: { ...s.summary, activePositions: s.positions.length - 1 },
                }));
            },
        }),
        {
            name: 'learner-portfolio',
            storage: createIndexedDBStorage('learner-portfolio'),
        }
    )
);

// ─── Trade Store ─────────────────────────────────────────────

interface TradeStoreState {
    trades: Trade[];
    recentTrades: Trade[];

    // Actions
    addTrade: (trade: Trade) => void;
    updateTrade: (tradeId: string, updates: Partial<Trade>) => void;
    getTradesByStrategy: (strategyId: string) => Trade[];
}

export const useTradeStore = create<TradeStoreState>()(
    persist(
        (set, get) => ({
            trades: [],
            recentTrades: [],

            addTrade: (trade) => {
                // Also persist to IndexedDB (fire-and-forget)
                persistTrade(trade).catch(() => { });

                set((s) => {
                    const trades = [...s.trades, trade];
                    return {
                        trades,
                        recentTrades: trades.slice(-50),
                    };
                });
            },

            updateTrade: (tradeId, updates) => {
                set((s) => {
                    const trades = s.trades.map(t =>
                        t.id === tradeId ? { ...t, ...updates } : t
                    );
                    // Persist updated trade to IndexedDB
                    const updated = trades.find(t => t.id === tradeId);
                    if (updated) persistTrade(updated).catch(() => { });

                    return {
                        trades,
                        recentTrades: trades.slice(-50),
                    };
                });
            },

            getTradesByStrategy: (strategyId) => {
                return get().trades.filter(t => t.strategyId === strategyId);
            },
        }),
        {
            name: 'learner-trades',
            storage: createIndexedDBStorage('learner-trades'),
            partialize: (state) => ({
                trades: state.trades.slice(-1000), // Keep last 1000 in Zustand hydration
            }),
        }
    )
);

// ─── Market Store ────────────────────────────────────────────

interface MarketStoreState {
    tickers: Map<string, MarketTick>;
    selectedPair: string;
    availablePairs: string[];

    // Actions
    updateTicker: (tick: MarketTick) => void;
    updateTickers: (ticks: MarketTick[]) => void;
    setSelectedPair: (pair: string) => void;
    setAvailablePairs: (pairs: string[]) => void;
}

export const useMarketStore = create<MarketStoreState>()((set) => ({
    tickers: new Map(),
    selectedPair: 'BTCUSDT',
    availablePairs: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT'],

    updateTicker: (tick) => {
        set((s) => {
            const newTickers = new Map(s.tickers);
            newTickers.set(tick.symbol, tick);
            return { tickers: newTickers };
        });
    },

    updateTickers: (ticks) => {
        set((s) => {
            const newTickers = new Map(s.tickers);
            for (const tick of ticks) {
                newTickers.set(tick.symbol, tick);
            }
            return { tickers: newTickers };
        });
    },

    setSelectedPair: (pair) => set({ selectedPair: pair }),
    setAvailablePairs: (pairs) => set({ availablePairs: pairs }),
}));

// ─── Dashboard Config Store ──────────────────────────────────

interface DashboardConfigState {
    config: DashboardConfig;
    updateConfig: (partial: Partial<DashboardConfig>) => void;
}

export const useDashboardConfigStore = create<DashboardConfigState>()(
    persist(
        (set) => ({
            config: {
                selectedPair: 'BTCUSDT',
                selectedTimeframe: Timeframe.H1,
                isTestnet: true,
                autoTradeEnabled: false,
            },
            updateConfig: (partial) => {
                set((s) => ({
                    config: { ...s.config, ...partial },
                }));
            },
        }),
        {
            name: 'learner-dashboard-config',
            storage: createJSONStorage(() => localStorage),
        }
    )
);

// ─── Market Data Store (Connection & Health) ─────────────────

interface MarketDataStoreState {
    connectionStatus: ConnectionStatus;
    dataHealth: DataHealth[];
    activeSubscriptions: string[];
    lastConnectedAt: number | null;
    reconnectAttempts: number;
    isLiveMode: boolean;

    // Actions
    setConnectionStatus: (status: ConnectionStatus) => void;
    setDataHealth: (health: DataHealth[]) => void;
    setActiveSubscriptions: (subs: string[]) => void;
    setLiveMode: (isLive: boolean) => void;
}

export const useMarketDataStore = create<MarketDataStoreState>()((set) => ({
    connectionStatus: ConnectionStatus.DISCONNECTED,
    dataHealth: [],
    activeSubscriptions: [],
    lastConnectedAt: null,
    reconnectAttempts: 0,
    isLiveMode: false,

    setConnectionStatus: (status) => {
        set((s) => ({
            connectionStatus: status,
            lastConnectedAt: status === ConnectionStatus.CONNECTED
                ? Date.now()
                : s.lastConnectedAt,
            reconnectAttempts: status === ConnectionStatus.CONNECTED
                ? 0
                : status === ConnectionStatus.RECONNECTING
                    ? s.reconnectAttempts + 1
                    : s.reconnectAttempts,
        }));
    },

    setDataHealth: (health) => set({ dataHealth: health }),
    setActiveSubscriptions: (subs) => set({ activeSubscriptions: subs }),
    setLiveMode: (isLive) => set({ isLiveMode: isLive }),
}));

// ─── Cortex Live Engine Store (Phase 20) ─────────────────────

interface CortexLiveStoreState {
    engine: CortexLiveEngine | null;
    engineStatus: 'idle' | 'initializing' | 'seeding' | 'connecting' | 'live' | 'error' | 'stopped';
    seedProgress: { completed: number; total: number; currentSlot: string };
    lastError: string | null;

    // Actions
    initializeEngine: (slots?: TradingSlot[], totalCapital?: number) => Promise<void>;
    startEngine: () => Promise<void>;
    stopEngine: () => void;
    getEngine: () => CortexLiveEngine | null;
    setAutoTrade: (enabled: boolean) => void;
}

export const useCortexLiveStore = create<CortexLiveStoreState>()((set, get) => ({
    engine: null,
    engineStatus: 'idle',
    seedProgress: { completed: 0, total: 0, currentSlot: '' },
    lastError: null,

    initializeEngine: async (slots, totalCapital) => {
        set({ engineStatus: 'initializing' });

        try {
            // Ensure Cortex is initialized first
            const cortexStore = useCortexStore.getState();
            if (!cortexStore.cortex) {
                cortexStore.initializeCortex(slots, totalCapital);
            }

            const cortex = useCortexStore.getState().cortex;
            if (!cortex) {
                throw new Error('Failed to initialize Cortex');
            }

            // Create the live engine
            const engine = new CortexLiveEngine(cortex);

            // Wire ticker updates → MarketStore
            engine.setOnTickerUpdate((tickers: MarketTick[]) => {
                useMarketStore.getState().updateTickers(tickers);
            });

            // Wire connection changes → MarketDataStore
            engine.setOnConnectionChange((status: ConnectionStatus) => {
                useMarketDataStore.getState().setConnectionStatus(status);
            });

            // Wire snapshot refresh → CortexStore
            engine.setOnSnapshotRefresh(() => {
                useCortexStore.getState().refreshSnapshot();
            });

            // Wire evolution complete → log + refresh
            engine.setOnEvolutionComplete((slotId: string, genNumber: number, bestFitness: number, durationMs: number) => {
                console.log(
                    `[CortexLive] Evolution complete: ${slotId} Gen ${genNumber}` +
                    ` | Best: ${bestFitness.toFixed(1)} | ${durationMs}ms`,
                );
                useCortexStore.getState().refreshSnapshot();
            });

            set({ engine, engineStatus: 'seeding' });

            // Get active trading slots
            const activeSlots = cortex.getActiveSlots();
            if (activeSlots.length === 0) {
                console.warn('[CortexLive] No active trading slots — nothing to seed');
                set({ engineStatus: 'idle' });
                return;
            }

            // Phase 1-3: Initialize (seed + subscribe + wire)
            await engine.initialize(activeSlots);

            set({
                engineStatus: 'seeding', // Will transition to 'live' on start()
                seedProgress: engine.getStatus().seedProgress,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            set({ engineStatus: 'error', lastError: msg });
            console.error('[CortexLiveStore] Engine initialization failed:', msg);
        }
    },

    startEngine: async () => {
        const { engine } = get();
        if (!engine) {
            console.warn('[CortexLiveStore] No engine to start — call initializeEngine first');
            return;
        }

        set({ engineStatus: 'connecting' });

        try {
            await engine.start();
            set({ engineStatus: 'live' });
            useMarketDataStore.getState().setLiveMode(true);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            set({ engineStatus: 'error', lastError: msg });
        }
    },

    stopEngine: () => {
        const { engine } = get();
        if (!engine) return;
        engine.stop();
        set({ engineStatus: 'stopped' });
        useMarketDataStore.getState().setLiveMode(false);
    },

    getEngine: () => get().engine,

    setAutoTrade: (enabled: boolean) => {
        const { engine } = get();
        if (!engine) {
            console.warn('[CortexLiveStore] No engine — cannot toggle auto-trade');
            return;
        }
        engine.setAutoTrade(enabled);
    },
}));

// ─── Session Orchestrator Store (Phase 40 — Testnet Live Trading) ────

import type { SessionState, SessionConfig, SessionReport, SessionPhase } from '@/lib/engine/testnet-session-orchestrator';

interface SessionStoreState {
    phase: SessionPhase;
    sessionState: SessionState | null;
    isStarting: boolean;
    isStopping: boolean;
    lastReport: SessionReport | null;

    startSession: (config?: Partial<SessionConfig>) => Promise<void>;
    stopSession: (reason?: string) => Promise<void>;
    refreshState: () => void;
}

export const useSessionStore = create<SessionStoreState>()((set, get) => ({
    phase: 'IDLE',
    sessionState: null,
    isStarting: false,
    isStopping: false,
    lastReport: null,

    startSession: async (config?) => {
        set({ isStarting: true });
        try {
            const { getSessionOrchestrator } = await import('@/lib/engine/testnet-session-orchestrator');
            const orchestrator = getSessionOrchestrator();
            const state = await orchestrator.startSession(config);
            set({
                phase: state.phase,
                sessionState: state,
                isStarting: false,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error('[SessionStore] Start failed:', msg);
            set({ isStarting: false, phase: 'ERROR' });
        }
    },

    stopSession: async (reason?) => {
        set({ isStopping: true });
        try {
            const { getSessionOrchestrator } = await import('@/lib/engine/testnet-session-orchestrator');
            const orchestrator = getSessionOrchestrator();
            const report = await orchestrator.stopSession(reason);
            const state = orchestrator.getSessionState();
            set({
                phase: 'STOPPED',
                sessionState: state,
                lastReport: report,
                isStopping: false,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error('[SessionStore] Stop failed:', msg);
            set({ isStopping: false });
        }
    },

    refreshState: () => {
        import('@/lib/engine/testnet-session-orchestrator').then(({ getSessionOrchestrator }) => {
            const orchestrator = getSessionOrchestrator();
            const state = orchestrator.getSessionState();
            set({ phase: state.phase, sessionState: state });
        }).catch(() => {/* Non-critical */});
    },
}));

// ─── Boot Store (Phase 36 + 38 — System Ignition + Resilience Sentinel) ───

interface BootHistoryEntry {
    timestamp: number;
    durationMs: number;
    mode: 'live' | 'demo';
    phaseDurations: Partial<Record<import('@/types').BootPhase, number>>;
    success: boolean;
}

interface BootStoreState {
    phase: import('@/types').BootPhase;
    progress: import('@/types').BootProgress;
    error: string | null;
    envStatus: 'pending' | 'valid' | 'invalid';
    persistenceStatus: 'pending' | 'hydrated' | 'fresh' | 'error';
    cortexStatus: 'pending' | 'spawned' | 'error';
    seedStatus: 'pending' | 'seeding' | 'complete' | 'error';
    wsStatus: 'pending' | 'connecting' | 'connected' | 'error';
    evolutionStatus: 'pending' | 'active' | 'error';
    bootDurationMs: number;
    phaseDurations: Partial<Record<import('@/types').BootPhase, number>>;
    hasBooted: boolean;
    elapsedMs: number;
    bootHistory: BootHistoryEntry[];

    // Phase 38: Sentinel state
    probeResult: import('@/lib/engine/boot-resilience-sentinel').TestnetProbeResult | null;
    probeRunning: boolean;
    bootHealthScore: number;
    bootHealthGrade: string;
    sentinelRecoveryTier: string | null;
    sentinelRecovering: boolean;
    circuitBreakerTripped: boolean;

    // Actions
    ignite: (config?: Partial<import('@/types').BootConfig>) => Promise<void>;
    resilientIgnite: (config?: Partial<import('@/types').BootConfig>) => Promise<void>;
    runProbe: () => Promise<void>;
    shutdown: () => Promise<void>;
    updateFromBootState: (state: import('@/types').BootState) => void;
}

export const useBootStore = create<BootStoreState>()((set, get) => ({
    phase: 'IDLE' as import('@/types').BootPhase,
    progress: {
        phase: 'IDLE' as import('@/types').BootPhase,
        overallPercent: 0,
        message: 'Awaiting ignition...',
        slotProgress: { completed: 0, total: 0, currentSlot: '' },
    },
    error: null,
    envStatus: 'pending',
    persistenceStatus: 'pending',
    cortexStatus: 'pending',
    seedStatus: 'pending',
    wsStatus: 'pending',
    evolutionStatus: 'pending',
    bootDurationMs: 0,
    phaseDurations: {},
    hasBooted: false,
    elapsedMs: 0,
    bootHistory: [],

    // Phase 38: Sentinel defaults
    probeResult: null,
    probeRunning: false,
    bootHealthScore: 0,
    bootHealthGrade: '-',
    sentinelRecoveryTier: null,
    sentinelRecovering: false,
    circuitBreakerTripped: false,

    ignite: async (config) => {
        // Reset hasBooted so the full boot sequence is visible on re-ignition
        set({
            hasBooted: false,
            error: null,
            elapsedMs: 0,
            phase: 'IDLE' as import('@/types').BootPhase,
        });

        // Start elapsed time tracking with requestAnimationFrame
        const bootStart = Date.now();
        let rafId: number | null = null;
        const tickElapsed = () => {
            set({ elapsedMs: Date.now() - bootStart });
            rafId = requestAnimationFrame(tickElapsed);
        };
        rafId = requestAnimationFrame(tickElapsed);

        const { getSystemBootstrap } = await import('@/lib/engine/system-bootstrap');
        const bootstrap = getSystemBootstrap();

        // Wire real-time state updates into the store
        bootstrap.setOnStateChange((state) => {
            get().updateFromBootState(state);
        });

        try {
            // Phase 38.1: Inject cached probe result for fast ENV_CHECK
            const { probeResult } = get();
            const bootConfig: Partial<import('@/types').BootConfig> = {
                ...config,
                ...(probeResult ? { cachedProbeResult: probeResult } : {}),
            };
            const finalState = await bootstrap.ignite(bootConfig);
            get().updateFromBootState(finalState);

            // Record boot history
            const entry: BootHistoryEntry = {
                timestamp: Date.now(),
                durationMs: finalState.bootDurationMs,
                mode: finalState.envStatus === 'valid' ? 'live' : 'demo',
                phaseDurations: { ...finalState.phaseDurations },
                success: finalState.phase !== ('ERROR' as import('@/types').BootPhase),
            };
            set(prev => ({
                bootHistory: [...prev.bootHistory.slice(-4), entry],
            }));
        } finally {
            // Stop elapsed timer
            if (rafId !== null) cancelAnimationFrame(rafId);
            set({ elapsedMs: Date.now() - bootStart });
        }

        // After boot: wire Cortex + LiveEngine into existing stores
        const cortex = bootstrap.getCortex();
        const liveEngine = bootstrap.getLiveEngine();

        if (cortex) {
            // Update CortexStore with the booted Cortex instance
            const snapshot = cortex.getSnapshot();
            useCortexStore.setState({
                cortex,
                cortexSnapshot: snapshot,
                islands: snapshot.islands,
                globalState: snapshot.globalState,
                totalIslands: snapshot.totalIslands,
                activeIslands: snapshot.activeIslands,
                totalTradesAllIslands: snapshot.totalTradesAllIslands,
                globalBestFitness: snapshot.globalBestFitness,
                capitalAllocations: snapshot.capitalAllocations,
                migrationHistory: snapshot.migrationHistory,
                totalCapital: snapshot.totalCapital,
                overmindSnapshot: snapshot.overmindSnapshot ?? null,
            });
        }

        if (liveEngine) {
            // Wire ticker updates → MarketStore
            liveEngine.setOnTickerUpdate((tickers: MarketTick[]) => {
                useMarketStore.getState().updateTickers(tickers);
            });

            // Wire connection changes → MarketDataStore
            liveEngine.setOnConnectionChange((status: ConnectionStatus) => {
                useMarketDataStore.getState().setConnectionStatus(status);
            });

            // Wire snapshot refresh → CortexStore
            liveEngine.setOnSnapshotRefresh(() => {
                useCortexStore.getState().refreshSnapshot();
            });

            // Wire evolution complete callback
            liveEngine.setOnEvolutionComplete((slotId, genNumber, bestFitness, durationMs) => {
                console.log(
                    `[SystemBoot] Evolution complete: ${slotId} Gen ${genNumber}` +
                    ` | Best: ${bestFitness.toFixed(1)} | ${durationMs}ms`,
                );
                useCortexStore.getState().refreshSnapshot();
            });

            // Update CortexLiveStore with the engine
            useCortexLiveStore.setState({
                engine: liveEngine,
                engineStatus: 'live',
            });

            // Mark live mode
            useMarketDataStore.getState().setLiveMode(true);
        }
    },

    resilientIgnite: async (config) => {
        // Phase 38: Use Boot Resilience Sentinel for auto-recovery boot
        set({
            hasBooted: false,
            error: null,
            elapsedMs: 0,
            phase: 'IDLE' as import('@/types').BootPhase,
            sentinelRecovering: false,
            circuitBreakerTripped: false,
        });

        // Start elapsed time tracking
        const bootStart = Date.now();
        let rafId: number | null = null;
        const tickElapsed = () => {
            set({ elapsedMs: Date.now() - bootStart });
            rafId = requestAnimationFrame(tickElapsed);
        };
        rafId = requestAnimationFrame(tickElapsed);

        try {
            const { getBootSentinel } = await import('@/lib/engine/boot-resilience-sentinel');
            const sentinel = getBootSentinel();

            // Wire sentinel state changes into the store
            sentinel.setOnStateChange((sentinelState) => {
                set({
                    sentinelRecoveryTier: sentinelState.currentRecoveryTier,
                    sentinelRecovering: sentinelState.isRecovering,
                    circuitBreakerTripped: sentinelState.circuitBreakerTripped,
                    bootHealthScore: sentinelState.healthScore?.overall ?? 0,
                    bootHealthGrade: sentinelState.healthScore?.grade ?? '-',
                });
            });

            // Use resilient boot with auto-recovery
            // Phase 38.1: Inject cached probe result for fast ENV_CHECK
            const { probeResult } = get();
            const bootConfig: Partial<import('@/types').BootConfig> = {
                ...config,
                ...(probeResult ? { cachedProbeResult: probeResult } : {}),
            };
            const finalState = await sentinel.resilientBoot(bootConfig, (state) => {
                get().updateFromBootState(state);
            });

            get().updateFromBootState(finalState);

            // Record boot history
            const entry: BootHistoryEntry = {
                timestamp: Date.now(),
                durationMs: finalState.bootDurationMs,
                mode: finalState.envStatus === 'valid' ? 'live' : 'demo',
                phaseDurations: { ...finalState.phaseDurations },
                success: finalState.phase !== ('ERROR' as import('@/types').BootPhase),
            };
            set(prev => ({
                bootHistory: [...prev.bootHistory.slice(-4), entry],
            }));

            // Phase 39: Record to persistent Boot Resilience Scorecard
            try {
                const { getBootScorecard } = await import('@/lib/engine/boot-resilience-scorecard');
                const scorecard = getBootScorecard();
                scorecard.recordBoot(
                    finalState,
                    sentinel.getState().currentRecoveryTier,
                    sentinel.getState().healthScore?.grade ?? null,
                );
            } catch (scorecardError) {
                // Non-critical — don't break boot flow
                console.warn('[Scorecard] Failed to record boot:', scorecardError);
            }

            // Wire Cortex + LiveEngine into stores (same as ignite)
            const { getSystemBootstrap } = await import('@/lib/engine/system-bootstrap');
            const bootstrap = getSystemBootstrap();
            const cortex = bootstrap.getCortex();
            const liveEngine = bootstrap.getLiveEngine();

            if (cortex) {
                const snapshot = cortex.getSnapshot();
                useCortexStore.setState({
                    cortex,
                    cortexSnapshot: snapshot,
                    islands: snapshot.islands,
                    globalState: snapshot.globalState,
                    totalIslands: snapshot.totalIslands,
                    activeIslands: snapshot.activeIslands,
                    totalTradesAllIslands: snapshot.totalTradesAllIslands,
                    globalBestFitness: snapshot.globalBestFitness,
                    capitalAllocations: snapshot.capitalAllocations,
                    migrationHistory: snapshot.migrationHistory,
                    totalCapital: snapshot.totalCapital,
                    overmindSnapshot: snapshot.overmindSnapshot ?? null,
                });
            }

            if (liveEngine) {
                liveEngine.setOnTickerUpdate((tickers: MarketTick[]) => {
                    useMarketStore.getState().updateTickers(tickers);
                });
                liveEngine.setOnConnectionChange((status: ConnectionStatus) => {
                    useMarketDataStore.getState().setConnectionStatus(status);
                });
                liveEngine.setOnSnapshotRefresh(() => {
                    useCortexStore.getState().refreshSnapshot();
                });
                liveEngine.setOnEvolutionComplete((slotId, genNumber, bestFitness, durationMs) => {
                    console.log(
                        `[ResilientBoot] Evolution complete: ${slotId} Gen ${genNumber}` +
                        ` | Best: ${bestFitness.toFixed(1)} | ${durationMs}ms`,
                    );
                    useCortexStore.getState().refreshSnapshot();
                });
                useCortexLiveStore.setState({
                    engine: liveEngine,
                    engineStatus: 'live',
                });
                useMarketDataStore.getState().setLiveMode(true);
            }
        } finally {
            if (rafId !== null) cancelAnimationFrame(rafId);
            set({ elapsedMs: Date.now() - bootStart });
        }
    },

    runProbe: async () => {
        set({ probeRunning: true });
        try {
            const { getBootSentinel } = await import('@/lib/engine/boot-resilience-sentinel');
            const sentinel = getBootSentinel();
            const result = await sentinel.runProbe();
            const healthScore = sentinel.getHealthScore();
            set({
                probeResult: result,
                probeRunning: false,
                bootHealthScore: healthScore?.overall ?? 0,
                bootHealthGrade: healthScore?.grade ?? '-',
            });
        } catch {
            set({ probeRunning: false });
        }
    },

    shutdown: async () => {
        const { getSystemBootstrap } = await import('@/lib/engine/system-bootstrap');
        const bootstrap = getSystemBootstrap();
        await bootstrap.shutdown();

        set({
            phase: 'IDLE' as import('@/types').BootPhase,
            progress: {
                phase: 'IDLE' as import('@/types').BootPhase,
                overallPercent: 0,
                message: 'System shut down.',
                slotProgress: { completed: 0, total: 0, currentSlot: '' },
            },
            error: null,
            envStatus: 'pending',
            persistenceStatus: 'pending',
            cortexStatus: 'pending',
            seedStatus: 'pending',
            wsStatus: 'pending',
            evolutionStatus: 'pending',
            bootDurationMs: 0,
            phaseDurations: {},
        });

        // Clear live mode
        useMarketDataStore.getState().setLiveMode(false);
    },

    updateFromBootState: (state) => {
        set({
            phase: state.phase,
            progress: state.progress,
            error: state.error,
            envStatus: state.envStatus,
            persistenceStatus: state.persistenceStatus,
            cortexStatus: state.cortexStatus,
            seedStatus: state.seedStatus,
            wsStatus: state.wsStatus,
            evolutionStatus: state.evolutionStatus,
            bootDurationMs: state.bootDurationMs,
            phaseDurations: state.phaseDurations,
            hasBooted: state.hasBooted,
        });
    },
}));

