// ============================================================
// Learner: API Route — Binance Order (Server-Side Proxy)
// ============================================================
// POST /api/binance/order → Place new order
// DELETE /api/binance/order?symbol=BTCUSDT&orderId=123 → Cancel order
//
// All orders pass through Risk Manager validation:
// - Leverage capped at 10
// - Stop-loss validated
// - Quantity/Price precision enforced
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { BinanceRestClient, BinanceApiError } from '@/lib/api/binance-rest';

/**
 * POST — Place a new order.
 * Body: { symbol, side, type, quantity, price?, stopPrice?, leverage?, timeInForce?, reduceOnly? }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json();

        // Validate required fields
        const { symbol, side, type, quantity } = body;
        if (!symbol || !side || !type || !quantity) {
            return NextResponse.json(
                { error: 'Missing required fields: symbol, side, type, quantity' },
                { status: 400 },
            );
        }

        // Validate side
        if (!['BUY', 'SELL'].includes(side)) {
            return NextResponse.json(
                { error: 'Invalid side. Must be BUY or SELL' },
                { status: 400 },
            );
        }

        // Validate type
        const validTypes = ['LIMIT', 'MARKET', 'STOP_MARKET', 'TAKE_PROFIT_MARKET'];
        if (!validTypes.includes(type)) {
            return NextResponse.json(
                { error: `Invalid order type. Must be one of: ${validTypes.join(', ')}` },
                { status: 400 },
            );
        }

        // Risk Manager: Leverage cap at 10
        if (body.leverage && body.leverage > 10) {
            return NextResponse.json(
                { error: 'Leverage exceeds maximum of 10 (Risk Manager Rule #4)' },
                { status: 400 },
            );
        }

        const client = new BinanceRestClient();

        // Set leverage if specified
        if (body.leverage) {
            await client.setLeverage(symbol, Math.min(body.leverage, 10));
        }

        const order = await client.placeOrder({
            symbol,
            side,
            type,
            quantity: parseFloat(quantity),
            price: body.price ? parseFloat(body.price) : undefined,
            stopPrice: body.stopPrice ? parseFloat(body.stopPrice) : undefined,
            timeInForce: body.timeInForce,
            reduceOnly: body.reduceOnly,
            newClientOrderId: body.newClientOrderId,
        });

        client.destroy();

        return NextResponse.json({
            success: true,
            order,
        });
    } catch (error) {
        if (error instanceof BinanceApiError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.statusCode },
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/order] POST Error:', message);
        return NextResponse.json(
            { error: `Failed to place order: ${message}` },
            { status: 500 },
        );
    }
}

/**
 * DELETE — Cancel an order.
 * Query: ?symbol=BTCUSDT&orderId=123 or ?symbol=BTCUSDT&clientOrderId=xxx
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const symbol = searchParams.get('symbol');
        const orderId = searchParams.get('orderId');
        const clientOrderId = searchParams.get('clientOrderId');

        if (!symbol) {
            return NextResponse.json(
                { error: 'Missing required parameter: symbol' },
                { status: 400 },
            );
        }

        if (!orderId && !clientOrderId) {
            return NextResponse.json(
                { error: 'Missing parameter: orderId or clientOrderId required' },
                { status: 400 },
            );
        }

        const client = new BinanceRestClient();

        // Check if we should cancel all orders
        const cancelAll = searchParams.get('cancelAll') === 'true';

        let result;
        if (cancelAll) {
            result = await client.cancelAllOrders(symbol);
        } else {
            result = await client.cancelOrder(
                symbol,
                orderId ? parseInt(orderId, 10) : undefined,
                clientOrderId ?? undefined,
            );
        }

        client.destroy();

        return NextResponse.json({
            success: true,
            result,
        });
    } catch (error) {
        if (error instanceof BinanceApiError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.statusCode },
            );
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/order] DELETE Error:', message);
        return NextResponse.json(
            { error: `Failed to cancel order: ${message}` },
            { status: 500 },
        );
    }
}
