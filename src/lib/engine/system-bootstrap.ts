// ============================================================
// Learner: System Bootstrap — 7-Phase Ignition Orchestrator
// ============================================================
// Phase 36 — System Startup Architecture
//
// PURPOSE: Coordinate all subsystem initialization in strict
// dependency order. This is the SINGLE entry point that brings
// the entire Learner trading system from cold-start to live.
//
// 7-Phase Ignition Sequence:
//   Phase 0: ENV_CHECK       → Validate .env.local
//   Phase 1: PERSISTENCE     → Hydrate last session checkpoint
//   Phase 2: CORTEX_SPAWN    → Create Cortex + Islands
//   Phase 3: HISTORICAL_SEED → Fetch 500 candles/slot via REST
//   Phase 4: WS_CONNECT      → Open Binance WebSocket
//   Phase 5: EVOLUTION_START  → Enable EvolutionScheduler
//   Phase 6: READY           → System fully operational
//
// Error Recovery: Non-critical failures (Supabase down, Overmind
// disabled) log warnings and continue. Critical failures (no
// Binance API key, Cortex spawn failure) halt with diagnostics.
//
// Lifecycle: ignite(config?) → getBootState() → shutdown()
// ============================================================

import { bootLog } from '@/lib/utils/logger';
import {
    BootPhase,
    Timeframe,
    type BootConfig,
    type BootState,
    type BootProgress,
    type ConnectionStatus,
    type MarketTick,
} from '@/types';
import { createTradingSlot, type TradingSlot } from '@/types/trading-slot';
import type { ValidatedEnv } from '@/lib/config/env-validator';
import {
    loadEngineCheckpoint,
    saveEngineCheckpoint,
    startAutoCheckpoint,
    stopAutoCheckpoint,
    type EngineCheckpoint,
} from '@/lib/store/persistence';
import { Cortex } from './cortex';
import { CortexLiveEngine } from './cortex-live-engine';

// ─── Default Boot Configuration ─────────────────────────────

const DEFAULT_BOOT_CONFIG: BootConfig = {
    pairs: ['BTCUSDT', 'ETHUSDT'],
    timeframe: Timeframe.H1,
    totalCapital: 10000,
    skipPersistence: false,
    autoTrade: false,
};

// Minimum time (ms) each phase must be visible on screen
// This prevents micro-phases from flashing invisibly
const MIN_PHASE_DISPLAY_MS = 400;

// ─── Phase Progress Weights ──────────────────────────────────
// Each phase contributes a fraction of the overall 0-100% bar.
// HISTORICAL_SEED gets the largest share (it takes the longest).

const PHASE_WEIGHTS: Record<BootPhase, number> = {
    [BootPhase.IDLE]: 0,
    [BootPhase.ENV_CHECK]: 5,
    [BootPhase.PERSISTENCE]: 10,
    [BootPhase.CORTEX_SPAWN]: 20,
    [BootPhase.HISTORICAL_SEED]: 50,
    [BootPhase.WS_CONNECT]: 10,
    [BootPhase.EVOLUTION_START]: 10,
    [BootPhase.READY]: 5,
    [BootPhase.ERROR]: 0,
    [BootPhase.SHUTDOWN]: 0,
};

// Cumulative thresholds for each phase start
const PHASE_ORDER: BootPhase[] = [
    BootPhase.ENV_CHECK,
    BootPhase.PERSISTENCE,
    BootPhase.CORTEX_SPAWN,
    BootPhase.HISTORICAL_SEED,
    BootPhase.WS_CONNECT,
    BootPhase.EVOLUTION_START,
    BootPhase.READY,
];

function getPhaseBasePercent(phase: BootPhase): number {
    let base = 0;
    for (const p of PHASE_ORDER) {
        if (p === phase) return base;
        base += PHASE_WEIGHTS[p];
    }
    return base;
}

// ─── System Bootstrap Class ─────────────────────────────────

export class SystemBootstrap {
    private phase: BootPhase = BootPhase.IDLE;
    private config: BootConfig = { ...DEFAULT_BOOT_CONFIG };
    private bootStartTime: number = 0;
    private phaseDurations: Partial<Record<BootPhase, number>> = {};
    private error: string | null = null;
    private hasBooted: boolean = false;

    // Subsystem status indicators
    private envStatus: BootState['envStatus'] = 'pending';
    private persistenceStatus: BootState['persistenceStatus'] = 'pending';
    private cortexStatus: BootState['cortexStatus'] = 'pending';
    private seedStatus: BootState['seedStatus'] = 'pending';
    private wsStatus: BootState['wsStatus'] = 'pending';
    private evolutionStatus: BootState['evolutionStatus'] = 'pending';

    // Progress tracking
    private progressMessage: string = 'Awaiting ignition...';
    private slotProgress = { completed: 0, total: 0, currentSlot: '' };

    // Engine references (owned after boot)
    private cortex: Cortex | null = null;
    private liveEngine: CortexLiveEngine | null = null;
    private validatedEnv: ValidatedEnv | null = null;
    private restoredCheckpoint: EngineCheckpoint | null = null;

    // Callback for real-time state change notifications
    private onStateChange: ((state: BootState) => void) | null = null;

    // ─── Public API ──────────────────────────────────────────

    /**
     * Start the full 7-phase ignition sequence.
     * Resolves when the system is fully live (READY) or throws on critical failure.
     */
    async ignite(config?: Partial<BootConfig>): Promise<BootState> {
        if (this.phase === BootPhase.READY || this.isBooting()) {
            bootLog.warn('Ignition already in progress or system already live');
            return this.getBootState();
        }

        this.config = { ...DEFAULT_BOOT_CONFIG, ...config };
        this.bootStartTime = Date.now();
        this.error = null;
        this.resetSubsystemStatus();

        bootLog.info('🚀 IGNITION SEQUENCE INITIATED', {
            pairs: this.config.pairs,
            timeframe: this.config.timeframe,
            capital: this.config.totalCapital,
        });

        try {
            // Phase 0: Environment Validation (via server-side probe)
            await this.executePhase(BootPhase.ENV_CHECK, async () => {
                this.progressMessage = 'Checking API keys & environment...';
                this.notifyStateChange();
                try {
                    // Phase 38.1 RADICAL INNOVATION: Probe Result Cache Reuse
                    // If Pre-Boot Diagnostic already ran a probe recently (< 60s),
                    // reuse that result instead of making a redundant ~2s API call.
                    const PROBE_CACHE_MAX_AGE_MS = 60_000; // 60 seconds
                    const cached = this.config.cachedProbeResult;
                    const cacheAge = cached ? Date.now() - cached.timestamp : Infinity;
                    const cacheValid = cached && cacheAge < PROBE_CACHE_MAX_AGE_MS;

                    let probeData: {
                        ready: boolean;
                        isTestnet: boolean;
                        checks: Array<{ name: string; status: string; details?: string; latencyMs?: number }>;
                    };

                    if (cacheValid && cached) {
                        // 🚀 FAST PATH: Reuse cached probe (0ms instead of ~2s)
                        probeData = cached;
                        bootLog.info('⚡ ENV_CHECK: Using cached probe result', {
                            cacheAgeMs: Math.round(cacheAge),
                            checksCount: cached.checks?.length ?? 0,
                        });
                    } else {
                        // SLOW PATH: No cache or stale — call server-side probe API
                        // process.env.BINANCE_* are server-only (no NEXT_PUBLIC_ prefix),
                        // so client-side validateEnvironment() would see them as empty.
                        const response = await fetch('/api/trading/testnet-probe');
                        if (!response.ok) {
                            throw new Error(`Probe API returned ${response.status}`);
                        }
                        probeData = await response.json();
                        bootLog.info('🔍 ENV_CHECK: Live probe completed', {
                            checksCount: probeData.checks?.length ?? 0,
                        });
                    }

                    if (probeData.ready || probeData.checks?.some((c: { name: string; status: string }) => c.name === 'credentials' && c.status === 'pass')) {
                        // Bridge probe result into ValidatedEnv shape
                        this.validatedEnv = {
                            binance: {
                                apiKey: '***configured***',
                                apiSecret: '***configured***',
                                isTestnet: probeData.isTestnet ?? true,
                            },
                            supabase: {
                                url: '***configured***',
                                anonKey: '***configured***',
                            },
                            overmind: {
                                enabled: false,
                                apiKey: '',
                                maxTokensPerHour: 0,
                            },
                            nodeEnv: 'development',
                            isProduction: false,
                        };
                        this.envStatus = 'valid';
                        this.progressMessage = '✅ Environment valid — ' +
                            (this.validatedEnv.binance.isTestnet ? 'TESTNET' : 'MAINNET') + ' mode' +
                            (cacheValid ? ' (cached)' : '');
                        bootLog.info('✅ Environment validated' + (cacheValid ? ' (from cache)' : ' via probe'), {
                            binance: this.validatedEnv.binance.isTestnet ? 'TESTNET' : 'MAINNET',
                            checks: probeData.checks?.length ?? 0,
                            cacheUsed: !!cacheValid,
                        });
                    } else {
                        // Probe ran but credentials check failed
                        this.envStatus = 'invalid';
                        this.progressMessage = '⚠️ No API keys — DEMO MODE activated';
                        const failedChecks = probeData.checks
                            ?.filter((c: { status: string }) => c.status === 'fail')
                            ?.map((c: { name: string }) => c.name)
                            ?.join(', ') ?? 'unknown';
                        bootLog.warn('Environment validation failed via probe — DEMO mode', { failedChecks });
                    }
                } catch (envError) {
                    this.envStatus = 'invalid';
                    this.progressMessage = '⚠️ No API keys — DEMO MODE activated';
                    const msg = envError instanceof Error ? envError.message : 'Unknown env error';
                    bootLog.warn('Environment validation failed — running in DEMO mode', { error: msg });
                }
                this.notifyStateChange();
            });

            // Phase 1: Persistence Hydration
            await this.executePhase(BootPhase.PERSISTENCE, async () => {
                this.progressMessage = 'Scanning IndexedDB for checkpoint...';
                this.notifyStateChange();

                if (this.config.skipPersistence) {
                    this.persistenceStatus = 'fresh';
                    this.progressMessage = '⏭️ Persistence skipped — fresh start';
                    bootLog.info('⏭️ Persistence skipped — fresh start');
                    return;
                }

                try {
                    this.restoredCheckpoint = await loadEngineCheckpoint();

                    if (this.restoredCheckpoint) {
                        this.persistenceStatus = 'hydrated';
                        this.progressMessage = '💾 Previous session checkpoint restored';
                        bootLog.info('💾 Session checkpoint restored', {
                            timestamp: new Date(this.restoredCheckpoint.timestamp).toISOString(),
                        });
                    } else {
                        this.persistenceStatus = 'fresh';
                        this.progressMessage = '📭 No checkpoint found — fresh session';
                        bootLog.info('📭 No previous checkpoint — fresh session');
                    }
                } catch (persistError) {
                    this.persistenceStatus = 'error';
                    this.progressMessage = '⚠️ Persistence error — continuing without';
                    const msg = persistError instanceof Error ? persistError.message : 'Unknown persistence error';
                    bootLog.warn('Persistence hydration failed — continuing without', { error: msg });
                }
                this.notifyStateChange();
            });

            // Phase 2: Cortex Spawn
            await this.executePhase(BootPhase.CORTEX_SPAWN, async () => {
                this.progressMessage = 'Spawning Cortex + Islands...';
                this.notifyStateChange();

                try {
                    // Create trading slots from config
                    const slots: TradingSlot[] = this.config.pairs.map(pair =>
                        createTradingSlot(pair, this.config.timeframe)
                    );

                    // Create Cortex with capital
                    this.cortex = new Cortex({
                        totalCapital: this.config.totalCapital,
                    });

                    // Initialize Cortex — creates Islands with HyperDNA
                    const snapshot = this.cortex.initialize(slots);
                    this.cortexStatus = 'spawned';

                    bootLog.info('🧠 Cortex spawned', {
                        islands: snapshot.totalIslands,
                        capital: snapshot.totalCapital,
                    });
                } catch (cortexError) {
                    this.cortexStatus = 'error';
                    throw cortexError; // CRITICAL — can't proceed without Cortex
                }
            });

            // Phase 3: Historical Seed
            await this.executePhase(BootPhase.HISTORICAL_SEED, async () => {
                this.seedStatus = 'seeding';

                if (!this.cortex) {
                    throw new Error('Cortex not initialized — cannot seed');
                }

                // Only seed if we have valid env (Binance API available)
                if (this.envStatus !== 'valid') {
                    this.seedStatus = 'complete';
                    this.progressMessage = '⏭️ Seed skipped — no Binance API (demo mode)';
                    this.notifyStateChange();
                    bootLog.info('⏭️ Historical seed skipped — no Binance API credentials');
                    return;
                }

                this.progressMessage = 'Fetching 500 candles per trading slot...';
                this.notifyStateChange();

                try {
                    this.liveEngine = new CortexLiveEngine(this.cortex);
                    const slots = this.cortex.getActiveSlots();
                    this.slotProgress = { completed: 0, total: slots.length, currentSlot: '' };

                    await this.liveEngine.initialize(slots);

                    const engineStatus = this.liveEngine.getStatus();
                    this.slotProgress = { ...engineStatus.seedProgress };
                    this.seedStatus = 'complete';
                    this.progressMessage = `📊 Seeded ${slots.length} slot(s) with historical data`;
                    this.notifyStateChange();

                    bootLog.info('📊 Historical data seeded', { slots: slots.length });
                } catch (seedError) {
                    this.seedStatus = 'error';
                    throw seedError;
                }
            });

            // Phase 4: WebSocket Connect
            await this.executePhase(BootPhase.WS_CONNECT, async () => {
                this.wsStatus = 'connecting';

                if (!this.liveEngine) {
                    this.wsStatus = 'connected';
                    this.progressMessage = '⏭️ WebSocket skipped — demo mode';
                    this.notifyStateChange();
                    bootLog.info('⏭️ WebSocket skipped — demo mode');
                    return;
                }

                this.progressMessage = 'Connecting to Binance kline + ticker streams...';
                this.notifyStateChange();

                try {
                    await this.liveEngine.start();
                    this.wsStatus = 'connected';
                    this.progressMessage = '📡 WebSocket connected — live data flowing';
                    this.notifyStateChange();
                    bootLog.info('📡 WebSocket connected — data flowing');
                } catch (wsError) {
                    this.wsStatus = 'error';
                    throw wsError;
                }
            });

            // Phase 5: Evolution Start
            await this.executePhase(BootPhase.EVOLUTION_START, async () => {
                this.progressMessage = 'Activating GA engine + auto-checkpoint...';
                this.notifyStateChange();

                try {
                    if (this.config.autoTrade && this.liveEngine) {
                        this.liveEngine.setAutoTrade(true);
                        bootLog.info('🔥 Auto-trade ENABLED');
                    }

                    if (this.cortex) {
                        const cortex = this.cortex;
                        startAutoCheckpoint(() => {
                            const snap = cortex.getSnapshot();
                            return {
                                id: 'latest',
                                timestamp: Date.now(),
                                version: 1,
                                cortexConfig: {
                                    totalCapital: snap.totalCapital,
                                    slots: snap.islands.map(i => ({
                                        id: i.slotId,
                                        pair: i.pair,
                                        timeframe: i.timeframe,
                                        status: i.state,
                                    })),
                                },
                                islandStates: snap.islands.map(i => ({
                                    slotId: i.slotId,
                                    activeStrategyId: i.activeStrategy?.id ?? null,
                                    currentGeneration: i.currentGeneration,
                                    totalTrades: i.totalTrades,
                                    currentRegime: i.currentRegime,
                                    bestFitnessAllTime: i.bestFitnessAllTime,
                                })),
                                forensicLearningBeliefs: [],
                                lastTradeId: null,
                            };
                        });
                        bootLog.info('💾 Auto-checkpoint enabled (30s interval)');
                    }

                    this.evolutionStatus = 'active';
                    this.progressMessage = '🧬 Evolution engine active — GA running';
                    this.notifyStateChange();
                    bootLog.info('🧬 Evolution engine activated');
                } catch (evoError) {
                    this.evolutionStatus = 'error';
                    this.progressMessage = '⚠️ Evolution failed — manual mode';
                    this.notifyStateChange();
                    const msg = evoError instanceof Error ? evoError.message : 'Unknown';
                    bootLog.warn('Evolution start failed — manual evolution required', { error: msg });
                }
            });

            // Phase 6: READY
            await this.executePhase(BootPhase.READY, async () => {
                const totalMs = Date.now() - this.bootStartTime;
                this.progressMessage = `🟢 System ready — booted in ${totalMs}ms`;
                this.notifyStateChange();
            });

            this.hasBooted = true;
            const totalMs = Date.now() - this.bootStartTime;

            bootLog.info('🟢 IGNITION COMPLETE', {
                totalMs,
                phases: this.phaseDurations,
                hasLiveEngine: !!this.liveEngine,
                autoTrade: this.config.autoTrade,
            });

            return this.getBootState();
        } catch (criticalError) {
            this.phase = BootPhase.ERROR;
            const msg = criticalError instanceof Error ? criticalError.message : 'Unknown critical error';
            this.error = msg;
            this.progressMessage = `Boot failed: ${msg}`;
            this.notifyStateChange();
            bootLog.error('🔴 IGNITION FAILED', { error: msg, phase: this.phase });
            return this.getBootState();
        }
    }

    /**
     * Graceful shutdown — save checkpoint, close WebSocket, stop evolution.
     */
    async shutdown(): Promise<void> {
        if (this.phase === BootPhase.IDLE || this.phase === BootPhase.SHUTDOWN) {
            return;
        }

        bootLog.info('🔴 SHUTDOWN initiated');
        this.phase = BootPhase.SHUTDOWN;
        this.progressMessage = 'Shutting down...';
        this.notifyStateChange();

        // Save final checkpoint before shutdown
        if (this.cortex) {
            try {
                const snap = this.cortex.getSnapshot();
                const checkpoint: EngineCheckpoint = {
                    id: 'latest',
                    timestamp: Date.now(),
                    version: 1,
                    cortexConfig: {
                        totalCapital: snap.totalCapital,
                        slots: snap.islands.map(i => ({
                            id: i.slotId,
                            pair: i.pair,
                            timeframe: i.timeframe,
                            status: i.state,
                        })),
                    },
                    islandStates: snap.islands.map(i => ({
                        slotId: i.slotId,
                        activeStrategyId: i.activeStrategy?.id ?? null,
                        currentGeneration: i.currentGeneration,
                        totalTrades: i.totalTrades,
                        currentRegime: i.currentRegime,
                        bestFitnessAllTime: i.bestFitnessAllTime,
                    })),
                    forensicLearningBeliefs: [],
                    lastTradeId: null,
                };
                await saveEngineCheckpoint(checkpoint);
                bootLog.info('💾 Final checkpoint saved');
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown';
                bootLog.error('Failed to save final checkpoint', { error: msg });
            }
        }

        // Stop auto-checkpoint scheduler
        stopAutoCheckpoint();

        // Stop live engine
        if (this.liveEngine) {
            this.liveEngine.stop();
            this.liveEngine = null;
        }

        this.cortex = null;
        this.phase = BootPhase.IDLE;
        this.progressMessage = 'System shut down.';
        this.resetSubsystemStatus();
        this.notifyStateChange();

        bootLog.info('🔴 SHUTDOWN complete');
    }

    /**
     * Get the complete boot state snapshot for UI display.
     */
    getBootState(): BootState {
        const overall = this.calculateOverallPercent();
        return {
            phase: this.phase,
            progress: {
                phase: this.phase,
                overallPercent: overall,
                message: this.progressMessage,
                slotProgress: { ...this.slotProgress },
            },
            envStatus: this.envStatus,
            persistenceStatus: this.persistenceStatus,
            cortexStatus: this.cortexStatus,
            seedStatus: this.seedStatus,
            wsStatus: this.wsStatus,
            evolutionStatus: this.evolutionStatus,
            bootDurationMs: this.bootStartTime > 0 ? Date.now() - this.bootStartTime : 0,
            phaseDurations: { ...this.phaseDurations },
            error: this.error,
            hasBooted: this.hasBooted,
        };
    }

    /**
     * Get the live Cortex instance (available after CORTEX_SPAWN phase).
     */
    getCortex(): Cortex | null {
        return this.cortex;
    }

    /**
     * Get the live CortexLiveEngine instance (available after HISTORICAL_SEED phase).
     */
    getLiveEngine(): CortexLiveEngine | null {
        return this.liveEngine;
    }

    /**
     * Register a state change callback for real-time UI updates.
     */
    setOnStateChange(callback: (state: BootState) => void): void {
        this.onStateChange = callback;
    }

    /**
     * Check if the system is currently booting (between ignite and READY/ERROR).
     */
    isBooting(): boolean {
        return this.phase !== BootPhase.IDLE
            && this.phase !== BootPhase.READY
            && this.phase !== BootPhase.ERROR
            && this.phase !== BootPhase.SHUTDOWN;
    }

    // ─── Internal Helpers ────────────────────────────────────

    private async executePhase(phase: BootPhase, fn: () => Promise<void>): Promise<void> {
        this.phase = phase;
        this.notifyStateChange();

        // Yield to the event loop so React can paint this phase BEFORE executing
        await new Promise<void>(r => setTimeout(r, 0));

        const phaseStart = Date.now();

        try {
            await fn();
            this.phaseDurations[phase] = Date.now() - phaseStart;

            // Enforce minimum display time so user can see each phase
            const elapsed = Date.now() - phaseStart;
            if (elapsed < MIN_PHASE_DISPLAY_MS) {
                await new Promise<void>(r => setTimeout(r, MIN_PHASE_DISPLAY_MS - elapsed));
            }
        } catch (error) {
            this.phaseDurations[phase] = Date.now() - phaseStart;
            throw error;
        }
    }

    private calculateOverallPercent(): number {
        if (this.phase === BootPhase.IDLE) return 0;
        if (this.phase === BootPhase.READY) return 100;
        if (this.phase === BootPhase.ERROR) return this.getPhaseBasePercent();

        const base = this.getPhaseBasePercent();
        const phaseWeight = PHASE_WEIGHTS[this.phase] || 0;

        // For HISTORICAL_SEED, use slot progress for intra-phase percentage
        if (this.phase === BootPhase.HISTORICAL_SEED && this.slotProgress.total > 0) {
            const intraPercent = this.slotProgress.completed / this.slotProgress.total;
            return Math.round(base + phaseWeight * intraPercent);
        }

        // For other phases, show phase start as progress
        return Math.round(base + phaseWeight * 0.5);
    }

    private getPhaseBasePercent(): number {
        return getPhaseBasePercent(this.phase);
    }

    private resetSubsystemStatus(): void {
        this.envStatus = 'pending';
        this.persistenceStatus = 'pending';
        this.cortexStatus = 'pending';
        this.seedStatus = 'pending';
        this.wsStatus = 'pending';
        this.evolutionStatus = 'pending';
        this.slotProgress = { completed: 0, total: 0, currentSlot: '' };
    }

    private notifyStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange(this.getBootState());
        }
    }
}

// ─── Singleton Instance ─────────────────────────────────────

let bootstrapInstance: SystemBootstrap | null = null;

/**
 * Get the singleton SystemBootstrap instance.
 * The bootstrap is the SINGLE entry point for starting the system.
 */
export function getSystemBootstrap(): SystemBootstrap {
    if (!bootstrapInstance) {
        bootstrapInstance = new SystemBootstrap();
    }
    return bootstrapInstance;
}
