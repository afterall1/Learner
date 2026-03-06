# Active Context — Learner

> This file is the **dynamic state tracker** for the Learner project. It must be updated at the end of every significant session via `/memory-sync`.

---

## 📅 Current State

**Date**: 2026-03-06
**Phase**: Phase 12 — Trade Forensics Engine
**Build Status**: ✅ Passing (zero errors)
**Dev Server**: `http://localhost:3000`

---

## 🧠 AI Brain Status

| Property | Value |
|----------|-------|
| **Architecture** | Cortex (multi-island) + AIBrain (single-island, backward compatible) |
| **Meta-Evolution** | GA² Active — HyperDNA genome optimizes evolution parameters per-island |
| **Advanced Genome** | Phase 9 — 5 advanced gene families: Microstructure, Price Action, Composite Functions, Multi-TF Confluence, Directional Changes |
| **Brain State** | Demo Mode (pre-API integration) |
| **Island Model** | Ready (Cortex + 5 starter slots configured) |
| **Backtesting Engine** | Phase 10 — `backtester.ts` (PFLM IndicatorCache) + `market-simulator.ts` (Almgren-Chriss slippage) |
| **Regime Intelligence** | Phase 11 — MRTI: Markov Chain transition matrix + 4-signal early-warning detector + proactive strategy pre-warming |
| **Trade Forensics** | Phase 12 — TradeBlackBox (8 event types, MFE/MAE) + ForensicAnalyzer (4-factor causal attribution) + 8 lesson types |
| **Validation Pipeline** | 4-Gate (WFA + Monte Carlo + Overfitting + Regime Diversity) + Novelty Bonus |
| **Promotion Pipeline** | 3-Stage (Paper → Candidate → Active) |
| **Current Generation** | N/A (awaiting Binance API connection) |
| **Best Fitness Score** | N/A |
| **Active Strategy** | Demo: "Nova Tiger" (Score: 67) |
| **Total Trades** | 0 (live), 42 (demo simulation) |
| **Paper Trade Progress** | 0/30 required for validation |
| **Dashboard** | Main: 9 panels + Cortex Neural Map | Pipeline: 8 panels (5 pipeline + 3 archaeology) |

---

## ✅ Completed Tasks

### Session: 2026-03-05 — Project Genesis
1. **Expert Council Deliberation**: 6-member council formed, GA-over-RL decision made
2. **Project Foundation**: Next.js 15 + TypeScript initialized, dependencies installed
3. **Type System**: 300+ line comprehensive type system (`src/types/index.ts`)
4. **Strategy DNA Engine**: Genome generator, crossover, mutation (`strategy-dna.ts`)
5. **Performance Evaluator**: Sharpe/Sortino/PF/Expectancy composite scoring (`evaluator.ts`)
6. **Evolution Engine**: Tournament selection, elitism, generation lifecycle (`evolution.ts`)
7. **AI Brain Orchestrator**: Full lifecycle management (`brain.ts`)
8. **Risk Manager**: 8 hardcoded safety rails (`manager.ts`)
9. **Zustand Stores**: 5 stores — Brain, Portfolio, Trade, Market, Config (`store/index.ts`)
10. **Premium Dashboard**: 8-panel glassmorphism dashboard with demo data (`page.tsx`)
11. **Design System**: 470+ line CSS with dark theme, animations (`globals.css`)

### Session: 2026-03-06 — Context Memory + Agent Skills
12. **Recharts Fix**: Fixed Tooltip formatter TypeScript errors (value: undefined handling)
13. **CPA Implementation**: 5-layer Context Memory Preservation Architecture (7 memory files)
14. **Workflow Commands**: `/memory-sync` (8-step) and `/memory-reload` (6-step) created
15. **Agent Skills (6)**: learner-conventions, evolution-engine, risk-management, binance-integration, performance-analysis, dashboard-development
16. **Skill References (3)**: dna-schema.md, api-endpoints.md, fitness-formula.md

### Session: 2026-03-06 — Anti-Overfitting Architecture (8-Expert Council)
17. **Walk-Forward Analysis Engine**: Rolling IS/OOS windows, efficiency ratio ≥ 50% (`walk-forward.ts`)
18. **Monte Carlo Validation Engine**: 1000 permutations, p-value < 0.05 + Deflated Sharpe Ratio (`monte-carlo.ts`)
19. **Market Regime Detector**: 5 regimes via ADX/ATR/SMA classification (`regime-detector.ts`)
20. **Overfitting Detection System**: Composite 0-100 risk score, threshold < 40 (`overfitting-detector.ts`)
21. **Enhanced Evaluator**: Complexity penalty, min 30 trades, deflated fitness function
22. **Enhanced Evolution Engine**: Adaptive mutation, diversity pressure, Strategy Memory, regime tracking
23. **Upgraded AI Brain**: 4-Gate Validation Pipeline + 3-Stage Promotion (Paper → Candidate → Active)
24. **Type System Update**: MarketRegime enum, 12 new validation interfaces
25. **Store Update**: Validation-related state fields + updateMarketData action

### Session: 2026-03-06 — Multi-Pair Island Model Architecture (9-Expert Council)
26. **Trading Slot System**: Pair+timeframe identifier with factory functions (`trading-slot.ts`)
27. **Island Module**: Self-contained evolution unit per pair+timeframe (`island.ts`)
28. **Migration Engine**: 3-topology cross-island knowledge transfer (`migration.ts`)
29. **Capital Allocator**: Dynamic 3-factor weighted budget distribution (`capital-allocator.ts`)
30. **Cortex Orchestrator**: Multi-island coordinator with correlation guard (`cortex.ts`)
31. **Type System Update**: slotId on StrategyDNA/Trade/Position + IslandSnapshot, CortexSnapshot, MigrationEvent, IslandAllocation
32. **CortexStore**: New Zustand store with 12 actions for multi-island management
33. **Backward Compatibility**: Old AIBrain + BrainStore preserved alongside new Cortex + CortexStore

### Session: 2026-03-06 — Meta-Evolution GA² System
34. **HyperDNA Type System**: HyperDNA, MetaFitnessRecord, MetaEvolutionConfig interfaces added to `types/index.ts`
35. **Meta-Evolution Engine**: `meta-evolution.ts` — HyperDNA genome generation, meta-crossover, conservative meta-mutation, stability guard, 4-component meta-fitness evaluation, HyperDNA→EvolutionConfig bridge
36. **Island Integration**: Island class accepts HyperDNA in constructor, reconfigures EvolutionEngine, tracks generation fitness history + validation stats + diversity index for meta-fitness evaluation
37. **Cortex Integration**: Cortex class orchestrates meta-evolution cycles — evaluates HyperDNA, performs meta-crossover between best islands, replaces worst island's HyperDNA every 10 generations
38. **Meta-Evolution Skill**: `.agent/skills/meta-evolution/SKILL.md` — comprehensive documentation of GA² architecture

### Session: 2026-03-06 — Dashboard Enhancement (Phase 1 + Phase 2)
39. **Phase 1 — UX Polish**: Gradient card accents (7 color variants + critical pulse), stagger fade-in animations (60ms intervals, 9 levels), animated counter hook (`useAnimatedValue`), risk-pulse-critical animation when utilization > 70%
40. **Phase 2 — Cortex Neural Map**: New `CortexNeuralMapPanel` component — 6 island nodes in circular layout, color-coded by state (trading/evolving/exploring/evaluating), node size scales with fitness, 4 animated migration flow lines with SVG particles, center Cortex brain badge with GA² meta-gen counter, hover tooltips (State, Fitness, Generation, Trades, HyperDNA), legend + stats footer
41. **CSS Design System Expansion**: +295 lines — gradient card accents, stagger-in keyframes, neural map container, island nodes, migration particles, cortex center badge, island tooltips
42. **New Agent Skills (4)**: dashboard-development (upgraded), data-visualization, multi-island-ui, motion-design

### Session: 2026-03-06 — Evolution Pipeline Dashboard (Phase 8)
43. **Pipeline Page Route**: New `/pipeline` route with dedicated `page.tsx` (~650 lines initial, ~1400 final)
44. **Pipeline Flow Visualizer**: 7-stage animated horizontal flow (Genesis → Paper Trade → Evaluate → 4-Gate → Roster → Replay → Evolve) with live stats per stage, pulse glow on active
45. **Generation Fitness Tracker**: Dual-axis area chart (best/avg fitness) with validation markers (green=pass, red=fail) and Min Viable reference line
46. **4-Gate Validation Viewer**: Animated sequential gate reveal with progress bars, PASS/FAIL badges, and PROMOTED/RETIRED verdict
47. **Strategy Roster Radar**: 5-regime radar chart + top 5 strategy list with state emoji (🟢/😴/🪦) and confidence color coding
48. **Experience Replay Heatmap**: 5 regimes × 3 pattern types grid, color-coded by confidence, with summary stats
49. **Live Pipeline State Machine**: Auto-cycling demo engine (7 stages, per-stage timing, animated trade counter, gate reveals)
50. **Navigation Integration**: Header nav tabs (Dashboard ↔ Pipeline) on both pages
51. **Pipeline CSS**: ~360 lines new CSS classes for stages, connectors, gates, heatmap, roster entries

### Session: 2026-03-06 — Strategy Archaeology (Phase 8.5, Radical Innovation)
52. **Gene Lineage Tree Panel**: 6-generation family tree with origin tracking (🎲 random / 🔮 seeded / ✂️ crossover / 🔀 mutation / ⭐ validated champion), fitness color coding, hover tooltips
53. **Gene Survival Heatmap Panel**: 10 genes × 14 generations grid, sorted by persistence score, cells colored by fitness, persistent genes (≥60% survival) glow with `persistGlow` animation
54. **Decision Explainer Panel**: Regime change event cards with cause-chain ("Neden bu strateji?"), Bayesian confidence scores, rejected alternatives with rejection reasons, outcome tracking (✅ Kârlı / ❌ Zararlı / ⏳ Devam)
55. **Archaeology CSS**: ~260 lines for lineage nodes, survival cells, decision cards, reason chains
56. **ADR-005**: Strategy Archaeology — Explainable AI for Genetic Strategy Evolution

### Session: 2026-03-06 — Advanced Strategy Genome Architecture (Phase 9, 7-Expert Council)
57. **Type System Extensions**: +220 lines — 5 new enums (MicrostructureGeneType, PriceActionPatternType, CandlestickFormation, ConfluenceType, CompositeOperation, DCEventType), 8 new interfaces (MicrostructureGene, PriceActionGene, TimeframeConfluenceGene, CompositeFunctionGene, DirectionalChangeGene, DCEvent, AdvancedSignalRule), extended StrategyDNA with optional advanced gene arrays, extended PatternType enum
58. **Microstructure Genes Engine**: `microstructure-genes.ts` (~380 lines) — Volume Profile (POC detection), Volume Acceleration (spike/accumulation), Candle Anatomy (body:wick ratios), Range Expansion/Contraction, Absorption Detection (whale activity). Random generator, crossover, mutation operators.
59. **Price Action Genes Engine**: `price-action-genes.ts` (~400 lines) — 10 parameterized candlestick formations (Engulfing, Doji, Hammer, Shooting Star, etc.), Structural Break detection (N-bar high/low), Swing Sequence analysis (HH/HL, LH/LL), Compression/Breakout, Gap Analysis
60. **Composite Function Engine**: `composite-functions.ts` (~310 lines) — **KEY INNOVATION**: Mathematical evolution via 9 operations (ADD, SUBTRACT, MULTIPLY, DIVIDE, MAX, MIN, ABS_DIFF, RATIO, NORMALIZE_DIFF) × 4 normalization methods (none, percentile, z_score, min_max). AI can discover novel indicator relationships like `ABS_DIFF(RSI, EMA_slope)`
61. **Directional Change Engine**: `directional-change.ts` (~350 lines) — **RADICAL INNOVATION**: Event-based price analysis (Kampouridis framework). GA evolves θ reversal threshold. DC events (upturn/downturn) + overshoot detection + DC-derived indicators (trendRatio, oscillationCount, reversalMagnitude)
62. **Strategy DNA Integration**: Extended `generateRandomStrategy()` with 40% advanced gene injection, `crossover()` with advanced gene blending, `mutate()` with advanced gene perturbation + injection. Added `calculateStructuralComplexity()` function
63. **Evaluator Novelty Bonus**: `calculateNoveltyBonus()` — up to +8 fitness points for strategies using advanced gene families, decays over 200 generations
64. **Signal Engine Integration**: `calculateAdvancedSignals()` — central function computing all advanced gene signals, producing aggregate bias + confidence score
65. **Experience Replay Extension**: MICROSTRUCTURE_COMBO + COMPOSITE_FUNCTION pattern extraction and storage
66. **ADR-006**: Advanced Strategy Genome Architecture — Structural evolution beyond parameter optimization

### Session: 2026-03-06 — Backtesting Simulation Engine (Phase 10, 7-Expert Council)
67. **Market Simulator**: `market-simulator.ts` (~280 lines) — ATR-adaptive slippage, Binance taker commission (0.04%), Almgren-Chriss market impact model, intra-candle SL/TP detection (conservative: SL wins ties), direction-aware fill simulation, position sizing utilities
68. **Backtesting Engine**: `backtester.ts` (~570 lines) — Multi-candle simulation loop with indicator warmup, position tracking, equity curve, regime tagging. **PFLM Innovation**: `IndicatorCache` class pre-computes indicators once for all strategies. `runBacktest()`, `batchBacktest()`, `quickFitness()` exported functions
69. **Evaluator Enhancement**: Exported `calculateNoveltyBonus()` for external access by backtesting engine

### Session: 2026-03-06 — MRTI Predictive Regime Intelligence (Phase 11, 7-Expert Council)
70. **Regime Intelligence Engine**: `regime-intelligence.ts` (~530 lines) — TransitionMatrix (5×5 Markov chain, Laplace smoothing), EarlyWarningDetector (ADX slope, ATR acceleration, duration exhaustion, confidence decay), RegimeIntelligence orchestrator (HOLD/PREPARE/SWITCH recommendations)
71. **Regime Detector Export**: Exported `calculateADX()` and `calculateATR()` from `regime-detector.ts` for MRTI reuse
72. **Roster Pre-Warming**: Added `preWarmForRegime()` and `hasCoverageForRegime()` to `strategy-roster.ts`
73. **Island MRTI Integration**: Auto-calibration on 200+ candles, `handleRegimeForecast()` with proactive SWITCH logic, `getRegimeForecast()` accessor
74. **Cortex Predictive Rebalancing**: `evaluateGlobalRegimeRisk()` with macro consensus detection (3+ islands = macro signal), `adjustAllocationsForRegimeForecast()` risk-weighted capital distribution
75. **Regime Intelligence Skill**: New `.agent/skills/regime-intelligence/SKILL.md` (~130 lines)

### Session: 2026-03-06 — Trade Forensics Engine (Phase 12, 7-Expert Council)
76. **Trade Forensics Types**: +135 lines in `types/index.ts` — TradeEventType (8 types), TradeLifecycleEvent, CausalFactorType (4-factor), CausalFactor, TradeLessonType (8 types), TradeLesson, TradeForensicReport
77. **Trade Forensics Engine**: `trade-forensics.ts` (~620 lines) — TradeBlackBox (flight recorder with MFE/MAE/near-miss/regime-change detection), ForensicAnalyzer (3 efficiency scores, 4-factor Bayesian causal attribution, lesson extraction), TradeForensicsEngine (lifecycle orchestrator, query API, stats)
78. **Island Integration**: TradeForensicsEngine auto-ticks on every candle, openBlackBox on trade entry, closeAndAnalyze on trade close with lesson logging
79. **Forensic Learning Engine**: `forensic-learning.ts` (~310 lines) — Bayesian belief aggregation from trade lessons, fitness modifier calculation (±10 points), DNA similarity matching, generational decay, stats API
80. **Evaluator Enhancement**: `calculateFitnessScore()` now accepts `ForensicLearningEngine` + `MarketRegime` params — CLOSES the feedback loop
81. **Island Learning Integration**: ForensicLearningEngine field, automatic lesson ingestion after forensic report, `getForensicLearning()` accessor

---

## 🚧 Incomplete Features / Technical Debt

- [x] ~~**Dashboard UI for Multi-Island** — Island grid, migration log, capital allocation chart~~ (Cortex Neural Map delivered)
- [x] ~~**Pipeline Dashboard** — Evolution process visibility~~ (8 panels delivered)
- [x] ~~**Strategy Archaeology** — Explainable AI~~ (Lineage Tree + Survival Heatmap + Decision Explainer delivered)
- [x] ~~**Advanced Genome** — Evolve beyond standard indicator parameters~~ (5 gene families + structural evolution delivered)
- [ ] **Binance Futures API integration** — REST client + WebSocket streams
- [ ] **Live paper trading** — Connect Cortex to real market data
- [ ] **Risk Manager global enforcement** — Cross-island position counting
- [ ] **Persistent storage** — LocalStorage is demo-only, need proper DB for production
- [ ] **Git initialization** — Project not yet under version control
- [ ] **Automated tests** — Unit tests for validation pipeline, migration engine, and advanced genes
- [ ] **Live data binding** — Connect pipeline panels to real Cortex/Brain state
- [ ] **Confluence Gene runtime** — Multi-TF Confluence genes need higher TF candle data integration

---

## 📅 Next Session Priorities

1. **Initialize Git repository** and make initial commit with full project
2. Binance Futures API integration layer (REST + WebSocket)
3. Connect Cortex to live market data + **backtest strategies against historical klines**
4. Connect Pipeline Dashboard to live Cortex state (replace demo data)
5. MRTI Dashboard Panel — display regime transition forecasts and early warnings

---

*Last Synced: 2026-03-06 21:53 (UTC+3)*
