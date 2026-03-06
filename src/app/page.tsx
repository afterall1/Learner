'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Brain, Activity, BarChart3, Shield,
  Play, Pause,
  ArrowUpRight, ArrowDownRight, Dna, GitBranch, AlertTriangle,
  ChevronRight, Wallet, Wifi, WifiOff,
  History, Radio, Network, Zap
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid
} from 'recharts';
import {
  BrainState, LogLevel, StrategyStatus, TradeDirection,
  TradeStatus, Timeframe, IndicatorType, ConnectionStatus,
} from '@/types';
import type {
  StrategyDNA, Trade, BrainLog, EvolutionGeneration,
  PerformanceMetrics, Position, PortfolioSummary, MarketTick,
} from '@/types';
import { generateRandomStrategy } from '@/lib/engine/strategy-dna';
import { evaluatePerformance, calculateFitnessScore } from '@/lib/engine/evaluator';
import { useMarketStore, useMarketDataStore } from '@/lib/store';

// ═══════════════════════════════════════════════════════════════
// DEMO DATA GENERATORS — Simulation engine for realistic data
// ═══════════════════════════════════════════════════════════════

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateDemoTrades(strategyId: string, strategyName: string, count: number): Trade[] {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
  const trades: Trade[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const dir = Math.random() > 0.5 ? TradeDirection.LONG : TradeDirection.SHORT;
    const isWin = Math.random() > 0.45;
    const pnlP = isWin ? randomBetween(0.5, 4.5) : randomBetween(-3.0, -0.3);
    const entry = randomBetween(40000, 70000);
    const sl = dir === TradeDirection.LONG ? entry * 0.98 : entry * 1.02;
    const tp = dir === TradeDirection.LONG ? entry * 1.04 : entry * 0.96;
    const exitP = isWin
      ? (dir === TradeDirection.LONG ? entry * (1 + pnlP / 100) : entry * (1 - pnlP / 100))
      : (dir === TradeDirection.LONG ? entry * (1 + pnlP / 100) : entry * (1 - pnlP / 100));
    const holdMs = randomBetween(300000, 86400000);

    trades.push({
      id: `trade-${i}-${Date.now()}`,
      strategyId,
      strategyName,
      slotId: 'BTCUSDT:1h', // Demo default slot
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
      direction: dir,
      status: TradeStatus.CLOSED,
      isPaperTrade: true,
      entryPrice: Math.round(entry * 100) / 100,
      exitPrice: Math.round(exitP * 100) / 100,
      quantity: randomBetween(0.001, 0.01),
      leverage: Math.floor(randomBetween(2, 8)),
      stopLoss: Math.round(sl * 100) / 100,
      takeProfit: Math.round(tp * 100) / 100,
      pnlPercent: Math.round(pnlP * 100) / 100,
      pnlUSD: Math.round(pnlP * randomBetween(5, 20) * 100) / 100,
      fees: Math.round(randomBetween(0.1, 2) * 100) / 100,
      entryTime: now - holdMs - (count - i) * 3600000,
      exitTime: now - (count - i) * 3600000,
      entryReason: `Entry triggered: ${['RSI oversold bounce', 'EMA crossover', 'MACD divergence', 'Bollinger squeeze breakout', 'ADX trend confirmation'][Math.floor(Math.random() * 5)]}`,
      exitReason: isWin ? 'Take profit hit' : 'Stop loss triggered',
      indicators: { RSI: randomBetween(20, 80), EMA20: entry * randomBetween(0.98, 1.02) },
    });
  }
  return trades;
}

function generateDemoEvolutionHistory(genCount: number): EvolutionGeneration[] {
  const gens: EvolutionGeneration[] = [];
  for (let i = 0; i < genCount; i++) {
    const pop = Array.from({ length: 10 }, () => {
      const s = generateRandomStrategy(i);
      s.metadata.fitnessScore = Math.round(randomBetween(5 + i * 2, 30 + i * 3));
      return s;
    });
    const best = pop.reduce((a, b) => a.metadata.fitnessScore > b.metadata.fitnessScore ? a : b);
    gens.push({
      id: `gen-${i}`,
      generationNumber: i,
      createdAt: Date.now() - (genCount - i) * 3600000,
      completedAt: Date.now() - (genCount - i) * 3600000 + 1800000,
      population: pop,
      bestStrategyId: best.id,
      bestFitnessScore: best.metadata.fitnessScore,
      averageFitnessScore: Math.round(pop.reduce((s, p) => s + p.metadata.fitnessScore, 0) / pop.length),
      metrics: {
        totalTradesExecuted: 10 * pop.length,
        populationSize: pop.length,
        mutationRate: 0.3,
        crossoverRate: 0.6,
        survivalRate: 0.2,
      },
    });
  }
  return gens;
}

function generateDemoLogs(): BrainLog[] {
  const messages: [LogLevel, string][] = [
    [LogLevel.INFO, '🧠 Brain ACTIVATED — Starting exploration phase'],
    [LogLevel.EVOLUTION, '🧬 Genesis generation created with 10 strategies'],
    [LogLevel.DECISION, 'Selected strategy: Swift Eagle — RSI(14), EMA(20), MACD'],
    [LogLevel.TRADE, 'Trade opened: BTCUSDT LONG @ $65,420.00 — RSI oversold bounce'],
    [LogLevel.TRADE, 'Trade closed: BTCUSDT LONG → +2.34% ($46.80)'],
    [LogLevel.INFO, 'Strategy rotation: Moving to Quantum Falcon (3/10 trades done)'],
    [LogLevel.TRADE, 'Trade opened: ETHUSDT SHORT @ $3,890.50 — EMA crossover'],
    [LogLevel.WARNING, '⚠️ Daily drawdown at 3.2% — Approaching 5% limit'],
    [LogLevel.TRADE, 'Trade closed: ETHUSDT SHORT → -1.05% (-$21.00)'],
    [LogLevel.EVOLUTION, '📊 Evaluation triggered — Analyzing strategy performance'],
    [LogLevel.DECISION, 'Top performer: Nova Tiger (Score: 67) — Sharpe: 1.82, WR: 58%'],
    [LogLevel.EVOLUTION, '🧬 EVOLUTION — Generation 8 created. Best score improved: 52→67'],
    [LogLevel.TRADE, 'Trade opened: SOLUSDT LONG @ $178.30 — Bollinger squeeze breakout'],
    [LogLevel.TRADE, 'Trade closed: SOLUSDT LONG → +3.87% ($77.40)'],
    [LogLevel.RISK, '🛡️ Risk check passed: 1.2% risk, 2/3 positions, 2.1% daily DD'],
    [LogLevel.DECISION, 'Active strategy promoted: Nova Tiger → CANDIDATE status'],
    [LogLevel.INFO, 'Paper trade milestone: 42/50 trades completed for live qualification'],
  ];
  const now = Date.now();
  return messages.map(([level, message], i) => ({
    id: `log-${i}`,
    timestamp: now - (messages.length - i) * 180000,
    level,
    message,
  }));
}

function generateDemoEquityCurve(points: number): { time: string; equity: number; drawdown: number }[] {
  let equity = 10000;
  const data: { time: string; equity: number; drawdown: number }[] = [];
  let peak = equity;
  for (let i = 0; i < points; i++) {
    const change = randomBetween(-80, 100);
    equity += change;
    if (equity < 8000) equity = 8000 + randomBetween(0, 200);
    peak = Math.max(peak, equity);
    const dd = ((peak - equity) / peak) * 100;
    const d = new Date(Date.now() - (points - i) * 3600000);
    data.push({
      time: `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`,
      equity: Math.round(equity * 100) / 100,
      drawdown: Math.round(dd * 100) / 100,
    });
  }
  return data;
}

function generateDemoMarketTicks(): MarketTick[] {
  const pairs = [
    { symbol: 'BTCUSDT', base: 65000 },
    { symbol: 'ETHUSDT', base: 3800 },
    { symbol: 'BNBUSDT', base: 580 },
    { symbol: 'SOLUSDT', base: 175 },
    { symbol: 'XRPUSDT', base: 0.62 },
    { symbol: 'ADAUSDT', base: 0.45 },
    { symbol: 'DOGEUSDT', base: 0.12 },
    { symbol: 'AVAXUSDT', base: 38 },
  ];
  return pairs.map(p => ({
    symbol: p.symbol,
    price: Math.round(p.base * randomBetween(0.97, 1.03) * 10000) / 10000,
    volume24h: Math.round(randomBetween(100000000, 5000000000)),
    priceChange24h: Math.round(p.base * randomBetween(-0.05, 0.05) * 100) / 100,
    priceChangePercent24h: Math.round(randomBetween(-5, 5) * 100) / 100,
    high24h: Math.round(p.base * 1.03 * 100) / 100,
    low24h: Math.round(p.base * 0.97 * 100) / 100,
    timestamp: Date.now(),
  }));
}

// ═══════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function BrainStateIndicator({ state }: { state: BrainState }) {
  const stateMap: Record<BrainState, { label: string; cssClass: string }> = {
    [BrainState.IDLE]: { label: 'Idle', cssClass: 'idle' },
    [BrainState.EXPLORING]: { label: 'Exploring', cssClass: 'exploring' },
    [BrainState.EVALUATING]: { label: 'Evaluating', cssClass: 'evaluating' },
    [BrainState.EVOLVING]: { label: 'Evolving', cssClass: 'evolving' },
    [BrainState.TRADING]: { label: 'Trading', cssClass: 'trading' },
    [BrainState.VALIDATING]: { label: 'Validating', cssClass: 'evaluating' },
    [BrainState.SHADOW_TRADING]: { label: 'Shadow', cssClass: 'exploring' },
    [BrainState.PAUSED]: { label: 'Paused', cssClass: 'paused' },
    [BrainState.EMERGENCY_STOP]: { label: 'Emergency Stop', cssClass: 'emergency' },
  };
  const s = stateMap[state];
  return (
    <span className={`brain-state ${s.cssClass}`}>
      <span className="dot" />
      {s.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// ANIMATED COUNTER HOOK — Smooth number transitions
// ═══════════════════════════════════════════════════════════════

function useAnimatedValue(target: number, duration: number = 600): number {
  const [current, setCurrent] = useState(target);
  const prevRef = useRef(target);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    prevRef.current = target;
    if (from === to) return;

    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(from + (to - from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return current;
}

function AnimatedCounter({ value, prefix = '', suffix = '', decimals = 2, className = '' }: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const animated = useAnimatedValue(value);
  return (
    <span className={`counter-value ${className}`}>
      {prefix}{animated.toFixed(decimals)}{suffix}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL: Portfolio Overview
// ═══════════════════════════════════════════════════════════════

function PortfolioOverview({ summary }: { summary: PortfolioSummary }) {
  const animatedBalance = useAnimatedValue(summary.totalBalance);
  return (
    <div className="glass-card glass-card-accent accent-cyan col-4 stagger-in stagger-1">
      <div className="card-header">
        <div className="card-title">
          <Wallet size={18} />
          Portfolio Overview
        </div>
        <span className="card-badge badge-info">Paper</span>
      </div>
      <div className="card-body">
        <div style={{ marginBottom: 20 }}>
          <div className="stat-label">Total Balance</div>
          <div className="stat-value neutral">{formatUSD(animatedBalance)}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <div>
              <span className="stat-label">Available </span>
              <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600 }}>
                {formatUSD(summary.availableBalance)}
              </span>
            </div>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <div className={`metric-value ${summary.todayPnl >= 0 ? 'positive' : 'negative'}`}
              style={{ color: summary.todayPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatPercent(summary.todayPnlPercent)}
            </div>
            <div className="metric-label">Today</div>
          </div>
          <div className="metric-card">
            <div className="metric-value"
              style={{ color: summary.weekPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatPercent(summary.weekPnlPercent)}
            </div>
            <div className="metric-label">This Week</div>
          </div>
          <div className="metric-card">
            <div className="metric-value"
              style={{ color: summary.allTimePnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatUSD(summary.allTimePnl)}
            </div>
            <div className="metric-label">All-Time P&L</div>
          </div>
          <div className="metric-card">
            <div className="metric-value" style={{ color: 'var(--accent-primary)' }}>
              {summary.activePositions}
            </div>
            <div className="metric-label">Positions</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL: Active Strategy
// ═══════════════════════════════════════════════════════════════

function ActiveStrategyPanel({ strategy, metrics }: {
  strategy: StrategyDNA | null;
  metrics: PerformanceMetrics | null;
}) {
  if (!strategy) {
    return (
      <div className="glass-card glass-card-accent accent-primary col-4 stagger-in stagger-2">
        <div className="card-header">
          <div className="card-title"><Dna size={18} /> Active Strategy</div>
        </div>
        <div className="empty-state">
          <Brain size={48} />
          <p>No active strategy. Start the AI Brain to begin exploration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card glass-card-accent accent-primary col-4 stagger-in stagger-2">
      <div className="card-header">
        <div className="card-title"><Dna size={18} /> Active Strategy</div>
        <span className={`card-badge ${strategy.status === StrategyStatus.ACTIVE ? 'badge-success' :
          strategy.status === StrategyStatus.PAPER ? 'badge-warning' : 'badge-info'}`}>
          {strategy.status}
        </span>
      </div>
      <div className="card-body">
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{strategy.name}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Gen #{strategy.generation}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Score: <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
              {strategy.metadata.fitnessScore}
            </span> / 100 &nbsp;·&nbsp; {strategy.metadata.tradeCount} trades
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            DNA Strand
          </div>
          <div className="dna-strand">
            {strategy.indicators.map((ind, i) => (
              <span key={i} className="dna-gene indicator">
                {ind.type}({ind.period})
              </span>
            ))}
            <span className="dna-gene timeframe">{strategy.preferredTimeframe}</span>
            <span className="dna-gene risk">
              SL:{strategy.riskGenes.stopLossPercent}% TP:{strategy.riskGenes.takeProfitPercent}%
            </span>
            <span className="dna-gene direction">
              {strategy.directionBias ?? 'BOTH'}
            </span>
          </div>
        </div>

        {metrics && (
          <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--success)', fontSize: '1rem' }}>
                {(metrics.winRate * 100).toFixed(1)}%
              </div>
              <div className="metric-label">Win Rate</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--accent-cyan)', fontSize: '1rem' }}>
                {metrics.sharpeRatio.toFixed(2)}
              </div>
              <div className="metric-label">Sharpe</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--accent-primary)', fontSize: '1rem' }}>
                {metrics.profitFactor.toFixed(2)}
              </div>
              <div className="metric-label">Profit Factor</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL: Risk Gauge
// ═══════════════════════════════════════════════════════════════

function RiskGauge({ utilization, dailyDD, positions, maxPositions, isEmergency, onEmergencyStop }: {
  utilization: number;
  dailyDD: number;
  positions: number;
  maxPositions: number;
  isEmergency: boolean;
  onEmergencyStop: () => void;
}) {
  const radius = 60;
  const circumference = Math.PI * radius;
  const offset = circumference - (utilization * circumference);
  const color = utilization < 0.5 ? 'var(--success)' : utilization < 0.8 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className={`glass-card glass-card-accent col-4 stagger-in stagger-3 ${utilization > 0.7 ? 'accent-rose-critical' : 'accent-rose'}`}>
      <div className="card-header">
        <div className="card-title"><Shield size={18} /> Risk Monitor</div>
        {isEmergency && <span className="card-badge badge-danger pulse">EMERGENCY</span>}
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div className="risk-gauge-container">
          <svg width="150" height="85" viewBox="0 0 150 85">
            <path
              d="M 15 80 A 60 60 0 0 1 135 80"
              fill="none"
              stroke="rgba(99, 115, 171, 0.1)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d="M 15 80 A 60 60 0 0 1 135 80"
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={offset}
              className="risk-gauge-arc"
              style={{ filter: `drop-shadow(0 0 8px ${color})` }}
            />
            <text x="75" y="65" textAnchor="middle" fill={color}
              fontSize="22" fontWeight="700" fontFamily="var(--font-mono)">
              {Math.round(utilization * 100)}%
            </text>
            <text x="75" y="80" textAnchor="middle" fill="var(--text-muted)" fontSize="9">
              Risk Utilization
            </text>
          </svg>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Daily Drawdown</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: dailyDD > 3 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                {dailyDD.toFixed(1)}% / 5%
              </span>
            </div>
            <div className="progress-bar">
              <div className={`progress-fill ${dailyDD > 3 ? 'danger' : dailyDD > 2 ? 'warning' : 'success'}`}
                style={{ width: `${Math.min(dailyDD / 5 * 100, 100)}%` }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Positions</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {positions} / {maxPositions}
              </span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill primary" style={{ width: `${(positions / maxPositions) * 100}%` }} />
            </div>
          </div>
        </div>

        <button className="btn btn-danger btn-sm" onClick={onEmergencyStop}
          style={{ width: '100%', marginTop: 4 }}>
          <AlertTriangle size={14} />
          Emergency Stop
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL: Performance Chart
// ═══════════════════════════════════════════════════════════════

function PerformanceChartPanel({ equityData, metrics }: {
  equityData: { time: string; equity: number; drawdown: number }[];
  metrics: PerformanceMetrics | null;
}) {
  const [chartView, setChartView] = useState<'equity' | 'drawdown'>('equity');

  return (
    <div className="glass-card glass-card-accent accent-emerald col-8 stagger-in stagger-4">
      <div className="card-header">
        <div className="card-title"><BarChart3 size={18} /> Performance</div>
        <div className="pill-tabs">
          <button className={`pill-tab ${chartView === 'equity' ? 'active' : ''}`}
            onClick={() => setChartView('equity')}>Equity</button>
          <button className={`pill-tab ${chartView === 'drawdown' ? 'active' : ''}`}
            onClick={() => setChartView('drawdown')}>Drawdown</button>
        </div>
      </div>
      <div className="card-body">
        {metrics && (
          <div className="metric-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="metric-card">
              <div className="metric-value" style={{ fontSize: '1rem', color: 'var(--success)' }}>
                {(metrics.winRate * 100).toFixed(1)}%
              </div>
              <div className="metric-label">Win Rate</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ fontSize: '1rem', color: 'var(--accent-cyan)' }}>
                {metrics.sharpeRatio.toFixed(2)}
              </div>
              <div className="metric-label">Sharpe Ratio</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ fontSize: '1rem', color: 'var(--accent-primary)' }}>
                {metrics.profitFactor.toFixed(2)}
              </div>
              <div className="metric-label">Profit Factor</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ fontSize: '1rem', color: 'var(--danger)' }}>
                {(metrics.maxDrawdown * 100).toFixed(1)}%
              </div>
              <div className="metric-label">Max DD</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{
                fontSize: '1rem',
                color: metrics.expectancy > 0 ? 'var(--success)' : 'var(--danger)'
              }}>
                {metrics.expectancy.toFixed(3)}
              </div>
              <div className="metric-label">Expectancy</div>
            </div>
          </div>
        )}
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartView === 'equity' ? (
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.08)" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} domain={['dataMin - 200', 'dataMax + 200']}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(14,17,30,0.95)', border: '1px solid rgba(99,115,171,0.2)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(value: string | number | undefined) => [`$${Number(value ?? 0).toFixed(2)}`, 'Equity']}
                />
                <Area type="monotone" dataKey="equity" stroke="#6366f1" strokeWidth={2} fill="url(#equityGrad)" />
              </AreaChart>
            ) : (
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.08)" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(14,17,30,0.95)', border: '1px solid rgba(99,115,171,0.2)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: string | number | undefined) => [`${Number(value ?? 0).toFixed(2)}%`, 'Drawdown']}
                />
                <Area type="monotone" dataKey="drawdown" stroke="#f43f5e" strokeWidth={2} fill="url(#ddGrad)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL: Evolution Timeline
// ═══════════════════════════════════════════════════════════════

function EvolutionTimelinePanel({ generations }: { generations: EvolutionGeneration[] }) {
  const maxScore = Math.max(...generations.map(g => g.bestFitnessScore), 1);
  const trendData = generations.map(g => ({
    gen: `G${g.generationNumber}`,
    best: g.bestFitnessScore,
    avg: g.averageFitnessScore,
  }));

  return (
    <div className="glass-card glass-card-accent accent-purple col-4 stagger-in stagger-5">
      <div className="card-header">
        <div className="card-title"><GitBranch size={18} /> Evolution</div>
        <span className="card-badge badge-primary">Gen #{generations.length - 1}</span>
      </div>
      <div className="card-body">
        <div style={{ height: 120, marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,115,171,0.08)" />
              <XAxis dataKey="gen" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: 'rgba(14,17,30,0.95)', border: '1px solid rgba(99,115,171,0.2)', borderRadius: 8, fontSize: 11 }}
              />
              <Bar dataKey="best" fill="#6366f1" radius={[3, 3, 0, 0]} name="Best Score" />
              <Bar dataKey="avg" fill="rgba(99,102,241,0.3)" radius={[3, 3, 0, 0]} name="Avg Score" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="metric-card" style={{ flex: 1 }}>
            <div className="metric-value" style={{ color: 'var(--accent-primary)', fontSize: '1rem' }}>
              {generations.length}
            </div>
            <div className="metric-label">Generations</div>
          </div>
          <div className="metric-card" style={{ flex: 1 }}>
            <div className="metric-value" style={{ color: 'var(--success)', fontSize: '1rem' }}>
              {generations[generations.length - 1]?.bestFitnessScore ?? 0}
            </div>
            <div className="metric-label">Best Score</div>
          </div>
          <div className="metric-card" style={{ flex: 1 }}>
            <div className="metric-value" style={{ color: 'var(--accent-cyan)', fontSize: '1rem' }}>
              {generations.reduce((s, g) => s + g.metrics.totalTradesExecuted, 0)}
            </div>
            <div className="metric-label">Total Trades</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL: Brain Monitor
// ═══════════════════════════════════════════════════════════════

function BrainMonitorPanel({ logs, brainState }: { logs: BrainLog[]; brainState: BrainState }) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [logs.length]);

  const levelClass = (level: LogLevel): string => {
    const map: Record<LogLevel, string> = {
      [LogLevel.INFO]: 'info',
      [LogLevel.DECISION]: 'decision',
      [LogLevel.TRADE]: 'trade',
      [LogLevel.EVOLUTION]: 'evolution',
      [LogLevel.WARNING]: 'warning',
      [LogLevel.ERROR]: 'error',
      [LogLevel.RISK]: 'risk',
    };
    return map[level];
  };

  return (
    <div className="glass-card glass-card-accent accent-amber col-8 stagger-in stagger-6">
      <div className="card-header">
        <div className="card-title"><Brain size={18} /> AI Brain Monitor</div>
        <BrainStateIndicator state={brainState} />
      </div>
      <div className="card-body" style={{ padding: '12px 16px' }}>
        <div className="log-feed" ref={feedRef}>
          {logs.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px' }}>
              <Radio size={32} />
              <p>Brain is idle. Start the AI to see activity.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="log-entry">
                <span className="log-time">{formatTime(log.timestamp)}</span>
                <span className={`log-level ${levelClass(log.level)}`} />
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL: Trade History
// ═══════════════════════════════════════════════════════════════

function TradeHistoryPanel({ trades }: { trades: Trade[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const recentTrades = trades.slice(-20).reverse();

  return (
    <div className="glass-card glass-card-accent accent-primary col-8 stagger-in stagger-7">
      <div className="card-header">
        <div className="card-title"><History size={18} /> Trade History</div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{trades.length} total</span>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Pair</th>
              <th>Dir</th>
              <th>Strategy</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>P&L</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recentTrades.map((trade) => (
              <React.Fragment key={trade.id}>
                <tr onClick={() => setExpandedId(expandedId === trade.id ? null : trade.id)}
                  style={{ cursor: 'pointer' }}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    {formatTime(trade.entryTime)}
                  </td>
                  <td style={{ fontWeight: 600 }}>{trade.symbol}</td>
                  <td>
                    <span className={`card-badge ${trade.direction === TradeDirection.LONG ? 'badge-success' : 'badge-danger'}`}>
                      {trade.direction === TradeDirection.LONG ? '↑ Long' : '↓ Short'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{trade.strategyName}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>${trade.entryPrice.toLocaleString()}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>
                    {trade.exitPrice ? `$${trade.exitPrice.toLocaleString()}` : '—'}
                  </td>
                  <td>
                    {trade.pnlPercent !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {trade.pnlPercent > 0 ? <ArrowUpRight size={14} color="var(--success)" /> : <ArrowDownRight size={14} color="var(--danger)" />}
                        <span style={{
                          color: trade.pnlPercent > 0 ? 'var(--success)' : 'var(--danger)',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {formatPercent(trade.pnlPercent)}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <ChevronRight size={14} style={{
                      color: 'var(--text-muted)',
                      transform: expandedId === trade.id ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s',
                    }} />
                  </td>
                </tr>
                {expandedId === trade.id && (
                  <tr>
                    <td colSpan={8} style={{ background: 'rgba(99,102,241,0.03)', padding: '12px 16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.8rem' }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Entry Reason: </span>
                          <span style={{ color: 'var(--text-secondary)' }}>{trade.entryReason}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Exit Reason: </span>
                          <span style={{ color: 'var(--text-secondary)' }}>{trade.exitReason ?? '—'}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Leverage: </span>
                          <span style={{ fontWeight: 600 }}>{trade.leverage}x</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>P&L USD: </span>
                          <span style={{
                            fontWeight: 600,
                            color: (trade.pnlUSD ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)',
                          }}>
                            {formatUSD(trade.pnlUSD ?? 0)}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONNECTION STATUS INDICATOR
// ═══════════════════════════════════════════════════════════════

function ConnectionStatusBadge() {
  const connectionStatus = useMarketDataStore((s) => s.connectionStatus);
  const isLiveMode = useMarketDataStore((s) => s.isLiveMode);

  const statusConfig: Record<ConnectionStatus, { label: string; color: string; icon: typeof Wifi }> = {
    [ConnectionStatus.DISCONNECTED]: { label: 'Demo Mode', color: 'var(--text-muted)', icon: WifiOff },
    [ConnectionStatus.CONNECTING]: { label: 'Connecting...', color: 'var(--warning)', icon: Wifi },
    [ConnectionStatus.CONNECTED]: { label: 'Live', color: 'var(--success)', icon: Wifi },
    [ConnectionStatus.RECONNECTING]: { label: 'Reconnecting...', color: 'var(--warning)', icon: Wifi },
    [ConnectionStatus.CIRCUIT_OPEN]: { label: 'Disconnected', color: 'var(--danger)', icon: WifiOff },
  };

  const config = statusConfig[connectionStatus];
  const Icon = config.icon;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 'var(--radius-sm)',
      background: `${config.color}15`,
      border: `1px solid ${config.color}30`,
      fontSize: '0.7rem',
      fontWeight: 600,
      color: config.color,
      letterSpacing: '0.02em',
    }}>
      <Icon size={12} />
      {config.label}
      {connectionStatus === ConnectionStatus.CONNECTING && (
        <span style={{ animation: 'pulse-glow 1.5s ease-in-out infinite' }}>●</span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL: Market Overview (Live + Demo fallback)
// ═══════════════════════════════════════════════════════════════

function MarketOverviewPanel({ tickers: demoTickers }: { tickers: MarketTick[] }) {
  const liveTickers = useMarketStore((s) => s.tickers);
  const isLive = useMarketDataStore((s) => s.connectionStatus === ConnectionStatus.CONNECTED);

  // Use live tickers if connected, otherwise fall back to demo data
  const displayTickers = useMemo(() => {
    if (isLive && liveTickers.size > 0) {
      return Array.from(liveTickers.values());
    }
    return demoTickers;
  }, [isLive, liveTickers, demoTickers]);

  return (
    <div className="glass-card glass-card-accent accent-cyan col-4 stagger-in stagger-8">
      <div className="card-header">
        <div className="card-title"><Activity size={18} /> Market</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: '0.6rem',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            background: isLive ? 'var(--success)15' : 'var(--text-muted)15',
            color: isLive ? 'var(--success)' : 'var(--text-muted)',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            {isLive ? '● Live' : '○ Demo'}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Binance Futures</span>
        </div>
      </div>
      <div className="card-body" style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {displayTickers.map((tick) => (
            <div key={tick.symbol}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                transition: 'background var(--transition-fast)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.04)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  {tick.symbol.replace('USDT', '')}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.7rem' }}>/USDT</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>
                  ${tick.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: tick.price < 1 ? 4 : 2 })}
                </div>
                <div className={`stat-change ${tick.priceChangePercent24h >= 0 ? 'positive' : 'negative'}`}>
                  {tick.priceChangePercent24h >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  {Math.abs(tick.priceChangePercent24h).toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL: Cortex Neural Map — Live Island Visualization
// ═══════════════════════════════════════════════════════════════

interface IslandNode {
  id: string;
  pair: string;
  timeframe: string;
  state: string;
  fitness: number;
  generation: number;
  trades: number;
  metaGen: number;
  x: number;
  y: number;
}

interface MigrationFlow {
  from: string;
  to: string;
  count: number;
}

function generateDemoIslandNodes(): IslandNode[] {
  const states = ['trading', 'evolving', 'exploring', 'evaluating', 'trading', 'trading'];
  const pairs = ['BTC', 'ETH', 'SOL', 'BNB', 'ADA', 'XRP'];
  const timeframes = ['15m', '1h', '4h', '15m', '1h', '4h'];

  // Circular layout around center
  return pairs.map((pair, i) => {
    const angle = (i / pairs.length) * Math.PI * 2 - Math.PI / 2;
    const rx = 120;
    const ry = 90;
    return {
      id: `${pair}:${timeframes[i]}`,
      pair,
      timeframe: timeframes[i],
      state: states[i],
      fitness: Math.round(randomBetween(20, 85)),
      generation: Math.round(randomBetween(3, 15)),
      trades: Math.round(randomBetween(30, 200)),
      metaGen: Math.round(randomBetween(0, 5)),
      x: 50 + Math.cos(angle) * (rx / 2.2) * (100 / rx),
      y: 50 + Math.sin(angle) * (ry / 1.3) * (100 / ry),
    };
  });
}

function generateDemoMigrationFlows(): MigrationFlow[] {
  return [
    { from: 'BTC:15m', to: 'BTC:1h', count: 3 },
    { from: 'ETH:1h', to: 'ETH:4h', count: 2 },
    { from: 'BTC:4h', to: 'SOL:15m', count: 1 },
    { from: 'BNB:15m', to: 'ADA:1h', count: 1 },
  ];
}

function CortexNeuralMapPanel() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [islands] = useState<IslandNode[]>(() => generateDemoIslandNodes());
  const [migrations] = useState<MigrationFlow[]>(() => generateDemoMigrationFlows());
  const [tick, setTick] = useState(0);

  // Animated particle tick
  useEffect(() => {
    const interval = setInterval(() => setTick(t => (t + 1) % 100), 50);
    return () => clearInterval(interval);
  }, []);

  const stateColor: Record<string, string> = {
    trading: '#34d399',
    evolving: '#8b5cf6',
    exploring: '#22d3ee',
    evaluating: '#fbbf24',
    paused: '#64748b',
    idle: '#475569',
  };

  const totalFitness = islands.reduce((s, n) => s + n.fitness, 0);
  const avgFitness = (totalFitness / islands.length).toFixed(1);
  const maxGen = Math.max(...islands.map(n => n.metaGen));

  const findNode = (id: string) => islands.find(n => n.id === id);

  return (
    <div className="glass-card glass-card-accent accent-neural col-12 stagger-in stagger-9">
      <div className="card-header">
        <div className="card-title"><Network size={18} /> Cortex Neural Map</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="card-badge badge-primary"><Zap size={10} /> Meta-Gen {maxGen}</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{islands.length} islands</span>
        </div>
      </div>
      <div className="card-body" style={{ padding: '12px 16px' }}>
        <div className="neural-map-container">
          {/* SVG Migration Lines */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {migrations.map((m, i) => {
              const fromNode = findNode(m.from);
              const toNode = findNode(m.to);
              if (!fromNode || !toNode) return null;

              const x1 = fromNode.x;
              const y1 = fromNode.y;
              const x2 = toNode.x;
              const y2 = toNode.y;

              // Animated particle position along line
              const particleT = ((tick + i * 25) % 100) / 100;
              const px = x1 + (x2 - x1) * particleT;
              const py = y1 + (y2 - y1) * particleT;

              return (
                <g key={`migration-${i}`}>
                  <line
                    x1={`${x1}%`} y1={`${y1}%`}
                    x2={`${x2}%`} y2={`${y2}%`}
                    stroke="rgba(99, 102, 241, 0.12)"
                    strokeWidth={m.count > 1 ? 2 : 1}
                    strokeDasharray="4 6"
                  />
                  {/* Animated particle */}
                  <circle
                    cx={`${px}%`} cy={`${py}%`}
                    r="3"
                    fill="#6366f1"
                    opacity={0.7}
                  >
                    <animate
                      attributeName="opacity"
                      values="0;0.8;0"
                      dur="2s"
                      repeatCount="indefinite"
                      begin={`${i * 0.5}s`}
                    />
                  </circle>
                </g>
              );
            })}
          </svg>

          {/* Center Cortex Badge */}
          <div className="cortex-center-badge">
            <Brain size={20} className="cortex-icon" />
            <div className="meta-gen">GA²: {maxGen}</div>
          </div>

          {/* Island Nodes */}
          {islands.map((island) => {
            const nodeSize = 14 + Math.floor(island.fitness / 10) * 3;
            const isHovered = hoveredNode === island.id;
            const color = stateColor[island.state] || '#64748b';

            return (
              <div key={island.id}>
                <div
                  className={`island-node state-${island.state}`}
                  style={{
                    left: `${island.x}%`,
                    top: `${island.y}%`,
                    width: nodeSize,
                    height: nodeSize,
                    background: color,
                    boxShadow: `0 0 ${isHovered ? 24 : 12}px ${color}66`,
                    animation: island.state === 'trading' ? 'islandPulse 2s ease-in-out infinite' : undefined,
                    zIndex: isHovered ? 10 : 1,
                  }}
                  onMouseEnter={() => setHoveredNode(island.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <div className="node-label">{island.pair}/{island.timeframe}</div>
                  <div className="node-fitness" style={{ color }}>{island.fitness}</div>
                </div>

                {/* Hover Tooltip */}
                {isHovered && (
                  <div className="island-tooltip" style={{
                    left: `${island.x}%`,
                    top: `${island.y - 20}%`,
                    transform: 'translate(-50%, -100%)',
                  }}>
                    <div className="tt-pair">{island.pair}/USDT {island.timeframe}</div>
                    <div className="tt-row">
                      <span className="tt-label">State</span>
                      <span className="tt-value" style={{ color, textTransform: 'capitalize' }}>{island.state}</span>
                    </div>
                    <div className="tt-row">
                      <span className="tt-label">Fitness</span>
                      <span className="tt-value" style={{ color: island.fitness > 50 ? 'var(--success)' : 'var(--text-secondary)' }}>{island.fitness}/100</span>
                    </div>
                    <div className="tt-row">
                      <span className="tt-label">Generation</span>
                      <span className="tt-value">{island.generation}</span>
                    </div>
                    <div className="tt-row">
                      <span className="tt-label">Trades</span>
                      <span className="tt-value">{island.trades}</span>
                    </div>
                    <div className="tt-row">
                      <span className="tt-label">HyperDNA</span>
                      <span className="tt-value" style={{ color: 'var(--accent-secondary)' }}>Gen {island.metaGen}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Legend */}
          <div className="neural-map-overlay">
            {Object.entries(stateColor).slice(0, 4).map(([label, color]) => (
              <div key={label} className="neural-map-legend">
                <div className="legend-dot" style={{ background: color }} />
                <span style={{ textTransform: 'capitalize' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="neural-map-stats">
            <div className="neural-map-stat">
              <div className="value">{islands.length}</div>
              <div className="label">Islands</div>
            </div>
            <div className="neural-map-stat">
              <div className="value">{avgFitness}</div>
              <div className="label">Avg Fitness</div>
            </div>
            <div className="neural-map-stat">
              <div className="value">{migrations.length}</div>
              <div className="label">Migrations</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════════

export default function DashboardPage() {
  // ─── State ───────────────────────────────────────────────
  const [brainState, setBrainState] = useState<BrainState>(BrainState.TRADING);
  const [isInitialized, setIsInitialized] = useState(false);

  // Demo data (generated once on mount)
  const [demoData, setDemoData] = useState<{
    strategy: StrategyDNA;
    trades: Trade[];
    metrics: PerformanceMetrics;
    fitnessScore: number;
    generations: EvolutionGeneration[];
    logs: BrainLog[];
    equityCurve: { time: string; equity: number; drawdown: number }[];
    tickers: MarketTick[];
    portfolio: PortfolioSummary;
  } | null>(null);

  useEffect(() => {
    // Generate all demo data on mount for stable rendering
    const strategy = generateRandomStrategy(7);
    strategy.name = 'Nova Tiger';
    strategy.metadata.fitnessScore = 67;
    strategy.metadata.tradeCount = 42;
    strategy.status = StrategyStatus.PAPER;

    const trades = generateDemoTrades(strategy.id, strategy.name, 42);
    const metrics = evaluatePerformance(trades);
    const fitnessScore = calculateFitnessScore(metrics);

    const generations = generateDemoEvolutionHistory(8);
    const logs = generateDemoLogs();
    const equityCurve = generateDemoEquityCurve(48);
    const tickers = generateDemoMarketTicks();

    const totalPnl = trades.reduce((s, t) => s + (t.pnlUSD ?? 0), 0);
    const portfolio: PortfolioSummary = {
      totalBalance: 10000 + totalPnl,
      availableBalance: 10000 + totalPnl - 340,
      unrealizedPnl: randomBetween(-50, 80),
      todayPnl: randomBetween(-100, 200),
      todayPnlPercent: randomBetween(-1, 2),
      weekPnl: randomBetween(-200, 500),
      weekPnlPercent: randomBetween(-2, 5),
      allTimePnl: totalPnl,
      allTimePnlPercent: (totalPnl / 10000) * 100,
      activePositions: 2,
      totalTrades: trades.length,
    };

    setDemoData({
      strategy,
      trades,
      metrics,
      fitnessScore,
      generations,
      logs,
      equityCurve,
      tickers,
      portfolio,
    });
    setIsInitialized(true);
  }, []);

  const handleBrainAction = useCallback((action: 'start' | 'pause' | 'resume' | 'stop') => {
    switch (action) {
      case 'start':
        setBrainState(BrainState.EXPLORING);
        break;
      case 'pause':
        setBrainState(BrainState.PAUSED);
        break;
      case 'resume':
        setBrainState(BrainState.TRADING);
        break;
      case 'stop':
        setBrainState(BrainState.EMERGENCY_STOP);
        break;
    }
  }, []);

  if (!isInitialized || !demoData) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Brain size={48} style={{ color: 'var(--accent-primary)', marginBottom: 16, animation: 'pulse-glow 2s ease-in-out infinite' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Initializing AI Brain...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ─── Header ───────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-logo">
          <Brain size={24} style={{ color: 'var(--accent-primary)' }} />
          <div>
            <h1>Learner</h1>
            <div className="subtitle">Self-Evolving AI Trading System</div>
          </div>
        </div>
        <div className="header-actions">
          <ConnectionStatusBadge />
          <BrainStateIndicator state={brainState} />
          <div style={{ display: 'flex', gap: 8 }}>
            {brainState === BrainState.IDLE && (
              <button className="btn btn-primary btn-sm" onClick={() => handleBrainAction('start')}>
                <Play size={14} /> Start Brain
              </button>
            )}
            {(brainState === BrainState.TRADING || brainState === BrainState.EXPLORING || brainState === BrainState.EVALUATING || brainState === BrainState.EVOLVING) && (
              <button className="btn btn-ghost btn-sm" onClick={() => handleBrainAction('pause')}>
                <Pause size={14} /> Pause
              </button>
            )}
            {brainState === BrainState.PAUSED && (
              <button className="btn btn-primary btn-sm" onClick={() => handleBrainAction('resume')}>
                <Play size={14} /> Resume
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Dashboard Grid ───────────────────────────────── */}
      <main className="dashboard-grid">
        <PortfolioOverview summary={demoData.portfolio} />
        <ActiveStrategyPanel strategy={demoData.strategy} metrics={demoData.metrics} />
        <RiskGauge
          utilization={0.35}
          dailyDD={2.1}
          positions={2}
          maxPositions={3}
          isEmergency={brainState === BrainState.EMERGENCY_STOP}
          onEmergencyStop={() => handleBrainAction('stop')}
        />
        <PerformanceChartPanel equityData={demoData.equityCurve} metrics={demoData.metrics} />
        <EvolutionTimelinePanel generations={demoData.generations} />
        <BrainMonitorPanel logs={demoData.logs} brainState={brainState} />
        <CortexNeuralMapPanel />
        <TradeHistoryPanel trades={demoData.trades} />
        <MarketOverviewPanel tickers={demoData.tickers} />
      </main>
    </>
  );
}
