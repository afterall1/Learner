// ============================================================
// Learner: Supabase Cloud Database — PC-Independent Persistence
// ============================================================
// Phase 14: Cloud database layer. Data survives PC shutdown.
// Uses Supabase (PostgreSQL) as primary cloud store.
// IndexedDB remains as local cache for speed + offline.
//
// Architecture:
//   Engine → PersistenceBridge → Supabase (cloud, durable)
//                              → IndexedDB (local cache)
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/config/env-validator';
import type {
    Trade,
    StrategyDNA,
    TradeForensicReport,
    MarketRegime,
} from '@/types';
import type {
    EvolutionSnapshot,
    PortfolioSnapshot,
    EngineCheckpoint,
} from '@/lib/store/persistence';

// ─── Supabase Client ─────────────────────────────────────────

let supabaseClient: SupabaseClient | null = null;

/**
 * Get the Supabase client singleton.
 * Returns null if credentials are not configured.
 */
function getSupabase(): SupabaseClient | null {
    if (supabaseClient) return supabaseClient;

    // Try validated env first, fallback to raw process.env
    let url: string | undefined;
    let key: string | undefined;
    try {
        const env = getEnv();
        url = env.supabase.url;
        key = env.supabase.anonKey;
    } catch {
        url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }

    if (!url || !key) {
        return null;
    }

    supabaseClient = createClient(url, key);
    return supabaseClient;
}

/**
 * Check if Supabase is configured and available.
 */
export function isCloudAvailable(): boolean {
    return getSupabase() !== null;
}

// ─── Trade Operations ────────────────────────────────────────

/**
 * Save a trade to Supabase cloud.
 */
export async function cloudSaveTrade(trade: Trade): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;

    try {
        const { error } = await sb
            .from('trades')
            .upsert({
                id: trade.id,
                strategy_id: trade.strategyId,
                symbol: trade.symbol,
                status: trade.status,
                direction: trade.direction ?? null,
                entry_price: trade.entryPrice ?? null,
                exit_price: trade.exitPrice ?? null,
                entry_time: trade.entryTime ?? null,
                exit_time: trade.exitTime ?? null,
                pnl_percent: trade.pnlPercent ?? null,
                quantity: trade.quantity ?? null,
                data: trade,
            });

        if (error) {
            console.error('[Supabase] Failed to save trade:', error.message);
        }
    } catch (error) {
        console.error('[Supabase] Trade save exception:', error);
    }
}

/**
 * Save multiple trades in a batch.
 */
export async function cloudSaveTrades(trades: Trade[]): Promise<void> {
    const sb = getSupabase();
    if (!sb || trades.length === 0) return;

    try {
        const rows = trades.map(trade => ({
            id: trade.id,
            strategy_id: trade.strategyId,
            symbol: trade.symbol,
            status: trade.status,
            direction: trade.direction ?? null,
            entry_price: trade.entryPrice ?? null,
            exit_price: trade.exitPrice ?? null,
            entry_time: trade.entryTime ?? null,
            exit_time: trade.exitTime ?? null,
            pnl_percent: trade.pnlPercent ?? null,
            quantity: trade.quantity ?? null,
            data: trade,
        }));

        const { error } = await sb.from('trades').upsert(rows);
        if (error) {
            console.error('[Supabase] Failed to batch save trades:', error.message);
        }
    } catch (error) {
        console.error('[Supabase] Trade batch exception:', error);
    }
}

/**
 * Load all trades from cloud.
 */
export async function cloudLoadTrades(limit: number = 1000): Promise<Trade[]> {
    const sb = getSupabase();
    if (!sb) return [];

    try {
        const { data, error } = await sb
            .from('trades')
            .select('data')
            .order('entry_time', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[Supabase] Failed to load trades:', error.message);
            return [];
        }

        return (data ?? []).map(row => row.data as Trade);
    } catch (error) {
        console.error('[Supabase] Trade load exception:', error);
        return [];
    }
}

// ─── Strategy Operations ─────────────────────────────────────

/**
 * Save a strategy to Supabase cloud.
 */
export async function cloudSaveStrategy(strategy: StrategyDNA): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;

    try {
        const { error } = await sb
            .from('strategies')
            .upsert({
                id: strategy.id,
                slot_id: strategy.slotId,
                generation: strategy.generation,
                status: strategy.status,
                fitness_score: strategy.metadata?.fitnessScore ?? 0,
                data: strategy,
            });

        if (error) {
            console.error('[Supabase] Failed to save strategy:', error.message);
        }
    } catch (error) {
        console.error('[Supabase] Strategy save exception:', error);
    }
}

/**
 * Save multiple strategies in a batch.
 */
export async function cloudSaveStrategies(strategies: StrategyDNA[]): Promise<void> {
    const sb = getSupabase();
    if (!sb || strategies.length === 0) return;

    try {
        const rows = strategies.map(s => ({
            id: s.id,
            slot_id: s.slotId,
            generation: s.generation,
            status: s.status,
            fitness_score: s.metadata?.fitnessScore ?? 0,
            data: s,
        }));

        const { error } = await sb.from('strategies').upsert(rows);
        if (error) {
            console.error('[Supabase] Failed to batch save strategies:', error.message);
        }
    } catch (error) {
        console.error('[Supabase] Strategy batch exception:', error);
    }
}

// ─── Evolution Snapshot Operations ───────────────────────────

/**
 * Save an evolution snapshot to cloud.
 */
export async function cloudSaveEvolutionSnapshot(snapshot: EvolutionSnapshot): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;

    try {
        const { error } = await sb
            .from('evolution_snapshots')
            .upsert({
                id: snapshot.id,
                slot_id: snapshot.slotId,
                generation_number: snapshot.generationNumber,
                best_fitness: snapshot.bestFitnessScore,
                avg_fitness: snapshot.averageFitnessScore,
                population_size: snapshot.populationSize,
                mutation_rate: snapshot.mutationRate,
                timestamp: snapshot.timestamp,
            });

        if (error) {
            console.error('[Supabase] Failed to save evolution snapshot:', error.message);
        }
    } catch (error) {
        console.error('[Supabase] Evolution snapshot exception:', error);
    }
}

// ─── Forensic Report Operations ──────────────────────────────

/**
 * Save a forensic report to cloud.
 */
export async function cloudSaveForensicReport(report: TradeForensicReport): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;

    try {
        const { error } = await sb
            .from('forensic_reports')
            .upsert({
                trade_id: report.tradeId,
                strategy_id: report.strategyId,
                entry_regime: report.entryRegime,
                data: report,
            });

        if (error) {
            console.error('[Supabase] Failed to save forensic report:', error.message);
        }
    } catch (error) {
        console.error('[Supabase] Forensic report exception:', error);
    }
}

// ─── Portfolio Snapshot Operations ───────────────────────────

/**
 * Save a portfolio snapshot to cloud.
 */
export async function cloudSavePortfolioSnapshot(snapshot: PortfolioSnapshot): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;

    try {
        const { error } = await sb
            .from('portfolio_snapshots')
            .upsert({
                id: snapshot.id,
                timestamp: snapshot.timestamp,
                total_balance: snapshot.totalBalance,
                all_time_pnl: snapshot.allTimePnl,
                data: snapshot,
            });

        if (error) {
            console.error('[Supabase] Failed to save portfolio snapshot:', error.message);
        }
    } catch (error) {
        console.error('[Supabase] Portfolio snapshot exception:', error);
    }
}

// ─── Engine State Operations ─────────────────────────────────

/**
 * Save engine checkpoint to cloud.
 */
export async function cloudSaveEngineCheckpoint(checkpoint: EngineCheckpoint): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;

    try {
        const { error } = await sb
            .from('engine_state')
            .upsert({
                id: 'latest',
                timestamp: checkpoint.timestamp,
                data: checkpoint,
            });

        if (error) {
            console.error('[Supabase] Failed to save engine checkpoint:', error.message);
        }
    } catch (error) {
        console.error('[Supabase] Checkpoint save exception:', error);
    }
}

/**
 * Load the latest engine checkpoint from cloud.
 */
export async function cloudLoadEngineCheckpoint(): Promise<EngineCheckpoint | null> {
    const sb = getSupabase();
    if (!sb) return null;

    try {
        const { data, error } = await sb
            .from('engine_state')
            .select('data')
            .eq('id', 'latest')
            .single();

        if (error) {
            if (error.code !== 'PGRST116') { // Not "no rows" error
                console.error('[Supabase] Failed to load checkpoint:', error.message);
            }
            return null;
        }

        return data?.data as EngineCheckpoint ?? null;
    } catch (error) {
        console.error('[Supabase] Checkpoint load exception:', error);
        return null;
    }
}

// ─── Stats ───────────────────────────────────────────────────

/**
 * Get cloud storage statistics.
 */
export async function cloudGetStats(): Promise<{
    trades: number;
    strategies: number;
    evolutionSnapshots: number;
    forensicReports: number;
    portfolioSnapshots: number;
    connected: boolean;
} | null> {
    const sb = getSupabase();
    if (!sb) return null;

    try {
        const [trades, strategies, evoSnaps, forensics, portfolio] = await Promise.all([
            sb.from('trades').select('id', { count: 'exact', head: true }),
            sb.from('strategies').select('id', { count: 'exact', head: true }),
            sb.from('evolution_snapshots').select('id', { count: 'exact', head: true }),
            sb.from('forensic_reports').select('trade_id', { count: 'exact', head: true }),
            sb.from('portfolio_snapshots').select('id', { count: 'exact', head: true }),
        ]);

        return {
            trades: trades.count ?? 0,
            strategies: strategies.count ?? 0,
            evolutionSnapshots: evoSnaps.count ?? 0,
            forensicReports: forensics.count ?? 0,
            portfolioSnapshots: portfolio.count ?? 0,
            connected: true,
        };
    } catch (error) {
        console.error('[Supabase] Stats fetch failed:', error);
        return { trades: 0, strategies: 0, evolutionSnapshots: 0, forensicReports: 0, portfolioSnapshots: 0, connected: false };
    }
}
