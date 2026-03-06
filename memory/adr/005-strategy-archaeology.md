# ADR-005: Strategy Archaeology — Explainable AI for Genetic Strategy Evolution

**Status**: Accepted
**Date**: 2026-03-06

## Context

The Learner AI system evolves trading strategies through genetic algorithms. Users can see fitness scores, validation results, and roster entries — but they cannot see HOW or WHY the AI arrived at its decisions. This creates a "black box" problem: even with 8 panels showing results, the user has no insight into the evolutionary reasoning.

No existing trading platform in the world offers explainability at the genetic level.

## Decision

Add a **Strategy Archaeology** layer (3 panels) to the Pipeline Dashboard that makes the AI's evolutionary process explainable:

### 1. Gene Lineage Tree
- Visual family tree showing each strategy's origin (random genesis / seeded from Experience Replay / crossover / mutation)
- Strategy ancestry tracking across generations
- Validated strategies (champions) highlighted with distinct visual treatment

### 2. Gene Survival Heatmap
- Grid of gene types × generation numbers
- Cell brightness = fitness of that gene in that generation
- **Persistent genes** (≥60% survival rate across generations) identified as "proven patterns" with glow animation
- Sorted by persistence score — most persistent genes at top
- Inspired by phylogenetic analysis from evolutionary biology

### 3. Decision Explainer
- When a market regime change occurs, shows WHY the AI chose a particular strategy
- Cause-chain reasoning: past regime performance, Bayesian confidence score, profitable trade rate, proven gene lineage
- Shows rejected alternatives with explicit rejection reasons
- Outcome tracking (Profitable / Loss / Pending)

## Rationale

- **Explainability builds trust**: Users need to understand AI decisions, not just see results
- **Persistent genes = proven patterns**: If RSI(14) survives 11/14 generations, that's not random — it's a signal the AI has learned something
- **Decision transparency**: When the AI switches strategies during regime changes, explaining WHY prevents the user from questioning the system's judgment
- **No existing solution**: This approach is unique — no trading platform visualizes genetic algorithm decisions at this level

## Consequences

### Positive
- Users can identify which indicator/risk/signal combinations the AI has "proven" through evolution
- Regime change decisions become transparent and trustworthy
- The AI transitions from "black box" to "explainable system"
- Gene persistence data can inform future seeding decisions

### Negative
- Additional rendering complexity on the pipeline page (3 more panels)
- Demo data generators add code complexity (~250 lines)
- Persistent gene calculation adds computational overhead when connected to live data

### Mitigation
- Panels use efficient CSS (grid layouts, minimal reflows)
- Demo data generators are stateless pure functions
- Gene persistence calculation can be cached per generation cycle
