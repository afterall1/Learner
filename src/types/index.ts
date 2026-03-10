// ============================================================
// Learner: Self-Evolving AI Trading System — Core Type System
// ============================================================

// ─── Enums ───────────────────────────────────────────────────

export enum TradeDirection {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export enum TradeStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum BrainState {
  IDLE = 'IDLE',
  EXPLORING = 'EXPLORING',
  EVALUATING = 'EVALUATING',
  EVOLVING = 'EVOLVING',
  TRADING = 'TRADING',
  VALIDATING = 'VALIDATING',
  SHADOW_TRADING = 'SHADOW_TRADING',
  PAUSED = 'PAUSED',
  EMERGENCY_STOP = 'EMERGENCY_STOP',
}

export enum StrategyStatus {
  PAPER = 'PAPER',
  CANDIDATE = 'CANDIDATE',
  SHADOW = 'SHADOW',
  ACTIVE = 'ACTIVE',
  RETIRED = 'RETIRED',
}

export enum Timeframe {
  M1 = '1m',
  M5 = '5m',
  M15 = '15m',
  H1 = '1h',
  H4 = '4h',
  D1 = '1d',
}

export enum IndicatorType {
  RSI = 'RSI',
  EMA = 'EMA',
  SMA = 'SMA',
  MACD = 'MACD',
  BOLLINGER = 'BOLLINGER',
  ADX = 'ADX',
  ATR = 'ATR',
  VOLUME = 'VOLUME',
  STOCH_RSI = 'STOCH_RSI',
}

export enum SignalCondition {
  ABOVE = 'ABOVE',
  BELOW = 'BELOW',
  CROSS_ABOVE = 'CROSS_ABOVE',
  CROSS_BELOW = 'CROSS_BELOW',
  BETWEEN = 'BETWEEN',
  INCREASING = 'INCREASING',
  DECREASING = 'DECREASING',
}

// ─── Market Data ─────────────────────────────────────────────

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketTick {
  symbol: string;
  price: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface FundingRate {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  nextFundingTime: number;
}

// ─── Market Regime ───────────────────────────────────────────

export enum MarketRegime {
  TRENDING_UP = 'TRENDING_UP',
  TRENDING_DOWN = 'TRENDING_DOWN',
  RANGING = 'RANGING',
  HIGH_VOLATILITY = 'HIGH_VOLATILITY',
  LOW_VOLATILITY = 'LOW_VOLATILITY',
}

// ─── Strategy DNA (Genome) ───────────────────────────────────

export interface IndicatorGene {
  id: string;
  type: IndicatorType;
  period: number;
  params: Record<string, number>; // e.g. { fastPeriod: 12, slowPeriod: 26 }
}

export interface SignalRule {
  id: string;
  indicatorId: string;
  condition: SignalCondition;
  threshold: number;
  secondaryThreshold?: number; // For BETWEEN condition
}

export interface EntryExitRules {
  entrySignals: SignalRule[]; // All must be true (AND logic)
  exitSignals: SignalRule[]; // Any can trigger exit (OR logic)
  trailingStopPercent?: number;
}

export interface RiskGenes {
  stopLossPercent: number; // 0.5 - 5.0%
  takeProfitPercent: number; // 1.0 - 15.0%
  positionSizePercent: number; // 0.5 - 2.0% of balance
  maxLeverage: number; // 1 - 10x
}

export interface StrategyDNA {
  id: string;
  name: string;
  slotId: string;            // Island slot ID this strategy belongs to
  generation: number;
  parentIds: string[]; // For lineage tracking
  createdAt: number;
  indicators: IndicatorGene[];
  entryRules: EntryExitRules;
  exitRules: EntryExitRules;
  preferredTimeframe: Timeframe;
  preferredPairs: string[];
  riskGenes: RiskGenes;
  directionBias: TradeDirection | null; // null = both directions
  status: StrategyStatus;

  // ─── Advanced Genes (Phase 9) ────────────────────────────
  // Optional arrays — backward compatible with all existing strategies
  microstructureGenes?: MicrostructureGene[];        // Volume profile, candle anatomy, absorption
  priceActionGenes?: PriceActionGene[];              // Candlestick patterns, structural breaks
  compositeGenes?: CompositeFunctionGene[];          // Mathematical indicator relationships
  confluenceGenes?: TimeframeConfluenceGene[];       // Multi-TF alignment
  dcGenes?: DirectionalChangeGene[];                 // Event-based directional changes

  // ─── Order Flow Intelligence (Phase 9.5) ──────────────────
  orderFlowGenes?: OrderFlowGene[];                   // Volume delta, large trades, liquidations

  // ─── Quality-Diversity (Phase 18) ─────────────────────────
  behaviorDescriptor?: BehaviorDescriptor;            // Behavioral niche in MAP-Elites grid
  tradeStyleClassification?: TradeStyle;              // Derived from avg hold duration

  // ─── Genome Topology (Phase 18.2 — NEAT-Inspired) ────────
  innovationNumbers?: Record<string, number>;         // geneId → innovation number for alignment
  speciesId?: number;                                 // Species membership for speciated evolution

  metadata: {
    mutationHistory: string[];
    fitnessScore: number;
    tradeCount: number;
    lastEvaluated: number | null;
    validation: StrategyValidation | null;
    structuralComplexity?: number;  // 0-1 measure of genome structural diversity

    // ─── Strategic Overmind (Phase 15) ──────────────────────
    /** Which Overmind subsystem originated this strategy */
    overmindOrigin?: 'hypothesis' | 'rsrd' | 'emergent' | 'adversarial_hardened';
    /** Link to the hypothesis that created this seed */
    hypothesisId?: string;
    /** Link to the directive that guided mutation */
    directiveId?: string;
    /** Resilience score from adversarial testing (0-100) */
    resilienceScore?: number;

    // ─── Coevolutionary Robustness (Phase 18.1) ─────────────
    /** Composite robustness from coevolutionary testing */
    robustnessScore?: RobustnessScore;
  };
}

// ─── Performance Metrics ─────────────────────────────────────

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // 0-1
  profitFactor: number; // gross profit / gross loss
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number; // percentage
  maxDrawdownDuration: number; // in ms
  averageRR: number; // average risk:reward ratio
  expectancy: number; // avg win * winRate - avg loss * lossRate
  totalPnlPercent: number;
  totalPnlUSD: number;
  averageWinPercent: number;
  averageLossPercent: number;
  largestWinPercent: number;
  largestLossPercent: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  averageHoldTime: number; // in ms
}

// ─── Trade ───────────────────────────────────────────────────

export interface Trade {
  id: string;
  strategyId: string;
  strategyName: string;
  slotId: string;            // Island slot ID (e.g., "BTCUSDT:1h")
  symbol: string;
  direction: TradeDirection;
  status: TradeStatus;
  isPaperTrade: boolean;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  pnlPercent: number | null;
  pnlUSD: number | null;
  fees: number;
  entryTime: number;
  exitTime: number | null;
  entryReason: string; // AI reasoning for entry
  exitReason: string | null; // AI reasoning for exit
  indicators: Record<string, number>; // Snapshot of indicator values at entry
}

// ─── Position ────────────────────────────────────────────────

export interface Position {
  id: string;
  slotId: string;            // Island slot ID
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  margin: number;
  liquidationPrice: number;
  stopLoss: number;
  takeProfit: number;
  strategyId: string;
  isPaperTrade: boolean;
  openTime: number;
}

// ─── Evolution ───────────────────────────────────────────────

export interface EvolutionGeneration {
  id: string;
  generationNumber: number;
  createdAt: number;
  completedAt: number | null;
  population: StrategyDNA[];
  bestStrategyId: string | null;
  bestFitnessScore: number;
  averageFitnessScore: number;
  metrics: {
    totalTradesExecuted: number;
    populationSize: number;
    mutationRate: number;
    crossoverRate: number;
    survivalRate: number;
  };
}

// ─── Risk Configuration ──────────────────────────────────────

export interface RiskConfig {
  maxRiskPerTrade: number; // 0.02 = 2%
  maxSimultaneousPositions: number; // 3
  dailyDrawdownLimit: number; // 0.05 = 5%
  totalDrawdownLimit: number; // 0.15 = 15%
  maxLeverage: number; // 10
  paperTradeMinimum: number; // 50 trades before live
  emergencyStopEnabled: boolean;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxRiskPerTrade: 0.02,
  maxSimultaneousPositions: 3,
  dailyDrawdownLimit: 0.05,
  totalDrawdownLimit: 0.15,
  maxLeverage: 10,
  paperTradeMinimum: 50,
  emergencyStopEnabled: true,
};

// ─── Brain Log ───────────────────────────────────────────────

export enum LogLevel {
  INFO = 'INFO',
  DECISION = 'DECISION',
  TRADE = 'TRADE',
  EVOLUTION = 'EVOLUTION',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  RISK = 'RISK',
}

export interface BrainLog {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
  strategyId?: string;
  tradeId?: string;
}

// ─── Dashboard State ─────────────────────────────────────────

export interface PortfolioSummary {
  totalBalance: number;
  availableBalance: number;
  unrealizedPnl: number;
  todayPnl: number;
  todayPnlPercent: number;
  weekPnl: number;
  weekPnlPercent: number;
  allTimePnl: number;
  allTimePnlPercent: number;
  activePositions: number;
  totalTrades: number;
}

export interface DashboardConfig {
  selectedPair: string;
  selectedTimeframe: Timeframe;
  isTestnet: boolean;
  autoTradeEnabled: boolean;
}

// ─── Walk-Forward Analysis ───────────────────────────────────

export interface WalkForwardConfig {
  inSampleRatio: number;        // 0.7 = 70% in-sample
  windowCount: number;          // Number of rolling windows
  minTradesPerWindow: number;   // Minimum trades required per window
  efficiencyThreshold: number;  // Min OOS/IS ratio to pass (0.5)
}

export const DEFAULT_WFA_CONFIG: WalkForwardConfig = {
  inSampleRatio: 0.7,
  windowCount: 3,
  minTradesPerWindow: 10,
  efficiencyThreshold: 0.5,
};

export interface WalkForwardWindow {
  windowIndex: number;
  inSampleMetrics: PerformanceMetrics;
  outOfSampleMetrics: PerformanceMetrics;
  inSampleTradeCount: number;
  outOfSampleTradeCount: number;
  efficiencyRatio: number;      // OOS fitness / IS fitness
  degradation: number;          // 1 - efficiency (how much perf drops)
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  averageEfficiency: number;
  worstEfficiency: number;
  averageDegradation: number;
  passed: boolean;
  reason: string;
}

// ─── Monte Carlo Validation ─────────────────────────────────

export interface MonteCarloConfig {
  numSimulations: number;       // 1000 default
  confidenceLevel: number;      // 0.95 = 95th percentile
  metricToTest: 'sharpeRatio' | 'profitFactor' | 'expectancy';
}

export const DEFAULT_MC_CONFIG: MonteCarloConfig = {
  numSimulations: 1000,
  confidenceLevel: 0.95,
  metricToTest: 'sharpeRatio',
};

export interface MonteCarloResult {
  originalMetricValue: number;
  simulatedMean: number;
  simulatedStdDev: number;
  percentileRank: number;       // Where the original sits in the distribution (0-1)
  pValue: number;               // Probability of observing this result by chance
  confidenceThreshold: number;
  isSignificant: boolean;       // pValue < (1 - confidenceLevel)
  distributionSample: number[]; // First 100 simulated values for visualization
}

// ─── Overfitting Detection ───────────────────────────────────

export interface OverfittingReport {
  overallScore: number;           // 0-100 where 0=safe, 100=clearly overfit
  components: {
    wfaEfficiency: number;        // WFA component score (0-100)
    monteCarloSignificance: number; // MC component score (0-100)
    complexityPenalty: number;    // Complexity component score (0-100)
    regimeDiversity: number;      // Regime diversity score (0-100)
    returnConsistency: number;    // Return consistency score (0-100)
  };
  passed: boolean;                // overallScore < 40
  recommendations: string[];
}

// ─── Validation Gate ─────────────────────────────────────────

export interface ValidationGateResult {
  gateName: string;
  passed: boolean;
  score: number;
  details: string;
  timestamp: number;
}

export interface StrategyValidation {
  gates: ValidationGateResult[];
  overallPassed: boolean;
  walkForwardResult: WalkForwardResult | null;
  monteCarloResult: MonteCarloResult | null;
  overfittingReport: OverfittingReport | null;
  regimesTraded: MarketRegime[];
  validatedAt: number;
  promotionStage: StrategyStatus;
}

// ─── Strategy Memory (Cross-Generation Learning) ─────────────

export interface RegimeGenePerformance {
  regime: MarketRegime;
  indicatorTypes: IndicatorType[];
  avgFitness: number;
  sampleCount: number;
  lastUpdated: number;
}

export interface RegimeGeneMemory {
  entries: RegimeGenePerformance[];
  totalStrategiesTested: number;
  generationsProcessed: number;
}

// ─── Island Model Types ──────────────────────────────────────

export interface IslandSnapshot {
  slotId: string;
  pair: string;
  timeframe: Timeframe;
  state: BrainState;
  activeStrategy: StrategyDNA | null;
  candidateStrategies: StrategyDNA[];
  currentGeneration: number;
  totalGenerations: number;
  totalTrades: number;
  bestFitnessAllTime: number;
  currentMutationRate: number;
  currentRegime: MarketRegime | null;
  validatedStrategies: StrategyDNA[];
  retiredStrategies: StrategyDNA[];
  allocatedCapital: number;
  performanceMetrics: PerformanceMetrics | null;
  logs: BrainLog[];
}

export interface CortexSnapshot {
  islands: IslandSnapshot[];
  globalState: BrainState;
  totalIslands: number;
  activeIslands: number;
  totalTradesAllIslands: number;
  globalBestFitness: number;
  capitalAllocations: IslandAllocation[];
  migrationHistory: MigrationEvent[];
  globalLogs: BrainLog[];
  totalCapital: number;
  /** Strategic Overmind snapshot (Phase 15) — null if Overmind disabled */
  overmindSnapshot?: import('./overmind').OvermindSnapshot;
  /** Risk Manager GLOBAL snapshot — 8 safety rails state */
  riskSnapshot?: RiskSnapshot;
}

export interface RiskSnapshot {
  /** Emergency stop currently active */
  emergencyStopActive: boolean;
  /** Running daily PnL in USD */
  dailyPnl: number;
  /** Balance at the start of the current day */
  dailyStartBalance: number;
  /** Balance at the start of lifetime tracking */
  totalStartBalance: number;
  /** Current daily drawdown (0-1) */
  dailyDrawdownPct: number;
  /** Current total drawdown from peak (0-1) */
  totalDrawdownPct: number;
  /** Number of currently open positions (GLOBAL) */
  openPositionCount: number;
  /** Composite global risk score (0-100) */
  globalRiskScore: number;
  /** All 8 hardcoded rail thresholds */
  rails: {
    maxRiskPerTrade: number;
    maxSimultaneousPositions: number;
    dailyDrawdownLimit: number;
    totalDrawdownLimit: number;
    maxLeverage: number;
    mandatoryStopLoss: boolean;
    paperTradeMinimum: number;
    emergencyStopEnabled: boolean;
  };
  /** Current utilization of position/drawdown rails (0-1) */
  railUtilizations: {
    positionUtil: number;
    dailyDrawdownUtil: number;
    totalDrawdownUtil: number;
  };
  /** Recent risk check logs (last 10) */
  recentLogs: import('./index').BrainLog[];
}

export interface MigrationEvent {
  id: string;
  sourceSlotId: string;
  targetSlotId: string;
  strategyName: string;
  strategyFitness: number;
  timestamp: number;
  migrationAffinity: number;  // 0-1 how similar the source and target are
}

export interface IslandAllocation {
  slotId: string;
  weight: number;              // 0-1 normalized weight
  allocatedCapital: number;    // USD allocated to this island
  percentOfTotal: number;      // 0-100 percent of total capital
  lifetimeBestFitness: number;
  recentTrend: number;         // Recent performance trend (-1 to 1)
}

// ─── Meta-Evolution (GA²) ────────────────────────────────────

/**
 * HyperDNA — The genome that controls HOW the evolution engine evolves strategies.
 * This is the second layer of the GA² architecture: a genetic algorithm
 * that optimizes the parameters of the genetic algorithm itself.
 *
 * Each Island carries its own HyperDNA, allowing different pair:timeframe
 * combinations to discover their own optimal evolution dynamics.
 */
export interface HyperDNA {
  id: string;                   // UUID v4
  generation: number;           // Meta-generation number
  parentIds: string[];          // Parents for meta-crossover lineage
  createdAt: number;            // Unix timestamp (ms)

  // ─── Evolution Parameters (what the meta-GA evolves) ─────
  evolutionGenes: {
    populationSize: number;       // 6-30 — strategies per generation
    elitismRate: number;          // 0.1-0.4 — proportion of elite survivors
    mutationRate: number;         // 0.05-0.6 — base mutation probability
    crossoverRate: number;        // 0.3-0.9 — crossover vs mutation balance
    tournamentSize: number;       // 2-7 — selection pressure
    wildCardRate: number;         // 0.05-0.3 — random injection proportion
    stagnationThreshold: number;  // 2-8 — generations before mutation boost
    diversityMinimum: number;     // 0.1-0.6 — minimum population diversity
  };

  // ─── Fitness Weight Genes ────────────────────────────────
  fitnessWeights: {
    sharpeWeight: number;         // 0.05-0.5 — Sharpe Ratio weight
    sortinoWeight: number;        // 0.05-0.4 — Sortino Ratio weight
    profitFactorWeight: number;   // 0.05-0.4 — Profit Factor weight
    drawdownWeight: number;       // 0.05-0.5 — Max Drawdown (inverted) weight
    expectancyWeight: number;     // 0.05-0.3 — Expectancy weight
  };
  // Constraint: all fitnessWeights must sum to 1.0

  // ─── Meta Tracking ───────────────────────────────────────
  metadata: {
    fitnessImprovementRate: number;  // Avg fitness gain per generation
    validationPassRate: number;      // % of strategies that pass 4-Gate
    metaFitness: number;             // Composite meta-fitness score (0-100)
    generationsActive: number;       // How many strategy-generations used this config
    lastEvaluated: number | null;    // Timestamp of last meta-evaluation
  };
}

/**
 * Records one meta-fitness evaluation snapshot.
 * Stored per-Island, used to rank HyperDNA configurations.
 */
export interface MetaFitnessRecord {
  hyperDnaId: string;
  slotId: string;
  evaluatedAt: number;
  generationsObserved: number;     // How many strategy-generations observed
  avgFitnessImprovement: number;   // Average fitness gain per generation
  bestFitnessProduced: number;     // Best strategy fitness ever produced
  validationPassRate: number;      // 0-1 proportion of strategies passing 4-Gate
  diversityMaintained: number;     // 0-1 average diversity index
  convergenceSpeed: number;        // Generations to reach first 60+ fitness
  metaFitness: number;             // Composite meta-score (0-100)
}

/**
 * Configuration for the meta-evolution process itself.
 * These are the "meta-meta" parameters — intentionally kept minimal
 * and conservative to prevent meta-overfitting.
 */
export interface MetaEvolutionConfig {
  minGenerationsBeforeEval: number;    // Min strategy-generations before HyperDNA eval (default: 5)
  metaCrossoverInterval: number;       // Strategy-generations between meta-crossover events (default: 10)
  metaMutationRate: number;            // Mutation rate for HyperDNA genes (default: 0.15)
  stabilityGuardGenerations: number;   // Min generations a HyperDNA must run before change (default: 5)
  maxMetaGenerations: number;          // Safety cap on meta-evolution (default: 50)
}

export const DEFAULT_META_EVOLUTION_CONFIG: MetaEvolutionConfig = {
  minGenerationsBeforeEval: 5,
  metaCrossoverInterval: 10,
  metaMutationRate: 0.15,
  stabilityGuardGenerations: 5,
  maxMetaGenerations: 50,
};

// ─── Signal Engine Types ─────────────────────────────────────

export enum TradeSignalAction {
  LONG = 'LONG',
  SHORT = 'SHORT',
  HOLD = 'HOLD',
  EXIT_LONG = 'EXIT_LONG',
  EXIT_SHORT = 'EXIT_SHORT',
}

export interface SignalResult {
  triggered: boolean;
  confidence: number;           // 0-1 how strongly the signal triggered
  indicatorValues: Record<string, number>;  // Snapshot of all calculated indicator values
}

export interface TradeSignal {
  action: TradeSignalAction;
  confidence: number;           // 0-1 composite signal strength
  reason: string;               // Human-readable explanation
  indicators: Record<string, number>;  // Indicator values at signal time
  strategyId: string;
  slotId: string;
  timestamp: number;
}

// ─── Connection & Data Health ────────────────────────────────

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',   // Max reconnects exhausted — manual intervention needed
}

export interface DataHealth {
  slotId: string;
  lastCandleTime: number;        // Timestamp of last received closed candle
  expectedInterval: number;      // Expected ms between candles
  missedCandles: number;         // Count of missing candles since last received
  isStale: boolean;              // true if data is older than 2x expected interval
  lastUpdated: number;
}

// ─── Paper Trading Configuration ─────────────────────────────

export interface PaperTradeConfig {
  slippagePercent: number;       // 0.0002 = 0.02%
  takerFeePercent: number;       // 0.0004 = 0.04%
  makerFeePercent: number;       // 0.0002 = 0.02%
  enableSlippage: boolean;
  enableFees: boolean;
  maxOpenPositions: number;      // Per-island concurrent position limit
}

export const DEFAULT_PAPER_TRADE_CONFIG: PaperTradeConfig = {
  slippagePercent: 0.0002,
  takerFeePercent: 0.0004,
  makerFeePercent: 0.0002,
  enableSlippage: true,
  enableFees: true,
  maxOpenPositions: 1,
};

// ─── Exchange Symbol Information ─────────────────────────────

export interface ExchangeSymbolInfo {
  symbol: string;
  pricePrecision: number;        // Decimal places for price
  quantityPrecision: number;     // Decimal places for quantity
  minQuantity: number;           // Minimum order quantity
  stepSize: number;              // Quantity increment step
  tickSize: number;              // Price increment step
  minNotional: number;           // Minimum order value in USDT
  maxLeverage: number;           // Maximum allowed leverage
}

// ─── Binance WebSocket Event Types ───────────────────────────

export interface BinanceKlineEvent {
  e: 'kline';
  E: number;                     // Event time
  s: string;                     // Symbol
  k: {
    t: number;                   // Kline start time
    T: number;                   // Kline close time
    s: string;                   // Symbol
    i: string;                   // Interval
    o: string;                   // Open price
    c: string;                   // Close price
    h: string;                   // High price
    l: string;                   // Low price
    v: string;                   // Base asset volume
    x: boolean;                  // Is this kline closed?
    q: string;                   // Quote asset volume
    n: number;                   // Number of trades
  };
}

export interface BinanceMiniTickerEvent {
  e: '24hrMiniTicker';
  E: number;                     // Event time
  s: string;                     // Symbol
  c: string;                     // Close price
  o: string;                     // Open price
  h: string;                     // High price
  l: string;                     // Low price
  v: string;                     // Total traded base asset volume
  q: string;                     // Total traded quote asset volume
}

// ─── Strategy Roster ─────────────────────────────────────────

export enum RosterState {
  ACTIVE = 'ACTIVE',
  HIBERNATING = 'HIBERNATING',
  RETIRED = 'RETIRED',
}

/**
 * A validated strategy banked in the Roster.
 * Tracks per-regime performance and activation/hibernation lifecycle.
 */
export interface RosterEntry {
  strategy: StrategyDNA;
  regimePerformance: Record<MarketRegime, PerformanceMetrics | null>;
  bestRegime: MarketRegime;                     // Regime where it performs best
  regimeScores: Record<MarketRegime, number>;   // Confidence-weighted score per regime
  state: RosterState;
  activationCount: number;
  totalTradesWhileActive: number;
  totalPnlContribution: number;                 // Cumulative PnL across all activations
  lastActivated: number;                        // Timestamp
  lastHibernated: number | null;
  addedAt: number;
  confidenceScore: number;                      // 0-100, increases with successful activations
}

export interface RosterSnapshot {
  totalStrategies: number;
  activeStrategy: RosterEntry | null;
  hibernatingStrategies: RosterEntry[];
  retiredCount: number;
  regimeCoverage: Record<MarketRegime, number>; // Count of strategies per regime
  bestFitnessPerRegime: Record<MarketRegime, number>;
  totalRosterPnl: number;
}

// ─── Experience Replay ───────────────────────────────────────

export enum PatternType {
  INDICATOR_COMBO = 'INDICATOR_COMBO',
  RISK_PROFILE = 'RISK_PROFILE',
  SIGNAL_CONFIG = 'SIGNAL_CONFIG',
  TIMING_PATTERN = 'TIMING_PATTERN',
  MICROSTRUCTURE_COMBO = 'MICROSTRUCTURE_COMBO',     // Phase 9: Microstructure gene patterns
  COMPOSITE_FUNCTION = 'COMPOSITE_FUNCTION',         // Phase 9: Mathematical function patterns
  PRICE_ACTION_PATTERN = 'PRICE_ACTION_PATTERN',     // Phase 9: Price action patterns
  DIRECTIONAL_CHANGE = 'DIRECTIONAL_CHANGE',         // Phase 9: DC event patterns
}

/**
 * A proven gene pattern extracted from validated strategies.
 * Used to seed new genesis generations with institutional knowledge.
 */
export interface ExperiencePattern {
  id: string;
  type: PatternType;
  regime: MarketRegime;
  indicatorTypes: IndicatorType[];              // Indicators in this combo
  indicatorGenes: IndicatorGene[];              // Full gene configs
  riskProfile: RiskGenes | null;                // Null if not a risk pattern
  avgFitness: number;                           // Average fitness of strategies with this pattern
  peakFitness: number;                          // Best ever fitness
  sampleCount: number;                          // How many strategies contributed
  confidenceScore: number;                      // 0-1, Bayesian updated
  successRate: number;                          // % of validations passed
  createdAt: number;
  lastValidated: number;
  sourceStrategyIds: string[];                  // IDs of contributing strategies
}

export interface ExperienceMemorySnapshot {
  totalPatterns: number;
  patternsByRegime: Record<MarketRegime, number>;
  highConfidencePatterns: number;               // confidence > 0.7
  avgPatternFitness: number;
  oldestPattern: number;                        // Timestamp
  newestPattern: number;
}

// ─── Quality-Diversity Evolution (MAP-Elites) ────────────────

/**
 * Phase 18: Trade style classification for behavioral diversity.
 * Derived from a strategy's average trade hold duration.
 */
export enum TradeStyle {
  SCALPER = 'SCALPER',             // avg hold < 4 candles
  SWING = 'SWING',                 // avg hold 4-20 candles
  POSITION = 'POSITION',           // avg hold > 20 candles
}

/**
 * Phase 18: Behavioral descriptor for MAP-Elites grid placement.
 * Defines the behavioral niche of a strategy along two axes:
 * BD1: Which market regime the strategy specializes in
 * BD2: What trade style (hold duration) the strategy exhibits
 */
export interface BehaviorDescriptor {
  regimeSpecialization: MarketRegime;
  tradeStyle: TradeStyle;
}

/**
 * Phase 18: A single cell in the MAP-Elites behavioral grid.
 * Each cell holds the best-performing strategy for its behavioral niche.
 */
export interface MAPElitesCell {
  descriptor: BehaviorDescriptor;
  elite: StrategyDNA | null;
  fitness: number;
  timesImproved: number;
  lastUpdated: number;
}

/**
 * Phase 18: Configuration for the Quality-Diversity system.
 */
export interface QualityDiversityConfig {
  enabled: boolean;
  minTradesForClassification: number;   // Minimum trades to classify behavior (default: 10)
  scalperThresholdCandles: number;      // Max avg hold for SCALPER (default: 4)
  positionThresholdCandles: number;     // Min avg hold for POSITION (default: 20)
  repertoireSelectionMode: 'regime_match' | 'best_overall' | 'ensemble';
}

export const DEFAULT_QD_CONFIG: QualityDiversityConfig = {
  enabled: true,
  minTradesForClassification: 10,
  scalperThresholdCandles: 4,
  positionThresholdCandles: 20,
  repertoireSelectionMode: 'regime_match',
};

/**
 * Phase 18: Snapshot of the MAP-Elites repertoire for dashboard display.
 */
export interface RepertoireSnapshot {
  totalCells: number;
  occupiedCells: number;
  coveragePercent: number;
  avgEliteFitness: number;
  bestEliteFitness: number;
  grid: MAPElitesCell[];
  regimeCoverage: Record<MarketRegime, number>;
  styleCoverage: Record<TradeStyle, number>;
}

// ─── Order Flow Intelligence (Phase 9.5) ─────────────────────

/**
 * Phase 9.5: Aggregated trade from Binance aggTrade stream.
 */
export interface AggTrade {
  tradeId: number;
  price: number;
  quantity: number;
  timestamp: number;
  isBuyerMaker: boolean;           // true = seller aggressor, false = buyer aggressor
}

/**
 * Phase 9.5: Forced liquidation order from Binance forceOrder stream.
 */
export interface ForceOrder {
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'LIMIT';
  price: number;
  quantity: number;
  averagePrice: number;
  status: 'FILLED' | 'EXPIRED';
  timestamp: number;
}

/**
 * Phase 9.5: Volume Delta calculation result.
 */
export interface VolumeDeltaResult {
  delta: number;                     // Buy volume - Sell volume
  cumulativeDelta: number;           // Running total CVD
  buyVolume: number;
  sellVolume: number;
  deltaPercent: number;              // delta / total volume (-1 to 1)
  trendStrength: number;             // 0-1 consistency of delta direction
}

/**
 * Phase 9.5: Detected large trade (institutional footprint).
 */
export interface LargeTradeSignal {
  price: number;
  quantity: number;
  totalValue: number;
  isBuy: boolean;
  sizeMultiple: number;              // How many times larger than average
  timestamp: number;
}

/**
 * Phase 9.5: Liquidation cascade detection result.
 */
export interface CascadeSignal {
  detected: boolean;
  direction: TradeDirection;
  totalLiquidatedQuantity: number;
  cascadeCount: number;              // Number of liquidations in window
  estimatedPriceImpact: number;      // Estimated price move from cascade
  severity: number;                  // 0-1 cascade severity
}

/**
 * Phase 9.5: Funding rate pressure signal.
 */
export interface FundingSignal {
  currentRate: number;
  annualizedRate: number;
  pressure: 'long_pays' | 'short_pays' | 'neutral';
  extremity: number;                 // 0-1 how extreme the rate is
  nextFundingIn: number;             // ms until next funding
  expectedPressureDirection: TradeDirection;  // Direction that funding pushes price
}

/**
 * Phase 9.5: Volume absorption detection (whale activity at key levels).
 */
export interface AbsorptionSignal {
  detected: boolean;
  level: number;                     // Price level of absorption
  absorptionType: 'bid' | 'ask';     // Buying (bid) or selling (ask) absorption
  strength: number;                  // 0-1 absorption strength
  volumeAbsorbed: number;
}

/**
 * Phase 9.5: Order Flow Intelligence gene — evolvable parameters for
 * analyzing trade flow, liquidations, and funding dynamics.
 */
export interface OrderFlowGene {
  id: string;
  volumeDeltaWindow: number;         // 5-100 candle equivalent lookback
  deltaThreshold: number;            // 0.2-0.8 normalized threshold for delta-based signals
  largeTradeSizeMultiplier: number;  // 3-10x average trade size
  liquidationSensitivity: number;    // 0.1-1.0 cascade detection sensitivity
  fundingRateThreshold: number;      // 0.001-0.01 extreme funding rate threshold
  absorptionDetectionMode: 'volume_profile' | 'delta_divergence' | 'large_trade_cluster';
  params: {
    cvdMomentumPeriod?: number;      // 5-30 CVD rate of change lookback
    largeTradeCooldown?: number;     // 1-10 candles cooldown between large trade signals
    cascadeWindowMs?: number;        // 1000-30000 ms window for cascade grouping
    absorptionVolumeThreshold?: number; // 2.0-8.0x average candle volume
  };
}

// ─── Coevolutionary Strategy Tournaments (Phase 18.1) ────────

/**
 * Phase 18.1: Evolved adversarial market scenario DNA.
 * The parasite GA evolves these to break host strategies.
 */
export interface MarketScenarioDNA {
  id: string;
  generation: number;
  parentIds: string[];
  createdAt: number;

  // Scenario structure
  volatilityProfile: number[];       // Volatility multipliers over scenario (length 50-200)
  trendPattern: 'v_reversal' | 'head_shoulders' | 'flash_crash' | 'slow_bleed' | 'whipsaw' | 'gap_and_go' | 'chop';
  regimeSequence: MarketRegime[];    // Forced regime transitions
  slippageMultiplier: number;        // 1.0-5.0 elevated slippage
  liquidityDrain: number;            // 0.0-0.8 reduced market depth
  newsSpike: {
    candle: number;                  // Which candle gets the spike
    magnitude: number;               // 0.5-5.0% price shock
    direction: 'up' | 'down';
  } | null;

  metadata: {
    fitnessScore: number;            // Parasite fitness (damage dealt)
    strategiesKilled: number;        // How many strategies suffered >10% DD
    avgDamage: number;               // Average fitness reduction caused
    worstVictimId: string | null;    // Strategy hurt the most
  };
}

/**
 * Phase 18.1: Robustness score from coevolutionary testing.
 */
export interface RobustnessScore {
  backtestFitness: number;           // Standard backtest fitness score
  survivalRate: number;              // 0-1 survival across top-5 scenarios
  worstCaseDrawdown: number;         // Worst DD under adversarial attack
  recoverySpeed: number;             // 0-1 how quickly strategy recovers
  compositeRobustness: number;       // Weighted combination
}

/**
 * Phase 18.1: Coevolution engine configuration.
 */
export interface CoevolutionConfig {
  enabled: boolean;
  parasitePopulationSize: number;    // Default: 8
  coevolutionInterval: number;       // Every Nth generation (default: 5)
  scenarioDurationCandles: number;   // Length of synthetic scenario (default: 200)
  robustnessWeight: number;          // 0-1 weight of robustness in final fitness (default: 0.3)
  mutationRate: number;              // Parasite mutation rate (default: 0.4)
  crossoverRate: number;             // Parasite crossover rate (default: 0.6)
}

export const DEFAULT_COEVOLUTION_CONFIG: CoevolutionConfig = {
  enabled: true,
  parasitePopulationSize: 8,
  coevolutionInterval: 5,
  scenarioDurationCandles: 200,
  robustnessWeight: 0.3,
  mutationRate: 0.4,
  crossoverRate: 0.6,
};

// ─── Adaptive Genome Topology (NEAT-Inspired, Phase 18.2) ────

/**
 * Phase 18.2: Innovation tracking for structural genome mutations.
 * Each new structural gene gets a unique, monotonically increasing
 * innovation number. This prevents crossover from misaligning
 * unrelated structural additions.
 */
export interface InnovationRecord {
  innovationNumber: number;
  geneType: 'indicator' | 'entry_rule' | 'exit_rule' | 'advanced_gene';
  originStrategyId: string;
  originGeneration: number;
  createdAt: number;
  description: string;
}

/**
 * Phase 18.2: Species profile for speciation-based evolution.
 * Strategies within the same species compete for offspring.
 * Strategies in different species are protected from competition.
 */
export interface SpeciesProfile {
  id: number;
  representative: StrategyDNA;       // The prototype member of this species
  memberCount: number;
  avgFitness: number;
  bestFitness: number;
  stagnationCounter: number;         // Generations without improvement
  offspringAllocation: number;       // How many offspring this species gets
  createdGeneration: number;
}

/**
 * Phase 18.2: Genome topology configuration.
 */
export interface GenomeTopologyConfig {
  enabled: boolean;
  structuralMutationRate: number;    // Chance of structural vs parametric mutation (default: 0.15)
  addGeneProbability: number;        // P(add gene | structural mutation) (default: 0.5)
  removeGeneProbability: number;     // P(remove gene | structural) (default: 0.2)
  chainGeneProbability: number;      // P(indicator chain | structural) (default: 0.3)
  speciationThreshold: number;       // Jaccard distance for species membership (default: 0.4)
  speciesStagnationLimit: number;    // Generations before dissolving species (default: 10)
  minimalGenomeSize: number;         // Minimum genes for initial random strategy (default: 2)
}

export const DEFAULT_GENOME_TOPOLOGY_CONFIG: GenomeTopologyConfig = {
  enabled: true,
  structuralMutationRate: 0.15,
  addGeneProbability: 0.5,
  removeGeneProbability: 0.2,
  chainGeneProbability: 0.3,
  speciationThreshold: 0.4,
  speciesStagnationLimit: 10,
  minimalGenomeSize: 2,
};

// ─── Advanced Gene Types (Phase 9) ───────────────────────────
// These gene types allow the GA to evolve BEYOND standard indicator
// parameter tuning. They enable structural innovation — the AI can
// discover strategies involving price action, microstructure analysis,
// mathematical function composition, and event-based price analysis.

// ── Microstructure Gene Types ────────────────────────────────

export enum MicrostructureGeneType {
  VOLUME_PROFILE = 'VOLUME_PROFILE',         // Volume distribution across price levels
  VOLUME_ACCELERATION = 'VOLUME_ACCELERATION', // Rate of change of volume
  CANDLE_ANATOMY = 'CANDLE_ANATOMY',         // Body:wick ratios, shadow dominance
  RANGE_EXPANSION = 'RANGE_EXPANSION',       // True range expansion/contraction sequences
  ABSORPTION = 'ABSORPTION',                 // Large candle + small net movement
}

export interface MicrostructureGene {
  id: string;
  type: MicrostructureGeneType;
  lookbackPeriod: number;                     // 3-50 candles to analyze
  params: {
    // Volume Profile
    priceBuckets?: number;                    // 5-20 price level divisions
    concentrationThreshold?: number;          // 0.3-0.8 volume concentration threshold

    // Volume Acceleration
    accelerationPeriod?: number;              // 2-10 rate of change lookback
    spikeMultiplier?: number;                 // 1.5-5.0 volume spike detection threshold

    // Candle Anatomy
    bodyRatioThreshold?: number;              // 0.1-0.9 minimum body:total ratio
    shadowDominance?: 'upper' | 'lower' | 'balanced'; // Which shadow to focus on
    dominanceThreshold?: number;              // 0.3-0.8 shadow dominance ratio

    // Range Expansion
    expansionMultiplier?: number;             // 1.2-3.0 ATR multiple for expansion detection
    contractionRatio?: number;                // 0.3-0.7 range contraction ratio
    sequenceLength?: number;                  // 2-5 consecutive bars required

    // Absorption
    candleSizeMultiplier?: number;            // 1.5-4.0 relative to avg candle size
    maxNetMovementPercent?: number;           // 0.1-0.5 max price change despite large candle
  };
}

// ── Price Action Pattern Types ───────────────────────────────

export enum PriceActionPatternType {
  CANDLESTICK_PATTERN = 'CANDLESTICK_PATTERN',   // Engulfing, Doji, Hammer, etc.
  STRUCTURAL_BREAK = 'STRUCTURAL_BREAK',         // Break of N-bar high/low
  SWING_SEQUENCE = 'SWING_SEQUENCE',             // HH/HL or LH/LL sequences
  COMPRESSION = 'COMPRESSION',                   // Narrowing range → breakout
  GAP_ANALYSIS = 'GAP_ANALYSIS',                 // Price gaps relative to ATR
}

export enum CandlestickFormation {
  ENGULFING = 'ENGULFING',                        // Bullish/bearish engulfing
  DOJI = 'DOJI',                                  // Indecision candle
  HAMMER = 'HAMMER',                              // Bottom reversal
  SHOOTING_STAR = 'SHOOTING_STAR',                // Top reversal
  MORNING_STAR = 'MORNING_STAR',                  // 3-bar bottom reversal
  EVENING_STAR = 'EVENING_STAR',                  // 3-bar top reversal
  THREE_SOLDIERS = 'THREE_SOLDIERS',              // 3 consecutive bullish
  THREE_CROWS = 'THREE_CROWS',                    // 3 consecutive bearish
  PINBAR = 'PINBAR',                              // Long wick rejection
  INSIDE_BAR = 'INSIDE_BAR',                      // Bar within previous bar
}

export interface PriceActionGene {
  id: string;
  type: PriceActionPatternType;
  params: {
    // Candlestick Pattern
    formation?: CandlestickFormation;             // Which formation to detect
    bodyRatioMin?: number;                        // 0.0-0.9 parameterized detection thresholds
    wickRatioMin?: number;                        // 0.0-0.9 — these EVOLVE, not hardcoded
    confirmationBars?: number;                    // 1-3 bars after pattern for confirmation

    // Structural Break
    breakLookback?: number;                       // 5-50 bars lookback for high/low
    breakDirection?: 'bullish' | 'bearish' | 'both'; // Which direction to detect
    retestRequired?: boolean;                     // Require price to retest break level

    // Swing Sequence
    swingLookback?: number;                       // 3-20 bars for swing point detection
    sequenceLength?: number;                      // 2-5 swing points required
    minSwingPercent?: number;                     // 0.1-2.0% minimum swing size

    // Compression
    compressionBars?: number;                     // 3-20 bars of narrowing range
    compressionRatio?: number;                    // 0.3-0.8 max range vs initial range
    breakoutMultiplier?: number;                  // 1.2-3.0 ATR multiple for breakout confirm

    // Gap Analysis
    gapMinATR?: number;                           // 0.3-2.0 minimum gap size in ATR units
    gapDirection?: 'up' | 'down' | 'both';        // Which gap direction
    fillExpected?: boolean;                       // Expect gap to fill or continue
  };
}

// ── Multi-Timeframe Confluence ────────────────────────────────

export enum ConfluenceType {
  TREND_ALIGNMENT = 'TREND_ALIGNMENT',           // Primary vs Higher TF trend match
  MOMENTUM_CONFLUENCE = 'MOMENTUM_CONFLUENCE',   // Momentum agreement across TFs
  VOLATILITY_MATCH = 'VOLATILITY_MATCH',         // Volatility state comparison
  STRUCTURE_CONFLUENCE = 'STRUCTURE_CONFLUENCE',  // S/R alignment between TFs
}

export interface TimeframeConfluenceGene {
  id: string;
  type: ConfluenceType;
  primaryTimeframe: Timeframe;                    // The timeframe for signal generation
  higherTimeframe: Timeframe;                     // The timeframe for context/confirmation
  params: {
    // Trend Alignment
    trendIndicator?: IndicatorType;               // Which indicator defines "trend" (EMA, SMA, ADX)
    trendPeriod?: number;                         // Period for trend determination
    alignmentRequired?: boolean;                  // Must trends agree to enter?

    // Momentum Confluence
    momentumIndicator?: IndicatorType;            // RSI, MACD, StochRSI
    momentumPeriod?: number;                      // Period for momentum calc
    momentumThreshold?: number;                   // Threshold for "bullish" vs "bearish"

    // Volatility Match
    volLookback?: number;                         // ATR lookback period
    volExpansionThreshold?: number;               // 1.2-3.0 expansion detection
    requireLowVolHigherTF?: boolean;              // Trade only when higher TF is calm

    // Structure Confluence
    structureLookback?: number;                   // Bars to find S/R on higher TF
    proximityPercent?: number;                    // 0.1-1.0% proximity to S/R level
  };
}

// ── Composite Function Genes (Mathematical Evolution) ────────

export enum CompositeOperation {
  ADD = 'ADD',                                    // A + B
  SUBTRACT = 'SUBTRACT',                          // A - B
  MULTIPLY = 'MULTIPLY',                          // A * B
  DIVIDE = 'DIVIDE',                              // A / B (safe division)
  MAX = 'MAX',                                    // max(A, B)
  MIN = 'MIN',                                    // min(A, B)
  ABS_DIFF = 'ABS_DIFF',                          // |A - B|
  RATIO = 'RATIO',                                // A / (A + B)
  NORMALIZE_DIFF = 'NORMALIZE_DIFF',              // (A - B) / (A + B + ε)
}

export interface CompositeFunctionGene {
  id: string;
  operation: CompositeOperation;                   // The mathematical function
  inputA: {
    sourceType: 'indicator' | 'microstructure' | 'price_action' | 'raw_price';
    sourceId?: string;                             // ID of the source gene
    indicatorType?: IndicatorType;                 // If sourceType is 'indicator'
    period?: number;                               // Lookback period
    rawField?: 'close' | 'high' | 'low' | 'open' | 'volume'; // If raw_price
  };
  inputB: {
    sourceType: 'indicator' | 'microstructure' | 'price_action' | 'raw_price';
    sourceId?: string;
    indicatorType?: IndicatorType;
    period?: number;
    rawField?: 'close' | 'high' | 'low' | 'open' | 'volume';
  };
  outputNormalization: 'none' | 'percentile' | 'z_score' | 'min_max';
  outputPeriod: number;                            // Lookback for normalization (5-50)
}

// ── Directional Change Genes (Event-Based Price Analysis) ────

export enum DCEventType {
  UPTURN = 'UPTURN',                               // Price reversed UP by θ%
  DOWNTURN = 'DOWNTURN',                           // Price reversed DOWN by θ%
  UPWARD_OVERSHOOT = 'UPWARD_OVERSHOOT',           // Extension beyond upturn point
  DOWNWARD_OVERSHOOT = 'DOWNWARD_OVERSHOOT',       // Extension beyond downturn point
}

export interface DCEvent {
  type: DCEventType;
  price: number;                                    // Price at event
  timestamp: number;                                // When event occurred
  magnitude: number;                                // Size of the move (in %)
  duration: number;                                 // Candles since last event
}

export interface DirectionalChangeGene {
  id: string;
  theta: number;                                    // 0.1-5.0% — the reversal threshold (EVOLVES)
  params: {
    // DC Event Signals
    signalOn: DCEventType;                          // Which event type triggers signal
    requiredConsecutive?: number;                   // 1-3 consecutive events required

    // Overshoot Analysis
    overshootThreshold?: number;                    // 0.5-3.0 — overshoot magnitude filter
    maxDuration?: number;                           // Max candles for event validity

    // DC-derived indicators
    trendRatio?: boolean;                           // T = total_upDC_len / total_downDC_len
    reversalMagnitude?: boolean;                    // R = avg magnitude of DC events
    oscillationCount?: boolean;                     // How many DC events in lookback
    lookbackEvents?: number;                        // 5-30 DC events for indicator calc
  };
}

// ── Advanced Signal Rule ─────────────────────────────────────

/**
 * Extended signal rule that can reference any gene type.
 * Uses sourceType to determine which gene family the signal targets.
 */
export interface AdvancedSignalRule {
  id: string;
  sourceType: 'indicator' | 'microstructure' | 'price_action' | 'composite' | 'confluence' | 'dc';
  sourceGeneId: string;                             // ID of the gene to evaluate
  condition: SignalCondition;
  threshold: number;
  secondaryThreshold?: number;
}

// ─── Trade Forensics (Phase 12) ──────────────────────────────

/**
 * Phase 12: Types of events that can occur during a trade's lifecycle.
 * Each represents a meaningful market event while a position is open.
 */
export enum TradeEventType {
  REGIME_CHANGE = 'REGIME_CHANGE',                   // Market regime shifted during trade
  INDICATOR_SHIFT = 'INDICATOR_SHIFT',               // Key indicator crossed a threshold
  NEAR_MISS_SL = 'NEAR_MISS_SL',                     // Price came within 15% of stop loss
  NEAR_MISS_TP = 'NEAR_MISS_TP',                     // Price came within 15% of take profit
  MAX_ADVERSE_EXCURSION = 'MAX_ADVERSE_EXCURSION',   // New worst drawdown during trade
  MAX_FAVORABLE_EXCURSION = 'MAX_FAVORABLE_EXCURSION', // New best unrealized PnL
  DRAWDOWN_SPIKE = 'DRAWDOWN_SPIKE',                 // Drawdown exceeded 50% of SL distance
  VOLATILITY_SHIFT = 'VOLATILITY_SHIFT',             // ATR changed > 30% from entry
}

/**
 * Phase 12: A single timestamped event during a trade's lifecycle.
 * These events form the "black box recording" of a trade.
 */
export interface TradeLifecycleEvent {
  timestamp: number;
  candleIndex: number;                               // Which candle (0 = entry candle)
  type: TradeEventType;
  severity: number;                                  // 0-1 importance
  details: {
    previousValue?: number | string;
    currentValue?: number | string;
    threshold?: number;
    description: string;
  };
}

/**
 * Phase 12: 4-factor causal attribution model.
 */
export enum CausalFactorType {
  STRATEGY_QUALITY = 'STRATEGY_QUALITY',       // Signal accuracy, rule quality
  MARKET_CONDITIONS = 'MARKET_CONDITIONS',     // Regime favorability, volatility
  TIMING = 'TIMING',                           // Entry/exit timing quality
  LUCK = 'LUCK',                               // Residual (unexplained)
}

/**
 * Phase 12: Single causal factor contributing to trade outcome.
 */
export interface CausalFactor {
  type: CausalFactorType;
  contribution: number;                        // -1 to +1 (negative = hurt, positive = helped)
  confidence: number;                          // 0-1 how sure we are
  evidence: string;                            // Human-readable explanation
}

/**
 * Phase 12: Categories of lessons that the system can learn from trades.
 */
export enum TradeLessonType {
  AVOID_REGIME = 'AVOID_REGIME',                     // This strategy fails in this regime
  PREFER_REGIME = 'PREFER_REGIME',                   // This strategy excels in this regime
  TIGHTEN_SL = 'TIGHTEN_SL',                         // SL was too wide for this volatility
  LOOSEN_SL = 'LOOSEN_SL',                           // SL was hit prematurely
  IMPROVE_ENTRY = 'IMPROVE_ENTRY',                   // Entry timing was poor
  IMPROVE_EXIT = 'IMPROVE_EXIT',                     // Exit timing was poor
  INDICATOR_UNRELIABLE = 'INDICATOR_UNRELIABLE',     // Key indicator diverged from expectation
  REGIME_TRANSITION_RISK = 'REGIME_TRANSITION_RISK', // Trade was caught in regime change
}

/**
 * Phase 12: A structured, actionable lesson extracted from trade forensics.
 */
export interface TradeLesson {
  id: string;
  tradeId: string;
  strategyId: string;
  type: TradeLessonType;
  regime: MarketRegime;
  severity: number;                            // 0-1 how impactful
  description: string;                         // Human-readable lesson
  actionableAdvice: string;                    // What the GA should do about it
  confidence: number;                          // 0-1 how reliable this lesson is
  timestamp: number;
}

/**
 * Phase 12: Complete forensic report for a single trade.
 * Produced by the ForensicAnalyzer after trade close.
 */
export interface TradeForensicReport {
  tradeId: string;
  strategyId: string;
  strategyName: string;
  slotId: string;

  // ── Timeline ──
  entryTime: number;
  exitTime: number;
  durationCandles: number;
  events: TradeLifecycleEvent[];

  // ── Excursion Analysis ──
  maxFavorableExcursion: number;               // Best unrealized PnL (%)
  maxAdverseExcursion: number;                 // Worst unrealized PnL (%)
  mfeCandle: number;                           // Candle index of MFE
  maeCandle: number;                           // Candle index of MAE
  excursionRatio: number;                      // MFE / |MAE| — shows reward:risk realized

  // ── Efficiency Scores ──
  entryEfficiency: number;                     // 0-100: how close entry was to optimal price
  exitEfficiency: number;                      // 0-100: how close exit was to MFE
  holdEfficiency: number;                      // 0-100: captured PnL vs MFE

  // ── Regime Context ──
  entryRegime: MarketRegime;
  exitRegime: MarketRegime;
  regimeChangedDuringTrade: boolean;
  regimeChangeCount: number;

  // ── Causal Attribution ──
  causalFactors: CausalFactor[];
  primaryCause: CausalFactorType;

  // ── Extracted Lessons ──
  lessons: TradeLesson[];

  // ── Indicators State (entry → exit delta) ──
  indicatorDelta: Record<string, { atEntry: number; atExit: number; changePercent: number }>;

  // ── Final Outcome ──
  pnlPercent: number;
  pnlUSD: number;
  wasSuccessful: boolean;
}

// ═══════════════════════════════════════════════════════════════
// SURROGATE-ASSISTED ILLUMINATION ENGINE (SAIE) — Phase 18.3
// ═══════════════════════════════════════════════════════════════

/** Configuration for the SAIE meta-controller. */
export interface SurrogateConfig {
  enabled: boolean;
  /** Number of candidate strategies generated per amplification round */
  candidatePoolSize: number;
  /** Number of candidates selected for full backtest (top-K) */
  topKForBacktest: number;
  /** Number of decision stumps in the surrogate forest */
  forestSize: number;
  /** Max depth per decision stump */
  maxStumpDepth: number;
  /** UCB kappa — exploration weight (higher = more exploration) */
  ucbKappa: number;
  /** Minimum training samples before surrogate predictions are trusted */
  minTrainingSamples: number;
  /** How often (in evaluations) to recalculate gene importance via MI */
  geneImportanceInterval: number;
  /** Minimum MI score for a feature to be considered "important" */
  minImportanceThreshold: number;
}

export const DEFAULT_SAIE_CONFIG: SurrogateConfig = {
  enabled: true,
  candidatePoolSize: 500,
  topKForBacktest: 20,
  forestSize: 50,
  maxStumpDepth: 4,
  ucbKappa: 1.5,
  minTrainingSamples: 30,
  geneImportanceInterval: 100,
  minImportanceThreshold: 0.05,
};

/** Prediction from the surrogate model. */
export interface SurrogatePrediction {
  mean: number;            // Predicted fitness score
  variance: number;        // Uncertainty estimate
  ucbScore: number;        // Upper Confidence Bound score
  confidence: number;      // 0-1 confidence in prediction
}

/** Mutual-Information-based gene importance score. */
export interface GeneImportanceScore {
  featureName: string;
  featureIndex: number;
  mutualInformation: number;   // Bits of information shared with fitness
  normalizedImportance: number; // 0-1 normalized score
  rank: number;                // 1 = most important
}

/** Dashboard-friendly snapshot of SAIE state. */
export interface SAIESnapshot {
  totalTrainingSamples: number;
  surrogateAccuracy: number;         // Mean absolute error on last 20 predictions
  avgPredictionTimeMs: number;
  amplificationRatio: number;        // candidatePoolSize / topKForBacktest
  lastGeneImportance: GeneImportanceScore[];
  ucbKappa: number;
  modelReady: boolean;               // Has enough training samples?
  totalCandidatesScreened: number;
  totalBacktestsSaved: number;       // Candidates screened - backtests run
}

// ═══════════════════════════════════════════════════════════════
// ADAPTIVE COGNITIVE CORE (ACC) — Phase 19
// ═══════════════════════════════════════════════════════════════

// ── Module A: Bayesian Signal Calibrator ─────────────────────

/** Beta distribution parameters for Bayesian belief. */
export interface BetaParams {
  alpha: number;   // Success pseudo-count
  beta: number;    // Failure pseudo-count
}

/** Unique key identifying a signal belief: (indicator, condition, regime). */
export interface SignalBeliefKey {
  indicatorType: IndicatorType;
  condition: SignalCondition;
  regime: MarketRegime;
}

/** A single Bayesian belief about a signal's reliability. */
export interface SignalBelief {
  key: SignalBeliefKey;
  prior: BetaParams;
  posterior: BetaParams;
  sampleCount: number;
  lastUpdated: number;             // Timestamp
  calibratedConfidence: number;    // α / (α + β) — calibrated probability
  thompsonSample: number;          // Last Thompson sample drawn
}

/** Configuration for the Bayesian Signal Calibrator. */
export interface CalibrationConfig {
  priorAlpha: number;              // Initial alpha (default: 2 — mild optimism)
  priorBeta: number;               // Initial beta (default: 2 — mild pessimism)
  decayRate: number;               // Exponential decay per day (0-1)
  minSamplesForConfidence: number; // Min observations before trusting belief
  successThreshold: number;        // PnL% above this = "success" (default: 0)
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  priorAlpha: 2,
  priorBeta: 2,
  decayRate: 0.02,
  minSamplesForConfidence: 5,
  successThreshold: 0,
};

/** Dashboard snapshot of signal reliability across regimes. */
export interface ReliabilityMatrix {
  beliefs: SignalBelief[];
  totalObservations: number;
  avgConfidence: number;
  mostReliableSignals: Array<{ key: SignalBeliefKey; confidence: number }>;
  leastReliableSignals: Array<{ key: SignalBeliefKey; confidence: number }>;
  coveragePercent: number;          // % of (indicator, condition, regime) combos observed
}

// ── Module B: Market Intelligence Cortex ─────────────────────

/** Market mood classification based on Fear & Greed Index. */
export type MarketMood = 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';

/** Composite market intelligence from external sources. */
export interface MarketIntelligence {
  fearGreedIndex: number;          // 0-100 (from API or synthetic)
  fearGreedClassification: MarketMood;
  fundingRate: number;             // Current funding rate
  fundingBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volatilityPercentile: number;    // 0-100: current vol vs historical
  compositeScore: number;          // -1 to +1: overall market mood
  aggressivenessMultiplier: number; // 0.5-1.5: position size modifier
  timestamp: number;
  dataAge: number;                 // Seconds since last fetch
  sourcesAvailable: number;        // How many external sources responded
}

/** Configuration for the Market Intelligence Cortex. */
export interface IntelligenceConfig {
  fearGreedApiUrl: string;
  fetchIntervalMs: number;         // How often to fetch external data
  maxDataAgeMs: number;            // Max age before data is considered stale
  enableFearGreed: boolean;
  enableFundingRate: boolean;
  enableVolatilityContext: boolean;
  extremeFearThreshold: number;    // Below this = extreme fear (default: 20)
  extremeGreedThreshold: number;   // Above this = extreme greed (default: 80)
}

export const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  fearGreedApiUrl: 'https://api.alternative.me/fng/',
  fetchIntervalMs: 300_000,        // 5 minutes
  maxDataAgeMs: 600_000,           // 10 minutes
  enableFearGreed: true,
  enableFundingRate: true,
  enableVolatilityContext: true,
  extremeFearThreshold: 20,
  extremeGreedThreshold: 80,
};

// ── Module C: Metacognitive Monitor ──────────────────────────

/** A single entry in the Decision Journal. */
export interface DecisionJournalEntry {
  id: string;
  timestamp: number;
  strategyId: string;
  action: 'ENTRY_LONG' | 'ENTRY_SHORT' | 'EXIT' | 'SKIP';
  signalConfidence: number;        // From Bayesian calibrator
  marketMood: MarketMood;          // From Market Intelligence
  epistemicUncertainty: number;    // 0-1: overall system uncertainty
  aggressiveness: number;          // Position size multiplier applied
  reasoning: string[];             // Human-readable decision chain
  outcome?: {                      // Filled after trade closes
    pnlPercent: number;
    wasCorrect: boolean;
    lessonLearned: string;
  };
}

/** Dashboard snapshot of metacognitive state. */
export interface MetacognitiveSnapshot {
  calibrationQuality: number;      // 0-1: how well-calibrated are beliefs?
  beliefDriftRate: number;         // Rate of change in beliefs (0-1)
  epistemicUncertainty: number;    // 0-1: aggregate uncertainty
  aggressivenessMultiplier: number;
  recentDecisions: DecisionJournalEntry[];
  totalDecisions: number;
  correctDecisionRate: number;     // Accuracy of past decisions
  avgSignalConfidence: number;
}

// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE-DIRECTED STRATEGY SYNTHESIS (KDSS) — Phase 20
// ═══════════════════════════════════════════════════════════════

/** Configuration for the KDSS engine. */
export interface KDSSConfig {
  /** Fraction of new generation created via KDSS (rest via standard GA) */
  synthesisRatio: number;
  /** Noise level injected for diversity (0-1, default 0.15) */
  noiseLevel: number;
  /** Prefer empty grid cells first? */
  prioritizeEmptyCells: boolean;
  /** Min gene importance score to include an indicator */
  minGeneImportance: number;
}

export const DEFAULT_KDSS_CONFIG: KDSSConfig = {
  synthesisRatio: 0.30,
  noiseLevel: 0.15,
  prioritizeEmptyCells: true,
  minGeneImportance: 0.04,
};

/** Aggregated knowledge from all 6 sources. */
export interface KnowledgeContext {
  /** Signal reliability per (indicator, condition, regime) from Bayesian Calibrator */
  signalReliability: Map<string, number>;
  /** Gene importance rankings from SAIE */
  geneImportance: GeneImportanceScore[];
  /** Empty or weak MAP-Elites cells to target */
  gridGaps: Array<{ regime: MarketRegime; style: TradeStyle; currentFitness: number }>;
  /** Proven patterns from Experience Replay */
  provenPatterns: Array<{ indicatorTypes: IndicatorType[]; regime: MarketRegime; fitness: number }>;
  /** Current market regime */
  currentRegime: MarketRegime;
  /** Epistemic uncertainty level */
  epistemicUncertainty: number;
}

/** Blueprint for a strategy to be synthesized. */
export interface SynthesisBlueprint {
  targetRegime: MarketRegime;
  targetStyle: TradeStyle;
  selectedIndicators: IndicatorType[];
  parameterRanges: Map<string, { min: number; max: number; center: number }>;
  riskProfile: { sl: number; tp: number; leverage: number; positionSize: number };
  confidence: number;  // 0-1: how confident is KDSS in this blueprint
  reasoning: string[];
}

/** Report from a KDSS synthesis batch. */
export interface SynthesisReport {
  strategiesSynthesized: number;
  targetedNiches: number;
  avgBlueprintConfidence: number;
  knowledgeSourcesUsed: string[];
  timestamp: number;
}

// ─── Order Execution Types (Phase 19) ────────────────────────

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
  STOP_MARKET = 'STOP_MARKET',
  TAKE_PROFIT_MARKET = 'TAKE_PROFIT_MARKET',
  STOP = 'STOP',
  TAKE_PROFIT = 'TAKE_PROFIT',
  TRAILING_STOP_MARKET = 'TRAILING_STOP_MARKET',
}

export enum OrderStatus {
  NEW = 'NEW',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
  NEW_INSURANCE = 'NEW_INSURANCE',
  NEW_ADL = 'NEW_ADL',
}

/**
 * Order request — sent to Binance via the REST client.
 * `stopLoss` is MANDATORY — Risk Manager Rule #5 enforced at type level.
 */
export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;                   // Required for LIMIT orders
  stopLoss: number;                 // MANDATORY — absolute price level
  takeProfit?: number;              // Optional TP price level
  leverage: number;                 // Capped at 10 by Risk Manager
  reduceOnly?: boolean;             // true = closing position only
  timeInForce?: 'GTC' | 'IOC' | 'FOK';  // Default: GTC for LIMIT
  newClientOrderId?: string;        // Custom order ID for tracking
}

/**
 * Order result — received from Binance after order placement/query.
 */
export interface OrderResult {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price: number;
  avgPrice: number;
  origQty: number;
  executedQty: number;
  cumQuote: number;                 // Cumulative quote asset value
  reduceOnly: boolean;
  stopPrice: number;
  timeInForce: string;
  updateTime: number;
  workingType: 'MARK_PRICE' | 'CONTRACT_PRICE';
}

/**
 * Position information from /fapi/v2/positionRisk.
 */
export interface PositionInfo {
  symbol: string;
  side: 'LONG' | 'SHORT' | 'BOTH';
  positionAmt: number;              // Positive = long, negative = short
  entryPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  leverage: number;
  marginType: 'isolated' | 'cross';
  isolatedMargin: number;
  liquidationPrice: number;
  maxNotionalValue: number;
  notional: number;                 // Position value = positionAmt * markPrice
  updateTime: number;
}

/**
 * Order book depth level [price, quantity].
 */
export interface DepthLevel {
  price: number;
  quantity: number;
}

/**
 * Order book snapshot from /fapi/v1/depth.
 */
export interface OrderBookSnapshot {
  symbol: string;
  lastUpdateId: number;
  bids: DepthLevel[];               // Buy side, sorted high→low
  asks: DepthLevel[];               // Sell side, sorted low→high
  timestamp: number;
}

// ─── User Data Stream Events (Phase 19) ──────────────────────

export interface UserDataAccountUpdate {
  eventType: 'ACCOUNT_UPDATE';
  eventTime: number;
  balances: Array<{
    asset: string;
    walletBalance: number;
    crossWalletBalance: number;
    balanceChange: number;
  }>;
  positions: Array<{
    symbol: string;
    positionAmount: number;
    entryPrice: number;
    accumulatedRealized: number;
    unrealizedPnl: number;
    marginType: 'isolated' | 'cross';
    isolatedWallet: number;
    positionSide: 'LONG' | 'SHORT' | 'BOTH';
  }>;
}

export interface UserDataOrderUpdate {
  eventType: 'ORDER_TRADE_UPDATE';
  eventTime: number;
  order: {
    symbol: string;
    clientOrderId: string;
    side: OrderSide;
    type: OrderType;
    timeInForce: string;
    origQty: number;
    origPrice: number;
    avgPrice: number;
    stopPrice: number;
    executionType: 'NEW' | 'CANCELED' | 'CALCULATED' | 'EXPIRED' | 'TRADE';
    orderStatus: OrderStatus;
    orderId: number;
    lastFilledQty: number;
    filledAccumulatedQty: number;
    lastFilledPrice: number;
    commissionAsset: string;
    commission: number;
    tradeTime: number;
    tradeId: number;
    realizedProfit: number;
    reduceOnly: boolean;
    positionSide: 'LONG' | 'SHORT' | 'BOTH';
  };
}

export interface UserDataMarginCall {
  eventType: 'MARGIN_CALL';
  eventTime: number;
  crossWalletBalance: number;
  positions: Array<{
    symbol: string;
    positionSide: 'LONG' | 'SHORT' | 'BOTH';
    positionAmount: number;
    marginType: 'isolated' | 'cross';
    isolatedWallet: number;
    markPrice: number;
    unrealizedPnl: number;
    maintenanceMarginRequired: number;
  }>;
}

export type UserDataEvent =
  | UserDataAccountUpdate
  | UserDataOrderUpdate
  | UserDataMarginCall;

// ─── Exchange Circuit Breaker (Phase 19) ─────────────────────

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',         // Normal — all requests pass through
  OPEN = 'OPEN',             // Tripped — all requests rejected
  HALF_OPEN = 'HALF_OPEN',   // Testing — single probe request allowed
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  tripCount: number;            // How many times circuit has tripped
  nextProbeAt: number | null;   // When HALF_OPEN probe will be attempted
}

// ─── Atomic Order Lifecycle Engine (AOLE, Phase 19.1) ────────

/**
 * State machine states for atomic multi-leg order orchestration.
 * Core invariant: A position NEVER exists without stop-loss protection.
 */
export enum OrderLifecycleState {
  PENDING = 'PENDING',                     // Initial: awaiting execution
  SETTING_LEVERAGE = 'SETTING_LEVERAGE',   // Setting leverage for symbol
  PLACING_ENTRY = 'PLACING_ENTRY',         // Entry order submitted
  ENTRY_FILLED = 'ENTRY_FILLED',           // Entry filled, SL needed NOW
  PLACING_SL = 'PLACING_SL',              // SL order being placed
  SL_PLACED = 'SL_PLACED',                // SL confirmed, TP optional
  PLACING_TP = 'PLACING_TP',              // TP order being placed
  FULLY_ARMED = 'FULLY_ARMED',            // All legs placed: Entry + SL + TP
  SL_ONLY = 'SL_ONLY',                    // SL placed, TP failed (acceptable)
  EMERGENCY_CLOSE = 'EMERGENCY_CLOSE',     // SL FAILED → force-closing position
  CLOSED = 'CLOSED',                       // Position closed (SL/TP hit or manual)
  FAILED = 'FAILED',                       // Entry failed, nothing to rollback
  ROLLED_BACK = 'ROLLED_BACK',            // Emergency close completed
}

/**
 * Configuration for an atomic multi-leg order group.
 */
export interface OrderGroupConfig {
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryType: 'LIMIT' | 'MARKET';
  entryPrice?: number;           // Required for LIMIT
  stopLossPrice: number;         // MANDATORY — absolute price
  takeProfitPrice?: number;      // Optional — if omitted, SL_ONLY is terminal state
  leverage: number;              // Capped at 10
  marginType?: 'ISOLATED' | 'CROSSED';
  maxSlRetries: number;          // Retries before EMERGENCY_CLOSE (default: 3)
}

/**
 * A state transition record for the audit trail.
 */
export interface StateTransition {
  fromState: OrderLifecycleState;
  toState: OrderLifecycleState;
  timestamp: number;
  reason: string;
  orderId?: number;              // Associated order, if any
  error?: string;                // Error message, if transition was due to failure
}

/**
 * An atomic order group — tracks the full lifecycle of a multi-leg position.
 */
export interface OrderGroup {
  groupId: string;               // UUID v4
  config: OrderGroupConfig;
  state: OrderLifecycleState;
  stateHistory: StateTransition[];
  entryOrder: OrderResult | null;
  slOrder: OrderResult | null;
  tpOrder: OrderResult | null;
  emergencyCloseOrder: OrderResult | null;
  slRetryCount: number;
  createdAt: number;
  completedAt: number | null;
  executionQuality: ExecutionRecord | null;
}

// ─── Execution Quality Tracking (AOLE Phase 19.1) ────────────

/**
 * Records the quality of a single order execution.
 * Measures actual fill vs expected for slippage attribution.
 */
export interface ExecutionRecord {
  orderId: number;
  groupId: string;
  symbol: string;
  side: OrderSide;
  expectedPrice: number;          // Market price at time of submission
  fillPrice: number;              // Actual average fill price
  slippageBps: number;            // Actual slippage in basis points
  latencyMs: number;              // Submission-to-fill latency
  orderBookSpreadBps: number;     // Bid-ask spread at submission time
  fillRatio: number;              // executedQty / origQty (0-1)
  timestamp: number;
}

/**
 * Aggregated execution quality statistics per symbol.
 */
export interface ExecutionQualityStats {
  symbol: string;
  avgSlippageBps: number;
  p95SlippageBps: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgFillRatio: number;
  sampleCount: number;
  lastUpdated: number;
}

// ─── Adaptive Rate Governor (AOLE Phase 19.1) ────────────────

/**
 * Real-time rate limit status from Binance response headers.
 */
export interface AdaptiveRateStatus {
  usedWeight1m: number;           // X-MBX-USED-WEIGHT-1m
  maxWeight1m: number;            // 2400 for Futures
  orderCount1m: number;           // X-MBX-ORDER-COUNT-1m
  maxOrderCount1m: number;        // 300 for Futures
  weightUtilization: number;      // 0-1 ratio
  orderUtilization: number;       // 0-1 ratio
  currentConcurrency: number;     // Dynamically adjusted 1-10
  lastUpdated: number;
}

// ─── Cortex Live Engine (Phase 20) ───────────────────────────

/**
 * Status of the CortexLiveEngine orchestrator.
 * Tracks current phase, seed progress, and uptime.
 */
export interface CortexLiveStatus {
  phase: 'idle' | 'seeding' | 'connecting' | 'live' | 'error' | 'stopped';
  seedProgress: {
    completed: number;
    total: number;
    currentSlot: string;
  };
  activeSlots: string[];
  connectionStatus: ConnectionStatus;
  uptimeMs: number;
  startedAt: number | null;
  lastError: string | null;
}

/**
 * Configuration for the EvolutionScheduler.
 * Determines when to trigger backtesting + evolution for each island.
 */
export interface EvolutionSchedulerConfig {
  /** Number of candle closes before triggering evolution for an island. Default: 10 */
  candlesPerEvolution: number;
  /** Max concurrent evolution cycles across all islands. Default: 1 (sequential) */
  maxConcurrentEvolutions: number;
  /** Minimum time between evolution cycles per island (ms). Default: 5000 */
  cooldownMs: number;
  /** Enable auto-evolution on candle close. Default: true */
  autoEvolveEnabled: boolean;
}

/**
 * Per-island evolution scheduling status.
 */
export interface EvolutionSlotStatus {
  slotId: string;
  candlesSinceLastEvolution: number;
  lastEvolutionTimestamp: number;
  isEvolving: boolean;
  totalEvolutionCycles: number;
  lastBacktestDurationMs: number;
  lastGenerationFitness: number;
}

// ─── System Bootstrap (Phase 36) ─────────────────────────────

/**
 * Boot sequence phases — executed in strict order.
 * Each phase depends on the successful completion of the previous one.
 */
export enum BootPhase {
  IDLE = 'IDLE',
  ENV_CHECK = 'ENV_CHECK',
  PERSISTENCE = 'PERSISTENCE',
  CORTEX_SPAWN = 'CORTEX_SPAWN',
  HISTORICAL_SEED = 'HISTORICAL_SEED',
  WS_CONNECT = 'WS_CONNECT',
  EVOLUTION_START = 'EVOLUTION_START',
  READY = 'READY',
  ERROR = 'ERROR',
  SHUTDOWN = 'SHUTDOWN',
}

/**
 * Real-time progress within a boot phase.
 */
export interface BootProgress {
  /** Current phase in execution */
  phase: BootPhase;
  /** Overall boot progress 0-100 */
  overallPercent: number;
  /** Human-readable status message for the current phase */
  message: string;
  /** Slot-level seed progress (only during HISTORICAL_SEED) */
  slotProgress: {
    completed: number;
    total: number;
    currentSlot: string;
  };
}

/**
 * Configuration overrides for the boot sequence.
 */
export interface BootConfig {
  /** Trading pairs to activate. Default: ['BTCUSDT', 'ETHUSDT'] */
  pairs: string[];
  /** Timeframe per slot. Default: Timeframe.H1 */
  timeframe: Timeframe;
  /** Starting capital. Default: 10000 */
  totalCapital: number;
  /** Skip persistence hydration (fresh start). Default: false */
  skipPersistence: boolean;
  /** Enable auto-trade after boot. Default: false */
  autoTrade: boolean;
  /** Phase 38.1: Cached probe result from Pre-Boot Diagnostic (skip redundant ENV_CHECK API call if < 60s old) */
  cachedProbeResult?: {
    ready: boolean;
    isTestnet: boolean;
    checks: Array<{ name: string; status: string; details: string; latencyMs: number }>;
    timestamp: number;
  };
}

/**
 * Complete boot system snapshot — exposed to UI via BootStore.
 */
export interface BootState {
  /** Current boot phase */
  phase: BootPhase;
  /** Detailed progress */
  progress: BootProgress;
  /** Per-subsystem status indicators */
  envStatus: 'pending' | 'valid' | 'invalid';
  persistenceStatus: 'pending' | 'hydrated' | 'fresh' | 'error';
  cortexStatus: 'pending' | 'spawned' | 'error';
  seedStatus: 'pending' | 'seeding' | 'complete' | 'error';
  wsStatus: 'pending' | 'connecting' | 'connected' | 'error';
  evolutionStatus: 'pending' | 'active' | 'error';
  /** Total boot duration in milliseconds */
  bootDurationMs: number;
  /** Per-phase completion times */
  phaseDurations: Partial<Record<BootPhase, number>>;
  /** Error message, if any */
  error: string | null;
  /** Whether the system has successfully booted at least once */
  hasBooted: boolean;
}

