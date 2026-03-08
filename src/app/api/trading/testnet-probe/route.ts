// ============================================================
// Learner: API Route — Testnet Connectivity Probe
// ============================================================
// GET /api/trading/testnet-probe
//
// Phase 31: Pre-flight testnet connectivity check.
// Verifies REST reachability, account access, balance,
// server time sync, and trading configuration readiness.
//
// MUST be called before starting a live testnet session.
// Returns a structured readiness report.
// ============================================================

import { NextResponse } from 'next/server';
import { BinanceRestClient, BinanceApiError } from '@/lib/api/binance-rest';
import { createLogger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const probeLog = createLogger('TestnetProbe');

// ─── Types ──────────────────────────────────────────────────

interface ProbeCheck {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    latencyMs: number;
    details: string;
}

interface TestnetProbeResult {
    ready: boolean;
    isTestnet: boolean;
    checks: ProbeCheck[];
    account: {
        walletBalance: number;
        availableBalance: number;
        unrealizedPnl: number;
        openPositions: number;
    } | null;
    serverTimeDrift: number;
    totalLatencyMs: number;
    timestamp: number;
}

// ─── Handler ────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
    const overallStart = performance.now();
    const checks: ProbeCheck[] = [];
    let account: TestnetProbeResult['account'] = null;
    let serverTimeDrift = 0;
    let allPassed = true;

    const client = new BinanceRestClient();

    try {
        // ─── Check 1: Credentials configured ────────────────

        const credStart = performance.now();
        const hasCreds = client.hasCredentials();
        const isTestnet = client.isTestnet();
        checks.push({
            name: 'credentials',
            status: hasCreds ? 'pass' : 'fail',
            latencyMs: Math.round(performance.now() - credStart),
            details: hasCreds
                ? `API keys configured, testnet=${isTestnet}`
                : 'Missing BINANCE_API_KEY or BINANCE_API_SECRET in .env.local',
        });
        if (!hasCreds) allPassed = false;

        // ─── Check 2: Testnet mode verification ─────────────

        checks.push({
            name: 'testnet_mode',
            status: isTestnet ? 'pass' : 'fail',
            latencyMs: 0,
            details: isTestnet
                ? 'BINANCE_TESTNET=true — safe for paper trading'
                : '⚠️ BINANCE_TESTNET=false — LIVE TRADING MODE! DO NOT PROCEED!',
        });
        if (!isTestnet) allPassed = false;

        // ─── Check 3: REST API reachability (ticker) ────────

        const tickerStart = performance.now();
        try {
            await client.getLatestPrice('BTCUSDT');
            checks.push({
                name: 'rest_api_reachable',
                status: 'pass',
                latencyMs: Math.round(performance.now() - tickerStart),
                details: 'Binance REST API responding — BTCUSDT price fetched',
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown';
            checks.push({
                name: 'rest_api_reachable',
                status: 'fail',
                latencyMs: Math.round(performance.now() - tickerStart),
                details: `REST API unreachable: ${msg}`,
            });
            allPassed = false;
        }

        // ─── Check 4: Server time sync ──────────────────────

        const timeStart = performance.now();
        try {
            const response = await fetch(
                isTestnet
                    ? 'https://testnet.binancefuture.com/fapi/v1/time'
                    : 'https://fapi.binance.com/fapi/v1/time',
            );
            const data = await response.json();
            const serverTime = data.serverTime as number;
            serverTimeDrift = Math.abs(Date.now() - serverTime);
            const driftOK = serverTimeDrift < 1500; // 1.5s tolerance

            checks.push({
                name: 'server_time_sync',
                status: driftOK ? 'pass' : 'warn',
                latencyMs: Math.round(performance.now() - timeStart),
                details: `Server time drift: ${serverTimeDrift}ms ${driftOK ? '(OK)' : '(WARNING: high drift may cause signing errors)'}`,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown';
            checks.push({
                name: 'server_time_sync',
                status: 'fail',
                latencyMs: Math.round(performance.now() - timeStart),
                details: `Time sync failed: ${msg}`,
            });
            allPassed = false;
        }

        // ─── Check 5: Account access ───────────────────────

        if (hasCreds) {
            const accountStart = performance.now();
            try {
                const info = await client.getAccountInfo();
                account = {
                    walletBalance: info.totalWalletBalance,
                    availableBalance: info.availableBalance,
                    unrealizedPnl: info.totalUnrealizedProfit,
                    openPositions: info.positions.filter(p => p.positionAmt !== 0).length,
                };

                const hasBalance = info.availableBalance > 0;
                checks.push({
                    name: 'account_access',
                    status: hasBalance ? 'pass' : 'warn',
                    latencyMs: Math.round(performance.now() - accountStart),
                    details: hasBalance
                        ? `Wallet: $${info.totalWalletBalance.toFixed(2)}, Available: $${info.availableBalance.toFixed(2)}, Positions: ${account.openPositions}`
                        : `Account accessible but zero balance — request testnet funds from faucet`,
                });
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown';
                const isAuth = error instanceof BinanceApiError && (error.code === -2015 || error.code === -1022);
                checks.push({
                    name: 'account_access',
                    status: 'fail',
                    latencyMs: Math.round(performance.now() - accountStart),
                    details: isAuth
                        ? `Authentication failed — check API key/secret: ${msg}`
                        : `Account fetch failed: ${msg}`,
                });
                allPassed = false;
            }
        }

        // ─── Check 6: Exchange info (trading rules) ─────────

        const infoStart = performance.now();
        try {
            const symbols = await client.getExchangeInfo();
            const btcSymbol = symbols.find(s => s.symbol === 'BTCUSDT');
            checks.push({
                name: 'exchange_info',
                status: btcSymbol ? 'pass' : 'warn',
                latencyMs: Math.round(performance.now() - infoStart),
                details: btcSymbol
                    ? `${symbols.length} symbols loaded, BTCUSDT found`
                    : `${symbols.length} symbols loaded, BTCUSDT NOT found`,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown';
            checks.push({
                name: 'exchange_info',
                status: 'fail',
                latencyMs: Math.round(performance.now() - infoStart),
                details: `Exchange info fetch failed: ${msg}`,
            });
            allPassed = false;
        }

        const totalLatencyMs = Math.round(performance.now() - overallStart);

        const passed = checks.filter(c => c.status === 'pass').length;
        const total = checks.length;
        probeLog.info(`Probe complete: ${passed}/${total} passed`, {
            ready: allPassed,
            totalLatencyMs,
        });

        const result: TestnetProbeResult = {
            ready: allPassed,
            isTestnet: client.isTestnet(),
            checks,
            account,
            serverTimeDrift,
            totalLatencyMs,
            timestamp: Date.now(),
        };

        return NextResponse.json(result, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        probeLog.error('Probe failed unexpectedly', { error: message });

        return NextResponse.json(
            { error: `Testnet probe failed: ${message}`, timestamp: Date.now() },
            { status: 500 },
        );
    } finally {
        client.destroy();
    }
}
