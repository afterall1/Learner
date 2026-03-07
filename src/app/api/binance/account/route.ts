// ============================================================
// Learner: API Route — Binance Account (Server-Side Proxy)
// ============================================================
// GET /api/binance/account → Account balances and positions
// ============================================================

import { NextResponse } from 'next/server';
import { BinanceRestClient, BinanceApiError } from '@/lib/api/binance-rest';

export async function GET(): Promise<NextResponse> {
    try {
        const client = new BinanceRestClient();

        if (!client.hasCredentials()) {
            return NextResponse.json(
                { error: 'API credentials not configured' },
                { status: 401 },
            );
        }

        const accountInfo = await client.getAccountInfo();
        client.destroy();

        return NextResponse.json({
            isTestnet: client.isTestnet(),
            account: accountInfo,
        });
    } catch (error) {
        if (error instanceof BinanceApiError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.statusCode },
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/account] Error:', message);
        return NextResponse.json(
            { error: `Failed to fetch account: ${message}` },
            { status: 500 },
        );
    }
}
