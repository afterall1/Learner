---
description: Full context hydration for new sessions — loads the 5-layer memory hierarchy
---

# /memory-reload — Context Hydration Workflow

> Execute this at the **start of every new session** to achieve full mental model alignment with the Learner project.

// turbo-all

## Step 1: Project Identity & Tech Stack

Read the project overview to understand what Learner is, its tech stack, architecture, and critical rules:

```
cat memory/overview.md
```

**After reading**, confirm you understand:
- Learner is a self-evolving AI trading system for Binance Futures
- It uses Genetic Algorithms (NOT Reinforcement Learning)
- **Island Model GA**: Each pair+timeframe has its own isolated evolution engine
- **Meta-Evolution (GA²)**: Second-layer GA optimizes evolution parameters (HyperDNA) per-island
- **Advanced Strategy Genome (Phase 9)**: 5 evolvable gene families (Microstructure, Price Action, Composite Functions, Multi-TF Confluence, Directional Changes)
- Risk rails are hardcoded and non-overridable (GLOBAL across all islands)
- Paper trading + 4-Gate Validation is mandatory before live trading
- **Dashboard**: 3 pages — Main (9 panels + Cortex Neural Map) + Pipeline (8 panels + Strategy Archaeology + Overmind Hub) + Brain (Holographic Neural Cortex)
- **Strategic Overmind**: Opus 4.6 AI supervisor with 6-phase reasoning cycle (OBSERVE→ANALYZE→HYPOTHESIZE→DIRECT→VERIFY→LEARN), 15 modules, PSPP + CCR systems
- **Neural Brain Visualization**: Phase 18 — Holographic JARVIS-style 3D cortex, multi-color heatmap, biological refractory period
- **Binance Execution Layer**: Phase 19 — 7 REST methods, 4 API routes, User Data WebSocket, Account Sync, Exchange Circuit Breaker + ExchangeInfoCache
- **AOLE**: Phase 19.1 — 13-state atomic order lifecycle (Entry→SL→TP), Adaptive Rate Governor, Execution Quality Tracker

---

## Step 2: Current State & AI Brain / Cortex Status

Read the active context to understand what was done, what's pending, and the system's operational state:

```
cat memory/active_context.md
```

**After reading**, identify:
- Current development phase
- Architecture mode: Cortex (multi-island) or AIBrain (single-island)
- AI Brain / Cortex state (islands, generations, fitness, active strategies)
- Advanced Genome status (which gene families are integrated)
- Meta-Evolution status (HyperDNA, meta-generation, GA² cycle count)
- Validation pipeline status (4-Gate + Novelty Bonus)
- Dashboard status (panels, visualization components)
- Incomplete features / technical debt
- Next session priorities

---

## Step 3: System Architecture & Data Flow

Read the system design to understand module relationships, data flow, and design patterns:

```
cat memory/architecture/system_design.md
```

**After reading**, confirm you understand:
- Module dependency graph (Types → Engine → Advanced Genes → Anti-Overfitting → Island Model → Risk → Store & Persistence → Binance Execution → Overmind → Dashboard)
- Island Model architecture (Cortex → Islands → Migration → Capital Allocator)
- **Persistence Architecture**: PersistenceBridge → IndexedDB (local) + Supabase (cloud)
- **Strategic Overmind**: 6-phase cycle, OpusClient, HypothesisEngine, EvolutionDirector, AdversarialTester
- **PSPP**: PredictiveOrchestrator → MRTI forecasts → proactive strategy pre-warming
- **CCR**: EpisodicMemory + CounterfactualEngine + MetaCognition → self-improving decisions
- **Advanced Gene Signal Flow**: Microstructure/PriceAction/Composite/DC → aggregateBias + advancedConfidence
- **Meta-Evolution (GA²)**: HyperDNA → Island → Meta-Fitness → Meta-Crossover cycle
- 4-Gate Validation Pipeline (WFA → Monte Carlo → Overfitting → Regime Diversity)
- Strategy evolution pipeline (per-island, with advanced gene injection/crossover/mutation)
- Zustand store architecture (6 stores)
- Risk management integration (GLOBAL across all islands)
- Dashboard data flow (Cortex Neural Map, gradient accents, stagger animations)

---

## Step 4: File Map & Navigation

Read the file map to know where everything is:

```
cat memory/file_map.md
```

**After reading**, you should be able to locate any module by domain:
- **Types**: `types/index.ts`, `types/trading-slot.ts`
- **Core Engine**: `strategy-dna.ts`, `evaluator.ts`, `signal-engine.ts`, `evolution.ts`, `brain.ts`, `experience-replay.ts`
- **Advanced Genes**: `microstructure-genes.ts`, `price-action-genes.ts`, `composite-functions.ts`, `directional-change.ts`
- **Anti-Overfitting**: `walk-forward.ts`, `monte-carlo.ts`, `regime-detector.ts`, `overfitting-detector.ts`
- **Island Model**: `island.ts`, `cortex.ts`, `meta-evolution.ts`, `migration.ts`, `capital-allocator.ts`
- **Risk**: `manager.ts`
- **State & Persistence**: `store/index.ts` (6 stores), `store/persistence.ts` (IndexedDB), `db/supabase.ts` (cloud)
- **Persistence Bridge**: `persistence-bridge.ts` (dual-write, lazy auto-init)
- **Dashboard**: `page.tsx` (9 panels + CortexNeuralMap), `brain/page.tsx` (Holographic Neural Cortex), `pipeline/page.tsx` (8 panels + Strategy Archaeology), `globals.css` (2580+ lines), `layout.tsx`
- **Binance API**: `api/binance-rest.ts` (AdaptiveRateGovernor), `api/exchange-circuit-breaker.ts`, `api/user-data-stream.ts`, `api/account-sync.ts`, `api/order-lifecycle.ts` (AOLE), `api/execution-quality.ts`
- **API Routes**: `api/binance/order/route.ts`, `position/route.ts`, `account/route.ts`, `depth/route.ts`
- **Memory**: Overview, Active Context, System Design, File Map, ADRs (10), Changelog

---

## Step 5: Architecture Decision Records

Read the ADRs to understand WHY key decisions were made:

```
Get-ChildItem memory/adr/*.md | ForEach-Object { Write-Host "=== $($_.Name) ==="; Get-Content $_.FullName; Write-Host "" }
```

**Key ADRs**:
- **ADR-001**: GA over RL — Why genetic algorithms, not reinforcement learning
- **ADR-002**: Anti-Overfitting Pipeline — 4-Gate validation + 3-stage promotion
- **ADR-003**: Island Model Architecture — Multi-pair multi-timeframe isolated evolution
- **ADR-004**: Meta-Evolution (GA²) — Second-layer GA for per-island HyperDNA optimization
- **ADR-005**: Strategy Archaeology — Explainable AI through Gene Lineage, Gene Survival, and Decision Explainer
- **ADR-006**: Advanced Strategy Genome Architecture — 5 evolvable gene families, structural evolution, composite function evolution, directional change framework
- **ADR-007**: Hybrid Persistence Architecture — IndexedDB local cache + Supabase cloud PostgreSQL, PersistenceBridge dual-write, lazy auto-init
- **ADR-008**: Strategic Overmind Architecture — Opus 4.6 AI supervisor, 6-phase reasoning cycle, PSPP, CCR, graceful degradation
- **ADR-009**: Neural Brain Visualization Architecture — Holographic 3D cortex, biological refractory period, multi-color HSLA heatmap
- **ADR-010**: Atomic Order Lifecycle Engine — 13-state machine, mandatory SL invariant, Adaptive Rate Governor, Execution Quality Tracker

---

## Step 6: Context DNA Fingerprint Validation

Verify memory integrity before starting work. This detects drift between source code and documentation:

```
node memory/scripts/context-fingerprint.js --verify
```

**If VALID**: Memory is consistent. Proceed with confidence.
**If DRIFT DETECTED**: Review the drift report. Source files may have been modified without updating memory docs. Fix any drift before starting new work.

---

## Step 7: Agent Skills Refresh

Scan available agent skills to understand domain-specific development rules:

```
Get-ChildItem .agent/skills -Directory | ForEach-Object { Write-Host "=== $($_.Name) ==="; Get-Content "$($_.FullName)/SKILL.md" -TotalCount 5; Write-Host "" }
```

**Critical skills**: `learner-conventions` (mandatory for all code), `evolution-engine`, `risk-management`, `meta-evolution`, `anti-overfitting-validation`, `strategic-overmind`, `hybrid-persistence`, `trade-forensics`

Also check the auto-generated skill intelligence:
- `.agent/skill-map.json` — file→skill mapping (55 files, 3 priority levels)
- `.agent/skill-graph.md` — Mermaid dependency DAG (16 nodes, 76 edges)

---

## Step 8: Agent Readiness Confirmation

After completing all steps, provide the following confirmation to the user:

```markdown
## 🧠 Context Loaded — Learner

**Project**: Learner — Self-Evolving AI Trading System
**Stack**: Next.js 15 + TypeScript + Zustand + Recharts
**Phase**: [Current phase from active_context.md]
**Build**: [Build status from active_context.md]
**Dev Server**: http://localhost:3000
**Context DNA**: [VALID / DRIFT DETECTED from fingerprint]

### Architecture
- **Mode**: Cortex (multi-island) / AIBrain (single-island)
- **Active Islands**: [Count from active_context.md]
- **Meta-Evolution**: GA² [Active/Inactive], HyperDNA per-island
- **Validation**: 4-Gate Pipeline (WFA + MC + Overfitting + Regime)
- **Promotion**: Paper → Candidate → Active
- **Dashboard**: 3 pages, 18 panels total (Main 9 + Pipeline 8 + Brain 1)
- **Pipeline**: Strategy Archaeology (Gene Lineage + Gene Survival + Decision Explainer)
- **Brain Visualization**: Holographic Neural Cortex (10 neurons, 15 synapses, Memory Trace Heatmap)
- **Persistence**: Hybrid (IndexedDB local + Supabase cloud), PersistenceBridge dual-write
- **Binance Execution**: Phase 19 — 7 REST methods, 4 API routes, Circuit Breaker, User Data WS
- **AOLE**: Phase 19.1 — 13-state atomic lifecycle, Adaptive Rate Governor, Execution Quality Tracker
- **Strategic Overmind**: Opus 4.6 AI supervisor, 6-phase cycle, 15 modules (PSPP + CCR + ACE)
- **Agent Skills**: 16 domain-specific skills, Auto-Activation Intelligence (skill-map.json)
- **Advanced Genome**: Phase 9 — 5 gene families (Microstructure, Price Action, Composite, Multi-TF Confluence, DC)

### AI Brain / Cortex Status
- **State**: [Current state]
- **Generation**: [Current generation]
- **Best Fitness**: [Best fitness score]

### Last Session Summary
[2-3 line summary from active_context.md completed tasks]

### Pending Work
- [ ] [Items from active_context.md]

---
Context loaded. Hazırım! 🚀
```
