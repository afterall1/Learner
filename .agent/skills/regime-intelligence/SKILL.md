---
name: regime-intelligence
description: Activate when working on the MRTI (Markov Regime Transition Intelligence) predictive engine, regime transition forecasting, Markov chain transition matrices, early-warning signal detection (ADX slope, ATR acceleration, duration exhaustion, confidence decay), proactive strategy pre-warming, predictive capital rebalancing, or any predictive regime analysis code in the Learner trading system.
---

# Regime Intelligence — MRTI (Markov Regime Transition Intelligence)

> **Expert Council**: James Hamilton (Regime-Switching Models), Marcos López de Prado (Market Microstructure), Andrew Lo (Adaptive Markets), Nassim Taleb (Transition Risk), Rich Sutton (Predictive AI)

## 🔮 Core Concept

MRTI transforms the system from **reactive** (detect-then-switch) to **predictive** (forecast-then-prepare). While `regime-detector.ts` classifies the CURRENT market state, MRTI predicts UPCOMING transitions.

```
REACTIVE (before MRTI):
  Regime changes → Loss → Detect → Switch strategy

PREDICTIVE (with MRTI):
  Early warnings → MRTI forecast → Pre-warm/Switch → Regime changes → Already adapted
```

## 🏗️ Architecture (3-Layer)

### Layer 1: TransitionMatrix (Markov Chain)

Builds a 5×5 probability matrix P(next_regime | current_regime) from historical regime sequences.

| Property | Value |
|----------|-------|
| Smoothing | Laplace (α = 0.1) |
| Regimes | TRENDING_UP, TRENDING_DOWN, RANGING, HIGH_VOLATILITY, LOW_VOLATILITY |
| Min observations | 20 for reliability flag |
| Duration tracking | Average samples per regime (for exhaustion signal) |

**Key Methods:**
- `buildFromHistory(sequence)` — Constructs matrix from regime sequence
- `getTransitionProbability(from, to)` — Single P(to|from) with smoothing
- `getTransitionRow(from)` — Full probability row (sums to 1.0)
- `getMostProbableTransition(from)` — Best non-self transition
- `getAverageDuration(regime)` — Mean regime persistence

### Layer 2: EarlyWarningDetector (4 Leading Signals)

| Signal | What It Detects | Severity Logic |
|--------|----------------|----------------|
| `adx_slope` | Trend weakening/emerging | Linear regression slope of recent ADX values |
| `atr_acceleration` | Volatility spikes/contractions | Second derivative of ATR = acceleration |
| `duration_exhaustion` | Regime overstaying average | ratio = current / avg → ramps 0.5x-2.0x |
| `confidence_decay` | Classification uncertainty | severity = 1 - confidence |

**Composite Risk Formula:**
```
transitionRisk = adx_slope × 0.30 + atr_acceleration × 0.30
               + duration_exhaustion × 0.25 + confidence_decay × 0.15
```

### Layer 3: RegimeIntelligence (Orchestrator)

**Lifecycle:**
1. `calibrate(candles)` — Build transition matrix (needs 200+ candles)
2. `forecast(candles)` — Generate `RegimeTransitionForecast`
3. Recommendation logic:
   - `transitionRisk < 0.3` → **HOLD** (stable)
   - `transitionRisk 0.3-0.7` → **PREPARE** (pre-warm roster strategy)
   - `transitionRisk > 0.7` → **SWITCH** (proactive rotation)

**Safety Guard:** If matrix isn't reliable (< 20 transitions), cap at PREPARE.

## 🔗 Integration Points

### Island (auto-calibration + forecast)

```typescript
// In updateMarketData():
// 1. Auto-calibrate when 200+ candles available
if (candles.length >= 200 && !this.regimeIntelligence.isCalibrated()) {
    this.regimeIntelligence.calibrate(candles);
}
// 2. Generate forecast on every update (if calibrated)
if (this.regimeIntelligence.isCalibrated()) {
    const forecast = this.regimeIntelligence.forecast(candles);
    this.handleRegimeForecast(forecast);
}
```

### Strategy Roster (pre-warming)

```typescript
// preWarmForRegime(predictedRegime) — finds best strategy WITHOUT switching
// hasCoverageForRegime(regime) — coverage check for Cortex
```

### Cortex (global risk + predictive rebalancing)

```typescript
// evaluateGlobalRegimeRisk() — aggregates island forecasts
//   → Macro consensus: 3+ islands predicting same regime = macro signal
// adjustAllocationsForRegimeForecast() — risk-weighted capital distribution
//   → Low risk → full allocation, High risk → 50% allocation
```

## ⚠️ Critical Rules

1. **NEVER** remove Laplace smoothing — zero-probability transitions cause division errors
2. **NEVER** set `switchThreshold` below `prepareThreshold`
3. **ALWAYS** check `isCalibrated()` before calling `forecast()`
4. **ALWAYS** respect the matrix reliability guard (cap SWITCH → PREPARE when unreliable)
5. Early warning weights MUST sum to 1.0
6. `calibrate()` needs minimum 100 candles (200+ recommended)

## 📁 Key Files

- `src/lib/engine/regime-intelligence.ts` → All MRTI logic (TransitionMatrix, EarlyWarningDetector, RegimeIntelligence)
- `src/lib/engine/regime-detector.ts` → Base regime classification (MRTI depends on `detectRegime`, `calculateADX`, `calculateATR`)
- `src/lib/engine/island.ts` → MRTI auto-calibration + `handleRegimeForecast()`
- `src/lib/engine/strategy-roster.ts` → `preWarmForRegime()` + `hasCoverageForRegime()`
- `src/lib/engine/cortex.ts` → `evaluateGlobalRegimeRisk()` + `adjustAllocationsForRegimeForecast()`
- `src/types/index.ts` → `MarketRegime` enum

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `evolution-engine` | Consumer | MRTI biases evolution toward regime-gap coverage |
| `performance-analysis` | Data Source | Fitness scores feed roster confidence |
| `risk-management` | Safety Layer | MRTI respects all 8 non-negotiable risk rules |
| `anti-overfitting-validation` | Upstream | Validated strategies enter roster for pre-warming |
| `backtesting-simulation` | Calibration | Historical backtests provide regime sequence for matrix |
| `multi-island-ui` | Dashboard | MRTI forecasts displayed in island panels |
