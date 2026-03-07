---
name: trade-forensics
description: Activate when working on the Trade Forensics Engine, post-trade causal attribution, TradeBlackBox flight recorder, ForensicAnalyzer autopsy, forensic learning feedback loop, Bayesian belief formation, fitness modifiers from trade lessons, entry/exit efficiency analysis, MFE/MAE tracking, near-miss detection, regime change tracking during trades, or any closed-loop learning code in the Learner trading system.
---

# Trade Forensics — Closed-Loop Intelligence Engine

> **Expert Council**: Marcos López de Prado (Quantitative Forensics), Nassim Taleb (Post-Mortem Analysis), Andrew Lo (Behavioral Attribution), Ray Dalio (Principled Learning)

## 🔬 Core Concept

Trade Forensics provides **post-trade causal attribution** — understanding WHY a trade succeeded or failed, not just whether it did. This knowledge feeds back into evolution.

```
BEFORE FORENSICS:
  Trade closes → P&L recorded → GA evolves blindly

WITH FORENSICS:
  Trade opens → BlackBox records every candle
  Trade closes → ForensicAnalyzer performs autopsy
    → Causal factors identified → Lessons extracted
    → Lessons → Bayesian Beliefs → Fitness Modifiers
    → GA evolves with TARGETED guidance
```

---

## 🏗️ Architecture (3-Layer)

### Layer 1: TradeBlackBox ("Flight Recorder")

Created when a trade opens, ticks on every candle, finalized on close.

| Event Type | What It Detects | Method |
|------------|----------------|--------|
| `ENTRY` | Trade opened | constructor |
| `MFE` / `MAE` | Max Favorable/Adverse Excursion | `trackExcursion()` |
| `NEAR_MISS_SL` | Price came within threshold of SL | `detectNearMissSL()` |
| `NEAR_MISS_TP` | Price came within threshold of TP | `detectNearMissTP()` |
| `DRAWDOWN_SPIKE` | Sudden adverse move | `detectDrawdownSpike()` |
| `REGIME_CHANGE` | Market regime shifted mid-trade | `detectRegimeChange()` |
| `VOLATILITY_SHIFT` | ATR changed significantly | `detectVolatilityShift()` |
| `INDICATOR_SHIFT` | Indicator values shifted significantly | `detectIndicatorShifts()` |
| `EXIT` | Trade closed | _(external)_ |

**Key Metrics:**
- `getMFE()` / `getMAE()` — max favorable/adverse excursion
- `getMFECandle()` / `getMAECandle()` — when they occurred
- `getDurationCandles()` — trade length
- `getExitRegime()` — regime at close
- `getRegimeChangeCount()` — how many regime changes occurred

### Layer 2: ForensicAnalyzer ("Post-Trade Autopsy")

Takes a closed BlackBox + Trade → produces `TradeForensicReport`.

| Analysis | Metric | Range | Purpose |
|----------|--------|-------|---------|
| Entry Efficiency | 0-100 | Higher = better entry price | Timing quality |
| Exit Efficiency | 0-100 | Higher = better exit price | Close quality |
| Risk/Reward Ratio | ratio | TP/SL as realized | Risk management quality |
| Regime Stability | 0-100 | Higher = stable regime | Environment assessment |
| Duration Score | 0-100 | Higher = optimal timing | Hold period analysis |

**Causal Factor Extraction:**
- Did a regime change CAUSE the outcome?
- Did a specific indicator shift CAUSE a stop-out?
- Was the entry/exit timing EFFICIENT?
- Did volatility expansion/contraction AFFECT the result?

**Lesson Types (from `TradeLessonType` enum):**

| Lesson | Direction | Max Modifier | Scope |
|--------|-----------|-------------|-------|
| `AVOID_REGIME` | Penalty (-) | 5 pts | All strategies in this regime |
| `PREFER_REGIME` | Bonus (+) | 5 pts | All strategies in this regime |
| `TIGHTEN_SL` | Penalty (-) | 3 pts | DNA-similar strategies |
| `WIDEN_SL` | Bonus (+) | 3 pts | DNA-similar strategies |
| `TIGHTEN_TP` | Penalty (-) | 3 pts | DNA-similar strategies |
| `WIDEN_TP` | Bonus (+) | 3 pts | DNA-similar strategies |
| `ENTRY_TIMING_GOOD` | Bonus (+) | 4 pts | DNA-similar strategies |
| `ENTRY_TIMING_BAD` | Penalty (-) | 4 pts | DNA-similar strategies |
| `EXIT_TIMING_GOOD` | Bonus (+) | 4 pts | DNA-similar strategies |
| `EXIT_TIMING_BAD` | Penalty (-) | 4 pts | DNA-similar strategies |
| `HIGH_VOLATILITY_RISK` | Penalty (-) | 3 pts | Regime-wide |

### Layer 3: ForensicLearningEngine ("Bayesian Intelligence")

Aggregates lessons → Bayesian beliefs → fitness modifiers.

**Belief Update Formula:**
```
New average = (old_avg × old_count + new_value) / (old_count + 1)
Weight = Σ(confidence × severity) × decayFactor^(generationAge)
```

**Forgetting Curve:**
```
advanceGeneration() → weight *= decayRate (0.98 per generation)
If weight < forgettingThreshold (0.05) → belief evicted
```

**DNA Similarity Assessment:**
- Indicator type overlap → 30% weight
- Period proximity → 30% weight
- Risk parameter similarity → 20% weight
- Direction bias match → 20% weight

**Fitness Modifier Output:**
```typescript
modifier = Σ(belief.weight × direction × magnitude × dnaSimilarity)
clamped to [-maxModifier, +maxModifier] (default: ±10)
```

---

## 🔌 Integration Points

### Brain/Island (trade lifecycle)
```typescript
// Trade opens → create BlackBox
onTradeOpen(trade) {
    this.blackBox = new TradeBlackBox(trade, currentRegime, indicators, atr);
}
// Every candle → tick BlackBox
onCandleUpdate(candle) {
    this.blackBox?.tick(candle, currentRegime, indicators, currentATR);
}
// Trade closes → produce forensic report
onTradeClose(trade) {
    const report = forensicAnalyzer.analyze(this.blackBox, trade, exitIndicators);
    forensicLearning.ingestLessons(report.lessons);
    persistenceBridge.onForensicReportGenerated(report);
}
```

### Evolution Engine (fitness modification)
```typescript
// During fitness evaluation, ADD forensic modifier
const baseScore = calculateFitness(strategy, metrics);
const forensicModifier = forensicLearning.calculateForensicModifier(strategy, currentRegime);
const finalScore = baseScore + forensicModifier;
```

---

## ⚠️ Critical Rules

1. **NEVER modify forensic reports** after creation — they are immutable records
2. **BlackBox must tick on EVERY candle** — missed candles create gaps in analysis
3. **Belief decay rate must stay ≤ 1.0** — values > 1.0 cause exponential growth
4. **Max modifier cap is sacred** — prevents forensics from dominating raw fitness
5. **Beliefs must be evicted** when below forgetting threshold — prevents memory bloat
6. **DNA similarity is 0-1 range** — never allow negative similarity
7. **ForensicAnalyzer is stateless** — all state lives in BlackBox
8. **ALWAYS persist forensic reports** — they are training data for the learning engine

---

## 📁 Key Files

- `src/lib/engine/trade-forensics.ts` → TradeBlackBox + ForensicAnalyzer (971 lines)
- `src/lib/engine/forensic-learning.ts` → ForensicLearningEngine (394 lines)
- `src/types/index.ts` → `Trade`, `TradeForensicReport`, `TradeLesson`, `TradeLessonType`, `CausalFactor`, `TradeLifecycleEvent`
- `src/lib/engine/persistence-bridge.ts` → `onForensicReportGenerated()`

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `evolution-engine` | Consumer | Fitness modifiers feed into GA evaluation |
| `performance-analysis` | Data Source | Raw performance metrics trigger forensic analysis |
| `regime-intelligence` | Input | Regime detection during trade feeds BlackBox |
| `hybrid-persistence` | Storage | Forensic reports stored in IndexedDB + Supabase |
| `strategic-overmind` | Downstream | Overmind can use forensic patterns for hypotheses |
| `risk-management` | Analysis | Near-miss SL/TP detection informs risk assessment |
| `backtesting-simulation` | Producer | Simulated trades can generate forensic data |
