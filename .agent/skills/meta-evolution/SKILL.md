---
name: meta-evolution
description: Activate when working on meta-evolution (GA²), HyperDNA genomes, meta-fitness evaluation, meta-crossover, adaptive evolution parameters, fitness weight optimization, or any code that controls HOW the genetic algorithm evolves strategies in the Learner trading system.
---

# Meta-Evolution (GA²) — Self-Optimizing Evolution Engine

> **Expert Council**: John Holland (GA Pioneer), Kenneth De Jong (Meta-Evolution), Marcos López de Prado (Quantitative Meta-Learning), Hod Lipson (Self-Aware Systems), Nassim Taleb (Antifragile Systems)

## 🧠 Core Concept

Meta-Evolution is the **second layer of the GA² architecture**: a genetic algorithm that optimizes the parameters of the genetic algorithm itself.

```
Traditional system:
  Human decides → GA parameters (mutation rate, fitness weights, etc.)
  GA evolves → Trading strategies (StrategyDNA)

GA² system:
  Meta-GA evolves → Evolution parameters (HyperDNA)
    └→ GA evolves → Trading strategies (StrategyDNA)
```

**Each Island carries its own HyperDNA**, allowing different pair:timeframe combinations to discover their own optimal evolution dynamics. BTC:1h might evolve aggressively, while ETH:4h might evolve conservatively — the system discovers this automatically.

---

## 🧬 HyperDNA Genome Structure

### Evolution Parameter Genes

| Gene | Type | Min | Max | Step | What It Controls |
|------|------|-----|-----|------|-----------------|
| `populationSize` | int | 6 | 30 | 2 | Strategies per generation |
| `elitismRate` | float | 0.1 | 0.4 | 0.05 | Proportion of elite survivors |
| `mutationRate` | float | 0.05 | 0.6 | 0.05 | Base mutation probability |
| `crossoverRate` | float | 0.3 | 0.9 | 0.05 | Crossover vs mutation balance |
| `tournamentSize` | int | 2 | 7 | 1 | Selection pressure |
| `wildCardRate` | float | 0.05 | 0.3 | 0.05 | Random injection proportion |
| `stagnationThreshold` | int | 2 | 8 | 1 | Generations before mutation boost |
| `diversityMinimum` | float | 0.1 | 0.6 | 0.05 | Minimum population diversity |

### Fitness Weight Genes

| Gene | Min | Max | Default | What It Controls |
|------|-----|-----|---------|-----------------|
| `sharpeWeight` | 0.05 | 0.5 | 0.25 | Sharpe Ratio importance |
| `sortinoWeight` | 0.05 | 0.4 | 0.20 | Sortino Ratio importance |
| `profitFactorWeight` | 0.05 | 0.4 | 0.20 | Profit Factor importance |
| `drawdownWeight` | 0.05 | 0.5 | 0.25 | Max Drawdown (inverted) importance |
| `expectancyWeight` | 0.05 | 0.3 | 0.10 | Expectancy importance |

**Constraint**: All fitness weights MUST sum to 1.0 (enforced by renormalization after mutation).

---

## 📊 Meta-Fitness Evaluation

Meta-fitness measures **HOW WELL the evolution parameters produce good strategies**, not strategy quality itself.

### 4-Component Meta-Fitness Score (0-100)

| Component | Weight | What It Measures | Best = |
|-----------|--------|-----------------|--------|
| Fitness Improvement Rate | 35% | Avg fitness gain per generation (linear regression slope) | Fastest improvement |
| Validation Pass Rate | 30% | % of strategies passing 4-Gate pipeline | Highest pass rate |
| Convergence Speed | 20% | Generations to reach fitness ≥ 60 | Fewest generations |
| Diversity Maintenance | 15% | Average population diversity index | Highest diversity |

```
metaFitness = improvementScore × 0.35
            + validationScore × 0.30
            + convergenceScore × 0.20
            + diversityScore × 0.15
```

### Improvement Rate Calculation

Uses **linear regression slope** of best fitness per generation:

```typescript
// fitnessHistory = [15, 22, 28, 35, 41, 45, 48]
// slope = ~5.5 (fitness improves by ~5.5 per generation)
// Normalized against range [-2, 10] → ~75/100
```

---

## 🔄 Meta-Evolution Lifecycle

```
┌──────────────────────────────────────────────────────────┐
│  CORTEX ORCHESTRATION                                     │
│                                                           │
│  1. SPAWN Islands with HyperDNA:                          │
│     • First island → DEFAULT HyperDNA (human baseline)    │
│     • Subsequent → RANDOM or MUTANT of best               │
│                                                           │
│  2. Islands RUN their evolution (N strategy-generations)   │
│     • Each generation: best fitness + diversity recorded   │
│     • Each validation: attempt/pass tracked                │
│                                                           │
│  3. Every INTERVAL generations, Cortex triggers:           │
│     ┌──────────────────────────────────────────┐          │
│     │  META-EVOLUTION CYCLE                     │          │
│     │                                           │          │
│     │  a. EVALUATE meta-fitness for each        │          │
│     │     island's HyperDNA                     │          │
│     │  b. RANK islands by meta-fitness           │          │
│     │  c. CROSSOVER top 2 HyperDNA              │          │
│     │  d. MUTATE the offspring                   │          │
│     │  e. REPLACE worst island's HyperDNA        │          │
│     │  f. Advance meta-generation                │          │
│     └──────────────────────────────────────────┘          │
│                                                           │
│  4. REPEAT → Entire system optimizes how it learns         │
└──────────────────────────────────────────────────────────┘
```

---

## 🛡️ Anti-Meta-Overfitting: Stability Guard

Meta-overfitting is the risk that HyperDNA changes too rapidly, never giving evolution parameters enough time to prove their worth.

### Safety Mechanisms

| Mechanism | Value | Purpose |
|-----------|-------|---------|
| `minGenerationsBeforeEval` | 5 | Min strategy-generations before HyperDNA can be evaluated |
| `metaCrossoverInterval` | 10 | Strategy-generations between meta-crossover events |
| `stabilityGuardGenerations` | 5 | Min generations a HyperDNA must run before replacement |
| `maxMetaGenerations` | 50 | Safety cap on meta-evolution iterations |
| `metaMutationRate` | 0.15 | Deliberately conservative (lower than strategy mutation) |

### NON-EVOLVABLE Parameters (Hardcoded)

The following are **intentionally NOT in HyperDNA** — they are safety-critical:

| Parameter | Value | Why NOT Evolvable |
|-----------|-------|------------------|
| `minTradesForEvaluation` | 30 | Statistical significance — cannot be weakened |
| `maxGenerations` | 1000 | Safety cap — cannot be removed |
| `adaptiveMutationEnabled` | true | Always on — core feature |

---

## 🔀 Meta-Crossover & Meta-Mutation

### Crossover Strategy
- **Evolution genes**: Uniform crossover (each parameter independently from Parent A or B)
- **Fitness weights**: Wholesale from one parent (preserves sum=1.0 constraint)

### Mutation Strategy
- **Conservative**: ±3 steps per gene, 15% per-gene probability
- **Boundary-clamped**: All values stay within defined min/max ranges
- **Step-snapped**: Integer genes round to nearest integer
- **Weight-renormalized**: After mutation, fitness weights are renormalized to sum=1.0

---

## 🔌 Integration Points

### Island
- Constructor accepts optional `HyperDNA`
- `replaceHyperDna(newHyperDna)` — reconfigures EvolutionEngine
- `getHyperDna()` — returns current HyperDNA
- `getGenerationFitnessHistory()` — best fitness per generation
- `getValidationStats()` — { attempts, passes }
- `getAverageDiversityIndex()` — mean diversity index

### Cortex
- `spawnIsland()` auto-generates HyperDNA (default → random → mutant)
- `recordTrade()` triggers `checkMetaEvolutionCycle()`
- `runMetaEvolutionCycle()` — full meta-evolution pipeline
- `getMetaEvolutionEngine()` — direct access to MetaEvolutionEngine

### HyperDNA → EvolutionConfig Bridge
```typescript
metaEngine.hyperDnaToEvolutionConfig(hyperDna) → EvolutionConfig
metaEngine.hyperDnaToFitnessWeights(hyperDna) → FitnessWeights
```

---

## ⚠️ Critical Rules

1. **NEVER make safety-critical parameters evolvable** (min trades, max generations)
2. **NEVER skip the Stability Guard** — HyperDNA must run for N generations before evaluation
3. **ALWAYS renormalize fitness weights** after mutation (must sum to 1.0)
4. **Meta-crossover replaces the WORST island** — never the best or average
5. **First island ALWAYS gets DEFAULT HyperDNA** — human baseline for comparison
6. **Meta-mutation is conservative** (0.15) — lower than strategy mutation (0.3)
7. **Log ALL meta-evolution events** with `🧬²` prefix for dashboard filtering
8. **Meta-generation cap is 50** — prevents infinite meta-optimization loops

---

## 📂 Key Files
- `src/lib/engine/meta-evolution.ts` → MetaEvolutionEngine class (HyperDNA gen, crossover, mutation, evaluation)
- `src/types/index.ts` → HyperDNA, MetaFitnessRecord, MetaEvolutionConfig interfaces
- `src/lib/engine/island.ts` → Island with HyperDNA support (constructor, replace, tracking)
- `src/lib/engine/cortex.ts` → Meta-evolution cycle orchestration (spawn, evaluate, crossover, replace)

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `evolution-engine` | Controlled system | GA² HyperDNA controls evolution parameters |
| `performance-analysis` | Input | Fitness weight genes affect scoring formula |
| `anti-overfitting-validation` | Input | Validation pass rate feeds meta-fitness |
| `backtesting-simulation` | Evaluation | Backtest results drive meta-fitness improvement rate |
