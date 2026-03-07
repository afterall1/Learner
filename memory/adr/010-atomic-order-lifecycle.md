# ADR-010: Atomic Order Lifecycle Engine (AOLE)

**Status**: Accepted
**Date**: 2026-03-07
**Deciders**: 5-Expert Council (Exchange Microstructure Architect, Distributed Systems Reliability Specialist, Real-Time Execution Systems Designer, Financial Risk Automation Expert, Latency-Sensitive Protocol Specialist)

## Context

Phase 19 delivered the Binance Trading Execution Layer with REST client, WebSocket streams, circuit breaker, and order execution methods. However, three critical gaps remained that could lead to catastrophic failure in production:

1. **Naked Position Risk**: There was no atomic mechanism to place Entry + SL + TP as a single unit. If the entry order filled but the SL placement failed (network error, rate limit, exchange rejection), the position would exist WITHOUT stop-loss protection — violating Risk Manager Rule #5 (mandatory SL).

2. **Static Rate Limiting**: The original `RateLimiter` used a fixed concurrency of 5, ignoring Binance's real-time rate limit feedback via `X-MBX-USED-WEIGHT-1m` and `X-MBX-ORDER-COUNT-1m` response headers. This led to either under-utilizing available capacity or risking IP bans during bursts.

3. **No Execution Quality Measurement**: Real-world order fills were not being measured. The market simulator used hardcoded slippage values (2bps base) without any feedback from actual fill quality, creating a growing divergence between simulated and real performance.

## Decision

Implement a 3-part innovation called the **Atomic Order Lifecycle Engine (AOLE)**:

### Sub-Innovation 1: Atomic Multi-Leg Orchestrator

A 13-state state machine (`order-lifecycle.ts`) that treats Entry + SL + TP as a single atomic unit:

```
PENDING → SETTING_LEVERAGE → PLACING_ENTRY → ENTRY_FILLED
→ PLACING_SL (3 retries) → SL_PLACED → PLACING_TP → FULLY_ARMED
```

**Core Invariant**: A position NEVER exists without stop-loss protection.

Failure paths:
- Entry fails → `FAILED` (no rollback needed)
- SL fails after 3 retries → `EMERGENCY_CLOSE` → `ROLLED_BACK` (immediate market-close)
- TP fails → `SL_ONLY` (acceptable — SL provides protection)

### Sub-Innovation 2: Adaptive Rate Governor

Replaces the static `RateLimiter` class with `AdaptiveRateGovernor`:
- Reads `X-MBX-USED-WEIGHT-1m` and `X-MBX-ORDER-COUNT-1m` from every response
- Adjusts concurrency dynamically:
  - < 50% utilization → 10 (aggressive)
  - 50-75% → 5 (normal)
  - 75-92% → 2 (cautious)
  - > 92% → 1 (emergency) + 5-second request pause

### Sub-Innovation 3: Execution Quality Tracker

Per-symbol rolling window tracker (`execution-quality.ts`):
- Records slippage (bps), latency (ms), and fill ratio for every execution
- Provides avg + P95 statistics
- `getCalibratedSlippage()` feeds real slippage data back to `market-simulator.ts`, replacing hardcoded values

## Rationale

1. **Defense-in-depth for positions**: Risk Manager Rule #5 says "mandatory stop-loss on every trade." The AOLE is the enforcement mechanism at the exchange level, complementing the validation at the strategy level. If the exchange refuses the SL, we close the position rather than leaving it unprotected.

2. **Adaptive over static**: Binance provides real-time rate limit feedback in response headers. Not using this data means either being too conservative (leaving throughput on the table) or too aggressive (risking rate limit bans). The Adaptive Rate Governor reads actual utilization and adjusts in real time.

3. **Feedback loop closes the simulation gap**: The Execution Quality Tracker creates a feedback loop: real fills → calibrated slippage → simulator → better strategy fitness → better strategies. Without this, simulated performance diverges from reality over time.

## Consequences

### Positive
- Zero naked position risk — core safety invariant enforced
- Self-healing rate limiting — adapts to exchange conditions automatically
- Real execution data feeds back into simulation accuracy
- Full state audit trail for every order group
- Partial fill handling (SL/TP sized to actual executedQty)

### Negative
- Additional latency per order group (~3-5 API calls sequentially)
- Emergency close adds market-order cost (slippage) vs. having a working SL
- Rolling window size (100) may be insufficient for rarely-traded symbols

### Mitigation
- Sequential execution is necessary for correctness (entry must fill before SL can be placed)
- Emergency close cost is always less than unlimited loss from no SL
- Rolling window has configurable size and staleness threshold
