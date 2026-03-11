'use client';

// ============================================================
// Komuta Merkezi (Command Center) — Phase 45
// ============================================================
// Turkish-language simplified control panel for non-developers.
// "Pilot's Cockpit, Not Engineer's Console"
// ============================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  Activity, GitBranch, Shield, Zap, TrendingUp, TrendingDown,
  Power, Square, AlertTriangle, Wifi, WifiOff, Clock, Target,
  BarChart3, Eye, Cpu, Rocket, XCircle, MessageCircle, ChevronDown,
  ChevronUp, DollarSign, Layers, Bot,
} from 'lucide-react';
import { BrainState } from '@/types';
import {
  useCommandCenter,
  useCommandNarrator,
} from '@/lib/hooks/useCommandCenter';
import type {
  CommandCenterData,
  NarrationEvent,
  StatusColor,
  SimpleTrade,
} from '@/lib/hooks/useCommandCenter';

// ═══════════════════════════════════════════════════════════════
// HELPER: Format Currency
// ═══════════════════════════════════════════════════════════════

function formatUSD(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// ═══════════════════════════════════════════════════════════════
// STATUS CIRCLE — Animated traffic light
// ═══════════════════════════════════════════════════════════════

function StatusCircle({ color, size = 120 }: { color: StatusColor; size?: number }) {
  const colorMap: Record<StatusColor, { main: string; glow: string }> = {
    green: { main: '#34d399', glow: 'rgba(52, 211, 153, 0.4)' },
    yellow: { main: '#fbbf24', glow: 'rgba(251, 191, 36, 0.4)' },
    red: { main: '#f43f5e', glow: 'rgba(244, 63, 94, 0.4)' },
  };
  const c = colorMap[color];
  const r = size / 2 - 8;

  return (
    <div className={`cmd-status-circle cmd-status-${color}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {/* Outer glow ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r + 4}
          fill="none"
          stroke={c.glow}
          strokeWidth={2}
          className="cmd-pulse-ring"
        />
        {/* Main circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill={`${c.main}15`}
          stroke={c.main}
          strokeWidth={3}
        />
        {/* Inner filled circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r * 0.55}
          fill={c.main}
          className="cmd-inner-pulse"
        />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Sistem Durumu (Hero)
// ═══════════════════════════════════════════════════════════════

function SystemStatusHero({ data }: { data: CommandCenterData }) {
  const statusTextMap: Record<string, string> = {
    'çalışıyor': 'Sistem Çalışıyor',
    'hazırlanıyor': 'Sistem Hazırlanıyor',
    'durdu': 'Sistem Durdu',
    'hata': 'Sistem Hatası',
  };

  return (
    <section id="cmd-system-status" className="cmd-section cmd-hero">
      <div className="cmd-hero-content">
        <StatusCircle color={data.statusColor} size={140} />
        <div className="cmd-hero-info">
          <h2 className="cmd-hero-title">{statusTextMap[data.systemStatus] ?? data.systemStatus}</h2>
          <div className="cmd-hero-meta">
            {data.isBooted && (
              <span className="cmd-meta-item">
                <Clock size={14} />
                Çalışma süresi: {data.uptimeText}
              </span>
            )}
            <span className={`cmd-meta-item cmd-conn-${data.isConnected ? 'on' : 'off'}`}>
              {data.isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {data.connectionText}
            </span>
            {data.isLive && (
              <span className="cmd-meta-item cmd-live-badge">
                <span className="cmd-live-dot" />
                CANLI
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="cmd-action-bar">
        {!data.isBooted && !data.isBooting && (
          <button
            className="cmd-btn cmd-btn-primary cmd-btn-lg"
            onClick={data.actions.igniteSystem}
          >
            <Rocket size={20} />
            Sistemi Başlat
          </button>
        )}
        {data.isBooting && (
          <button className="cmd-btn cmd-btn-disabled cmd-btn-lg" disabled>
            <Cpu size={20} />
            Hazırlanıyor...
          </button>
        )}
        {data.isBooted && !data.isSessionActive && !data.isSessionStarting && (
          <button
            className="cmd-btn cmd-btn-primary cmd-btn-lg"
            onClick={data.actions.startSession}
          >
            <Power size={20} />
            Trading Oturumu Başlat
          </button>
        )}
        {data.isSessionStarting && (
          <button className="cmd-btn cmd-btn-disabled cmd-btn-lg" disabled>
            <Cpu size={20} />
            Oturum Başlatılıyor...
          </button>
        )}
        {data.isSessionActive && !data.isSessionStopping && (
          <button
            className="cmd-btn cmd-btn-secondary cmd-btn-lg"
            onClick={data.actions.stopSession}
          >
            <Square size={20} />
            Oturumu Durdur
          </button>
        )}
        {data.isSessionStopping && (
          <button className="cmd-btn cmd-btn-disabled cmd-btn-lg" disabled>
            <Cpu size={20} />
            Durduruluyor...
          </button>
        )}
        {data.isBooted && (
          <button
            className="cmd-btn cmd-btn-danger cmd-btn-lg"
            onClick={data.actions.emergencyStop}
          >
            <AlertTriangle size={20} />
            Acil Durdur
          </button>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Para Durumu
// ═══════════════════════════════════════════════════════════════

function FinanceSection({ data }: { data: CommandCenterData }) {
  return (
    <section id="cmd-finance" className="cmd-section">
      <h3 className="cmd-section-title">
        <DollarSign size={18} />
        Para Durumu
      </h3>
      <div className="cmd-finance-grid">
        <div className="cmd-finance-card cmd-finance-balance">
          <div className="cmd-finance-label">Toplam Bakiye</div>
          <div className="cmd-finance-value cmd-big-number">{formatUSD(data.balance)}</div>
          <div className="cmd-finance-sub">
            Kullanılabilir: {formatUSD(data.availableBalance)}
          </div>
        </div>
        <div className="cmd-finance-card">
          <div className="cmd-finance-label">Bugün</div>
          <div
            className={`cmd-finance-value ${data.todayPnl >= 0 ? 'cmd-positive' : 'cmd-negative'}`}
          >
            {formatPercent(data.todayPnlPercent)}
          </div>
          <div className={`cmd-finance-sub ${data.todayPnl >= 0 ? 'cmd-positive' : 'cmd-negative'}`}>
            {data.todayPnl >= 0 ? '+' : ''}{formatUSD(data.todayPnl)}
          </div>
        </div>
        <div className="cmd-finance-card">
          <div className="cmd-finance-label">Bu Hafta</div>
          <div
            className={`cmd-finance-value ${data.weekPnl >= 0 ? 'cmd-positive' : 'cmd-negative'}`}
          >
            {formatPercent(data.weekPnlPercent)}
          </div>
          <div className={`cmd-finance-sub ${data.weekPnl >= 0 ? 'cmd-positive' : 'cmd-negative'}`}>
            {data.weekPnl >= 0 ? '+' : ''}{formatUSD(data.weekPnl)}
          </div>
        </div>
        <div className="cmd-finance-card">
          <div className="cmd-finance-label">Toplam Kâr/Zarar</div>
          <div
            className={`cmd-finance-value ${data.allTimePnl >= 0 ? 'cmd-positive' : 'cmd-negative'}`}
          >
            {formatUSD(data.allTimePnl)}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: AI Ne Yapıyor?
// ═══════════════════════════════════════════════════════════════

function AISection({ data }: { data: CommandCenterData }) {
  const fitnessPercent = Math.min(100, Math.max(0, data.fitnessScore));
  const fitnessColor = fitnessPercent >= 70
    ? 'var(--success)'
    : fitnessPercent >= 40
      ? 'var(--warning)'
      : 'var(--danger)';

  return (
    <section id="cmd-ai" className="cmd-section">
      <h3 className="cmd-section-title">
        <Bot size={18} />
        AI Ne Yapıyor?
      </h3>
      <div className="cmd-ai-content">
        <div className="cmd-ai-explanation">
          {data.aiExplanation}
        </div>

        <div className="cmd-ai-stats">
          {data.activeStrategyName && (
            <div className="cmd-ai-stat-card">
              <div className="cmd-ai-stat-label">Aktif Strateji</div>
              <div className="cmd-ai-stat-value cmd-ai-strategy-name">
                {data.activeStrategyName}
              </div>
            </div>
          )}

          <div className="cmd-ai-stat-card">
            <div className="cmd-ai-stat-label">Strateji Skoru</div>
            <div className="cmd-ai-stat-value" style={{ color: fitnessColor }}>
              {data.fitnessScore}/100
            </div>
            <div className="cmd-fitness-bar">
              <div
                className="cmd-fitness-fill"
                style={{ width: `${fitnessPercent}%`, background: fitnessColor }}
              />
            </div>
          </div>

          <div className="cmd-ai-stat-card">
            <div className="cmd-ai-stat-label">Nesil</div>
            <div className="cmd-ai-stat-value">
              {data.generation}. nesil
            </div>
          </div>

          <div className="cmd-ai-stat-card">
            <div className="cmd-ai-stat-label">Toplam Trade</div>
            <div className="cmd-ai-stat-value">
              {data.totalTrades}
            </div>
          </div>

          {data.totalIslands > 0 && (
            <div className="cmd-ai-stat-card">
              <div className="cmd-ai-stat-label">Ada Sayısı</div>
              <div className="cmd-ai-stat-value">
                {data.activeIslands}/{data.totalIslands}
                <span className="cmd-ai-stat-sub"> aktif</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Risk Durumu
// ═══════════════════════════════════════════════════════════════

function RiskSection({ data }: { data: CommandCenterData }) {
  const riskIconMap: Record<string, React.ReactNode> = {
    'güvende': <Shield size={24} />,
    'dikkat': <Eye size={24} />,
    'tehlike': <AlertTriangle size={24} />,
  };

  const riskTextMap: Record<string, string> = {
    'güvende': 'Güvendesiniz ✅',
    'dikkat': 'Dikkat ⚠️',
    'tehlike': 'Tehlike! 🔴',
  };

  return (
    <section id="cmd-risk" className="cmd-section">
      <h3 className="cmd-section-title">
        <Shield size={18} />
        Risk Durumu
      </h3>
      <div className={`cmd-risk-banner cmd-risk-${data.riskColor}`}>
        <div className="cmd-risk-icon">
          {riskIconMap[data.riskLevel]}
        </div>
        <div className="cmd-risk-info">
          <div className="cmd-risk-status">{riskTextMap[data.riskLevel]}</div>
          <div className="cmd-risk-detail">{data.riskExplanation}</div>
        </div>
      </div>

      <div className="cmd-risk-meters">
        <div className="cmd-risk-meter">
          <div className="cmd-risk-meter-header">
            <span>Günlük Kayıp Limiti</span>
            <span className="cmd-risk-meter-value">
              %{data.dailyDrawdown.toFixed(1)} / %{data.dailyDrawdownLimit}
            </span>
          </div>
          <div className="cmd-risk-track">
            <div
              className={`cmd-risk-fill cmd-risk-fill-${data.riskColor}`}
              style={{ width: `${Math.min(100, (data.dailyDrawdown / data.dailyDrawdownLimit) * 100)}%` }}
            />
          </div>
        </div>

        <div className="cmd-risk-meter">
          <div className="cmd-risk-meter-header">
            <span>Açık Pozisyonlar</span>
            <span className="cmd-risk-meter-value">
              {data.openPositions} / {data.maxPositions}
            </span>
          </div>
          <div className="cmd-risk-track">
            <div
              className="cmd-risk-fill cmd-risk-fill-blue"
              style={{ width: `${(data.openPositions / data.maxPositions) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Son İşlemler
// ═══════════════════════════════════════════════════════════════

function TradeSection({ data }: { data: CommandCenterData }) {
  const [expanded, setExpanded] = useState(false);
  const displayTrades = expanded ? data.recentTrades : data.recentTrades.slice(0, 5);

  return (
    <section id="cmd-trades" className="cmd-section">
      <h3 className="cmd-section-title">
        <BarChart3 size={18} />
        Son İşlemler
        {data.totalTradeCount > 0 && (
          <span className="cmd-trade-count">
            Toplam: {data.totalTradeCount} · Kazanma: %{data.winRate}
          </span>
        )}
      </h3>

      {displayTrades.length === 0 ? (
        <div className="cmd-empty">
          <Target size={32} />
          <p>Henüz trade yapılmadı. Oturumu başlattığınızda burada işlemlerinizi göreceksiniz.</p>
        </div>
      ) : (
        <div className="cmd-trade-list">
          {displayTrades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
          {data.recentTrades.length > 5 && (
            <button
              className="cmd-show-more"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'Daha az göster' : `Tümünü göster (${data.recentTrades.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TradeRow({ trade }: { trade: SimpleTrade }) {
  return (
    <div className={`cmd-trade-row ${trade.isWin ? 'cmd-trade-win' : 'cmd-trade-loss'}`}>
      <span className="cmd-trade-icon">
        {trade.isWin ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
      </span>
      <span className="cmd-trade-pair">{trade.symbol}</span>
      <span className={`cmd-trade-dir cmd-trade-dir-${trade.direction.toLowerCase()}`}>
        {trade.direction === 'LONG' ? '↑ LONG' : '↓ SHORT'}
      </span>
      <span className={`cmd-trade-pnl ${trade.isWin ? 'cmd-positive' : 'cmd-negative'}`}>
        {trade.isWin ? '+' : ''}{formatUSD(trade.pnlUSD)}
        <span className="cmd-trade-pnl-pct">
          ({trade.pnlPercent > 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%)
        </span>
      </span>
      <span className="cmd-trade-time">{trade.timeAgo}</span>
      <span className="cmd-trade-strategy">{trade.strategyName}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6: Trading Oturumu
// ═══════════════════════════════════════════════════════════════

function SessionSection({ data }: { data: CommandCenterData }) {
  const sessionPhaseMap: Record<string, string> = {
    PROBE: '🔍 Bağlantı testi',
    SEED: '📊 Veri yükleme',
    EVOLVE: '🧬 Strateji evrimi',
    TRADE: '💹 Aktif trade',
    REPORT: '📋 Rapor',
    STOPPED: '⏹ Durduruldu',
    ERROR: '❌ Hata',
  };

  return (
    <section id="cmd-session" className="cmd-section">
      <h3 className="cmd-section-title">
        <Layers size={18} />
        Trading Oturumu
      </h3>

      {!data.isSessionActive ? (
        <div className="cmd-session-idle">
          <div className="cmd-session-idle-text">
            {data.isBooted
              ? 'Oturum başlatılmaya hazır. Yukarıdaki butonu kullanarak oturumu başlatabilirsiniz.'
              : 'Önce sistemi başlatın, ardından trading oturumu başlatabilirsiniz.'
            }
          </div>
          <div className="cmd-session-mode">
            <span className={`cmd-session-badge ${data.isLive ? 'cmd-badge-live' : 'cmd-badge-demo'}`}>
              {data.isLive ? '🔴 CANLI' : '🟢 DEMO'}
            </span>
          </div>
        </div>
      ) : (
        <div className="cmd-session-active">
          <div className="cmd-session-phase">
            <span className="cmd-session-phase-label">Durum:</span>
            <span className="cmd-session-phase-value">
              {data.sessionPhase ? (sessionPhaseMap[data.sessionPhase] ?? data.sessionPhase) : 'Bilinmiyor'}
            </span>
          </div>
          <div className="cmd-session-mode">
            <span className={`cmd-session-badge ${data.isLive ? 'cmd-badge-live' : 'cmd-badge-demo'}`}>
              {data.isLive ? '🔴 CANLI' : '🟢 DEMO'}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// AI NARRATOR — Radical Innovation (Aşama 2)
// ═══════════════════════════════════════════════════════════════

function AINarratorPanel({ events }: { events: NarrationEvent[] }) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length]);

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const categoryColorMap: Record<string, string> = {
    durum: 'var(--accent-primary)',
    para: 'var(--success)',
    ai: 'var(--accent-secondary)',
    risk: 'var(--warning)',
    trade: 'var(--accent-cyan)',
    uyari: 'var(--danger)',
    oturum: 'var(--info)',
  };

  return (
    <section id="cmd-narrator" className="cmd-section cmd-narrator">
      <h3 className="cmd-section-title">
        <MessageCircle size={18} />
        Yapay Zeka Asistanı
        <span className="cmd-narrator-badge">CANLI</span>
      </h3>
      <div className="cmd-narrator-feed" ref={feedRef}>
        {events.length === 0 ? (
          <div className="cmd-empty">
            <Bot size={32} />
            <p>AI asistanınız hazır. Sistem çalışmaya başladığında sizi bilgilendirecek.</p>
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="cmd-narrator-msg">
              <span className="cmd-narrator-time">{formatTime(event.timestamp)}</span>
              <span
                className="cmd-narrator-dot"
                style={{ background: categoryColorMap[event.category] ?? 'var(--text-muted)' }}
              />
              <span className="cmd-narrator-emoji">{event.emoji}</span>
              <span className="cmd-narrator-text">{event.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function CommandCenterPage() {
  const data = useCommandCenter();
  const narratorEvents = useCommandNarrator(data);

  return (
    <>
      <header className="dashboard-header">
        <div className="logo-group">
          <Zap size={24} className="logo-icon" />
          <div>
            <h1>Learner</h1>
            <div className="subtitle">Komuta Merkezi</div>
          </div>
        </div>
        <div className="header-actions">
          <nav className="nav-tabs">
            <Link href="/" className="nav-tab">
              <Activity size={14} /> Dashboard
            </Link>
            <Link href="/pipeline" className="nav-tab">
              <GitBranch size={14} /> Pipeline
            </Link>
            <Link href="/command" className="nav-tab active">
              <Target size={14} /> Komuta
            </Link>
          </nav>
        </div>
      </header>

      <main className="cmd-page">
        <SystemStatusHero data={data} />
        <div className="cmd-two-column">
          <div className="cmd-main-column">
            <FinanceSection data={data} />
            <AISection data={data} />
            <RiskSection data={data} />
            <TradeSection data={data} />
            <SessionSection data={data} />
          </div>
          <div className="cmd-side-column">
            <AINarratorPanel events={narratorEvents} />
          </div>
        </div>
      </main>
    </>
  );
}
