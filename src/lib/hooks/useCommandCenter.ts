'use client';

// ============================================================
// useCommandCenter — Unified Data Aggregation Hook (Phase 45)
// ============================================================
// Reads from 7 Zustand stores and produces simplified, Turkish-ready
// data for the Command Center dashboard. All complexity is hidden.
// ============================================================

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { BrainState, TradeDirection, ConnectionStatus } from '@/types';
import type { Trade } from '@/types';
import {
  useBrainStore,
  useCortexStore,
  usePortfolioStore,
  useTradeStore,
  useBootStore,
  useSessionStore,
  useMarketDataStore,
} from '@/lib/store';

// ─── Public Interfaces ───────────────────────────────────────

export interface SimpleTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  pnlPercent: number;
  pnlUSD: number;
  isWin: boolean;
  timeAgo: string;
  strategyName: string;
}

export type SystemStatus = 'çalışıyor' | 'hazırlanıyor' | 'durdu' | 'hata';
export type StatusColor = 'green' | 'yellow' | 'red';
export type RiskLevel = 'güvende' | 'dikkat' | 'tehlike';

export interface CommandCenterData {
  // ─── Sistem Durumu ─────────────────────────────────────────
  systemStatus: SystemStatus;
  statusColor: StatusColor;
  statusEmoji: string;
  uptimeText: string;

  // ─── Para Durumu ───────────────────────────────────────────
  balance: number;
  availableBalance: number;
  todayPnl: number;
  todayPnlPercent: number;
  weekPnl: number;
  weekPnlPercent: number;
  allTimePnl: number;

  // ─── AI Durumu ─────────────────────────────────────────────
  brainState: BrainState;
  activeStrategyName: string | null;
  fitnessScore: number;
  generation: number;
  totalTrades: number;
  totalIslands: number;
  activeIslands: number;
  aiExplanation: string;

  // ─── Risk Durumu ───────────────────────────────────────────
  riskLevel: RiskLevel;
  riskColor: StatusColor;
  riskPercent: number;
  dailyDrawdown: number;
  dailyDrawdownLimit: number;
  openPositions: number;
  maxPositions: number;
  riskExplanation: string;

  // ─── Son İşlemler ──────────────────────────────────────────
  recentTrades: SimpleTrade[];
  winRate: number;
  totalTradeCount: number;

  // ─── Bağlantı ──────────────────────────────────────────────
  isLive: boolean;
  isConnected: boolean;
  connectionText: string;

  // ─── Boot & Session ────────────────────────────────────────
  isBooted: boolean;
  isBooting: boolean;
  bootPhase: string;
  isSessionActive: boolean;
  sessionPhase: string | null;
  isSessionStarting: boolean;
  isSessionStopping: boolean;

  // ─── Aksiyonlar ────────────────────────────────────────────
  actions: {
    startSession: () => Promise<void>;
    stopSession: () => Promise<void>;
    emergencyStop: () => void;
    igniteSystem: () => Promise<void>;
    shutdownSystem: () => Promise<void>;
  };
}

// ─── Narration Event ─────────────────────────────────────────

export type NarrationCategory = 'durum' | 'para' | 'ai' | 'risk' | 'trade' | 'uyari' | 'oturum';

export interface NarrationEvent {
  id: string;
  timestamp: number;
  category: NarrationCategory;
  emoji: string;
  message: string;
}

// ─── Internal Helpers ────────────────────────────────────────

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} sn önce`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

function simplifyTrade(trade: Trade): SimpleTrade {
  const now = Date.now();
  const tradeTime = trade.exitTime ?? trade.entryTime;
  return {
    id: trade.id,
    symbol: trade.symbol,
    direction: trade.direction === TradeDirection.LONG ? 'LONG' : 'SHORT',
    pnlPercent: trade.pnlPercent ?? 0,
    pnlUSD: trade.pnlUSD ?? 0,
    isWin: (trade.pnlPercent ?? 0) > 0,
    timeAgo: formatTimeAgo(now - tradeTime),
    strategyName: trade.strategyName,
  };
}

function deriveSystemStatus(
  brainState: BrainState,
  isBooted: boolean,
  bootPhase: string,
  isLive: boolean,
): { status: SystemStatus; color: StatusColor; emoji: string } {
  // Booting
  if (!isBooted && bootPhase !== 'IDLE' && bootPhase !== 'READY' && bootPhase !== 'ERROR') {
    return { status: 'hazırlanıyor', color: 'yellow', emoji: '🟡' };
  }
  // Error during boot
  if (bootPhase === 'ERROR') {
    return { status: 'hata', color: 'red', emoji: '🔴' };
  }
  // Emergency stop
  if (brainState === BrainState.EMERGENCY_STOP) {
    return { status: 'durdu', color: 'red', emoji: '🔴' };
  }
  // Active states
  if (
    brainState === BrainState.TRADING ||
    brainState === BrainState.EXPLORING ||
    brainState === BrainState.EVALUATING ||
    brainState === BrainState.EVOLVING ||
    brainState === BrainState.VALIDATING ||
    brainState === BrainState.SHADOW_TRADING
  ) {
    return { status: 'çalışıyor', color: 'green', emoji: '🟢' };
  }
  // Paused
  if (brainState === BrainState.PAUSED) {
    return { status: 'durdu', color: 'yellow', emoji: '🟡' };
  }
  // Idle — not started
  return { status: 'durdu', color: 'red', emoji: '🔴' };
}

function deriveRiskLevel(
  dailyDD: number,
  dailyLimit: number,
  positions: number,
  maxPositions: number,
): { level: RiskLevel; color: StatusColor; percent: number; explanation: string } {
  const ddRatio = dailyDD / dailyLimit;
  const posRatio = positions / maxPositions;
  const riskPercent = Math.round(Math.max(ddRatio, posRatio) * 100);

  if (ddRatio >= 0.8 || posRatio >= 1) {
    return {
      level: 'tehlike',
      color: 'red',
      percent: riskPercent,
      explanation: `Tehlike: Günlük kayıp limitinizin %${Math.round(ddRatio * 100)}'i kullanıldı. ${positions}/${maxPositions} pozisyon açık.`,
    };
  }
  if (ddRatio >= 0.5 || posRatio >= 0.66) {
    return {
      level: 'dikkat',
      color: 'yellow',
      percent: riskPercent,
      explanation: `Dikkat: Günlük kayıp limitinizin %${Math.round(ddRatio * 100)}'i kullanıldı. ${positions}/${maxPositions} pozisyon açık.`,
    };
  }
  return {
    level: 'güvende',
    color: 'green',
    percent: riskPercent,
    explanation: `Güvenli: Günlük kayıp limitinizin %${Math.round(ddRatio * 100)}'i kullanıldı. ${positions}/${maxPositions} pozisyon açık.`,
  };
}

function generateAIExplanation(
  brainState: BrainState,
  strategyName: string | null,
  fitness: number,
  generation: number,
  totalIslands: number,
  activeIslands: number,
  totalTrades: number,
): string {
  switch (brainState) {
    case BrainState.EXPLORING:
      return `AI şu anda ${activeIslands} adada strateji keşfediyor. ${totalTrades} trade test edildi.`;
    case BrainState.EVALUATING:
      return `AI mevcut stratejileri değerlendiriyor. En iyi strateji: ${strategyName ?? 'belirleniyor'} (Skor: ${fitness}).`;
    case BrainState.EVOLVING:
      return `AI yeni nesil stratejiler üretiyor. ${generation}. nesil. En iyi skor: ${fitness}/100.`;
    case BrainState.TRADING:
      return `AI "${strategyName}" stratejisi ile aktif olarak trade yapıyor. Skor: ${fitness}/100.`;
    case BrainState.VALIDATING:
      return `AI stratejiyi stres testinden geçiriyor (Walk-Forward + Monte Carlo).`;
    case BrainState.SHADOW_TRADING:
      return `AI gölge modunda — gerçek para kullanmadan stratejiyi test ediyor.`;
    case BrainState.PAUSED:
      return `AI duraklatıldı. Son aktif strateji: ${strategyName ?? 'yok'}. Devam etmek için "Başlat" butonunu kullanın.`;
    case BrainState.EMERGENCY_STOP:
      return `⚠️ Acil duruş aktif. Tüm işlemler durduruldu. Pozisyonları kontrol edin.`;
    case BrainState.IDLE:
    default:
      return `AI henüz başlatılmadı. Sistemi başlatmak için "Sistemi Başlat" butonunu kullanın.`;
  }
}

// ─── Main Hook ───────────────────────────────────────────────

export function useCommandCenter(): CommandCenterData {
  // Store selectors
  const brainState = useBrainStore(s => s.state);
  const activeStrategy = useBrainStore(s => s.activeStrategy);
  const currentGeneration = useBrainStore(s => s.currentGeneration);
  const bestFitness = useBrainStore(s => s.bestFitnessAllTime);
  const brainTotalTrades = useBrainStore(s => s.totalTrades);

  const totalIslands = useCortexStore(s => s.totalIslands);
  const activeIslands = useCortexStore(s => s.activeIslands);
  const globalBestFitness = useCortexStore(s => s.globalBestFitness);
  const cortexTotalTrades = useCortexStore(s => s.totalTradesAllIslands);

  const summary = usePortfolioStore(s => s.summary);
  const positions = usePortfolioStore(s => s.positions);

  const allTrades = useTradeStore(s => s.trades);

  const isBooted = useBootStore(s => s.hasBooted);
  const bootPhase = useBootStore(s => s.phase);
  const ignite = useBootStore(s => s.resilientIgnite);
  const shutdown = useBootStore(s => s.shutdown);

  const sessionPhaseRaw = useSessionStore(s => s.phase);
  const startSession = useSessionStore(s => s.startSession);
  const stopSession = useSessionStore(s => s.stopSession);
  const isSessionStarting = useSessionStore(s => s.isStarting);
  const isSessionStopping = useSessionStore(s => s.isStopping);

  const connectionStatus = useMarketDataStore(s => s.connectionStatus);
  const isLiveMode = useMarketDataStore(s => s.isLiveMode);

  // Derived values
  const strategyName = activeStrategy?.name ?? null;
  const fitness = globalBestFitness > 0 ? globalBestFitness : (activeStrategy?.metadata.fitnessScore ?? bestFitness);
  const generation = currentGeneration;
  const totalTrades = cortexTotalTrades > 0 ? cortexTotalTrades : brainTotalTrades;

  // System Status
  const { status: systemStatus, color: statusColor, emoji: statusEmoji } = useMemo(
    () => deriveSystemStatus(brainState, isBooted, bootPhase, isLiveMode),
    [brainState, isBooted, bootPhase, isLiveMode],
  );

  // Risk — hardcoded limits from RiskManager
  const dailyDrawdownLimit = 5.0;
  const maxPositions = 3;
  const dailyDrawdown = Math.abs(summary.todayPnlPercent < 0 ? summary.todayPnlPercent : 0);
  const openPositions = positions.length;

  const risk = useMemo(
    () => deriveRiskLevel(dailyDrawdown, dailyDrawdownLimit, openPositions, maxPositions),
    [dailyDrawdown, dailyDrawdownLimit, openPositions, maxPositions],
  );

  // AI Explanation
  const aiExplanation = useMemo(
    () => generateAIExplanation(brainState, strategyName, fitness, generation, totalIslands, activeIslands, totalTrades),
    [brainState, strategyName, fitness, generation, totalIslands, activeIslands, totalTrades],
  );

  // Recent trades
  const recentTrades = useMemo(() => {
    return allTrades
      .slice(-5)
      .reverse()
      .map(simplifyTrade);
  }, [allTrades]);

  // Win rate
  const winRate = useMemo(() => {
    if (allTrades.length === 0) return 0;
    const wins = allTrades.filter(t => (t.pnlPercent ?? 0) > 0).length;
    return Math.round((wins / allTrades.length) * 100);
  }, [allTrades]);

  // Uptime
  const [uptimeText, setUptimeText] = useState('—');
  const bootTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isBooted && bootTimeRef.current === null) {
      bootTimeRef.current = Date.now();
    }
    if (!isBooted) {
      bootTimeRef.current = null;
      setUptimeText('—');
      return;
    }

    const interval = setInterval(() => {
      if (bootTimeRef.current === null) return;
      const elapsed = Date.now() - bootTimeRef.current;
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      if (hours > 0) {
        setUptimeText(`${hours}s ${minutes}dk ${seconds}sn`);
      } else if (minutes > 0) {
        setUptimeText(`${minutes}dk ${seconds}sn`);
      } else {
        setUptimeText(`${seconds}sn`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isBooted]);

  // Connection
  const isConnected = connectionStatus === ConnectionStatus.CONNECTED;
  const connectionText = useMemo(() => {
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED: return 'Bağlı';
      case ConnectionStatus.CONNECTING: return 'Bağlanıyor...';
      case ConnectionStatus.RECONNECTING: return 'Yeniden bağlanıyor...';
      case ConnectionStatus.DISCONNECTED: return 'Bağlı değil';
      case ConnectionStatus.CIRCUIT_OPEN: return 'Bağlantı hatası';
      default: return 'Bilinmiyor';
    }
  }, [connectionStatus]);

  // Session
  const isSessionActive = sessionPhaseRaw !== 'IDLE' && sessionPhaseRaw !== 'STOPPED' && sessionPhaseRaw !== 'ERROR';
  const isBooting = !isBooted && bootPhase !== 'IDLE' && bootPhase !== 'READY' && bootPhase !== 'ERROR';

  // Emergency Stop — fires from CortexStore
  const cortexEmergencyStop = useCortexStore(s => s.emergencyStopAll);
  const brainEmergencyStop = useBrainStore(s => s.emergencyStop);

  const handleEmergencyStop = useCallback(() => {
    try {
      cortexEmergencyStop();
    } catch {
      // fallback
    }
    try {
      brainEmergencyStop();
    } catch {
      // fallback
    }
  }, [cortexEmergencyStop, brainEmergencyStop]);

  const handleIgnite = useCallback(async () => {
    try {
      await ignite();
    } catch (error) {
      console.error('[CommandCenter] Ignite failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [ignite]);

  const handleShutdown = useCallback(async () => {
    try {
      await shutdown();
    } catch (error) {
      console.error('[CommandCenter] Shutdown failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [shutdown]);

  const handleStartSession = useCallback(async () => {
    try {
      await startSession();
    } catch (error) {
      console.error('[CommandCenter] Start session failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [startSession]);

  const handleStopSession = useCallback(async () => {
    try {
      await stopSession('User stopped from Command Center');
    } catch (error) {
      console.error('[CommandCenter] Stop session failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [stopSession]);

  return {
    systemStatus,
    statusColor,
    statusEmoji,
    uptimeText,

    balance: summary.totalBalance,
    availableBalance: summary.availableBalance,
    todayPnl: summary.todayPnl,
    todayPnlPercent: summary.todayPnlPercent,
    weekPnl: summary.weekPnl,
    weekPnlPercent: summary.weekPnlPercent,
    allTimePnl: summary.allTimePnl,

    brainState,
    activeStrategyName: strategyName,
    fitnessScore: fitness,
    generation,
    totalTrades,
    totalIslands,
    activeIslands,
    aiExplanation,

    riskLevel: risk.level,
    riskColor: risk.color,
    riskPercent: risk.percent,
    dailyDrawdown,
    dailyDrawdownLimit,
    openPositions,
    maxPositions,
    riskExplanation: risk.explanation,

    recentTrades,
    winRate,
    totalTradeCount: allTrades.length,

    isLive: isLiveMode,
    isConnected,
    connectionText,

    isBooted,
    isBooting,
    bootPhase,
    isSessionActive,
    sessionPhase: isSessionActive ? sessionPhaseRaw : null,
    isSessionStarting,
    isSessionStopping,

    actions: {
      startSession: handleStartSession,
      stopSession: handleStopSession,
      emergencyStop: handleEmergencyStop,
      igniteSystem: handleIgnite,
      shutdownSystem: handleShutdown,
    },
  };
}

// ─── Narration Hook ──────────────────────────────────────────

const CATEGORY_CONFIG: Record<NarrationCategory, { emoji: string }> = {
  durum: { emoji: '📊' },
  para: { emoji: '💰' },
  ai: { emoji: '🧠' },
  risk: { emoji: '🛡️' },
  trade: { emoji: '📈' },
  uyari: { emoji: '⚠️' },
  oturum: { emoji: '📡' },
};

let narrationIdCounter = 0;
function generateNarrationId(): string {
  narrationIdCounter += 1;
  return `narr-${Date.now()}-${narrationIdCounter}`;
}

export function useCommandNarrator(data: CommandCenterData): NarrationEvent[] {
  const [events, setEvents] = useState<NarrationEvent[]>([]);
  const prevRef = useRef<{
    systemStatus: SystemStatus;
    riskLevel: RiskLevel;
    generation: number;
    totalTradeCount: number;
    sessionPhase: string | null;
    isBooted: boolean;
  } | null>(null);

  // Produce initial narration on mount
  useEffect(() => {
    const initialEvents: NarrationEvent[] = [];
    const now = Date.now();

    // Current status
    const statusMsg = data.systemStatus === 'çalışıyor'
      ? 'Sistem aktif ve çalışıyor.'
      : data.systemStatus === 'hazırlanıyor'
        ? 'Sistem hazırlanıyor, lütfen bekleyin...'
        : 'Sistem şu anda durmuş durumda.';
    initialEvents.push({
      id: generateNarrationId(),
      timestamp: now,
      category: 'durum',
      emoji: CATEGORY_CONFIG.durum.emoji,
      message: statusMsg,
    });

    // Balance summary
    const pnlSign = data.todayPnlPercent >= 0 ? '+' : '';
    initialEvents.push({
      id: generateNarrationId(),
      timestamp: now,
      category: 'para',
      emoji: CATEGORY_CONFIG.para.emoji,
      message: `Bakiyeniz: $${data.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}. Bugünkü kâr/zarar: ${pnlSign}${data.todayPnlPercent.toFixed(2)}%.`,
    });

    // AI status
    initialEvents.push({
      id: generateNarrationId(),
      timestamp: now,
      category: 'ai',
      emoji: CATEGORY_CONFIG.ai.emoji,
      message: data.aiExplanation,
    });

    // Risk
    initialEvents.push({
      id: generateNarrationId(),
      timestamp: now,
      category: 'risk',
      emoji: CATEGORY_CONFIG.risk.emoji,
      message: data.riskExplanation,
    });

    setEvents(initialEvents);

    // Set initial prev state
    prevRef.current = {
      systemStatus: data.systemStatus,
      riskLevel: data.riskLevel,
      generation: data.generation,
      totalTradeCount: data.totalTradeCount,
      sessionPhase: data.sessionPhase,
      isBooted: data.isBooted,
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Monitor for changes and generate narration events
  useEffect(() => {
    const prev = prevRef.current;
    if (!prev) return;

    const newEvents: NarrationEvent[] = [];
    const now = Date.now();

    // System status changed
    if (prev.systemStatus !== data.systemStatus) {
      const statusMessages: Record<SystemStatus, string> = {
        'çalışıyor': 'Sistem başarıyla başlatıldı ve aktif çalışıyor!',
        'hazırlanıyor': 'Sistem hazırlanıyor, lütfen bekleyin...',
        'durdu': 'Sistem durduruldu.',
        'hata': 'Sistemde bir hata oluştu. Lütfen kontrol edin.',
      };
      newEvents.push({
        id: generateNarrationId(),
        timestamp: now,
        category: data.systemStatus === 'hata' ? 'uyari' : 'durum',
        emoji: data.systemStatus === 'hata' ? CATEGORY_CONFIG.uyari.emoji : CATEGORY_CONFIG.durum.emoji,
        message: statusMessages[data.systemStatus],
      });
    }

    // Risk level changed
    if (prev.riskLevel !== data.riskLevel) {
      const riskMessages: Record<RiskLevel, string> = {
        'güvende': 'Risk durumu normale döndü. Güvendesiniz ✅',
        'dikkat': `Dikkat: Risk seviyesi yükseldi. Günlük kayıp limitinizin %${Math.round(data.dailyDrawdown / data.dailyDrawdownLimit * 100)}'i kullanıldı.`,
        'tehlike': `⚠️ TEHLİKE: Risk seviyesi kritik! Günlük kayıp limitinize çok yaklaştınız (%${data.dailyDrawdown.toFixed(1)} / %${data.dailyDrawdownLimit}).`,
      };
      newEvents.push({
        id: generateNarrationId(),
        timestamp: now,
        category: data.riskLevel === 'tehlike' ? 'uyari' : 'risk',
        emoji: data.riskLevel === 'tehlike' ? CATEGORY_CONFIG.uyari.emoji : CATEGORY_CONFIG.risk.emoji,
        message: riskMessages[data.riskLevel],
      });
    }

    // New generation
    if (prev.generation !== data.generation && data.generation > 0) {
      newEvents.push({
        id: generateNarrationId(),
        timestamp: now,
        category: 'ai',
        emoji: CATEGORY_CONFIG.ai.emoji,
        message: `AI yeni nesil stratejiler üretti. ${data.generation}. nesil başladı. En iyi skor: ${data.fitnessScore}/100.`,
      });
    }

    // New trade
    if (prev.totalTradeCount !== data.totalTradeCount && data.totalTradeCount > 0) {
      const latestTrade = data.recentTrades[0];
      if (latestTrade) {
        const pnlText = latestTrade.isWin
          ? `+$${latestTrade.pnlUSD.toFixed(2)} kâr`
          : `-$${Math.abs(latestTrade.pnlUSD).toFixed(2)} zarar`;
        newEvents.push({
          id: generateNarrationId(),
          timestamp: now,
          category: 'trade',
          emoji: latestTrade.isWin ? '✅' : '❌',
          message: `${latestTrade.symbol} ${latestTrade.direction} işlemi kapandı: ${pnlText} (${latestTrade.pnlPercent > 0 ? '+' : ''}${latestTrade.pnlPercent.toFixed(2)}%).`,
        });
      }
    }

    // Session phase changed
    if (prev.sessionPhase !== data.sessionPhase && data.sessionPhase !== null) {
      const phaseMessages: Record<string, string> = {
        PROBE: 'Trading oturumu bağlantı testi yapıyor...',
        SEED: 'Trading oturumu piyasa verisi yüklüyor...',
        EVOLVE: 'Trading oturumu strateji evrim döngüsü başladı.',
        TRADE: 'Trading oturumu aktif! Canlı trade izleniyor.',
        REPORT: 'Trading oturumu sonlandırılıyor. Rapor hazırlanıyor...',
        STOPPED: 'Trading oturumu sona erdi.',
        ERROR: 'Trading oturumunda hata oluştu!',
      };
      const msg = phaseMessages[data.sessionPhase] ?? `Trading oturumu: ${data.sessionPhase}`;
      newEvents.push({
        id: generateNarrationId(),
        timestamp: now,
        category: 'oturum',
        emoji: CATEGORY_CONFIG.oturum.emoji,
        message: msg,
      });
    }

    // Boot state changed
    if (prev.isBooted !== data.isBooted && data.isBooted) {
      newEvents.push({
        id: generateNarrationId(),
        timestamp: now,
        category: 'durum',
        emoji: '🚀',
        message: 'Sistem başarıyla başlatıldı! AI motorları hazır.',
      });
    }

    if (newEvents.length > 0) {
      setEvents(prev => [...prev, ...newEvents].slice(-20));
    }

    // Update prev ref
    prevRef.current = {
      systemStatus: data.systemStatus,
      riskLevel: data.riskLevel,
      generation: data.generation,
      totalTradeCount: data.totalTradeCount,
      sessionPhase: data.sessionPhase,
      isBooted: data.isBooted,
    };
  }, [
    data.systemStatus,
    data.riskLevel,
    data.generation,
    data.totalTradeCount,
    data.sessionPhase,
    data.isBooted,
    data.dailyDrawdown,
    data.dailyDrawdownLimit,
    data.fitnessScore,
    data.recentTrades,
    data.aiExplanation,
    data.riskExplanation,
    data.balance,
    data.todayPnlPercent,
  ]);

  return events;
}
