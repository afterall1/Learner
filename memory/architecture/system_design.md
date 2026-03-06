# System Design — Learner Architecture

## Module Dependency Graph

```mermaid
graph TD
    subgraph "Layer 1: Types"
        T[types/index.ts]
        TS[types/trading-slot.ts]
    end

    subgraph "Layer 2: Core Engine"
        DNA[strategy-dna.ts]
        EVAL[evaluator.ts]
        EVO[evolution.ts]
        BRAIN[brain.ts]
    end

    subgraph "Layer 2b: Anti-Overfitting"
        WFA[walk-forward.ts]
        MC[monte-carlo.ts]
        RD[regime-detector.ts]
        OFD[overfitting-detector.ts]
    end

    subgraph "Layer 2c: Island Model"
        ISLAND[island.ts]
        CORTEX[cortex.ts]
        META[meta-evolution.ts]
        MIG[migration.ts]
        CAP[capital-allocator.ts]
    end

    subgraph "Layer 3: Safety"
        RISK[risk/manager.ts]
    end

    subgraph "Layer 4: State"
        STORE[store/index.ts]
    end

    subgraph "Layer 5: Presentation"
        PAGE[app/page.tsx]
        CSS[app/globals.css]
        LAYOUT[app/layout.tsx]
    end

    T --> DNA
    T --> EVAL
    T --> EVO
    T --> BRAIN
    T --> RISK
    T --> STORE
    T --> PAGE
    TS --> ISLAND
    TS --> CORTEX
    TS --> MIG

    DNA --> EVO
    EVAL --> EVO
    EVAL --> BRAIN
    EVO --> BRAIN

    WFA --> BRAIN
    MC --> BRAIN
    RD --> BRAIN
    OFD --> BRAIN
    WFA --> ISLAND
    MC --> ISLAND
    RD --> ISLAND
    OFD --> ISLAND

    EVO --> ISLAND
    ISLAND --> CORTEX
    MIG --> CORTEX
    CAP --> CORTEX
    META --> CORTEX
    META --> ISLAND

    BRAIN --> STORE
    CORTEX --> STORE
    STORE --> PAGE
    CSS --> PAGE
end
```

---

## Data Flow

### 1. Island Model Architecture

```
Cortex (Orchestrator)
  ├── Island: BTCUSDT:1h
  │     ├── EvolutionEngine (pop: 10)
  │     ├── Validation Pipeline (4-Gate)
  │     ├── Trade History (scoped)
  │     └── Strategy Memory (regime-based)
  ├── Island: ETHUSDT:1h
  │     └── ... (same structure)
  ├── Island: BTCUSDT:15m
  │     └── ... (same structure)
  ├── Migration Engine (cross-island transfer)
  ├── Capital Allocator (weighted distribution)
  └── Correlation Guard (directional risk)
```

### 2. Strategy Evolution Pipeline (Per-Island)

```
Random Genesis → [Strategy DNA Pool] (tagged with slotId)
                        ↓
              Paper Trade Each Strategy (30+ trades)
                        ↓
              Collect Trade Results + Regime Tags
                        ↓
         Evaluate Performance (Complexity-Penalized Fitness)
                        ↓
     Tournament Selection → Crossover → Mutation (Adaptive Rate)
                        ↓
              New Generation Created (Deflated Fitness Applied)
                        ↓
                   (Repeat Loop)
```

### 3. 4-Gate Validation Pipeline

```
Strategy reaches 30+ trades
         ↓
   Gate 1: Walk-Forward Analysis (efficiency ≥ 50%)
         ↓
   Gate 2: Monte Carlo Permutation (p-value < 0.05)
         ↓
   Gate 3: Overfitting Detection (score < 40/100)
         ↓
   Gate 4: Regime Diversity (≥ 2 unique regimes)
         ↓
   ALL PASS → CANDIDATE → ACTIVE
   ANY FAIL → RETIRED (with logged reason)
```

### 4. Cross-Island Migration

```
Island A (BTCUSDT:1h) — Top strategy fitness: 72
         ↓ Migration affinity check
         ↓ Same pair, different TF → 0.8 affinity
Island B (BTCUSDT:15m) — Receives adapted migrant
         ↓ Strategy re-scoped: fitness reset, slotId updated
         ↓ Must prove itself from scratch in new environment
```

### 5. Capital Allocation

```
Total Capital: $10,000
         ↓ 3-factor weighting
  ┌─ Lifetime Fitness (60%)
  ├─ Recent Trend (30%)
  └─ Diversity Contribution (10%)
         ↓
  Island A: 25% ($2,500)
  Island B: 22% ($2,200)
  Island C: 18% ($1,800)  ← floor: min 5%
  ...                      ← cap: max 30%
```

### 6. Trade Execution Flow (Future)

```
Cortex receives market data → updates all pair-matching islands
         ↓
Island selects Active Strategy
         ↓
Strategy DNA → Signal Rules evaluated against Market Data
         ↓
Entry Signal Triggered → Risk Manager validates trade (GLOBAL)
         ↓
         ┌── PASS → Execute Order → Track Position → Monitor Exit Signals
         └── FAIL → Log rejection → Skip trade
```

### 7. Dashboard Data Flow

```
Cortex → CortexSnapshot → useCortexStore → Multi-island dashboard (future)
AIBrain → BrainSnapshot  → useBrainStore  → Current 8-panel dashboard
                                              ├── PortfolioOverview
                                              ├── ActiveStrategyPanel
                                              ├── RiskGauge
                                              ├── PerformanceChartPanel
                                              ├── EvolutionTimelinePanel
                                              ├── BrainMonitorPanel
                                              ├── CortexNeuralMapPanel (← NEW: live island visualization)
                                              ├── TradeHistoryPanel
                                              └── MarketOverviewPanel
```

### 8. Meta-Evolution (GA²) Data Flow

```
Cortex tracks total strategy generations
         ↓ Every 10 generations...
Meta-Evolution Cycle Triggered
         ↓
  For each Island: collect meta-fitness inputs
    ├─ Convergence Speed: best fitness / generation number
    ├─ Peak Fitness: highest fitness achieved
    ├─ Fitness Stability: inverse of last 5 generation variance
    └─ Validation Pass Rate: strategies passed / total validated
         ↓
  MetaEvolutionEngine evaluates all HyperDNA
         ↓
  Sort Islands by meta-fitness score
         ↓
  Meta-Crossover: weighted average of top 2 HyperDNA
         ↓
  Conservative Meta-Mutation: ±10% max perturbation
         ↓
  Stability Guard: clamp to safe ranges
         ↓
  Replace worst Island's HyperDNA with offspring
         ↓
  Island reconfigures its EvolutionEngine with new parameters
```

---

## Zustand Store Architecture

| Store | Data Domain | Persistence |
|-------|-------------|-------------|
| `useBrainStore` | AI Brain state, strategy, evolution, logs, validation | In-memory only |
| `useCortexStore` | Multi-island orchestration, island snapshots, migration, capital | In-memory only |
| `usePortfolioStore` | Balance, P&L, positions | In-memory only |
| `useTradeStore` | Trade history (last 500) | LocalStorage |
| `useMarketStore` | Live tickers, selected pair | In-memory only |
| `useDashboardConfigStore` | UI preferences, testnet toggle | LocalStorage |

---

## Risk Management Integration

The Risk Manager operates as an **independent, GLOBAL safety layer** across ALL islands:

```
Any Island → "I want to open BTCUSDT LONG"
    ↓
Risk Manager checks (GLOBALLY):
  1. Position size ≤ 2% of GLOBAL balance?
  2. Current positions < 3 (ALL ISLANDS COMBINED)?
  3. Daily drawdown < 5% (SUM of all island PnLs)?
  4. Total drawdown < 15%?
  5. Stop-loss present?
  6. Leverage ≤ 10x?
  7. Emergency stop NOT active?
    ↓
  ┌── ALL PASS → Trade executed
  └── ANY FAIL → Trade rejected, reason logged
```

---

## Key Design Patterns

| Pattern | Where Used | Why |
|---------|-----------|-----|
| **Genome/DNA** | `strategy-dna.ts` | Enables sexual reproduction (crossover) and mutation of strategies |
| **Tournament Selection** | `evolution.ts` | Balances exploration/exploitation better than roulette wheel |
| **Composite Fitness** | `evaluator.ts` | Multi-metric scoring with complexity penalty prevents overfitting |
| **Snapshot Pattern** | `brain.ts`, `island.ts`, `cortex.ts` | Immutable state snapshots for thread-safe dashboard updates |
| **Persist Middleware** | `store/index.ts` | Selective localStorage persistence for trades and config only |
| **Island Model GA** | `island.ts`, `cortex.ts` | Isolated evolution per pair+timeframe prevents cross-contamination |
| **Meta-Evolution (GA²)** | `meta-evolution.ts`, `island.ts`, `cortex.ts` | Second-layer GA optimizes evolution parameters (HyperDNA) per-island |
| **Migration** | `migration.ts` | Cross-island knowledge transfer with affinity-based topology |
| **Deflated Sharpe** | `monte-carlo.ts` | Corrects for multiple-testing bias across generations |
| **Walk-Forward** | `walk-forward.ts` | Validates out-of-sample performance to prevent curve fitting |
| **Regime Memory** | `evolution.ts` | Tracks which gene configs excel per market regime |
| **Gradient Accents** | `globals.css` | Visual differentiation of card types through colored top-borders |
| **Stagger Animation** | `globals.css`, `page.tsx` | Cinematic card entrance with sequential delays |

---

*Last Updated: 2026-03-06*
