// ============================================================
// Learner: Account Sync Service — Periodic Balance Monitoring
// ============================================================
// Polls Binance account state at configurable intervals.
// Provides a bridge between Binance REST API and Zustand stores.
//
// Features:
// - Throttled polling (default 30s) to avoid rate limits
// - Daily/Weekly PnL tracking from position history
// - Graceful degradation: keeps last known state on API failure
// - Circuit breaker integration for resilience
// ============================================================

import type {
    PositionInfo,
    ConnectionStatus,
} from '@/types';
import { BinanceRestClient } from './binance-rest';
import { ExchangeCircuitBreaker } from './exchange-circuit-breaker';

// ─── Types ──────────────────────────────────────────────────

export interface AccountSnapshot {
    totalWalletBalance: number;
    availableBalance: number;
    totalUnrealizedProfit: number;
    positions: PositionInfo[];
    timestamp: number;
}

export interface AccountSyncCallbacks {
    onBalanceUpdate: (snapshot: AccountSnapshot) => void;
    onPositionChange: (positions: PositionInfo[]) => void;
    onStatusChange: (status: ConnectionStatus) => void;
    onError: (message: string) => void;
}

interface AccountSyncConfig {
    pollIntervalMs: number;      // How often to poll (default: 30s)
    circuitBreaker: ExchangeCircuitBreaker | null;
}

const DEFAULT_SYNC_CONFIG: AccountSyncConfig = {
    pollIntervalMs: 30000,       // 30 seconds
    circuitBreaker: null,
};

// ─── Account Sync Service ───────────────────────────────────

export class AccountSyncService {
    private config: AccountSyncConfig;
    private client: BinanceRestClient;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private lastSnapshot: AccountSnapshot | null = null;
    private lastPositionHash = '';   // For change detection
    private callbacks: Partial<AccountSyncCallbacks> = {};
    private isRunning = false;

    constructor(
        client: BinanceRestClient,
        config: Partial<AccountSyncConfig> = {},
    ) {
        this.client = client;
        this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
    }

    // ─── Callback Registration ──────────────────────────────

    setCallbacks(callbacks: Partial<AccountSyncCallbacks>): void {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    // ─── Lifecycle ──────────────────────────────────────────

    /**
     * Start periodic account polling.
     */
    start(): void {
        if (this.isRunning) return;
        if (!this.client.hasCredentials()) {
            this.emitError('No API credentials — account sync disabled');
            return;
        }

        this.isRunning = true;
        this.emitStatus('CONNECTING' as ConnectionStatus);

        // Immediate first poll
        this.poll();

        // Start periodic polling
        this.pollTimer = setInterval(() => {
            this.poll();
        }, this.config.pollIntervalMs);

        console.log(`[AccountSync] Started (interval: ${this.config.pollIntervalMs / 1000}s)`);
    }

    /**
     * Stop polling and clean up.
     */
    stop(): void {
        this.isRunning = false;
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.emitStatus('DISCONNECTED' as ConnectionStatus);
        console.log('[AccountSync] Stopped');
    }

    /**
     * Force an immediate poll outside the schedule.
     */
    async forceSync(): Promise<AccountSnapshot | null> {
        return this.poll();
    }

    /**
     * Get the last known account snapshot.
     */
    getLastSnapshot(): AccountSnapshot | null {
        return this.lastSnapshot;
    }

    /**
     * Check if the service is currently running.
     */
    isActive(): boolean {
        return this.isRunning;
    }

    // ─── Internal: Poll Logic ───────────────────────────────

    private async poll(): Promise<AccountSnapshot | null> {
        const executeFn = async (): Promise<AccountSnapshot> => {
            // Fetch account info
            const accountInfo = await this.client.getAccountInfo();

            // Fetch position risk for detailed position data
            const positions = await this.client.getPositionRisk();

            const snapshot: AccountSnapshot = {
                totalWalletBalance: accountInfo.totalWalletBalance,
                availableBalance: accountInfo.availableBalance,
                totalUnrealizedProfit: accountInfo.totalUnrealizedProfit,
                positions,
                timestamp: Date.now(),
            };

            return snapshot;
        };

        try {
            let snapshot: AccountSnapshot;

            if (this.config.circuitBreaker) {
                snapshot = await this.config.circuitBreaker.execute(
                    executeFn,
                    'AccountSync.poll',
                );
            } else {
                snapshot = await executeFn();
            }

            // Detect position changes
            const positionHash = this.hashPositions(snapshot.positions);
            if (positionHash !== this.lastPositionHash) {
                this.lastPositionHash = positionHash;
                this.callbacks.onPositionChange?.(snapshot.positions);
            }

            this.lastSnapshot = snapshot;
            this.callbacks.onBalanceUpdate?.(snapshot);
            this.emitStatus('CONNECTED' as ConnectionStatus);

            return snapshot;
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error('[AccountSync] Poll failed:', msg);
            this.emitError(`Account sync failed: ${msg}`);

            // Keep last known state — graceful degradation
            if (this.lastSnapshot) {
                console.warn('[AccountSync] Using last known snapshot');
            }

            return null;
        }
    }

    /**
     * Generate a hash of positions for change detection.
     * Changes in position amount, entry price, or symbol trigger an update.
     */
    private hashPositions(positions: PositionInfo[]): string {
        return positions
            .map(p => `${p.symbol}:${p.positionAmt}:${p.entryPrice}`)
            .sort()
            .join('|');
    }

    private emitStatus(status: ConnectionStatus): void {
        this.callbacks.onStatusChange?.(status);
    }

    private emitError(message: string): void {
        console.error(`[AccountSync] ${message}`);
        this.callbacks.onError?.(message);
    }
}
