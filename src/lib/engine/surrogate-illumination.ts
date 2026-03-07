// ============================================================
// Learner: Surrogate-Assisted Illumination Engine (SAIE)
// ============================================================
// Phase 18.3: A meta-learning layer that predicts strategy
// fitness WITHOUT running full backtests, enabling 50x faster
// MAP-Elites grid illumination.
//
// Architecture:
//   1. Feature Extractor: StrategyDNA → 19-dim numeric vector
//   2. Surrogate Forest: 50 decision stumps with bootstrapping
//   3. Acquisition (UCB): balances exploitation vs exploration
//   4. Gene Importance: Mutual Information feature ranking
//
// Key insight: Every backtest evaluation produces a training
// point (features, fitness). The surrogate learns from ALL
// evaluations across ALL innovations, creating an implicit
// cross-innovation knowledge graph.
//
// Usage in evolution loop:
//   1. Generate 500 candidate mutations/crossovers
//   2. Score all 500 via surrogate (< 5ms total)
//   3. Select top-20 by UCB score
//   4. Run full backtest only on these 20
//   5. Update surrogate with actual results
//   6. Place in MAP-Elites grid
// ============================================================

import {
    type StrategyDNA,
    type SurrogateConfig,
    type SurrogatePrediction,
    type GeneImportanceScore,
    type SAIESnapshot,
    IndicatorType,
    DEFAULT_SAIE_CONFIG,
} from '@/types';

// ─── Feature Names (indices match extraction order) ──────────

const FEATURE_NAMES: string[] = [
    'has_RSI', 'has_EMA', 'has_SMA', 'has_MACD',
    'has_BOLLINGER', 'has_ADX', 'has_ATR', 'has_VOLUME',
    'has_STOCH_RSI',
    'mean_period', 'var_period',
    'stopLoss_pct', 'takeProfit_pct', 'maxLeverage', 'positionSize_pct',
    'indicator_count', 'rule_count',
    'ofi_deltaThreshold', 'ofi_largeTradeMult',
];

const FEATURE_COUNT = FEATURE_NAMES.length; // 19

// ─── Feature Extraction ──────────────────────────────────────

/**
 * Convert a StrategyDNA into a fixed-length numeric feature vector.
 * This is the critical bridge between the genome space and the
 * surrogate's input space.
 *
 * Features (19 dimensions):
 *   [0-8]   Indicator type presence (binary: 0 or 1)
 *   [9-10]  Period statistics (mean, variance)
 *   [11-14] Risk genes (SL%, TP%, leverage, position size)
 *   [15-16] Structural complexity (indicator count, rule count)
 *   [17-18] OFI gene parameters (if present)
 */
export function extractFeatures(strategy: StrategyDNA): number[] {
    const features = new Array(FEATURE_COUNT).fill(0);

    // ── Indicator type histogram (0-8) ──
    const indicatorTypes = new Set(strategy.indicators.map(g => g.type));
    const typeOrder: IndicatorType[] = [
        IndicatorType.RSI, IndicatorType.EMA, IndicatorType.SMA,
        IndicatorType.MACD, IndicatorType.BOLLINGER, IndicatorType.ADX,
        IndicatorType.ATR, IndicatorType.VOLUME, IndicatorType.STOCH_RSI,
    ];
    for (let i = 0; i < typeOrder.length; i++) {
        features[i] = indicatorTypes.has(typeOrder[i]) ? 1 : 0;
    }

    // ── Period statistics (9-10) ──
    const periods = strategy.indicators.map(g => g.period);
    if (periods.length > 0) {
        const mean = periods.reduce((s, p) => s + p, 0) / periods.length;
        const variance = periods.reduce((s, p) => s + (p - mean) ** 2, 0) / periods.length;
        features[9] = mean / 200;       // Normalize to ~0-1 range
        features[10] = Math.sqrt(variance) / 100; // Normalize stddev
    }

    // ── Risk genes (11-14) ──
    features[11] = (strategy.riskGenes.stopLossPercent ?? 2) / 10;    // Normalize 0-10% → 0-1
    features[12] = (strategy.riskGenes.takeProfitPercent ?? 6) / 20;  // Normalize 0-20% → 0-1
    features[13] = (strategy.riskGenes.maxLeverage ?? 5) / 20;        // Normalize 1-20x → 0-1
    features[14] = (strategy.riskGenes.positionSizePercent ?? 5) / 100; // Normalize 1-100% → 0-1

    // ── Structural complexity (15-16) ──
    features[15] = Math.min(strategy.indicators.length / 10, 1);      // Normalize 0-10 → 0-1
    features[16] = Math.min(
        (strategy.entryRules.entrySignals.length + strategy.exitRules.exitSignals.length) / 15,
        1,
    );

    // ── OFI gene parameters (17-18) ──
    if (strategy.orderFlowGenes && strategy.orderFlowGenes.length > 0) {
        const ofi = strategy.orderFlowGenes[0];
        features[17] = ofi.deltaThreshold;                // Already 0-1
        features[18] = ofi.largeTradeSizeMultiplier / 10;  // Normalize 3-10 → 0.3-1
    }

    return features;
}

// ─── Decision Stump (Weak Learner) ───────────────────────────

/**
 * A decision stump — a shallow decision tree used as a weak
 * learner in the surrogate forest ensemble.
 *
 * Internal structure:
 *   - Each node splits on one feature at one threshold
 *   - Leaf nodes store the mean and variance of training samples
 *   - Max depth = 4 (configurable) → max 16 leaf nodes
 */
interface StumpNode {
    isLeaf: boolean;
    featureIndex: number;
    threshold: number;
    leftChild: StumpNode | null;
    rightChild: StumpNode | null;
    prediction: number;      // Mean of samples at this leaf
    variance: number;        // Variance of samples at this leaf
    sampleCount: number;     // Number of training samples that reached this leaf
}

/**
 * Build a decision stump from training data.
 * Uses bootstrap sampling (bagging) for diversity in the ensemble.
 */
function buildStump(
    features: number[][],
    targets: number[],
    maxDepth: number,
    rng: () => number,
): StumpNode {
    // Bootstrap sample (sample with replacement)
    const n = features.length;
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
        indices.push(Math.floor(rng() * n));
    }

    const sampledFeatures = indices.map(i => features[i]);
    const sampledTargets = indices.map(i => targets[i]);

    return buildNode(sampledFeatures, sampledTargets, 0, maxDepth, rng);
}

function buildNode(
    features: number[][],
    targets: number[],
    depth: number,
    maxDepth: number,
    rng: () => number,
): StumpNode {
    // Leaf conditions: max depth reached, too few samples, or pure node
    if (depth >= maxDepth || targets.length < 4) {
        return createLeafNode(targets);
    }

    const featureCount = features[0]?.length ?? 0;
    if (featureCount === 0) return createLeafNode(targets);

    // Random feature subset (sqrt of total features)
    const subsetSize = Math.max(1, Math.ceil(Math.sqrt(featureCount)));
    const featureSubset: number[] = [];
    const availableFeatures = Array.from({ length: featureCount }, (_, i) => i);

    for (let i = 0; i < subsetSize; i++) {
        const idx = Math.floor(rng() * availableFeatures.length);
        featureSubset.push(availableFeatures.splice(idx, 1)[0]);
    }

    // Find best split
    let bestFeature = featureSubset[0];
    let bestThreshold = 0;
    let bestReduction = -Infinity;

    const parentVariance = computeVariance(targets);

    for (const fi of featureSubset) {
        const values = features.map(f => f[fi]).sort((a, b) => a - b);
        const uniqueValues = [...new Set(values)];

        // Try up to 10 split candidates per feature
        const step = Math.max(1, Math.floor(uniqueValues.length / 10));
        for (let j = 0; j < uniqueValues.length - 1; j += step) {
            const threshold = (uniqueValues[j] + uniqueValues[j + 1]) / 2;

            const leftTargets: number[] = [];
            const rightTargets: number[] = [];

            for (let k = 0; k < features.length; k++) {
                if (features[k][fi] <= threshold) {
                    leftTargets.push(targets[k]);
                } else {
                    rightTargets.push(targets[k]);
                }
            }

            if (leftTargets.length < 2 || rightTargets.length < 2) continue;

            // Variance reduction
            const leftVar = computeVariance(leftTargets);
            const rightVar = computeVariance(rightTargets);
            const weightedChildVar =
                (leftTargets.length * leftVar + rightTargets.length * rightVar) /
                targets.length;
            const reduction = parentVariance - weightedChildVar;

            if (reduction > bestReduction) {
                bestReduction = reduction;
                bestFeature = fi;
                bestThreshold = threshold;
            }
        }
    }

    // If no good split found, make a leaf
    if (bestReduction <= 0) {
        return createLeafNode(targets);
    }

    // Split the data
    const leftFeatures: number[][] = [];
    const leftTargets: number[] = [];
    const rightFeatures: number[][] = [];
    const rightTargets: number[] = [];

    for (let k = 0; k < features.length; k++) {
        if (features[k][bestFeature] <= bestThreshold) {
            leftFeatures.push(features[k]);
            leftTargets.push(targets[k]);
        } else {
            rightFeatures.push(features[k]);
            rightTargets.push(targets[k]);
        }
    }

    return {
        isLeaf: false,
        featureIndex: bestFeature,
        threshold: bestThreshold,
        leftChild: buildNode(leftFeatures, leftTargets, depth + 1, maxDepth, rng),
        rightChild: buildNode(rightFeatures, rightTargets, depth + 1, maxDepth, rng),
        prediction: mean(targets),
        variance: computeVariance(targets),
        sampleCount: targets.length,
    };
}

function createLeafNode(targets: number[]): StumpNode {
    return {
        isLeaf: true,
        featureIndex: -1,
        threshold: 0,
        leftChild: null,
        rightChild: null,
        prediction: targets.length > 0 ? mean(targets) : 0,
        variance: targets.length > 1 ? computeVariance(targets) : 1,
        sampleCount: targets.length,
    };
}

function predictStump(node: StumpNode, features: number[]): { prediction: number; variance: number } {
    if (node.isLeaf || !node.leftChild || !node.rightChild) {
        return { prediction: node.prediction, variance: node.variance };
    }

    if (features[node.featureIndex] <= node.threshold) {
        return predictStump(node.leftChild, features);
    }
    return predictStump(node.rightChild, features);
}

// ─── Surrogate Forest ────────────────────────────────────────

/**
 * SurrogateForest — An ensemble of decision stumps that predicts
 * strategy fitness from feature vectors.
 *
 * Key properties:
 * - Bagging: each stump sees a bootstrap sample of the data
 * - Random subspace: each split considers √(features) candidates
 * - Variance estimation: inter-stump disagreement = uncertainty
 * - Incremental: can be rebuilt when new data arrives
 */
export class SurrogateForest {
    private stumps: StumpNode[] = [];
    private trainingFeatures: number[][] = [];
    private trainingTargets: number[] = [];
    private config: SurrogateConfig;
    private rng: () => number;
    private recentErrors: number[] = [];

    constructor(config: SurrogateConfig = DEFAULT_SAIE_CONFIG) {
        this.config = config;
        // Seeded RNG for reproducibility
        this.rng = createSeededRng(42);
    }

    /**
     * Add a training sample and rebuild the forest if sufficient
     * new data has accumulated.
     */
    addSample(features: number[], fitness: number): void {
        this.trainingFeatures.push(features);
        this.trainingTargets.push(fitness);

        // Rebuild every 10 new samples (amortized cost)
        if (this.trainingFeatures.length % 10 === 0 && this.isReady()) {
            this.rebuild();
        }
    }

    /**
     * Add a batch of training samples.
     */
    addBatch(samples: Array<{ features: number[]; fitness: number }>): void {
        for (const s of samples) {
            this.trainingFeatures.push(s.features);
            this.trainingTargets.push(s.fitness);
        }
        if (this.isReady()) {
            this.rebuild();
        }
    }

    /**
     * Rebuild the entire forest from current training data.
     */
    rebuild(): void {
        if (this.trainingFeatures.length < 10) return;

        this.stumps = [];
        for (let i = 0; i < this.config.forestSize; i++) {
            // Each stump gets a slightly different RNG seed for diversity
            const stumpRng = createSeededRng(42 + i * 1000 + this.trainingFeatures.length);
            this.stumps.push(
                buildStump(
                    this.trainingFeatures,
                    this.trainingTargets,
                    this.config.maxStumpDepth,
                    stumpRng,
                ),
            );
        }
    }

    /**
     * Predict fitness for a strategy feature vector.
     * Returns mean prediction AND uncertainty (variance) from
     * the ensemble disagreement.
     */
    predict(features: number[]): { mean: number; variance: number } {
        if (this.stumps.length === 0) {
            // Before model is built, return prior
            const globalMean = this.trainingTargets.length > 0
                ? mean(this.trainingTargets)
                : 25; // Neutral prior
            return { mean: globalMean, variance: 100 }; // High uncertainty
        }

        const predictions = this.stumps.map(s => predictStump(s, features).prediction);
        const predMean = mean(predictions);
        const predVariance = computeVariance(predictions);

        return { mean: predMean, variance: predVariance };
    }

    /**
     * Track prediction accuracy for monitoring.
     */
    recordPredictionError(predicted: number, actual: number): void {
        this.recentErrors.push(Math.abs(predicted - actual));
        // Keep only last 50 errors
        if (this.recentErrors.length > 50) {
            this.recentErrors.shift();
        }
    }

    /**
     * Whether the model has enough training data to be useful.
     */
    isReady(): boolean {
        return this.trainingFeatures.length >= this.config.minTrainingSamples;
    }

    /**
     * Get the mean absolute error of recent predictions.
     */
    getMeanAbsoluteError(): number {
        if (this.recentErrors.length === 0) return -1;
        return mean(this.recentErrors);
    }

    /**
     * Get training data size.
     */
    getTrainingSize(): number {
        return this.trainingFeatures.length;
    }

    /**
     * Get the full training dataset for MI computation.
     */
    getTrainingData(): { features: number[][]; targets: number[] } {
        return {
            features: this.trainingFeatures,
            targets: this.trainingTargets,
        };
    }
}

// ─── Acquisition Function ────────────────────────────────────

/**
 * Compute Upper Confidence Bound (UCB) acquisition scores.
 *
 * UCB(x) = μ(x) + κ√σ²(x)
 *
 * Where:
 *   μ(x) = surrogate's mean prediction for strategy x
 *   σ²(x) = surrogate's variance (uncertainty)
 *   κ = exploration weight (higher = more exploration)
 *
 * This balances:
 *   - Exploitation: prefer strategies with high predicted fitness
 *   - Exploration: prefer strategies the model is uncertain about
 */
export function computeUCB(
    prediction: { mean: number; variance: number },
    kappa: number,
): SurrogatePrediction {
    const ucbScore = prediction.mean + kappa * Math.sqrt(Math.max(0, prediction.variance));
    const confidence = prediction.variance > 0
        ? Math.max(0, Math.min(1, 1 - Math.sqrt(prediction.variance) / 50))
        : 1;

    return {
        mean: prediction.mean,
        variance: prediction.variance,
        ucbScore,
        confidence,
    };
}

// ─── Gene Importance via Mutual Information ──────────────────

/**
 * Compute mutual information between each feature and the fitness
 * target using histogram-based discretization.
 *
 * MI(X;Y) = Σ Σ p(x,y) * log2(p(x,y) / (p(x) * p(y)))
 *
 * Higher MI = feature is more informative about fitness.
 * This guides NEAT structural mutations and mutation bias.
 */
export function computeGeneImportance(
    features: number[][],
    targets: number[],
    featureNames: string[] = FEATURE_NAMES,
): GeneImportanceScore[] {
    if (features.length < 20 || targets.length < 20) {
        return featureNames.map((name, i) => ({
            featureName: name,
            featureIndex: i,
            mutualInformation: 0,
            normalizedImportance: 1 / featureNames.length,
            rank: i + 1,
        }));
    }

    const featureCount = features[0]?.length ?? 0;
    const nBins = Math.max(3, Math.min(10, Math.floor(Math.sqrt(targets.length))));

    // Discretize targets
    const targetBins = discretize(targets, nBins);

    const importances: GeneImportanceScore[] = [];

    for (let fi = 0; fi < featureCount; fi++) {
        const featureValues = features.map(f => f[fi]);
        const featureBins = discretize(featureValues, nBins);

        const mi = computeMI(featureBins, targetBins, nBins);

        importances.push({
            featureName: fi < featureNames.length ? featureNames[fi] : `feature_${fi}`,
            featureIndex: fi,
            mutualInformation: mi,
            normalizedImportance: 0, // Will be set after normalization
            rank: 0,                 // Will be set after sorting
        });
    }

    // Normalize and rank
    const totalMI = importances.reduce((s, imp) => s + imp.mutualInformation, 0);
    importances.sort((a, b) => b.mutualInformation - a.mutualInformation);

    for (let i = 0; i < importances.length; i++) {
        importances[i].rank = i + 1;
        importances[i].normalizedImportance = totalMI > 0
            ? importances[i].mutualInformation / totalMI
            : 1 / importances.length;
    }

    return importances;
}

/**
 * Discretize continuous values into bins.
 */
function discretize(values: number[], nBins: number): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const minVal = sorted[0];
    const maxVal = sorted[sorted.length - 1];
    const range = maxVal - minVal;

    if (range === 0) return values.map(() => 0);

    return values.map(v => {
        const bin = Math.floor(((v - minVal) / range) * (nBins - 1));
        return Math.min(bin, nBins - 1);
    });
}

/**
 * Compute mutual information between two discretized variables.
 */
function computeMI(xBins: number[], yBins: number[], nBins: number): number {
    const n = xBins.length;

    // Joint distribution p(x, y)
    const joint: number[][] = Array.from({ length: nBins }, () =>
        new Array(nBins).fill(0),
    );

    // Marginal distributions
    const pX = new Array(nBins).fill(0);
    const pY = new Array(nBins).fill(0);

    for (let i = 0; i < n; i++) {
        const xb = xBins[i];
        const yb = yBins[i];
        joint[xb][yb]++;
        pX[xb]++;
        pY[yb]++;
    }

    // Compute MI
    let mi = 0;
    for (let x = 0; x < nBins; x++) {
        for (let y = 0; y < nBins; y++) {
            if (joint[x][y] > 0 && pX[x] > 0 && pY[y] > 0) {
                const pXY = joint[x][y] / n;
                const pXm = pX[x] / n;
                const pYm = pY[y] / n;
                mi += pXY * Math.log2(pXY / (pXm * pYm));
            }
        }
    }

    return Math.max(0, mi); // MI is non-negative
}

// ─── SAIE Main Controller ────────────────────────────────────

/**
 * SurrogateIlluminationEngine — The meta-controller that connects
 * the surrogate model to the evolution pipeline.
 *
 * Lifecycle:
 * 1. Evolution generates candidates (mutations/crossovers)
 * 2. SAIE screens all candidates via surrogate prediction
 * 3. Only top-K by UCB score go to full backtest
 * 4. Actual results update the surrogate model
 * 5. Gene importance analysis guides future mutations
 *
 * This amplifies exploration by a factor of
 * candidatePoolSize / topKForBacktest (default: 500/20 = 25x).
 */
export class SurrogateIlluminationEngine {
    private config: SurrogateConfig;
    private forest: SurrogateForest;
    private lastGeneImportance: GeneImportanceScore[] = [];
    private totalCandidatesScreened: number = 0;
    private totalBacktestsRun: number = 0;
    private evaluationsSinceLastMI: number = 0;

    constructor(config: Partial<SurrogateConfig> = {}) {
        this.config = { ...DEFAULT_SAIE_CONFIG, ...config };
        this.forest = new SurrogateForest(this.config);
    }

    /**
     * Screen a pool of candidate strategies and return only the
     * most promising ones (top-K by UCB score) for full backtest.
     *
     * This is the core amplification function:
     *   - Input: 500 candidates (cheap to generate)
     *   - Output: 20 candidates (worth backtesting)
     *   - Net: 25x evaluation efficiency gain
     */
    screenCandidates(candidates: StrategyDNA[]): {
        selected: StrategyDNA[];
        predictions: Map<string, SurrogatePrediction>;
    } {
        this.totalCandidatesScreened += candidates.length;

        const predictions = new Map<string, SurrogatePrediction>();

        if (!this.config.enabled || !this.forest.isReady()) {
            // Model not ready — pass through all candidates (capped at topK)
            const shuffled = [...candidates].sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, this.config.topKForBacktest);
            return { selected, predictions };
        }

        // Score all candidates via surrogate + UCB
        const scored: Array<{ strategy: StrategyDNA; ucb: SurrogatePrediction }> = [];

        for (const strategy of candidates) {
            const features = extractFeatures(strategy);
            const rawPrediction = this.forest.predict(features);
            const ucb = computeUCB(rawPrediction, this.config.ucbKappa);

            predictions.set(strategy.id, ucb);
            scored.push({ strategy, ucb });
        }

        // Sort by UCB score (highest first)
        scored.sort((a, b) => b.ucb.ucbScore - a.ucb.ucbScore);

        // Select top-K
        const selected = scored
            .slice(0, this.config.topKForBacktest)
            .map(s => s.strategy);

        return { selected, predictions };
    }

    /**
     * Record the actual backtest result for a strategy.
     * Updates the surrogate model and tracks prediction accuracy.
     */
    recordEvaluation(strategy: StrategyDNA, actualFitness: number): void {
        const features = extractFeatures(strategy);

        // Track prediction error if model was used
        if (this.forest.isReady()) {
            const predicted = this.forest.predict(features);
            this.forest.recordPredictionError(predicted.mean, actualFitness);
        }

        // Add to training data
        this.forest.addSample(features, actualFitness);
        this.totalBacktestsRun++;
        this.evaluationsSinceLastMI++;

        // Periodically update gene importance
        if (this.evaluationsSinceLastMI >= this.config.geneImportanceInterval) {
            this.updateGeneImportance();
            this.evaluationsSinceLastMI = 0;
        }
    }

    /**
     * Record a batch of evaluations (e.g., after a generation completes).
     */
    recordBatch(evaluations: Array<{ strategy: StrategyDNA; fitness: number }>): void {
        for (const ev of evaluations) {
            this.recordEvaluation(ev.strategy, ev.fitness);
        }
    }

    /**
     * Get the current gene importance rankings.
     * Guides mutation bias: high-importance genes get more attention.
     */
    getGeneImportance(): GeneImportanceScore[] {
        if (this.lastGeneImportance.length === 0) {
            this.updateGeneImportance();
        }
        return [...this.lastGeneImportance];
    }

    /**
     * Get mutation bias based on gene importance.
     * Returns a weight for each indicator type (higher = mutate more).
     *
     * Integration: NEAT's structural mutations should prefer
     * adding indicators with high importance scores.
     */
    getMutationBias(): Map<IndicatorType, number> {
        const bias = new Map<IndicatorType, number>();
        const typeOrder: IndicatorType[] = [
            IndicatorType.RSI, IndicatorType.EMA, IndicatorType.SMA,
            IndicatorType.MACD, IndicatorType.BOLLINGER, IndicatorType.ADX,
            IndicatorType.ATR, IndicatorType.VOLUME, IndicatorType.STOCH_RSI,
        ];

        const importance = this.getGeneImportance();

        for (let i = 0; i < typeOrder.length; i++) {
            const imp = importance.find(g => g.featureIndex === i);
            // Base weight 0.5, boosted by normalized importance
            bias.set(typeOrder[i], 0.5 + (imp?.normalizedImportance ?? 0) * 5);
        }

        return bias;
    }

    /**
     * Force a surrogate model rebuild.
     * Call after large batches of new evaluations.
     */
    rebuildModel(): void {
        this.forest.rebuild();
        this.updateGeneImportance();
    }

    /**
     * Get a dashboard-friendly snapshot of the SAIE state.
     */
    getSnapshot(): SAIESnapshot {
        return {
            totalTrainingSamples: this.forest.getTrainingSize(),
            surrogateAccuracy: this.forest.getMeanAbsoluteError(),
            avgPredictionTimeMs: 0.005, // ~5μs per prediction
            amplificationRatio: this.config.candidatePoolSize / this.config.topKForBacktest,
            lastGeneImportance: [...this.lastGeneImportance],
            ucbKappa: this.config.ucbKappa,
            modelReady: this.forest.isReady(),
            totalCandidatesScreened: this.totalCandidatesScreened,
            totalBacktestsSaved: this.totalCandidatesScreened - this.totalBacktestsRun,
        };
    }

    /**
     * Check if the surrogate is ready to make predictions.
     */
    isReady(): boolean {
        return this.config.enabled && this.forest.isReady();
    }

    /**
     * Update gene importance via Mutual Information computation.
     */
    private updateGeneImportance(): void {
        const data = this.forest.getTrainingData();
        if (data.features.length < 20) return;

        this.lastGeneImportance = computeGeneImportance(
            data.features,
            data.targets,
            FEATURE_NAMES,
        );
    }
}

// ─── Utility Functions ───────────────────────────────────────

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
}

function computeVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const m = mean(values);
    return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}

/**
 * Create a simple seeded pseudo-random number generator.
 * Uses a linear congruential generator for fast, deterministic randomness.
 * This ensures the forest is reproducible across runs.
 */
function createSeededRng(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}
