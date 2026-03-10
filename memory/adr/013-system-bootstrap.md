# ADR-013: System Bootstrap Orchestrator

**Status**: Accepted
**Date**: 2026-03-08
**Phase**: 36

## Context

The Learner system has 7+ interdependent subsystems (Environment, IndexedDB/Supabase persistence, Cortex multi-island engine, historical data seeder, WebSocket streams, Evolution scheduler, and the ready state) that must start in a specific dependency order. Previously, initialization was ad-hoc — each subsystem started independently, leading to:

1. **Race conditions**: WebSocket connections attempted before historical seeding completed
2. **Silent failures**: A failed persistence initialization went undetected, cascading to data loss
3. **No visibility**: Users had no feedback about boot progress or which subsystems were active
4. **No recovery**: One failed subsystem left the entire engine in an undefined half-started state

## Decision

Implement a **singleton 7-phase ignition sequence orchestrator** (`SystemBootstrap`) with coordinated dependency-order startup:

```
ENV_CHECK → PERSISTENCE → CORTEX_SPAWN → HISTORICAL_SEED → WS_CONNECT → EVOLUTION_START → READY
```

Each phase:
- Executes only after the previous phase succeeds
- Has defined success/failure criteria
- Reports progress via a Zustand store (`useBootStore`)
- Yields to the event loop (`setTimeout(0)`) before execution to prevent React state batching
- Enforces a 400ms minimum display time per phase for visual feedback

A companion **IgnitionSequencePanel** provides real-time boot telemetry: phase waterfall chart, per-phase result badges, boot history, and elapsed timer.

## Rationale

### Why a centralized orchestrator?
- **Dependency graph**: Cortex cannot spawn without persistence; WS cannot connect without Cortex; Evolution cannot start without WS data. A centralized orchestrator makes this dependency chain explicit and enforceable.
- **Error isolation**: Failed phases produce specific error messages and prevent dependent phases from starting.
- **Observability**: Zustand store exposes granular boot state for dashboard visualization.

### Why 400ms minimum display?
- React batches rapid `set()` calls into a single render. Without artificial delay, all 7 phases complete in <50ms and the user sees nothing.
- The `setTimeout(0)` yields allow React to process each state change in its own microtask, making phases visible.

### Why Zustand over React state?
- Boot state must be accessible from non-React contexts (SystemBootstrap class calls set directly).
- Must persist across component re-renders during boot.
- Multiple components need boot state: IgnitionSequencePanel, error boundaries, status bars.

### Alternatives Considered
1. **Event emitter pattern**: Rejected — harder to guarantee ordering and sequential execution.
2. **Promise chain without orchestrator**: Rejected — no centralized error recovery or progress tracking.
3. **Separate stores per subsystem**: Rejected — fragmented visibility, harder to coordinate.

## Consequences

### Positive
- **Deterministic boot**: Every subsystem starts in the correct order, every time
- **Full observability**: Users see exactly which phase is active and what each phase's result was
- **Error recovery**: Failed boot halts cleanly with specific error messages per phase
- **Re-ignition**: System can be shutdown and re-booted without page refresh
- **Boot history**: Last 5 boots tracked for comparison and debugging
- **Demo mode awareness**: Phase messages adapt to show "DEMO MODE" when API keys are absent

### Negative
- **Slower boot**: 400ms × 7 phases = ~2.8s minimum boot time even when all phases succeed instantly
- **More code**: ~519L engine + ~473L UI + ~160L store = ~1150 lines for boot infrastructure

### Mitigation
- Minimum display time is configurable and can be reduced for production
- Boot telemetry waterfall chart helps identify actual slow phases vs. artificial delay
