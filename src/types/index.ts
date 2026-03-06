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
  metadata: {
    mutationHistory: string[];
    fitnessScore: number;
    tradeCount: number;
    lastEvaluated: number | null;
    validation: StrategyValidation | null;
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
