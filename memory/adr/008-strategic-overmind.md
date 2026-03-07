# ADR-008: Strategic Overmind Architecture (Opus 4.6 AI Supervisor)

**Status**: Accepted
**Date**: 2026-03-07

## Context

As the Learner system grew to include 15+ engine modules (GA, Meta-Evolution, MRTI, Trade Forensics, etc.), a critical architectural question emerged: **how should these subsystems coordinate intelligently rather than through fixed heuristics?**

The existing architecture used hardcoded rules for:
- When to trigger meta-evolution cycles (every 10 generations)
- How to respond to regime transitions (fixed HOLD/PREPARE/SWITCH thresholds)
- Which mutation strategies to apply (random selection)
- What lessons to extract from trade forensics (fixed Bayesian weights)

This worked for deterministic cases but couldn't:
- Generate novel market hypotheses
- Identify emergent indicator patterns
- Reason about WHY a strategy failed (beyond statistical attribution)
- Adapt evolution direction based on market narrative understanding

## Decision

Implement a **Strategic Overmind** — an Opus 4.6-powered AI supervisor that operates ABOVE the existing GA/Meta-Evolution/MRTI stack, using a 6-phase reasoning cycle with 3 advanced sub-systems:

### 6-Phase Reasoning Cycle
```
OBSERVE → ANALYZE → HYPOTHESIZE → DIRECT → VERIFY → LEARN
```

### Architecture (15 Modules)

| Module | Purpose |
|--------|---------|
| `strategic-overmind.ts` | Orchestrator — coordinates all phases |
| `opus-client.ts` | Anthropic API singleton (adaptive thinking, graceful degradation) |
| `prompt-engine.ts` | LLM prompt construction |
| `response-parser.ts` | 4-tier JSON extraction |
| `hypothesis-engine.ts` | Market hypothesis generation/tracking |
| `evolution-director.ts` | GA directive generation (mutations, crossovers) |
| `adversarial-tester.ts` | ACE strategy stress testing |
| `pair-specialist.ts` | Per-pair behavioral profiling |
| `emergent-indicator.ts` | Novel indicator discovery |
| `strategy-decomposer.ts` | RSRD — winning strategy pattern extraction |
| `reasoning-journal.ts` | Decision audit trail |

### Sub-System: PSPP (Predictive Strategic Pre-Positioning)
- `predictive-orchestrator.ts` — MRTI forecasts → proactive strategy pre-warming
- Bridges MRTI regime predictions with Overmind HYPOTHESIZE phase
- Actions: HOLD / PREPARE / SWITCH per island

### Sub-System: CCR (Counterfactual Causal Replay)
- `episodic-memory.ts` — Records key decision moments  
- `counterfactual-engine.ts` — "What if?" alternative scenario analysis
- `meta-cognition.ts` — Self-reflection loop (updates beliefs, biases)

## Rationale

1. **Opus 4.6's Extended Thinking** enables deep reasoning about market dynamics that no fixed algorithm can match
2. **Graceful Degradation**: System operates normally without Opus (OpusClient returns null, all callers handle this) — Overmind is an ENHANCEMENT, not a dependency
3. **6-Phase Cycle** mirrors the scientific method — observe, analyze, hypothesize, test, verify, learn
4. **PSPP** transforms reactive regime response into proactive positioning (before transitions occur)
5. **CCR** enables meta-learning — the system doesn't just learn from markets, it learns from its own decisions

## Consequences

### Positive
- AI-driven evolution direction (not random mutation)
- Market hypothesis testing (not just statistical backtesting)  
- Emergent indicator discovery (novel composite indicators)
- Self-improving decision quality (CCR meta-cognition)
- Proactive regime adaptation (PSPP pre-warming)

### Negative
- Opus API costs (~$0.01-0.05 per reasoning cycle)
- Latency (1-3s per Opus call)
- Non-deterministic outputs (LLM responses vary)

### Mitigation
- Token budget management (OpusClient tracks usage)
- Graceful degradation (all Overmind features optional)
- Response parser with 4-tier fallback (JSON → regex → markdown → raw)
- Reasoning journal provides auditable decision trail
