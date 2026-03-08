// ============================================================
// Learner: Production Heartbeat Monitor (PHM)
// ============================================================
// Phase 26 RADICAL INNOVATION: Standard Next.js apps have zero
// built-in production observability. When WebSocket disconnects,
// API rate limits hit, or env vars are invalid — silence. Nothing
// alerts you until the dashboard breaks.
//
// PHM provides:
//   1. In-memory metrics collection (latency, errors, uptime)
//   2. /api/health endpoint returning comprehensive JSON
//   3. Self-healing: detects degraded subsystems
//
// Zero external dependencies. Pure TypeScript. Production-grade.
// ============================================================

// ─── Subsystem Status ───────────────────────────────────────

export type SubsystemHealth = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface SubsystemStatus {
    name: string;
    status: SubsystemHealth;
    lastCheckAt: number;
    latencyMs: number | null;
    errorCount: number;
    consecutiveErrors: number;
    message: string;
    metadata: Record<string, string | number | boolean>;
}

export interface HealthReport {
    status: SubsystemHealth;
    timestamp: number;
    uptimeMs: number;
    version: string;
    environment: string;
    subsystems: SubsystemStatus[];
    metrics: RuntimeMetrics;
}

export interface RuntimeMetrics {
    totalRequests: number;
    totalErrors: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    errorRate: number;
    memoryUsageMB: number;
    uptimeSeconds: number;
}

// ─── Latency Ring Buffer ────────────────────────────────────

class LatencyBuffer {
    private buffer: number[];
    private index: number = 0;
    private count: number = 0;

    constructor(private readonly capacity: number = 1000) {
        this.buffer = new Array(capacity).fill(0);
    }

    push(latencyMs: number): void {
        this.buffer[this.index] = latencyMs;
        this.index = (this.index + 1) % this.capacity;
        if (this.count < this.capacity) this.count++;
    }

    getAverage(): number {
        if (this.count === 0) return 0;
        let sum = 0;
        for (let i = 0; i < this.count; i++) {
            sum += this.buffer[i];
        }
        return Math.round(sum / this.count);
    }

    getP95(): number {
        if (this.count === 0) return 0;
        const sorted = this.buffer.slice(0, this.count).sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * 0.95);
        return sorted[idx] ?? 0;
    }

    getCount(): number {
        return this.count;
    }
}

// ─── Heartbeat Monitor ──────────────────────────────────────

class HeartbeatMonitor {
    private subsystems = new Map<string, SubsystemStatus>();
    private startedAt: number;
    private latencyBuffer: LatencyBuffer;
    private totalRequests: number = 0;
    private totalErrors: number = 0;

    constructor() {
        this.startedAt = Date.now();
        this.latencyBuffer = new LatencyBuffer(2000);
    }

    // ─── Subsystem Registration ─────────────────────────

    /**
     * Register a subsystem for health tracking.
     */
    registerSubsystem(name: string, metadata: Record<string, string | number | boolean> = {}): void {
        this.subsystems.set(name, {
            name,
            status: 'unknown',
            lastCheckAt: 0,
            latencyMs: null,
            errorCount: 0,
            consecutiveErrors: 0,
            message: 'Not yet checked',
            metadata,
        });
    }

    /**
     * Report a successful subsystem check.
     */
    reportHealthy(name: string, latencyMs: number, message: string = 'OK'): void {
        const sub = this.subsystems.get(name);
        if (!sub) return;

        sub.status = 'healthy';
        sub.lastCheckAt = Date.now();
        sub.latencyMs = latencyMs;
        sub.consecutiveErrors = 0;
        sub.message = message;

        this.totalRequests++;
        this.latencyBuffer.push(latencyMs);
    }

    /**
     * Report a subsystem error.
     */
    reportError(name: string, errorMessage: string): void {
        const sub = this.subsystems.get(name);
        if (!sub) return;

        sub.lastCheckAt = Date.now();
        sub.errorCount++;
        sub.consecutiveErrors++;
        sub.message = errorMessage;
        sub.latencyMs = null;

        // Auto-degrade: 3 consecutive errors = degraded, 10 = critical
        if (sub.consecutiveErrors >= 10) {
            sub.status = 'critical';
        } else if (sub.consecutiveErrors >= 3) {
            sub.status = 'degraded';
        }

        this.totalRequests++;
        this.totalErrors++;
    }

    /**
     * Report a latency measurement (for general API tracking).
     */
    recordLatency(latencyMs: number): void {
        this.totalRequests++;
        this.latencyBuffer.push(latencyMs);
    }

    /**
     * Record an error (general, not subsystem-specific).
     */
    recordError(): void {
        this.totalRequests++;
        this.totalErrors++;
    }

    // ─── Health Report Generation ───────────────────────

    /**
     * Generate a comprehensive health report.
     */
    getReport(): HealthReport {
        const now = Date.now();
        const uptimeMs = now - this.startedAt;
        const subsystems = [...this.subsystems.values()];

        // Mark stale subsystems (no check in 5 minutes)
        const STALE_THRESHOLD_MS = 5 * 60 * 1000;
        for (const sub of subsystems) {
            if (sub.lastCheckAt > 0 && (now - sub.lastCheckAt) > STALE_THRESHOLD_MS) {
                sub.status = 'degraded';
                sub.message = `Stale: no check in ${Math.round((now - sub.lastCheckAt) / 1000)}s`;
            }
        }

        // Compute overall status: worst of all subsystems
        let overallStatus: SubsystemHealth = 'healthy';
        for (const sub of subsystems) {
            if (sub.status === 'critical') {
                overallStatus = 'critical';
                break;
            }
            if (sub.status === 'degraded') {
                overallStatus = 'degraded';
            }
            if (sub.status === 'unknown' && overallStatus === 'healthy') {
                overallStatus = 'unknown';
            }
        }

        // Memory usage
        let memoryMB = 0;
        if (typeof process !== 'undefined' && process.memoryUsage) {
            memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        }

        const metrics: RuntimeMetrics = {
            totalRequests: this.totalRequests,
            totalErrors: this.totalErrors,
            avgLatencyMs: this.latencyBuffer.getAverage(),
            p95LatencyMs: this.latencyBuffer.getP95(),
            errorRate: this.totalRequests > 0
                ? Math.round((this.totalErrors / this.totalRequests) * 10000) / 100
                : 0,
            memoryUsageMB: memoryMB,
            uptimeSeconds: Math.round(uptimeMs / 1000),
        };

        return {
            status: overallStatus,
            timestamp: now,
            uptimeMs,
            version: '0.1.0',
            environment: process.env.NODE_ENV ?? 'development',
            subsystems,
            metrics,
        };
    }

    /**
     * Reset all metrics (for testing).
     */
    reset(): void {
        this.subsystems.clear();
        this.totalRequests = 0;
        this.totalErrors = 0;
        this.startedAt = Date.now();
        this.latencyBuffer = new LatencyBuffer(2000);
    }
}

// ─── Singleton ──────────────────────────────────────────────

let globalMonitor: HeartbeatMonitor | null = null;

/**
 * Get the global heartbeat monitor instance.
 */
export function getHeartbeatMonitor(): HeartbeatMonitor {
    if (!globalMonitor) {
        globalMonitor = new HeartbeatMonitor();

        // Auto-register known subsystems
        globalMonitor.registerSubsystem('binance-rest', { type: 'api' });
        globalMonitor.registerSubsystem('binance-ws', { type: 'websocket' });
        globalMonitor.registerSubsystem('supabase', { type: 'database' });
        globalMonitor.registerSubsystem('overmind', { type: 'ai' });
        globalMonitor.registerSubsystem('evolution-engine', { type: 'engine' });
    }
    return globalMonitor;
}

/**
 * Reset the global monitor (for testing).
 */
export function resetHeartbeatMonitor(): void {
    if (globalMonitor) {
        globalMonitor.reset();
    }
    globalMonitor = null;
}
