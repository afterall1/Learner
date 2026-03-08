// ============================================================
// Learner: Deployment Sentinel API — GET /api/sentinel
// ============================================================
// Phase 29 — Production Deployment Preparation
//
// Returns comprehensive 12-point deployment readiness report.
// Used for pre-deployment validation and monitoring dashboards.
// ============================================================

import { NextResponse } from 'next/server';
import { runDeploymentCheck } from '@/lib/config/deployment-sentinel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
    try {
        const report = await runDeploymentCheck();

        const httpStatus = report.overallStatus === 'unhealthy' ? 503 : 200;

        return NextResponse.json(report, {
            status: httpStatus,
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        return NextResponse.json(
            {
                overallStatus: 'unhealthy',
                error: error instanceof Error ? error.message : 'Sentinel check failed',
                timestamp: new Date().toISOString(),
                checks: [],
            },
            { status: 503 },
        );
    }
}
