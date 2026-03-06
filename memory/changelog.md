# Changelog — Learner

All notable changes to this project are documented here.

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
