# ADR-004: Meta-Evolution (GA²) — Second-Layer Genetic Algorithm

**Status**: Accepted
**Date**: 2026-03-06

## Context

The Learner system's Island Model architecture runs multiple isolated Genetic Algorithm (GA) instances, each evolving trading strategies for a specific pair+timeframe. However, the GA *parameters themselves* — mutation rate, crossover rate, population size, elitism ratio, tournament size, and fitness metric weights — are static. This means each island operates with identical evolution dynamics regardless of whether it's evolving strategies for a volatile pair like SOLUSDT or a stable pair like BTCUSDT.

The challenge: different market conditions and asset characteristics require different evolution dynamics. A volatile market benefits from higher exploration (higher mutation), while a stable market benefits from faster convergence (higher elitism).

## Decision

Implement a **second-layer Genetic Algorithm (GA²)** — "Meta-Evolution" — that evolves the evolution parameters themselves. Each island receives a **HyperDNA** genome that controls its GA behavior. The Cortex orchestrator periodically evaluates island performance, performs meta-crossover between successful HyperDNA genomes, and applies conservative meta-mutation to produce new parameter sets.

### HyperDNA Genome Structure
| Gene | Range | Controls |
|------|-------|----------|
| mutationRate | 0.01 – 0.5 | How aggressively new strategies differ from parents |
| crossoverRate | 0.3 – 0.9 | Probability of sexual reproduction vs. cloning |
| populationSize | 6 – 30 | Number of strategies per generation |
| elitismRate | 0.1 – 0.5 | Fraction of top strategies preserved unchanged |
| tournamentSize | 2 – 5 | Selection pressure in tournament |
| fitnessWeights | (6 floats) | Relative importance of Sharpe, Sortino, PF, Expectancy, Max DD, Win Rate |

### Meta-Fitness = f(convergence_speed, peak_fitness, stability, validation_pass_rate)

## Rationale

### Why not manual tuning?
Manual tuning doesn't scale with 5+ concurrent islands each facing different market conditions. Manual tuning also cannot adapt over time as market regimes shift.

### Why GA² over Bayesian Optimization?
- GA² naturally fits the existing GA infrastructure (reuse crossover/mutation patterns)
- Bayesian optimization is better for continuous optimization of few parameters; GA² handles the combinatorial aspect of discrete + continuous mixed parameters
- GA² allows each island to evolve its own parameters (*island-specific adaptation*), not just a global optimum

### Why conservative mutation (±10%)?
Meta-level changes have cascading effects. A radical HyperDNA mutation could destabilize an entire island's evolution history. The ±10% max perturbation + stability guard prevents catastrophic parameter shifts while still allowing meaningful adaptation over multiple meta-generations.

## Consequences

### Positive
- Islands self-tune their evolution dynamics based on actual performance feedback
- Volatile pairs can evolve higher mutation rates; stable pairs can evolve higher elitism
- System becomes more autonomous — one fewer knob for humans to tune
- Fitness weights adapt to reflect which metrics actually predict profitability in different market conditions

### Negative
- Added complexity in the Cortex orchestration layer
- Meta-evolution cycles are slow — meaningful feedback only after 10+ generations
- Risk of meta-overfitting (mitigated by stability guard and conservative mutation)
- Debugging becomes harder when evolution behavior varies per-island

### Mitigation
- Stability guard clamps all HyperDNA values to safe ranges
- Conservative meta-mutation (±10%) prevents catastrophic parameter shifts
- Meta-evolution only triggers every 10 generations, giving islands time to demonstrate performance
- HyperDNA is logged and trackable in the Cortex Neural Map dashboard

---

*This ADR was created as part of the Meta-Evolution implementation session.*
