---
name: strategic-overmind
description: Activate when working on the Strategic Overmind (Opus 4.6 AI layer), 6-phase reasoning cycle (OBSERVE/ANALYZE/HYPOTHESIZE/DIRECT/VERIFY/LEARN), hypothesis engine, evolution director, adversarial co-evolution testing, emergent indicator discovery, RSRD strategy decomposition, pair specialist profiling, Counterfactual Causal Replay (CCR — episodic memory, counterfactual engine, meta-cognition), Predictive Strategic Pre-Positioning (PSPP — predictive orchestrator, MRTI bridge), Opus API client, prompt engineering, response parsing, reasoning journal, or any higher-order AI reasoning code in the Learner trading system.
---

# Strategic Overmind — Opus 4.6 Higher-Order AI

> **Expert Council**: Rich Sutton (Predictive AI), Marcos López de Prado (Quant Meta-Learning), Andrew Lo (Adaptive Markets), Nassim Taleb (Antifragile Systems), David Silver (Meta-Cognition), Ray Dalio (Macro Strategy)

## 🧠 Core Concept

The Strategic Overmind is the **Level 3 intelligence** in the Learner hierarchy:

```
Level 1: Genetic Algorithm (GA)     → Evolves trading strategies
Level 2: Meta-Evolution (GA²)       → Evolves evolution parameters
Level 3: Strategic Overmind (Opus)   → Reasons about the ENTIRE system
```

It is **NOT** a replacement for GA — it's an AI supervisor that uses Claude Opus 4.6's reasoning capabilities to:
1. Generate **market hypotheses** that guide evolution
2. Issue **evolution directives** (mutation/crossover/gene suggestions)
3. Stress-test strategies via **adversarial co-evolution**
4. Discover **emergent indicators** from strategy patterns
5. Decompose successful strategies via **RSRD synthesis**
6. Profile pair-specific behaviors via **Pair Specialist**
7. Learn from past decisions via **Counterfactual Causal Replay (CCR)**
8. Anticipate regime changes via **Predictive Strategic Pre-Positioning (PSPP)**

---

## 🔄 6-Phase Cycle

```
┌─────────────────────────────────────────────────────────────┐
│  OVERMIND CYCLE (triggered by Cortex after meta-evolution)  │
│                                                             │
│  Phase 1: OBSERVE                                           │
│    └─ Build OvermindIslandContext for each island           │
│    └─ PSPP: Ingest MRTI forecasts → pre-position actions   │
│                                                             │
│  Phase 2: ANALYZE                                           │
│    └─ PairSpecialist generates/caches pair profiles         │
│    └─ Opus 4.6 analyzes pair characteristics                │
│                                                             │
│  Phase 3: HYPOTHESIZE                                       │
│    └─ HypothesisEngine generates market hypotheses          │
│    └─ PSPP: Merge pre-positioning hypotheses for predicted  │
│       regimes into the hypothesis pool                      │
│    └─ Record hypothesis episodes in EpisodicMemory          │
│                                                             │
│  Phase 4: DIRECT                                            │
│    └─ EvolutionDirector generates mutation/crossover/gene   │
│       suggestions per-island                                │
│    └─ Record directive episodes in EpisodicMemory           │
│                                                             │
│  Phase 5: VERIFY                                            │
│    └─ AdversarialTester stress-tests top strategies         │
│    └─ EmergentIndicatorEngine detects novel patterns        │
│    └─ StrategyDecomposer performs RSRD on top strategies    │
│                                                             │
│  Phase 6: LEARN                                             │
│    └─ MetaCognition analyzes past episodes                  │
│    └─ CounterfactualEngine generates alternative paths      │
│    └─ Self-improvement rate calculated                      │
│    └─ Resolve pending pre-position predictions              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Sub-Engine Architecture (15 Modules)

### Core Orchestration

| Module | File | Lines | Purpose |
|--------|------|-------|---------|
| **StrategicOvermind** | `strategic-overmind.ts` | ~805 | 6-phase cycle orchestrator, singleton, getSnapshot() |
| **OpusClient** | `opus-client.ts` | ~315 | Opus 4.6 API (singleton, adaptive thinking, token budget) |
| **PromptEngine** | `prompt-engine.ts` | ~500 | System/user prompt construction for all sub-engines |
| **ResponseParser** | `response-parser.ts` | ~220 | 4-tier JSON extraction from LLM responses |
| **ReasoningJournal** | `reasoning-journal.ts` | ~150 | Decision reasoning log for transparency |

### Hypothesis & Direction

| Module | File | Lines | Purpose |
|--------|------|-------|---------|
| **HypothesisEngine** | `hypothesis-engine.ts` | ~341 | Generate/track/retire/seed market hypotheses |
| **EvolutionDirector** | `evolution-director.ts` | ~275 | Mutation, crossover, gene proposal directives |
| **PairSpecialist** | `pair-specialist.ts` | ~340 | Pair-specific behavioral profiling via Opus |

### Verification & Discovery

| Module | File | Lines | Purpose |
|--------|------|-------|---------|
| **AdversarialTester** | `adversarial-tester.ts` | ~378 | ACE stress testing (scenarios + resilience) |
| **EmergentIndicatorEngine** | `emergent-indicator.ts` | ~210 | Discover novel indicator patterns |
| **StrategyDecomposer** | `strategy-decomposer.ts` | ~290 | RSRD: decompose successful strategies |

### CCR — Counterfactual Causal Replay (Innovation #4)

| Module | File | Lines | Purpose |
|--------|------|-------|---------|
| **EpisodicMemory** | `episodic-memory.ts` | ~358 | Store/retrieve past decision episodes |
| **CounterfactualEngine** | `counterfactual-engine.ts` | ~463 | Generate "what if?" alternatives + causal insights |
| **MetaCognitionLoop** | `meta-cognition.ts` | ~486 | Self-reflection, meta-insights, self-improvement rate |

### PSPP — Predictive Strategic Pre-Positioning (Innovation #6)

| Module | File | Lines | Purpose |
|--------|------|-------|---------|
| **PredictiveOrchestrator** | `predictive-orchestrator.ts` | ~360 | MRTI → Overmind bridge, forecast → pre-position → track |

---

## 🔌 OpusClient: API Integration

**Singleton** — one client across the entire system.

### Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `analyze(system, user, opts)` | Raw text response | `OpusResponse \| null` |
| `analyzeWithSchema<T>(system, user, validator, opts)` | Typed structured response | `OpusResponse<T> \| null` |
| `isAvailable()` | API key + budget check | `boolean` |
| `getEstimatedCostUSD()` | Cost tracking | `number` |

### Budget Management

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `tokenBudgetPerHour` | 100,000 | Hourly cap |
| `maxTokensPerCall` | 32,000 | Per-call cap |
| `maxCallsPerHour` | 30 | Rate limit |
| `adaptiveThinkingBudget` | 10,000 | Thinking tokens for deep reasoning |

### Graceful Degradation
When Opus is unavailable (no API key, budget exhausted, API error), ALL sub-engines fall back to heuristic-only mode. **The system NEVER crashes due to Opus unavailability.**

---

## 📡 PSPP: Predictive Strategic Pre-Positioning

### Data Flow

```
MRTI forecast → PredictiveOrchestrator.evaluateForecasts()
  ├─ transitionRisk < 0.35 → HOLD (no action)
  ├─ transitionRisk 0.35-0.65 → PREPARE (pre-seed hypotheses)
  └─ transitionRisk > 0.65 → SWITCH (aggressive pre-positioning)
       ↓
  generatePrePositionHypotheses()
       → MarketHypothesis[] merged into HYPOTHESIZE phase
       ↓
  Prediction tracked → resolvePrediction() when regime changes
       → PredictionAccuracy updated
       → EpisodicMemory episode recorded for CCR learning
```

### Key Types

| Type | Purpose |
|------|---------|
| `PrePositionAction` | Single pre-positioning action (slotId, risk, predicted regime, status) |
| `PredictionRecord` | Historical prediction entry for accuracy tracking |
| `PredictionAccuracy` | Aggregate accuracy stats (overall + per-regime) |

### Regime → Indicator Bias

| Predicted Regime | Preferred Indicators |
|-----------------|---------------------|
| TRENDING_UP/DOWN | EMA, MACD, ADX |
| RANGING | RSI, BOLLINGER, STOCH_RSI |
| HIGH_VOLATILITY | ATR, BOLLINGER, ADX |
| LOW_VOLATILITY | RSI, EMA, STOCH_RSI |

---

## 🔮 CCR: Counterfactual Causal Replay

### Episode Lifecycle

```
1. Decision made (hypothesis/directive) → EpisodicMemory.recordEpisode()
2. Outcome observed → EpisodicMemory.resolveOutcome()
3. CounterfactualEngine.analyze() → generates alternative paths
4. MetaCognitionLoop.reflect() → synthesizes meta-insights
5. Self-improvement rate calculated from episode outcomes
```

### Key Metrics (in OvermindSnapshot)

| Metric | Source |
|--------|--------|
| `episodicMemorySize` | Episodes stored |
| `metaInsightsActive` | Active meta-cognitive insights |
| `selfImprovementRate` | % improvement from CCR learning |
| `counterfactualsGenerated` | Total "what if" analyses |
| `activePrePositions` | PSPP actions in progress |
| `predictionAccuracyRate` | PSPP prediction accuracy |
| `imminentTransitions` | Islands with imminent regime change |

---

## ⚠️ Critical Rules

1. **NEVER bypass OpusClient** — all sub-engines MUST use `OpusClient.analyze()` or `analyzeWithSchema()`
2. **NEVER store API keys in code** — `ANTHROPIC_API_KEY` comes from `.env.local`
3. **ALWAYS handle null returns** — Opus can be unavailable, every call returns nullable
4. **NEVER modify the 6-phase order** — OBSERVE → ANALYZE → HYPOTHESIZE → DIRECT → VERIFY → LEARN is strict
5. **ALWAYS record episodes** — every hypothesis and directive must go through EpisodicMemory
6. **PSPP thresholds are configurable** — never hardcode `0.35` / `0.65`, use config
7. **OpusClient is a singleton** — use `getInstance()`, never `new OpusClient()`
8. **Token budget is sacred** — never override hourly limits
9. **OvermindSnapshot must be complete** — every new metric needs a snapshot field
10. **Episode outcomes MUST be resolved** — unresolved episodes create memory leaks

---

## 📁 Key Files

- `src/lib/engine/overmind/strategic-overmind.ts` → Main orchestrator (6-phase cycle)
- `src/lib/engine/overmind/opus-client.ts` → Opus 4.6 API client (singleton)
- `src/lib/engine/overmind/prompt-engine.ts` → Prompt construction
- `src/lib/engine/overmind/response-parser.ts` → 4-tier JSON extraction
- `src/lib/engine/overmind/reasoning-journal.ts` → Decision log
- `src/lib/engine/overmind/hypothesis-engine.ts` → Market hypotheses
- `src/lib/engine/overmind/evolution-director.ts` → GA directives
- `src/lib/engine/overmind/pair-specialist.ts` → Pair profiling
- `src/lib/engine/overmind/adversarial-tester.ts` → ACE stress testing
- `src/lib/engine/overmind/emergent-indicator.ts` → Novel indicators
- `src/lib/engine/overmind/strategy-decomposer.ts` → RSRD synthesis
- `src/lib/engine/overmind/episodic-memory.ts` → CCR episode storage
- `src/lib/engine/overmind/counterfactual-engine.ts` → CCR "what if" analysis
- `src/lib/engine/overmind/meta-cognition.ts` → CCR self-reflection
- `src/lib/engine/overmind/predictive-orchestrator.ts` → PSPP bridge
- `src/types/overmind.ts` → ALL Overmind types (~830 lines)
- `src/app/pipeline/page.tsx` → Intelligence Hub + Regime Transition Radar

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `evolution-engine` | Controlled | Overmind directives guide GA mutation/crossover |
| `meta-evolution` | Peer | Both optimize the system at different levels |
| `regime-intelligence` | Data Source | MRTI forecasts feed PSPP pre-positioning |
| `performance-analysis` | Input | Fitness scores drive hypothesis generation |
| `anti-overfitting-validation` | Downstream | Validated strategies enter adversarial testing |
| `backtesting-simulation` | Evaluation | Backtests provide fitness data for directives |
| `risk-management` | Safety Layer | Overmind respects all 8 risk rails |
| `dashboard-development` | Consumer | Intelligence Hub panel displays Overmind data |
| `multi-island-ui` | Consumer | Per-island Overmind metrics in Cortex view |
| `learner-conventions` | Standard | All Overmind code follows project conventions |
| `hybrid-persistence` | Storage | Episodes + predictions persisted via bridge |
| `trade-forensics` | Downstream | Forensics enriches episode context |
