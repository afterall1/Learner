---
name: performance-analysis
description: Activate when working on strategy fitness evaluation, performance metrics calculation, Sharpe Ratio, Sortino Ratio, Profit Factor, Expectancy, Maximum Drawdown, composite fitness scoring, complexity penalty, deflated fitness, strategy ranking, or any performance analysis code in the Learner trading system.
---

# Performance Analysis — Strategy Evaluation Engineering

> **Expert Council**: Marcos López de Prado (Deflated Sharpe), William Sharpe (Risk-Adjusted Return), Frank Sortino (Downside Risk), Ralph Vince (Optimal f), Robert Pardo (Walk-Forward)

## 🎯 Composite Fitness Score (0-100)

The fitness score is a **multi-metric, complexity-penalized, deflation-corrected** composite. This single number determines survival in the genetic algorithm.

### 3-Layer Scoring Pipeline

```
Layer 1: Raw Composite Score
  → 5 weighted metrics → normalize → sum → scale to 0-100

Layer 2: Complexity Penalty
  → rawScore × complexityMultiplier
  → Fewer indicators = higher multiplier (rewards simplicity)

Layer 3: Deflated Fitness (Deflated Sharpe Ratio)
  → Corrects for multiple-testing bias across generations
  → Strategies that "look good by chance" get lower scores
```

### Layer 1: Raw Composite Formula

```
rawFitness = 100 × Σᵢ wᵢ × N(mᵢ, minᵢ, maxᵢ)
```

| # | Metric | Weight | Norm Min | Norm Max | Why This Weight |
|---|--------|--------|----------|----------|-----------------|
| 0 | Sharpe Ratio | 25% | -2.0 | 5.0 | Risk-adjusted returns — penalizes volatile strategies |
| 1 | Sortino Ratio | 20% | -2.0 | 8.0 | Downside-risk adjusted — rewards consistent upside |
| 2 | Profit Factor | 20% | 0.0 | 5.0 | Gross profit / gross loss — viability indicator |
| 3 | 1 - Max Drawdown | 25% | 0.0 | 1.0 | Capital preservation — heavily penalizes deep drawdowns |
| 4 | Expectancy | 10% | -0.05 | 0.10 | Expected return per trade — long-term viability |

### Normalization Function
```typescript
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// Properties:
// - N(x, a, b) ∈ [0, 1] for all x
// - N(a, a, b) = 0 (minimum maps to 0)
// - N(b, a, b) = 1 (maximum maps to 1)
// - Linear interpolation between a and b
// - Clamped: below a → 0, above b → 1
```

---

### Layer 2: Complexity Penalty

```typescript
function getComplexityMultiplier(indicatorCount: number): number {
  // Occam's Razor — simpler strategies get a bonus
  switch (indicatorCount) {
    case 1: return 1.10;  // +10% bonus — beautifully simple
    case 2: return 1.05;  // +5% bonus
    case 3: return 1.00;  // baseline — no penalty, no bonus
    case 4: return 0.92;  // -8% penalty
    case 5: return 0.85;  // -15% penalty — overly complex
    default: return 0.80; // shouldn't happen, but guard
  }
}

// penalizedFitness = rawFitness × complexityMultiplier
```

**Why complexity matters**: A strategy with 5 indicators and 8 rules has more degrees of freedom to "fit" to noise. A simple RSI(14) + EMA(50) strategy that works is far more likely to be **genuine** than a 5-indicator setup with identical fitness.

---

### Layer 3: Deflated Fitness (Deflated Sharpe Ratio)

Based on López de Prado's framework for correcting multiple-testing bias:

```
Problem: After testing 100 strategies across 20 generations, some will
         "look good" purely by chance (multiple comparisons problem)

Solution: Deflated Sharpe Ratio adjusts the expected maximum Sharpe
          based on: number of trials, variance of trials, skewness, kurtosis

deflatedFitness = fitness × deflationFactor

Where deflationFactor ∈ (0, 1] accounts for:
  - Number of strategies tested so far (more = more deflation)
  - Variance among strategy performance (higher = more deflation)
  - How "extreme" the best strategy's score is vs. expected maximum
```

Implemented in `src/lib/engine/monte-carlo.ts` → `calculateDeflatedSharpe()`

---

## 📊 Individual Metric Calculations

### Sharpe Ratio
```
SR = (μ - rf) / σ
```
| Symbol | Meaning |
|--------|---------|
| μ | Mean of per-trade % returns |
| rf | Risk-free rate (0 for crypto — no benchmark) |
| σ | Standard deviation of per-trade returns |

- Guard: if σ = 0, SR = 0
- **Good**: > 1.5 | **Excellent**: > 2.5 | **Bad**: < 0.5

### Sortino Ratio
```
So = (μ - rf) / σd
σd = √(Σ max(0, -rᵢ)² / n)
```
- σd uses **only negative returns** for deviation
- Rewards strategies that have rare, small losses
- Guard: if σd = 0 and μ > 0, So = 3.0 (capped)
- **Good**: > 2.0 | **Excellent**: > 4.0

### Profit Factor
```
PF = Σ max(0, rᵢ) / |Σ min(0, rᵢ)|
```
- Must be > 1.0 to be net profitable
- Guard: if denominator = 0, PF = totalPnl > 0 ? 10.0 : 0.0
- **Good**: > 1.5 | **Excellent**: > 2.5 | **Unviable**: < 1.0

### Maximum Drawdown
```
DD = max((Pₖ - Tₖ) / Pₖ) for all k
```
- Pₖ = equity peak before drawdown k
- Tₖ = equity trough after peak k
- Computed on running equity curve from trade sequence
- Lower is better
- **Good**: < 10% | **Acceptable**: < 15% | **Critical**: > 20%

### Expectancy
```
E = (WR × AW) - (LR × AL)
```
- WR = win rate, LR = 1 - WR
- AW = average winning trade %, AL = average losing trade % (absolute)
- Must be positive for long-term profitability
- **Good**: > 0.5% | **Excellent**: > 1.0%

---

## 📋 Full PerformanceMetrics Interface

| Field | Type | Description |
|-------|------|-------------|
| `totalTrades` | number | Total executed trades (min 30 for evaluation) |
| `winningTrades` | number | Trades with positive P&L |
| `losingTrades` | number | Trades with negative P&L |
| `winRate` | number (0-1) | winningTrades / totalTrades |
| `profitFactor` | number | Gross profit / gross loss |
| `sharpeRatio` | number | Risk-adjusted return |
| `sortinoRatio` | number | Downside-risk adjusted return |
| `maxDrawdown` | number (%) | Peak-to-trough percentage |
| `maxDrawdownDuration` | number (ms) | Longest recovery time |
| `averageRR` | number | Average risk-reward ratio |
| `expectancy` | number | Expected return per trade |
| `totalPnlPercent` | number | Total P&L as percentage |
| `totalPnlUSD` | number | Total P&L in USD |
| `averageWinPercent` | number | Average winning trade % |
| `averageLossPercent` | number | Average losing trade % |
| `largestWinPercent` | number | Best single trade % |
| `largestLossPercent` | number | Worst single trade % |
| `consecutiveWins` | number | Max consecutive wins |
| `consecutiveLosses` | number | Max consecutive losses |
| `averageHoldTime` | number (ms) | Average position duration |

---

## ⚠️ Promotion Requirements (4-Gate + Fitness)

A strategy must pass ALL of these to advance from PAPER to CANDIDATE:

| Requirement | Threshold | Module |
|------------|----------|--------|
| Minimum trade count | ≥ 30 trades | `evaluator.ts` |
| Fitness score | ≥ 40/100 (complexity-penalized) | `evaluator.ts` |
| Profit factor | ≥ 1.0 | `evaluator.ts` |
| Max drawdown | ≤ 20% | `evaluator.ts` |
| Walk-Forward efficiency | ≥ 0.5 | `walk-forward.ts` |
| Monte Carlo p-value | < 0.05 | `monte-carlo.ts` |
| Overfitting score | < 40/100 | `overfitting-detector.ts` |
| Regime diversity | ≥ 2 unique regimes | `regime-detector.ts` |

**All 8 requirements must be simultaneously satisfied.** Failure in any = RETIRED with logged reason.

---

## 📈 Score Interpretation

| Score Range | Quality | GA Action | Promotion |
|-------------|---------|-----------|-----------|
| 80-100 | Elite | Automatically selected as parent | → CANDIDATE (if 4-Gate passes) |
| 60-79 | Strong | High probability of selection | → CANDIDATE (if 4-Gate passes) |
| 40-59 | Average | Moderate selection probability | Continue paper trading |
| 20-39 | Weak | Low priority for reproduction | Near elimination |
| 0-19 | Failed | Will be eliminated next generation | Recycled |

---

## 📂 Key Files
- `src/lib/engine/evaluator.ts` → All metric calculations, composite scoring, complexity penalty
- `src/lib/engine/monte-carlo.ts` → Deflated Sharpe Ratio implementation
- `src/lib/engine/walk-forward.ts` → Walk-Forward Analysis (IS/OOS efficiency)
- `src/lib/engine/overfitting-detector.ts` → Composite overfitting scorer
- `src/lib/engine/regime-detector.ts` → Market regime classification
- `src/types/index.ts` → `PerformanceMetrics` interface
- `src/lib/engine/evolution.ts` → Uses fitness for selection + Strategy Memory

See `references/fitness-formula.md` for mathematical proofs.
