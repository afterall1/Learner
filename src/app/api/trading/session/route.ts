// ============================================================
// Learner: API Route — Trading Session Control
// ============================================================
// POST   /api/trading/session — Start a testnet session
// GET    /api/trading/session — Get session status
// DELETE /api/trading/session — Stop session gracefully
//
// Phase 31: Server-side session lifecycle management.
// Wires into TestnetSessionOrchestrator for 5-phase control.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
    getSessionOrchestrator,
    type SessionConfig,
} from '@/lib/engine/testnet-session-orchestrator';
import { Timeframe } from '@/types';
import { createLogger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sessionLog = createLogger('SessionAPI');

// ─── POST: Start Session ────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const body = await request.json().catch(() => ({}));

        // Validate and parse config
        const config: Partial<SessionConfig> = {};

        if (body.pairs && Array.isArray(body.pairs)) {
            config.pairs = body.pairs.filter((p: unknown): p is string => typeof p === 'string');
        }

        if (body.timeframe && typeof body.timeframe === 'string') {
            const validTimeframes = Object.values(Timeframe);
            if (validTimeframes.includes(body.timeframe as Timeframe)) {
                config.timeframe = body.timeframe as Timeframe;
            }
        }

        if (typeof body.capitalPerSlot === 'number' && body.capitalPerSlot > 0) {
            config.capitalPerSlot = body.capitalPerSlot;
        }

        if (typeof body.dryRun === 'boolean') {
            config.dryRun = body.dryRun;
        }

        if (typeof body.maxDurationMinutes === 'number' && body.maxDurationMinutes >= 0) {
            config.maxDurationMinutes = body.maxDurationMinutes;
        }

        if (typeof body.maxLossPercent === 'number') {
            config.maxLossPercent = Math.min(0, body.maxLossPercent); // Must be negative
        }

        if (typeof body.maxPositions === 'number' && body.maxPositions > 0) {
            config.maxPositions = Math.floor(body.maxPositions);
        }

        sessionLog.info('Session start requested', { config });

        const orchestrator = getSessionOrchestrator();
        const state = await orchestrator.startSession(config);

        const statusCode = state.phase === 'ERROR' ? 500 : 200;

        return NextResponse.json({
            success: state.phase !== 'ERROR',
            sessionId: state.sessionId,
            phase: state.phase,
            state,
        }, {
            status: statusCode,
            headers: {
                'Cache-Control': 'no-store',
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sessionLog.error('Session start failed', { error: message });

        return NextResponse.json(
            { error: `Failed to start session: ${message}`, timestamp: Date.now() },
            { status: 500 },
        );
    }
}

// ─── GET: Session Status ────────────────────────────────────

export async function GET(): Promise<NextResponse> {
    try {
        const orchestrator = getSessionOrchestrator();
        const state = orchestrator.getSessionState();

        return NextResponse.json(state, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `Failed to get session: ${message}`, timestamp: Date.now() },
            { status: 500 },
        );
    }
}

// ─── DELETE: Stop Session ───────────────────────────────────

export async function DELETE(): Promise<NextResponse> {
    try {
        const orchestrator = getSessionOrchestrator();

        if (!orchestrator.isActive()) {
            return NextResponse.json({
                success: true,
                message: 'No active session to stop',
                phase: orchestrator.getSessionState().phase,
            }, { status: 200 });
        }

        sessionLog.info('Session stop requested');

        const report = await orchestrator.stopSession('API DELETE request');

        return NextResponse.json({
            success: true,
            message: 'Session stopped gracefully',
            report,
        }, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store',
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sessionLog.error('Session stop failed', { error: message });

        return NextResponse.json(
            { error: `Failed to stop session: ${message}`, timestamp: Date.now() },
            { status: 500 },
        );
    }
}
