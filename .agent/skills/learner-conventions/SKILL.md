---
name: learner-conventions
description: Activate when working on any part of the Learner AI trading system project. Provides mandatory development standards (--NO-LAZY, --PROD-READY, --DRY, --STRICT), TypeScript patterns, file naming conventions, import ordering rules, Zustand store patterns, error handling requirements, and memory sync protocol. Must be followed for ALL code changes in this project.
---

# Learner Project Conventions — Development Standards

> **Expert Council**: Kent Beck (Clean Code), Anders Hejlsberg (TypeScript Design), Rich Harris (Framework Architecture), Martin Fowler (Software Patterns), Sandi Metz (OOP Excellence)

## 🚨 Mandatory Development Flags

Every code change in this project MUST comply with ALL four flags simultaneously:

| Flag | Requirement | Violation = |
|------|-------------|-------------|
| `--NO-LAZY` | **NEVER** use `// ...`, `// remaining code`, `// TODO`, or placeholder code. Every line must be complete and functional. | INSTANT REJECTION |
| `--PROD-READY` | All logic blocks must include `try-catch` error handling, input validation, boundary checks, and meaningful error messages with module context. | INSTANT REJECTION |
| `--DRY` | Extract shared logic into reusable functions, hooks, or utilities. Never duplicate logic across files. If you write similar code twice, refactor. | CODE REVIEW FAIL |
| `--STRICT` | 100% TypeScript type safety. No `any` types. No `as` casts unless mathematically provable. Resolve all lint warnings. All function params typed. | BUILD FAIL |

---

## 📁 Project Structure (Current)

```
src/
├── types/
│   ├── index.ts                  → Master type system (700+ lines, incl. Phase 9 advanced gene types)
│   └── trading-slot.ts           → TradingSlot pair:timeframe identifier
├── lib/engine/
│   ├── strategy-dna.ts           → Genome generation, crossover, mutation (incl. advanced genes)
│   ├── evaluator.ts              → Composite fitness + complexity penalty + novelty bonus
│   ├── signal-engine.ts          → Indicator calculations + advanced gene signal integration
│   ├── evolution.ts              → GA controller (adaptive mutation, diversity, Strategy Memory)
│   ├── experience-replay.ts      → Regime-pattern memory + advanced gene patterns
│   ├── brain.ts                  → AI Brain (single-island, 4-Gate validation, 3-stage promotion)
│   ├── island.ts                 → Island: isolated evolution unit (pair+timeframe scoped)
│   ├── cortex.ts                 → Cortex: multi-island orchestrator
│   ├── migration.ts              → Cross-island knowledge transfer (3 topologies)
│   ├── capital-allocator.ts      → Dynamic performance-weighted capital distribution
│   ├── meta-evolution.ts         → GA² meta-evolution engine (HyperDNA)
│   ├── walk-forward.ts           → Walk-Forward Analysis (rolling IS/OOS)
│   ├── monte-carlo.ts            → Monte Carlo permutation + Deflated Sharpe Ratio
│   ├── regime-detector.ts        → Market regime classification (5 regimes)
│   ├── overfitting-detector.ts   → Composite overfitting risk (0-100)
│   ├── microstructure-genes.ts   → Phase 9: Volume Profile, Acceleration, Candle Anatomy
│   ├── price-action-genes.ts     → Phase 9: 10 candlestick formations, structural breaks
│   ├── composite-functions.ts    → Phase 9: Mathematical indicator evolution (9 ops × 4 norms)
│   ├── directional-change.ts     → Phase 9: Event-based DC analysis (Kampouridis)
│   ├── backtester.ts             → Phase 10: Core backtest engine + IndicatorCache (PFLM)
│   ├── market-simulator.ts       → Phase 10: Realistic execution (slippage, commission, impact)
│   ├── trade-forensics.ts        → Phase 12: TradeBlackBox + ForensicAnalyzer (971 lines)
│   ├── forensic-learning.ts      → Phase 12.1: Bayesian beliefs + fitness modifiers (394 lines)
│   ├── regime-intelligence.ts    → Phase 11: MRTI predictive engine (740 lines)
│   ├── persistence-bridge.ts     → Phase 13: Dual-write bridge (IndexedDB + Supabase)
│   └── overmind/                 → Phase 15: Strategic Overmind (15 files)
│       ├── strategic-overmind.ts  → 6-phase cycle orchestrator (805 lines)
│       ├── opus-client.ts        → Opus 4.6 API client (singleton)
│       ├── prompt-engine.ts      → LLM prompt construction
│       ├── response-parser.ts    → 4-tier JSON extraction
│       ├── hypothesis-engine.ts  → Market hypothesis generation
│       ├── evolution-director.ts → GA directives
│       ├── adversarial-tester.ts → ACE strategy stress testing
│       ├── pair-specialist.ts    → Pair-specific profiling
│       ├── emergent-indicator.ts → Novel indicator discovery
│       ├── strategy-decomposer.ts → RSRD synthesis
│       ├── episodic-memory.ts    → CCR episode storage
│       ├── counterfactual-engine.ts → CCR "what if" analysis
│       ├── meta-cognition.ts     → CCR self-reflection
│       ├── predictive-orchestrator.ts → PSPP bridge (MRTI → Overmind)
│       └── reasoning-journal.ts  → Decision reasoning log
├── lib/risk/
│   └── manager.ts                → 8 hardcoded safety rails (GLOBAL)
├── lib/store/
│   ├── index.ts                  → 6 Zustand stores
│   └── persistence.ts            → Phase 13: IndexedDB provider (584 lines)
├── lib/db/
│   └── supabase.ts               → Phase 14: Supabase cloud provider (381 lines)
├── lib/api/                      → Exchange API layer (future)
└── app/
    ├── layout.tsx                → Root layout
    ├── globals.css               → Design system (~1960 lines, dark glassmorphism)
    ├── page.tsx                  → 9-panel dashboard + Cortex Neural Map (~1300 lines)
    └── pipeline/page.tsx         → Pipeline + Archaeology + Overmind Hub (~2050 lines)
```

---

## 📝 TypeScript Patterns

### Import Ordering (MANDATORY)
Every file must follow this exact sequence, separated by blank lines:

```typescript
// 1. React / Next.js core
import { useState, useEffect, useMemo } from 'react';

// 2. Third-party libraries
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// 3. Internal type imports (type-only)
import type { StrategyDNA, Trade, IslandSnapshot } from '@/types';
import type { TradingSlot } from '@/types/trading-slot';

// 4. Internal module imports
import { RiskManager } from '@/lib/risk/manager';
import { useBrainStore, useCortexStore } from '@/lib/store';

// 5. CSS imports (components only)
import '@/app/globals.css';
```

### Type Safety Rules
```typescript
// ✅ Correct: Discriminated union with exhaustive check
function handleState(state: BrainState): string {
  switch (state) {
    case BrainState.IDLE: return 'waiting';
    case BrainState.EXPLORING: return 'searching';
    case BrainState.EVALUATING: return 'testing';
    case BrainState.EVOLVING: return 'breeding';
    case BrainState.TRADING: return 'active';
    case BrainState.PAUSED: return 'paused';
    case BrainState.VALIDATING: return 'validating';
    case BrainState.SHADOW_TRADING: return 'shadow';
    case BrainState.EMERGENCY_STOP: return 'stopped';
    default: {
      const _exhaustive: never = state;
      throw new Error(`Unhandled state: ${_exhaustive}`);
    }
  }
}

// ✅ Correct: Record over index signature
const weights: Record<string, number> = {};

// ✅ Correct: unknown over any
function parseData(raw: unknown): StrategyDNA { /* ... */ }

// ✅ Correct: Type-only imports for interfaces
import type { StrategyDNA } from '@/types';

// ❌ NEVER: any type
function bad(data: any) { /* FORBIDDEN */ }

// ❌ NEVER: unsafe cast
const x = something as StrategyDNA; // FORBIDDEN without runtime check
```

### Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Files (engine) | `kebab-case.ts` | `strategy-dna.ts`, `capital-allocator.ts` |
| Files (type) | `kebab-case.ts` | `trading-slot.ts` |
| Classes | `PascalCase` | `Island`, `Cortex`, `MigrationEngine` |
| Interfaces | `PascalCase` | `StrategyDNA`, `TradingSlot` |
| Enums | `PascalCase` + `SCREAMING_SNAKE` values | `BrainState.EVOLVING` |
| Functions | `camelCase` | `generateRandomStrategy()` |
| Constants | `SCREAMING_SNAKE` | `DEFAULT_RISK_CONFIG` |
| Zustand stores | `use<Domain>Store` | `useBrainStore`, `useCortexStore` |
| CSS classes | `kebab-case` with BEM for components | `.island-card__header` |
| IDs (HTML) | `kebab-case` | `id="island-grid"` |

---

## 🏗️ Error Handling Pattern (MANDATORY)

```typescript
// Every engine method MUST follow this pattern
class ExampleEngine {
  doOperation(input: InputType): ResultType {
    try {
      // 1. Input validation
      if (!input || !input.id) {
        throw new Error('Input must have a valid id');
      }

      // 2. Boundary checks
      if (input.value < 0 || input.value > 100) {
        throw new Error(`Value ${input.value} out of range [0, 100]`);
      }

      // 3. Core logic
      const result = this.compute(input);

      // 4. Output validation
      if (!Number.isFinite(result.score)) {
        throw new Error('Computed score is not a finite number');
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ExampleEngine] doOperation failed: ${message}`);
      throw error; // Re-throw — let caller decide recovery
    }
  }
}
```

### Module Log Prefix Convention
```typescript
// Every console.error/warn/log MUST include the module name
console.error(`[EvolutionEngine] ...`);
console.error(`[RiskManager] ...`);
console.error(`[Cortex] ...`);
console.error(`[Island:${this.slotId}] ...`);
console.error(`[MigrationEngine] ...`);
console.error(`[WalkForward] ...`);
console.error(`[Overmind] ...`);       // Strategic Overmind
console.error(`[OpusClient] ...`);     // Opus 4.6 API
console.error(`[PredictiveOrch] ...`); // PSPP bridge
console.error(`[Forensics] ...`);      // Trade Forensics
console.error(`[PersistBridge] ...`);  // Persistence Bridge
console.error(`[Supabase] ...`);       // Cloud operations
console.error(`[🧬²] ...`);            // Meta-evolution events
```

---

## 🗃️ Zustand Store Conventions

### 6 Stores (Current)

| Store | Domain | Persistence |
|-------|--------|-------------|
| `useBrainStore` | AI Brain, evolution, validation | In-memory |
| `useCortexStore` | Multi-island, migration, capital | In-memory |
| `usePortfolioStore` | Balance, positions | In-memory |
| `useTradeStore` | Trade history (500 max) | LocalStorage |
| `useMarketStore` | Live tickers, selected pair | In-memory |
| `useDashboardConfigStore` | UI prefs, testnet toggle | LocalStorage |

### Store Rules
1. Store names: `use<Domain>Store`
2. Actions are defined INSIDE `set` callback — never external functions
3. Use `persist` middleware ONLY for `useTradeStore` and `useDashboardConfigStore`
4. Keep stores **focused** — one domain per store, no god stores
5. Read from stores via selectors: `const value = useStore(s => s.field)`
6. Never mutate state directly — always use actions via `set()`
7. `slotId` must be included when recording trades via `useCortexStore`

### Store Action Pattern
```typescript
const useExampleStore = create<ExampleStore>((set, get) => ({
  // State
  items: [],
  isLoading: false,

  // Actions
  addItem: (item: Item) => {
    set((state) => ({
      items: [...state.items, item],
    }));
  },

  reset: () => {
    set({ items: [], isLoading: false });
  },
}));
```

---

## 🧬 SlotId Convention (Island Model)

Every entity scoped to a specific pair+timeframe MUST carry a `slotId`:

```typescript
// Format: "PAIR:timeframe" — e.g., "BTCUSDT:1h"
// Always lowercase timeframe in slotId

// Entities that carry slotId:
interface StrategyDNA { slotId: string; /* ... */ }
interface Trade       { slotId: string; /* ... */ }
interface Position    { slotId: string; /* ... */ }
```

---

## 🧠 Memory Sync Protocol

### After every significant session:
1. Run `/memory-sync` workflow (9 steps)
2. Verify `active_context.md` has all completed tasks
3. Verify `file_map.md` lists any new files
4. Verify `changelog.md` has version bump if features added
5. Verify build passes: `npx next build`

### Before starting a new session:
1. Run `/memory-reload` workflow (7 steps)
2. Read: `overview.md` → `active_context.md` → `system_design.md` → all ADRs

---

## 🔧 Build Verification (NON-NEGOTIABLE)

Every feature implementation must conclude with:
```bash
npx next build
```

Only declare work **"complete"** if:
1. Build exits with code 0
2. Zero TypeScript errors
3. No unused imports or variables

---

## 🛡️ Forbidden Patterns

| ❌ NEVER | ✅ INSTEAD |
|---------|----------|
| `any` type | `unknown` + runtime narrowing |
| `// TODO` or `// ...` | Complete implementation |
| `as Type` without guard | Type predicate or runtime check |
| `console.log` in production | `console.error` with `[Module]` prefix |
| Inline type definitions | Export from `src/types/index.ts` |
| God functions (>50 lines) | Break into single-responsibility functions |
| Magic numbers | Named constants: `const MAX_POSITIONS = 3` |
| Array index as React key | Unique ID (`trade.id`, `strategy.id`) |
| Mutable state in stores | Immutable updates via spread/`set()` |

---

## 📂 Key Files
- `src/types/index.ts` → Master type system (700+ lines, Phases 1–10)
- `src/types/trading-slot.ts` → TradingSlot identifier
- `src/lib/store/index.ts` → 6 Zustand stores
- `src/lib/engine/backtester.ts` → Core backtest engine + PFLM IndicatorCache
- `src/lib/engine/market-simulator.ts` → Realistic execution modeling
- `memory/overview.md` → Project overview
- `memory/active_context.md` → Current state
- `.agent/workflows/memory-reload.md` → Context hydration
- `.agent/workflows/memory-sync.md` → State persistence

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| _(all skills)_ | Foundation | This skill applies to ALL code changes in the project |
| `evolution-engine` | Consumer | DNA operations must follow type safety + naming rules |
| `dashboard-development` | Consumer | UI components must follow design system conventions |
| `backtesting-simulation` | Consumer | Engine code must follow error handling + module prefix rules |
| `strategic-overmind` | Consumer | Overmind code must follow module prefix + error handling rules |
| `hybrid-persistence` | Consumer | Persistence code must follow SSR guard + error handling rules |
| `trade-forensics` | Consumer | Forensics code must follow type safety + naming rules |
