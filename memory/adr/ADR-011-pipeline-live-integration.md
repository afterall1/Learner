# ADR-011: Pipeline Live Integration Architecture

**Status**: Accepted
**Date**: 2026-03-07

## Context

The Pipeline Dashboard (/pipeline) had 8 panels displaying strategy evolution lifecycle data — all powered by demo/synthetic data generators. After Phase 20 delivered CortexLiveEngine (bridging live Binance data → Cortex/Island engines), these panels needed to be connected to real engine state. Additionally, the EvolutionEngine contained rich internal intelligence (diversity index, stagnation detection, adaptive mutation, regime-gene memory) that was **completely invisible** to the user.

## Decision

### Architecture: Data Bridge Hook Pattern

A dedicated React hook (`usePipelineLiveData`) serves as the single data bridge between the engine layer and the presentation layer. This hook:

1. **Dual-Mode Operation**: Returns LIVE data when CortexLiveEngine is active, DEMO data as fallback
2. **Island Selector**: Accepts `selectedSlotId` to scope all derived data to a specific island
3. **3-Second Polling**: Uses `useCallback` + `useRef` interval for near real-time updates
4. **7 Derivation Functions**: Each extracts a specific data dimension from the Island

### Radical Innovation: Hidden Intelligence Exposure

Created `EvolutionHealthAnalyzer` (stateless engine class) that exposes the EvolutionEngine's hidden convergence/stagnation intelligence:

- **convergenceRisk**: Composite 0-1 score from diversity (40%) + stagnation (35%) + trajectory (25%)
- **fitnessTrajectory**: Linear regression slope over last 5 generations
- **geneDominance**: Frequency histogram of IndicatorTypes with ↑/•/↓ trend indicators
- **autoInterventions**: Detected mutation boosts/decays from rate changes across generations
- **healthGrade**: A/B/C/D/F letter grade with human-readable recommendation

## Rationale

- **Hook Pattern vs. Direct Store**: A hook provides cleaner memoization, error isolation, and dual-mode logic than extending the Zustand store
- **Stateless Analyzer**: `computeGenomeHealth()` has zero side effects — safe to call in render cycles
- **Health Grading**: A-F grades are immediately understandable to users vs. raw numeric metrics
- **Gene Dominance**: Shows which indicator types are "winning" the evolutionary race — actionable insight

## Consequences

### Positive
- 5 pipeline panels now show live data with zero config when Cortex is running
- Users can see real-time convergence risk and engine auto-interventions
- Dual-mode ensures the dashboard works even without live data
- Island selector enables per-island inspection

### Negative
- 3-second polling adds computational overhead (7 derivation functions per tick)
- Gene lineage, survival heatmap, and decision explainer panels still use demo data

### Mitigation
- Derivation functions are memoized via `useCallback`
- Polling interval is configurable
- Demo data panels planned for future live data connection
