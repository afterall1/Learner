// ============================================================
// Learner: API Route — Binance Ticker (Server-Side Proxy)
// ============================================================
// GET /api/binance/ticker?symbol=BTCUSDT
// GET /api/binance/ticker (returns all symbols)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { BinanceRestClient, BinanceApiError } from '@/lib/api/binance-rest';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const symbol = searchParams.get('symbol') ?? undefined;

        const client = new BinanceRestClient();
        const ticker = await client.get24hrTicker(symbol);
        client.destroy();

        return NextResponse.json({ ticker });
    } catch (error) {
        if (error instanceof BinanceApiError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.statusCode },
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/ticker] Error:', message);
        return NextResponse.json(
            { error: `Failed to fetch ticker: ${message}` },
            { status: 500 },
        );
    }
}
