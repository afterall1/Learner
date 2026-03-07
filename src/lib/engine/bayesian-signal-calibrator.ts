// ============================================================
// Learner: Bayesian Signal Calibrator — Online Belief Engine
// ============================================================
// Phase 19 Module A: Maintains calibrated beliefs about signal
// reliability using Beta-Bernoulli conjugate Bayesian updating.
//
// Key innovation: Every trade outcome updates beliefs about
// which signals are reliable in which market regime, enabling:
//   - Calibrated confidence scores for trading decisions
//   - Thompson sampling for exploration/exploitation balance
//   - Time-decayed beliefs that adapt to market non-stationarity
//   - Per-regime signal reliability matrix for the dashboard
//
// Mathematical foundation:
//   Prior:     Beta(α₀, β₀) — initial belief before any data
//   Posterior: Beta(α₀ + successes, β₀ + failures) — after trades
//   Mean:      α / (α + β) — calibrated success probability
//   Variance:  αβ / ((α + β)²(α + β + 1)) — uncertainty
//   Thompson:  Sample from Beta posterior → natural E/E balance
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type BetaParams,
    type SignalBeliefKey,
    type SignalBelief,
    type CalibrationConfig,
    type ReliabilityMatrix,
    type StrategyDNA,
    type Trade,
    IndicatorType,
    SignalCondition,
    MarketRegime,
    DEFAULT_CALIBRATION_CONFIG,
} from '@/types';

// ─── Beta Distribution Utilities ─────────────────────────────

/**
 * Compute the mean of a Beta distribution.
 * Mean = α / (α + β) — the expected success probability.
 */
function betaMean(params: BetaParams): number {
    const total = params.alpha + params.beta;
    return total > 0 ? params.alpha / total : 0.5;
}

/**
 * Compute the variance of a Beta distribution.
 * Var = αβ / ((α+β)²(α+β+1))
 */
function betaVariance(params: BetaParams): number {
    const total = params.alpha + params.beta;
    if (total <= 0) return 0.25;
    return (params.alpha * params.beta) / (total * total * (total + 1));
}

/**
 * Draw a sample from a Beta distribution using the Jöhnk algorithm.
 * This is used for Thompson sampling — exploring uncertain beliefs.
 *
 * For large α, β this approximates Thompson sampling via Normal approximation.
 */
function betaSample(params: BetaParams): number {
    const { alpha, beta } = params;

    // Edge cases
    if (alpha <= 0 && beta <= 0) return 0.5;
    if (alpha <= 0) return 0;
    if (beta <= 0) return 1;

    // For small parameters, use inverse CDF approximation
    // For computational efficiency in a browser environment
    if (alpha < 50 && beta < 50) {
        return betaSampleJoehnk(alpha, beta);
    }

    // For large parameters, use Normal approximation
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const stdDev = Math.sqrt(variance);

    // Box-Muller transform for normal sample
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    return Math.max(0, Math.min(1, mean + stdDev * z));
}

/**
 * Jöhnk's algorithm for Beta sampling with small parameters.
 * Rejection-based method that works well for α, β < 50.
 */
function betaSampleJoehnk(alpha: number, beta: number): number {
    // Use gamma variate ratio method
    const x = gammaSample(alpha);
    const y = gammaSample(beta);
    const total = x + y;
    return total > 0 ? x / total : 0.5;
}

/**
 * Simple gamma distribution sampler using Marsaglia-Tsang method.
 */
function gammaSample(shape: number): number {
    if (shape < 1) {
        // Ahrens-Dieter for shape < 1
        const sample = gammaSample(shape + 1);
        return sample * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    for (let attempts = 0; attempts < 100; attempts++) {
        let x: number;
        let v: number;

        do {
            const u1 = Math.random();
            const u2 = Math.random();
            x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            v = (1 + c * x) ** 3;
        } while (v <= 0);

        const u = Math.random();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }

    // Fallback after max attempts
    return shape;
}

// ─── Belief Key Serialization ────────────────────────────────

function serializeKey(key: SignalBeliefKey): string {
    return `${key.indicatorType}|${key.condition}|${key.regime}`;
}

// ─── Signal Belief Tracker ───────────────────────────────────

/**
 * SignalBeliefTracker — Maintains Bayesian beliefs about signal
 * reliability across all (indicator, condition, regime) combinations.
 *
 * Core loop:
 * 1. Trade opens based on signals
 * 2. Trade closes with PnL result
 * 3. For each contributing signal:
 *    - If PnL > threshold → update Beta posterior: α += 1
 *    - If PnL ≤ threshold → update Beta posterior: β += 1
 * 4. Calibrated confidence = α / (α + β)
 * 5. Thompson sampling draws from posterior for exploration
 *
 * Time decay ensures beliefs adapt to non-stationary markets:
 *   α_decayed = 1 + (α - 1) × exp(-λt)
 *   β_decayed = 1 + (β - 1) × exp(-λt)
 */
export class SignalBeliefTracker {
    private beliefs: Map<string, SignalBelief> = new Map();
    private config: CalibrationConfig;
    private totalObservations: number = 0;

    constructor(config: Partial<CalibrationConfig> = {}) {
        this.config = { ...DEFAULT_CALIBRATION_CONFIG, ...config };
    }

    /**
     * Update beliefs based on a completed trade.
     *
     * For each indicator gene that contributed to the trade signal,
     * we update the corresponding Beta posterior with success/failure.
     */
    updateFromTrade(
        strategy: StrategyDNA,
        trade: Trade,
        regime: MarketRegime,
    ): void {
        const isSuccess = (trade.pnlPercent ?? 0) > this.config.successThreshold;

        // Update belief for each indicator that contributed
        for (const gene of strategy.indicators) {
            // Each indicator contributes to entry/exit signals
            for (const rule of strategy.entryRules.entrySignals) {
                const key: SignalBeliefKey = {
                    indicatorType: gene.type,
                    condition: rule.condition,
                    regime,
                };

                this.updateSingleBelief(key, isSuccess);
            }
        }

        this.totalObservations++;
    }

    /**
     * Update a single belief with a success/failure observation.
     */
    private updateSingleBelief(key: SignalBeliefKey, isSuccess: boolean): void {
        const serialized = serializeKey(key);
        let belief = this.beliefs.get(serialized);

        if (!belief) {
            belief = this.createBelief(key);
            this.beliefs.set(serialized, belief);
        }

        // Bayesian update: conjugate Beta-Bernoulli
        if (isSuccess) {
            belief.posterior.alpha += 1;
        } else {
            belief.posterior.beta += 1;
        }

        belief.sampleCount++;
        belief.lastUpdated = Date.now();
        belief.calibratedConfidence = betaMean(belief.posterior);
        belief.thompsonSample = betaSample(belief.posterior);
    }

    /**
     * Get calibrated confidence for a specific signal in a regime.
     * Returns the Beta posterior mean: α / (α + β).
     */
    getSignalConfidence(
        indicatorType: IndicatorType,
        condition: SignalCondition,
        regime: MarketRegime,
    ): number {
        const key: SignalBeliefKey = { indicatorType, condition, regime };
        const serialized = serializeKey(key);
        const belief = this.beliefs.get(serialized);

        if (!belief || belief.sampleCount < this.config.minSamplesForConfidence) {
            return 0.5; // Uncertain — return prior mean
        }

        return belief.calibratedConfidence;
    }

    /**
     * Get aggregate confidence for a strategy in a regime.
     * Combines per-signal confidence using geometric mean
     * (penalizes having ANY low-confidence signal).
     */
    getStrategyConfidence(
        strategy: StrategyDNA,
        regime: MarketRegime,
    ): number {
        const confidences: number[] = [];

        for (const gene of strategy.indicators) {
            for (const rule of strategy.entryRules.entrySignals) {
                const conf = this.getSignalConfidence(gene.type, rule.condition, regime);
                confidences.push(conf);
            }
        }

        if (confidences.length === 0) return 0.5;

        // Geometric mean — punishes any single low confidence
        const product = confidences.reduce((p, c) => p * c, 1);
        return Math.pow(product, 1 / confidences.length);
    }

    /**
     * Thompson sampling for strategy selection.
     * Draws a sample from each strategy's posterior belief
     * distribution and selects the one with the highest sample.
     *
     * This naturally balances exploration (uncertain strategies
     * get lucky draws) with exploitation (proven strategies
     * have higher means).
     */
    thompsonSelectStrategy(
        strategies: StrategyDNA[],
        regime: MarketRegime,
    ): StrategyDNA | null {
        if (strategies.length === 0) return null;

        let bestStrategy: StrategyDNA | null = null;
        let bestSample = -Infinity;

        for (const strategy of strategies) {
            let aggregateSample = 0;
            let sampleCount = 0;

            for (const gene of strategy.indicators) {
                for (const rule of strategy.entryRules.entrySignals) {
                    const key: SignalBeliefKey = {
                        indicatorType: gene.type,
                        condition: rule.condition,
                        regime,
                    };
                    const serialized = serializeKey(key);
                    const belief = this.beliefs.get(serialized);

                    if (belief) {
                        aggregateSample += betaSample(belief.posterior);
                    } else {
                        // No data — sample from prior (exploratory)
                        aggregateSample += betaSample({
                            alpha: this.config.priorAlpha,
                            beta: this.config.priorBeta,
                        });
                    }
                    sampleCount++;
                }
            }

            const avgSample = sampleCount > 0 ? aggregateSample / sampleCount : 0.5;

            if (avgSample > bestSample) {
                bestSample = avgSample;
                bestStrategy = strategy;
            }
        }

        return bestStrategy;
    }

    /**
     * Apply temporal decay to all beliefs.
     * This ensures beliefs adapt to non-stationary markets.
     *
     * α_decayed = priorAlpha + (α - priorAlpha) × exp(-λ × daysSinceUpdate)
     * β_decayed = priorBeta + (β - priorBeta) × exp(-λ × daysSinceUpdate)
     *
     * Call this periodically (e.g., every generation or every hour).
     */
    decayBeliefs(): void {
        const now = Date.now();

        for (const belief of this.beliefs.values()) {
            const daysSinceUpdate = (now - belief.lastUpdated) / (24 * 60 * 60 * 1000);

            if (daysSinceUpdate <= 0) continue;

            const decayFactor = Math.exp(-this.config.decayRate * daysSinceUpdate);

            // Decay posterior toward prior
            belief.posterior.alpha =
                this.config.priorAlpha +
                (belief.posterior.alpha - this.config.priorAlpha) * decayFactor;
            belief.posterior.beta =
                this.config.priorBeta +
                (belief.posterior.beta - this.config.priorBeta) * decayFactor;

            // Recalculate confidence
            belief.calibratedConfidence = betaMean(belief.posterior);
        }
    }

    /**
     * Get the full reliability matrix for the dashboard.
     */
    getReliabilityMatrix(): ReliabilityMatrix {
        const beliefs = Array.from(this.beliefs.values());

        // Calculate coverage
        const totalPossibleCombos =
            Object.keys(IndicatorType).length *
            Object.keys(SignalCondition).length *
            Object.keys(MarketRegime).length;

        const avgConfidence = beliefs.length > 0
            ? beliefs.reduce((s, b) => s + b.calibratedConfidence, 0) / beliefs.length
            : 0.5;

        // Sort by confidence for most/least reliable
        const sorted = [...beliefs]
            .filter(b => b.sampleCount >= this.config.minSamplesForConfidence)
            .sort((a, b) => b.calibratedConfidence - a.calibratedConfidence);

        return {
            beliefs,
            totalObservations: this.totalObservations,
            avgConfidence,
            mostReliableSignals: sorted.slice(0, 5).map(b => ({
                key: b.key,
                confidence: b.calibratedConfidence,
            })),
            leastReliableSignals: sorted.slice(-5).reverse().map(b => ({
                key: b.key,
                confidence: b.calibratedConfidence,
            })),
            coveragePercent: (beliefs.length / totalPossibleCombos) * 100,
        };
    }

    /**
     * Get belief for a specific signal combination.
     */
    getBelief(key: SignalBeliefKey): SignalBelief | null {
        return this.beliefs.get(serializeKey(key)) ?? null;
    }

    /**
     * Get total number of tracked beliefs.
     */
    getBeliefCount(): number {
        return this.beliefs.size;
    }

    /**
     * Get average calibrated confidence across all beliefs.
     */
    getAverageConfidence(): number {
        if (this.beliefs.size === 0) return 0.5;
        let total = 0;
        for (const belief of this.beliefs.values()) {
            total += belief.calibratedConfidence;
        }
        return total / this.beliefs.size;
    }

    /**
     * Create a new belief with the configured prior.
     */
    private createBelief(key: SignalBeliefKey): SignalBelief {
        const prior: BetaParams = {
            alpha: this.config.priorAlpha,
            beta: this.config.priorBeta,
        };

        return {
            key,
            prior: { ...prior },
            posterior: { ...prior },
            sampleCount: 0,
            lastUpdated: Date.now(),
            calibratedConfidence: betaMean(prior),
            thompsonSample: betaSample(prior),
        };
    }
}
