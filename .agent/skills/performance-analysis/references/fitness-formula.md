# Fitness Formula — Mathematical Reference

## 3-Layer Scoring Pipeline

```
Layer 1: Raw Composite Score → F_raw(s)
Layer 2: Complexity Penalty  → F_pen(s) = F_raw(s) × C(n)
Layer 3: Deflated Fitness    → F_def(s) = F_pen(s) × D(k, σ_k)
```

Final fitness = F_def(s), used for GA selection and ranking.

---

## Layer 1: Raw Composite Score

```
F_raw(s) = 100 × Σᵢ wᵢ × N(mᵢ(s), minᵢ, maxᵢ)
```

Where:
- `s` = strategy being evaluated
- `wᵢ` = weight for metric i (Σwᵢ = 1.0)
- `N(x, a, b)` = normalization: clamp((x - a) / (b - a), 0, 1)
- `mᵢ(s)` = metric i computed from strategy s's trade history

### Weight Vector

```
W = [0.25, 0.20, 0.20, 0.25, 0.10]
```

| Index | Metric | Weight | Norm Min | Norm Max |
|-------|--------|--------|----------|----------|
| 0 | Sharpe Ratio | 0.25 | -2.0 | 5.0 |
| 1 | Sortino Ratio | 0.20 | -2.0 | 8.0 |
| 2 | Profit Factor | 0.20 | 0.0 | 5.0 |
| 3 | 1 - Max Drawdown | 0.25 | 0.0 | 1.0 |
| 4 | Expectancy | 0.10 | -0.05 | 0.10 |

### Normalization Function

```typescript
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
```

Properties:
- N(x, a, b) ∈ [0, 1] for all x
- N(a, a, b) = 0 (minimum maps to 0)
- N(b, a, b) = 1 (maximum maps to 1)
- Linear interpolation between a and b
- Clamped: values below a → 0, values above b → 1

---

## Layer 2: Complexity Penalty

```
F_pen(s) = F_raw(s) × C(n)
```

Where n = number of indicators in the strategy:

```typescript
function getComplexityMultiplier(n: number): number {
  const table: Record<number, number> = {
    1: 1.10,  // +10% bonus
    2: 1.05,  // +5% bonus
    3: 1.00,  // baseline
    4: 0.92,  // -8% penalty
    5: 0.85,  // -15% penalty
  };
  return table[Math.min(n, 5)] ?? 0.80;
}
```

Rationale (Occam's Razor): A strategy with fewer parameters has fewer degrees of freedom to overfit. If two strategies have equal raw fitness, the simpler one is more likely to generalize.

---

## Layer 3: Deflated Fitness (López de Prado)

```
F_def(s) = F_pen(s) × D(k, σ_k)
```

Where D is the deflation factor based on:
- k = number of strategies tested so far (across all generations)
- σ_k = variance among all tested strategies' fitness scores

The Deflated Sharpe Ratio corrects for the multiple-comparisons problem:

```
E[max(SR)] = √(2 × ln(k)) × (1 - γ/ln(k)) + γ/(2 × √(2 × ln(k)))
```

Where γ ≈ 0.5772 (Euler-Mascheroni constant).

If the observed SR is not significantly above E[max(SR)], the strategy may be a false positive.

```typescript
function calculateDeflatedSharpe(
  observedSharpe: number,
  benchmarkSharpes: number[],
  numTrials: number,
): number {
  if (numTrials <= 1 || benchmarkSharpes.length === 0) return 1.0;

  const mean = benchmarkSharpes.reduce((a, b) => a + b, 0) / benchmarkSharpes.length;
  const variance = benchmarkSharpes.reduce((sum, sr) => sum + (sr - mean) ** 2, 0) / benchmarkSharpes.length;
  const std = Math.sqrt(variance);

  if (std === 0) return 1.0;

  const expectedMaxSR = std * Math.sqrt(2 * Math.log(numTrials));
  const psr = 1 - normalCDF((expectedMaxSR - observedSharpe) / std);

  return Math.max(0.1, Math.min(1.0, psr));
}
```

---

## Individual Metric Formulas

### Sharpe Ratio
```
SR = (μ - rf) / σ
```
- μ = mean of per-trade returns
- rf = risk-free rate (0 for crypto)
- σ = standard deviation of per-trade returns
- Guard: if σ = 0, SR = 0

### Sortino Ratio
```
So = (μ - rf) / σd
σd = √(Σ max(0, -rᵢ)² / n)
```
- σd = downside deviation (only uses negative returns)
- Guard: if σd = 0 and μ > 0, So = 3.0 (cap)

### Profit Factor
```
PF = Σ max(0, rᵢ) / |Σ min(0, rᵢ)|
```
- Guard: if denominator = 0, PF = totalPnl > 0 ? 10.0 : 0.0

### Maximum Drawdown
```
DD = max((Pₖ - Tₖ) / Pₖ) for all k
```
- Pₖ = equity peak before drawdown k
- Tₖ = equity trough after peak k
- Computed on running equity curve

### Expectancy
```
E = (WR × AW) - (LR × AL)
```
- WR = win rate = wins / total
- LR = loss rate = 1 - WR
- AW = average winning trade amount (absolute)
- AL = average losing trade amount (absolute)

---

## Score Interpretation

| Score Range | Quality | GA Selection | Promotion Path |
|-------------|---------|-------------|----------------|
| 80-100 | Elite | Auto-selected as parent | → CANDIDATE (if 4-Gate passes) |
| 60-79 | Strong | High selection probability | → CANDIDATE (if 4-Gate passes) |
| 40-59 | Average | Moderate probability | Continue paper trading |
| 20-39 | Weak | Low priority | Near elimination |
| 0-19 | Failed | Will be eliminated | Recycled next generation |

## Minimum Requirements for Promotion

| # | Requirement | Threshold | Module |
|---|------------|----------|--------|
| 1 | Trade count | ≥ 30 | evaluator.ts |
| 2 | Fitness score | ≥ 40 | evaluator.ts |
| 3 | Profit factor | ≥ 1.0 | evaluator.ts |
| 4 | Max drawdown | ≤ 20% | evaluator.ts |
| 5 | Walk-Forward efficiency | ≥ 0.5 | walk-forward.ts |
| 6 | Monte Carlo p-value | < 0.05 | monte-carlo.ts |
| 7 | Overfitting score | < 40/100 | overfitting-detector.ts |
| 8 | Regime diversity | ≥ 2 regimes | regime-detector.ts |
