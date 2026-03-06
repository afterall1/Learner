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
  };
}
```

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
