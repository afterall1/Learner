# File Map â€” Learner

> Every source file mapped to its purpose, layer, and importance level.
> **Importance**: ğŸ”´ Critical | ğŸŸ¡ Important | ğŸŸ¢ Standard

---

## ğŸ“ Type Layer (`src/types/`)

| File | Purpose | Importance |
|------|---------|------------|
| `index.ts` | Complete type system (2030+ lines). All enums (BrainState, StrategyStatus, Timeframe, MarketRegime, MicrostructureGeneType, PriceActionPatternType, CandlestickFormation, ConfluenceType, CompositeOperation, DCEventType, OrderSide, OrderType, OrderStatus, OrderLifecycleState, CircuitBreakerState, etc.), interfaces (StrategyDNA, Trade, OrderRequest, OrderResult, PositionInfo, OrderBookSnapshot, OrderGroupConfig, OrderGroup, StateTransition, ExecutionRecord, ExecutionQualityStats, AdaptiveRateStatus, validation types), and default constants. | ğŸ”´ |
| `trading-slot.ts` | TradingSlot type â€” pair+timeframe identifier for the Island Model. Factory functions (`createTradingSlot`, `parseSlotId`), `TradingSlotStatus` enum, default pairs/timeframes, starter slot generator. | ğŸ”´ |
| `overmind.ts` | **Strategic Overmind Type System** (~230 lines). 23 interfaces for Overmind, PSPP, CCR type system. OvermindSnapshot, HypothesisRecord, EvolutionDirective, StressReport, EpisodicMemoryEntry, CounterfactualResult, MetaCognitionReport, PredictiveAction, ReasoningEntry. | 🟡 |

---

## ğŸ§¬ Core Engine Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `strategy-dna.ts` | Strategy genome generator. Handles random DNA creation (with `slotId` + optional advanced genes at 40% injection rate), sexual crossover between two parent strategies (including advanced gene blending), and random mutation of individual genes (including advanced gene perturbation/injection). `calculateStructuralComplexity()` function. Core of the GA system. | ğŸ”´ |
| `evaluator.ts` | Performance evaluation engine. Calculates Sharpe Ratio, Sortino Ratio, Profit Factor, Max Drawdown, Expectancy, and a composite fitness score (0-100) with **complexity penalty**, **deflated fitness** correction, and **structural novelty bonus** (Phase 9: +8 max points for advanced gene usage, decaying over generations). Min 30 trades for statistical significance. | ğŸ”´ |
| `signal-engine.ts` | Signal calculation and evaluation engine. Calculates all technical indicators (RSI, EMA, SMA, MACD, Bollinger, ADX, ATR, StochRSI) and evaluates signal rules. **Phase 9**: `calculateAdvancedSignals()` integrates microstructure, price action, composite, and DC gene evaluation with aggregate bias + confidence scoring. | ğŸ”´ |
| `evolution.ts` | Genetic algorithm controller. Manages generations, implements tournament selection (k=3), elitism (top 20%), crossover (60%), mutation (adaptive rate). **Enhanced**: adaptive mutation, diversity pressure, Strategy Memory (regime-based gene performance tracking), complexity-aware fitness. | ğŸ”´ |
| `experience-replay.ts` | Experience pattern extraction and replay system. Stores proven indicator combos, risk profiles, signal configs. **Phase 9**: Extended with MICROSTRUCTURE_COMBO and COMPOSITE_FUNCTION pattern types for advanced gene pattern learning. | ğŸ”´ |
| `brain.ts` | AI Brain orchestrator (single-island mode). Full lifecycle: IDLE â†’ EXPLORING â†’ TRADING â†’ EVALUATING â†’ EVOLVING. **Enhanced**: 4-Gate Validation Pipeline, 3-Stage Promotion (Paper â†’ Candidate â†’ Active), market regime tracking, deflated fitness. | ğŸ”´ |

---

## ğŸ§  Advanced Gene Layer (`src/lib/engine/`) [Phase 9]

| File | Purpose | Importance |
|------|---------|------------|
| `microstructure-genes.ts` | Microstructure gene engine (~380 lines). Volume Profile (POC detection, bucket concentration), Volume Acceleration (spike detection), Candle Anatomy (body:wick ratios, shadow dominance), Range Expansion/Contraction (ATR sequences), Absorption Detection (whale activity). All parameters are evolvable. Includes random generator, crossover, and mutation operators. | ğŸ”´ |
| `price-action-genes.ts` | Price action gene engine (~400 lines). 10 parameterized candlestick formations (Engulfing, Doji, Hammer, Shooting Star, Morning/Evening Star, Three Soldiers/Crows, Pinbar, Inside Bar) with EVOLVABLE thresholds. Structural Break detection (N-bar high/low), Swing Sequence (HH/HL, LH/LL), Compression/Breakout, Gap Analysis. | ğŸ”´ |
| `composite-functions.ts` | **KEY INNOVATION**: Composite function gene engine (~310 lines). Mathematical evolution of indicator relationships via 9 operations (ADD, SUBTRACT, MULTIPLY, DIVIDE, MAX, MIN, ABS_DIFF, RATIO, NORMALIZE_DIFF) Ã— 4 normalization methods (none, percentile, z_score, min_max). Inputs can be any indicator or raw price field. AI discovers novel composite signals. | ğŸ”´ |
| `directional-change.ts` | **RADICAL INNOVATION**: Directional Change gene engine (~350 lines). Based on Kampouridis's event-based framework. Converts fixed-interval candles into DC events (upturn/downturn) based on evolved Î¸% reversal threshold. DC-derived indicators: trendRatio, avgMagnitude, oscillationCount, upturnRatio. Overshoot analysis for trend extension. | ğŸ”´ |
| `orderflow-genes.ts` | **Phase 9.5 â€” Order Flow Intelligence** (~526 lines). Gene family extending GA vocabulary with order flow analysis: Volume Delta (CVD â€” cumulative buy vs sell imbalance), Large Trade Detection (institutional footprint), Liquidation Cascades (forced closures), Funding Rate Dynamics (perpetual futures pressure), Volume Absorption (whale activity). Gene operators (create, crossover, mutate), synthetic aggTrade generation from OHLCV for backtesting. Composite OFI signal with 5-component weighted bias. | ğŸ”´ |
| `confluence-genes.ts` | Multi-TF Confluence Gene System (~907 lines). Multi-timeframe alignment gene engine enabling strategies to evaluate signals across different timeframes simultaneously. Gene operators, crossover, mutation. | ğŸ”´ |
| `confluence-acsi.ts` | ACSI Confluence Module (~296 lines). Adaptive Composite Signal Integration â€” aggregates multi-timeframe confluence signals with adaptive weighting. | ğŸŸ¡ |
| `confluence-tcdw.ts` | TCDW Confluence Module (~235 lines). Time-Correlated Delta Weighting â€” weights confluence signals by temporal correlation between timeframes. | ğŸŸ¡ |

---

## ğŸ›¡ï¸ Anti-Overfitting Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `walk-forward.ts` | Walk-Forward Analysis engine. Generates rolling IS/OOS windows (70%/30%), evaluates strategy across multiple windows, calculates efficiency ratio and degradation metrics. Minimum efficiency â‰¥ 0.5 required. | ğŸ”´ |
| `monte-carlo.ts` | Monte Carlo permutation testing. Fisher-Yates shuffle, 1000 permutations, 95th percentile significance threshold. Also implements LÃ³pez de Prado's **Deflated Sharpe Ratio** to correct for multiple testing bias. | ğŸ”´ |
| `regime-detector.ts` | Market regime classifier. Uses ADX, ATR, and SMA indicators to classify into 5 regimes: TRENDING_UP, TRENDING_DOWN, RANGING, HIGH_VOLATILITY, LOW_VOLATILITY. Calculates regime diversity (min 2 required). Exports `calculateADX()` and `calculateATR()` for MRTI. | ğŸ”´ |
| `regime-intelligence.ts` | **Phase 11 â€” MRTI Predictive Engine** (~530 lines). `TransitionMatrix` (5Ã—5 Markov chain, Laplace smoothing), `EarlyWarningDetector` (4 signals: ADX slope, ATR acceleration, duration exhaustion, confidence decay), `RegimeIntelligence` orchestrator (HOLD/PREPARE/SWITCH). Auto-calibrates from 200+ candles. Integrated into Island, Roster, Cortex. | ğŸ”´ |
| `overfitting-detector.ts` | Composite overfitting risk scorer (0-100). Aggregates WFA (30%), Monte Carlo (25%), Complexity (15%), Regime Diversity (15%), Return Consistency (15%). Score < 40 required to pass. | ğŸ”´ |

---

## ğŸï¸ Island Model Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `island.ts` | Self-contained evolution unit scoped to one TradingSlot (pair+timeframe). Contains its own EvolutionEngine, trade history, validation pipeline, market data, Migration API (export/import), capital tracking, **HyperDNA** (GAÂ²), and **MRTI** (Phase 11: auto-calibration, handleRegimeForecast, proactive switching). | ğŸ”´ |
| `cortex.ts` | Multi-island orchestrator. Manages island lifecycle, routes trades, triggers migration, rebalances capital, monitors correlation, orchestrates **Meta-Evolution cycles** (GAÂ²), and **MRTI global risk** (Phase 11: evaluateGlobalRegimeRisk, adjustAllocationsForRegimeForecast, macro consensus). | ğŸ”´ |
| `meta-evolution.ts` | Meta-Evolution Engine (GAÂ²). HyperDNA genome generation/crossover/mutation, 4-component meta-fitness evaluation, stability guard, HyperDNAâ†’EvolutionConfig bridge. | ğŸ”´ |
| `migration.ts` | Cross-island knowledge transfer. 3 topologies: Neighborhood (affinity-based), Ring (sequential), Star (best broadcasts). Affinity scoring: same pair/different TF = 0.8, same TF/different pair = 0.5. Adapter re-scopes strategies and resets fitness. | ğŸŸ¡ |
| `capital-allocator.ts` | Dynamic capital distribution. 3-factor weighting: lifetime fitness (60%), recent trend (30%), diversity contribution (10%). Per-island floor (5%) and cap (30%). Periodic rebalancing. | ğŸŸ¡ |
| `paper-trade-executor.ts` | Paper trade execution and management. Simulates trade entries/exits without real capital exposure. | ğŸŸ¡ |
| `strategy-roster.ts` | Strategy Roster Management (~510 lines). Manages active strategy populations across islands. Strategy lifecycle tracking, discard when fitness drops below threshold, instantly activates top-performing candidates. | ğŸŸ¡ |

---

## ğŸ§  Strategic Overmind Layer (`src/lib/engine/overmind/`) [Phase 15]

| File | Purpose | Importance |
|------|---------|------------|
| `strategic-overmind.ts` | **Core Orchestrator** (~805 lines). 6-phase reasoning cycle (OBSERVEâ†’ANALYZEâ†’HYPOTHESIZEâ†’DIRECTâ†’VERIFYâ†’LEARN). Supervises GA, Meta-Evolution, and MRTI. Coordinates all Overmind sub-engines. | ğŸ”´ |
| `opus-client.ts` | **Opus 4.6 API Client** (~314 lines). Singleton Anthropic API wrapper. Adaptive thinking, token budget management, graceful degradation (system runs without Opus). | ğŸ”´ |
| `prompt-engine.ts` | LLM prompt construction engine. Builds structured prompts for all Overmind reasoning phases. Context-aware prompt assembly. | ğŸ”´ |
| `response-parser.ts` | 4-tier JSON extraction from LLM responses. Handles structured/unstructured output, markdown artifacts, and fallback parsing. | ğŸŸ¡ |
| `hypothesis-engine.ts` | Market hypothesis generation (~339 lines). Opus-driven market hypothesis creation, tracking, and retirement. Generates testable market theories. | ğŸ”´ |
| `evolution-director.ts` | GA directive generation (~274 lines). Opus analyzes generation results, proposes mutations, crossovers, gene proposals. Guides GA direction. | ğŸ”´ |
| `adversarial-tester.ts` | ACE strategy stress testing (~377 lines). Opus generates adversarial scenarios. Evaluates strategy resilience. Produces stress reports. | ğŸ”´ |
| `pair-specialist.ts` | Pair-specific profiling. Builds behavioral profiles per trading pair. Customizes evolution parameters per pair. | ğŸŸ¡ |
| `emergent-indicator.ts` | Novel indicator discovery. Opus proposes new composite indicator formulas. Evaluates indicator originality vs existing library. | ğŸŸ¡ |
| `strategy-decomposer.ts` | RSRD synthesis. Decomposes winning strategies into reusable components. Identifies transferable patterns. | ğŸŸ¡ |
| `episodic-memory.ts` | CCR episode storage. Records key decision moments with full context snapshots. Enables later counterfactual analysis. | ğŸ”´ |
| `counterfactual-engine.ts` | CCR "what-if" analysis. Generates alternative scenarios from past episodes. Extracts causal insights. | ğŸ”´ |
| `meta-cognition.ts` | CCR self-reflection loop. Reviews Overmindâ€™s own decisions. Updates beliefs and biases. Feeds into reasoning journal. | ğŸŸ¡ |
| `predictive-orchestrator.ts` | **PSPP bridge** (MRTI â†’ Overmind). Evaluates regime forecasts, determines pre-positioning actions (HOLD/PREPARE/SWITCH). Dual primary skill: `regime-intelligence` + `strategic-overmind`. | ğŸ”´ |
| `reasoning-journal.ts` | Decision reasoning log. Stores Overmindâ€™s reasoning chain per cycle. Auditable decision trail. | ğŸŸ¡ |
| `directive-applicator.ts` | **Phase 24 — Overmind Directive Applicator** (~352 lines). Bridges Overmind reasoning→action loop. Applies strategic directives from Overmind to evolution parameters, mutation rates, and gene selection. | 🟡 |

## ğŸ”¬ Backtesting Engine Layer (`src/lib/engine/`)

| File | Purpose | Importance |
|------|---------|------------|
| `backtester.ts` | **Phase 10→34 — Core backtesting engine**. Multi-candle simulation loop: iterates historical OHLCV, evaluates signals, manages positions, checks SL/TP hits, tracks equity curve, tags trades with market regime. **PFLM Innovation**: `IndicatorCache` class pre-computes all indicator values once and shares across population. **Phase 34**: O(1) LRU cache (Map delete+set), capacity 100→200, index-based ATR access (no slice copies), regime detection cache (50-candle interval). `runBacktest()`, `batchBacktest()`, `quickFitness()`. ~1040 lines. | 🔴 |
| `market-simulator.ts` | **Phase 10→34 — Realistic execution modeling**. ATR-adaptive slippage, Binance taker commission (0.04%), Almgren-Chriss square-root market impact model, intra-candle SL/TP detection (conservative: SL wins ties). **Phase 34**: `atrEndIndex` parameter on `calculateSlippage()` + `simulateExecution()` for zero-copy ATR access. ~340 lines. | 🔴 |
| `backtest-profiler.ts` | **Phase 34 — RADICAL INNOVATION: Self-Aware Performance Telemetry** (~330 lines). Singleton profiler measuring real-time execution costs, cache efficiency, memory pressure. Session lifecycle (start/end), phase tracking (beginPhase/endPhase), per-strategy timing. 5-category recommendation engine: CACHE_SIZE, POPULATION, CANDLE_COUNT, REGIME_INTERVAL, BATCH_STRATEGY. Wired into `evolution-scheduler.ts`. | 🔴 |
| `trade-forensics.ts` | **Phase 12 â€” Trade Forensics Engine** (~620 lines). 3-layer: `TradeBlackBox` (flight recorder, 8 event types, MFE/MAE/near-miss), `ForensicAnalyzer` (3 efficiency scores, 4-factor Bayesian causal attribution, 8 lesson types), `TradeForensicsEngine` (lifecycle orchestrator, query API, stats). Integrated into Island. | ğŸ”´ |
| `forensic-learning.ts` | **Phase 12.1 â€” Forensic Learning Engine** (~310 lines). CLOSES the feedback loop: aggregates TradeLesson objects into Bayesian beliefs per regimeÃ—lesson_type, calculates fitness modifiers (Â±10 points) for Evolution Engine, DNA similarity matching, exponential generational decay. Integrated into evaluator + Island. | ğŸ”´ |
| `persistence-bridge.ts` | **Phase 13.1â†’14 â€” Persistence Bridge** (~320 lines). Dual-write singleton: wires engine lifecycle events (trade close, forensic report, generation evolved, portfolio update) to BOTH IndexedDB and Supabase. Lazy auto-init (no manual `initialize()` needed), cloud-first checkpoint loading, SSR-safe, race-condition-safe singleton init promise. | ğŸ”´ |

---

## ğŸ§  Cognitive Intelligence Layer (`src/lib/engine/`) [Phase 18-20]

| File | Purpose | Importance |
|------|---------|------------|
| `quality-diversity.ts` | **Phase 18 â€” MAP-Elites Behavioral Grid** (~437 lines). Replaces fitness-only selection with behavioral repertoire. 5Ã—3 grid (5 regimes Ã— 3 trade styles: Scalper/Swing/Position = 15 cells). `classifyTradeStyle()`, `classifyRegimeSpecialization()`, `MAPElitesGrid.tryPlace()` (local competition), `getBestForRegime()`, `selectActiveStrategy()`. Coverage tracking + illumination stats. | ğŸ”´ |
| `coevolution.ts` | **Phase 18.1 â€” Coevolution Engine: Parasite-Host Arms Race** (~612 lines). Second GA evolving adversarial `MarketScenarioDNA` (parasites) designed to break strategies. 7 trend patterns, synthetic OHLCV generation, parasite crossover/mutate operators, tournament selection. `runCoevolutionRound()` â†’ `RobustnessScore` per strategy. Robustness scores modify host fitness. | ğŸ”´ |
| `genome-topology.ts` | **Phase 18.2 â€” NEAT-Inspired Structural Evolution** (~593 lines). Variable-topology genome replacing fixed-skeleton. `InnovationTracker` singleton (monotonic innovation numbers), `addIndicatorGene()`, `removeIndicatorGene()`, `addIndicatorChain()`, `applyStructuralMutation()`, `alignedCrossover()` (innovation-number-aligned), `assignSpecies()` (structural distance + Jaccard), `dissolveStagnatingSpecies()`. | ğŸ”´ |
| `surrogate-illumination.ts` | **Phase 18.3 â€” Surrogate-Assisted Illumination Engine (SAIE)** (~795 lines). Meta-learning layer predicting strategy fitness WITHOUT full backtests (50x faster). `extractFeatures()` (19-dim vector), `SurrogateForest` (50 decision stumps, bootstrap, random subspace), `computeUCB()` (Upper Confidence Bound acquisition), `computeGeneImportance()` (Mutual Information feature ranking), `SurrogateIlluminationEngine.screenCandidates()`. | ğŸ”´ |
| `bayesian-signal-calibrator.ts` | **Phase 19A â€” Bayesian Signal Calibrator** (~441 lines). Online belief engine maintaining calibrated beliefs about signal reliability using Beta-Bernoulli conjugate Bayesian updating. `SignalBeliefTracker`: per-regime Ã— per-indicator Ã— per-condition Beta posteriors, Thompson sampling for strategy selection, temporal belief decay, reliability matrix for dashboard. Mathematical: Beta(Î±,Î²), JÃ¶hnk sampling, Marsaglia-Tsang gamma. | ğŸ”´ |
| `market-intelligence.ts` | **Phase 19B â€” Market Intelligence Cortex** (~397 lines). External market awareness: Fear & Greed Index (Alternative.me API + synthetic fallback), Funding Rates (Binance), Volatility Context (ATR percentile). Contrarian aggressiveness multiplier (buy fear, sell greed). `MarketIntelligenceCortex`: cached intelligence, async fetch + sync cache, composite mood score (-1 to +1). | ğŸ”´ |
| `metacognitive-monitor.ts` | **Phase 19C â€” Metacognitive Monitor: Self-Awareness Layer** (~460 lines). "Thinking about thinking" â€” monitors calibration quality (Brier Score), belief drift detection, epistemic uncertainty computation (4 sources), meta-aggressiveness adjustment (0.5-1.0Ã— position sizing), Decision Journal (500 entries, outcome recording, win rate tracking). Generates human-readable reasoning chains for Explainable AI. | ğŸ”´ |
| `knowledge-directed-synthesis.ts` | **Phase 20 â€” KDSS: Knowledge-Directed Strategy Synthesis** (~686 lines). Paradigm shift from Darwinian to Lamarckian construction. Consumes knowledge from 6 modules (Bayesian, SAIE, MAP-Elites, Experience Replay, Metacognitive, Forensics) to INTELLIGENTLY CONSTRUCT strategies. Regime-indicator affinity matrix, style risk templates (Scalper/Swing/Position), Gaussian noise injection, niche targeting. 30% of each generation is knowledge-directed, 70% standard GA. | ğŸ”´ |
| `neural-impulse-bus.ts` | **Phase 22 â€” Neural Impulse Event Bus (NIEB)** (~250 lines). Singleton event emitter capturing discrete engine events and translating them into neuron impulses for holographic brain visualization. Ring buffer (500 impulses), subscriber pattern, activity summary with configurable window, 10 neuron IDs. Zero React dependencies â€” pure TypeScript engine module. | ğŸŸ¡ |

---

## ğŸ“¡ Binance Execution Layer (`src/lib/api/`) [Phase 19 + 19.1]

| File | Purpose | Importance |
|------|---------|------------|
| `binance-rest.ts` | **Binance Futures REST Client** (~839 lines). HMAC-SHA256 signed requests, configurable testnet/mainnet, **AdaptiveRateGovernor** (Phase 19.1: reads `X-MBX-USED-WEIGHT-1m` + `X-MBX-ORDER-COUNT-1m` headers, adjusts concurrency 1-10, emergency pause at >92%). 7 order methods: `placeOrder` (NEVER retried), `cancelOrder`, `cancelAllOrders`, `getOpenOrders`, `getPositionRisk`, `getOrderBook`, `setMarginType`. Market data: `getKlines`, `get24hrTicker`, `getLatestPrice`, `getExchangeInfo`. | ğŸ”´ |
| `binance-ws.ts` | Binance WebSocket client for market data streams (klines, tickers). Handles reconnection and subscription management. | ğŸŸ¡ |
| `market-data-service.ts` | Market data aggregation service. Coordinates REST + WebSocket data sources. | ğŸŸ¡ |
| `exchange-circuit-breaker.ts` | **Phase 19 â€” Exchange Circuit Breaker** (~360 lines). 3-state machine (CLOSEDâ†’OPENâ†’HALF_OPEN) wrapping all Binance API calls. Configurable failure thresholds, cooldown period, automatic recovery. + `ExchangeInfoCache`: auto-refreshing cache of trading symbol filters (tickSize, stepSize, minNotional), validates and adjusts order precision. | ğŸ”´ |
| `user-data-stream.ts` | **Phase 19 â€” User Data WebSocket** (~476 lines). Manages `listenKey` lifecycle (create/keepAlive/delete), WebSocket connection with exponential backoff reconnect, parses 3 event types: ACCOUNT_UPDATE (balance/position changes), ORDER_TRADE_UPDATE (fill confirmations), MARGIN_CALL (liquidation warnings). Callback pattern for event handling. | ğŸ”´ |
| `account-sync.ts` | **Phase 19 â€” Account Sync Service** (~212 lines). 30-second periodic polling of account balances and positions. Circuit breaker integration, position change detection via SHA-256 hash comparison, graceful degradation (retains last known state on error). | ğŸŸ¡ |
| `order-lifecycle.ts` | **Phase 19.1 â€” Atomic Order Lifecycle Engine (AOLE)** (~370 lines). 13-state machine (PENDINGâ†’SETTING_LEVERAGEâ†’PLACING_ENTRYâ†’ENTRY_FILLEDâ†’PLACING_SLâ†’SL_PLACEDâ†’PLACING_TPâ†’FULLY_ARMED). **Core Invariant**: position NEVER exists without stop-loss protection. SL has 3 retries with exponential backoff; if all fail â†’ EMERGENCY_CLOSE (market-close position). Partial fill handling, execution quality recording per order, configurable callbacks for state changes. | ğŸ”´ |
| `live-trade-executor.ts` | **Phase 26 â€” LiveTradeExecutor** (~330 lines). Signal-to-order execution pipeline: `evaluateAndExecute()` evaluates strategy signals, validates risk (RiskManager.validateTrade), calculates position sizing + SL/TP levels, places orders via AOLE, prevents duplicates per symbol, logs execution with timestamps. Integrated into CortexLiveEngine `handleCandleClose()`. | ğŸ”´ |
| `execution-quality.ts` | **Phase 19.1 â€” Execution Quality Tracker** (~190 lines). Per-symbol rolling window (100 orders, 24h). Tracks slippage (bps), latency (ms), fill ratio per execution. Provides: `getStats()` (avg/P95), `getCalibratedSlippage()` (feeds into market-simulator.ts to replace hardcoded slippage). Integrates with Trade Forensics for execution attribution. | ğŸ”´ |

---

## ğŸ”´ Live Engine Layer (`src/lib/engine/`) [Phase 20]

| File | Purpose | Importance |
|------|---------|------------|
| `cortex-live-engine.ts` | **Phase 20 â€” CortexLiveEngine** (~490 lines). Central orchestrator bridging live Binance data â†” Cortex/Island engines. Boot sequence: `initialize()` â†’ `seedHistoricalData()` (500 candles per slot) â†’ `subscribeStreams()` (kline + ticker WS) â†’ `wireCallbacks()`. Candle aggregation, island routing, snapshot refresh callbacks. Exposes ADFI + CIRPN getter methods. | ğŸ”´ |
| `evolution-scheduler.ts` | **Phase 20 â€” Evolution Scheduler** (~200 lines). Autonomous evolution trigger after N candles collected per island. Configurable intervals and thresholds. | ğŸŸ¡ |
| `adaptive-data-flow.ts` | **Phase 20 â€” ADFI (Adaptive Data Flow Intelligence)** (~420 lines). Gap detection + auto-repair, flow telemetry (throughput, latency, reconnects, uptime), adaptive kline evolution (resolution adjustment). `DataFlowTelemetry` interface: candlesProcessedPerMinute, avgCandleLatencyMs, gapsDetected/Repaired/Pending, reconnectCount, uptimeMs. | ğŸ”´ |
| `regime-propagation.ts` | **Phase 20 â€” CIRPN (Cross-Island Regime Propagation Network)** (~380 lines). Pair correlation tracking, leader/follower detection, regime arrival prediction, propagation warnings with ETA. `PropagationNetworkStatus` interface: totalRegimeEvents, leaderPairs, followerPairs, activeWarnings, knownRelationships. | ğŸ”´ |
| `stress-matrix.ts` | **Phase 27+30 — Market Scenario Stress Matrix (MSSM)** (~420 lines). 5 canonical scenarios. **Phase 30 PFLM Upgrade**: `prepareScenarios()` pre-generates candles+caches ONCE. `batchStressMatrix()` shares IndicatorCaches across all strategies (~5× faster). RRS formula: `avgFitness × (1 - normalizedVariance) × consistencyBonus`. | 🔴 |
| `adaptive-stress.ts` | **Phase 30 — Adaptive Stress Calibration (ASC)** (~318 lines). **RADICAL INNOVATION**: Regime-weighted scenario scoring. `AdaptiveStressCalibrator` class dynamically adjusts scenario weights based on detected regime + MRTI predictions. Calibrated RRS blends into fitness (70% backtest + 30% CRRS). 5 regime weight matrices. Dashboard-exportable `StressCalibrationState`. | 🔴 |
| `testnet-session-orchestrator.ts` | **Phase 31 — Testnet Session Orchestrator (TSO)** (~370 lines). **RADICAL INNOVATION**: 5-phase lifecycle (PROBE→SEED→EVOLVE→TRADE→REPORT). Safety interlocks: max loss %, max duration, max positions. Session report with trade log, PnL, execution quality. Singleton via `getSessionOrchestrator()`. | 🔴 |

---

## 🌐 Trading Session API (`src/app/api/trading/`) [Phase 31]

| File | Purpose | Importance |
|------|---------|------------|
| `testnet-probe/route.ts` | **Phase 31 — Testnet Probe API** (~210 lines). GET endpoint — 6-point pre-flight check (credentials, testnet mode, REST reachability, time sync, account access, exchange info). Returns `TestnetProbeResult` with per-check latency. | 🔴 |
| `session/route.ts` | **Phase 31 — Session Control API** (~155 lines). POST (start session with config), GET (session status), DELETE (graceful stop + report). Wires into `TestnetSessionOrchestrator`. | 🔴 |
| `status/route.ts` | **Phase 27 — Trading Telemetry API** (~151 lines). GET endpoint — active positions, execution quality, risk status, auto-trade config. Real-time introspection. | 🟡 |


## ğŸ¤– Pipeline Live Integration Layer (`src/lib/`) [Phase 21]

| File | Purpose | Importance |
|------|---------|------------|
| `hooks/usePipelineLiveData.ts` | **Phase 21 â€” Pipeline Live Data Bridge** (~540 lines). Custom React hook connecting pipeline panels to live Cortex/Island state. Dual-mode: LIVE (CortexLiveEngine active) / DEMO (fallback generators). 3-second polling via `useCallback` + `useRef` interval. Island selector support. Derives: GenerationData[], ValidationGate[], RosterEntry[], ReplayCellData[], PipelineStage[], LiveTelemetrySnapshot, LivePropagationSnapshot, GenomeHealthSnapshot. | ğŸ”´ |
| `hooks/useBrainLiveData.ts` | **Neural Brain Live Data Hook** (~830 lines). Custom React hook connecting holographic brain visualization to live Cortex/Island neuron state. Manages impulse data, neuron activity mapping, and heatmap updates. | 🟡 |
| `engine/evolution-health.ts` | **Phase 21 â€” Evolution Health Analyzer** (~300 lines). **RADICAL INNOVATION**: Exposes HIDDEN EvolutionEngine intelligence. `computeGenomeHealth(island)` â†’ `GenomeHealthSnapshot`: diversity index, stagnation level, convergence risk (composite 0-1), fitness trajectory (linear regression slope), gene dominance histogram (top 10 IndicatorTypes with trends), auto-intervention detection (mutation rate changes), A-F health grading. Stateless â€” pure computation, no side effects. | ğŸ”´ |

---

## ⚙️ Production Infrastructure Layer (`src/lib/config/`, `src/lib/utils/`) [Phase 29]

| File | Purpose | Importance |
|------|---------|------------|
| `config/env-validator.ts` | **Environment Validator** (~173 lines). Fail-fast boot config. Validates all required env vars (Binance, Supabase, Overmind), typed `ValidatedEnv` singleton via `getEnv()`. Key format validation, testnet safety, MAINNET warning. | 🔴 |
| `config/deployment-sentinel.ts` | **Phase 29 — Deployment Sentinel** (~283 lines). **RADICAL INNOVATION**: 12-point deployment readiness checker. Env, Supabase probe, Binance ping, security headers, build hash, testnet mode, TS strict, error boundary. `DeploymentReadinessReport`. | 🔴 |
| `config/heartbeat-monitor.ts` | **Heartbeat Monitor** — Health check infrastructure for `/api/health`. Tracks subsystem health, request metrics, latency P95. | 🟡 |
| `utils/logger.ts` | **Phase 29 — Structured Logger** (~218 lines). 4 levels (DEBUG/INFO/WARN/ERROR), module tags, env-aware suppression. 14 pre-built loggers. | 🔴 |

---

## ğŸ›¡ï¸ Risk Layer (`src/lib/risk/`)

| File | Purpose | Importance |
|------|---------|------------|
| `manager.ts` | Risk management engine with 8 hardcoded safety rails. Validates every trade against position size, leverage, drawdown limits, and mandatory stop-loss. **Phase 22**: `getRiskSnapshot()` returns serializable state (8 rail configs, utilizations, emergency stop, PnL, global risk score). RiskManager singleton wired into Cortex (constructor, recordTrade, emergencyStopAll, getSnapshot). Rules are **non-overridable** and operate **GLOBALLY across all islands**. | ğŸ”´ |

---

## ğŸ§ª Test Infrastructure Layer [Phase 22]

| File | Purpose | Importance |
|------|---------|------------|
| `vitest.config.ts` | Vitest configuration with `vite-tsconfig-paths` for `@/` alias resolution, node environment, coverage reporter for risk/engine modules. | ğŸŸ¡ |
| `src/lib/risk/__tests__/manager.test.ts` | **RiskManager 8-Rail Test Suite** (37 tests). All 8 NON-NEGOTIABLE safety rails, `getRiskSnapshot()`, `recordTradeResult()`, `resetDaily()`, + **Safety Rail Mutation Boundary Tests** (radical innovation: probes exact threshold edges â€” 1.99% vs 2.01% risk, 10x vs 10.1x leverage, 4.9% vs 5.1% daily DD). Factory fixtures for StrategyDNA, Position, Trade. | ğŸ”´ |
| `src/lib/engine/__tests__/cortex-risk.test.ts` | **Cortex Risk Integration Tests** (3 tests). Validates riskSnapshot presence in getSnapshot(), correct structure, emergencyStopAll() wiring. | ğŸ”´ |
| `src/lib/hooks/__tests__/risk-derivation.test.ts` | **Risk Snapshot Derivation Tests** (5 tests). Null safety, data passthrough, emergency stop state, high risk score propagation. | ğŸŸ¡ |

---

## ğŸ“¦ State & Persistence Layer (`src/lib/store/` + `src/lib/db/`)

| File | Purpose | Importance |
|------|---------|------------|
| `store/index.ts` | 6 Zustand stores: `useBrainStore` (AI state/evolution/validation), `useCortexStore` (multi-island orchestration, 12 actions), `usePortfolioStore` (balance/positions, IndexedDB persist), `useTradeStore` (persistent trade history, IndexedDB dual-write), `useMarketStore` (live tickers), `useDashboardConfigStore` (persistent UI config). | ğŸŸ¡ |
| `store/persistence.ts` | **Phase 13 â€” IndexedDB Persistence Layer** (~480 lines). 6 object stores (trades, strategies, evolution_snapshots, forensic_reports, portfolio_snapshots, engine_state), `createIndexedDBStorage()` Zustand adapter, `startAutoCheckpoint()` scheduler, full CRUD for all data types, `getStorageStats()`, `clearAllData()`. | ğŸ”´ |
| `db/supabase.ts` | **Phase 14 â€” Supabase Cloud Database Client** (~340 lines). PostgreSQL cloud client with graceful degradation (returns null if env vars missing). Full CRUD: `cloudSaveTrade()`, `cloudSaveStrategies()`, `cloudSaveEvolutionSnapshot()`, `cloudSaveForensicReport()`, `cloudSavePortfolioSnapshot()`, `cloudSaveEngineCheckpoint()`, `cloudLoadEngineCheckpoint()`, `cloudGetStats()`. JSONB data pattern for full object storage. | ğŸ”´ |

---

## ğŸ¨ Presentation Layer (`src/app/`)

| File | Purpose | Importance |
|------|---------|------------|
| `page.tsx` | Main dashboard page. Contains 9 panel components (including **CortexNeuralMapPanel** for live island visualization) + `useAnimatedValue` hook + demo data generators. ~1300 lines. Gradient card accents, stagger fade-in, animated counters. | ğŸŸ¡ |
| `brain/page.tsx` | **Phase 18 â€” Neural Brain Visualization** (~675 lines). Holographic JARVIS-style 3D cortex: 10 neuron nodes (hex wireframe inner + circle wireframe outer), 15 synapses with animated signal propagation, CSS 3D perspective, scanline overlay, hex grid background, HUD system (Stats bar + Target Lock + Consciousness Arc), floating data particles, Multi-Color Memory Trace Heatmap (10 HSLA hues per row), biological refractory period (800ms cooldown). | ğŸŸ¡ |
| `pipeline/page.tsx` | **Pipeline Dashboard**. 12 panels: Pipeline Flow (7-stage animated), Generation Fitness (area chart), 4-Gate Validation (animated gates), Strategy Roster (radar), Experience Replay (heatmap), **Gene Lineage Tree** (family tree), **Gene Survival Heatmap** (persistence grid), **Decision Explainer** (regime reasoning), **Overmind Intelligence Hub**, **Live Pulse Telemetry** (ADFI+CIRPN, LIVE mode), **Evolution Heartbeat** (convergence detector, LIVE mode), **Risk Shield** (Risk Fortress: Global Risk Score ring, 8-rail matrix, Daily PnL). Live state machine + dual-mode (LIVE/DEMO) + island selector. ~3730 lines. | ğŸŸ¡ |
| `globals.css` | Premium design system. CSS custom properties for dark glassmorphism theme + gradient accents, stagger animations, neural map styles, pipeline stages, archaeology panels, **holographic brain theme** (3D canvas, scanlines, hex grid, neuron wireframes, synapse animations, HUD, consciousness arc, heatmap multi-color). ~2580 lines. | ğŸŸ¡ |
| `layout.tsx` | Root layout. Google Fonts (Inter, JetBrains Mono), SEO metadata. | ğŸŸ¢ |
| `error.tsx` | **Root Error Boundary** (~146 lines). Next.js error recovery UI with crash details and retry functionality. | 🟢 |

---

## âš™ï¸ Configuration (Root)

| File | Purpose | Importance |
|------|---------|------------|
| `package.json` | Dependencies: next, react, zustand, recharts, lucide-react, uuid | ğŸŸ¡ |
| `tsconfig.json` | TypeScript strict mode, path aliases (`@/`) | ğŸŸ¢ |
| `next.config.ts` | Next.js configuration | ğŸŸ¢ |
| `.gitignore` | Git ignore rules | ğŸŸ¢ |
| `.env.local` | Environment variables (API keys, testnet toggle) â€” **NOT in git** | ğŸŸ¡ |

---

## ğŸ§  Memory Layer (`memory/`)

| File | Purpose | Importance |
|------|---------|------------|
| `overview.md` | Project identity, tech stack, architecture brief, critical rules | ğŸ”´ |
| `active_context.md` | Dynamic state tracker: phase, AI Brain status, completed/pending work | ğŸ”´ |
| `architecture/system_design.md` | Module dependency graph, data flow, store architecture, patterns | ğŸŸ¡ |
| `file_map.md` | This file â€” resource navigator | ğŸŸ¡ |
| `adr/001-ga-over-rl.md` | ADR: Genetic Algorithm over Reinforcement Learning | ğŸŸ¢ |
| `adr/002-anti-overfitting-pipeline.md` | ADR: 4-Gate Validation Pipeline for anti-overfitting | ğŸŸ¢ |
| `adr/003-island-model-architecture.md` | ADR: Multi-Pair Multi-Timeframe Island Model | ğŸŸ¢ |
| `adr/004-meta-evolution-ga2.md` | ADR: Meta-Evolution (GAÂ²) â€” second-layer GA for per-island HyperDNA optimization | ğŸŸ¢ |
| `adr/005-strategy-archaeology.md` | ADR: Strategy Archaeology â€” Explainable AI for genetic strategy evolution (Gene Lineage + Gene Survival + Decision Explainer) | ğŸŸ¢ |
| `adr/006-advanced-genome.md` | ADR: Advanced Strategy Genome Architecture â€” 5 evolvable gene families, composite function evolution, directional change framework, structural novelty bonus | ğŸŸ¢ |
| `adr/009-neural-brain-visualization.md` | ADR: Neural Brain Visualization Architecture â€” Holographic 3D cortex, biological refractory period, multi-color HSLA heatmap | ğŸŸ¢ |
| `adr/010-atomic-order-lifecycle.md` | ADR: Atomic Order Lifecycle Engine â€” 13-state machine, mandatory SL invariant, Adaptive Rate Governor, Execution Quality Tracker | ğŸŸ¢ |
| `changelog.md` | Version history | ğŸŸ¢ |
| `_SYNC_CHECKLIST.md` | End-of-session verification checklist | ğŸŸ¡ |
| `_FINGERPRINT.json` | Context DNA Fingerprint â€” SHA-256 hashes of all source + memory files, cross-reference matrix, structural integrity record | ğŸŸ¡ |
| `scripts/context-fingerprint.js` | Context DNA Fingerprint CLI tool â€” `--generate`, `--verify`, `--report` commands for drift detection | ğŸŸ¡ |

---

## ğŸ› ï¸ Scripts (`scripts/`)

| File | Purpose | Importance |
|------|---------|------------|
| `validate-skills.js` | **Skill Integrity Validator** (~252 lines). Detects orphaned source files, stale skill references, and missing/one-way cross-links. Self-auditing knowledge graph. | ğŸ”´ |
| `generate-skill-map.js` | **Skill Auto-Activation Intelligence** (~330 lines). Static import analysis builds `skill-map.json` (fileâ†’skill index) + `skill-graph.md` (Mermaid DAG). Transforms passive skills into active intelligence. | ğŸ”´ |
| `git-guardian.js` | **Git Guardian Pre-Commit Hook** (~210 lines). 3-gate validation: secret pattern detection (100+ regex), file size limit (500KB), JSON syntax validation. Blocks commits containing API keys or large files. | ğŸ”´ |
| `commit-msg-validator.js` | **Commit Message Convention** (~110 lines). Enforces `type(scope): description` format. Validates type (feat, fix, docs, etc.) and min description length. | ğŸŸ¡ |
| `install-hooks.js` | **Git Hook Auto-Installer** (~130 lines). Cross-platform `pre-commit` + `commit-msg` hook installation. Creates executable scripts in `.git/hooks/`. | ğŸŸ¡ |
| `memory-health.js` | **Memory Health Dashboard**. Diagnostic tool showing memory freshness, file map coverage, ADR gaps, skill health. | ğŸŸ¡ |

---

## ğŸ¤– Workflows (`.agent/workflows/`)

| File | Purpose | Importance |
|------|---------|------------|
| `memory-reload.md` | `/memory-reload` â€” 7-step context hydration for new sessions | ğŸ”´ |
| `memory-sync.md` | `/memory-sync` â€” 9-step end-of-session memory persistence | ğŸ”´ |

---

## ğŸ§© Agent Skills (`.agent/skills/`)

| Skill | Files | Purpose | Importance |
|-------|-------|---------|------------|
| `learner-conventions` | `SKILL.md` | Development flags, TS patterns, Zustand conventions, memory sync protocol | ğŸ”´ |
| `evolution-engine` | `SKILL.md`, `references/dna-schema.md` | GA operations: DNA genome, crossover, mutation, tournament selection, generation lifecycle | ğŸ”´ |
| `risk-management` | `SKILL.md` | 8 non-negotiable safety rails, validation flow, forbidden modifications, emergency stop | ğŸ”´ |
| `anti-overfitting-validation` | `SKILL.md` | 4-Gate validation pipeline: Walk-Forward Analysis, Monte Carlo permutation, Deflated Sharpe, regime detection, composite overfitting score | ğŸ”´ |
| `meta-evolution` | `SKILL.md` | GAÂ² architecture: HyperDNA genome, meta-fitness evaluation, meta-crossover, stability guard, fitness weight optimization | ğŸ”´ |
| `dashboard-development` | `SKILL.md` | Ultra-premium UI engineering: design system reference, panel architecture, typography scale, Recharts standards, component patterns, forbidden patterns | ğŸ”´ |
| `data-visualization` | `SKILL.md` | Financial chart engineering: chart selection guide, 5 chart patterns (equity, sparkline, radar, histogram, donut), heatmap, performance rules | ğŸ”´ |
| `multi-island-ui` | `SKILL.md` | Cortex dashboard: Island Card component (+CSS), Grid Panel, Migration Log, Capital Allocation, Correlation Guard, Control Bar | ğŸ”´ |
| `motion-design` | `SKILL.md` | Animation engineering: timing/easing reference, state transitions, skeletons, counter animation, stagger, ping, reduced motion | ğŸŸ¡ |
| `binance-integration` | `SKILL.md`, `references/api-endpoints.md` | Binance Futures REST/WebSocket endpoints, authentication, error handling, rate limiting | ğŸŸ¡ |
| `performance-analysis` | `SKILL.md`, `references/fitness-formula.md` | Composite fitness formula, individual metric calculations, normalization, ranking | ğŸŸ¡ |
| `regime-intelligence` | `SKILL.md` | MRTI predictive engine: Markov chain, early-warning signals, PSPP bridge, pre-warming lifecycle | ğŸ”´ |
| `strategic-overmind` | `SKILL.md` | Strategic Overmind: 6-phase cycle, CCR, PSPP, OpusClient, 15 sub-engines, adversarial testing | ğŸ”´ |
| `hybrid-persistence` | `SKILL.md` | Hybrid dual-write persistence: PersistenceBridge, IndexedDB, Supabase, cloud-first hydration | ğŸ”´ |
| `trade-forensics` | `SKILL.md` | Trade Forensics: TradeBlackBox, ForensicAnalyzer, Bayesian learning, fitness modifier feedback | ğŸ”´ |

---

## ğŸ§© Auto-Generated Files (`.agent/`)

| File | Purpose | Importance |
|------|---------|------------|
| `skill-map.json` | Machine-readable fileâ†’skill index (auto-generated by `generate-skill-map.js`). 55 file mappings with primary/secondary/conventions priorities. | ğŸ”´ |
| `skill-graph.md` | Mermaid DAG of skill dependencies (auto-generated). 16 nodes, 76 edges, 5 color-coded layers. | ğŸŸ¡ |

---

## ğŸ§ª Test & Verification Layer (`src/lib/*/__tests__/`)

| File | Purpose | Tests | Importance |
|------|---------|------:|------------|
| `risk/__tests__/manager.test.ts` | RiskManager: all 8 NON-NEGOTIABLE safety rails + `getRiskSnapshot()` + `recordTradeResult()` + `resetDaily()` + Safety Rail Mutation Boundary Tests (radical innovation: probe exact threshold edges) | 37 | ğŸ”´ |
| `engine/__tests__/cortex-risk.test.ts` | Cortex-RiskManager integration: riskSnapshot in getSnapshot(), correct structure, emergencyStopAll wiring | 3 | ğŸ”´ |
| `hooks/__tests__/risk-derivation.test.ts` | Risk derivation from live data: null safety, data passthrough, emergency stop state, risk score propagation | 5 | ğŸŸ¡ |
| `engine/__tests__/validation-pipeline.test.ts` | [Phase 25] Walk-Forward Analysis (rolling, anchored, degradation), Monte Carlo (permutation, equity curve), DSR, Overfitting Detector (5 components: WFA efficiency, MC significance, complexity, regime diversity, consistency) | 26 | ğŸ”´ |
| `engine/__tests__/migration-engine.test.ts` | [Phase 25] Migration affinity calculation (6 tiers: same pair+TF combo to fully different), adaptMigrant (metadata reset, slot reassignment, fitness zeroing, gene structure preservation) | 10 | ğŸŸ¡ |
| `engine/__tests__/advanced-genes.test.ts` | [Phase 25] Microstructure genes (generation, VOLUME_PROFILE signals, crossover, mutation per 5 types), Price Action genes (generation, candlestick signals, all pattern types, crossover, mutation, 100-cycle GA invariant stability) | 16 | ğŸ”´ |
| `engine/__tests__/evaluator.test.ts` | [Phase 25] Performance evaluation: Sharpe ratio, WinRate, ProfitFactor, fitness scoring (0-100 bounds), novelty bonus (advanced gene presence), deflated fitness, max drawdown/streaks (tested via public evaluatePerformance API) | 10 | ğŸ”´ |
| `engine/__tests__/signal-engine.test.ts` | [Phase 25] Signal engine: SMA/EMA/RSI/MACD/Bollinger/ATR indicator calculations (valid-only array lengths), signal rule evaluation (ABOVE/BELOW/AND/OR logic), full strategy pipeline (StrategyDNAâ†’candlesâ†’TradeSignal) | 14 | ğŸ”´ |
| `engine/__tests__/confluence-genes.test.ts` | [Phase 25] Confluence gene operations: generation, crossover, mutation, multi-timeframe alignment | 24 | ğŸŸ¡ |
| `engine/__tests__/property-fuzzer.test.ts` | [Phase 25] **RADICAL INNOVATION**: 7-category Property-Based Fuzzing Harness â€” GA Operator Invariants (100/1000-iteration stress), Signal Engine Monotonicity (RSI/BB/ATR bounds), Evaluator Consistency (win>loss, fitness bounds), WFA Symmetry (determinism, clamping), Overfitting Monotonicity, Migration Affinity Algebra (reflexive, symmetric), **Chaos Monkey** (zero-price/negative-volume/flash-crash/flat-price/single-candle resilience) | 30 | ğŸ”´ |
| `engine/__tests__/integration-e2e.test.ts` | [Phase 27] **E2E Integration Test Suite** (~790 lines, 33 tests). 8-category comprehensive integration testing: Full Backtest Pipeline (5: runBacktest â†’ trades, equity, metrics, random strategy resilience), Batch PFLM (4: cache consistency, quickFitness), Evolution Cycle (4: genesisâ†’evaluateâ†’evolve across 5 gens), Market Scenarios (4: bull/bear/sideways/high-vol), Signal Logic (4: regime detection, position context), HTF Aggregation (4: M15â†’H1, volume, lower TF guard), Fitness Convergence (3: elitism, mutation), Edge Cases (5: min candles, empty data, missing indicators). Deterministic strategy factory + 4 realistic market data generators. | 33 | ğŸ”´ |

**Total: 211 tests across 11 files (1.77s, 0 failures)**

---

## ğŸŒ API Routes Layer (`src/app/api/`)

| File | Purpose | Importance |
|------|---------|------------|
| `binance/order/route.ts` | Binance order placement + cancellation API route. POST (place), DELETE (cancel). | ğŸ”´ |
| `binance/position/route.ts` | Binance position risk query API route. GET. | ğŸŸ¡ |
| `binance/account/route.ts` | Binance account balance query API route. GET. | ğŸŸ¡ |
| `binance/depth/route.ts` | Binance order book depth API route. GET. | ğŸŸ¢ |
| `trading/status/route.ts` | **Phase 26 â€” Trading Telemetry Endpoint** (~150 lines). Returns real-time auto-trade state, active positions array, execution quality stats (slippage, latency, fill ratio), risk capacity metrics, engine operational status. Used by dashboard for live trade monitoring. | ğŸ”´ |

---

*Last Updated: 2026-03-08 19:15 (UTC+3) â€” Memory Integrity Audit: 15 orphan files registered*
