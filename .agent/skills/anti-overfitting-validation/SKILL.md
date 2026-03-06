---
name: anti-overfitting-validation
description: Activate when working on Walk-Forward Analysis, Monte Carlo permutation testing, Deflated Sharpe Ratio, market regime detection, overfitting risk scoring, validation pipeline gates, IS/OOS window generation, statistical significance testing, regime classification (ADX/ATR/SMA), composite overfitting scoring, or any anti-overfitting validation code in the Learner trading system.
---

# Anti-Overfitting Validation — Statistical Defense Engineering

> **Expert Council**: Marcos López de Prado (Deflated Sharpe, Multiple Testing), Robert Pardo (Walk-Forward Analysis Pioneer), Ernest Chan (Quantitative Backtesting), David Aronson (Evidence-Based Technical Analysis), Andreas Clenow (Systematic Strategy Validation)

## 🎯 Validation Philosophy

> "An overfitted strategy is not a bad strategy — it's not a strategy at all. It's noise dressed up as signal." — López de Prado

The anti-overfitting pipeline is the **immune system** of the Learner AI. Without it, the genetic algorithm will inevitably evolve strategies that exploit noise, sequence dependencies, and regime-specific artifacts in historical data. Every strategy that reaches CANDIDATE status must prove it's **genuine**.

### Core Principle: Defense-in-Depth
No single test is sufficient. A strategy that passes Walk-Forward might still fail Monte Carlo. One that passes both might still be regime-fragile. The 4-Gate pipeline tests **independent** dimensions of robustness.

---

## 🚪 4-Gate Validation Pipeline

```
Strategy reaches 30+ trades
         │
         ▼
┌─────────────────────────────────────┐
│  GATE 1: Walk-Forward Analysis      │
│  Module: walk-forward.ts            │
│  Test: Does performance hold OOS?   │
│  Threshold: efficiency ≥ 0.5        │
│  Catches: Curve-fitting             │
└─────────────┬───────────────────────┘
              │ PASS
              ▼
┌─────────────────────────────────────┐
│  GATE 2: Monte Carlo Permutation    │
│  Module: monte-carlo.ts             │
│  Test: Is the edge statistically    │
│        significant?                 │
│  Threshold: p-value < 0.05          │
│  Catches: Lucky sequencing          │
└─────────────┬───────────────────────┘
              │ PASS
              ▼
┌─────────────────────────────────────┐
│  GATE 3: Overfitting Score          │
│  Module: overfitting-detector.ts    │
│  Test: Composite risk assessment    │
│  Threshold: score < 40/100          │
│  Catches: Multi-dimensional risk    │
└─────────────┬───────────────────────┘
              │ PASS
              ▼
┌─────────────────────────────────────┐
│  GATE 4: Regime Diversity           │
│  Module: regime-detector.ts         │
│  Test: Trades span multiple         │
│        market conditions?           │
│  Threshold: ≥ 2 unique regimes      │
│  Catches: Single-condition reliance │
└─────────────┬───────────────────────┘
              │ ALL PASS
              ▼
       PROMOTE: PAPER → CANDIDATE

       ANY FAIL → RETIRE (with reason)
```

---

## 📊 Gate 1: Walk-Forward Analysis

**Module**: `src/lib/engine/walk-forward.ts` (250 lines)
**Purpose**: Tests if a strategy's performance degrades on data it hasn't seen.

### Concept
The trade history is split chronologically into **In-Sample (IS)** and **Out-of-Sample (OOS)** windows. If the strategy performs vastly better IS than OOS, it's likely curve-fitted.

### Rolling WFA Window Generation

```
Trade History: [T1, T2, T3, T4, T5, ... T30]

Window 1: [── IS (70%) ──][─ OOS (30%) ─]
Window 2:     [── IS (70%) ──][─ OOS (30%) ─]
Window 3:         [── IS (70%) ──][─ OOS (30%) ─]
  ...

Each window evaluates fitness independently.
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `inSampleRatio` | 0.7 | Proportion of window used for IS |
| `minWindowTrades` | 10 | Minimum trades per IS/OOS split |
| `minWindows` | 3 | Minimum number of windows required |
| `stepRatio` | 0.2 | How much to slide between windows (20% overlap) |

### Key Metrics

```typescript
interface WalkForwardResult {
  passed: boolean;                    // efficiency ≥ 0.5
  efficiency: number;                 // OOS/IS fitness ratio (0-2+)
  averageInSampleFitness: number;     // Mean IS fitness across windows
  averageOutOfSampleFitness: number;  // Mean OOS fitness across windows
  degradation: number;                // 1 - efficiency (0 = no degradation)
  windows: WalkForwardWindow[];       // Per-window detailed results
}
```

### Efficiency Ratio Interpretation

| Efficiency | Meaning | Action |
|-----------|---------|--------|
| ≥ 1.0 | OOS ≥ IS (exceptional) | ✅ Very robust |
| 0.7 - 1.0 | Slight OOS degradation (normal) | ✅ Robust |
| 0.5 - 0.7 | Moderate degradation (acceptable) | ✅ Passes threshold |
| 0.3 - 0.5 | Significant degradation | ❌ Likely overfitted |
| < 0.3 | Severe degradation | ❌ Definitely overfitted |

### Anchored Walk-Forward Variant
Unlike rolling WFA, the anchored version **always starts IS from trade 1**. The IS window grows progressively, testing whether older data still contributes to prediction quality.

```
Window 1: [IS: T1-T10][OOS: T11-T15]
Window 2: [IS: T1-T15][OOS: T16-T20]
Window 3: [IS: T1-T20][OOS: T21-T25]
```

---

## 🎲 Gate 2: Monte Carlo Permutation Testing

**Module**: `src/lib/engine/monte-carlo.ts` (245 lines)
**Purpose**: Tests if the equity curve could have been produced by chance.

### Concept
If you shuffle the order of trades randomly and recalculate performance, does the original order produce significantly better results? If not, the "edge" might just be lucky sequencing.

### Permutation Test Algorithm

```
1. Calculate ORIGINAL metric (e.g., Sharpe Ratio) from actual trade sequence
2. For i = 1 to 1000:
   a. Fisher-Yates shuffle the trade order
   b. Calculate the SAME metric on shuffled trades
   c. Store result
3. Sort all 1000 shuffled results
4. Find the 95th percentile value (confidence threshold)
5. If original > 95th percentile → p-value < 0.05 → SIGNIFICANT
6. If original ≤ 95th percentile → p-value ≥ 0.05 → NOT SIGNIFICANT
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `numSimulations` | 1000 | Number of permutations |
| `confidenceLevel` | 0.95 | Percentile threshold (95%) |
| `targetMetric` | `'sharpeRatio'` | Metric to test |
| `minTrades` | 20 | Minimum trades for valid test |

### Key Metrics

```typescript
interface MonteCarloResult {
  passed: boolean;                    // p-value < 0.05
  pValue: number;                     // Probability of chance (0-1)
  originalMetric: number;             // Original strategy's metric
  confidenceThreshold: number;        // 95th percentile of shuffled
  simulationCount: number;            // How many permutations run
  percentileRank: number;             // Where original falls (0-100)
}
```

### Equity Curve Randomization (Variant)
Instead of shuffling trade order, randomly **flip the sign** of each trade's P&L. This tests whether the pattern of wins/losses matters, not just the average.

```
Original:  [+2%, -1%, +3%, +1%, -2%] → Sharpe: 1.2
Flip 1:    [-2%, -1%, +3%, -1%, +2%] → Sharpe: 0.3
Flip 2:    [+2%, +1%, -3%, +1%, -2%] → Sharpe: 0.1
...1000 flips...

If original Sharpe > 95th percentile of flips → Pattern is real
```

### Deflated Sharpe Ratio (DSR)

**Based on**: López de Prado (2014)
**Purpose**: Corrects for the multiple-testing problem across generations.

After testing 100 strategies over 20 generations, some will "look good" by chance. DSR calculates the expected maximum Sharpe under the null hypothesis:

```
E[max(SR)] ≈ √(2 × ln(k)) × σ_sr
```

Where `k` = total strategies tested, `σ_sr` = std. dev. of Sharpe Ratios across all tested strategies.

```typescript
function calculateDeflatedSharpeRatio(
  sharpe: number,           // Observed Sharpe of best strategy
  totalTested: number,      // Total strategies tested (all generations)
  tradeCount: number,       // Number of trades for this strategy
  skewness?: number,        // Return distribution skewness
  kurtosis?: number,        // Return distribution kurtosis
): number                   // Deflation factor ∈ (0, 1]
```

---

## 🌦️ Gate 4: Market Regime Detection

**Module**: `src/lib/engine/regime-detector.ts` (391 lines)
**Purpose**: Classifies market conditions and ensures strategies work across multiple regimes.

### 5 Market Regimes

| Regime | Condition | Primary Indicator |
|--------|-----------|------------------|
| `TRENDING_UP` | ADX > 25 AND price > SMA(50) | Strong uptrend |
| `TRENDING_DOWN` | ADX > 25 AND price < SMA(50) | Strong downtrend |
| `RANGING` | ADX < 20 | Low directional movement |
| `HIGH_VOLATILITY` | ATR > 75th percentile | Extreme price swings |
| `LOW_VOLATILITY` | ATR < 25th percentile | Compressed, quiet market |

### Technical Indicator Calculations

```
ADX (Average Directional Index):
  1. Calculate +DM and -DM (directional movement)
  2. Smooth with Wilder's EMA (period: 14)
  3. DI+ = smoothed(+DM) / ATR
  4. DI- = smoothed(-DM) / ATR
  5. DX = |DI+ - DI-| / (DI+ + DI-)
  6. ADX = Wilder smooth of DX (period: 14)

ATR (Average True Range):
  True Range = max(high - low, |high - prevClose|, |low - prevClose|)
  ATR = Wilder smooth of True Range (period: 14)

SMA (Simple Moving Average):
  SMA = sum(close, period) / period
```

### Regime Diversity Requirement

A strategy MUST have trades in **≥ 2 unique market regimes** to pass Gate 4.

```typescript
function calculateRegimeDiversity(
  tradeRegimes: MarketRegime[]
): {
  uniqueRegimes: number;               // Count of distinct regimes
  regimeCounts: Record<MarketRegime, number>;  // Per-regime trade count
  isDiverse: boolean;                   // uniqueRegimes ≥ 2
}
```

**Why this matters**: A strategy that only works in trending markets will fail catastrophically when the market starts ranging. Regime diversity ensures basic robustness.

### Trade Regime Classification

Each trade is tagged with the market regime at entry time:

```typescript
function classifyTradeRegime(
  trade: Trade,
  candles: OHLCV[],
  config?: Partial<RegimeDetectorConfig>
): MarketRegime
```

The regime detector looks at the candles around the trade's `entryTime` to determine what market conditions existed when the trade was opened.

---

## 🎯 Gate 3: Composite Overfitting Score

**Module**: `src/lib/engine/overfitting-detector.ts` (328 lines)
**Purpose**: Aggregates all validation dimensions into a single 0-100 risk score.

### Component Weights

| Component | Weight | Source | What It Measures |
|-----------|--------|--------|-----------------|
| Walk-Forward | 30% | `walk-forward.ts` | OOS performance degradation |
| Monte Carlo | 25% | `monte-carlo.ts` | Statistical significance |
| Complexity | 15% | Strategy DNA | Indicator/rule count (Occam's Razor) |
| Regime Diversity | 15% | `regime-detector.ts` | Market condition coverage |
| Return Consistency | 15% | Trade P&L variance | Erratic vs. smooth returns |

### Component Score Calculation (Each 0-100)

```
Component Score 0 = SAFE (low overfitting risk)
Component Score 100 = DANGEROUS (high overfitting risk)

finalScore = Σ (componentScore × componentWeight)
```

### WFA Component (30%)
```
if WFA not run:       score = 70 (assume risk)
if efficiency ≥ 0.8:  score = 5  (excellent)
if efficiency ≥ 0.5:  score = 30 (acceptable)
if efficiency ≥ 0.3:  score = 60 (concerning)
if efficiency < 0.3:  score = 90 (overfit)
```

### Monte Carlo Component (25%)
```
if MC not run:        score = 70 (assume risk)
if p-value < 0.01:    score = 5  (highly significant)
if p-value < 0.05:    score = 25 (significant)
if p-value < 0.10:    score = 50 (marginally significant)
if p-value ≥ 0.10:    score = 85 (not significant)
```

### Complexity Component (15%)
```
indicators = strategy.indicators.length
entryRules = strategy.entryRules.conditions.length
exitRules = strategy.exitRules.conditions.length

baseComplexity = indicators * 15 + entryRules * 8 + exitRules * 8
score = clamp(baseComplexity, 0, 100)

Example: 2 indicators + 2 entry + 1 exit = 30 + 16 + 8 = 54/100
Example: 1 indicator + 1 entry + 1 exit = 15 + 8 + 8 = 31/100
```

### Regime Diversity Component (15%)
```
if 1 regime:   score = 90 (single-condition — very risky)
if 2 regimes:  score = 45 (minimum diversity)
if 3 regimes:  score = 20 (good diversity)
if 4+ regimes: score = 5  (excellent diversity)
```

### Return Consistency Component (15%)
```
Calculate coefficient of variation (CV) of per-trade returns:
CV = std(returns) / |mean(returns)|

if CV < 0.5:   score = 10 (very consistent)
if CV < 1.0:   score = 30 (consistent)
if CV < 2.0:   score = 55 (moderate variance)
if CV < 3.0:   score = 75 (high variance)
if CV ≥ 3.0:   score = 90 (extremely erratic)
```

### Score Interpretation

| Score | Risk Level | Action |
|-------|-----------|--------|
| 0-20 | Very Safe | Strategy is well-validated |
| 20-40 | Safe | ✅ PASSES threshold (< 40) |
| 40-60 | Moderate Risk | ❌ FAILS — needs more data or simplification |
| 60-80 | High Risk | ❌ Strategy is likely overfit |
| 80-100 | Critical | ❌ Strategy is almost certainly noise |

### Overfitting Report

```typescript
interface OverfittingReport {
  overallScore: number;                // 0-100 composite
  passed: boolean;                     // score < 40
  components: {
    wfa: number;                       // 0-100
    monteCarlo: number;                // 0-100
    complexity: number;                // 0-100
    regimeDiversity: number;           // 0-100
    returnConsistency: number;         // 0-100
  };
  recommendations: string[];          // Human-readable improvement suggestions
  complexityPenalty: number;           // 0.7-1.0 multiplier for fitness
}
```

---

## ⚠️ Critical Rules

1. **NEVER weaken thresholds** (efficiency ≥ 0.5, p-value < 0.05, score < 40, ≥ 2 regimes) without Expert Council + ADR
2. **NEVER skip any gate** — all 4 must run, even if early gates pass
3. **Gate order matters** — cheaper tests (WFA) run first, expensive tests (MC with 1000 permutations) run last
4. **Minimum 30 trades** for any validation to be statistically meaningful
5. **Log ALL failures** with specific gate, score, and recommendation
6. **Retry is not allowed** — a failed strategy is RETIRED, not re-tested
7. **Monte Carlo shuffling MUST use Fisher-Yates** — other shuffle algorithms introduce bias
8. **Regime detection requires ≥ 50 candles** — less data → default to RANGING
9. **WFA window integrity** — IS and OOS sets must NEVER overlap

---

## 📂 Key Files
- `src/lib/engine/walk-forward.ts` → WFA rolling/anchored window analysis (250 lines)
- `src/lib/engine/monte-carlo.ts` → Permutation testing + Deflated Sharpe Ratio (245 lines)
- `src/lib/engine/regime-detector.ts` → 5-regime classification via ADX/ATR/SMA (391 lines)
- `src/lib/engine/overfitting-detector.ts` → Composite risk scorer (328 lines)
- `src/lib/engine/brain.ts` → 4-Gate pipeline orchestration in validation flow
- `src/lib/engine/island.ts` → Per-island validation pipeline execution
- `src/types/index.ts` → All validation interfaces (WalkForwardResult, MonteCarloResult, OverfittingReport, etc.)

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `backtesting-simulation` | Data source | Backtest `Trade[]` feeds into WFA/Monte Carlo |
| `performance-analysis` | Producer | Fitness scores contribute to overfitting composite |
| `evolution-engine` | Consumer | Validation gates determine strategy promotion/retirement |
| `risk-management` | Parallel guard | Validation = statistical safety, Risk = capital safety |
