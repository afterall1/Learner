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
- Risk rails are hardcoded and non-overridable (GLOBAL across all islands)
- Paper trading + 4-Gate Validation is mandatory before live trading
- **Dashboard**: 9 panels including Cortex Neural Map for live island visualization

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
- Meta-Evolution status (HyperDNA, meta-generation, GA² cycle count)
- Validation pipeline status (4-Gate)
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
- Module dependency graph (Types → Engine → Anti-Overfitting → Island Model → Risk → Store → Dashboard)
- Island Model architecture (Cortex → Islands → Migration → Capital Allocator)
- **Meta-Evolution (GA²)**: HyperDNA → Island → Meta-Fitness → Meta-Crossover cycle
- 4-Gate Validation Pipeline (WFA → Monte Carlo → Overfitting → Regime Diversity)
- Strategy evolution pipeline (per-island)
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
- **Core Engine**: `strategy-dna.ts`, `evaluator.ts`, `evolution.ts`, `brain.ts`
- **Anti-Overfitting**: `walk-forward.ts`, `monte-carlo.ts`, `regime-detector.ts`, `overfitting-detector.ts`
- **Island Model**: `island.ts`, `cortex.ts`, `meta-evolution.ts`, `migration.ts`, `capital-allocator.ts`
- **Risk**: `manager.ts`
- **State**: `store/index.ts` (6 stores including CortexStore)
- **Dashboard**: `page.tsx` (9 panels + CortexNeuralMap), `globals.css` (1060+ lines), `layout.tsx`
- **Memory**: Overview, Active Context, System Design, File Map, ADRs (4), Changelog

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

**Critical skills**: `learner-conventions` (mandatory for all code), `evolution-engine`, `risk-management`, `meta-evolution`

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
- **Dashboard**: 9 panels + Cortex Neural Map

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
