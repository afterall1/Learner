// ============================================================
// Learner: Coevolution Engine — Parasite-Host Arms Race
// ============================================================
// Phase 18.1: Implements competitive coevolution where a second
// GA evolves adversarial market scenarios (parasites) designed
// to break host strategies.
//
// The arms race dynamic:
//   - Host strategies evolve to be profitable
//   - Parasite scenarios evolve to find weaknesses
//   - Strategies that survive parasitic attacks are robust
//
// Parasite fitness = damage dealt to host strategies
// Host fitness += robustness bonus for surviving attacks
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type MarketScenarioDNA,
    type RobustnessScore,
    type CoevolutionConfig,
    type StrategyDNA,
    type OHLCV,
    MarketRegime,
    DEFAULT_COEVOLUTION_CONFIG,
} from '@/types';
import { runBacktest, type BacktestConfig } from './backtester';
import { DEFAULT_EXECUTION_CONFIG } from './market-simulator';

// ─── Trend Pattern Generators ────────────────────────────────

type TrendPattern = MarketScenarioDNA['trendPattern'];

const TREND_PATTERNS: TrendPattern[] = [
    'v_reversal', 'head_shoulders', 'flash_crash',
    'slow_bleed', 'whipsaw', 'gap_and_go', 'chop',
];

/**
 * Generate a base price series for a given trend pattern.
 * Returns normalized price multipliers centered around 1.0.
 */
function generateTrendSeries(
    pattern: TrendPattern,
    length: number,
): number[] {
    const series: number[] = new Array(length);

    switch (pattern) {
        case 'v_reversal': {
            const pivot = Math.floor(length * 0.4);
            for (let i = 0; i < length; i++) {
                if (i < pivot) {
                    series[i] = 1.0 - (i / pivot) * 0.08;
                } else {
                    series[i] = 0.92 + ((i - pivot) / (length - pivot)) * 0.12;
                }
            }
            break;
        }
        case 'head_shoulders': {
            const s1 = Math.floor(length * 0.2);
            const head = Math.floor(length * 0.5);
            const s2 = Math.floor(length * 0.8);
            for (let i = 0; i < length; i++) {
                if (i < s1) series[i] = 1.0 + (i / s1) * 0.04;
                else if (i < head) series[i] = 1.04 + ((i - s1) / (head - s1)) * 0.06;
                else if (i < s2) series[i] = 1.10 - ((i - head) / (s2 - head)) * 0.06;
                else series[i] = 1.04 - ((i - s2) / (length - s2)) * 0.08;
            }
            break;
        }
        case 'flash_crash': {
            const crashStart = Math.floor(length * 0.6);
            const crashEnd = Math.floor(length * 0.65);
            for (let i = 0; i < length; i++) {
                if (i < crashStart) series[i] = 1.0 + (i / crashStart) * 0.03;
                else if (i < crashEnd) series[i] = 1.03 - ((i - crashStart) / (crashEnd - crashStart)) * 0.12;
                else series[i] = 0.91 + ((i - crashEnd) / (length - crashEnd)) * 0.04;
            }
            break;
        }
        case 'slow_bleed': {
            for (let i = 0; i < length; i++) {
                series[i] = 1.0 - (i / length) * 0.10;
            }
            break;
        }
        case 'whipsaw': {
            for (let i = 0; i < length; i++) {
                const freq1 = Math.sin(i * 0.15) * 0.03;
                const freq2 = Math.sin(i * 0.37) * 0.02;
                series[i] = 1.0 + freq1 + freq2;
            }
            break;
        }
        case 'gap_and_go': {
            const gapCandle = Math.floor(length * 0.3);
            for (let i = 0; i < length; i++) {
                if (i < gapCandle) series[i] = 1.0;
                else series[i] = 1.05 + ((i - gapCandle) / (length - gapCandle)) * 0.05;
            }
            break;
        }
        case 'chop': {
            for (let i = 0; i < length; i++) {
                series[i] = 1.0 + (Math.random() - 0.5) * 0.04;
            }
            break;
        }
        default: {
            for (let i = 0; i < length; i++) series[i] = 1.0;
        }
    }

    return series;
}

// ─── Synthetic Candle Generation ─────────────────────────────

/**
 * Generate synthetic OHLCV candles from a MarketScenarioDNA.
 * Applies the scenario's volatility profile, trend pattern,
 * news spikes, and noise to create realistic adversarial data.
 *
 * Base price: 50000 USDT (BTC-like)
 * Base volume: 100 BTC
 * Each candle: 1h equivalent
 */
export function generateSyntheticCandles(
    scenario: MarketScenarioDNA,
    basePrice: number = 50000,
    baseVolume: number = 100,
): OHLCV[] {
    const length = scenario.volatilityProfile.length;
    const trendSeries = generateTrendSeries(scenario.trendPattern, length);
    const candles: OHLCV[] = [];
    const startTime = Date.now() - length * 3_600_000; // 1h candles

    let runningPrice = basePrice;

    for (let i = 0; i < length; i++) {
        const trendMultiplier = trendSeries[i];
        const volatility = scenario.volatilityProfile[i];

        // Base price from trend
        const targetPrice = basePrice * trendMultiplier;

        // Smooth transition
        runningPrice = runningPrice * 0.7 + targetPrice * 0.3;

        // Apply noise scaled by volatility
        const noise = (Math.random() - 0.5) * volatility * runningPrice * 0.02;
        const candleCenter = runningPrice + noise;

        // Apply news spike if on this candle
        let spikeImpact = 0;
        if (scenario.newsSpike && scenario.newsSpike.candle === i) {
            const dir = scenario.newsSpike.direction === 'up' ? 1 : -1;
            spikeImpact = candleCenter * (scenario.newsSpike.magnitude / 100) * dir;
        }

        // Generate OHLCV
        const range = candleCenter * volatility * 0.015;
        const open = candleCenter - range * (Math.random() - 0.5);
        const close = candleCenter + range * (Math.random() - 0.5) + spikeImpact;
        const high = Math.max(open, close) + Math.abs(range * Math.random());
        const low = Math.min(open, close) - Math.abs(range * Math.random());
        const volume = baseVolume * (0.5 + Math.random()) * (1 + volatility * 0.5);

        candles.push({
            timestamp: startTime + i * 3_600_000,
            open: Math.max(open, 1),
            high: Math.max(high, 1),
            low: Math.max(low, 0.5),
            close: Math.max(close, 1),
            volume: Math.max(volume, 1),
        });

        runningPrice = close;
    }

    return candles;
}

// ─── Scenario DNA Operators ──────────────────────────────────

/**
 * Generate a random MarketScenarioDNA (parasite genesis).
 */
export function generateRandomScenario(
    length: number = 200,
): MarketScenarioDNA {
    const pattern = TREND_PATTERNS[Math.floor(Math.random() * TREND_PATTERNS.length)];

    // Random volatility profile
    const volatilityProfile = new Array(length);
    let baseVol = 0.5 + Math.random() * 1.5;
    for (let i = 0; i < length; i++) {
        baseVol += (Math.random() - 0.5) * 0.2;
        baseVol = Math.max(0.2, Math.min(3.0, baseVol));
        volatilityProfile[i] = baseVol;
    }

    // Random regime sequence (3-7 regimes)
    const regimeCount = 3 + Math.floor(Math.random() * 5);
    const allRegimes = Object.values(MarketRegime);
    const regimeSequence: MarketRegime[] = [];
    for (let i = 0; i < regimeCount; i++) {
        regimeSequence.push(allRegimes[Math.floor(Math.random() * allRegimes.length)]);
    }

    // 40% chance of news spike
    const newsSpike = Math.random() < 0.4 ? {
        candle: Math.floor(Math.random() * length),
        magnitude: 0.5 + Math.random() * 4.5,
        direction: Math.random() < 0.5 ? 'up' as const : 'down' as const,
    } : null;

    return {
        id: uuidv4(),
        generation: 0,
        parentIds: [],
        createdAt: Date.now(),
        volatilityProfile,
        trendPattern: pattern,
        regimeSequence,
        slippageMultiplier: 1.0 + Math.random() * 2.0,
        liquidityDrain: Math.random() * 0.5,
        newsSpike,
        metadata: {
            fitnessScore: 0,
            strategiesKilled: 0,
            avgDamage: 0,
            worstVictimId: null,
        },
    };
}

/**
 * Crossover two scenario DNAs to produce a child.
 */
export function crossoverScenarios(
    parentA: MarketScenarioDNA,
    parentB: MarketScenarioDNA,
): MarketScenarioDNA {
    const length = Math.min(parentA.volatilityProfile.length, parentB.volatilityProfile.length);

    // Uniform crossover on volatility profile
    const volatilityProfile = new Array(length);
    for (let i = 0; i < length; i++) {
        volatilityProfile[i] = Math.random() < 0.5
            ? parentA.volatilityProfile[i]
            : parentB.volatilityProfile[i];
    }

    // Take trend pattern from the parent that dealt more damage
    const trendPattern = parentA.metadata.fitnessScore >= parentB.metadata.fitnessScore
        ? parentA.trendPattern
        : parentB.trendPattern;

    // Interleave regime sequences
    const regimeSequence: MarketRegime[] = [];
    const maxLen = Math.max(parentA.regimeSequence.length, parentB.regimeSequence.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < parentA.regimeSequence.length && i < parentB.regimeSequence.length) {
            regimeSequence.push(Math.random() < 0.5 ? parentA.regimeSequence[i] : parentB.regimeSequence[i]);
        } else if (i < parentA.regimeSequence.length) {
            regimeSequence.push(parentA.regimeSequence[i]);
        } else {
            regimeSequence.push(parentB.regimeSequence[i]);
        }
    }

    return {
        id: uuidv4(),
        generation: Math.max(parentA.generation, parentB.generation) + 1,
        parentIds: [parentA.id, parentB.id],
        createdAt: Date.now(),
        volatilityProfile,
        trendPattern,
        regimeSequence,
        slippageMultiplier: Math.random() < 0.5 ? parentA.slippageMultiplier : parentB.slippageMultiplier,
        liquidityDrain: (parentA.liquidityDrain + parentB.liquidityDrain) / 2,
        newsSpike: Math.random() < 0.5 ? parentA.newsSpike : parentB.newsSpike,
        metadata: {
            fitnessScore: 0,
            strategiesKilled: 0,
            avgDamage: 0,
            worstVictimId: null,
        },
    };
}

/**
 * Mutate a scenario DNA with perturbations.
 */
export function mutateScenario(
    scenario: MarketScenarioDNA,
    mutationRate: number = 0.4,
): MarketScenarioDNA {
    const child = { ...scenario, id: uuidv4(), parentIds: [scenario.id] };

    // Mutate volatility profile
    child.volatilityProfile = [...scenario.volatilityProfile];
    for (let i = 0; i < child.volatilityProfile.length; i++) {
        if (Math.random() < mutationRate) {
            child.volatilityProfile[i] += (Math.random() - 0.5) * 0.6;
            child.volatilityProfile[i] = Math.max(0.1, Math.min(4.0, child.volatilityProfile[i]));
        }
    }

    // 20% chance to change trend pattern
    if (Math.random() < 0.2) {
        child.trendPattern = TREND_PATTERNS[Math.floor(Math.random() * TREND_PATTERNS.length)];
    }

    // Mutate slippage
    if (Math.random() < mutationRate) {
        child.slippageMultiplier += (Math.random() - 0.5) * 1.0;
        child.slippageMultiplier = Math.max(1.0, Math.min(5.0, child.slippageMultiplier));
    }

    // Mutate liquidity drain
    if (Math.random() < mutationRate) {
        child.liquidityDrain += (Math.random() - 0.5) * 0.3;
        child.liquidityDrain = Math.max(0.0, Math.min(0.8, child.liquidityDrain));
    }

    // 15% chance to add/modify news spike
    if (Math.random() < 0.15) {
        child.newsSpike = {
            candle: Math.floor(Math.random() * child.volatilityProfile.length),
            magnitude: 0.5 + Math.random() * 4.5,
            direction: Math.random() < 0.5 ? 'up' : 'down',
        };
    }

    // Reset metadata for fresh evaluation
    child.metadata = { fitnessScore: 0, strategiesKilled: 0, avgDamage: 0, worstVictimId: null };

    return child;
}

// ─── Coevolution Engine ──────────────────────────────────────

/**
 * CoevolutionEngine — manages the parasite population and
 * adversarial testing of host strategies.
 *
 * Lifecycle:
 * 1. Initialize with random parasite population
 * 2. Every N generations, run a coevolution round:
 *    a. Pit all host strategies against all parasites
 *    b. Evaluate parasite fitness (damage dealt)
 *    c. Evolve parasites (crossover/mutate the most damaging)
 *    d. Compute robustness scores for host strategies
 * 3. Robustness scores modify host fitness in the evaluator
 */
export class CoevolutionEngine {
    private config: CoevolutionConfig;
    private parasites: MarketScenarioDNA[] = [];
    private parasiteGeneration: number = 0;
    private totalRoundsRun: number = 0;
    private lastRoundGeneration: number = 0;

    constructor(config: Partial<CoevolutionConfig> = {}) {
        this.config = { ...DEFAULT_COEVOLUTION_CONFIG, ...config };
        this.initializeParasites();
    }

    /**
     * Initialize the parasite population with random scenarios.
     */
    private initializeParasites(): void {
        this.parasites = [];
        for (let i = 0; i < this.config.parasitePopulationSize; i++) {
            this.parasites.push(generateRandomScenario(this.config.scenarioDurationCandles));
        }
    }

    /**
     * Check if a coevolution round should run this generation.
     */
    shouldRunCoevolution(currentGeneration: number): boolean {
        if (!this.config.enabled) return false;
        return (currentGeneration - this.lastRoundGeneration) >= this.config.coevolutionInterval;
    }

    /**
     * Run a full coevolution round: pit strategies against parasites,
     * evaluate, and evolve the parasite population.
     *
     * Returns robustness scores for each host strategy.
     */
    runCoevolutionRound(
        hostStrategies: StrategyDNA[],
        currentGeneration: number,
    ): Map<string, RobustnessScore> {
        if (hostStrategies.length === 0) {
            return new Map();
        }

        const robustnessScores = new Map<string, RobustnessScore>();

        // Step 1: Test all hosts against all parasites
        const damageMatrix: Map<string, Map<string, number>> = new Map(); // parasite → (strategy → damage)

        for (const parasite of this.parasites) {
            const parasiteDamage = new Map<string, number>();
            const syntheticCandles = generateSyntheticCandles(parasite);

            for (const strategy of hostStrategies) {
                try {
                    const adversarialConfig: BacktestConfig = {
                        initialCapital: 10000,
                        execution: {
                            ...DEFAULT_EXECUTION_CONFIG,
                            slippageBps: DEFAULT_EXECUTION_CONFIG.slippageBps * parasite.slippageMultiplier,
                            marketImpactEnabled: parasite.liquidityDrain > 0.3,
                            avgDailyVolume: DEFAULT_EXECUTION_CONFIG.avgDailyVolume * (1 - parasite.liquidityDrain),
                        },
                        maxOpenPositions: 1,
                        warmupCandles: 200,
                        enableRegimeTagging: false,
                        enableEquityCurve: false,
                    };
                    const result = runBacktest(strategy, syntheticCandles, adversarialConfig);

                    // Damage = negative of the PnL (parasites want strategies to lose)
                    const damage = Math.max(0, -result.metrics.totalPnlPercent);
                    parasiteDamage.set(strategy.id, damage);
                } catch {
                    // If backtest fails on adversarial data, strategy gets max damage
                    parasiteDamage.set(strategy.id, 100);
                }
            }

            damageMatrix.set(parasite.id, parasiteDamage);
        }

        // Step 2: Evaluate parasite fitness (total damage dealt)
        for (const parasite of this.parasites) {
            const damages = damageMatrix.get(parasite.id);
            if (!damages) continue;

            let totalDamage = 0;
            let killed = 0;
            let worstDamage = 0;
            let worstVictimId: string | null = null;

            for (const [stratId, damage] of damages) {
                totalDamage += damage;
                if (damage > 10) killed++; // >10% loss = "killed"
                if (damage > worstDamage) {
                    worstDamage = damage;
                    worstVictimId = stratId;
                }
            }

            parasite.metadata.fitnessScore = totalDamage / Math.max(1, hostStrategies.length);
            parasite.metadata.strategiesKilled = killed;
            parasite.metadata.avgDamage = totalDamage / Math.max(1, hostStrategies.length);
            parasite.metadata.worstVictimId = worstVictimId;
        }

        // Step 3: Compute robustness scores for host strategies
        for (const strategy of hostStrategies) {
            const damages: number[] = [];
            for (const parasite of this.parasites) {
                const parasiteDamage = damageMatrix.get(parasite.id);
                if (parasiteDamage) {
                    damages.push(parasiteDamage.get(strategy.id) ?? 0);
                }
            }

            // Sort parasites by fitness (most damaging first) and take top 5
            const sortedParasites = [...this.parasites]
                .sort((a, b) => b.metadata.fitnessScore - a.metadata.fitnessScore)
                .slice(0, 5);

            const top5Damages: number[] = sortedParasites.map(p => {
                const pd = damageMatrix.get(p.id);
                return pd?.get(strategy.id) ?? 0;
            });

            // Survival rate: fraction of top-5 scenarios with <5% loss
            const survivalRate = top5Damages.filter(d => d < 5).length / Math.max(1, top5Damages.length);

            // Worst case drawdown
            const worstCaseDrawdown = Math.max(...damages, 0);

            // Recovery speed: inverse of average damage (normalized 0-1)
            const avgDamage = damages.reduce((s, d) => s + d, 0) / Math.max(1, damages.length);
            const recoverySpeed = Math.max(0, 1 - avgDamage / 50); // 50% damage = 0 recovery

            // Composite robustness score
            const compositeRobustness =
                survivalRate * 40 +
                recoverySpeed * 30 +
                Math.max(0, 30 - worstCaseDrawdown);

            robustnessScores.set(strategy.id, {
                backtestFitness: strategy.metadata.fitnessScore,
                survivalRate,
                worstCaseDrawdown,
                recoverySpeed,
                compositeRobustness: Math.max(0, Math.min(100, compositeRobustness)),
            });
        }

        // Step 4: Evolve parasites (select → crossover → mutate)
        this.evolveParasites();

        this.totalRoundsRun++;
        this.lastRoundGeneration = currentGeneration;

        return robustnessScores;
    }

    /**
     * Evolve the parasite population.
     * Uses tournament selection + crossover + mutation.
     * Keeps the 2 most damaging parasites (elitism).
     */
    private evolveParasites(): void {
        // Sort by fitness (most damage first)
        const sorted = [...this.parasites].sort(
            (a, b) => b.metadata.fitnessScore - a.metadata.fitnessScore,
        );

        const nextGen: MarketScenarioDNA[] = [];

        // Elitism: keep top 2
        nextGen.push(sorted[0], sorted[1]);

        // Fill remaining with crossover + mutation
        while (nextGen.length < this.config.parasitePopulationSize) {
            if (Math.random() < this.config.crossoverRate && sorted.length >= 2) {
                // Tournament select two parents
                const parentA = this.tournamentSelect(sorted);
                const parentB = this.tournamentSelect(sorted, parentA.id);
                let child = crossoverScenarios(parentA, parentB);

                if (Math.random() < this.config.mutationRate) {
                    child = mutateScenario(child, this.config.mutationRate);
                }
                nextGen.push(child);
            } else {
                // Pure mutation from a selected parent
                const parent = this.tournamentSelect(sorted);
                nextGen.push(mutateScenario(parent, this.config.mutationRate));
            }
        }

        this.parasites = nextGen.slice(0, this.config.parasitePopulationSize);
        this.parasiteGeneration++;
    }

    /**
     * Tournament selection for parasites.
     */
    private tournamentSelect(
        population: MarketScenarioDNA[],
        excludeId?: string,
    ): MarketScenarioDNA {
        const candidates = population.filter(p => p.id !== excludeId);
        const tournamentSize = Math.min(3, candidates.length);

        let best = candidates[Math.floor(Math.random() * candidates.length)];
        for (let i = 1; i < tournamentSize; i++) {
            const challenger = candidates[Math.floor(Math.random() * candidates.length)];
            if (challenger.metadata.fitnessScore > best.metadata.fitnessScore) {
                best = challenger;
            }
        }

        return best;
    }

    /**
     * Get the current parasite population.
     */
    getParasites(): MarketScenarioDNA[] {
        return [...this.parasites];
    }

    /**
     * Get coevolution statistics for dashboard display.
     */
    getStats(): {
        parasiteGeneration: number;
        totalRoundsRun: number;
        avgParasiteFitness: number;
        maxParasiteFitness: number;
        totalStrategiesKilled: number;
    } {
        const fitnesses = this.parasites.map(p => p.metadata.fitnessScore);
        return {
            parasiteGeneration: this.parasiteGeneration,
            totalRoundsRun: this.totalRoundsRun,
            avgParasiteFitness: fitnesses.length > 0
                ? fitnesses.reduce((s, f) => s + f, 0) / fitnesses.length
                : 0,
            maxParasiteFitness: fitnesses.length > 0 ? Math.max(...fitnesses) : 0,
            totalStrategiesKilled: this.parasites.reduce(
                (s, p) => s + p.metadata.strategiesKilled, 0,
            ),
        };
    }
}
