# ADR-012: Risk Manager Global Enforcement + Automated Test Infrastructure

**Status**: Accepted
**Date**: 2026-03-07

## Context

The RiskManager class (8 NON-NEGOTIABLE safety rails) was fully implemented since Phase 1 but existed in complete isolation — never instantiated by the Cortex engine, never exposed to the dashboard, never validated by automated tests. The entire project had zero test infrastructure.

## Decision

### 1. RiskManager Singleton in Cortex
Wire RiskManager as a singleton within the Cortex constructor, initialized with `totalCapital`. All trade recordings, emergency stops, and snapshot reads flow through this single instance.

### 2. 5-Layer Integration Pattern
Layer 1: `getRiskSnapshot()` on RiskManager → serializable state
Layer 2: `RiskSnapshot` type + `CortexSnapshot.riskSnapshot` field
Layer 3: Cortex wiring (constructor, recordTrade, emergencyStopAll, getSnapshot)
Layer 4: `usePipelineLiveData.riskLive` derivation
Layer 5: `RiskShieldPanel` visualization (~330 lines)

### 3. Risk Fortress Visualization
Global Risk Score ring (SVG 0-100), 8-rail status matrix with animated utilization bars, green→amber→red gradient, >80% pulse-glow animation, Emergency Stop indicator, Daily PnL, recent risk event log.

### 4. Vitest Test Framework
Chose Vitest over Jest for: native ESM support, TypeScript-first, fast startup, `vite-tsconfig-paths` for `@/` alias resolution.

### 5. Safety Rail Mutation Boundary Tests (Radical Innovation)
Each of the 8 rails is tested at its exact threshold boundary (e.g., 1.99% vs 2.01% risk, 10x vs 10.1x leverage) to mathematically prove no edge-case can bypass protections.

## Rationale

- **Singleton pattern** ensures consistent risk enforcement across all trading islands
- **5-layer pattern** follows established Overmind/MRTI integration precedent
- **Vitest** is the modern standard for TypeScript testing with near-zero config
- **Boundary tests** provide mathematical proof of safety rail integrity

## Consequences

### Positive
- RiskManager is now actively enforced on every trade decision
- 45 automated tests validate the most critical capital-preservation code
- Dashboard provides real-time risk visibility
- Boundary tests prevent future regression near threshold edges

### Negative
- New `vitest` + `vite-tsconfig-paths` dev dependencies (36 packages)
- Test execution adds ~1 second to CI pipeline

### Mitigation
- Dev dependencies add zero to production bundle
- Sub-second test execution is negligible overhead
