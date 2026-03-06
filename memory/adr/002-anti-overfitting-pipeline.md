# ADR-002: 4-Gate Anti-Overfitting Validation Pipeline

**Status**: Accepted
**Date**: 2026-03-06
**Decision Makers**: Expert Council (8 members)

---

## Context

Genetic algorithm strategies evolved through many generations inevitably risk **overfitting** to historical trade data. Strategies that appear profitable during paper trading may exploit noise rather than genuine market patterns. Without rigorous validation, promoting such strategies to live trading would be catastrophic.

The system lacked any mechanism to distinguish genuine edge from curve-fitting. A multi-layered defense was needed.

---

## Decision

**Implement a 4-Gate Validation Pipeline** that every strategy must pass before promotion from PAPER to CANDIDATE:

1. **Walk-Forward Analysis** — Rolling IS/OOS window evaluation (efficiency ≥ 0.5)
2. **Monte Carlo Permutation Test** — 1000 shuffled equity curves (p-value < 0.05)
3. **Overfitting Detection Score** — Composite 5-factor risk score (score < 40/100)
4. **Regime Diversity** — Strategy must trade in ≥ 2 distinct market regimes

Additionally implement a **3-Stage Promotion Pipeline**: Paper → Candidate → Active.

---

## Rationale

| Gate | What It Catches |
|------|----------------|
| Walk-Forward | Strategies that degrade on unseen data (curve-fitting) |
| Monte Carlo | Lucky trade sequencing (no genuine edge) |
| Overfitting Score | Complex rules that memorize noise, low regime diversity |
| Regime Diversity | Strategies that only work in one market condition |

### Key Enhancements
- **Complexity Penalty**: Strategies with many indicators get penalized (Occam's Razor)
- **Deflated Sharpe Ratio**: Corrects for multiple-testing bias across generations (López de Prado)
- **Min 30 Trades**: Statistical significance requirement (up from 5)
- **Adaptive Mutation**: Auto-increases when fitness stagnates

---

## Consequences

### Positive
- Near-impossible for overfit strategies to reach live trading
- Multiple independent tests create robust defense-in-depth
- Retired strategies logged with specific failure reasons (learning data)
- Complexity penalty naturally favors simpler, more generalizable strategies

### Negative
- Strategies take longer to reach Active status (30+ trades + 4 gates)
- Some genuinely good strategies may be rejected (false negatives)
- Computational overhead per validation cycle

### Mitigation
- Min trade count (30) is a balance between rigor and speed
- Failed strategies' logs provide insight for future evolution
- Validation runs only on top 3 strategies per generation (not all)

---

*Recorded as part of the Learner Institutional Memory Architecture.*
