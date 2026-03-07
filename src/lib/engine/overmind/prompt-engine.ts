// ============================================================
// Learner: Prompt Engine — Context-Aware Prompt Construction
// ============================================================
// 8 prompt templates for the Strategic Overmind, each with
// structured system prompts, data contexts, and JSON schemas.
// All prompts are pair-aware and regime-aware.
// ============================================================

import {
    type OvermindIslandContext,
    type PairProfile,
    type MarketHypothesis,
    type EvolutionDirective,
    type ReasoningEntry,
} from '@/types/overmind';
import { type StrategyDNA, MarketRegime } from '@/types';

// ─── System Prompt ───────────────────────────────────────────

const OVERMIND_SYSTEM_PROMPT = `You are the Strategic Overmind — the world's most advanced AI trading strategy architect. You operate as the meta-cognitive layer of a genetic algorithm-based trading system called Learner.

Your role:
- You DO NOT execute trades. You guide EVOLUTION of trading strategies.
- You analyze market conditions, strategy performance, and evolutionary dynamics.
- You generate hypotheses about what strategies SHOULD work and why.
- You suggest specific mutations, crossover targets, and new gene configurations.
- You discover novel indicators that don't exist in standard technical analysis.
- You act as both a creative strategist AND a rigorous adversarial tester.

The system uses these strategy components (all are evolvable genes):
- Standard indicators: RSI, EMA, SMA, MACD, Bollinger, ADX, ATR, StochRSI, Volume
- Microstructure genes: Volume Profile, Volume Acceleration, Candle Anatomy, Range Dynamics, Absorption
- Price Action genes: 10 candlestick formations, Structural Breaks, Swing Sequences, Compression, Gaps
- Composite Function genes: Mathematical operations (ADD, SUBTRACT, MULTIPLY, DIVIDE, MAX, MIN, ABS_DIFF, RATIO, NORMALIZE_DIFF) on any two indicator outputs with normalization (none, percentile, z_score, min_max)
- Directional Change genes: Event-based price analysis with evolved θ reversal threshold (Kampouridis framework)
- Risk genes: Stop-loss %, Take-profit %, Position size %, Max leverage

Market regimes: TRENDING_UP, TRENDING_DOWN, RANGING, HIGH_VOLATILITY, LOW_VOLATILITY

CRITICAL RULES:
- Risk rails are HARDCODED. Max 2% risk per trade, max 3 positions, max 10x leverage, mandatory stop-loss. You CANNOT suggest overriding these.
- Focus on LONG-TERM edge, not short-term gains.
- Prefer SIMPLE strategies over complex ones (Occam's Razor applies).
- Always provide reasoning for every suggestion.

Respond ONLY with the requested JSON format. No preamble, no explanation outside the JSON.`;

// ─── Template 1: Market Hypothesis Generation ────────────────

export function buildHypothesisPrompt(
    islands: OvermindIslandContext[],
    pairProfiles: PairProfile[],
    activeHypotheses: MarketHypothesis[],
): string {
    const islandSummaries = islands.map(i => ({
        slot: i.slotId,
        pair: i.pair,
        timeframe: i.timeframe,
        regime: i.currentRegime,
        generation: i.currentGeneration,
        bestFitness: i.bestFitness,
        avgFitness: i.avgFitness,
        fitnessTrend: i.fitnessTrend,
        topStrategies: i.topStrategies,
        trades: i.tradesSummary,
    }));

    const pairSummaries = pairProfiles.map(p => ({
        pair: p.pair,
        behavior: p.dominantBehavior,
        volatility: p.avgDailyVolatilityPercent,
        regimeFrequency: p.regimeFrequency,
        patterns: p.identifiedPatterns,
    }));

    const activeHypIds = activeHypotheses.map(h => ({
        id: h.id,
        pair: h.pair,
        hypothesis: h.hypothesis,
        status: h.status,
        confidence: h.confidence,
    }));

    return `Analyze the current state of all trading islands and generate market hypotheses.

## Current Island States
${JSON.stringify(islandSummaries, null, 2)}

## Pair Profiles
${JSON.stringify(pairSummaries, null, 2)}

## Active Hypotheses (avoid duplicating these)
${JSON.stringify(activeHypIds, null, 2)}

## Task
For each island that is underperforming (fitness < 50) or stagnating (flat fitness trend), generate 1-3 trading hypotheses. Each hypothesis should:
1. Identify a specific market behavior pattern for that pair+timeframe
2. Explain WHY a particular strategy approach would exploit this pattern
3. Suggest specific indicator combinations and gene configurations
4. Include confidence level and supporting evidence

Respond with JSON:
{
  "hypotheses": [
    {
      "slotId": "BTCUSDT:1h",
      "pair": "BTCUSDT",
      "timeframe": "1h",
      "regime": "TRENDING_UP",
      "hypothesis": "BTC tends to form bullish continuation patterns after volume absorption events during uptrends, providing high-probability long entries",
      "confidence": 0.72,
      "evidence": [
        { "type": "microstructure", "description": "Volume absorption signals institutional accumulation", "weight": 0.8 },
        { "type": "technical", "description": "RSI pullbacks to 40-50 zone during uptrends precede continuation", "weight": 0.6 }
      ],
      "suggestedIndicators": ["RSI", "EMA", "ATR", "VOLUME"],
      "suggestedDNA": {
        "indicators": [
          { "type": "RSI", "period": 14 },
          { "type": "EMA", "period": 21 }
        ],
        "directionBias": "LONG",
        "riskGenes": {
          "stopLossPercent": 1.5,
          "takeProfitPercent": 4.0,
          "positionSizePercent": 1.0,
          "maxLeverage": 5
        }
      }
    }
  ]
}`;
}

// ─── Template 2: Post-Mortem Analysis ────────────────────────

export function buildPostMortemPrompt(
    island: OvermindIslandContext,
    recentDirectives: EvolutionDirective[],
): string {
    const directiveSummaries = recentDirectives
        .filter(d => d.slotId === island.slotId)
        .slice(0, 3)
        .map(d => ({
            analysis: d.analysis,
            applied: d.applied,
            impact: d.impact,
        }));

    return `Perform a post-mortem analysis of the current generation for this island.

## Island State
${JSON.stringify({
        slot: island.slotId,
        pair: island.pair,
        timeframe: island.timeframe,
        regime: island.currentRegime,
        generation: island.currentGeneration,
        bestFitness: island.bestFitness,
        avgFitness: island.avgFitness,
        fitnessTrend: island.fitnessTrend,
        mutationRate: island.mutationRate,
        diversityIndex: island.diversityIndex,
        topStrategies: island.topStrategies,
        trades: island.tradesSummary,
    }, null, 2)}

## Previous Directives and Their Impact
${JSON.stringify(directiveSummaries, null, 2)}

## Task
Analyze:
1. Why the current best strategies are performing at their level
2. What's holding back improvement (stagnation, low diversity, wrong approach?)
3. Whether previous directives had the expected impact
4. What specific changes would most improve the next generation

Respond with JSON:
{
  "analysis": "Detailed analysis text explaining the current state",
  "populationHealth": {
    "diversityAssessment": "Population shows healthy diversity in indicator types but lacks variation in risk genes",
    "convergenceRisk": "low|medium|high",
    "stagnationRisk": "low|medium|high",
    "recommendedAction": "continue|increase_mutation|inject_diversity|refocus"
  },
  "mutations": [
    {
      "strategyId": "strategy-uuid",
      "strategyName": "Nova Tiger",
      "geneType": "risk",
      "currentWeakness": "Stop-loss too tight relative to ATR, causing premature exits",
      "suggestedChange": "Increase SL from 1.0% to 2.0% and adjust TP ratio accordingly",
      "expectedImprovement": "Should reduce premature exit rate by ~30%",
      "confidence": 0.7
    }
  ],
  "crossoverTargets": [
    {
      "parentAId": "uuid-a",
      "parentAName": "Nova Tiger",
      "parentBId": "uuid-b",
      "parentBName": "Ghost Falcon",
      "preferredGenesFromA": ["indicators", "entryRules"],
      "preferredGenesFromB": ["riskGenes", "exitRules"],
      "reasoning": "A has superior entry timing but B has better risk management",
      "confidence": 0.65
    }
  ],
  "newGeneProposals": [
    {
      "geneFamily": "composite",
      "description": "RATIO of RSI to EMA slope with z-score normalization",
      "expectedBenefit": "Captures momentum exhaustion better than RSI alone",
      "geneConfig": { "operation": "RATIO", "inputA": "RSI", "inputB": "EMA_slope", "normalization": "z_score" },
      "noveltyScore": 0.8,
      "confidence": 0.6
    }
  ],
  "fitnessAdjustments": []
}`;
}

// ─── Template 3: Pair Profile ────────────────────────────────

export function buildPairProfilePrompt(
    pair: string,
    stats: {
        avgVolume: number;
        avgSpread: number;
        avgDailyRange: number;
        volatility: number;
        regimeCounts: Record<string, number>;
        totalCandles: number;
    },
): string {
    return `Create a comprehensive microstructure profile for the trading pair ${pair}.

## Market Statistics
${JSON.stringify(stats, null, 2)}

## Task
Analyze this pair's characteristics and create a profile that will help the evolution engine create better strategies specifically for this pair.

Respond with JSON:
{
  "pair": "${pair}",
  "liquidityScore": 0.85,
  "avgDailyVolatilityPercent": 3.2,
  "regimeFrequency": {
    "TRENDING_UP": 0.25,
    "TRENDING_DOWN": 0.20,
    "RANGING": 0.30,
    "HIGH_VOLATILITY": 0.15,
    "LOW_VOLATILITY": 0.10
  },
  "dominantBehavior": "trending|ranging|volatile|mixed",
  "characterSummary": "Detailed summary of this pair's characteristics...",
  "suggestedArchetypes": [
    {
      "name": "Trend Rider",
      "description": "Captures sustained directional moves using EMA crossovers and ADX confirmation",
      "bestRegime": "TRENDING_UP",
      "suggestedIndicators": ["EMA", "ADX", "ATR"],
      "suggestedRiskProfile": {
        "stopLossRange": [1.0, 2.5],
        "takeProfitRange": [3.0, 8.0],
        "leverageRange": [3, 7]
      },
      "confidence": 0.75
    }
  ],
  "identifiedPatterns": [
    "Tends to form V-shaped recoveries after sharp selloffs",
    "Weekend volume drops create gap-fill opportunities on Monday"
  ]
}`;
}

// ─── Template 4: Adversarial Scenario Generation ─────────────

export function buildAdversarialPrompt(
    strategy: {
        name: string;
        indicators: string[];
        riskGenes: { stopLossPercent: number; takeProfitPercent: number; maxLeverage: number };
        hasAdvancedGenes: boolean;
        advancedGeneTypes: string[];
    },
    regime: MarketRegime | null,
): string {
    return `Generate adversarial market scenarios designed to stress-test this trading strategy.

## Strategy Under Test
${JSON.stringify(strategy, null, 2)}

## Current Market Regime
${regime ?? 'UNKNOWN'}

## Task
Think like a red team attacker. Identify the WEAKEST points of this strategy and create scenarios that would specifically exploit those weaknesses. Generate 3-5 adversarial scenarios ranging from medium to critical severity.

Respond with JSON:
{
  "scenarios": [
    {
      "name": "Liquidity Vacuum",
      "description": "Sudden liquidity withdrawal causing massive spread widening and slippage. Stop-losses execute at significantly worse prices than expected.",
      "conditions": [
        { "variable": "liquidity", "change": "collapse", "magnitude": 0.9, "description": "90% liquidity drop within 5 minutes" },
        { "variable": "spread", "change": "spike", "magnitude": 0.8, "description": "Spread widens 20x normal" }
      ],
      "targetedVulnerabilities": ["Stop-loss slippage", "Position sizing assumes normal liquidity"],
      "severity": "critical",
      "adversarialReasoning": "This strategy uses a 1.5% stop-loss, but in a liquidity vacuum the actual exit could be 3-5% away, turning a controlled loss into a catastrophic one"
    }
  ]
}`;
}

// ─── Template 5: Emergent Indicator Discovery ────────────────

export function buildEmergentIndicatorPrompt(
    existingIndicators: string[],
    regime: MarketRegime | null,
    island: OvermindIslandContext,
): string {
    return `Discover novel indicators that could provide trading edge for ${island.pair} in ${regime ?? 'current'} market conditions.

## Current Indicator Arsenal
Standard: ${existingIndicators.join(', ')}
Composite Functions: The system can create f(indicator_A, indicator_B) using operations: ADD, SUBTRACT, MULTIPLY, DIVIDE, MAX, MIN, ABS_DIFF, RATIO, NORMALIZE_DIFF with normalizations: none, percentile, z_score, min_max

## Island Context
${JSON.stringify({
        pair: island.pair,
        timeframe: island.timeframe,
        regime: island.currentRegime,
        bestFitness: island.bestFitness,
        topStrategies: island.topStrategies,
    }, null, 2)}

## Task
Think beyond standard technical analysis. What NOVEL indicators could capture market dynamics that existing indicators miss? Focus on:
1. Compound signals that combine price action with volume/microstructure
2. Ratio-based indicators that normalize across different market conditions
3. Divergence-based indicators that capture regime transitions
4. Event-driven signals that capture structural market changes

Each indicator must be expressible as a CompositeFunctionGene.

Respond with JSON:
{
  "indicators": [
    {
      "name": "Volume-Weighted Momentum Exhaustion",
      "description": "Measures the ratio of price momentum to volume momentum. When price moves faster than volume supports, exhaustion is likely.",
      "formula": "RATIO(EMA_slope_fast, volume_acceleration) with z_score normalization",
      "compositeGene": {
        "operation": "RATIO",
        "inputA": "EMA",
        "inputAField": "slope",
        "inputB": "VOLUME",
        "inputBField": "acceleration",
        "normalization": "z_score",
        "threshold": 2.0
      },
      "reasoning": "Standard RSI only looks at price. This indicator correlates price momentum with volume commitment. High price momentum with low volume suggests unsustainable move.",
      "expectedEdge": "Should improve exit timing by ~15% by detecting exhaustion 2-3 candles earlier",
      "bestRegime": "TRENDING_UP"
    }
  ]
}`;
}

// ─── Template 6: RSRD Synthesis ──────────────────────────────

export function buildRSRDPrompt(
    topStrategies: Array<{
        name: string;
        fitness: number;
        indicators: string[];
        hasAdvancedGenes: boolean;
        riskGenes: unknown;
    }>,
    regime: MarketRegime | null,
): string {
    return `Perform Recursive Strategy Decomposition & Recombination on these top-performing strategies.

## Top Strategies to Decompose
${JSON.stringify(topStrategies, null, 2)}

## Current Regime
${regime ?? 'UNKNOWN'}

## Task
1. DECOMPOSE each strategy into semantic atoms (entry mechanism, exit mechanism, risk profile, indicator setup, advanced genes)
2. ANALYZE why each atom is effective
3. Identify which atoms from DIFFERENT strategies would create SYNERGY if combined
4. SYNTHESIZE a new strategy by combining the best atoms in a way that standard 2-parent crossover would never achieve

Respond with JSON:
{
  "selectedAtoms": [
    {
      "component": "entry_signal",
      "sourceStrategyId": "ignored-use-name",
      "sourceStrategyName": "Nova Tiger",
      "description": "RSI divergence + EMA crossover entry",
      "reasoning": "This entry catches momentum shifts early with double confirmation",
      "bestRegime": "TRENDING_UP",
      "estimatedFitnessContribution": 25,
      "geneData": {}
    }
  ],
  "compatibilityReasoning": "Detailed reasoning about why these atoms work together...",
  "expectedSynergy": "Expected combined fitness improvement of 15-20% over best individual parent",
  "confidence": 0.7
}`;
}

// ─── Template 7: Cross-Pair Transfer ─────────────────────────

export function buildCrossPairTransferPrompt(
    islands: OvermindIslandContext[],
): string {
    const summaries = islands.map(i => ({
        slot: i.slotId,
        pair: i.pair,
        timeframe: i.timeframe,
        bestFitness: i.bestFitness,
        topStrategies: i.topStrategies.map(s => ({
            name: s.name,
            fitness: s.fitness,
            indicators: s.indicators,
        })),
    }));

    return `Analyze cross-pair patterns to identify transferable vs pair-specific strategies.

## All Islands
${JSON.stringify(summaries, null, 2)}

## Task
1. Identify UNIVERSAL patterns that work across multiple pairs (e.g., "momentum continuation after volume spike")
2. Identify PAIR-SPECIFIC patterns that should stay isolated
3. Suggest specific strategy transfers between islands (which strategy from which island would benefit which other island)

Respond with JSON:
{
  "universalPatterns": [
    { "pattern": "Volume spike + RSI pullback entry", "applicablePairs": ["BTCUSDT", "ETHUSDT"], "confidence": 0.7 }
  ],
  "pairSpecificPatterns": [
    { "pair": "BTCUSDT", "pattern": "Weekend gap-fill tendency", "confidence": 0.6 }
  ],
  "suggestedTransfers": [
    {
      "fromSlotId": "BTCUSDT:1h",
      "toSlotId": "ETHUSDT:1h",
      "strategyName": "Nova Tiger",
      "reasoning": "Strong RSI divergence entry would benefit from ETH's higher volatility",
      "adaptationNeeded": "Widen stop-loss by 30% for ETH's higher ATR",
      "confidence": 0.6
    }
  ]
}`;
}

// ─── Template 8: Mutation Directive ──────────────────────────

export function buildMutationDirectivePrompt(
    island: OvermindIslandContext,
    strategies: Array<{
        id: string;
        name: string;
        fitness: number;
        indicators: string[];
        riskGenes: unknown;
    }>,
): string {
    return `Suggest targeted mutations for underperforming strategies in island ${island.slotId}.

## Island Context
${JSON.stringify({
        pair: island.pair,
        timeframe: island.timeframe,
        regime: island.currentRegime,
        generation: island.currentGeneration,
        fitnessTrend: island.fitnessTrend,
    }, null, 2)}

## Strategies Needing Improvement (sorted by fitness, ascending)
${JSON.stringify(strategies, null, 2)}

## Task
For each strategy below fitness 50, suggest 1-2 specific mutations that would improve performance. Be precise about which gene to change and what value to change it to.

Respond with JSON:
{
  "mutations": [
    {
      "strategyId": "the-strategy-id",
      "strategyName": "Ghost Falcon",
      "geneType": "indicator|signal|risk|microstructure|priceAction|composite|dc",
      "currentWeakness": "What's wrong with the current configuration",
      "suggestedChange": "Specific change to make",
      "expectedImprovement": "What this should fix",
      "confidence": 0.7
    }
  ]
}`;
}

// ─── Prompt Access ───────────────────────────────────────────

export function getSystemPrompt(): string {
    return OVERMIND_SYSTEM_PROMPT;
}
