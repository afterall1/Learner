// ============================================================
// Learner: API Route — Binance Position Risk (Server-Side Proxy)
// ============================================================
// GET /api/binance/position → All active positions
// GET /api/binance/position?symbol=BTCUSDT → Specific symbol
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { BinanceRestClient, BinanceApiError } from '@/lib/api/binance-rest';

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const symbol = searchParams.get('symbol') ?? undefined;

        const client = new BinanceRestClient();
        const positions = await client.getPositionRisk(symbol);
        client.destroy();

        return NextResponse.json({
            count: positions.length,
            positions,
        });
    } catch (error) {
        if (error instanceof BinanceApiError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.statusCode },
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/position] Error:', message);
        return NextResponse.json(
            { error: `Failed to fetch positions: ${message}` },
            { status: 500 },
        );
    }
}
