# ADR-007: Hybrid Persistence Architecture (IndexedDB + Supabase)

**Status**: Accepted
**Date**: 2026-03-06

## Context
Learner's trading engine held all state (trades, strategies, evolution history, forensic reports, portfolio data) in **transient in-memory Zustand stores**. A page refresh caused total data loss. localStorage was used for TradeStore (500-trade cap, 5MB limit) and DashboardConfigStore, but all engine state, evolution progress, and forensic data were lost.

For demo trading readiness, the system needed:
1. **Durable local storage** — survives browser refresh
2. **PC-independent cloud storage** — survives PC shutdown
3. **Speed** — local writes must not slow the engine
4. **Graceful degradation** — system must work even if cloud is unreachable

## Decision
**Hybrid Architecture**: IndexedDB (local cache) + Supabase PostgreSQL (cloud primary), connected via a lazy auto-initializing PersistenceBridge singleton.

### Components
- `persistence.ts` — IndexedDB adapter (6 object stores, Zustand middleware)
- `supabase.ts` — Supabase cloud client (graceful degradation)
- `persistence-bridge.ts` — Dual-write singleton (engine events → both stores)

### Data Flow
```
Engine Events → PersistenceBridge → IndexedDB (local, fast)
                                  → Supabase  (cloud, durable)
```

## Rationale

### Why Supabase over alternatives?
| Option | Free Tier | Real-time | Financial-grade | Decision |
|--------|-----------|-----------|-----------------|----------|
| **Supabase** | 500MB, ∞ API | ✅ | ✅ PostgreSQL | **Winner** |
| Turso | 5GB, 500M reads | ❌ | ⚠️ SQLite | Runner-up |
| Firebase | 1GB, 50K/day | ✅ | ⚠️ NoSQL | Read limit |

### Why Hybrid (not cloud-only)?
- Local IndexedDB gives **zero-latency reads** for dashboard
- System works **offline** (Supabase unavailable → IndexedDB still writes)
- Cloud errors **never block** local persistence

### Why Lazy Auto-Init?
- Previous explicit `initialize()` was **never called** → all writes silently dropped
- Lazy init guarantees first write always succeeds

## Consequences

### Positive
- Data survives PC shutdown (Supabase cloud)
- Data survives page refresh (IndexedDB + Supabase)
- Dashboard reads from local cache (instant)
- Cloud-first checkpoint loading (cross-device potential)

### Negative
- Requires Supabase account setup (free tier)
- JSONB storage is less query-flexible than normalized tables
- No real-time sync FROM cloud TO local (one-way write currently)

### Mitigation
- Graceful degradation: no Supabase → system uses IndexedDB only
- JSONB columns + indexed scalar columns = searchable + flexible
- Future: Supabase real-time subscriptions for cross-device sync
