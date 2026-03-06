# File Map — Learner

> Every source file mapped to its purpose, layer, and importance level.
> **Importance**: 🔴 Critical | 🟡 Important | 🟢 Standard

---

## 📐 Type Layer (`src/types/`)

| File | Purpose | Importance |
|------|---------|------------|
| `index.ts` | Complete type system (480+ lines). All enums (BrainState, StrategyStatus, Timeframe, MarketRegime, etc.), interfaces (StrategyDNA, Trade, Position, PerformanceMetrics, EvolutionGeneration, IslandSnapshot, CortexSnapshot, MigrationEvent, IslandAllocation, validation types), and default constants. | 🔴 |
| `trading-slot.ts` | TradingSlot type — pair+timeframe identifier for the Island Model. Factory functions (`createTradingSlot`, `parseSlotId`), `TradingSlotStatus` enum, default pairs/timeframes, starter slot generator. | 🔴 |

---

## 🧬 Core Engine Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `strategy-dna.ts` | Strategy genome generator. Handles random DNA creation (with `slotId`), sexual crossover between two parent strategies, and random mutation of individual genes. Core of the GA system. | 🔴 |
| `evaluator.ts` | Performance evaluation engine. Calculates Sharpe Ratio, Sortino Ratio, Profit Factor, Max Drawdown, Expectancy, and a composite fitness score (0-100) with **complexity penalty** and **deflated fitness** correction. Min 30 trades for statistical significance. | 🔴 |
| `evolution.ts` | Genetic algorithm controller. Manages generations, implements tournament selection (k=3), elitism (top 20%), crossover (60%), mutation (adaptive rate). **Enhanced**: adaptive mutation, diversity pressure, Strategy Memory (regime-based gene performance tracking), complexity-aware fitness. | 🔴 |
| `brain.ts` | AI Brain orchestrator (single-island mode). Full lifecycle: IDLE → EXPLORING → TRADING → EVALUATING → EVOLVING. **Enhanced**: 4-Gate Validation Pipeline, 3-Stage Promotion (Paper → Candidate → Active), market regime tracking, deflated fitness. | 🔴 |

---

## 🛡️ Anti-Overfitting Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `walk-forward.ts` | Walk-Forward Analysis engine. Generates rolling IS/OOS windows (70%/30%), evaluates strategy across multiple windows, calculates efficiency ratio and degradation metrics. Minimum efficiency ≥ 0.5 required. | 🔴 |
| `monte-carlo.ts` | Monte Carlo permutation testing. Fisher-Yates shuffle, 1000 permutations, 95th percentile significance threshold. Also implements López de Prado's **Deflated Sharpe Ratio** to correct for multiple testing bias. | 🔴 |
| `regime-detector.ts` | Market regime classifier. Uses ADX, ATR, and SMA indicators to classify into 5 regimes: TRENDING_UP, TRENDING_DOWN, RANGING, HIGH_VOLATILITY, LOW_VOLATILITY. Calculates regime diversity (min 2 required). | 🔴 |
| `overfitting-detector.ts` | Composite overfitting risk scorer (0-100). Aggregates WFA (30%), Monte Carlo (25%), Complexity (15%), Regime Diversity (15%), Return Consistency (15%). Score < 40 required to pass. | 🔴 |

---

## 🏝️ Island Model Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `island.ts` | Self-contained evolution unit scoped to one TradingSlot (pair+timeframe). Contains its own EvolutionEngine, trade history, validation pipeline, market data, Migration API (export/import), capital tracking, and **HyperDNA** (GA²). | 🔴 |
| `cortex.ts` | Multi-island orchestrator. Manages island lifecycle, routes trades, triggers migration, rebalances capital, monitors correlation, and orchestrates **Meta-Evolution cycles** (GA²). | 🔴 |
| `meta-evolution.ts` | Meta-Evolution Engine (GA²). HyperDNA genome generation/crossover/mutation, 4-component meta-fitness evaluation, stability guard, HyperDNA→EvolutionConfig bridge. | 🔴 |
| `migration.ts` | Cross-island knowledge transfer. 3 topologies: Neighborhood (affinity-based), Ring (sequential), Star (best broadcasts). Affinity scoring: same pair/different TF = 0.8, same TF/different pair = 0.5. Adapter re-scopes strategies and resets fitness. | 🟡 |
| `capital-allocator.ts` | Dynamic capital distribution. 3-factor weighting: lifetime fitness (60%), recent trend (30%), diversity contribution (10%). Per-island floor (5%) and cap (30%). Periodic rebalancing. | 🟡 |

---

## 🛡️ Risk Layer (`src/lib/risk/`)

| File | Purpose | Importance |
|------|---------|------------|
| `manager.ts` | Risk management engine with 8 hardcoded safety rails. Validates every trade against position size, leverage, drawdown limits, and mandatory stop-loss rules. These rules are **non-overridable** and operate **GLOBALLY across all islands**. | 🔴 |

---

## 📦 State Layer (`src/lib/store/`)

| File | Purpose | Importance |
|------|---------|------------|
| `index.ts` | 6 Zustand stores: `useBrainStore` (AI state/evolution/validation), `useCortexStore` (multi-island orchestration, 12 actions), `usePortfolioStore` (balance/positions), `useTradeStore` (persistent trade history), `useMarketStore` (live tickers), `useDashboardConfigStore` (persistent UI config). | 🟡 |

---

## 🎨 Presentation Layer (`src/app/`)

| File | Purpose | Importance |
|------|---------|------------|
| `page.tsx` | Main dashboard page. Contains 9 panel components (including **CortexNeuralMapPanel** for live island visualization) + `useAnimatedValue` hook + demo data generators. ~1300 lines. Gradient card accents, stagger fade-in, animated counters. | 🟡 |
| `globals.css` | Premium design system. CSS custom properties for dark glassmorphism theme + gradient accents, stagger animations, neural map styles, island nodes, migration particles. ~1060 lines. | 🟡 |
| `layout.tsx` | Root layout. Google Fonts (Inter, JetBrains Mono), SEO metadata. | 🟢 |

---

## ⚙️ Configuration (Root)

| File | Purpose | Importance |
|------|---------|------------|
| `package.json` | Dependencies: next, react, zustand, recharts, lucide-react, uuid | 🟡 |
| `tsconfig.json` | TypeScript strict mode, path aliases (`@/`) | 🟢 |
| `next.config.ts` | Next.js configuration | 🟢 |
| `.gitignore` | Git ignore rules | 🟢 |
| `.env.local` | Environment variables (API keys, testnet toggle) — **NOT in git** | 🟡 |

---

## 🧠 Memory Layer (`memory/`)

| File | Purpose | Importance |
|------|---------|------------|
| `overview.md` | Project identity, tech stack, architecture brief, critical rules | 🔴 |
| `active_context.md` | Dynamic state tracker: phase, AI Brain status, completed/pending work | 🔴 |
| `architecture/system_design.md` | Module dependency graph, data flow, store architecture, patterns | 🟡 |
| `file_map.md` | This file — resource navigator | 🟡 |
| `adr/001-ga-over-rl.md` | ADR: Genetic Algorithm over Reinforcement Learning | 🟢 |
| `adr/002-anti-overfitting-pipeline.md` | ADR: 4-Gate Validation Pipeline for anti-overfitting | 🟢 |
| `adr/003-island-model-architecture.md` | ADR: Multi-Pair Multi-Timeframe Island Model | 🟢 |
| `adr/004-meta-evolution-ga2.md` | ADR: Meta-Evolution (GA²) — second-layer GA for per-island HyperDNA optimization | 🟢 |
| `changelog.md` | Version history | 🟢 |
| `_SYNC_CHECKLIST.md` | End-of-session verification checklist | 🟡 |
| `_FINGERPRINT.json` | Context DNA Fingerprint — SHA-256 hashes of all source + memory files, cross-reference matrix, structural integrity record | 🟡 |
| `scripts/context-fingerprint.js` | Context DNA Fingerprint CLI tool — `--generate`, `--verify`, `--report` commands for drift detection | 🟡 |

---

## 🤖 Workflows (`.agent/workflows/`)

| File | Purpose | Importance |
|------|---------|------------|
| `memory-reload.md` | `/memory-reload` — 7-step context hydration for new sessions | 🔴 |
| `memory-sync.md` | `/memory-sync` — 9-step end-of-session memory persistence | 🔴 |

---

## 🧩 Agent Skills (`.agent/skills/`)

| Skill | Files | Purpose | Importance |
|-------|-------|---------|------------|
| `learner-conventions` | `SKILL.md` | Development flags, TS patterns, Zustand conventions, memory sync protocol | 🔴 |
| `evolution-engine` | `SKILL.md`, `references/dna-schema.md` | GA operations: DNA genome, crossover, mutation, tournament selection, generation lifecycle | 🔴 |
| `risk-management` | `SKILL.md` | 8 non-negotiable safety rails, validation flow, forbidden modifications, emergency stop | 🔴 |
| `anti-overfitting-validation` | `SKILL.md` | 4-Gate validation pipeline: Walk-Forward Analysis, Monte Carlo permutation, Deflated Sharpe, regime detection, composite overfitting score | 🔴 |
| `meta-evolution` | `SKILL.md` | GA² architecture: HyperDNA genome, meta-fitness evaluation, meta-crossover, stability guard, fitness weight optimization | 🔴 |
| `dashboard-development` | `SKILL.md` | Ultra-premium UI engineering: design system reference, panel architecture, typography scale, Recharts standards, component patterns, forbidden patterns | 🔴 |
| `data-visualization` | `SKILL.md` | Financial chart engineering: chart selection guide, 5 chart patterns (equity, sparkline, radar, histogram, donut), heatmap, performance rules | 🔴 |
| `multi-island-ui` | `SKILL.md` | Cortex dashboard: Island Card component (+CSS), Grid Panel, Migration Log, Capital Allocation, Correlation Guard, Control Bar | 🔴 |
| `motion-design` | `SKILL.md` | Animation engineering: timing/easing reference, state transitions, skeletons, counter animation, stagger, ping, reduced motion | 🟡 |
| `binance-integration` | `SKILL.md`, `references/api-endpoints.md` | Binance Futures REST/WebSocket endpoints, authentication, error handling, rate limiting | 🟡 |
| `performance-analysis` | `SKILL.md`, `references/fitness-formula.md` | Composite fitness formula, individual metric calculations, normalization, ranking | 🟡 |

---

*Last Updated: 2026-03-06*
