// ============================================================
// Learner: Execution Quality Tracker (AOLE Sub-Innovation 3)
// ============================================================
// Measures real fill quality vs expected for every order.
// Tracks slippage, latency, fill rates per symbol.
// Feeds data back to:
//   - market-simulator.ts (calibrate paper trade slippage)
//   - Trade Forensics Engine (execution attribution)
//   - Evolution Engine (penalize strategies with high slippage needs)
// ============================================================

import type {
    ExecutionRecord,
    ExecutionQualityStats,
    OrderSide,
} from '@/types';

// ─── Configuration ──────────────────────────────────────────

interface ExecutionQualityConfig {
    maxRecordsPerSymbol: number;    // Rolling window size (default: 100)
    stalenessThresholdMs: number;   // Records older than this are ignored (default: 24h)
}

const DEFAULT_EQ_CONFIG: ExecutionQualityConfig = {
    maxRecordsPerSymbol: 100,
    stalenessThresholdMs: 24 * 60 * 60 * 1000, // 24 hours
};

// ─── Execution Quality Tracker ──────────────────────────────

export class ExecutionQualityTracker {
    private records: Map<string, ExecutionRecord[]> = new Map(); // symbol → records
    private readonly config: ExecutionQualityConfig;

    constructor(config: Partial<ExecutionQualityConfig> = {}) {
        this.config = { ...DEFAULT_EQ_CONFIG, ...config };
    }

    /**
     * Record a new execution for quality tracking.
     */
    recordExecution(record: ExecutionRecord): void {
        const symbol = record.symbol.toUpperCase();

        if (!this.records.has(symbol)) {
            this.records.set(symbol, []);
        }

        const symbolRecords = this.records.get(symbol)!;
        symbolRecords.push(record);

        // Maintain rolling window
        while (symbolRecords.length > this.config.maxRecordsPerSymbol) {
            symbolRecords.shift();
        }

        // Prune stale records
        const cutoff = Date.now() - this.config.stalenessThresholdMs;
        const freshRecords = symbolRecords.filter(r => r.timestamp > cutoff);
        this.records.set(symbol, freshRecords);
    }

    /**
     * Create a record from order submission + fill data.
     */
    createRecord(params: {
        orderId: number;
        groupId: string;
        symbol: string;
        side: OrderSide;
        expectedPrice: number;
        fillPrice: number;
        origQty: number;
        executedQty: number;
        submissionTime: number;
        fillTime: number;
        spreadBps?: number;
    }): ExecutionRecord {
        const slippageBps = Math.abs(
            (params.fillPrice - params.expectedPrice) / params.expectedPrice
        ) * 10000;

        return {
            orderId: params.orderId,
            groupId: params.groupId,
            symbol: params.symbol.toUpperCase(),
            side: params.side,
            expectedPrice: params.expectedPrice,
            fillPrice: params.fillPrice,
            slippageBps,
            latencyMs: params.fillTime - params.submissionTime,
            orderBookSpreadBps: params.spreadBps ?? 0,
            fillRatio: params.origQty > 0 ? params.executedQty / params.origQty : 0,
            timestamp: params.fillTime,
        };
    }

    /**
     * Get aggregated execution quality statistics for a symbol.
     */
    getStats(symbol: string): ExecutionQualityStats | null {
        const records = this.records.get(symbol.toUpperCase());
        if (!records || records.length === 0) return null;

        const slippageValues = records.map(r => r.slippageBps).sort((a, b) => a - b);
        const latencyValues = records.map(r => r.latencyMs).sort((a, b) => a - b);

        return {
            symbol: symbol.toUpperCase(),
            avgSlippageBps: this.mean(slippageValues),
            p95SlippageBps: this.percentile(slippageValues, 0.95),
            avgLatencyMs: this.mean(latencyValues),
            p95LatencyMs: this.percentile(latencyValues, 0.95),
            avgFillRatio: this.mean(records.map(r => r.fillRatio)),
            sampleCount: records.length,
            lastUpdated: Math.max(...records.map(r => r.timestamp)),
        };
    }

    /**
     * Get stats for all tracked symbols.
     */
    getAllStats(): ExecutionQualityStats[] {
        const stats: ExecutionQualityStats[] = [];
        for (const symbol of this.records.keys()) {
            const stat = this.getStats(symbol);
            if (stat) stats.push(stat);
        }
        return stats;
    }

    /**
     * Get the calibrated slippage value for a symbol.
     * This can be fed into the market simulator to replace the hardcoded value.
     */
    getCalibratedSlippage(symbol: string): number | null {
        const stats = this.getStats(symbol);
        if (!stats || stats.sampleCount < 5) return null;

        // Use the average, but cap at P95 to avoid outliers
        return Math.min(stats.avgSlippageBps, stats.p95SlippageBps);
    }

    /**
     * Get the total number of tracked executions across all symbols.
     */
    getTotalRecordCount(): number {
        let total = 0;
        for (const records of this.records.values()) {
            total += records.length;
        }
        return total;
    }

    /**
     * Get raw records for a symbol (for forensic analysis).
     */
    getRecords(symbol: string): ExecutionRecord[] {
        return [...(this.records.get(symbol.toUpperCase()) ?? [])];
    }

    /**
     * Clear all records (for testing).
     */
    clear(): void {
        this.records.clear();
    }

    // ─── Internal: Statistics ───────────────────────────────

    private mean(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }

    private percentile(sortedValues: number[], p: number): number {
        if (sortedValues.length === 0) return 0;
        const index = Math.ceil(p * sortedValues.length) - 1;
        return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
    }
}
