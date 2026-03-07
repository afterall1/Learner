// ============================================================
// Learner: Quality-Diversity Engine — MAP-Elites Behavioral Grid
// ============================================================
// Phase 18: Replaces fitness-only selection with a behavioral
// repertoire. Instead of finding ONE best strategy, evolution
// discovers N behaviorally distinct specialists.
//
// The MAP-Elites grid has two behavioral dimensions:
//   BD1: Regime Specialization (5 regimes)
//   BD2: Trade Style (3 styles: scalper, swing, position)
//
// This creates a 5×3 = 15-cell grid. Each cell tracks the
// single best strategy for that behavioral niche.
//
// Key innovation: The Cortex can query the repertoire to
// activate the best specialist for current market conditions.
// ============================================================

import {
    type StrategyDNA,
    type Trade,
    type BehaviorDescriptor,
    type MAPElitesCell,
    type QualityDiversityConfig,
    type RepertoireSnapshot,
    MarketRegime,
    TradeStyle,
    DEFAULT_QD_CONFIG,
} from '@/types';

// ─── Constants ───────────────────────────────────────────────

const ALL_REGIMES: MarketRegime[] = [
    MarketRegime.TRENDING_UP,
    MarketRegime.TRENDING_DOWN,
    MarketRegime.RANGING,
    MarketRegime.HIGH_VOLATILITY,
    MarketRegime.LOW_VOLATILITY,
];

const ALL_STYLES: TradeStyle[] = [
    TradeStyle.SCALPER,
    TradeStyle.SWING,
    TradeStyle.POSITION,
];

// ─── Behavior Classification ─────────────────────────────────

/**
 * Classify a strategy's trade style based on average hold duration.
 * Hold duration is measured in candles (not time) for timeframe independence.
 *
 * Scalper: avg hold < scalperThreshold (default 4 candles)
 * Position: avg hold > positionThreshold (default 20 candles)
 * Swing: everything in between
 */
export function classifyTradeStyle(
    trades: Trade[],
    config: QualityDiversityConfig = DEFAULT_QD_CONFIG,
): TradeStyle {
    if (trades.length < config.minTradesForClassification) {
        return TradeStyle.SWING; // Default to swing if insufficient data
    }

    const closedTrades = trades.filter(t => t.exitTime !== null && t.entryTime > 0);
    if (closedTrades.length === 0) {
        return TradeStyle.SWING;
    }

    // Calculate average hold duration in a timeframe-agnostic way.
    // We use the median entry-exit span relative to the average candle interval.
    const holdDurations = closedTrades
        .map(t => (t.exitTime! - t.entryTime))
        .filter(d => d > 0)
        .sort((a, b) => a - b);

    if (holdDurations.length === 0) {
        return TradeStyle.SWING;
    }

    // Use median to be robust against outliers
    const medianDuration = holdDurations[Math.floor(holdDurations.length / 2)];

    // Estimate candle interval from trades
    // Use the minimum non-zero time difference between consecutive trades as proxy
    const sortedEntries = closedTrades.map(t => t.entryTime).sort((a, b) => a - b);
    let minInterval = Infinity;
    for (let i = 1; i < sortedEntries.length; i++) {
        const diff = sortedEntries[i] - sortedEntries[i - 1];
        if (diff > 0 && diff < minInterval) {
            minInterval = diff;
        }
    }

    // Fallback: if we can't estimate candle interval, use 1h (3600000ms)
    const candleInterval = minInterval === Infinity ? 3_600_000 : Math.max(minInterval, 60_000);
    const avgHoldCandles = medianDuration / candleInterval;

    if (avgHoldCandles < config.scalperThresholdCandles) {
        return TradeStyle.SCALPER;
    } else if (avgHoldCandles > config.positionThresholdCandles) {
        return TradeStyle.POSITION;
    }
    return TradeStyle.SWING;
}

/**
 * Determine which market regime a strategy specializes in.
 * Based on the regime where the strategy achieves the highest
 * average PnL per trade.
 *
 * If no regime data is available, defaults to RANGING.
 */
export function classifyRegimeSpecialization(
    trades: Trade[],
): MarketRegime {
    if (trades.length === 0) {
        return MarketRegime.RANGING;
    }

    // Group trades by their entry regime (if tagged)
    const regimePnl = new Map<MarketRegime, { totalPnl: number; count: number }>();

    for (const trade of trades) {
        // Use the trade's regime tag if available, otherwise skip
        const regime = (trade as Trade & { regime?: MarketRegime }).regime;
        if (!regime) continue;

        const existing = regimePnl.get(regime) ?? { totalPnl: 0, count: 0 };
        existing.totalPnl += trade.pnlPercent ?? 0;
        existing.count += 1;
        regimePnl.set(regime, existing);
    }

    if (regimePnl.size === 0) {
        return MarketRegime.RANGING;
    }

    // Find the regime with the highest average PnL per trade
    let bestRegime = MarketRegime.RANGING;
    let bestAvgPnl = -Infinity;

    for (const [regime, data] of regimePnl) {
        if (data.count >= 3) { // Need at least 3 trades in a regime to judge
            const avgPnl = data.totalPnl / data.count;
            if (avgPnl > bestAvgPnl) {
                bestAvgPnl = avgPnl;
                bestRegime = regime;
            }
        }
    }

    return bestRegime;
}

/**
 * Classify a strategy's full behavioral descriptor from its trade history.
 */
export function classifyBehavior(
    trades: Trade[],
    config: QualityDiversityConfig = DEFAULT_QD_CONFIG,
): BehaviorDescriptor {
    return {
        regimeSpecialization: classifyRegimeSpecialization(trades),
        tradeStyle: classifyTradeStyle(trades, config),
    };
}

// ─── MAP-Elites Grid ─────────────────────────────────────────

/**
 * Generate a unique key for a behavior descriptor cell.
 */
function cellKey(descriptor: BehaviorDescriptor): string {
    return `${descriptor.regimeSpecialization}::${descriptor.tradeStyle}`;
}

/**
 * MAPElitesGrid — The behavioral repertoire for an Island.
 *
 * Maintains a 5×3 grid of behavioral niches, each holding
 * the single best strategy for that (regime, style) combination.
 *
 * Key properties:
 * - Local competition: strategies only compete within their niche
 * - Quality: only the best per-niche survives
 * - Diversity: different niches are explicitly maintained
 * - Coverage: the repertoire tracks how many niches are filled
 */
export class MAPElitesGrid {
    private grid: Map<string, MAPElitesCell> = new Map();
    private config: QualityDiversityConfig;
    private totalAttempts: number = 0;
    private totalImprovements: number = 0;

    constructor(config: Partial<QualityDiversityConfig> = {}) {
        this.config = { ...DEFAULT_QD_CONFIG, ...config };
        this.initializeGrid();
    }

    /**
     * Initialize all 15 cells with null elites.
     */
    private initializeGrid(): void {
        for (const regime of ALL_REGIMES) {
            for (const style of ALL_STYLES) {
                const descriptor: BehaviorDescriptor = {
                    regimeSpecialization: regime,
                    tradeStyle: style,
                };
                const key = cellKey(descriptor);
                this.grid.set(key, {
                    descriptor,
                    elite: null,
                    fitness: -Infinity,
                    timesImproved: 0,
                    lastUpdated: 0,
                });
            }
        }
    }

    /**
     * Attempt to place a strategy into the grid.
     *
     * The strategy is classified by its behavior and placed into
     * the corresponding cell. If the cell is empty or the strategy
     * has higher fitness than the current occupant, it replaces it.
     *
     * Returns true if the strategy was placed (new elite).
     */
    tryPlace(
        strategy: StrategyDNA,
        trades: Trade[],
        fitness: number,
    ): boolean {
        this.totalAttempts++;

        const descriptor = classifyBehavior(trades, this.config);
        const key = cellKey(descriptor);
        const cell = this.grid.get(key);

        if (!cell) {
            return false; // Should never happen
        }

        // Only place if better than current occupant
        if (fitness > cell.fitness) {
            // Update the strategy with its behavioral classification
            strategy.behaviorDescriptor = descriptor;
            strategy.tradeStyleClassification = descriptor.tradeStyle;

            cell.elite = strategy;
            cell.fitness = fitness;
            cell.timesImproved++;
            cell.lastUpdated = Date.now();
            this.totalImprovements++;

            return true;
        }

        return false;
    }

    /**
     * Get the best strategy for a specific behavioral niche.
     */
    getElite(regime: MarketRegime, style: TradeStyle): StrategyDNA | null {
        const key = cellKey({ regimeSpecialization: regime, tradeStyle: style });
        return this.grid.get(key)?.elite ?? null;
    }

    /**
     * Get all non-empty elites from the grid.
     * This is the full behavioral repertoire.
     */
    getRepertoire(): StrategyDNA[] {
        const elites: StrategyDNA[] = [];
        for (const cell of this.grid.values()) {
            if (cell.elite) {
                elites.push(cell.elite);
            }
        }
        return elites;
    }

    /**
     * Get the best strategy for the current market regime.
     * Searches all trade styles for the given regime and
     * returns the highest-fitness elite.
     */
    getBestForRegime(regime: MarketRegime): StrategyDNA | null {
        let bestStrategy: StrategyDNA | null = null;
        let bestFitness = -Infinity;

        for (const style of ALL_STYLES) {
            const key = cellKey({ regimeSpecialization: regime, tradeStyle: style });
            const cell = this.grid.get(key);
            if (cell?.elite && cell.fitness > bestFitness) {
                bestFitness = cell.fitness;
                bestStrategy = cell.elite;
            }
        }

        return bestStrategy;
    }

    /**
     * Get the overall best strategy across all niches.
     */
    getBestOverall(): StrategyDNA | null {
        let bestStrategy: StrategyDNA | null = null;
        let bestFitness = -Infinity;

        for (const cell of this.grid.values()) {
            if (cell.elite && cell.fitness > bestFitness) {
                bestFitness = cell.fitness;
                bestStrategy = cell.elite;
            }
        }

        return bestStrategy;
    }

    /**
     * Select the best strategy from the repertoire based on
     * the configured selection mode and current regime.
     */
    selectActiveStrategy(currentRegime: MarketRegime | null): StrategyDNA | null {
        switch (this.config.repertoireSelectionMode) {
            case 'regime_match':
                if (currentRegime) {
                    const regimeBest = this.getBestForRegime(currentRegime);
                    if (regimeBest) return regimeBest;
                }
                return this.getBestOverall();

            case 'best_overall':
                return this.getBestOverall();

            case 'ensemble':
                // Return the regime-matched elite, or best overall as fallback
                if (currentRegime) {
                    return this.getBestForRegime(currentRegime) ?? this.getBestOverall();
                }
                return this.getBestOverall();

            default:
                return this.getBestOverall();
        }
    }

    /**
     * Get the population for the next generation.
     * Returns all elites from the grid as parents for crossover/mutation.
     * This replaces the flat population model.
     */
    getPopulationForEvolution(): StrategyDNA[] {
        return this.getRepertoire();
    }

    /**
     * Calculate coverage percentage (how many niches are filled).
     */
    getCoveragePercent(): number {
        const totalCells = this.grid.size;
        const occupiedCells = this.getRepertoire().length;
        return totalCells > 0 ? (occupiedCells / totalCells) * 100 : 0;
    }

    /**
     * Get a dashboard-friendly snapshot of the repertoire.
     */
    getSnapshot(): RepertoireSnapshot {
        const elites = this.getRepertoire();
        const fitnesses = elites.map(e => e.metadata.fitnessScore);

        const regimeCoverage: Record<MarketRegime, number> = {
            [MarketRegime.TRENDING_UP]: 0,
            [MarketRegime.TRENDING_DOWN]: 0,
            [MarketRegime.RANGING]: 0,
            [MarketRegime.HIGH_VOLATILITY]: 0,
            [MarketRegime.LOW_VOLATILITY]: 0,
        };

        const styleCoverage: Record<TradeStyle, number> = {
            [TradeStyle.SCALPER]: 0,
            [TradeStyle.SWING]: 0,
            [TradeStyle.POSITION]: 0,
        };

        for (const cell of this.grid.values()) {
            if (cell.elite) {
                regimeCoverage[cell.descriptor.regimeSpecialization]++;
                styleCoverage[cell.descriptor.tradeStyle]++;
            }
        }

        return {
            totalCells: this.grid.size,
            occupiedCells: elites.length,
            coveragePercent: this.getCoveragePercent(),
            avgEliteFitness: fitnesses.length > 0
                ? fitnesses.reduce((s, f) => s + f, 0) / fitnesses.length
                : 0,
            bestEliteFitness: fitnesses.length > 0 ? Math.max(...fitnesses) : 0,
            grid: Array.from(this.grid.values()),
            regimeCoverage,
            styleCoverage,
        };
    }

    /**
     * Get total number of placement attempts vs improvements.
     * Used for monitoring the efficiency of the illumination process.
     */
    getIlluminationStats(): { totalAttempts: number; totalImprovements: number; improvementRate: number } {
        return {
            totalAttempts: this.totalAttempts,
            totalImprovements: this.totalImprovements,
            improvementRate: this.totalAttempts > 0
                ? this.totalImprovements / this.totalAttempts
                : 0,
        };
    }

    /**
     * Reset the grid (used when restarting evolution).
     */
    reset(): void {
        this.grid.clear();
        this.totalAttempts = 0;
        this.totalImprovements = 0;
        this.initializeGrid();
    }
}
