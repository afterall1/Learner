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

