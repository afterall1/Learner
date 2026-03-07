// ============================================================
// Learner: API Route — Binance Order Book Depth (Server-Side Proxy)
// ============================================================
// GET /api/binance/depth?symbol=BTCUSDT&limit=10
// Supported limits: 5, 10, 20, 50, 100
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { BinanceRestClient, BinanceApiError } from '@/lib/api/binance-rest';

const VALID_LIMITS = [5, 10, 20, 50, 100] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const symbol = searchParams.get('symbol');
        const limitParam = parseInt(searchParams.get('limit') ?? '10', 10);

        if (!symbol) {
            return NextResponse.json(
                { error: 'Missing required parameter: symbol' },
                { status: 400 },
            );
        }

        // Validate and normalize limit
        const limit = VALID_LIMITS.includes(limitParam as typeof VALID_LIMITS[number])
            ? (limitParam as typeof VALID_LIMITS[number])
            : 10;

        const client = new BinanceRestClient();
        const depth = await client.getOrderBook(symbol, limit);
        client.destroy();

        return NextResponse.json(depth);
    } catch (error) {
        if (error instanceof BinanceApiError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.statusCode },
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/depth] Error:', message);
        return NextResponse.json(
            { error: `Failed to fetch order book: ${message}` },
            { status: 500 },
        );
    }
}
