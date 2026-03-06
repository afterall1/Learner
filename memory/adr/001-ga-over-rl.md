# ADR-001: Genetic Algorithm over Reinforcement Learning

**Status**: Accepted
**Date**: 2026-03-05
**Decision Makers**: Expert Council (6 members)

---

## Context

The Learner project requires a self-evolving AI that discovers and optimizes trading strategies autonomously for Binance Futures. Two primary approaches were evaluated:

1. **Reinforcement Learning (RL)**: Agent learns from environment interaction via reward signals (Q-learning, PPO, A3C)
2. **Genetic Algorithm (GA)**: Population of strategy "genomes" evolved through crossover, mutation, and selection

Both approaches can theoretically converge on optimal trading strategies. The critical differences lie in **convergence speed**, **sample efficiency**, **capital risk**, and **implementation complexity** for live crypto markets.

---

## Decision

**Use Genetic Algorithm (GA) with Strategy DNA genome representation.**

---

## Rationale

| Factor | RL | GA | Winner |
|--------|----|----|--------|
| **Convergence Speed** | Slow — requires millions of timesteps | Fast — meaningful results in 50-100 generations | GA |
| **Sample Efficiency** | Poor — needs extensive experience replay | Good — evaluates full population per generation | GA |
| **Capital Risk** | High — learns by trial-and-error in market | Low — paper-trade entire populations | GA |
| **Parallelization** | Complex (distributed actors) | Natural (independent strategy evaluation) | GA |
| **Strategy Interpretability** | Black box (neural network weights) | Transparent (readable DNA: indicators, rules, risk) | GA |
| **Composability** | Difficult to combine learned policies | Natural crossover of parent strategies | GA |
| **Market Regime Adaptation** | Requires retraining | Automatic population diversity | GA |

### Key Arguments from the Council

**Dr. Volkov (System Architect)**: "RL requires a stable environment model. Crypto futures markets are non-stationary — the reward landscape shifts constantly. GA's population-based approach maintains diversity and adapts naturally."

**Sarah Chen (AI/ML)**: "Strategy DNA gives us something RL cannot: interpretable strategies we can audit. When a strategy makes money, we can see exactly WHY — which indicators, which thresholds, which risk parameters."

**Marcus Blackwood (Risk)**: "RL's exploration phase is inherently dangerous in live markets. GA lets us evaluate entire populations in paper trading with zero capital risk."

---

## Consequences

### Positive
- Faster iteration cycles — evaluate 10+ strategies per generation
- Zero live capital risk during exploration
- Human-readable strategies that can be audited and understood
- Natural diversity maintenance through population mechanics
- Easily serializable/deserializable strategy representation

### Negative
- May miss complex temporal patterns that deep RL could discover
- No gradient information — relies on stochastic search
- Fitness landscape may have deceptive local optima

### Mitigation
- Use large population sizes (10+ per generation) with wild card injection (10%)
- Multi-objective fitness scoring (not just profit — include Sharpe, Sortino, Drawdown)
- Periodic diversity injection to escape local optima

---

*Recorded as part of the Learner Institutional Memory Architecture.*
