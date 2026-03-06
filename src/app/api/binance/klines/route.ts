// ============================================================
// Learner: API Route — Binance Klines (Server-Side Proxy)
// ============================================================
// GET /api/binance/klines?symbol=BTCUSDT&interval=1h&limit=500
// Proxies to Binance REST API. Keeps API keys server-side only.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { BinanceRestClient, BinanceApiError } from '@/lib/api/binance-rest';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const symbol = searchParams.get('symbol');
        const interval = searchParams.get('interval') ?? '1h';
        const limit = parseInt(searchParams.get('limit') ?? '500', 10);
        const startTime = searchParams.get('startTime');
        const endTime = searchParams.get('endTime');

        if (!symbol) {
            return NextResponse.json(
                { error: 'Missing required parameter: symbol' },
                { status: 400 },
            );
        }

        const client = new BinanceRestClient();
        const klines = await client.getKlines(
            symbol,
            interval,
            Math.min(limit, 1500),
            startTime ? parseInt(startTime, 10) : undefined,
            endTime ? parseInt(endTime, 10) : undefined,
        );

        client.destroy();

        return NextResponse.json({
            symbol: symbol.toUpperCase(),
            interval,
            count: klines.length,
            klines,
        });
    } catch (error) {
        if (error instanceof BinanceApiError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.statusCode },
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/klines] Error:', message);
        return NextResponse.json(
            { error: `Failed to fetch klines: ${message}` },
            { status: 500 },
        );
    }
}
