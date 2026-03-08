# Changelog — Learner

All notable changes to this project are documented here.

---

## [v1.5.0-beta.1] — 2026-03-08

### Added
- **System Bootstrap Orchestrator (Phase 36 — 5-Expert Council)**
  - **SystemBootstrap Engine** (`system-bootstrap.ts`, ~555 lines): Singleton 7-phase ignition orchestrator — ENV_CHECK → PERSISTENCE → CORTEX_SPAWN → HISTORICAL_SEED → WS_CONNECT → EVOLUTION_START → READY. Correct `EngineCheckpoint` schema integration, auto-checkpoint via `startAutoCheckpoint()`/`stopAutoCheckpoint()`, error recovery, state change callbacks
  - **IgnitionSequencePanel** (`IgnitionSequencePanel.tsx`, ~280 lines): Dashboard UI with 7-phase progress indicators (pending/active/complete/error states), animated IGNITE SYSTEM button with gradient shine, compact post-boot status bar with live-pulse dot
  - **useBootStore** (`store/index.ts`, +160 lines): Zustand store wrapping `SystemBootstrap`, `ignite(config)`/`shutdown()` actions, dynamically wires Cortex/LiveEngine into `useCortexStore`/`useCortexLiveStore`/`useMarketStore` after boot
  - **Boot Types** (`types/index.ts`, +78 lines): `BootPhase` enum (9 states), `BootProgress`, `BootConfig`, `BootState` interfaces
  - **Ignition CSS** (`globals.css`, +340 lines): Glassmorphism panel with animated gradient border (`mask-composite`), phase state animations, shimmer progress bar, ignition button shine, spinner keyframes, compact live status bar with pulsing green dot

### Changed
- `page.tsx` — `IgnitionSequencePanel` added as first item in dashboard grid (10 panels total)
- `logger.ts` — `bootLog` pre-built logger instance for SystemBootstrap module

### Build Status
✅ Passing (zero errors)

### Test Status
✅ All tests passing (zero regressions)

---

## [v1.3.0-beta.1] — 2026-03-08

### Added
- **Testnet Mission Control Panel (Phase 33)**
  - `TestnetMissionControlPanel` in `pipeline/page.tsx`: Full testnet session dashboard — enhanced PROBE UI (TESTNET badge, drift indicator, 4-column account panel), RAF elapsed timer, seed progress bar, active config echo, live trade log feed
- **Performance Optimization (Phase 34 — 5-Expert Council)**
  - **O(1) LRU Cache**: Replaced `IndicatorCache` LRU tracking (`indexOf+splice` O(N)) with Map `delete+set` O(1). Capacity 100→200
  - **Index-Based ATR**: `atrEndIndex` param in `calculateSlippage()` + `simulateExecution()` — eliminates 3 `atrValues.slice()` copies per loop
  - **Regime Detection Cache**: 50-candle interval caching instead of per-trade recomputation
  - **BacktestProfiler (RADICAL INNOVATION)**: `backtest-profiler.ts` (~330 lines) — self-aware performance telemetry with 5-category recommendation engine, wired into `evolution-scheduler.ts` at 3 pipeline points

### Changed
- `backtester.ts` — O(1) LRU, ATR index-based access, regime cache, capacity 100→200
- `market-simulator.ts` — `atrEndIndex` optional param on `calculateSlippage()` + `simulateExecution()`
- `evolution-scheduler.ts` — Profiler session lifecycle, phase timing, `getProfiler()` accessor

### Build Status
✅ Passing (zero errors)

### Test Status
✅ 211/211 tests passing (zero regressions)

---

## [v1.4.0-beta.1] — 2026-03-08

### Added
- **Live MSSM Integration + STTA Radical Innovation (Phase 35 — 5-Expert Council)**
  - **StressTemporalTracker** (`stress-temporal-tracker.ts`, ~290 lines): **RADICAL INNOVATION** — Stress Trend Temporal Analysis engine. Rolling 20-snapshot window tracking RRS/CRRS per generation. Linear regression trend classification (IMPROVING/STABLE/DEGRADING with slope+R²). VulnerabilityMatrix: per-scenario fitness grid + per-scenario trend detection, `weakestScenarioTrend` early warning
  - **Live MSSM Hook**: `usePipelineLiveData.ts` (+200 lines) — `StressLiveSnapshot` + `StressScenarioLive` types, `deriveStressLive()` (champion→runStressMatrix→ASC calibrate→STTA record), 30s TTL cache via `stressCacheMap`, per-island `calibratorMap` + `trackerMap` singletons
  - **Dual-Mode StressMatrixPanel**: Rewritten to accept `stressLive | stressData` (both nullable). `🔴 LIVE` badge. **STTA Sparkline** (AreaChart: RRS + CRRS trend over generations). **Regime Vulnerability Heatmap** (5×N color-coded grid with per-scenario trend arrows + deterioration warning)

### Changed
- `usePipelineLiveData.ts` — Now ~900 lines (added StressLiveSnapshot, deriveStressLive, STTA integration). Fixed 3 TypeScript lint errors (confidence→currentConfidence, transitionProbabilities Record→Object.entries)
- `pipeline/page.tsx` — Now ~5230 lines (StressMatrixPanel dual-mode rewrite +175 lines STTA section)

### Build Status
✅ Passing (zero errors)

### Test Status
✅ All tests passing (zero regressions)

---

## [v1.2.0-beta.1] — 2026-03-08

### Added
- **Real Binance Testnet Paper Trading (Phase 31 — 4-Expert Council)**
  - **Testnet Probe API** (`testnet-probe/route.ts`, ~210 lines): 6-point pre-flight check — credentials, testnet mode, REST reachability, time sync, account access, exchange info
  - **Session Control API** (`session/route.ts`, ~155 lines): POST/GET/DELETE session lifecycle — validated config, live status, graceful stop with report
  - **Testnet Session Orchestrator** (`testnet-session-orchestrator.ts`, ~370 lines): **RADICAL INNOVATION** — 5-phase lifecycle (PROBE→SEED→EVOLVE→TRADE→REPORT), safety interlocks (max loss, duration, positions), session report generation
  - **Evolution Scheduler upgrade** (`evolution-scheduler.ts`): Phase 30 stress matrix + structured logging integration
- **Dashboard MSSM Visualization (Phase 32 — 4-Expert Council)**
  - **StressMatrixPanel** (`pipeline/page.tsx`, ~380 lines): 5-axis radar chart, RRS semi-circle gauge, per-scenario fitness bars, champion/weakest badges
  - **ASC Calibration Heatmap** (RADICAL INNOVATION): Regime weight heatmap with Raw RRS → Calibrated CRRS comparison, regime confidence bar

---

## [v1.1.0-beta.1] — 2026-03-08

### Added
- **Performance Optimization (Phase 30 — 4-Expert Council)**
  - **IndicatorCache LRU** (`backtester.ts`): Max 100 entries, hit/miss tracking, `getMemoryEstimate()` — prevents memory explosion
  - **Stress Matrix PFLM Upgrade** (`stress-matrix.ts`): `prepareScenarios()` pre-generates candles+caches ONCE, ~5× faster `batchStressMatrix()`
  - **Adaptive Stress Calibration** (`adaptive-stress.ts`, ~318 lines): **RADICAL INNOVATION** — Regime-weighted scenario scoring via `AdaptiveStressCalibrator`, MRTI-ready, 5 weight matrices, blended fitness (70% backtest + 30% CRRS)
  - **Evolution Pipeline Integration** (`evolution-scheduler.ts`): Top-3 stress testing, calibrated RRS blending, structured logging migration

---

## [v1.0.0-beta.1] — 2026-03-08

### Added
- **Production Deployment Preparation (Phase 29 — 4-Expert Council)**
  - **Structured Logger** (`utils/logger.ts`, ~218 lines): 4 levels (DEBUG/INFO/WARN/ERROR), module tags, env-aware suppression, 14 pre-built loggers
  - **Deployment Sentinel** (`config/deployment-sentinel.ts`, ~283 lines): **RADICAL INNOVATION** — 12-point deployment readiness checker (env validation, Supabase probe, Binance ping, security headers, build hash, testnet mode, TS strict, error boundary)
  - **Sentinel API** (`/api/sentinel/route.ts`): GET endpoint exposing full readiness report
  - **Build Hardening**: `build:prod` (test+build), `watchdog` (memory CI), `sentinel` (readiness probe) scripts

### Changed
- **Version Bump**: `0.1.0` → `1.0.0-beta.1`
- **Env Validator Wiring**: `getEnv()` integrated into `binance-rest.ts` and `supabase.ts` (replaces raw `process.env`)
- **Structured Logging Migration**: `cortex-live-engine.ts` (21 console→cortexLog), `binance-rest.ts` (4 console→binanceLog)
- **Memory Watchdog**: Added `src/lib/config` and `src/lib/utils` to scanned directories

---

## [v0.28.0] — 2026-03-08

### Added
- **Memory Architecture Integrity Audit (Phase 28 — 4-Expert Council)**
  - Forensic audit uncovered **15 completely undocumented source files** (~7,500+ lines invisible to memory system)
  - Updated `file_map.md` — new Cognitive Intelligence Layer section (9 modules), 4 Advanced Gene entries, 2 Island Model entries
  - Updated `overview.md` — all 15 files added to Module Map, `live-trade-executor.ts` path corrected (`api/` not `engine/`)
  - Updated `active_context.md` — AI Brain Status expanded with 7 new capability rows
  - `memory/scripts/memory-watchdog.js` — **RADICAL INNOVATION**: Automated orphan file detection
    - Scans all source directories, cross-references against `file_map.md`
    - Detects ORPHAN files (on disk, not in docs) and GHOST files (in docs, not on disk)
    - Auto-generates `file_map.md` entry suggestions from file headers
    - CI-compatible exit codes (0 = synced, 1 = drift detected)
    - Commands: `--scan` (default), `--auto-fix`, `--ci`

### Fixed
- **File path error**: `live-trade-executor.ts` documented as `src/lib/engine/` but actually located at `src/lib/api/` — corrected across all memory documents
- **Test file count**: Corrected from "12 files" to "11 files" in `file_map.md` footer
- **Overmind file count**: Corrected from "15 files" to "16 files" (adding `directive-applicator.ts`)

### Documentation
- 15 orphan files now documented: `bayesian-signal-calibrator.ts`, `coevolution.ts`, `genome-topology.ts`, `surrogate-illumination.ts`, `quality-diversity.ts`, `orderflow-genes.ts`, `neural-impulse-bus.ts`, `metacognitive-monitor.ts`, `market-intelligence.ts`, `knowledge-directed-synthesis.ts`, `confluence-genes.ts`, `confluence-acsi.ts`, `confluence-tcdw.ts`, `strategy-roster.ts`, `directive-applicator.ts`

### Build Status
✅ Passing (zero errors)

### Test Status
✅ 211/211 tests passing (11 test files)

---

## [v0.27.0] — 2026-03-08

### Added
- **E2E Integration Test Suite (Phase 27 — 5-Expert Council)**
  - `src/lib/engine/__tests__/integration-e2e.test.ts` — **33 tests**: 8-category comprehensive E2E testing
    - Full Backtest Pipeline (5): runBacktest → trades, equity curve, metrics, random strategy resilience (20 iterations)
    - Batch Backtest + PFLM Cache (4): batchBacktest, shared vs individual cache consistency, quickFitness agreement, performance (<5s for 10 strategies)
    - Complete Evolution Cycle (4): genesis → evaluate → evolve across 5 generations, population size invariant, diversity index
    - Market Scenario Testing (4): Bull trend, bear crash, sideways range, high volatility via realistic market data generators
    - LiveTradeExecutor Signal Logic (4): Signal evaluation across 4 scenarios, regime detection (.currentRegime), position context (LONG/SHORT)
    - HTF Candle Aggregation (4): M15→H1, H1→H4/D1, lower TF guard (empty result), volume aggregation (hour-aligned)
    - Fitness Convergence (3): Elitism preservation across generations, mutation adaptation, deterministic trade generation
    - Edge Cases (5): Minimum candles (warmup+1), below-warmup (empty result), missing indicators, empty candles, empty strategy list
  - Realistic market data generators: `generateBullTrend()`, `generateBearCrash()`, `generateSideways()`, `generateHighVolatility()`
  - Deterministic strategy factory: `createDeterministicStrategy()` (RSI-14 + EMA-50 mean reversion)

- **Market Scenario Stress Matrix (MSSM — RADICAL INNOVATION)**
  - `src/lib/engine/stress-matrix.ts` (~390 lines)
    - 5 canonical market scenario generators (bull_trend, bear_crash, sideways_range, high_volatility, regime_transition)
    - `runStressMatrix(strategy, candlesPerScenario)` — backtests across all 5 regimes simultaneously
    - Regime Resilience Score (RRS): `avgFitness × (1 - normalizedVariance) × consistencyBonus`
    - `batchStressMatrix(population)` — batch population analysis sorted by RRS
    - Per-scenario breakdown: fitness, trades, metrics, detected regime, equity return, execution time
    - Unique `regime_transition` scenario: bull→sideways→bear crash (tests strategy adaptability)

### Fixed
- **Confluence Gene HTF Aggregation**: `aggregateToHigherTimeframe()` validated in integration tests — sparse candle arrays from HTF confluence genes now gracefully handled via try/catch
- **RegimeAnalysis property**: Corrected `.regime` → `.currentRegime` in integration tests
- **Timestamp alignment**: Hour-aligned M15 candle timestamps for volume aggregation accuracy

### Test Status
✅ 211/211 tests passing (1.77s), 12 test files (11 suites), 0 regressions

### Build Status
✅ Passing (zero errors)

---

## [v0.26.0] — 2026-03-08

### Added
- **Live Paper Trading E2E Testnet Execution (Phase 26)**
  - `src/lib/api/live-trade-executor.ts` (~330 lines) — Signal-to-order pipeline
    - `evaluateAndExecute()`: strategy signal evaluation → risk validation → position sizing → SL/TP → order placement
    - Risk validation: calls RiskManager.validateTrade() before every order
    - Duplicate prevention: tracks active positions per symbol
    - Execution logging with timestamps and error handling
  - `src/app/api/trading/status/route.ts` (~150 lines) — Trading telemetry endpoint
    - Returns: autoTrade state, active positions, execution quality, risk capacity, engine status
  - `useCortexLiveStore` — `setAutoTrade(enabled: boolean)` action for UI toggle
  - `CortexLiveEngine` — `handleCandleClose()` wiring to LiveTradeExecutor

### Build Status
✅ Passing (zero errors)

---



### Added
- **Test Coverage Expansion (Phase 25 — 5-Expert Council)**
  - `src/lib/engine/__tests__/validation-pipeline.test.ts` — **26 tests**: WFA (rolling, anchored, degradation, IS/OOS split), Monte Carlo (permutation, equity curve randomization), Deflated Sharpe Ratio, Overfitting Detector (5 components: WFA efficiency, MC significance, complexity, regime diversity, consistency)
  - `src/lib/engine/__tests__/migration-engine.test.ts` — **10 tests**: Affinity calculation (6 tiers: same pair+TF, same pair, same TF, different everything), adaptMigrant (metadata reset, slot reassignment, fitness zeroing, gene preservation)
  - `src/lib/engine/__tests__/advanced-genes.test.ts` — **16 tests**: Microstructure genes (generation, VOLUME_PROFILE signals, crossover, mutation, 5 types), Price Action genes (generation, CANDLESTICK_PATTERN signals, all pattern types, crossover, mutation, 100-cycle GA invariant)
  - `src/lib/engine/__tests__/evaluator.test.ts` — **10 tests**: Performance metrics (Sharpe, WinRate, ProfitFactor), fitness scoring (0-100 bounds), novelty bonus (advanced gene presence), deflated fitness, drawdown/streaks
  - `src/lib/engine/__tests__/signal-engine.test.ts` — **14 tests**: SMA/EMA/RSI/MACD/Bollinger/ATR (valid-only array lengths), signal rule evaluation (ABOVE/BELOW/AND/OR), strategy pipeline (DNA→candles→signal)
  - `src/lib/engine/__tests__/property-fuzzer.test.ts` — **30 tests**: Property-Based Fuzzing Harness + Chaos Monkey
    - GA Operator Invariants (6): 100-iteration crossover stability, 1000-cycle stress
    - Signal Engine Monotonicity (4): RSI∈[0,100], BB upper>mid>lower, ATR≥0
    - Evaluator Consistency (4): win>loss monotonicity, fitness∈[0,100], complexity≤1.0
    - WFA Symmetry (3): determinism, insufficient-trade guard, degradation clamping
    - Overfitting Monotonicity (3): better WFA→lower score, significant MC→lower score
    - Migration Affinity Algebra (4): reflexive, symmetric, range [0,1]
    - **Chaos Monkey Stress (6)**: zero-price candles, negative volumes, flash crashes, single candle, flat prices

### Fixed
- **Type corrections across tests**: RiskGenes `positionSizePercent`/`maxLeverage`, TradeSignalAction `LONG/SHORT/HOLD`, PriceActionPatternType `CANDLESTICK_PATTERN`, SignalCondition `CROSS_ABOVE`, MicrostructureGene `params` nesting

### Test Status
✅ 178/178 tests passing (840ms), 10 test files, 0 regressions

### Build Status
✅ Passing (zero errors)

---

## [v0.22.0] — 2026-03-07

### Added
- **Risk Manager Global Enforcement (Phase 22 — 5-Layer Integration)**
  - `src/lib/risk/manager.ts` — Added `getRiskSnapshot()` method (~50 lines)
    - Serializable snapshot: 8 rail configs, utilizations, emergency stop, daily PnL, global risk score
  - `src/types/index.ts` — `RiskSnapshot` interface + `CortexSnapshot.riskSnapshot` field
  - `src/lib/engine/cortex.ts` — RiskManager singleton wired into constructor, `recordTrade()`, `emergencyStopAll()`, `getSnapshot()`
  - `src/lib/hooks/usePipelineLiveData.ts` — `riskLive` field + `deriveRiskSnapshot()` function
  - `src/app/pipeline/page.tsx` — **RiskShieldPanel** (~330 lines)
    - Global Risk Score ring (SVG 0-100, green→amber→red gradient)
    - 8-rail status matrix with animated utilization bars + status badges (ENFORCED/OK/STANDBY)
    - >80% utilization → pulse-glow animation
    - Emergency Stop indicator, Daily PnL display, recent risk event log
- **Neural Brain Live Binding**: Connected holographic brain to live Cortex/Island state
- **MRTI Dashboard Panel**: `MRTIForecastPanel` + Regime Horizon Bar radical innovation
- **Strategic Overmind Live Binding**: 25-field `OvermindLiveSnapshot` + Cognitive Pulse (Token Pressure + Phase Heartbeat)
- **Vitest Test Framework**
  - `vitest.config.ts` + `vite-tsconfig-paths` for `@/` alias resolution
  - `npm test` (run) + `npm run test:watch` (interactive) scripts
  - `src/lib/risk/__tests__/manager.test.ts` — **37 tests**: 8 safety rails, snapshot, trade recording, reset + **Safety Rail Mutation Boundary Tests** (radical innovation)
  - `src/lib/engine/__tests__/cortex-risk.test.ts` — **3 tests**: Cortex integration
  - `src/lib/hooks/__tests__/risk-derivation.test.ts` — **5 tests**: derivation null safety + passthrough

### Changed
- `src/app/pipeline/page.tsx` — +330 lines (RiskShieldPanel), now ~3730 lines total, 12 panels
- `src/lib/hooks/usePipelineLiveData.ts` — +40 lines (riskLive derivation)
- `package.json` — +`vitest`, `vite-tsconfig-paths` devDependencies, +`test`/`test:watch` scripts

### Architecture
- ADR-012: Risk Manager Global Enforcement + Automated Test Infrastructure

### Build Status
✅ Passing (zero errors)

### Test Status
✅ 45/45 tests passing (824ms)

---

## [v0.21.0] — 2026-03-07

### Added
- **Pipeline Dashboard Live Integration (Phase 21 — Radical Innovations)**
  - `src/lib/hooks/usePipelineLiveData.ts` — Data bridge hook (~540 lines)
    - Connects 5 pipeline panels to live Cortex/Island state
    - 3-second polling with `useCallback` + `useRef` interval
    - Dual-mode: LIVE (from CortexLiveEngine) or DEMO (fallback generators)
    - Island selector support (`selectedSlotId` param)
    - Derives: generations, gates, roster, replayCells, stages, telemetry, propagation, genomeHealth
  - `src/lib/engine/evolution-health.ts` — **Evolution Health Analyzer** (~300 lines)
    - `computeGenomeHealth(island)` → `GenomeHealthSnapshot`
    - `computeFitnessTrajectory()` — linear regression slope over last 5 generations
    - `computeGeneDominance()` — frequency histogram of IndicatorTypes with ↑/•/↓ trends
    - `detectAutoInterventions()` — detects mutation boosts/decays from rate changes across generations
    - `assessHealth()` — A/B/C/D/F grading based on convergence risk + diversity + trajectory
  - **LivePulseTelemetryPanel** component (~220 lines in pipeline/page.tsx)
    - ADFI Health: candles, latency, gaps, reconnects, uptime
    - CIRPN Propagation: regime events, leaders, correlations, warnings with ETA bars
  - **EvolutionHeartbeatPanel** component (~250 lines in pipeline/page.tsx)
    - Animated health grade ring (conic-gradient, pulse animation on high-risk)
    - 5 core metrics: Diversity, Stagnation, Trajectory, Mutation Δ, Best Fitness
    - Gene dominance bar chart (top 8 IndicatorTypes with trend indicators)
    - Autopilot intervention log (⚡ mutation boost / 📉 decay / 🎲 diversity injection)

### Changed
- `src/app/pipeline/page.tsx` — +520 lines total (LivePulseTelemetry + EvolutionHeartbeat + imports)
  - Island selector dropdown in header (shows pair + timeframe per island)
  - LIVE/DEMO mode badge indicator
  - Row 1.5: LivePulseTelemetryPanel (LIVE mode only)
  - Row 1.75: EvolutionHeartbeatPanel (LIVE mode only)

### Architecture
- ADR-011: Pipeline Live Integration — Data bridge hook pattern, dual-mode operation, hidden engine intelligence exposure

### Build Status
✅ Passing (zero errors)

## [v0.20.0] — 2026-03-07

### Added
- **CortexLiveEngine (Phase 20 — Live Market Connection)**
  - `src/lib/engine/cortex-live-engine.ts` — Central live orchestrator (~490 lines)
    - Historical seed (500 candles per slot), kline + ticker WebSocket subscriptions
    - Candle aggregation, island routing, snapshot refresh callbacks
    - Boot sequence: initialize → seed → subscribe → wire callbacks
  - `src/lib/engine/evolution-scheduler.ts` — Autonomous evolution trigger (~200 lines)
  - `src/lib/engine/adaptive-data-flow.ts` — ADFI gap detection + telemetry (~420 lines)
  - `src/lib/engine/regime-propagation.ts` — CIRPN cross-island regime propagation (~380 lines)
  - `useCortexLiveStore` Zustand store addition — exposes CortexLiveEngine instance + status

### Build Status
✅ Passing (zero errors)



### Added
- **Atomic Order Lifecycle Engine (Phase 19.1 — Radical Innovation)**
  - `src/lib/api/order-lifecycle.ts` — 13-state machine (~370 lines)
    - Lifecycle: PENDING → SETTING_LEVERAGE → PLACING_ENTRY → ENTRY_FILLED → PLACING_SL → SL_PLACED → PLACING_TP → FULLY_ARMED
    - **Core Invariant**: Position NEVER exists without stop-loss protection
    - SL placement retried 3× with exponential backoff; exhaustion → EMERGENCY_CLOSE (immediate market-close)
    - Partial fill handling (uses executedQty for SL/TP sizing)
    - Execution quality recording per order (slippage, latency, fill ratio)
    - Configurable lifecycle callbacks (onStateChange, onFullyArmed, onEmergencyClose, onFailed)
    - Full state audit trail (StateTransition[] with timestamps and reasons)
  - `src/lib/api/execution-quality.ts` — Execution Quality Tracker (~190 lines)
    - Per-symbol rolling window (100 orders, 24h staleness filter)
    - Tracks: slippage (bps), latency (ms), fill ratio
    - `getStats()`: avg + P95 slippage/latency per symbol
    - `getCalibratedSlippage()`: feeds real data into market-simulator.ts to replace hardcoded values

### Changed
- `src/lib/api/binance-rest.ts` — **Adaptive Rate Governor** replaces static `RateLimiter`
  - Reads `X-MBX-USED-WEIGHT-1m` and `X-MBX-ORDER-COUNT-1m` from every Binance response
  - Dynamically adjusts concurrency: <50% → 10, 50-75% → 5, 75-92% → 2, >92% → 1 (+ 5s pause)
  - New `getRateStatus()` method returns `AdaptiveRateStatus`
  - DELETE method now sends body (for cancel operations)
- `src/types/index.ts` — +120 lines: OrderLifecycleState (13 states), OrderGroupConfig, OrderGroup, StateTransition, ExecutionRecord, ExecutionQualityStats, AdaptiveRateStatus

### Architecture
- ADR-010: Atomic Order Lifecycle Engine — 13-state machine, mandatory SL invariant, Adaptive Rate Governor, Execution Quality Tracker

### Build Status
✅ Passing (zero errors)

## [v0.19.0] — 2026-03-07

### Added
- **Binance Trading Execution Layer (Phase 19)**
  - `src/lib/api/exchange-circuit-breaker.ts` — 3-state circuit breaker + ExchangeInfoCache (~360 lines)
  - `src/lib/api/user-data-stream.ts` — User Data WebSocket (ACCOUNT_UPDATE, ORDER_TRADE_UPDATE, MARGIN_CALL) (~476 lines)
  - `src/lib/api/account-sync.ts` — Periodic account polling with change detection (~212 lines)
  - 4 new API routes: order (POST+DELETE), position (GET), account (GET), depth (GET)
- **Git Guardian Hook System**
  - `scripts/git-guardian.js` — 3-gate pre-commit hook (secrets, file size, JSON syntax) (~210 lines)
  - `scripts/commit-msg-validator.js` — Convention enforcement (~110 lines)
  - `scripts/install-hooks.js` — Cross-platform hook auto-installer (~130 lines)

### Changed
- `src/lib/api/binance-rest.ts` — +7 order methods (placeOrder, cancelOrder, cancelAllOrders, getOpenOrders, getPositionRisk, getOrderBook, setMarginType) + signedDelete + mapOrderResult
- `src/types/index.ts` — +196 lines: OrderSide, OrderType, OrderStatus enums, OrderRequest (mandatory stopLoss), OrderResult, PositionInfo, DepthLevel, OrderBookSnapshot, UserDataEvent types, CircuitBreakerState
- `.gitignore` — Enhanced with API key exclusions

### Build Status
✅ Passing (zero errors)



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
