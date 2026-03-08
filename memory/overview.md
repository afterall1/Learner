# Learner — Self-Evolving AI Algorithmic Trading System

## 🎯 Project Identity
**Name**: Learner
**Type**: Self-evolving AI-powered algorithmic trading system
**Target**: Binance Futures (USDT-M perpetual contracts)
**Status**: Active Development — Phase 27 (E2E Integration Testing + Market Scenario Stress Matrix)
**Created**: 2026-03-05

---

## 🏗️ Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------||
| **Framework** | Next.js 15 (App Router) | SSR, routing, build system |
| **Language** | TypeScript (Strict) | Type safety across all modules |
| **State** | Zustand (6 stores) | Real-time reactive state |
| **Local DB** | IndexedDB (`idb`) | Local cache + offline fallback |
| **Cloud DB** | Supabase (PostgreSQL) | PC-independent durable storage |
| **Charts** | Recharts | Performance & evolution visualization |
| **Icons** | Lucide React | Premium icon system |
| **IDs** | UUID v4 | Strategy & trade identification |
| **Styling** | Vanilla CSS (Glassmorphism) | Premium dark theme design system |

---

## 🧠 Core Architecture

The system is built on a **Genetic Algorithm** paradigm (not Reinforcement Learning). Strategies are represented as **Strategy DNA genomes** that evolve through generations via crossover, mutation, and tournament selection.

### Key Architectural Features
- **Island Model GA**: Each pair+timeframe combination has its own isolated evolution engine
- **Meta-Evolution (GA²)**: Second-layer genetic algorithm that optimizes evolution parameters (HyperDNA) per-island
- **Advanced Strategy Genome (Phase 9)**: 5 evolvable gene families: Microstructure, Price Action, Composite Functions, Multi-TF Confluence, Directional Changes
- **Composite Function Evolution**: Mathematical composition of indicators — AI discovers novel relationships like `ABS_DIFF(RSI, EMA_slope)`
- **Directional Change (DC)**: Event-based price analysis with evolved θ reversal threshold (Kampouridis framework)
- **4-Gate Validation Pipeline**: Walk-Forward Analysis → Monte Carlo → Overfitting Detection → Regime Diversity
- **Structural Novelty Bonus**: Fitness bonus for strategies using advanced gene families (decays over generations)
- **3-Stage Promotion**: Paper Trading → Candidate → Active
- **Market Regime Detection**: 5 regimes (Trending Up/Down, Ranging, High/Low Volatility)
- **Cross-Island Migration**: Top strategies shared between related islands
- **Pipeline Dashboard**: Dedicated `/pipeline` page with 8 panels visualizing the full evolution lifecycle
- **Strategy Archaeology**: Gene Lineage Tree + Gene Survival Heatmap + Decision Explainer (Explainable AI)
- **Trade Forensics Engine (Phase 12)**: TradeBlackBox flight recorder + ForensicAnalyzer + Bayesian causal attribution
- **Forensic Learning Engine (Phase 12.1)**: Closed-loop lesson aggregation → fitness modifier
- **IndexedDB Persistence (Phase 13)**: 6 object stores, Zustand adapter, auto-checkpoint
- **PersistenceBridge (Phase 13.1)**: Wires engine events to IndexedDB + Supabase (lazy auto-init)
- **Supabase Cloud DB (Phase 14)**: PostgreSQL cloud, 6 tables, hybrid dual-write architecture
- **Strategic Overmind (Phase 15)**: Opus 4.6 AI supervisor — 6-phase reasoning cycle (OBSERVE→ANALYZE→HYPOTHESIZE→DIRECT→VERIFY→LEARN), 15 modules
- **PSPP (Phase 15.1)**: Predictive Strategic Pre-Positioning — MRTI forecasts → proactive strategy pre-warming
- **CCR (Phase 15.2)**: Counterfactual Causal Replay — episodic memory + "what-if" analysis + meta-cognition
- **Agent Skills (Phase 16)**: 16 domain-specific skills covering all system modules
- **Skill Auto-Activation Intelligence (Phase 17)**: Static import analysis → machine-readable file→skill mapping + Mermaid DAG
- **Neural Brain Visualization (Phase 18)**: Holographic JARVIS-style 3D cortex — 10 SVG wireframe neurons, 15 animated synapses, CSS 3D perspective, HUD system (Stats bar + Target Lock + Consciousness Arc), multi-color Memory Trace Heatmap (10 HSLA hues), biological refractory period (800ms cooldown)
- **Binance Trading Execution Layer (Phase 19)**: 7 REST methods (placeOrder, cancelOrder, getPositionRisk, etc.), 4 API routes, User Data WebSocket (ACCOUNT_UPDATE, ORDER_TRADE_UPDATE, MARGIN_CALL), Account Sync Service (30s polling), 3-state Exchange Circuit Breaker + ExchangeInfoCache
- **Atomic Order Lifecycle Engine (Phase 19.1, Radical Innovation)**: 13-state machine (Entry→SL→TP atomic, EMERGENCY_CLOSE if SL fails), Adaptive Rate Governor (dynamic concurrency 1-10 from X-MBX-USED-WEIGHT headers), Execution Quality Tracker (per-symbol rolling slippage/latency stats)
- **CortexLiveEngine (Phase 20)**: Central live market orchestrator — historical seed (500 candles), kline+ticker WebSocket, candle aggregation, EvolutionScheduler (autonomous gen triggers)
- **ADFI (Phase 20)**: Adaptive Data Flow Intelligence — gap detection, auto-repair, flow telemetry (throughput, latency, reconnects, uptime)
- **CIRPN (Phase 20)**: Cross-Island Regime Propagation Network — pair correlation tracking, leader/follower detection, regime arrival prediction
- **Pipeline Live Integration (Phase 21)**: `usePipelineLiveData` hook (dual-mode LIVE/DEMO, island selector, 3s polling), data bridge for 5 pipeline panels
- **LivePulseTelemetryPanel (Phase 21, Radical Innovation)**: Real-time ADFI health + CIRPN propagation status visualization
- **EvolutionHealthAnalyzer (Phase 21, Radical Innovation)**: Exposes HIDDEN evolutionary intelligence — diversity, stagnation, convergence risk, fitness trajectory, gene dominance, auto-intervention detection, A-F health grading
- **EvolutionHeartbeatPanel (Phase 21, Radical Innovation)**: Animated convergence detector with gene dominance chart + autopilot intervention log
- **Risk Manager Global Enforcement (Phase 22)**: RiskManager singleton wired into Cortex, `getRiskSnapshot()` accessor, `RiskSnapshot` type, 5-layer integration (Engine → Type → Cortex → Hook → Panel)
- **Risk Fortress Visualization (Phase 22, Radical Innovation)**: Global Risk Score ring (SVG 0-100), 8-rail animated status matrix, Daily PnL, risk event log, pulse-glow on high utilization
- **Vitest Test Infrastructure (Phase 22)**: 3 test suites (45 tests), Safety Rail Mutation Boundary Tests (probe exact threshold edges of all 8 rails)
- **Test Coverage Expansion (Phase 25)**: 6 new test suites (106 tests), total 178/178 passing. Property-Based Fuzzing Harness (7-category metamorphic testing: GA Operator Invariants, Signal Engine Monotonicity, Evaluator Consistency, WFA Symmetry, Overfitting Monotonicity, Migration Affinity Algebra) + Chaos Monkey Stress Tester (zero-price/negative-volume/flash-crash resilience)
- **Live Paper Trading Execution (Phase 26)**: LiveTradeExecutor signal→order pipeline, risk validation, position sizing, SL/TP, /api/trading/status telemetry endpoint, auto-trade toggle
- **E2E Integration Testing (Phase 27)**: 33-test integration suite covering full backtest pipeline, batch PFLM, evolution cycle, market scenarios, HTF aggregation, fitness convergence, edge cases. Total: 211/211 tests, 12 files.
- **Market Scenario Stress Matrix (Phase 27, MSSM Radical Innovation)**: 5-regime cross-scenario backtesting with Regime Resilience Score (RRS). Unique `regime_transition` scenario (bull→sideways→crash). `runStressMatrix()` + `batchStressMatrix()` for population-level analysis.

### Module Map

```
src/
├── types/
│   ├── index.ts              → 2030+ line type system (DNA, Trade, Evolution, Risk, Island, HyperDNA, Advanced Genes, Order Execution, AOLE)
│   └── trading-slot.ts       → TradingSlot pair+timeframe identifier system
├── lib/engine/
│   ├── strategy-dna.ts       → Genome generation, crossover, mutation + advanced gene operators
│   ├── evaluator.ts          → Composite fitness + complexity penalty + deflated fitness + novelty bonus
│   ├── signal-engine.ts      → Indicator calculation + advanced gene signal integration
│   ├── evolution.ts          → GA: adaptive mutation, diversity pressure, Strategy Memory
│   ├── experience-replay.ts  → Pattern extraction including advanced gene patterns
│   ├── brain.ts              → AI Brain (single-island, 4-Gate validation, 3-stage promotion)
│   ├── island.ts             → Island: self-contained evolution unit + HyperDNA (GA²)
│   ├── cortex.ts             → Cortex: multi-island orchestrator + Meta-Evolution cycles
│   ├── meta-evolution.ts     → Meta-Evolution Engine (GA²): HyperDNA genome, meta-fitness, stability
│   ├── migration.ts          → Cross-island knowledge transfer (3 topologies)
│   ├── capital-allocator.ts  → Dynamic performance-weighted capital distribution
│   ├── trade-forensics.ts    → [Phase 12] TradeBlackBox + ForensicAnalyzer (971 lines)
│   ├── forensic-learning.ts  → [Phase 12.1] Bayesian beliefs + fitness modifiers
│   ├── regime-intelligence.ts → [Phase 11] MRTI predictive engine (740 lines)
│   ├── persistence-bridge.ts → [Phase 13] Dual-write bridge (IndexedDB + Supabase)
│   ├── overmind/             → [Phase 15] Strategic Overmind (16 files)
│   │   ├── strategic-overmind.ts → 6-phase cycle orchestrator (805 lines)
│   │   ├── opus-client.ts    → Opus 4.6 API client (singleton)
│   │   ├── prompt-engine.ts  → LLM prompt construction
│   │   ├── response-parser.ts → 4-tier JSON extraction
│   │   ├── hypothesis-engine.ts → Market hypothesis generation
│   │   ├── evolution-director.ts → GA directives
│   │   ├── adversarial-tester.ts → ACE strategy stress testing
│   │   ├── pair-specialist.ts → Pair-specific profiling
│   │   ├── emergent-indicator.ts → Novel indicator discovery
│   │   ├── strategy-decomposer.ts → RSRD synthesis
│   │   ├── episodic-memory.ts → CCR episode storage
│   │   ├── counterfactual-engine.ts → CCR "what if" analysis
│   │   ├── meta-cognition.ts → CCR self-reflection
│   │   ├── predictive-orchestrator.ts → PSPP bridge (MRTI → Overmind)
│   │   ├── reasoning-journal.ts → Decision reasoning log
│   │   └── directive-applicator.ts → [Phase 24] Overmind directive→action bridge (352 lines)
│   ├── microstructure-genes.ts → [Phase 9] Volume Profile, Acceleration, Candle Anatomy
│   ├── price-action-genes.ts  → [Phase 9] 10 candlestick formations, structural breaks
│   ├── composite-functions.ts → [Phase 9] Mathematical indicator evolution (9 ops × 4 norms)
│   ├── directional-change.ts  → [Phase 9] Event-based DC analysis (Kampouridis)
│   ├── orderflow-genes.ts     → [Phase 9.5] Order Flow Intelligence — CVD, large trades, liquidations (526 lines)
│   ├── confluence-genes.ts    → Multi-TF confluence gene system (907 lines)
│   ├── confluence-acsi.ts     → ACSI confluence: adaptive composite signal integration (296 lines)
│   ├── confluence-tcdw.ts     → TCDW confluence: time-correlated delta weighting (235 lines)
│   ├── quality-diversity.ts   → [Phase 18] MAP-Elites behavioral grid 5×3 (437 lines)
│   ├── coevolution.ts         → [Phase 18.1] Parasite-Host arms race GA (612 lines)
│   ├── genome-topology.ts     → [Phase 18.2] NEAT structural evolution (593 lines)
│   ├── surrogate-illumination.ts → [Phase 18.3] SAIE: surrogate-assisted MAP-Elites (795 lines)
│   ├── bayesian-signal-calibrator.ts → [Phase 19A] Beta-Bernoulli signal reliability (441 lines)
│   ├── market-intelligence.ts → [Phase 19B] Market Intelligence Cortex — F&G, funding, vol (397 lines)
│   ├── metacognitive-monitor.ts → [Phase 19C] Self-awareness: Brier Score, belief drift, epistemic (460 lines)
│   ├── knowledge-directed-synthesis.ts → [Phase 20] KDSS: Lamarckian strategy construction (686 lines)
│   ├── strategy-roster.ts     → Strategy roster management (510 lines)
│   ├── neural-impulse-bus.ts  → [Phase 22] NIEB: engine→brain neuron impulse bus (250 lines)
│   ├── backtester.ts         → [Phase 10] Core backtest engine + IndicatorCache (PFLM)
│   ├── market-simulator.ts   → [Phase 10] Realistic execution (slippage, commission, impact)
│   ├── cortex-live-engine.ts → [Phase 20] Live market ↔ Cortex orchestrator (490 lines)
│   ├── evolution-scheduler.ts → [Phase 20] Autonomous evolution trigger (200 lines)
│   ├── adaptive-data-flow.ts → [Phase 20] ADFI gap detection + telemetry (420 lines)
│   ├── regime-propagation.ts → [Phase 20] CIRPN cross-island regime propagation (380 lines)
│   ├── evolution-health.ts   → [Phase 21] Evolution Health Analyzer — convergence detector (300 lines)
│   └── stress-matrix.ts     → [Phase 27] MSSM: 5-regime stress testing + RRS scoring (390 lines)
├── lib/api/
│   ├── binance-rest.ts       → [Phase 6→19] Binance Futures REST client (839 lines, AdaptiveRateGovernor)
│   ├── binance-ws.ts         → [Phase 6] Binance WebSocket market data streams
│   ├── market-data-service.ts → [Phase 6] Market data aggregation service
│   ├── exchange-circuit-breaker.ts → [Phase 19] 3-state circuit breaker + ExchangeInfoCache (360 lines)
│   ├── user-data-stream.ts   → [Phase 19] User Data WebSocket (476 lines, ACCOUNT/ORDER/MARGIN events)
│   ├── account-sync.ts       → [Phase 19] Periodic balance polling (212 lines)
│   ├── order-lifecycle.ts    → [Phase 19.1] AOLE state machine (370 lines, EMERGENCY_CLOSE)
│   ├── execution-quality.ts  → [Phase 19.1] Rolling slippage/latency tracker (190 lines)
│   └── live-trade-executor.ts → [Phase 26] Signal→order pipeline (330 lines, risk validation, SL/TP)
├── lib/risk/
│   └── manager.ts            → 8 hardcoded, non-negotiable risk safety rails
├── lib/store/
│   ├── index.ts              → 6 Zustand stores (Brain, Cortex, Portfolio, Trade, Market, Config)
│   └── persistence.ts        → [Phase 13] IndexedDB provider (584 lines)
├── lib/db/
│   └── supabase.ts           → [Phase 14] Supabase cloud provider (381 lines)
└── app/
    ├── layout.tsx             → Root layout with Inter + JetBrains Mono fonts
    ├── globals.css            → Premium dark glassmorphism + holographic design system (2580+ lines)
    ├── page.tsx               → Main dashboard: 9 panels + Cortex Neural Map (1300+ lines)
    ├── brain/
    │   └── page.tsx           → [Phase 18] Holographic Neural Cortex visualization (675 lines)
    └── pipeline/
        └── page.tsx           → Pipeline + Archaeology + Overmind + LivePulse + Heartbeat + RiskShield (~3730 lines)
├── lib/hooks/
│   └── usePipelineLiveData.ts → [Phase 21] Data bridge hook (~580 lines, dual-mode, risk derivation)
├── __tests__/              → [Phase 22+25] Vitest test files (178 tests, 10 files)
│   ├── risk/__tests__/manager.test.ts       → RiskManager 8 rails + mutation boundary (37 tests)
│   ├── engine/__tests__/cortex-risk.test.ts → Cortex risk integration (3 tests)
│   ├── hooks/__tests__/risk-derivation.test.ts → Risk derivation (5 tests)
│   ├── engine/__tests__/validation-pipeline.test.ts → [Phase 25] WFA + Monte Carlo + Overfitting (26 tests)
│   ├── engine/__tests__/migration-engine.test.ts → [Phase 25] Migration affinity + adaptMigrant (10 tests)
│   ├── engine/__tests__/advanced-genes.test.ts → [Phase 25] Microstructure + Price Action (16 tests)
│   ├── engine/__tests__/evaluator.test.ts → [Phase 25] Performance metrics + fitness (10 tests)
│   ├── engine/__tests__/signal-engine.test.ts → [Phase 25] Indicators + rules + pipeline (14 tests)
│   ├── engine/__tests__/confluence-genes.test.ts → [Phase 25] Confluence genes (24 tests)
│   └── engine/__tests__/property-fuzzer.test.ts → [Phase 25] Property-Based Fuzzing + Chaos Monkey (30 tests)
```

### Scripts
```
scripts/
├── validate-skills.js         → Skill Integrity Validator (detects orphans, stale refs, missing links)
├── generate-skill-map.js      → Auto-Activation Intelligence (static import analysis → skill-map.json)
├── git-guardian.js            → 3-gate pre-commit hook (secret detection, file size, JSON validation)
├── commit-msg-validator.js    → Convention enforcement for commit messages
├── install-hooks.js           → Cross-platform Git hook auto-installer
└── memory-health.js           → Memory Health Dashboard (freshness, coverage, ADR gaps)
```

### Test Infrastructure
```
vitest.config.ts               → Vitest configuration (vite-tsconfig-paths, @/ alias)
src/lib/risk/__tests__/manager.test.ts             → 37 tests (8 rails + mutation boundaries)
src/lib/engine/__tests__/cortex-risk.test.ts       → 3 tests (Cortex integration)
src/lib/hooks/__tests__/risk-derivation.test.ts    → 5 tests (derivation)
src/lib/engine/__tests__/validation-pipeline.test.ts → 26 tests (WFA + Monte Carlo + Overfitting Detector)
src/lib/engine/__tests__/migration-engine.test.ts  → 10 tests (migration affinity + adaptMigrant)
src/lib/engine/__tests__/advanced-genes.test.ts    → 16 tests (microstructure + price action genes)
src/lib/engine/__tests__/evaluator.test.ts         → 10 tests (performance metrics + fitness scoring)
src/lib/engine/__tests__/signal-engine.test.ts     → 14 tests (indicators + rules + pipeline)
src/lib/engine/__tests__/confluence-genes.test.ts  → 24 tests (confluence gene operations)
src/lib/engine/__tests__/property-fuzzer.test.ts   → 30 tests (7-category metamorphic fuzzing + Chaos Monkey)
─────────────────────────────────────────────────────  TOTAL: 178 tests (10 files)
```

### API Routes
```
src/app/api/binance/
├── klines/route.ts            → GET historical klines data
├── ticker/route.ts            → GET 24hr ticker
├── exchange-info/route.ts     → GET exchange symbol info
├── order/route.ts             → POST (place) + DELETE (cancel) orders [Phase 19]
├── position/route.ts          → GET position risk [Phase 19]
├── account/route.ts           → GET account balances [Phase 19]
└── depth/route.ts             → GET order book depth [Phase 19]
```

---

## 🛡️ Critical Rules (Non-Negotiable)

1. **Risk Rails are HARDCODED** — No strategy, AI, or configuration can override them:
   - Max 2% risk per trade
   - Max 3 simultaneous positions (GLOBAL across all islands)
   - Max 5% daily drawdown
   - Max 15% total drawdown
   - Mandatory stop-loss on every trade
   - Max 10x leverage

2. **Paper Trading First** — Every strategy must complete 30+ trades + pass 4-Gate Validation before promotion

3. **Testnet Default** — System defaults to Binance Testnet. Live trading requires explicit opt-in

4. **No Initial Strategy** — The AI discovers strategies from scratch through genetic evolution

5. **Risk is GLOBAL** — The 3-position limit and drawdown limits apply across ALL islands simultaneously

---

## 📊 Dashboard Architecture (3 Pages, 18 Panels)

### Main Dashboard (`/`) — 9 Panels
1. Portfolio Overview — Balance, P&L metrics, animated counter
2. Active Strategy — DNA strand visualization, fitness score
3. Risk Monitor — SVG gauge, drawdown/position bars, Emergency Stop, critical pulse
4. Performance Charts — Equity curve / Drawdown toggle
5. Evolution Timeline — Generation scores bar chart
6. AI Brain Monitor — Real-time color-coded log feed
7. **Cortex Neural Map** — Live island visualization, migration flows, HyperDNA meta-gen
8. Trade History — Expandable table with AI reasoning
9. Market Overview — Binance Futures pair prices

### Pipeline Dashboard (`/pipeline`) — 12 Panels
1. **Pipeline Flow** — 7-stage animated horizontal flow with live stats per stage
2. **Generation Fitness** — Dual-axis area chart (best/avg fitness) with validation markers
3. **4-Gate Validation** — Animated sequential gate reveal with PASS/FAIL verdicts
4. **Strategy Roster Radar** — 5-regime radar chart + top strategies list
5. **Experience Replay** — Regime × pattern type confidence heatmap
6. **Gene Lineage Tree** ★ — 6-generation family tree with origin tracking (Explainable AI)
7. **Gene Survival Heatmap** ★ — Gene persistence across generations, persistent genes glow
8. **Decision Explainer** ★ — Why AI chose each strategy during regime changes
9. **Overmind Intelligence Hub** — AI reasoning phases and directive status
10. **Live Pulse Telemetry** ☆ — ADFI pipeline health + CIRPN cross-island propagation (LIVE mode only)
11. **Evolution Heartbeat** ☆ — Convergence detector with gene dominance chart + autopilot log (LIVE mode only)
12. **Risk Shield** ● — Risk Fortress: Global Risk Score ring, 8-rail matrix, Daily PnL, risk log

> ★ = Strategy Archaeology panels (Explainable AI)
> ☆ = Radical Innovation panels (Phase 21)
> ● = Risk Fortress panel (Phase 22)

---

## 🔧 Dev Commands

| Command | Purpose |
|---------|---------||
| `npm run dev` | Start development server (port 3000) |
| `npx next build` | Production build (TypeScript strict) |
| `npm test` | Run all tests (Vitest) |
| `npm run test:watch` | Interactive test runner |
| `npm install` | Install dependencies |

---

## 📁 Configuration Files

| File | Purpose |
|------|---------||
| `.env.local` | API keys, testnet toggle |
| `tsconfig.json` | TypeScript strict configuration |
| `next.config.ts` | Next.js settings |
| `postcss.config.mjs` | PostCSS configuration |
| `eslint.config.mjs` | ESLint rules |

---

*Last Updated: 2026-03-07 22:54 (UTC+3)*
*Build Status: ✅ Passing (zero errors)*
*Test Status: ✅ 45/45 passing (824ms)*
