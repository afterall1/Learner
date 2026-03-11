// ============================================================
// Learner: Testnet Session Orchestrator (TSO)
// ============================================================
// Phase 31 RADICAL INNOVATION: 5-phase lifecycle manager for
// testnet paper trading sessions.
//
// Phases:
//   1. PROBE  → Verify testnet connectivity + account balance
//   2. SEED   → Initialize CortexLiveEngine, seed historical data
//   3. EVOLVE → Run initial evolution to select champion strategy
//   4. TRADE  → Enable auto-trade, monitor signals + executions
//   5. REPORT → Session summary with trades, PnL, execution quality
//
// Features:
//   - Phase-by-phase status with dashboard-exportable state
//   - Automatic abort on probe failure
//   - Session duration timer with configurable max
//   - Final session report with trade log + performance metrics
//   - Safety interlocks: max loss %, max duration, max positions
//
// Usage:
//   const orchestrator = new TestnetSessionOrchestrator();
//   await orchestrator.startSession({ pairs: ['BTCUSDT'], ... });
//   // ... monitor via getSessionState()
//   await orchestrator.stopSession();
// ============================================================

import { useCortexStore, useCortexLiveStore } from '@/lib/store';
import { createTradingSlot } from '@/types/trading-slot';
import { Timeframe } from '@/types';
import { createLogger } from '@/lib/utils/logger';

const tsoLog = createLogger('SessionOrchestrator');

// ─── Types ──────────────────────────────────────────────────

export type SessionPhase = 'IDLE' | 'PROBE' | 'SEED' | 'EVOLVE' | 'TRADE' | 'REPORT' | 'STOPPED' | 'ERROR';

export interface SessionConfig {
    /** Trading pairs (e.g., ['BTCUSDT']) */
    pairs: string[];
    /** Candle timeframe */
    timeframe: Timeframe;
    /** Capital per trading slot in USDT */
    capitalPerSlot: number;
    /** If true, simulate without real testnet orders */
    dryRun: boolean;
    /** Max session duration in minutes (0 = unlimited) */
    maxDurationMinutes: number;
    /** Max cumulative loss % before emergency stop (-5 = 5% loss) */
    maxLossPercent: number;
    /** Max concurrent open positions */
    maxPositions: number;
}

export interface SessionTradeLog {
    slotId: string;
    strategyId: string;
    direction: string;
    entryPrice: number;
    exitPrice: number | null;
    quantity: number;
    pnlPercent: number | null;
    entryTime: number;
    exitTime: number | null;
    status: 'OPEN' | 'CLOSED';
}

export interface SessionReport {
    sessionId: string;
    startTime: number;
    endTime: number;
    durationMs: number;
    config: SessionConfig;
    phases: { phase: SessionPhase; startTime: number; endTime: number; durationMs: number }[];
    trades: SessionTradeLog[];
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnlPercent: number;
    maxDrawdownPercent: number;
    bestTradePnl: number;
    worstTradePnl: number;
    candlesProcessed: number;
    evolutionCycles: number;
    finalChampionFitness: number;
    abortReason: string | null;
}

export interface SessionState {
    phase: SessionPhase;
    sessionId: string | null;
    startTime: number | null;
    elapsedMs: number;
    config: SessionConfig | null;
    probeResult: { ready: boolean; checks: number; passed: number } | null;
    seedProgress: { completed: number; total: number } | null;
    tradeCount: number;
    openPositions: number;
    cumulativePnl: number;
    lastError: string | null;
    report: SessionReport | null;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
    pairs: ['BTCUSDT'],
    timeframe: Timeframe.M5,
    capitalPerSlot: 1000,
    dryRun: false,
    maxDurationMinutes: 60,
    maxLossPercent: -10,
    maxPositions: 3,
};

// ─── Testnet Session Orchestrator ───────────────────────────

export class TestnetSessionOrchestrator {
    private phase: SessionPhase = 'IDLE';
    private sessionId: string | null = null;
    private startTime: number | null = null;
    private config: SessionConfig | null = null;
    private phaseLog: SessionState['probeResult'] = null;
    private trades: SessionTradeLog[] = [];
    private phaseTimings: SessionReport['phases'] = [];
    private durationTimer: ReturnType<typeof setTimeout> | null = null;
    private monitorInterval: ReturnType<typeof setInterval> | null = null;
    private lastError: string | null = null;
    private report: SessionReport | null = null;
    private candlesProcessed = 0;
    private evolutionCycles = 0;
    /** True if session reused an engine booted via Ignite (don't kill on stop) */
    private engineWasPreBooted = false;

    /**
     * Start a new testnet trading session.
     * Runs through 5 phases sequentially: PROBE → SEED → EVOLVE → TRADE → ...
     * The TRADE phase continues until stopSession() is called or safety limits hit.
     */
    async startSession(config: Partial<SessionConfig> = {}): Promise<SessionState> {
        if (this.phase !== 'IDLE' && this.phase !== 'STOPPED' && this.phase !== 'ERROR') {
            throw new Error(`Cannot start session — already in phase: ${this.phase}`);
        }

        this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
        this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.startTime = Date.now();
        this.trades = [];
        this.phaseTimings = [];
        this.lastError = null;
        this.report = null;
        this.candlesProcessed = 0;
        this.evolutionCycles = 0;

        tsoLog.info('🚀 Session starting', {
            sessionId: this.sessionId,
            config: this.config,
        });

        try {
            // ─── Phase 1: PROBE ─────────────────────────────
            await this.runPhase('PROBE', async () => {
                // Phase 44 FIX: Use server-side API route instead of client-side BinanceRestClient
                // (process.env is empty in browser — Next.js only exposes NEXT_PUBLIC_* vars)
                // Phase 44.1: Retry with backoff for intermittent server time drift
                const MAX_PROBE_ATTEMPTS = 3;
                const PROBE_BACKOFF_MS = 2000;
                let lastError: Error | null = null;

                for (let attempt = 1; attempt <= MAX_PROBE_ATTEMPTS; attempt++) {
                    try {
                        const response = await fetch('/api/trading/testnet-probe');
                        if (!response.ok) {
                            throw new Error(`Probe API returned ${response.status}`);
                        }

                        const probeResult = await response.json();

                        if (!probeResult.isTestnet) {
                            throw new Error('BINANCE_TESTNET is not true — refusing to trade on mainnet');
                        }

                        // Only credentials + testnet_mode are hard failures
                        // account_access may fail intermittently due to server time drift
                        const criticalFailures = (probeResult.checks ?? []).filter(
                            (c: { name: string; status: string }) =>
                                c.status === 'fail' &&
                                (c.name === 'credentials' || c.name === 'testnet_mode'),
                        );

                        if (criticalFailures.length > 0) {
                            const failNames = criticalFailures.map((c: { name: string }) => c.name).join(', ');
                            throw new Error(`Critical probe failures: ${failNames}`);
                        }

                        // Log non-critical failures as warnings
                        const nonCriticalFailures = (probeResult.checks ?? []).filter(
                            (c: { name: string; status: string }) =>
                                c.status === 'fail' &&
                                c.name !== 'credentials' &&
                                c.name !== 'testnet_mode',
                        );

                        if (nonCriticalFailures.length > 0) {
                            const warnNames = nonCriticalFailures.map(
                                (c: { name: string; details: string }) => `${c.name}: ${c.details}`,
                            ).join('; ');
                            tsoLog.warn(`⚠️ Probe non-critical issues (attempt ${attempt}): ${warnNames}`);
                        }

                        // Extract balance from account
                        const balance = probeResult.account?.availableBalance ?? 0;
                        if (balance <= 0) {
                            tsoLog.warn('Zero testnet balance — request funds from faucet');
                        }

                        this.phaseLog = {
                            ready: probeResult.ready || criticalFailures.length === 0,
                            checks: probeResult.checks?.length ?? 0,
                            passed: (probeResult.checks ?? []).filter(
                                (c: { status: string }) => c.status === 'pass',
                            ).length,
                        };

                        tsoLog.info(`✅ Probe passed (attempt ${attempt}/${MAX_PROBE_ATTEMPTS})`, {
                            balance: balance.toFixed(2),
                            testnet: probeResult.isTestnet,
                            latency: probeResult.totalLatencyMs,
                        });

                        return; // Success — exit retry loop
                    } catch (error) {
                        lastError = error instanceof Error ? error : new Error(String(error));
                        tsoLog.warn(`⚠️ Probe attempt ${attempt}/${MAX_PROBE_ATTEMPTS} failed: ${lastError.message}`);

                        if (attempt < MAX_PROBE_ATTEMPTS) {
                            await new Promise((r) => setTimeout(r, PROBE_BACKOFF_MS * attempt));
                        }
                    }
                }

                // All attempts failed
                throw lastError ?? new Error('Probe failed after all retry attempts');
            });

            // ─── Phase 2: SEED (Ignite-Aware) ──────────────
            await this.runPhase('SEED', async () => {
                const liveStore = useCortexLiveStore.getState();

                // Check if engine was already booted via Ignite
                if (liveStore.engine && liveStore.engineStatus === 'live') {
                    this.engineWasPreBooted = true;
                    tsoLog.info('✅ Engine already running (Ignite boot detected) — skipping re-seed');
                    return;
                }

                // Cold start — initialize engine from scratch
                const slots = this.config!.pairs.map(pair =>
                    createTradingSlot(pair, this.config!.timeframe),
                );

                const totalCapital = this.config!.capitalPerSlot * slots.length;

                await liveStore.initializeEngine(slots, totalCapital);

                const status = liveStore.engineStatus;
                if (status === 'error') {
                    throw new Error(`Engine initialization failed: ${liveStore.lastError}`);
                }

                tsoLog.info('✅ Seed complete (cold start)', {
                    slots: slots.length,
                    totalCapital,
                });
            });

            // ─── Phase 3: EVOLVE (Forced Champion) ──────────
            await this.runPhase('EVOLVE', async () => {
                const liveStore = useCortexLiveStore.getState();

                // Start engine if not already live (cold start path)
                if (liveStore.engineStatus !== 'live') {
                    await liveStore.startEngine();
                    if (liveStore.engineStatus === 'error') {
                        throw new Error(`Engine start failed: ${liveStore.lastError}`);
                    }
                }

                const cortex = useCortexStore.getState().cortex;
                if (!cortex) {
                    throw new Error('Cortex not available after engine start');
                }

                // Wait for first evolution cycle (max 15s passive wait)
                const waitStart = Date.now();
                const passiveWait = 15_000;
                let hasChampion = false;

                while (Date.now() - waitStart < passiveWait) {
                    const snapshot = cortex.getSnapshot();
                    if (snapshot.globalBestFitness > 0) {
                        hasChampion = true;
                        break;
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }

                // Force evolution from historical seed if no champion yet
                if (!hasChampion) {
                    tsoLog.info('🧬 No champion found — forcing evolution from historical data...');

                    const islands = cortex.getSnapshot().islands;
                    for (const islandSnapshot of islands) {
                        const island = cortex.getIsland(islandSnapshot.slotId);
                        if (island) {
                            try {
                                island.evolve();
                                this.evolutionCycles++;
                                tsoLog.info(`🧬 Forced evolution on ${islandSnapshot.slotId}`, {
                                    bestFitness: island.getSnapshot().bestFitnessAllTime,
                                });
                            } catch (err) {
                                tsoLog.warn(`Evolution failed for ${islandSnapshot.slotId}`, {
                                    error: err instanceof Error ? err.message : 'Unknown',
                                });
                            }
                        }
                    }

                    // Verify champion exists after forced evolution
                    const postSnapshot = cortex.getSnapshot();
                    hasChampion = postSnapshot.globalBestFitness > 0;
                }

                tsoLog.info('✅ Evolution phase complete', {
                    hasChampion,
                    bestFitness: cortex.getSnapshot().globalBestFitness,
                });
            });

            // ─── Phase 4: TRADE ─────────────────────────────
            await this.runPhase('TRADE', async () => {
                const liveStore = useCortexLiveStore.getState();

                // ALWAYS enable auto-trade — the executor handles dryRun internally
                // (LiveTradeExecutor.evaluateAndExecute checks config.dryRun at line 169)
                liveStore.setAutoTrade(true);

                if (this.config!.dryRun) {
                    tsoLog.info('🔸 Auto-trade ENABLED in DRY RUN mode — signals evaluated, no orders placed');
                } else {
                    tsoLog.info('🔥 Auto-trade ENABLED — live testnet orders active');
                }

                // Set session duration timer
                if (this.config!.maxDurationMinutes > 0) {
                    const durationMs = this.config!.maxDurationMinutes * 60 * 1000;
                    this.durationTimer = setTimeout(() => {
                        tsoLog.warn('⏰ Session duration limit reached — auto-stopping');
                        this.stopSession('Duration limit reached').catch(err => {
                            tsoLog.error('Auto-stop failed', {
                                error: err instanceof Error ? err.message : 'Unknown',
                            });
                        });
                    }, durationMs);
                }

                // Start monitoring interval (check safety interlocks every 10s)
                this.monitorInterval = setInterval(() => {
                    this.checkSafetyInterlocks();
                }, 10_000);

                tsoLog.info('✅ Trade phase active — monitoring engaged');
            });

            return this.getSessionState();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.phase = 'ERROR';
            this.lastError = msg;
            tsoLog.error('❌ Session failed', { error: msg, phase: this.phase });
            return this.getSessionState();
        }
    }

    /**
     * Stop the current session gracefully.
     * Disables auto-trade, generates report, transitions to STOPPED.
     */
    async stopSession(reason: string = 'User requested'): Promise<SessionReport | null> {
        if (this.phase === 'IDLE' || this.phase === 'STOPPED') {
            return this.report;
        }

        tsoLog.info('🛑 Session stopping', { reason });

        // Clear timers
        if (this.durationTimer) {
            clearTimeout(this.durationTimer);
            this.durationTimer = null;
        }
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        // Disable auto-trade
        const liveStore = useCortexLiveStore.getState();
        if (liveStore.engine) {
            liveStore.setAutoTrade(false);
        }

        // Generate report
        await this.runPhase('REPORT', async () => {
            this.report = this.generateReport(reason);
            tsoLog.info('📊 Session report generated', {
                trades: this.report.totalTrades,
                pnl: `${this.report.totalPnlPercent.toFixed(2)}%`,
                duration: `${Math.round(this.report.durationMs / 1000)}s`,
            });
        });

        // Only stop engine if this session started it (cold start)
        // If engine was pre-booted via Ignite, leave it running
        if (!this.engineWasPreBooted) {
            liveStore.stopEngine();
            tsoLog.info('Engine stopped (cold start session)');
        } else {
            tsoLog.info('Engine preserved (Ignite pre-boot)');
        }

        this.phase = 'STOPPED';
        return this.report;
    }

    /**
     * Get current session state for dashboard / API.
     */
    getSessionState(): SessionState {
        const liveStore = useCortexLiveStore.getState();
        const executor = liveStore.engine?.getTradeExecutor();
        const openPositions = executor?.getActivePositionCount() ?? 0;

        return {
            phase: this.phase,
            sessionId: this.sessionId,
            startTime: this.startTime,
            elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
            config: this.config,
            probeResult: this.phaseLog,
            seedProgress: liveStore.seedProgress ?? null,
            tradeCount: this.trades.length,
            openPositions,
            cumulativePnl: this.trades
                .filter(t => t.pnlPercent !== null)
                .reduce((sum, t) => sum + (t.pnlPercent ?? 0), 0),
            lastError: this.lastError,
            report: this.report,
        };
    }

    /**
     * Check if a session is currently active.
     */
    isActive(): boolean {
        return this.phase === 'TRADE' || this.phase === 'EVOLVE' || this.phase === 'SEED';
    }

    // ─── Private ────────────────────────────────────────────

    private async runPhase(phase: SessionPhase, fn: () => Promise<void>): Promise<void> {
        const phaseStart = Date.now();
        this.phase = phase;
        tsoLog.info(`📌 Phase: ${phase}`);

        try {
            await fn();
        } catch (error) {
            throw error; // Re-throw — handled by startSession
        } finally {
            this.phaseTimings.push({
                phase,
                startTime: phaseStart,
                endTime: Date.now(),
                durationMs: Date.now() - phaseStart,
            });
        }
    }

    private checkSafetyInterlocks(): void {
        if (this.phase !== 'TRADE' || !this.config) return;

        // Check max cumulative loss
        const cumulativePnl = this.trades
            .filter(t => t.pnlPercent !== null)
            .reduce((sum, t) => sum + (t.pnlPercent ?? 0), 0);

        if (cumulativePnl < this.config.maxLossPercent) {
            tsoLog.warn('🚨 Max loss limit breached — emergency stop', {
                cumulativePnl: `${cumulativePnl.toFixed(2)}%`,
                limit: `${this.config.maxLossPercent}%`,
            });
            this.stopSession(`Max loss limit breached: ${cumulativePnl.toFixed(2)}%`).catch(err => {
                tsoLog.error('Emergency stop failed', {
                    error: err instanceof Error ? err.message : 'Unknown',
                });
            });
        }

        // Check max positions
        const executor = useCortexLiveStore.getState().engine?.getTradeExecutor();
        const openCount = executor?.getActivePositionCount() ?? 0;
        if (openCount > this.config.maxPositions) {
            tsoLog.warn('⚠️ Max positions exceeded', {
                open: openCount,
                max: this.config.maxPositions,
            });
        }
    }

    private generateReport(abortReason: string | null): SessionReport {
        const endTime = Date.now();
        const closedTrades = this.trades.filter(t => t.status === 'CLOSED');
        const pnls = closedTrades.map(t => t.pnlPercent ?? 0);
        const totalPnl = pnls.reduce((sum, p) => sum + p, 0);

        // Calculate max drawdown from cumulative PnL
        let peak = 0;
        let maxDD = 0;
        let cumulative = 0;
        for (const pnl of pnls) {
            cumulative += pnl;
            if (cumulative > peak) peak = cumulative;
            const dd = peak - cumulative;
            if (dd > maxDD) maxDD = dd;
        }

        // Get champion fitness
        const cortex = useCortexStore.getState().cortex;
        const championFitness = cortex?.getSnapshot().globalBestFitness ?? 0;

        return {
            sessionId: this.sessionId ?? 'unknown',
            startTime: this.startTime ?? endTime,
            endTime,
            durationMs: this.startTime ? endTime - this.startTime : 0,
            config: this.config ?? DEFAULT_SESSION_CONFIG,
            phases: [...this.phaseTimings],
            trades: [...this.trades],
            totalTrades: closedTrades.length,
            winningTrades: closedTrades.filter(t => (t.pnlPercent ?? 0) > 0).length,
            losingTrades: closedTrades.filter(t => (t.pnlPercent ?? 0) < 0).length,
            totalPnlPercent: Math.round(totalPnl * 100) / 100,
            maxDrawdownPercent: Math.round(maxDD * 100) / 100,
            bestTradePnl: pnls.length > 0 ? Math.max(...pnls) : 0,
            worstTradePnl: pnls.length > 0 ? Math.min(...pnls) : 0,
            candlesProcessed: this.candlesProcessed,
            evolutionCycles: this.evolutionCycles,
            finalChampionFitness: Math.round(championFitness * 10) / 10,
            abortReason: abortReason !== 'User requested' ? abortReason : null,
        };
    }
}

// ─── Singleton Instance ─────────────────────────────────────

let orchestratorInstance: TestnetSessionOrchestrator | null = null;

export function getSessionOrchestrator(): TestnetSessionOrchestrator {
    if (!orchestratorInstance) {
        orchestratorInstance = new TestnetSessionOrchestrator();
    }
    return orchestratorInstance;
}
