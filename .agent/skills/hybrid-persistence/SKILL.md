---
name: hybrid-persistence
description: Activate when working on the Hybrid Dual-Write Persistence Layer, IndexedDB local cache, Supabase Cloud PostgreSQL, Persistence Bridge lifecycle wiring, engine checkpoints, trade/strategy/evolution snapshot storage, lazy auto-initialization, cloud-first hydration, portfolio snapshots, storage statistics, or any data durability code in the Learner trading system.
---

# Hybrid Persistence — Dual-Write Storage Layer

> **Expert Council**: Martin Kleppmann (Data-Intensive Systems), Werner Vogels (Distributed Systems), Andy Pavlo (Database Systems), Pat Helland (Event-Driven Architecture)

## 🏗️ Architecture (3-Layer)

```
┌─────────────────────────────────────────────────────────────┐
│  Engine Lifecycle Events                                     │
│  (tradeRecorded, generationEvolved, portfolioUpdate, etc.)  │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │  PersistenceBridge          │
          │  (Dual-Write Singleton)     │
          │  ───────────────────────    │
          │  Lazy Auto-Initialization   │
          │  Cloud-First Hydration      │
          └─────┬──────────────┬────────┘
                │              │
     ┌──────────▼──┐    ┌─────▼──────────┐
     │  IndexedDB  │    │  Supabase      │
     │  (Local)    │    │  (Cloud)       │
     │  ──────────-│    │  ──────────── │
     │  Fast cache │    │  Durable      │
     │  Zero-conf  │    │  PC-agnostic  │
     └─────────────┘    └────────────────┘
```

### Design Principle: **Write Both, Read Cloud-First**
1. Every write goes to BOTH IndexedDB AND Supabase (fire-and-forget)
2. On hydration (session restore), Supabase is tried FIRST
3. If Supabase unavailable, fallback to IndexedDB
4. IndexedDB provides zero-latency reads during active session

---

## 🗄️ Storage Schemas (6 Object Stores)

| Store | Key | Index | Data |
|-------|-----|-------|------|
| `trades` | `id` | `strategyId`, `entryTime`, `status` | Full `Trade` objects |
| `strategies` | `id` | `slotId`, `status`, `fitnessScore` | Full `StrategyDNA` objects |
| `evolution_snapshots` | `id` | `slotId`, `generationNumber` | Generation metrics |
| `forensic_reports` | `tradeId` | `strategyId`, `regime`, `timestamp` | Post-trade autopsies |
| `portfolio_snapshots` | `id` | `timestamp` | Balance/PnL over time |
| `engine_state` | `id` | — | Full engine checkpoint |

---

## 🔌 PersistenceBridge: Lifecycle Events

| Event | Method | When Called |
|-------|--------|------------|
| Trade opened/closed | `onTradeRecorded(trade)` | `Cortex.recordTrade()` |
| Trade updated (live) | `onTradeUpdated(trade)` | Price updates during open trade |
| Generation completed | `onGenerationEvolved(...)` | `Island.advanceGeneration()` |
| Portfolio state | `onPortfolioUpdate(summary)` | Periodic (60s interval) |
| Forensic report | `onForensicReportGenerated(report)` | Post-trade analysis |
| Engine checkpoint | `startEngineCheckpoint(fn)` | Periodic (30s interval) |

### Lazy Auto-Initialization

```typescript
// IndexedDB init happens on FIRST write — no manual setup needed
private async ensureIndexedDB(): Promise<boolean> {
    if (this.localReady) return true;
    if (typeof window === 'undefined') return false; // SSR guard
    // Singleton promise prevents concurrent init race conditions
    if (!this.initPromise) this.initPromise = initDB().then(() => true);
    this.localReady = await this.initPromise;
    return this.localReady;
}
```

### Cloud-First Hydration

```typescript
// loadLastCheckpoint() — used on session restore
async loadLastCheckpoint(): Promise<EngineCheckpoint | null> {
    // 1. Try Supabase first (always latest)
    const cloud = await cloudLoadEngineCheckpoint();
    if (cloud) return cloud;
    // 2. Fallback to local IndexedDB
    return await loadEngineCheckpoint();
}
```

---

## ☁️ Supabase Cloud Operations

| Function | Table | Purpose |
|----------|-------|---------|
| `cloudSaveTrade(trade)` | `trades` | Upsert trade |
| `cloudSaveTrades(trades)` | `trades` | Batch upsert |
| `cloudLoadTrades(limit)` | `trades` | Load recent |
| `cloudSaveStrategy(strategy)` | `strategies` | Upsert strategy |
| `cloudSaveStrategies(strategies)` | `strategies` | Batch upsert |
| `cloudSaveEvolutionSnapshot(snap)` | `evolution_snapshots` | Insert |
| `cloudSaveForensicReport(report)` | `forensic_reports` | Insert |
| `cloudSavePortfolioSnapshot(snap)` | `portfolio_snapshots` | Insert |
| `cloudSaveEngineCheckpoint(cp)` | `engine_checkpoints` | Upsert |
| `cloudLoadEngineCheckpoint()` | `engine_checkpoints` | Load latest |
| `cloudGetStats()` | _(all)_ | Count rows per table |

### Configuration

```env
# .env.local — never commit!
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Graceful Degradation
- `getSupabase()` returns `null` if credentials missing
- `isCloudAvailable()` guards all cloud ops
- Every cloud function catches errors and logs `[Supabase]` prefix
- **System NEVER crashes** if Supabase is offline — IndexedDB continues

---

## ⚠️ Critical Rules

1. **NEVER skip IndexedDB write** — local cache ensures zero-latency reads
2. **NEVER skip Supabase write** — cloud ensures PC-independence
3. **ALL cloud functions must be fire-and-forget** — don't block engine on cloud write
4. **ALWAYS guard SSR** — `typeof window === 'undefined'` check before IndexedDB
5. **NEVER expose Supabase credentials** — `.env.local` only
6. **Cloud-first hydration** — always try Supabase before IndexedDB on session restore
7. **PersistenceBridge is a singleton** — use `getPersistenceBridge()`
8. **Engine checkpoint version** — increment when schema changes
9. **IndexedDB upgrade** — add new stores/indexes in `initDB()` upgrade handler

---

## 📁 Key Files

- `src/lib/engine/persistence-bridge.ts` → PersistenceBridge (dual-write orchestrator)
- `src/lib/store/persistence.ts` → IndexedDB provider (6 stores, CRUD operations)
- `src/lib/db/supabase.ts` → Supabase cloud provider (all cloud operations)
- `.env.local` → Supabase credentials (NEVER committed)

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `evolution-engine` | Data Source | Generation snapshots + strategies persisted |
| `performance-analysis` | Data Source | Fitness scores stored in strategy records |
| `trade-forensics` | Data Source | Forensic reports persisted via bridge |
| `strategic-overmind` | Consumer | Episodes + predictions stored via bridge |
| `risk-management` | Safety | Risk state persisted in engine checkpoint |
| `learner-conventions` | Standard | All persistence code follows project conventions |
