# ADR-003: Multi-Pair Multi-Timeframe Island Model Architecture

**Status**: Accepted
**Date**: 2026-03-06
**Decision Makers**: Expert Council (9 members)

---

## Context

The original `AIBrain` architecture ran a single `EvolutionEngine` with all strategies competing in one population, regardless of which pair or timeframe they targeted. This created several problems:

1. **Cross-contamination**: BTCUSDT/1h strategies competing unfairly with ETHUSDT/15m strategies
2. **No specialization**: Strategies couldn't optimize for specific market microstructure
3. **Single mutation rate**: Can't serve different market dynamics (volatile BTC vs stable BNB)
4. **No cross-learning**: Knowledge gained on one pair couldn't transfer to another
5. **Flat risk budget**: No performance-based capital allocation

---

## Decision

**Implement an Island Model Genetic Algorithm** where each pair+timeframe combination is an isolated "island" with its own evolution engine, managed by a central "Cortex" orchestrator.

Key components:
- **TradingSlot**: Formal pair:timeframe identifier (e.g., `BTCUSDT:1h`)
- **Island**: Self-contained evolution unit with scoped EvolutionEngine, validation pipeline, trade history
- **Cortex**: Multi-island coordinator (replaces AIBrain as top-level)
- **Migration Engine**: Cross-island knowledge transfer via 3 topologies
- **Capital Allocator**: Dynamic performance-weighted budget distribution

---

## Rationale

| Factor | Single Brain | Island Model | Winner |
|--------|-------------|-------------|--------|
| **Pair Specialization** | No — all mixed | Yes — isolated per pair+TF | Island |
| **Cross-Learning** | None | Migration transfers best strategies | Island |
| **Capital Efficiency** | Equal split | Performance-weighted allocation | Island |
| **Scalability** | 1 evolution lane | N concurrent lanes | Island |
| **Correlation Risk** | No visibility | Correlation Guard monitors | Island |
| **Backward Compatible** | N/A | Old AIBrain preserved alongside | Island |

### Migration Affinity
- Same pair, different timeframe → 0.8 (high transfer probability)
- Same timeframe, different pair → 0.5 (moderate)
- Different pair and timeframe → 0.2 (low)

### Capital Allocation Formula
- Lifetime fitness: 60% weight
- Recent 5-generation trend: 30% weight
- Diversity contribution: 10% weight
- Floor: 5% per island (prevents starvation)
- Cap: 30% per island (prevents concentration)

---

## Consequences

### Positive
- Strategies evolve in their natural context (pair-specific market dynamics)
- Cross-island migration enables knowledge transfer without contamination
- Capital naturally flows to highest-performing pairs/timeframes
- Correlation Guard prevents over-exposure to one market direction
- Scalable — can add/remove pairs/timeframes dynamically

### Negative
- Higher memory usage (N × population size strategies in memory)
- More complex state management (CortexStore + per-island snapshots)
- Dashboard needs update for multi-island visualization (deferred)
- Migration adds complexity to genealogy tracking

### Mitigation
- Default 5 starter slots (not all 24 possible combinations)
- CortexStore provides single source of truth for dashboard
- Dashboard update is additive — current single-brain view still works
- Migrant strategies tagged with full lineage (`migration:source→target`)

---

*Recorded as part of the Learner Institutional Memory Architecture.*
