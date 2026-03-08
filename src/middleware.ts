// ============================================================
// Learner: Edge Middleware — Security & Request Tracing
// ============================================================
// Runs on every request at the edge. Provides:
//   1. X-Request-ID for distributed tracing
//   2. API route protection (same-origin CORS)
//   3. Mainnet safety guard for order endpoints
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
    const response = NextResponse.next();
    const { pathname } = request.nextUrl;

    // ─── 1. Request ID (all routes) ─────────────────────
    const requestId = crypto.randomUUID();
    response.headers.set('X-Request-ID', requestId);

    // ─── 2. API Route Protection ────────────────────────
    if (pathname.startsWith('/api/')) {
        // CORS: Restrict API to same-origin
        const origin = request.headers.get('origin');
        const host = request.headers.get('host');

        // Allow same-origin and server-side calls (no origin header)
        if (origin && host && !origin.includes(host)) {
            return new NextResponse(
                JSON.stringify({ error: 'CORS: Cross-origin requests not allowed' }),
                {
                    status: 403,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Request-ID': requestId,
                    },
                },
            );
        }

        // Set CORS headers for valid requests
        response.headers.set('Access-Control-Allow-Origin', origin ?? '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.headers.set('Access-Control-Max-Age', '86400');

        // Cache control for API routes — never cache
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        response.headers.set('Pragma', 'no-cache');
    }

    // ─── 3. Mainnet Safety Guard (Order Endpoints) ──────
    if (pathname === '/api/binance/order') {
        const isTestnet = process.env.BINANCE_TESTNET !== 'false';
        const mainnetConfirmed = process.env.CONFIRM_MAINNET_TRADING === 'true';

        if (!isTestnet && !mainnetConfirmed) {
            return new NextResponse(
                JSON.stringify({
                    error: 'Mainnet trading blocked: Set CONFIRM_MAINNET_TRADING=true to enable',
                    reason: 'Safety guard — prevents accidental mainnet order placement',
                }),
                {
                    status: 403,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Request-ID': requestId,
                    },
                },
            );
        }
    }

    return response;
}

// ─── Matcher: Apply to all routes except static assets ──────
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
