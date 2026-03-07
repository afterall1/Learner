# File Map — Learner

> Every source file mapped to its purpose, layer, and importance level.
> **Importance**: 🔴 Critical | 🟡 Important | 🟢 Standard

---

## 📐 Type Layer (`src/types/`)

| File | Purpose | Importance |
|------|---------|------------|
| `index.ts` | Complete type system (2030+ lines). All enums (BrainState, StrategyStatus, Timeframe, MarketRegime, MicrostructureGeneType, PriceActionPatternType, CandlestickFormation, ConfluenceType, CompositeOperation, DCEventType, OrderSide, OrderType, OrderStatus, OrderLifecycleState, CircuitBreakerState, etc.), interfaces (StrategyDNA, Trade, OrderRequest, OrderResult, PositionInfo, OrderBookSnapshot, OrderGroupConfig, OrderGroup, StateTransition, ExecutionRecord, ExecutionQualityStats, AdaptiveRateStatus, validation types), and default constants. | 🔴 |
| `trading-slot.ts` | TradingSlot type — pair+timeframe identifier for the Island Model. Factory functions (`createTradingSlot`, `parseSlotId`), `TradingSlotStatus` enum, default pairs/timeframes, starter slot generator. | 🔴 |

---

## 🧬 Core Engine Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `strategy-dna.ts` | Strategy genome generator. Handles random DNA creation (with `slotId` + optional advanced genes at 40% injection rate), sexual crossover between two parent strategies (including advanced gene blending), and random mutation of individual genes (including advanced gene perturbation/injection). `calculateStructuralComplexity()` function. Core of the GA system. | 🔴 |
| `evaluator.ts` | Performance evaluation engine. Calculates Sharpe Ratio, Sortino Ratio, Profit Factor, Max Drawdown, Expectancy, and a composite fitness score (0-100) with **complexity penalty**, **deflated fitness** correction, and **structural novelty bonus** (Phase 9: +8 max points for advanced gene usage, decaying over generations). Min 30 trades for statistical significance. | 🔴 |
| `signal-engine.ts` | Signal calculation and evaluation engine. Calculates all technical indicators (RSI, EMA, SMA, MACD, Bollinger, ADX, ATR, StochRSI) and evaluates signal rules. **Phase 9**: `calculateAdvancedSignals()` integrates microstructure, price action, composite, and DC gene evaluation with aggregate bias + confidence scoring. | 🔴 |
| `evolution.ts` | Genetic algorithm controller. Manages generations, implements tournament selection (k=3), elitism (top 20%), crossover (60%), mutation (adaptive rate). **Enhanced**: adaptive mutation, diversity pressure, Strategy Memory (regime-based gene performance tracking), complexity-aware fitness. | 🔴 |
| `experience-replay.ts` | Experience pattern extraction and replay system. Stores proven indicator combos, risk profiles, signal configs. **Phase 9**: Extended with MICROSTRUCTURE_COMBO and COMPOSITE_FUNCTION pattern types for advanced gene pattern learning. | 🔴 |
| `brain.ts` | AI Brain orchestrator (single-island mode). Full lifecycle: IDLE → EXPLORING → TRADING → EVALUATING → EVOLVING. **Enhanced**: 4-Gate Validation Pipeline, 3-Stage Promotion (Paper → Candidate → Active), market regime tracking, deflated fitness. | 🔴 |

---

## 🧠 Advanced Gene Layer (`src/lib/engine/`) [Phase 9]

| File | Purpose | Importance |
|------|---------|------------|
| `microstructure-genes.ts` | Microstructure gene engine (~380 lines). Volume Profile (POC detection, bucket concentration), Volume Acceleration (spike detection), Candle Anatomy (body:wick ratios, shadow dominance), Range Expansion/Contraction (ATR sequences), Absorption Detection (whale activity). All parameters are evolvable. Includes random generator, crossover, and mutation operators. | 🔴 |
| `price-action-genes.ts` | Price action gene engine (~400 lines). 10 parameterized candlestick formations (Engulfing, Doji, Hammer, Shooting Star, Morning/Evening Star, Three Soldiers/Crows, Pinbar, Inside Bar) with EVOLVABLE thresholds. Structural Break detection (N-bar high/low), Swing Sequence (HH/HL, LH/LL), Compression/Breakout, Gap Analysis. | 🔴 |
| `composite-functions.ts` | **KEY INNOVATION**: Composite function gene engine (~310 lines). Mathematical evolution of indicator relationships via 9 operations (ADD, SUBTRACT, MULTIPLY, DIVIDE, MAX, MIN, ABS_DIFF, RATIO, NORMALIZE_DIFF) × 4 normalization methods (none, percentile, z_score, min_max). Inputs can be any indicator or raw price field. AI discovers novel composite signals. | 🔴 |
| `directional-change.ts` | **RADICAL INNOVATION**: Directional Change gene engine (~350 lines). Based on Kampouridis's event-based framework. Converts fixed-interval candles into DC events (upturn/downturn) based on evolved θ% reversal threshold. DC-derived indicators: trendRatio, avgMagnitude, oscillationCount, upturnRatio. Overshoot analysis for trend extension. | 🔴 |

---

## 🛡️ Anti-Overfitting Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `walk-forward.ts` | Walk-Forward Analysis engine. Generates rolling IS/OOS windows (70%/30%), evaluates strategy across multiple windows, calculates efficiency ratio and degradation metrics. Minimum efficiency ≥ 0.5 required. | 🔴 |
| `monte-carlo.ts` | Monte Carlo permutation testing. Fisher-Yates shuffle, 1000 permutations, 95th percentile significance threshold. Also implements López de Prado's **Deflated Sharpe Ratio** to correct for multiple testing bias. | 🔴 |
| `regime-detector.ts` | Market regime classifier. Uses ADX, ATR, and SMA indicators to classify into 5 regimes: TRENDING_UP, TRENDING_DOWN, RANGING, HIGH_VOLATILITY, LOW_VOLATILITY. Calculates regime diversity (min 2 required). Exports `calculateADX()` and `calculateATR()` for MRTI. | 🔴 |
| `regime-intelligence.ts` | **Phase 11 — MRTI Predictive Engine** (~530 lines). `TransitionMatrix` (5×5 Markov chain, Laplace smoothing), `EarlyWarningDetector` (4 signals: ADX slope, ATR acceleration, duration exhaustion, confidence decay), `RegimeIntelligence` orchestrator (HOLD/PREPARE/SWITCH). Auto-calibrates from 200+ candles. Integrated into Island, Roster, Cortex. | 🔴 |
| `overfitting-detector.ts` | Composite overfitting risk scorer (0-100). Aggregates WFA (30%), Monte Carlo (25%), Complexity (15%), Regime Diversity (15%), Return Consistency (15%). Score < 40 required to pass. | 🔴 |

---

## 🏝️ Island Model Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `island.ts` | Self-contained evolution unit scoped to one TradingSlot (pair+timeframe). Contains its own EvolutionEngine, trade history, validation pipeline, market data, Migration API (export/import), capital tracking, **HyperDNA** (GA²), and **MRTI** (Phase 11: auto-calibration, handleRegimeForecast, proactive switching). | 🔴 |
| `cortex.ts` | Multi-island orchestrator. Manages island lifecycle, routes trades, triggers migration, rebalances capital, monitors correlation, orchestrates **Meta-Evolution cycles** (GA²), and **MRTI global risk** (Phase 11: evaluateGlobalRegimeRisk, adjustAllocationsForRegimeForecast, macro consensus). | 🔴 |
| `meta-evolution.ts` | Meta-Evolution Engine (GA²). HyperDNA genome generation/crossover/mutation, 4-component meta-fitness evaluation, stability guard, HyperDNA→EvolutionConfig bridge. | 🔴 |
| `migration.ts` | Cross-island knowledge transfer. 3 topologies: Neighborhood (affinity-based), Ring (sequential), Star (best broadcasts). Affinity scoring: same pair/different TF = 0.8, same TF/different pair = 0.5. Adapter re-scopes strategies and resets fitness. | 🟡 |
| `capital-allocator.ts` | Dynamic capital distribution. 3-factor weighting: lifetime fitness (60%), recent trend (30%), diversity contribution (10%). Per-island floor (5%) and cap (30%). Periodic rebalancing. | 🟡 |
| `paper-trade-executor.ts` | Paper trade execution and management. Simulates trade entries/exits without real capital exposure. | 🟡 |

---

## 🧠 Strategic Overmind Layer (`src/lib/engine/overmind/`) [Phase 15]

| File | Purpose | Importance |
|------|---------|------------|
| `strategic-overmind.ts` | **Core Orchestrator** (~805 lines). 6-phase reasoning cycle (OBSERVE→ANALYZE→HYPOTHESIZE→DIRECT→VERIFY→LEARN). Supervises GA, Meta-Evolution, and MRTI. Coordinates all Overmind sub-engines. | 🔴 |
| `opus-client.ts` | **Opus 4.6 API Client** (~314 lines). Singleton Anthropic API wrapper. Adaptive thinking, token budget management, graceful degradation (system runs without Opus). | 🔴 |
| `prompt-engine.ts` | LLM prompt construction engine. Builds structured prompts for all Overmind reasoning phases. Context-aware prompt assembly. | 🔴 |
| `response-parser.ts` | 4-tier JSON extraction from LLM responses. Handles structured/unstructured output, markdown artifacts, and fallback parsing. | 🟡 |
| `hypothesis-engine.ts` | Market hypothesis generation (~339 lines). Opus-driven market hypothesis creation, tracking, and retirement. Generates testable market theories. | 🔴 |
| `evolution-director.ts` | GA directive generation (~274 lines). Opus analyzes generation results, proposes mutations, crossovers, gene proposals. Guides GA direction. | 🔴 |
| `adversarial-tester.ts` | ACE strategy stress testing (~377 lines). Opus generates adversarial scenarios. Evaluates strategy resilience. Produces stress reports. | 🔴 |
| `pair-specialist.ts` | Pair-specific profiling. Builds behavioral profiles per trading pair. Customizes evolution parameters per pair. | 🟡 |
| `emergent-indicator.ts` | Novel indicator discovery. Opus proposes new composite indicator formulas. Evaluates indicator originality vs existing library. | 🟡 |
| `strategy-decomposer.ts` | RSRD synthesis. Decomposes winning strategies into reusable components. Identifies transferable patterns. | 🟡 |
| `episodic-memory.ts` | CCR episode storage. Records key decision moments with full context snapshots. Enables later counterfactual analysis. | 🔴 |
| `counterfactual-engine.ts` | CCR "what-if" analysis. Generates alternative scenarios from past episodes. Extracts causal insights. | 🔴 |
| `meta-cognition.ts` | CCR self-reflection loop. Reviews Overmind’s own decisions. Updates beliefs and biases. Feeds into reasoning journal. | 🟡 |
| `predictive-orchestrator.ts` | **PSPP bridge** (MRTI → Overmind). Evaluates regime forecasts, determines pre-positioning actions (HOLD/PREPARE/SWITCH). Dual primary skill: `regime-intelligence` + `strategic-overmind`. | 🔴 |
| `reasoning-journal.ts` | Decision reasoning log. Stores Overmind’s reasoning chain per cycle. Auditable decision trail. | 🟡 |

## 🔬 Backtesting Engine Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `backtester.ts` | **Phase 10 — Core backtesting engine**. Multi-candle simulation loop: iterates historical OHLCV, evaluates signals, manages positions, checks SL/TP hits, tracks equity curve, tags trades with market regime. **PFLM Innovation**: `IndicatorCache` class pre-computes all indicator values once and shares across population. `runBacktest()`, `batchBacktest()` (shared cache), `quickFitness()` (lean mode). ~570 lines. | 🔴 |
| `market-simulator.ts` | **Phase 10 — Realistic execution modeling**. ATR-adaptive slippage, Binance taker commission (0.04%), Almgren-Chriss square-root market impact model, intra-candle SL/TP detection (conservative: SL wins ties), direction-aware fill simulation, position quantity calculation, SL/TP level computation. ~280 lines. | 🔴 |
| `trade-forensics.ts` | **Phase 12 — Trade Forensics Engine** (~620 lines). 3-layer: `TradeBlackBox` (flight recorder, 8 event types, MFE/MAE/near-miss), `ForensicAnalyzer` (3 efficiency scores, 4-factor Bayesian causal attribution, 8 lesson types), `TradeForensicsEngine` (lifecycle orchestrator, query API, stats). Integrated into Island. | 🔴 |
| `forensic-learning.ts` | **Phase 12.1 — Forensic Learning Engine** (~310 lines). CLOSES the feedback loop: aggregates TradeLesson objects into Bayesian beliefs per regime×lesson_type, calculates fitness modifiers (±10 points) for Evolution Engine, DNA similarity matching, exponential generational decay. Integrated into evaluator + Island. | 🔴 |
| `persistence-bridge.ts` | **Phase 13.1→14 — Persistence Bridge** (~320 lines). Dual-write singleton: wires engine lifecycle events (trade close, forensic report, generation evolved, portfolio update) to BOTH IndexedDB and Supabase. Lazy auto-init (no manual `initialize()` needed), cloud-first checkpoint loading, SSR-safe, race-condition-safe singleton init promise. | 🔴 |

---

## 📡 Binance Execution Layer (`src/lib/api/`) [Phase 19 + 19.1]

| File | Purpose | Importance |
|------|---------|------------|
| `binance-rest.ts` | **Binance Futures REST Client** (~839 lines). HMAC-SHA256 signed requests, configurable testnet/mainnet, **AdaptiveRateGovernor** (Phase 19.1: reads `X-MBX-USED-WEIGHT-1m` + `X-MBX-ORDER-COUNT-1m` headers, adjusts concurrency 1-10, emergency pause at >92%). 7 order methods: `placeOrder` (NEVER retried), `cancelOrder`, `cancelAllOrders`, `getOpenOrders`, `getPositionRisk`, `getOrderBook`, `setMarginType`. Market data: `getKlines`, `get24hrTicker`, `getLatestPrice`, `getExchangeInfo`. | 🔴 |
| `binance-ws.ts` | Binance WebSocket client for market data streams (klines, tickers). Handles reconnection and subscription management. | 🟡 |
| `market-data-service.ts` | Market data aggregation service. Coordinates REST + WebSocket data sources. | 🟡 |
| `exchange-circuit-breaker.ts` | **Phase 19 — Exchange Circuit Breaker** (~360 lines). 3-state machine (CLOSED→OPEN→HALF_OPEN) wrapping all Binance API calls. Configurable failure thresholds, cooldown period, automatic recovery. + `ExchangeInfoCache`: auto-refreshing cache of trading symbol filters (tickSize, stepSize, minNotional), validates and adjusts order precision. | 🔴 |
| `user-data-stream.ts` | **Phase 19 — User Data WebSocket** (~476 lines). Manages `listenKey` lifecycle (create/keepAlive/delete), WebSocket connection with exponential backoff reconnect, parses 3 event types: ACCOUNT_UPDATE (balance/position changes), ORDER_TRADE_UPDATE (fill confirmations), MARGIN_CALL (liquidation warnings). Callback pattern for event handling. | 🔴 |
| `account-sync.ts` | **Phase 19 — Account Sync Service** (~212 lines). 30-second periodic polling of account balances and positions. Circuit breaker integration, position change detection via SHA-256 hash comparison, graceful degradation (retains last known state on error). | 🟡 |
| `order-lifecycle.ts` | **Phase 19.1 — Atomic Order Lifecycle Engine (AOLE)** (~370 lines). 13-state machine (PENDING→SETTING_LEVERAGE→PLACING_ENTRY→ENTRY_FILLED→PLACING_SL→SL_PLACED→PLACING_TP→FULLY_ARMED). **Core Invariant**: position NEVER exists without stop-loss protection. SL has 3 retries with exponential backoff; if all fail → EMERGENCY_CLOSE (market-close position). Partial fill handling, execution quality recording per order, configurable callbacks for state changes. | 🔴 |
| `execution-quality.ts` | **Phase 19.1 — Execution Quality Tracker** (~190 lines). Per-symbol rolling window (100 orders, 24h). Tracks slippage (bps), latency (ms), fill ratio per execution. Provides: `getStats()` (avg/P95), `getCalibratedSlippage()` (feeds into market-simulator.ts to replace hardcoded slippage). Integrates with Trade Forensics for execution attribution. | 🔴 |

---

## 🛡️ Risk Layer (`src/lib/risk/`)

| File | Purpose | Importance |
|------|---------|------------|
| `manager.ts` | Risk management engine with 8 hardcoded safety rails. Validates every trade against position size, leverage, drawdown limits, and mandatory stop-loss rules. These rules are **non-overridable** and operate **GLOBALLY across all islands**. | 🔴 |

---

## 📦 State & Persistence Layer (`src/lib/store/` + `src/lib/db/`)

| File | Purpose | Importance |
|------|---------|------------|
| `store/index.ts` | 6 Zustand stores: `useBrainStore` (AI state/evolution/validation), `useCortexStore` (multi-island orchestration, 12 actions), `usePortfolioStore` (balance/positions, IndexedDB persist), `useTradeStore` (persistent trade history, IndexedDB dual-write), `useMarketStore` (live tickers), `useDashboardConfigStore` (persistent UI config). | 🟡 |
| `store/persistence.ts` | **Phase 13 — IndexedDB Persistence Layer** (~480 lines). 6 object stores (trades, strategies, evolution_snapshots, forensic_reports, portfolio_snapshots, engine_state), `createIndexedDBStorage()` Zustand adapter, `startAutoCheckpoint()` scheduler, full CRUD for all data types, `getStorageStats()`, `clearAllData()`. | 🔴 |
| `db/supabase.ts` | **Phase 14 — Supabase Cloud Database Client** (~340 lines). PostgreSQL cloud client with graceful degradation (returns null if env vars missing). Full CRUD: `cloudSaveTrade()`, `cloudSaveStrategies()`, `cloudSaveEvolutionSnapshot()`, `cloudSaveForensicReport()`, `cloudSavePortfolioSnapshot()`, `cloudSaveEngineCheckpoint()`, `cloudLoadEngineCheckpoint()`, `cloudGetStats()`. JSONB data pattern for full object storage. | 🔴 |

---

## 🎨 Presentation Layer (`src/app/`)

| File | Purpose | Importance |
|------|---------|------------|
| `page.tsx` | Main dashboard page. Contains 9 panel components (including **CortexNeuralMapPanel** for live island visualization) + `useAnimatedValue` hook + demo data generators. ~1300 lines. Gradient card accents, stagger fade-in, animated counters. | 🟡 |
| `brain/page.tsx` | **Phase 18 — Neural Brain Visualization** (~675 lines). Holographic JARVIS-style 3D cortex: 10 neuron nodes (hex wireframe inner + circle wireframe outer), 15 synapses with animated signal propagation, CSS 3D perspective, scanline overlay, hex grid background, HUD system (Stats bar + Target Lock + Consciousness Arc), floating data particles, Multi-Color Memory Trace Heatmap (10 HSLA hues per row), biological refractory period (800ms cooldown). | 🟡 |
| `pipeline/page.tsx` | **Pipeline Dashboard**. 8 panels: Pipeline Flow (7-stage animated), Generation Fitness (area chart), 4-Gate Validation (animated gates), Strategy Roster (radar), Experience Replay (heatmap), **Gene Lineage Tree** (family tree), **Gene Survival Heatmap** (persistence grid), **Decision Explainer** (regime change reasoning). Live state machine + demo data. ~1400 lines. | 🟡 |
| `globals.css` | Premium design system. CSS custom properties for dark glassmorphism theme + gradient accents, stagger animations, neural map styles, pipeline stages, archaeology panels, **holographic brain theme** (3D canvas, scanlines, hex grid, neuron wireframes, synapse animations, HUD, consciousness arc, heatmap multi-color). ~2580 lines. | 🟡 |
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
| `adr/005-strategy-archaeology.md` | ADR: Strategy Archaeology — Explainable AI for genetic strategy evolution (Gene Lineage + Gene Survival + Decision Explainer) | 🟢 |
| `adr/006-advanced-genome.md` | ADR: Advanced Strategy Genome Architecture — 5 evolvable gene families, composite function evolution, directional change framework, structural novelty bonus | 🟢 |
| `adr/009-neural-brain-visualization.md` | ADR: Neural Brain Visualization Architecture — Holographic 3D cortex, biological refractory period, multi-color HSLA heatmap | 🟢 |
| `adr/010-atomic-order-lifecycle.md` | ADR: Atomic Order Lifecycle Engine — 13-state machine, mandatory SL invariant, Adaptive Rate Governor, Execution Quality Tracker | 🟢 |
| `changelog.md` | Version history | 🟢 |
| `_SYNC_CHECKLIST.md` | End-of-session verification checklist | 🟡 |
| `_FINGERPRINT.json` | Context DNA Fingerprint — SHA-256 hashes of all source + memory files, cross-reference matrix, structural integrity record | 🟡 |
| `scripts/context-fingerprint.js` | Context DNA Fingerprint CLI tool — `--generate`, `--verify`, `--report` commands for drift detection | 🟡 |

---

## 🛠️ Scripts (`scripts/`)

| File | Purpose | Importance |
|------|---------|------------|
| `validate-skills.js` | **Skill Integrity Validator** (~252 lines). Detects orphaned source files, stale skill references, and missing/one-way cross-links. Self-auditing knowledge graph. | 🔴 |
| `generate-skill-map.js` | **Skill Auto-Activation Intelligence** (~330 lines). Static import analysis builds `skill-map.json` (file→skill index) + `skill-graph.md` (Mermaid DAG). Transforms passive skills into active intelligence. | 🔴 |
| `git-guardian.js` | **Git Guardian Pre-Commit Hook** (~210 lines). 3-gate validation: secret pattern detection (100+ regex), file size limit (500KB), JSON syntax validation. Blocks commits containing API keys or large files. | 🔴 |
| `commit-msg-validator.js` | **Commit Message Convention** (~110 lines). Enforces `type(scope): description` format. Validates type (feat, fix, docs, etc.) and min description length. | 🟡 |
| `install-hooks.js` | **Git Hook Auto-Installer** (~130 lines). Cross-platform `pre-commit` + `commit-msg` hook installation. Creates executable scripts in `.git/hooks/`. | 🟡 |
| `memory-health.js` | **Memory Health Dashboard**. Diagnostic tool showing memory freshness, file map coverage, ADR gaps, skill health. | 🟡 |

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
| `regime-intelligence` | `SKILL.md` | MRTI predictive engine: Markov chain, early-warning signals, PSPP bridge, pre-warming lifecycle | 🔴 |
| `strategic-overmind` | `SKILL.md` | Strategic Overmind: 6-phase cycle, CCR, PSPP, OpusClient, 15 sub-engines, adversarial testing | 🔴 |
| `hybrid-persistence` | `SKILL.md` | Hybrid dual-write persistence: PersistenceBridge, IndexedDB, Supabase, cloud-first hydration | 🔴 |
| `trade-forensics` | `SKILL.md` | Trade Forensics: TradeBlackBox, ForensicAnalyzer, Bayesian learning, fitness modifier feedback | 🔴 |

---

## 🧩 Auto-Generated Files (`.agent/`)

| File | Purpose | Importance |
|------|---------|------------|
| `skill-map.json` | Machine-readable file→skill index (auto-generated by `generate-skill-map.js`). 55 file mappings with primary/secondary/conventions priorities. | 🔴 |
| `skill-graph.md` | Mermaid DAG of skill dependencies (auto-generated). 16 nodes, 76 edges, 5 color-coded layers. | 🟡 |

---

*Last Updated: 2026-03-07 04:55 (UTC+3)*
