// ============================================================
// Learner: API Route — Binance Exchange Info (Server-Side Proxy)
// ============================================================
// GET /api/binance/exchange-info
// Cached for 1 hour (trading rules rarely change).
// ============================================================

import { NextResponse } from 'next/server';
import { BinanceRestClient, BinanceApiError } from '@/lib/api/binance-rest';
import { ExchangeSymbolInfo } from '@/types';

// ─── In-Memory Cache ─────────────────────────────────────────

let cachedInfo: ExchangeSymbolInfo[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(): Promise<NextResponse> {
    try {
        const now = Date.now();

        // Return cached data if fresh
        if (cachedInfo && (now - cacheTimestamp) < CACHE_TTL) {
            return NextResponse.json({
                symbols: cachedInfo,
                cached: true,
                cachedAt: cacheTimestamp,
            });
        }

        const client = new BinanceRestClient();
        const symbols = await client.getExchangeInfo();
        client.destroy();

        // Update cache
        cachedInfo = symbols;
        cacheTimestamp = now;

        return NextResponse.json({
            symbols,
            cached: false,
            cachedAt: cacheTimestamp,
        });
    } catch (error) {
        // If cache exists but API failed, return stale cache
        if (cachedInfo) {
            return NextResponse.json({
                symbols: cachedInfo,
                cached: true,
                stale: true,
                cachedAt: cacheTimestamp,
            });
        }

        if (error instanceof BinanceApiError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.statusCode },
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/exchange-info] Error:', message);
        return NextResponse.json(
            { error: `Failed to fetch exchange info: ${message}` },
            { status: 500 },
        );
    }
}
