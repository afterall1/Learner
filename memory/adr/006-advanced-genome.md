# ADR-006: Advanced Strategy Genome Architecture

**Status**: Accepted
**Date**: 2026-03-06
**Council**: 7-member expert council (Neuroevolution, Financial ML, GP-Trading, AI/ML Architecture, Risk Management, System Architecture, Genetic Programming)

## Context

The Learner AI's evolution engine was limited to optimizing **indicator parameters** — the `period` of an RSI, the `stdDev` of a Bollinger Band. While the GA could tune these values effectively, the genome **structure** was fixed. Every strategy was essentially: "standard indicators → threshold comparison → entry/exit."

This meant the AI could never discover strategies based on:
- Volume microstructure patterns (absorption, volume profile)
- Raw price action (engulfing patterns, structural breaks)
- Mathematical compositions of multiple signals
- Non-time-based price analysis (event-driven frameworks)

The system needed to evolve **what** to analyze, not just **how much**.

## Decision

Implement 5 new evolvable gene families as optional extensions to `StrategyDNA`:

1. **Microstructure Genes**: Volume Profile, Volume Acceleration, Candle Anatomy, Range Expansion/Contraction, Absorption Detection
2. **Price Action Genes**: 10 candlestick formations with evolvable thresholds, Structural Breaks, Swing Sequences, Compression/Breakout, Gap Analysis
3. **Composite Function Genes**: Mathematical evolution of indicator relationships via 9 operations × 4 normalization methods
4. **Multi-TF Confluence Genes**: Cross-timeframe alignment detection (types defined, awaiting multi-TF data)
5. **Directional Change Genes**: Kampouridis's event-based price analysis with evolved θ reversal threshold

These are integrated via:
- `generateRandomStrategy()` — 40% injection rate per gene family
- `crossover()` — advanced gene blending between parents
- `mutate()` — perturbation of existing + injection of new advanced genes
- `calculateFitnessScore()` — structural novelty bonus (+8 max points, decaying over 200 generations)
- `calculateAdvancedSignals()` — central signal calculation for all advanced genes

## Rationale

### Why Structural Evolution Over More Indicators?
Adding more standard indicators (VolumeProfile indicator, CandlestickPattern indicator) would still lock the system into "threshold comparison" strategies. Structural evolution lets the GA:
- **Compose** indicators mathematically (`ABS_DIFF(RSI_14, EMA_slope)`)
- **Parameterize** pattern detection (what counts as "engulfing" is evolved, not hardcoded)
- **Escape time-based analysis** entirely (DC framework uses price events, not candles)

### Why Composite Functions?
This is the most powerful innovation. Instead of evaluating each indicator independently, the GA can discover relationships like:
- `RATIO(ATR_7, ATR_21)` — volatility compression detector
- `NORMALIZE_DIFF(RSI_14, RSI_28)` — RSI divergence
- `ABS_DIFF(EMA_20, SMA_50)` — trend-momentum divergence

These are novel compound signals no human would think to hardcode.

### Why Directional Changes?
Traditional technical analysis uses fixed time intervals (1h, 4h candles). But markets don't respect clock time. The DC framework re-segments price based on **events** — a θ% reversal triggers a new segment, regardless of how many candles it took. The GA evolves the θ threshold, discovering the market's "natural rhythm."

## Consequences

### Positive
- AI can now discover structurally novel strategies (not just parameter variants)
- Composite functions can detect hidden relationships between indicators
- DC framework provides time-independent market analysis
- All advanced genes are backward compatible (optional fields)
- Novelty bonus incentivizes exploration of advanced genes without permanently biasing fitness

### Negative
- Increased genome complexity → larger search space for the GA
- Composite functions can create nonsensical combinations (mitigated by fitness-based selection)
- DC events require sufficient price history for statistical significance

### Mitigation
- Complexity penalty (existing) naturally penalizes overly complex genomes
- Novelty bonus decays over 200 generations, preventing permanent bias
- Each advanced gene type has bounded parameter ranges
- Structural complexity is tracked as a 0-1 metric for monitoring
