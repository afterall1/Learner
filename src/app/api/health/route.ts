// ============================================================
// Learner: API Route — Production Health Endpoint
// ============================================================
// GET /api/health — Returns comprehensive system health report
//
// Returns:
//   200 — System healthy
//   503 — System degraded or critical
//
// Consumed by: monitoring dashboards, uptime checks, load balancers
// ============================================================

import { NextResponse } from 'next/server';
import { getHeartbeatMonitor } from '@/lib/config/heartbeat-monitor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
    try {
        const monitor = getHeartbeatMonitor();
        const report = monitor.getReport();

        // Determine HTTP status: 200 for healthy/unknown, 503 for degraded/critical
        const httpStatus = (report.status === 'critical' || report.status === 'degraded')
            ? 503
            : 200;

        return NextResponse.json(report, {
            status: httpStatus,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API/health] Error generating health report:', message);

        return NextResponse.json(
            {
                status: 'critical',
                timestamp: Date.now(),
                error: `Health check failed: ${message}`,
                subsystems: [],
                metrics: {
                    totalRequests: 0,
                    totalErrors: 1,
                    avgLatencyMs: 0,
                    p95LatencyMs: 0,
                    errorRate: 100,
                    memoryUsageMB: 0,
                    uptimeSeconds: 0,
                },
            },
            { status: 503 },
        );
    }
}
