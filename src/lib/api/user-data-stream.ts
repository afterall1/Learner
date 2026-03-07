// ============================================================
// Learner: User Data WebSocket Stream — Real-Time Account Events
// ============================================================
// Connects to Binance Futures User Data Stream for:
//   - ACCOUNT_UPDATE → balance + position changes
//   - ORDER_TRADE_UPDATE → order fills, cancellations
//   - MARGIN_CALL → emergency margin warning
//
// Listen Key lifecycle:
//   1. POST /fapi/v1/listenKey → obtain key
//   2. PUT  /fapi/v1/listenKey → keep alive (30min intervals)
//   3. Connect WebSocket with listen key
//   4. DELETE /fapi/v1/listenKey → cleanup on disconnect
// ============================================================

import type {
    UserDataAccountUpdate,
    UserDataOrderUpdate,
    UserDataMarginCall,
    UserDataEvent,
    OrderSide,
    OrderType,
    OrderStatus,
    ConnectionStatus,
} from '@/types';

// ─── Callback Types ─────────────────────────────────────────

type AccountUpdateCallback = (update: UserDataAccountUpdate) => void;
type OrderUpdateCallback = (update: UserDataOrderUpdate) => void;
type MarginCallCallback = (call: UserDataMarginCall) => void;
type StatusChangeCallback = (status: ConnectionStatus) => void;
type ErrorCallback = (error: string) => void;

// ─── Configuration ──────────────────────────────────────────

interface UserDataStreamConfig {
    baseRestUrl: string;         // For listenKey management
    baseWsUrl: string;           // For WebSocket connection
    apiKey: string;              // Required for listenKey endpoints
    keepAliveIntervalMs: number; // 30 minutes default
    reconnectDelayMs: number;    // Initial reconnect delay
    maxReconnectDelayMs: number; // Max delay cap
    maxReconnectAttempts: number;
}

const DEFAULT_CONFIG: UserDataStreamConfig = {
    baseRestUrl: 'https://testnet.binancefuture.com',
    baseWsUrl: 'wss://stream.binancefuture.com/ws',
    apiKey: '',
    keepAliveIntervalMs: 30 * 60 * 1000,  // 30 minutes
    reconnectDelayMs: 1000,
    maxReconnectDelayMs: 30000,
    maxReconnectAttempts: 10,
};

// ─── User Data Stream Manager ───────────────────────────────

export class UserDataStream {
    private config: UserDataStreamConfig;
    private ws: WebSocket | null = null;
    private listenKey: string | null = null;
    private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private status: ConnectionStatus = 'DISCONNECTED' as ConnectionStatus;
    private isManualDisconnect = false;

    // Callbacks
    private onAccountUpdate: AccountUpdateCallback | null = null;
    private onOrderUpdate: OrderUpdateCallback | null = null;
    private onMarginCall: MarginCallCallback | null = null;
    private onStatusChange: StatusChangeCallback | null = null;
    private onError: ErrorCallback | null = null;

    constructor(config: Partial<UserDataStreamConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ─── Callback Registration ──────────────────────────────

    setAccountUpdateCallback(cb: AccountUpdateCallback): void {
        this.onAccountUpdate = cb;
    }

    setOrderUpdateCallback(cb: OrderUpdateCallback): void {
        this.onOrderUpdate = cb;
    }

    setMarginCallCallback(cb: MarginCallCallback): void {
        this.onMarginCall = cb;
    }

    setStatusChangeCallback(cb: StatusChangeCallback): void {
        this.onStatusChange = cb;
    }

    setErrorCallback(cb: ErrorCallback): void {
        this.onError = cb;
    }

    // ─── Lifecycle ──────────────────────────────────────────

    /**
     * Start the user data stream:
     * 1. Obtain listen key from REST API
     * 2. Connect WebSocket
     * 3. Start keep-alive timer
     */
    async start(): Promise<void> {
        if (!this.config.apiKey) {
            this.emitError('API key required for user data stream');
            return;
        }

        this.isManualDisconnect = false;
        this.setStatus('CONNECTING' as ConnectionStatus);

        try {
            this.listenKey = await this.createListenKey();
            if (!this.listenKey) {
                this.emitError('Failed to obtain listen key');
                this.setStatus('DISCONNECTED' as ConnectionStatus);
                return;
            }

            this.connectWebSocket();
            this.startKeepAlive();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.emitError(`Failed to start user data stream: ${msg}`);
            this.setStatus('DISCONNECTED' as ConnectionStatus);
        }
    }

    /**
     * Stop the user data stream and clean up all resources.
     */
    async stop(): Promise<void> {
        this.isManualDisconnect = true;
        this.stopKeepAlive();
        this.clearReconnectTimer();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        // Delete listen key from Binance
        if (this.listenKey) {
            try {
                await this.deleteListenKey();
            } catch {
                // Ignore errors during cleanup
            }
            this.listenKey = null;
        }

        this.reconnectAttempts = 0;
        this.setStatus('DISCONNECTED' as ConnectionStatus);
    }

    /**
     * Get current connection status.
     */
    getStatus(): ConnectionStatus {
        return this.status;
    }

    // ─── Listen Key Management ──────────────────────────────

    private async createListenKey(): Promise<string | null> {
        try {
            const response = await fetch(`${this.config.baseRestUrl}/fapi/v1/listenKey`, {
                method: 'POST',
                headers: {
                    'X-MBX-APIKEY': this.config.apiKey,
                },
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(`HTTP ${response.status}: ${data.msg ?? 'Failed'}`);
            }

            const data = await response.json();
            console.log('[UserDataStream] Listen key obtained');
            return data.listenKey;
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error('[UserDataStream] Failed to create listen key:', msg);
            return null;
        }
    }

    private async keepAliveListenKey(): Promise<boolean> {
        if (!this.listenKey) return false;

        try {
            const response = await fetch(`${this.config.baseRestUrl}/fapi/v1/listenKey`, {
                method: 'PUT',
                headers: {
                    'X-MBX-APIKEY': this.config.apiKey,
                },
            });

            if (!response.ok) {
                console.warn('[UserDataStream] Listen key keep-alive failed, renewing...');
                const newKey = await this.createListenKey();
                if (newKey && newKey !== this.listenKey) {
                    this.listenKey = newKey;
                    // Reconnect with new listen key
                    this.reconnectWithNewKey();
                }
                return !!newKey;
            }

            return true;
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error('[UserDataStream] Keep-alive error:', msg);
            return false;
        }
    }

    private async deleteListenKey(): Promise<void> {
        try {
            await fetch(`${this.config.baseRestUrl}/fapi/v1/listenKey`, {
                method: 'DELETE',
                headers: {
                    'X-MBX-APIKEY': this.config.apiKey,
                },
            });
            console.log('[UserDataStream] Listen key deleted');
        } catch {
            // Best-effort cleanup
        }
    }

    // ─── WebSocket Connection ───────────────────────────────

    private connectWebSocket(): void {
        if (!this.listenKey) return;

        const url = `${this.config.baseWsUrl}/${this.listenKey}`;

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('[UserDataStream] WebSocket connected');
                this.reconnectAttempts = 0;
                this.setStatus('CONNECTED' as ConnectionStatus);
            };

            this.ws.onmessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data as string);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('[UserDataStream] Message parse error:', error);
                }
            };

            this.ws.onerror = (event: Event) => {
                console.error('[UserDataStream] WebSocket error:', event);
                this.emitError('WebSocket connection error');
            };

            this.ws.onclose = (event: CloseEvent) => {
                console.warn(`[UserDataStream] WebSocket closed: code=${event.code} reason=${event.reason}`);

                if (!this.isManualDisconnect) {
                    this.scheduleReconnect();
                }
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error('[UserDataStream] Connection failed:', msg);
            this.scheduleReconnect();
        }
    }

    private reconnectWithNewKey(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectWebSocket();
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.error('[UserDataStream] Max reconnect attempts reached');
            this.setStatus('CIRCUIT_OPEN' as ConnectionStatus);
            this.emitError('Max reconnect attempts exhausted — manual restart required');
            return;
        }

        this.setStatus('RECONNECTING' as ConnectionStatus);

        const delay = Math.min(
            this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts),
            this.config.maxReconnectDelayMs,
        );

        this.reconnectAttempts++;
        console.log(`[UserDataStream] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        this.reconnectTimer = setTimeout(async () => {
            // Refresh listen key before reconnecting
            const newKey = await this.createListenKey();
            if (newKey) {
                this.listenKey = newKey;
                this.connectWebSocket();
            } else {
                this.scheduleReconnect();
            }
        }, delay);
    }

    // ─── Message Handler ────────────────────────────────────

    private handleMessage(data: Record<string, unknown>): void {
        const eventType = data.e as string;

        switch (eventType) {
            case 'ACCOUNT_UPDATE':
                this.handleAccountUpdate(data);
                break;

            case 'ORDER_TRADE_UPDATE':
                this.handleOrderUpdate(data);
                break;

            case 'MARGIN_CALL':
                this.handleMarginCall(data);
                break;

            case 'listenKeyExpired':
                console.warn('[UserDataStream] Listen key expired, reconnecting...');
                this.reconnectWithNewKey();
                break;

            default:
                console.log(`[UserDataStream] Unhandled event type: ${eventType}`);
        }
    }

    private handleAccountUpdate(raw: Record<string, unknown>): void {
        const accountData = raw.a as Record<string, unknown>;
        if (!accountData) return;

        const balances = (accountData.B as Array<Record<string, string>> ?? []).map(b => ({
            asset: b.a,
            walletBalance: parseFloat(b.wb),
            crossWalletBalance: parseFloat(b.cw),
            balanceChange: parseFloat(b.bc),
        }));

        const positions = (accountData.P as Array<Record<string, string>> ?? []).map(p => ({
            symbol: p.s,
            positionAmount: parseFloat(p.pa),
            entryPrice: parseFloat(p.ep),
            accumulatedRealized: parseFloat(p.cr),
            unrealizedPnl: parseFloat(p.up),
            marginType: (p.mt?.toLowerCase() ?? 'cross') as 'isolated' | 'cross',
            isolatedWallet: parseFloat(p.iw ?? '0'),
            positionSide: (p.ps ?? 'BOTH') as 'LONG' | 'SHORT' | 'BOTH',
        }));

        const event: UserDataAccountUpdate = {
            eventType: 'ACCOUNT_UPDATE',
            eventTime: Number(raw.E),
            balances,
            positions,
        };

        this.onAccountUpdate?.(event);
    }

    private handleOrderUpdate(raw: Record<string, unknown>): void {
        const orderData = raw.o as Record<string, string>;
        if (!orderData) return;

        const event: UserDataOrderUpdate = {
            eventType: 'ORDER_TRADE_UPDATE',
            eventTime: Number(raw.E),
            order: {
                symbol: orderData.s,
                clientOrderId: orderData.c,
                side: orderData.S as OrderSide,
                type: orderData.o as OrderType,
                timeInForce: orderData.f,
                origQty: parseFloat(orderData.q),
                origPrice: parseFloat(orderData.p),
                avgPrice: parseFloat(orderData.ap),
                stopPrice: parseFloat(orderData.sp ?? '0'),
                executionType: orderData.x as UserDataOrderUpdate['order']['executionType'],
                orderStatus: orderData.X as OrderStatus,
                orderId: parseInt(orderData.i, 10),
                lastFilledQty: parseFloat(orderData.l ?? '0'),
                filledAccumulatedQty: parseFloat(orderData.z ?? '0'),
                lastFilledPrice: parseFloat(orderData.L ?? '0'),
                commissionAsset: orderData.N ?? 'USDT',
                commission: parseFloat(orderData.n ?? '0'),
                tradeTime: parseInt(orderData.T, 10),
                tradeId: parseInt(orderData.t ?? '0', 10),
                realizedProfit: parseFloat(orderData.rp ?? '0'),
                reduceOnly: orderData.R === 'true',
                positionSide: (orderData.ps ?? 'BOTH') as 'LONG' | 'SHORT' | 'BOTH',
            },
        };

        this.onOrderUpdate?.(event);
    }

    private handleMarginCall(raw: Record<string, unknown>): void {
        const positions = (raw.p as Array<Record<string, string>> ?? []).map(p => ({
            symbol: p.s,
            positionSide: (p.ps ?? 'BOTH') as 'LONG' | 'SHORT' | 'BOTH',
            positionAmount: parseFloat(p.pa),
            marginType: (p.mt?.toLowerCase() ?? 'cross') as 'isolated' | 'cross',
            isolatedWallet: parseFloat(p.iw ?? '0'),
            markPrice: parseFloat(p.mp),
            unrealizedPnl: parseFloat(p.up),
            maintenanceMarginRequired: parseFloat(p.mm),
        }));

        const event: UserDataMarginCall = {
            eventType: 'MARGIN_CALL',
            eventTime: Number(raw.E),
            crossWalletBalance: parseFloat(String(raw.cw ?? '0')),
            positions,
        };

        console.error('[UserDataStream] ⚠️ MARGIN CALL received!', event);
        this.onMarginCall?.(event);
    }

    // ─── Internal Helpers ───────────────────────────────────

    private startKeepAlive(): void {
        this.stopKeepAlive();
        this.keepAliveTimer = setInterval(() => {
            this.keepAliveListenKey();
        }, this.config.keepAliveIntervalMs);
    }

    private stopKeepAlive(): void {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private setStatus(status: ConnectionStatus): void {
        if (this.status !== status) {
            this.status = status;
            this.onStatusChange?.(status);
        }
    }

    private emitError(message: string): void {
        console.error(`[UserDataStream] ${message}`);
        this.onError?.(message);
    }
}
