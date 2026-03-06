---
name: evolution-engine
description: Activate when working on the genetic algorithm, strategy DNA, crossover, mutation, tournament selection, generation lifecycle, fitness evaluation, elitism, population management, adaptive mutation, Strategy Memory, regime-aware evolution, diversity pressure, or any AI evolution logic in the Learner trading system. Covers strategy genome structure, indicator genes, signal rules, risk genes, anti-overfitting integration, Island scoping, and the complete evolution pipeline from random genesis to converged strategies.
---

# Evolution Engine — Genetic Algorithm Operations

> **Expert Council**: John Holland (GA Pioneer), Kenneth De Jong (EA Theory), Deb Kalyanmoy (NSGA-II), David Goldberg (GA Design), Melanie Mitchell (Complexity & GA)

## 🧬 Strategy DNA Genome Structure

Every trading strategy is encoded as a `StrategyDNA` genome. This is the **fundamental unit of evolution**.

### Gene Groups

#### 1. Indicator Genes (`IndicatorGene[]`)

| Type | Parameters | Period Range | What It Measures |
|------|-----------|-------------|-----------------|
| `RSI` | _(none)_ | 5-50 | Momentum oscillator (0-100) |
| `EMA` | _(none)_ | 5-200 | Exponential trend following |
| `SMA` | _(none)_ | 5-200 | Simple trend following |
| `MACD` | `fastPeriod`, `slowPeriod`, `signalPeriod` | 5-50 | Trend + momentum convergence |
| `BOLLINGER` | `stdDev` | 10-50 | Volatility bands + mean reversion |
| `ADX` | _(none)_ | 10-50 | Trend strength (0-100) |
| `ATR` | _(none)_ | 5-30 | Volatility measurement |
| `VOLUME` | _(none)_ | 5-50 | Liquidity confirmation |
| `STOCH_RSI` | `kPeriod`, `dPeriod` | 5-30 | Momentum oscillator (0-100) |

**Constraints**: Min 1 indicator, max 5 per strategy. Fewer indicators = lower complexity penalty.

#### 2. Entry/Exit Rules (`EntryExitRules`)

| Condition | Description | Example |
|-----------|-------------|---------|
| `ABOVE` | Value > threshold | RSI > 70 (overbought) |
| `BELOW` | Value < threshold | RSI < 30 (oversold) |
| `CROSS_ABOVE` | Crosses up through threshold | Price crosses above EMA |
| `CROSS_BELOW` | Crosses down through threshold | Price crosses below EMA |
| `BETWEEN` | Within range | RSI between 40-60 |
| `INCREASING` | Rising (current > previous) | ADX increasing = strengthening trend |
| `DECREASING` | Falling (current < previous) | ATR decreasing = compression |

- **Entry**: ALL signals must be true (AND logic) → triggers position open
- **Exit**: ANY signal can trigger (OR logic) → triggers position close

#### 3. Risk Genes (`RiskGenes`)

| Gene | Min | Max | Step | Bounded By |
|------|-----|-----|------|-----------|
| `stopLossPercent` | 0.5% | 5.0% | 0.1% | Risk Manager (always required) |
| `takeProfitPercent` | 1.0% | 15.0% | 0.5% | — |
| `positionSizePercent` | 0.5% | 2.0% | 0.1% | Risk Manager (max 2%) |
| `maxLeverage` | 1x | 10x | 1x | Risk Manager (max 10x) |

#### 4. Context Fields

| Field | Purpose |
|-------|---------|
| `slotId` | Island assignment (e.g., `"BTCUSDT:1h"`) — set by Island on creation |
| `preferredTimeframe` | Primary analysis timeframe |
| `preferredPairs` | Target Binance Futures symbols |
| `directionBias` | `LONG`, `SHORT`, or `null` (both) |

#### 5. Metadata

| Field | Purpose |
|-------|---------|
| `fitnessScore` | Composite score (0-100) from evaluator |
| `tradeCount` | Total trades executed |
| `mutationHistory` | Human-readable log of mutations applied |
| `lastEvaluated` | Timestamp of last evaluation |

#### 6. Advanced Gene Families (Phase 9)

Optional advanced gene arrays extend the standard genome:

| Gene Family | Module | What It Enables |
|-------------|--------|-----------------|
| `microstructureGenes` | `microstructure-genes.ts` | Volume Profile POC, Volume Acceleration, Candle Anatomy, Range Expansion |
| `priceActionGenes` | `price-action-genes.ts` | 10 candlestick formations, structural breaks, swing sequences |
| `compositeFunctionGenes` | `composite-functions.ts` | Mathematical indicator evolution (9 ops × 4 normalizations) |
| `confluenceGenes` | _(future)_ | Multi-timeframe confluence signals |
| `directionalChangeGenes` | `directional-change.ts` | Event-based DC analysis (θ reversal threshold) |

**40% injection rate**: `generateRandomStrategy()` adds advanced genes 40% of the time.
**Novelty bonus**: Up to +8 fitness points for strategies using advanced gene families.

---

## 🔄 Evolution Pipeline (Per-Island)

```
┌─────────────────────────────────────────────────────────┐
│  GENERATION N                                           │
│                                                         │
│  1. CREATE population (random genesis or survivors)     │
│     └─ All strategies tagged with island's slotId       │
│                                                         │
│  2. EVALUATE via Complexity-Penalized Fitness            │
│     └─ Minimum 30 trades for statistical significance   │
│     └─ Complexity penalty: fewer indicators = bonus     │
│                                                         │
│  3. RANK by Deflated Fitness (DFS correction applied)   │
│     └─ Corrects for multiple-testing bias               │
│                                                         │
│  4. UPDATE Strategy Memory (regime-based gene tracking) │
│     └─ Records which genes excel per market regime      │
│                                                         │
│  5. SELECT parents via Tournament Selection (k=3)       │
│                                                         │
│  6. CROSSOVER top pairs (rate: 60%)                     │
│     └─ Gene-group level swap (never mix half-genes)     │
│                                                         │
│  7. MUTATE offspring (Adaptive Rate: 10%-50%)           │
│     └─ Rate increases when fitness stagnates            │
│     └─ Rate decreases when fitness improves             │
│                                                         │
│  8. INJECT wild cards for diversity (rate: 10%)         │
│                                                         │
│  9. APPLY Diversity Pressure                            │
│     └─ Penalize strategies too similar to each other    │
│                                                         │
│  10. PRESERVE elite strategies (top 20% elitism)        │
│                                                         │
│  11. FORM Generation N+1 → REPEAT                       │
│                                                         │
│  PARALLEL: Run 4-Gate Validation on top 3 candidates    │
│                                                         │
│  BACKTEST: Use quickFitness() for rapid evaluation      │
│     └─ IndicatorCache shared across population (PFLM)  │
└─────────────────────────────────────────────────────────┘
```

---

## 🧠 Strategy Memory (Regime-Aware Evolution)

Strategy Memory tracks which **gene configurations** perform best in each **market regime**:

```typescript
interface StrategyMemory {
  regimePerformance: Map<MarketRegime, GenePerformanceRecord[]>;
}

interface GenePerformanceRecord {
  indicatorType: IndicatorType;
  period: number;
  avgFitness: number;
  sampleCount: number;
}
```

**How it works:**
1. After each generation, the engine logs each strategy's indicator genes + fitness score + current regime
2. Over time, patterns emerge: "RSI(14) works well in TRENDING_UP, poorly in RANGING"
3. During crossover, the engine can **bias parent selection** toward strategies whose genes historically perform well in the current regime
4. This is **not** Reinforcement Learning — it's phenotypic memory within a GA framework

**5 Market Regimes** (classified by `regime-detector.ts`):
- `TRENDING_UP` — ADX > 25, price > SMA
- `TRENDING_DOWN` — ADX > 25, price < SMA
- `RANGING` — ADX < 20
- `HIGH_VOLATILITY` — ATR > 1.5× average
- `LOW_VOLATILITY` — ATR < 0.5× average

---

## ⚡ Adaptive Mutation

| Condition | Mutation Rate | Why |
|-----------|--------------|-----|
| Fitness improving (≥5% gain over 3 gens) | 10% (low) | Fine-tuning — don't disrupt winning formula |
| Fitness stagnant (<2% change over 5 gens) | 30% (medium) | Exploration — shake up the population |
| Fitness declining (≥5% drop over 3 gens) | 50% (high) | Regime change likely — aggressive exploration |

### Mutation Operators

| Type | Description | Probability |
|------|-------------|-------------|
| **Period tweak** | Change indicator period ±20% | Common (70%) |
| **Threshold shift** | Adjust signal rule threshold ±15% | Common (60%) |
| **Risk adjustment** | Modify SL/TP ±10%, leverage ±1 | Moderate (40%) |
| **Indicator swap** | Replace one indicator with different type | Rare (10%) |
| **Structural add/remove** | Add or remove an indicator or rule | Very rare (5%) |
| **Direction flip** | Change direction bias | Very rare (5%) |

---

## 🔀 Crossover Rules

1. Pick two parents via tournament selection
2. For each gene group, randomly select from Parent A or Parent B:
   - Indicators: take full array from one parent
   - Entry rules: take full ruleset from one parent
   - Exit rules: take full ruleset from one parent
   - Risk genes: take full set from one parent
3. **NEVER** mix half an indicator from each parent — gene integrity is essential
4. Always generate a new UUID for the child
5. Populate `parentIds` array with both parent IDs
6. **Inherit the slotId** from the island (not from parents)
7. Reset fitness score and trade count to 0

---

## 🏝️ Island Scoping

When evolution runs inside an `Island`:
- All generated strategies receive the island's `slotId`
- Crossover only happens between strategies **within the same island**
- Migrant strategies from other islands must have their `slotId` updated and fitness reset
- Population size is maintained independently per island (min 10)

---

## 🛡️ 4-Gate Validation Integration

After sufficient trades (≥30), top 3 candidates per generation are tested:

| Gate | Module | Threshold | What It Catches |
|------|--------|-----------|----------------|
| Walk-Forward | `walk-forward.ts` | Efficiency ≥ 0.5 | Curve-fitting to in-sample data |
| Monte Carlo | `monte-carlo.ts` | p-value < 0.05 | Lucky trade sequencing |
| Overfitting Score | `overfitting-detector.ts` | Score < 40/100 | Overparameterized strategies |
| Regime Diversity | `regime-detector.ts` | ≥ 2 unique regimes | Single-condition dependency |

**All 4 gates must PASS** → Promote to CANDIDATE
**Any gate FAILS** → Retire with logged failure reason

---

## ⚠️ Critical Rules

1. **NEVER modify `StrategyDNA` interface** without updating ALL dependent modules (evaluator, evolution, brain, island, cortex, store, dashboard)
2. **NEVER hardcode strategy parameters** — all values come from the DNA genome
3. **Always preserve parent lineage** — `parentIds` must be populated for crossover children
4. **Mutation must be bounded** — no gene value may exceed its defined min/max range
5. **Population size minimum** is 10 strategies per generation per island
6. **slotId must be set** by the Island, not by the strategy itself
7. **Fitness 0** for strategies with fewer than 30 trades (statistical significance)
8. **Complexity penalty** is applied: more indicators = lower fitness multiplier
9. **Deflated fitness** corrects for multiple-testing bias across generations

---

## 📂 Key Files
- `src/types/index.ts` → StrategyDNA, IndicatorGene, SignalRule, RiskGenes, MarketRegime, Advanced Gene types
- `src/types/trading-slot.ts` → TradingSlot (slotId source)
- `src/lib/engine/strategy-dna.ts` → Genome operations (create, crossover, mutate) + advanced gene integration
- `src/lib/engine/evaluator.ts` → Fitness scoring with complexity penalty + novelty bonus
- `src/lib/engine/evolution.ts` → GA controller (adaptive mutation, Strategy Memory, diversity)
- `src/lib/engine/brain.ts` → Single-island lifecycle + 4-Gate validation
- `src/lib/engine/island.ts` → Island-scoped evolution container
- `src/lib/engine/cortex.ts` → Multi-island orchestrator
- `src/lib/engine/backtester.ts` → Historical simulation + IndicatorCache (PFLM)
- `src/lib/engine/market-simulator.ts` → Realistic execution modeling

See `references/dna-schema.md` for the complete DNA field reference.

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `backtesting-simulation` | Consumer | Evolution uses `quickFitness()` / `batchBacktest()` for population evaluation |
| `performance-analysis` | Producer | Evaluator scores feed directly into GA selection |
| `anti-overfitting-validation` | Post-processor | Top candidates go through 4-Gate validation |
| `meta-evolution` | Controller | GA² HyperDNA controls evolution parameters per-island |
| `risk-management` | Constraint | Risk genes bounded by 8 hardcoded safety rails |
| `learner-conventions` | Standard | All code must follow project conventions |
