# Strategy DNA — Complete Field Reference

## StrategyDNA Interface

```typescript
interface StrategyDNA {
  // Identity
  id: string;                          // UUID v4
  name: string;                        // Auto-generated: "{Adjective} {Animal}"
  generation: number;                  // Which generation this strategy belongs to
  parentIds: string[];                 // Empty for genesis, 2 entries for crossover children
  createdAt: number;                   // Unix timestamp (ms)

  // Island Context
  slotId: string;                      // Island assignment ("BTCUSDT:1h") — set by Island

  // Gene Groups
  indicators: IndicatorGene[];         // 1-5 technical indicators
  entryRules: EntryExitRules;          // AND logic for entry conditions
  exitRules: EntryExitRules;           // OR logic for exit conditions

  // Context Preferences
  preferredTimeframe: Timeframe;       // Primary analysis timeframe
  preferredPairs: string[];            // Binance Futures symbols
  directionBias: TradeDirection | null; // LONG, SHORT, or null (both)

  // Risk Parameters
  riskGenes: RiskGenes;               // Position sizing and risk parameters

  // Lifecycle
  status: StrategyStatus;             // PAPER → CANDIDATE → ACTIVE → RETIRED

  // Performance Tracking
  metadata: {
    mutationHistory: string[];         // Human-readable log of mutations
    fitnessScore: number;              // 0-100 composite score (complexity-penalized)
    tradeCount: number;                // Total trades executed
    lastEvaluated: number | null;      // Timestamp of last evaluation
    structuralComplexity?: number;     // 0-1 scale, how many gene families are active
  };

  // ─── Phase 9: Advanced Gene Arrays (ALL OPTIONAL) ───
  microstructureGenes?: MicrostructureGene[];    // Volume profile, absorption, candle anatomy
  priceActionGenes?: PriceActionGene[];          // Candlestick patterns, structural breaks
  compositeGenes?: CompositeFunctionGene[];      // Mathematical indicator compositions
  confluenceGenes?: TimeframeConfluenceGene[];   // Multi-TF alignment (awaiting data)
  dcGenes?: DirectionalChangeGene[];             // Event-based DC analysis
}
```

## Advanced Gene Families (Phase 9)

### Microstructure Genes

| Type | Description | Key Parameters |
|------|-------------|----------------|
| `VOLUME_PROFILE` | POC detection, volume bucket concentration | lookbackPeriod (10-50), buckets (5-20), threshold (0.1-0.9) |
| `VOLUME_ACCELERATION` | Volume spike / accumulation detection | lookbackPeriod (5-30), threshold (1.2-3.0) |
| `CANDLE_ANATOMY` | Body-to-wick ratios, shadow dominance | lookbackPeriod (3-20), threshold (0.3-0.8) |
| `RANGE_EXPANSION` | ATR sequence expansion/contraction | lookbackPeriod (5-20), threshold (1.2-2.5) |
| `ABSORPTION` | Large candle + small net movement (whales) | lookbackPeriod (5-20), threshold (1.5-3.0) |

### Price Action Genes

| Type | Description | Key Parameters |
|------|-------------|----------------|
| `CANDLESTICK_PATTERN` | 10 parameterized formations (Engulfing, Doji, Hammer, etc.) | formation, bodyThreshold (0.1-0.5), wickThreshold (0.3-0.8) |
| `STRUCTURAL_BREAK` | N-bar high/low break | lookbackPeriod (5-30), breakBars (3-15) |
| `SWING_SEQUENCE` | HH/HL or LH/LL detection | swingLength (3-10) |
| `COMPRESSION` | Narrowing range → breakout | lookbackPeriod (5-20), threshold (0.3-0.7) |
| `GAP_ANALYSIS` | ATR-normalized gap detection | lookbackPeriod (5-15), gapThreshold (0.5-2.0) |

### Composite Function Genes

| Operation | Formula | Example Usage |
|-----------|---------|---------------|
| `ADD` | A + B | RSI_14 + StochRSI → compound momentum |
| `SUBTRACT` | A - B | EMA_20 - SMA_50 → trend-momentum divergence |
| `MULTIPLY` | A × B | Volume × ATR → volatility-weighted flow |
| `DIVIDE` | A / B | ATR_7 / ATR_21 → volatility ratio |
| `RATIO` | A / (A + B) | normalized relative strength |
| `ABS_DIFF` | \|A - B\| | divergence magnitude |
| `NORMALIZE_DIFF` | (A - B) / MAD | standardized divergence |
| `MAX` | max(A, B) | dominant signal |
| `MIN` | min(A, B) | weakest signal filter |

**Normalizations**: `none`, `percentile`, `z_score`, `min_max`
**Inputs**: Any `IndicatorType` value (RSI, EMA, etc.) or raw field (`close`, `high`, `low`, `open`, `volume`)

### Directional Change Genes

| Parameter | Range | Description |
|-----------|-------|-------------|
| `theta` | 0.5% - 5.0% | Reversal threshold (evolved by GA) |
| `lookbackPeriod` | 20 - 200 | Candle history for DC event detection |
| `indicator` | enum | DC-derived: `trendRatio`, `avgMagnitude`, `oscillationCount`, `upturnRatio` |
| `signalThreshold` | 0.2 - 0.8 | Signal trigger threshold |
| `overshootFactor` | 1.0 - 3.0 | Overshoot detection multiplier |

## Indicator Gene Types

| Type | Parameters | Period Range | Description |
|------|-----------|-------------|-------------|
| `RSI` | _(none)_ | 5-50 | Relative Strength Index. Momentum 0-100 |
| `EMA` | _(none)_ | 5-200 | Exponential Moving Average. Trend following |
| `SMA` | _(none)_ | 5-200 | Simple Moving Average. Trend following |
| `MACD` | `fastPeriod`, `slowPeriod`, `signalPeriod` | 5-50 | Convergence Divergence. Trend + momentum |
| `BOLLINGER` | `stdDev` | 10-50 | Bollinger Bands. Volatility + mean reversion |
| `ADX` | _(none)_ | 10-50 | Average Directional Index. Trend strength 0-100 |
| `ATR` | _(none)_ | 5-30 | Average True Range. Volatility measurement |
| `VOLUME` | _(none)_ | 5-50 | Volume analysis. Liquidity confirmation |
| `STOCH_RSI` | `kPeriod`, `dPeriod` | 5-30 | Stochastic RSI. Momentum oscillator 0-100 |

## Complexity Impact on Fitness

| Indicator Count | Complexity Multiplier | Effect |
|----------------|----------------------|--------|
| 1 | 1.10 | +10% bonus (beautifully simple) |
| 2 | 1.05 | +5% bonus |
| 3 | 1.00 | Baseline |
| 4 | 0.92 | -8% penalty |
| 5 | 0.85 | -15% penalty (overly complex) |

## Structural Novelty Bonus (Phase 9)

| Advanced Family Active | Bonus (Gen 0) | Bonus (Gen 100) | Bonus (Gen 200+) |
|----------------------|----------------|------------------|-------------------|
| 1 family | +2.0 pts | +1.0 pts | +0.4 pts |
| 2 families | +4.0 pts | +2.0 pts | +0.8 pts |
| 3 families | +6.0 pts | +3.0 pts | +1.2 pts |
| 4 families (max) | +8.0 pts | +4.0 pts | +1.6 pts |

> **Decay formula**: `bonus = familyCount × 2 × max(0.2, 1 - generation/200)`

## Signal Conditions

| Condition | Description | Example |
|-----------|-------------|---------|
| `ABOVE` | Indicator value > threshold | RSI > 70 (overbought) |
| `BELOW` | Indicator value < threshold | RSI < 30 (oversold) |
| `CROSS_ABOVE` | Value crosses above threshold | Price crosses above EMA |
| `CROSS_BELOW` | Value crosses below threshold | Price crosses below EMA |
| `BETWEEN` | Value between threshold and secondaryThreshold | RSI between 40-60 |
| `INCREASING` | Value is rising (current > previous) | ADX increasing (trending) |
| `DECREASING` | Value is falling (current < previous) | ATR decreasing (compression) |

## Risk Gene Ranges

| Gene | Min | Max | Step | Bounded By |
|------|-----|-----|------|-----------|
| `stopLossPercent` | 0.5% | 5.0% | 0.1% | Risk Manager (mandatory) |
| `takeProfitPercent` | 1.0% | 15.0% | 0.5% | — |
| `positionSizePercent` | 0.5% | 2.0% | 0.1% | Risk Manager (max 2%) |
| `maxLeverage` | 1x | 10x | 1x | Risk Manager (max 10x) |

## Strategy Status Lifecycle

```
PAPER → CANDIDATE → ACTIVE → RETIRED
  │         │          │         │
  │         │          │         └── Permanently removed from rotation
  │         │          └── Currently trading (paper or live)
  │         └── Passed ALL requirements:
  │              • 30+ trades ✓
  │              • Fitness ≥ 40 ✓
  │              • Profit Factor ≥ 1.0 ✓
  │              • Max Drawdown ≤ 20% ✓
  │              • Walk-Forward ≥ 0.5 ✓
  │              • Monte Carlo p < 0.05 ✓
  │              • Overfitting < 40 ✓
  │              • Regime Diversity ≥ 2 ✓
  └── Initial state, undergoing paper trading
```

## Name Generation

Strategy names follow the pattern: `{Adjective} {Animal}`

**Adjectives**: Nova, Quantum, Stellar, Cosmic, Phantom, Ember, Frost, Thunder, Shadow, Blaze, Crystal, Neon, Apex, Zenith, Vortex

**Animals**: Tiger, Falcon, Wolf, Dragon, Phoenix, Panther, Eagle, Serpent, Hawk, Lion, Bear, Cobra, Raptor, Lynx, Orca

## Market Regimes (Regime-Detector Classification)

| Regime | ADX | ATR | Price vs SMA |
|--------|-----|-----|-------------|
| `TRENDING_UP` | > 25 | — | Above SMA |
| `TRENDING_DOWN` | > 25 | — | Below SMA |
| `RANGING` | < 20 | — | — |
| `HIGH_VOLATILITY` | — | > 1.5× avg | — |
| `LOW_VOLATILITY` | — | < 0.5× avg | — |

