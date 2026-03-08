// ============================================================
// Learner: Market Scenario Stress Matrix (MSSM)
// ============================================================
// Phase 27 RADICAL INNOVATION: Cross-scenario comparative
// analysis framework. Stress-tests any strategy against 5
// canonical market regimes and produces a resilience profile.
//
// No standard trading system has a built-in backtester that
// simultaneously evaluates a strategy across multiple market
// regimes and produces a Regime Resilience Score (RRS).
//
// Usage:
//   const matrix = runStressMatrix(strategy, 500);
//   console.log(matrix.resilienceScore);        // 0-100
//   console.log(matrix.weakestScenario.name);   // "bear_crash"
//   console.log(matrix.scenarioResults);         // per-regime breakdown
// ============================================================

import {
    type StrategyDNA,
    type OHLCV,
    type PerformanceMetrics,
} from '@/types';
import {
    runBacktest,
    type BacktestResult,
    DEFAULT_BACKTEST_CONFIG,
    type BacktestConfig,
} from './backtester';
import { detectRegime } from './regime-detector';

// ─── Market Scenario Generators ──────────────────────────────

/**
 * Canonical market scenarios for stress testing.
 * Each generator produces realistic OHLCV data for a specific regime.
 */
const SCENARIO_GENERATORS: Record<string, (count: number) => OHLCV[]> = {
    bull_trend: generateBullTrend,
    bear_crash: generateBearCrash,
    sideways_range: generateSidewaysRange,
    high_volatility: generateHighVolatility,
    regime_transition: generateRegimeTransition,
};

function generateBullTrend(count: number): OHLCV[] {
    const candles: OHLCV[] = [];
    let price = 40000;
    const baseTs = Date.now() - count * 3600000;
    for (let i = 0; i < count; i++) {
        const drift = 1 + (0.001 + Math.random() * 0.002);
        const noise = (Math.random() - 0.5) * 0.005;
        price *= (drift + noise);
        const open = price * (1 + (Math.random() - 0.5) * 0.003);
        const close = price;
        const high = Math.max(open, close) * (1 + Math.random() * 0.005);
        const low = Math.min(open, close) * (1 - Math.random() * 0.005);
        candles.push({
            timestamp: baseTs + i * 3600000,
            open: Math.round(open * 100) / 100,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
            close: Math.round(close * 100) / 100,
            volume: Math.round(1000 + Math.random() * 5000 + i * 10),
        });
    }
    return candles;
}

function generateBearCrash(count: number): OHLCV[] {
    const candles: OHLCV[] = [];
    let price = 60000;
    const baseTs = Date.now() - count * 3600000;
    for (let i = 0; i < count; i++) {
        const panic = Math.min(1, i / count);
        const drift = 1 - (0.002 + Math.random() * 0.003 + panic * 0.003);
        price *= drift;
        const vol = 0.005 + panic * 0.01;
        const open = price * (1 + (Math.random() - 0.4) * vol);
        const close = price;
        const high = Math.max(open, close) * (1 + Math.random() * vol);
        const low = Math.min(open, close) * (1 - Math.random() * vol * 1.5);
        candles.push({
            timestamp: baseTs + i * 3600000,
            open: Math.round(open * 100) / 100,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
            close: Math.round(close * 100) / 100,
            volume: Math.round(2000 + Math.random() * 8000 + panic * 5000),
        });
    }
    return candles;
}

function generateSidewaysRange(count: number): OHLCV[] {
    const candles: OHLCV[] = [];
    let price = 50000;
    const center = 50000;
    const range = center * 0.03;
    const baseTs = Date.now() - count * 3600000;
    for (let i = 0; i < count; i++) {
        const dist = (price - center) / range;
        const reversion = -dist * 0.1;
        const noise = (Math.random() - 0.5) * 0.01;
        price *= (1 + reversion + noise);
        const open = price * (1 + (Math.random() - 0.5) * 0.004);
        const close = price;
        const high = Math.max(open, close) * (1 + Math.random() * 0.003);
        const low = Math.min(open, close) * (1 - Math.random() * 0.003);
        candles.push({
            timestamp: baseTs + i * 3600000,
            open: Math.round(open * 100) / 100,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
            close: Math.round(close * 100) / 100,
            volume: Math.round(500 + Math.random() * 3000),
        });
    }
    return candles;
}

function generateHighVolatility(count: number): OHLCV[] {
    const candles: OHLCV[] = [];
    let price = 50000;
    const baseTs = Date.now() - count * 3600000;
    for (let i = 0; i < count; i++) {
        const swing = (Math.random() - 0.5) * 0.04;
        price *= (1 + swing);
        const bodySize = Math.abs(swing) + Math.random() * 0.01;
        const open = price * (1 + (Math.random() > 0.5 ? bodySize : -bodySize));
        const close = price;
        const high = Math.max(open, close) * (1 + Math.random() * 0.015);
        const low = Math.min(open, close) * (1 - Math.random() * 0.015);
        candles.push({
            timestamp: baseTs + i * 3600000,
            open: Math.round(open * 100) / 100,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
            close: Math.round(close * 100) / 100,
            volume: Math.round(3000 + Math.random() * 15000),
        });
    }
    return candles;
}

/**
 * UNIQUE: Regime transition scenario — starts bull, transitions to
 * sideways, then crashes. Tests strategy adaptability.
 */
function generateRegimeTransition(count: number): OHLCV[] {
    const phase1 = Math.floor(count * 0.35); // Bull phase
    const phase2 = Math.floor(count * 0.30); // Sideways phase
    const phase3 = count - phase1 - phase2;  // Bear crash

    const bull = generateBullTrend(phase1);
    const lastBullPrice = bull[bull.length - 1].close;

    // Sideways around the last bull price
    const sideways: OHLCV[] = [];
    let price = lastBullPrice;
    const swBaseTs = bull[bull.length - 1].timestamp + 3600000;
    for (let i = 0; i < phase2; i++) {
        const dist = (price - lastBullPrice) / (lastBullPrice * 0.02);
        price *= (1 + (-dist * 0.08) + (Math.random() - 0.5) * 0.008);
        const open = price * (1 + (Math.random() - 0.5) * 0.003);
        const close = price;
        const high = Math.max(open, close) * (1 + Math.random() * 0.004);
        const low = Math.min(open, close) * (1 - Math.random() * 0.004);
        sideways.push({
            timestamp: swBaseTs + i * 3600000,
            open: Math.round(open * 100) / 100,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
            close: Math.round(close * 100) / 100,
            volume: Math.round(800 + Math.random() * 3000),
        });
    }

    // Bear crash from the sideways end price
    const lastSidewaysPrice = sideways.length > 0 ? sideways[sideways.length - 1].close : lastBullPrice;
    const bearBaseTs = (sideways.length > 0 ? sideways[sideways.length - 1].timestamp : swBaseTs) + 3600000;
    const bear: OHLCV[] = [];
    price = lastSidewaysPrice;
    for (let i = 0; i < phase3; i++) {
        const panic = Math.min(1, i / phase3);
        price *= (1 - (0.003 + Math.random() * 0.004 + panic * 0.004));
        const vol = 0.005 + panic * 0.012;
        const open = price * (1 + (Math.random() - 0.4) * vol);
        const close = price;
        const high = Math.max(open, close) * (1 + Math.random() * vol);
        const low = Math.min(open, close) * (1 - Math.random() * vol * 1.5);
        bear.push({
            timestamp: bearBaseTs + i * 3600000,
            open: Math.round(open * 100) / 100,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
            close: Math.round(close * 100) / 100,
            volume: Math.round(3000 + Math.random() * 10000 + panic * 5000),
        });
    }

    return [...bull, ...sideways, ...bear];
}

// ─── Stress Matrix Types ─────────────────────────────────────

export interface ScenarioResult {
    name: string;
    candles: number;
    trades: number;
    metrics: PerformanceMetrics;
    fitnessScore: number;
    totalFees: number;
    executionTimeMs: number;
    detectedRegime: string;
    regimeConfidence: number;
    equityReturnPercent: number;
}

export interface StressMatrixResult {
    strategyId: string;
    strategyName: string;
    scenarioResults: ScenarioResult[];
    resilienceScore: number;         // 0-100: cross-scenario consistency
    strongestScenario: ScenarioResult;
    weakestScenario: ScenarioResult;
    scenarioVariance: number;        // Lower = more regime-agnostic
    avgFitness: number;
    maxDrawdownWorst: number;
    totalExecutionMs: number;
    timestamp: number;
}

// ─── Stress Matrix Engine ────────────────────────────────────

/**
 * Run the Market Scenario Stress Matrix (MSSM).
 *
 * Backtests a strategy against 5 canonical market regimes simultaneously
 * and computes a Regime Resilience Score (RRS) — a composite metric that
 * measures cross-regime consistency.
 *
 * RRS formula:
 *   RRS = avgFitness × (1 - normalizedVariance) × consistencyBonus
 *
 * Where:
 *   - avgFitness: mean fitness across all scenarios
 *   - normalizedVariance: fitness variance / max possible variance (2500)
 *   - consistencyBonus: 1.0 if no catastrophic failures, penalized otherwise
 *
 * @param strategy - StrategyDNA to stress test
 * @param candlesPerScenario - Number of candles per scenario (min 250)
 * @param config - Optional backtest config override
 * @returns Complete stress matrix result with per-scenario breakdown
 */
export function runStressMatrix(
    strategy: StrategyDNA,
    candlesPerScenario: number = 400,
    config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
): StressMatrixResult {
    const effectiveCandles = Math.max(candlesPerScenario, config.warmupCandles + 50);
    const startTime = performance.now();

    const scenarioResults: ScenarioResult[] = [];

    for (const [name, generator] of Object.entries(SCENARIO_GENERATORS)) {
        const candles = generator(effectiveCandles);

        let result: BacktestResult;
        try {
            result = runBacktest(strategy, candles, config);
        } catch {
            // Strategy failed on this scenario — record zero fitness
            const emptyMetrics: PerformanceMetrics = {
                totalTrades: 0, winningTrades: 0, losingTrades: 0,
                winRate: 0, profitFactor: 0,
                sharpeRatio: 0, sortinoRatio: 0,
                maxDrawdown: 0, maxDrawdownDuration: 0,
                averageRR: 0, expectancy: 0,
                totalPnlPercent: 0, totalPnlUSD: 0,
                averageWinPercent: 0, averageLossPercent: 0,
                largestWinPercent: 0, largestLossPercent: 0,
                consecutiveWins: 0, consecutiveLosses: 0,
                averageHoldTime: 0,
            };
            scenarioResults.push({
                name,
                candles: effectiveCandles,
                trades: 0,
                metrics: emptyMetrics,
                fitnessScore: 0,
                totalFees: 0,
                executionTimeMs: 0,
                detectedRegime: 'UNKNOWN',
                regimeConfidence: 0,
                equityReturnPercent: 0,
            });
            continue;
        }

        // Detect actual regime
        const regimeAnalysis = detectRegime(candles);

        // Calculate equity return
        const firstEquity = result.equityCurve.length > 0 ? result.equityCurve[0].balance : config.initialCapital;
        const lastEquity = result.equityCurve.length > 0
            ? result.equityCurve[result.equityCurve.length - 1].balance
            : config.initialCapital;
        const equityReturn = ((lastEquity - firstEquity) / firstEquity) * 100;

        scenarioResults.push({
            name,
            candles: result.candlesProcessed,
            trades: result.trades.length,
            metrics: result.metrics,
            fitnessScore: result.fitnessScore,
            totalFees: result.totalFees,
            executionTimeMs: result.executionTimeMs,
            detectedRegime: regimeAnalysis.currentRegime,
            regimeConfidence: regimeAnalysis.confidence,
            equityReturnPercent: Math.round(equityReturn * 100) / 100,
        });
    }

    // ─── Compute Regime Resilience Score (RRS) ───────────────

    const fitnesses = scenarioResults.map(r => r.fitnessScore);
    const avgFitness = fitnesses.length > 0
        ? fitnesses.reduce((sum, f) => sum + f, 0) / fitnesses.length
        : 0;

    // Variance: low = regime-agnostic (good), high = regime-dependent (bad)
    const variance = fitnesses.length > 1
        ? fitnesses.reduce((sum, f) => sum + Math.pow(f - avgFitness, 2), 0) / fitnesses.length
        : 0;
    const maxVariance = 2500; // Max possible variance (100-0 range)
    const normalizedVariance = Math.min(1, variance / maxVariance);

    // Consistency bonus: penalize if ANY scenario has 0 fitness
    const catastrophicFailures = fitnesses.filter(f => f === 0).length;
    const consistencyBonus = catastrophicFailures === 0
        ? 1.0
        : Math.max(0.3, 1 - (catastrophicFailures * 0.15));

    // RRS = avg × (1 - variance) × consistency
    const resilienceScore = Math.round(
        Math.min(100, avgFitness * (1 - normalizedVariance) * consistencyBonus)
    );

    // Find strongest/weakest
    const sorted = [...scenarioResults].sort((a, b) => b.fitnessScore - a.fitnessScore);
    const strongest = sorted[0] || scenarioResults[0];
    const weakest = sorted[sorted.length - 1] || scenarioResults[0];

    // Worst-case max drawdown
    const maxDrawdownWorst = Math.max(...scenarioResults.map(r => r.metrics.maxDrawdown), 0);

    const totalExecutionMs = performance.now() - startTime;

    return {
        strategyId: strategy.id,
        strategyName: strategy.name,
        scenarioResults,
        resilienceScore,
        strongestScenario: strongest,
        weakestScenario: weakest,
        scenarioVariance: Math.round(variance * 100) / 100,
        avgFitness: Math.round(avgFitness * 100) / 100,
        maxDrawdownWorst: Math.round(maxDrawdownWorst * 100) / 100,
        totalExecutionMs: Math.round(totalExecutionMs),
        timestamp: Date.now(),
    };
}

/**
 * Batch stress matrix — run MSSM on an entire population.
 * Returns results sorted by resilience score (descending).
 *
 * This identifies which strategies are truly regime-agnostic winners
 * vs which ones are local optima for a single market condition.
 */
export function batchStressMatrix(
    strategies: StrategyDNA[],
    candlesPerScenario: number = 400,
    config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
): StressMatrixResult[] {
    const results = strategies.map(s => runStressMatrix(s, candlesPerScenario, config));
    return results.sort((a, b) => b.resilienceScore - a.resilienceScore);
}
