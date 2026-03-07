# Changelog — Learner

All notable changes to this project are documented here.

---

## [v0.18.0] — 2026-03-07

### Added
- **Neural Brain Visualization (Phase 18)**
  - `src/app/brain/page.tsx` — Holographic JARVIS-style 3D cortex visualization (~675 lines)
    - 10 neuron nodes: hex wireframe (inner/core tier) + circle wireframe (outer tier)
    - 15 synapses with animated signal propagation (CSS `signalPulse`)
    - CSS 3D perspective (`perspective: 1200px` + `preserve-3d`), scanline overlay, hex grid background
    - HUD System: Stats bar, Target Lock detail panel, Consciousness Arc gauge (SVG, 0-100)
    - Floating holographic data particles orbiting neurons
    - Multi-Color Memory Trace Heatmap: 10 curated HSLA hues per neuron row, activity→lightness+alpha
    - Colored dot indicators next to heatmap row labels
  - **Biological Refractory Period**: 800ms per-neuron cooldown via `cooldownRef` Map — prevents cascade fire storms
  - **6-Point Stability Fix**: Decay 1.1→4.5x/sec, gain 0.5→0.35, CSS bloom removed, scan ring capped, signal speed 2.2→1.2x
  - `src/app/globals.css` — +600 lines: holographic theme (3D canvas, scanlines, hex grid, neuron wireframes, synapse animations, HUD elements, consciousness arc, particles, heatmap multi-color)

### Build Status
✅ Passing (zero errors)

## [v0.17.0] — 2026-03-07

### Added
- **Skill Auto-Activation Intelligence (Phase 17)**
  - `scripts/generate-skill-map.js` — Static import analyzer (~330 lines)
    - Parses all source file `import` statements
    - Maps 55 files to skill dependencies with 3 priority levels (primary/secondary/conventions)
    - Generates `.agent/skill-map.json` (932 lines, machine-readable file→skill index)
    - Generates `.agent/skill-graph.md` (138 lines, Mermaid DAG with 16 nodes, 76 edges, 5 color layers)
    - Transforms passive skill documents into an active intelligence layer

### Build Status
✅ Passing (zero errors)

## [v0.16.0] — 2026-03-07

### Added
- **Skill Architecture Audit & New Skills (Phase 16)**
  - `.agent/skills/strategic-overmind/SKILL.md` — 285 lines, covers 15 Overmind modules, 6-phase cycle, CCR, PSPP, OpusClient
  - `.agent/skills/hybrid-persistence/SKILL.md` — 165 lines, covers PersistenceBridge, IndexedDB, Supabase, cloud-first hydration
  - `.agent/skills/trade-forensics/SKILL.md` — 215 lines, covers TradeBlackBox, ForensicAnalyzer, Bayesian learning
  - `scripts/validate-skills.js` — Skill Integrity Validator (~252 lines), self-auditing knowledge graph

### Changed
- `.agent/skills/regime-intelligence/SKILL.md` — +PSPP bridge section, +predictive-orchestrator.ts key file, +2 cross-refs
- `.agent/skills/learner-conventions/SKILL.md` — +Overmind dir (15 files), +persistence paths, +7 module log prefixes, +3 cross-refs

### Build Status
✅ Passing (zero errors)

## [v0.15.0] — 2026-03-07

### Added
- **Strategic Overmind Architecture (Phase 15)**
  - `src/lib/engine/overmind/` — 15 modules (~3200 lines total)
    - `strategic-overmind.ts` — 6-phase reasoning cycle orchestrator (~805 lines)
    - `opus-client.ts` — Opus 4.6 API client singleton (~314 lines)
    - `hypothesis-engine.ts` — Market hypothesis generation (~339 lines)
    - `evolution-director.ts` — GA directive generation (~274 lines)
    - `adversarial-tester.ts` — ACE strategy stress testing (~377 lines)
    - `predictive-orchestrator.ts` — PSPP bridge (MRTI → Overmind)
    - `episodic-memory.ts` + `counterfactual-engine.ts` + `meta-cognition.ts` — CCR system
    - `prompt-engine.ts`, `response-parser.ts`, `pair-specialist.ts`, `emergent-indicator.ts`, `strategy-decomposer.ts`, `reasoning-journal.ts` — Supporting modules
  - `src/types/overmind.ts` — 23 interfaces for Overmind, PSPP, CCR type system
  - `src/app/pipeline/page.tsx` — Overmind Hub panel added (~650 lines added, now ~2050 total)

### Architecture
- ADR-008: Strategic Overmind Architecture decision documented

### Build Status
✅ Passing (zero errors)

## [v0.14.0] — 2026-03-06

### Added
- **Supabase Cloud Database (Phase 14)**
  - `src/lib/db/supabase.ts` — PostgreSQL cloud client with graceful degradation (~340 lines)
  - 6 tables created: trades, strategies, evolution_snapshots, forensic_reports, portfolio_snapshots, engine_state
  - JSONB data pattern + indexed scalar columns

### Changed
- `src/lib/engine/persistence-bridge.ts` — Complete rewrite: dual-write (IndexedDB + Supabase), lazy auto-init, cloud-first checkpoint loading, race-condition-safe singleton init
- `.env.local` — Added Supabase URL + anon key

### Architecture
- ADR-007: Hybrid Persistence Architecture decision documented

### Build Status
- ✅ `npx next build` — zero errors

## [v0.13.0] — 2026-03-06

### Added
- **IndexedDB Persistence Layer (Phase 13)**
  - `src/lib/store/persistence.ts` — 6 object stores, Zustand adapter, auto-checkpoint (~480 lines)
  - `idb` dependency added

### Changed
- `src/lib/store/index.ts` — TradeStore + PortfolioStore migrated from localStorage to IndexedDB

### Build Status
- ✅ `npx next build` — zero errors

## [v0.12.0] — 2026-03-06

### Added
- **Trade Forensics Engine (Phase 12)**
  - `src/lib/engine/trade-forensics.ts` — 3-layer forensics (~620 lines)
    - `TradeBlackBox`: Flight recorder with 8 event types, MFE/MAE tracking
    - `ForensicAnalyzer`: Post-trade autopsy, 3 efficiency scores, 4-factor Bayesian attribution
    - `TradeForensicsEngine`: Lifecycle orchestrator, query API, stats aggregation
  - `src/lib/engine/forensic-learning.ts` — Closed-loop learning (~310 lines)
    - `ForensicLearningEngine`: Bayesian belief aggregation, fitness modifiers (±10), DNA matching, decay
  - `src/types/index.ts` — +135 lines: TradeEventType, TradeLifecycleEvent, CausalFactorType/CausalFactor, TradeLessonType/TradeLesson, TradeForensicReport

### Changed
- `src/lib/engine/island.ts` — Integrated TradeForensicsEngine + ForensicLearningEngine (tickAll, openBlackBox, closeAndAnalyze, lesson ingestion, 2 accessors)
- `src/lib/engine/evaluator.ts` — `calculateFitnessScore()` now accepts ForensicLearningEngine + MarketRegime (closed-loop feedback)

### Build Status
- ✅ `npx next build` — zero errors

## [v0.11.0] — 2026-03-06

### Added
- **Markov Regime Transition Intelligence — MRTI (Phase 11)**
  - `src/lib/engine/regime-intelligence.ts` — Predictive regime engine (~530 lines)
    - `TransitionMatrix`: 5×5 Markov chain with Laplace smoothing
    - `EarlyWarningDetector`: 4 leading signals (ADX slope, ATR acceleration, duration exhaustion, confidence decay)
    - `RegimeIntelligence`: Orchestrator → HOLD / PREPARE / SWITCH recommendations
  - `.agent/skills/regime-intelligence/SKILL.md` — New skill (~130 lines)

### Changed
- `src/lib/engine/regime-detector.ts` — Exported `calculateADX()` and `calculateATR()` for MRTI
- `src/lib/engine/strategy-roster.ts` — Added `preWarmForRegime()` and `hasCoverageForRegime()` for predictive pre-warming
- `src/lib/engine/island.ts` — MRTI auto-calibration (200+ candles), `handleRegimeForecast()`, proactive SWITCH logic
- `src/lib/engine/cortex.ts` — `evaluateGlobalRegimeRisk()` (macro consensus), `adjustAllocationsForRegimeForecast()` (risk-weighted capital)

### Build Status
- ✅ `npx next build` — zero errors

## [v0.10.0] — 2026-03-06

### Added
- **Backtesting Simulation Engine (Phase 10)**
  - `src/lib/engine/market-simulator.ts` — Realistic execution modeling (~280 lines)
    - ATR-adaptive slippage (volatility-scaled, 2bps base)
    - Binance Futures taker commission (0.04% default)
    - Almgren-Chriss square-root market impact model
    - Intra-candle SL/TP detection (conservative: SL wins ties)
    - Direction-aware fill simulation (LONG/SHORT asymmetry)
    - Position quantity and SL/TP level calculation utilities
  - `src/lib/engine/backtester.ts` — Multi-candle simulation engine (~570 lines)
    - Complete simulation loop: candle iteration → SL/TP check → signal evaluation → execution → equity tracking
    - `IndicatorCache` class (**PFLM Innovation**): pre-computes indicator values once, shares across population
    - `runBacktest()`: full simulation with equity curve, regime tagging, fee tracking
    - `batchBacktest()`: evaluates entire population with shared indicator cache → O(N+M) vs O(N×M)
    - `quickFitness()`: lean mode (no equity curve/regime tagging) for rapid GA fitness evaluation
    - Regime-partitioned trade tagging via regime-detector integration

### Changed
- `src/lib/engine/evaluator.ts` — Exported `calculateNoveltyBonus()` for backtesting engine access

### Build Status
- ✅ `npx next build` — zero errors

---

## [v0.9.0] — 2026-03-06

### Added
- **Advanced Strategy Genome Architecture (Phase 9)**
  - `src/lib/engine/microstructure-genes.ts` — Microstructure gene engine (~380 lines)
    - Volume Profile: POC detection, bucket concentration analysis
    - Volume Acceleration: spike detection, accumulation/distribution
    - Candle Anatomy: body:wick ratios, shadow dominance, evolvable thresholds
    - Range Expansion/Contraction: ATR sequence detection
    - Absorption Detection: whale activity (large candle + small net movement)
  - `src/lib/engine/price-action-genes.ts` — Price action gene engine (~400 lines)
    - 10 parameterized candlestick formations with EVOLVABLE detection thresholds
    - Structural Break: N-bar high/low detection
    - Swing Sequence: HH/HL and LH/LL analysis
    - Compression/Breakout: narrowing range → breakout detection
    - Gap Analysis: ATR-normalized gap detection
  - `src/lib/engine/composite-functions.ts` — **KEY INNOVATION**: Mathematical evolution (~310 lines)
    - 9 operations: ADD, SUBTRACT, MULTIPLY, DIVIDE, MAX, MIN, ABS_DIFF, RATIO, NORMALIZE_DIFF
    - 4 normalization methods: none, percentile, z_score, min_max
    - Inputs: any indicator, raw price field, or other gene output
  - `src/lib/engine/directional-change.ts` — **RADICAL INNOVATION**: Event-based analysis (~350 lines)
    - Kampouridis's Directional Change framework
    - Evolved θ% reversal threshold per strategy
    - DC events: upturn, downturn, upward/downward overshoot
    - DC-derived indicators: trendRatio, avgMagnitude, oscillationCount, upturnRatio

### Changed
- **Type System** — +220 lines: 5 new enums, 8 new interfaces, StrategyDNA extended with optional advanced gene arrays, PatternType extended with 4 new pattern types
- **strategy-dna.ts** — Advanced gene integration: 40% injection in genesis, crossover blending, mutation perturbation/injection, `calculateStructuralComplexity()`, `crossoverAdvancedGenes()`, `mutateAdvancedGenes()`
- **evaluator.ts** — `calculateNoveltyBonus()`: up to +8 fitness points for advanced gene usage, decaying over 200 generations
- **signal-engine.ts** — `calculateAdvancedSignals()`: central integration computing all advanced gene signals with aggregate bias + confidence scoring
- **experience-replay.ts** — MICROSTRUCTURE_COMBO + COMPOSITE_FUNCTION pattern extraction

### Build Status
✅ Passing (zero errors)

---

## [v0.8.0] — 2026-03-06

### Added
- **Evolution Pipeline Dashboard (Phase 8)**
  - New `/pipeline` route with dedicated `page.tsx` (~1400 lines)
  - Pipeline Flow Visualizer: 7-stage animated horizontal flow (Genesis → Evolve) with per-stage live stats
  - Generation Fitness Tracker: dual-axis area chart (best/avg fitness) with validation markers
  - 4-Gate Validation Viewer: animated sequential gate reveal with PROMOTED/RETIRED verdict
  - Strategy Roster Radar: 5-regime radar chart + top 5 strategy list with state emojis
  - Experience Replay Heatmap: 5 regimes × 3 pattern types confidence grid
  - Live Pipeline State Machine: auto-cycling demo engine with per-stage timing
  - Navigation tabs (Dashboard ↔ Pipeline) on both pages
- **Strategy Archaeology (Phase 8.5 — Radical Innovation)**
  - Gene Lineage Tree: 6-generation family tree with origin tracking (🎲/🔮/✂️/🔀/⭐)
  - Gene Survival Heatmap: 10 genes × 14 generations grid, persistent genes glow
  - Decision Explainer: regime change event cards with cause-chains and rejected alternatives
  - ADR-005: Strategy Archaeology — Explainable AI for Genetic Strategy Evolution

### Changed
- `globals.css` — +620 lines (now ~1960 lines: pipeline stages, connectors, archaeology panels)
- `page.tsx` (main) — +10 lines (navigation tabs)

### Build Status
✅ Passing (zero errors)

---

## [v0.7.0] — 2026-03-06

### Added
- **Dashboard Enhancement Phase 1 — UX Polish**
  - Gradient card accents (7 color variants: cyan, primary, rose, emerald, purple, amber, neural + critical pulse)
  - Stagger fade-in animations (9 levels, 60ms intervals, cubic-bezier easing)
  - `useAnimatedValue` hook for smooth number counter transitions
  - Risk-pulse-critical animation when utilization > 70%
- **Dashboard Enhancement Phase 2 — Cortex Neural Map (Radical Innovation)**
  - `CortexNeuralMapPanel` — 6 island nodes in circular layout, color-coded by state
  - Node size scales with fitness score (14-38px)
  - 4 animated migration flow lines with SVG particles
  - Center Cortex brain badge with GA² meta-generation counter
  - Hover tooltips: State, Fitness, Generation, Trades, HyperDNA
  - Legend + real-time stats footer (Islands, Avg Fitness, Migrations)
- **New Agent Skills (4)**
  - `data-visualization` — Financial chart engineering, 5 chart patterns
  - `multi-island-ui` — Cortex dashboard components, Island Card, Grid Panel
  - `motion-design` — Animation engineering, timing/easing, state transitions

### Changed
- `page.tsx` — +290 lines (now ~1300 lines, 9 panels + CortexNeuralMap)
- `globals.css` — +295 lines (now ~1060 lines, neural map styles, gradient accents)

### Build Status
✅ Passing (zero errors)

---

## [v0.6.0] — 2026-03-06

### Added
- **Meta-Evolution GA² System**
  - `src/lib/engine/meta-evolution.ts` — MetaEvolutionEngine class (380 lines)
    - HyperDNA genome: mutationRate, crossoverRate, populationSize, elitismRate, tournamentSize, fitnessWeights
    - Meta-crossover: weighted average of best HyperDNA genomes
    - Conservative meta-mutation: ±10% max perturbation with stability guard
    - 4-component meta-fitness evaluation: convergence speed, peak fitness, fitness stability, validation pass rate
    - HyperDNA→EvolutionConfig bridge function
  - `src/types/index.ts` — HyperDNA, MetaFitnessRecord, MetaEvolutionConfig interfaces (+86 lines)
  - `.agent/skills/meta-evolution/SKILL.md` — GA² skill documentation (200+ lines)

### Changed
- `island.ts` — HyperDNA support: constructor overload, getter/setter, generation fitness history tracking, validation stats, diversity index (+80 lines)
- `cortex.ts` — Meta-evolution integration: MetaEvolutionEngine, HyperDNA generation for islands, meta-evolution cycle orchestration every 10 generations (+120 lines)

### Build Status
✅ Passing (zero errors)

---

## [v0.5.0] — 2026-03-06

### Added
- **Multi-Pair Multi-Timeframe Island Model Architecture** (9-Expert Council)
  - `src/types/trading-slot.ts` — TradingSlot identifier (pair:timeframe), factory functions, default slots
  - `src/lib/engine/island.ts` — Self-contained evolution unit per pair+timeframe with scoped EvEngine, validation, migration API
  - `src/lib/engine/cortex.ts` — Multi-island orchestrator (spawn/retire/pause, migration, capital, correlation guard)
  - `src/lib/engine/migration.ts` — Cross-island transfer with 3 topologies (Neighborhood, Ring, Star) and affinity scoring
  - `src/lib/engine/capital-allocator.ts` — Dynamic 3-factor weighted capital distribution (60% fitness, 30% trend, 10% diversity)
  - `useCortexStore` — New Zustand store with 12 actions for multi-island management

### Changed
- **Type System** — Added `slotId` to StrategyDNA, Trade, Position. Added IslandSnapshot, CortexSnapshot, MigrationEvent, IslandAllocation interfaces
- **strategy-dna.ts** — `slotId: ''` in genesis (set by Island on creation)
- **page.tsx** — Demo Trade data includes `slotId` field
- Backward compatible: old AIBrain + BrainStore preserved alongside new Cortex + CortexStore

### Build Status
✅ Passing (zero errors)

---

## [v0.4.0] — 2026-03-06

### Added
- **Anti-Overfitting Architecture** (8-Expert Council)
  - `src/lib/engine/walk-forward.ts` — Walk-Forward Analysis with rolling IS/OOS windows, efficiency ratio
  - `src/lib/engine/monte-carlo.ts` — Monte Carlo permutation testing (1000 shuffles) + Deflated Sharpe Ratio
  - `src/lib/engine/regime-detector.ts` — Market regime classification (5 regimes via ADX/ATR/SMA)
  - `src/lib/engine/overfitting-detector.ts` — Composite overfitting risk scoring (0-100)

### Changed
- **evaluator.ts** — Complexity penalty multiplier, min 30 trades, deflated fitness function
- **evolution.ts** — Adaptive mutation rates, diversity pressure, Strategy Memory (regime-based gene tracking)
- **brain.ts** — 4-Gate Validation Pipeline (WFA + MC + Overfitting + Regime), 3-Stage Promotion (Paper → Candidate → Active)
- **types/index.ts** — MarketRegime enum, VALIDATING/SHADOW_TRADING states, 12 validation interfaces
- **store/index.ts** — Validation state fields + updateMarketData action
- **page.tsx** — BrainStateIndicator updated with VALIDATING/SHADOW_TRADING

### Build Status
✅ Passing (zero errors)

---

## [v0.3.0] — 2026-03-06

### Added
- **Agent Skills (6 total)**
  - `learner-conventions` — Development flags, TS patterns, memory sync protocol
  - `evolution-engine` — GA operations, DNA genome, crossover, mutation + `references/dna-schema.md`
  - `risk-management` — 8 non-negotiable safety rails, validation flow, forbidden modifications
  - `binance-integration` — REST/WebSocket endpoints, auth, error handling + `references/api-endpoints.md`
  - `performance-analysis` — Composite fitness formula, metric calculations + `references/fitness-formula.md`
  - `dashboard-development` — Glassmorphism design system, Recharts patterns, panel architecture

### Build Status
✅ Passing (zero errors)

---

## [v0.2.0] — 2026-03-06

### Added
- **Context Memory Preservation Architecture (CPA)**
  - `memory/overview.md` — Project identity & tech stack
  - `memory/active_context.md` — Dynamic state tracker
  - `memory/architecture/system_design.md` — Module dependency & data flow
  - `memory/file_map.md` — Complete file navigator with importance levels
  - `memory/adr/001-ga-over-rl.md` — First ADR (GA over RL decision)
  - `memory/changelog.md` — This file
  - `memory/_SYNC_CHECKLIST.md` — Session audit checklist
- **Workflow Commands**
  - `.agent/workflows/memory-reload.md` — `/memory-reload` context hydration
  - `.agent/workflows/memory-sync.md` — `/memory-sync` state persistence

### Fixed
- **Recharts Tooltip** — Fixed TypeScript type error (`value: string | number | undefined`)

### Build Status
✅ Passing (zero errors)

---

## [v0.1.0] — 2026-03-05

### Added
- **Project Foundation**
  - Next.js 15 + TypeScript (App Router) initialized
  - Dependencies: zustand, recharts, lucide-react, uuid
- **Core Type System** (`src/types/index.ts`)
  - 300+ lines: Enums, StrategyDNA, Trade, PerformanceMetrics, EvolutionGeneration, RiskConfig
- **AI Evolution Engine**
  - `src/lib/engine/strategy-dna.ts` — DNA genome generator, crossover, mutation
  - `src/lib/engine/evaluator.ts` — Composite fitness scoring (Sharpe, Sortino, PF, Expectancy)
  - `src/lib/engine/evolution.ts` — Genetic algorithm with tournament selection, elitism
  - `src/lib/engine/brain.ts` — AI Brain orchestrator (lifecycle management)
- **Risk Management**
  - `src/lib/risk/manager.ts` — 8 hardcoded safety rails
- **State Management**
  - `src/lib/store/index.ts` — 5 Zustand stores (Brain, Portfolio, Trade, Market, Config)
- **Premium Dashboard**
  - `src/app/globals.css` — Dark glassmorphism design system (470+ lines)
  - `src/app/page.tsx` — 8-panel dashboard with demo data (1000+ lines)
  - `src/app/layout.tsx` — Root layout with Google Fonts

### Build Status
✅ Passing (zero errors)

---

*Maintained as part of the Learner Institutional Memory Architecture.*
