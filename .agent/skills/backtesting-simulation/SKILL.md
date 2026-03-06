---
name: backtesting-simulation
description: Activate when working on the backtesting engine, market simulation, historical strategy testing, equity curve generation, indicator caching (PFLM), slippage modeling, commission calculation, intra-candle SL/TP detection, batch strategy evaluation, quick fitness assessment, or any code that simulates trade execution against historical OHLCV data in the Learner trading system.
---

# Backtesting Simulation — Historical Strategy Testing Engine

> **Expert Council**: Ernest Chan (Quantitative Backtesting), Robert Pardo (Walk-Forward Testing), Marcos López de Prado (Backtesting Pitfalls), Robert Almgren (Market Impact Models), Andreas Clenow (Systematic Strategy Simulation), David Aronson (Evidence-Based TA)

## 🎯 Architecture Overview

The backtesting engine transforms Learner from a theoretical evolution system into a **functional one** by enabling rapid historical simulation. Without it, each generation required 300+ live trades — now strategies can be evaluated in milliseconds.

```
Historical OHLCV Data
        │
        ▼
┌─────────────────────────────┐
│  IndicatorCache (PFLM)      │  ← Pre-compute ALL indicators ONCE
│  O(M × candleCount)         │     M = unique indicator configs
└────────────┬────────────────┘
             │ shared cache
             ▼
┌─────────────────────────────┐
│  runBacktest() per strategy │  ← O(candleCount) per strategy
│  ┌───────────────────────┐  │
│  │ For each candle:      │  │
│  │  1. Check SL/TP       │  │
│  │  2. Evaluate signals  │  │
│  │  3. Simulate fill     │  │
│  │  4. Track equity      │  │
│  │  5. Tag regime        │  │
│  └───────────────────────┘  │
└────────────┬────────────────┘
             │ Trade[] + EquityPoint[]
             ▼
┌─────────────────────────────┐
│  evaluatePerformance()      │  ← From evaluator.ts
│  calculateFitnessScore()    │
│  calculateNoveltyBonus()    │
└────────────┬────────────────┘
             │ BacktestResult
             ▼
     Evolution / Validation
```

**PFLM Innovation**: Parallel Fitness Landscape Mapping. For N strategies with M unique indicator configs:
- **Without PFLM**: O(N × M × candleCount) — each strategy recomputes all indicators
- **With PFLM**: O(M × candleCount + N × candleCount) — indicators computed once, shared

---

## 🔬 Market Simulator (`market-simulator.ts`, ~280 lines)

### Execution Configuration

```typescript
interface ExecutionConfig {
    commissionRate: number;         // 0.0004 = 0.04% (Binance taker default)
    slippageBps: number;            // 2 basis points base
    useAdaptiveSlippage: boolean;   // Scale with ATR volatility
    marketImpactEnabled: boolean;   // Almgren-Chriss model
    avgDailyVolume: number;         // For impact calculation ($50M default)
}
```

### 8 Exported Functions

| Function | Purpose | Key Detail |
|----------|---------|------------|
| `calculateSlippage()` | ATR-adaptive slippage | Volatility ratio × base bps, clamped 0.5×-3.0× |
| `calculateCommission()` | Notional × rate | Both entry and exit sides |
| `simulateFill()` | Direction-aware fill price | LONG entry → price UP, SHORT entry → price DOWN |
| `checkStopLossAndTakeProfit()` | Intra-candle SL/TP detection | **Conservative: SL wins ties** |
| `simulateExecution()` | Complete execution pipeline | Fill + slippage + commission + impact |
| `estimateMarketImpact()` | Almgren-Chriss √participation model | Capped at 50bps |
| `calculatePositionQuantity()` | Capital-based position sizing | allocatedCapital × leverage / price |
| `calculateSLTPLevels()` | Direction-aware SL/TP levels | LONG: SL below, TP above; SHORT: reverse |

### Conservative SL/TP Detection Rule (CRITICAL)

When **both** SL and TP are hit within the same candle (candle's range spans both levels):

```
RULE: Always assume STOP-LOSS was hit first.
```

This is a **deliberately pessimistic** assumption that prevents the backtester from inflating results. In real trading, you can't know intra-candle order — assuming worst case is the only honest approach.

### Slippage Model

```
slippageDecimal = baseBps × volatilityRatio / 10000

volatilityRatio = clamp(currentATR / avgATR, 0.5, 3.0)

Fill price:
  LONG entry / SHORT exit  → price × (1 + slippage)  ← adverse
  SHORT entry / LONG exit  → price × (1 - slippage)  ← adverse
```

### Market Impact Model (Almgren-Chriss)

```
participationRate = orderNotional / avgDailyVolume
impactBps = 10 × √(participationRate)
cappedImpact = min(impactBps, 50)  ← max 0.5% impact

// 1% of daily volume → ~1bp impact
// 10% of daily volume → ~3.2bp impact
// 100% of daily volume → ~10bp impact (capped at 50)
```

---

## 🧪 Backtesting Engine (`backtester.ts`, ~570 lines)

### Backtest Configuration

```typescript
interface BacktestConfig {
    initialCapital: number;           // $10,000 default
    execution: ExecutionConfig;       // Market simulator config
    maxOpenPositions: number;         // 1 (single position per backtest)
    warmupCandles: number;            // 200 (reserved for indicator warmup)
    enableRegimeTagging: boolean;     // Tag trades with market regime
    enableEquityCurve: boolean;       // Track balance per candle
}
```

### BacktestResult

```typescript
interface BacktestResult {
    strategyId: string;
    strategyName: string;
    trades: Trade[];                  // Completed simulated trades
    equityCurve: EquityPoint[];       // Balance per candle
    metrics: PerformanceMetrics;      // From evaluator.ts
    fitnessScore: number;             // Composite with novelty bonus
    totalFees: number;                // All slippage + commission
    candlesProcessed: number;
    signalsGenerated: number;
    executionTimeMs: number;          // Wall-clock time
    regimeBreakdown: Record<string, number> | null;
}
```

### 3 Exported Functions

| Function | Purpose | Performance |
|----------|---------|-------------|
| `runBacktest(dna, candles, config?, cache?)` | Full simulation with equity curve | Single strategy |
| `batchBacktest(strategies, candles, config?)` | Shared-cache population evaluation | **PFLM**: O(N+M) |
| `quickFitness(dna, candles, cache?)` | Lean mode (no equity/regime) | Fastest — for GA |

### IndicatorCache Class (PFLM)

```typescript
class IndicatorCache {
    constructor(candles: OHLCV[]);
    getOrCompute(gene: IndicatorGene): IndicatorCacheEntry;
    getATRValues(): number[];         // Always pre-computed
    getStats(): { totalEntries: number; uniqueTypes: number };
}
```

**Cache key formula**: `${type}:${period}:${sorted_params}`

Example: Two strategies both use `RSI(14)` — computed once, returned from cache on second request. Across a population of 20 strategies with 3 indicators each (60 genes), typically only 15-25 unique combinations exist.

### Simulation Loop (Pseudo-code)

```
for each candle from warmup to end:
    if openPosition:
        check SL/TP via market-simulator
        if hit:
            close position with realistic execution
            record Trade
            tag with market regime (if enabled)

    if no openPosition:
        evaluate entry signals via signal-engine
        if LONG/SHORT signal:
            calculate position size
            simulate entry execution
            open SimulatedPosition

    else (open position, no SL/TP hit):
        evaluate exit signals
        if EXIT signal:
            close position with realistic execution
            record Trade

    track equity curve point (balance + unrealized PnL)

// Force-close any open position at last candle
```

---

## 🔌 Integration Points

### Evolution Engine → Backtester
```typescript
// In evolution.ts: rapid fitness evaluation
const cache = new IndicatorCache(historicalCandles);
const results = batchBacktest(population, historicalCandles, config, cache);
// results sorted by fitnessScore (descending)
```

### Brain → Backtester
```typescript
// In brain.ts: validate candidates before promotion
const result = runBacktest(candidateDNA, historicalCandles);
if (result.fitnessScore >= 40 && result.metrics.profitFactor >= 1.0) {
    // Proceed to 4-Gate validation
}
```

### Island → Backtester
```typescript
// Per-island evaluation with island-specific candles
const result = runBacktest(strategy, island.getCandles(), {
    ...DEFAULT_BACKTEST_CONFIG,
    enableRegimeTagging: true,
});
```

---

## ⚠️ Critical Rules

1. **NEVER modify the conservative SL/TP rule** — both-hit-same-candle = SL wins
2. **NEVER skip warmup candles** — indicators need history to be valid
3. **Backtest trades are ALWAYS `isPaperTrade: true`** — never mark as live
4. **Commission is applied on BOTH sides** — entry AND exit
5. **Slippage direction is ALWAYS adverse** — models worst-case execution
6. **Market impact is OFF by default** — only enable for realistic large-position modeling
7. **Force-close at backtest end** — no phantom open positions
8. **IndicatorCache MUST be shared** in `batchBacktest` — creating per-strategy caches defeats PFLM
9. **Warmup minimum**: `max(config.warmupCandles, getRequiredCandleCount(dna))`

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `evolution-engine` | Consumer | Backtester produces fitness → evolution uses for selection |
| `performance-analysis` | Consumer | Backtester produces `Trade[]` → evaluator calculates metrics |
| `anti-overfitting-validation` | Post-processor | Backtest trades feed into WFA/Monte Carlo validation |
| `risk-management` | Validator | Risk genes (SL/TP/leverage) bound by safety rails |
| `binance-integration` | Data source | Live kline data → stored → fed to backtester |

---

## 📂 Key Files
- `src/lib/engine/backtester.ts` → BacktestEngine, IndicatorCache, runBacktest, batchBacktest, quickFitness
- `src/lib/engine/market-simulator.ts` → ExecutionConfig, slippage, commission, SL/TP, market impact
- `src/lib/engine/evaluator.ts` → evaluatePerformance, calculateFitnessScore, calculateNoveltyBonus
- `src/lib/engine/signal-engine.ts` → evaluateStrategy, indicator calculation functions
- `src/lib/engine/regime-detector.ts` → detectRegime for trade regime tagging
- `src/types/index.ts` → Trade, OHLCV, StrategyDNA, PerformanceMetrics, IndicatorGene
