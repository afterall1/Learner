---
name: multi-island-ui
description: Activate when working on Cortex dashboard visualization, island grid panels, migration flow display, capital allocation charts, cross-island comparison views, island lifecycle controls, or any UI related to the multi-pair multi-timeframe Island Model architecture in the Learner trading system.
---

# Multi-Island UI — Cortex Dashboard Engineering

> **Expert Council**: Bret Victor (Interactive Design), Mike Bostock (Data Systems), Vitaly Friedman (Complex UI), Josh Comeau (React Animation), Sarah Drasner (State Visualization)

## 🎯 Cortex Dashboard Philosophy

The Cortex dashboard must answer 4 questions at a glance:
1. **Which islands are active** and what's their health?
2. **Where is capital allocated** and is it optimal?
3. **Are strategies migrating** and creating cross-pollination?
4. **Is directional risk balanced** or are we over-correlated?

> **Rule**: The multi-island view is NOT just "many single-brain views". It's a **systems view** — showing relationships, flows, and emergent behavior across islands.

---

## 🏝️ Island Card Component

Each island is represented as a compact sub-card within the dashboard. One card per active TradingSlot.

### Island Card Data Shape
```tsx
interface IslandCardProps {
  snapshot: IslandSnapshot;
  allocation: IslandAllocation | null;
  isSelected: boolean;
  onSelect: (slotId: string) => void;
  onPause: (slotId: string) => void;
  onResume: (slotId: string) => void;
}
```

### Island Card Layout
```
┌─────────────────────────────────┐
│ 🏝️ BTCUSDT:1h            [⏸/▶] │  ← Header: pair:tf + controls
│ ──────────────────────────────── │
│ State: EVOLVING •●               │  ← Brain state indicator
│ Gen: 12 | Best: 67.3/100        │  ← Generation + fitness
│ Trades: 48 | WR: 58%            │  ← Stats row
│ Capital: $2,500 (25%)           │  ← Allocation
│ ▓▓▓▓▓▓▓▓░░ [fitness sparkline]  │  ← Mini sparkline
└─────────────────────────────────┘
```

### Island Card TSX Pattern
```tsx
function IslandCard({
  snapshot,
  allocation,
  isSelected,
  onSelect,
  onPause,
  onResume,
}: IslandCardProps) {
  const [pair, timeframe] = snapshot.slotId.split(':');
  const isPaused = snapshot.state === BrainState.PAUSED;

  return (
    <div
      className={`island-card ${isSelected ? 'island-card--selected' : ''} ${isPaused ? 'island-card--paused' : ''}`}
      onClick={() => onSelect(snapshot.slotId)}
      role="button"
      tabIndex={0}
      aria-label={`Island ${snapshot.slotId}`}
    >
      <div className="island-card__header">
        <div className="island-card__identity">
          <span className="island-card__pair">{pair}</span>
          <span className="island-card__timeframe">{timeframe}</span>
        </div>
        <button
          className="btn-ghost btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            isPaused ? onResume(snapshot.slotId) : onPause(snapshot.slotId);
          }}
          aria-label={isPaused ? 'Resume island' : 'Pause island'}
        >
          {isPaused ? '▶' : '⏸'}
        </button>
      </div>

      <div className="island-card__state">
        <div className={`brain-state ${snapshot.state.toLowerCase()}`}>
          <span className="dot" />
          <span>{snapshot.state}</span>
        </div>
      </div>

      <div className="island-card__metrics">
        <div className="island-card__metric">
          <span className="metric-label">Gen</span>
          <span className="metric-value">{snapshot.currentGeneration}</span>
        </div>
        <div className="island-card__metric">
          <span className="metric-label">Best</span>
          <span className="metric-value">{snapshot.bestFitnessAllTime.toFixed(1)}</span>
        </div>
        <div className="island-card__metric">
          <span className="metric-label">Trades</span>
          <span className="metric-value">{snapshot.totalTrades}</span>
        </div>
      </div>

      {allocation && (
        <div className="island-card__allocation">
          <div className="progress-bar">
            <div
              className="progress-fill primary"
              style={{ width: `${allocation.percentOfTotal}%` }}
            />
          </div>
          <span className="island-card__capital">
            ${allocation.allocatedCapital.toLocaleString()} ({allocation.percentOfTotal.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  );
}
```

### Island Card CSS
```css
.island-card {
  background: rgba(14, 17, 30, 0.5);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.island-card:hover {
  border-color: var(--glass-border-hover);
  background: rgba(14, 17, 30, 0.7);
  transform: translateY(-1px);
}

.island-card--selected {
  border-color: var(--accent-primary);
  box-shadow: var(--shadow-glow-primary);
}

.island-card--paused {
  opacity: 0.6;
}

.island-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.island-card__identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.island-card__pair {
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.island-card__timeframe {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(34, 211, 238, 0.12);
  color: var(--info);
  text-transform: uppercase;
}

.island-card__metrics {
  display: flex;
  gap: 16px;
}

.island-card__metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.island-card__metric .metric-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.island-card__metric .metric-value {
  font-size: 0.875rem;
  font-weight: 700;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.island-card__capital {
  font-size: 0.7rem;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  margin-top: 4px;
}
```

---

## 🗺️ Island Grid Panel

The main panel showing all active islands in a responsive grid.

### Grid Layout Pattern
```tsx
function IslandGridPanel() {
  const { islands, capitalAllocations } = useCortexStore();
  const [selectedIsland, setSelectedIsland] = useState<string | null>(null);

  return (
    <section id="island-grid" className="glass-card col-12">
      <div className="card-header">
        <div className="card-title">
          <Globe size={18} className="icon" />
          <span>Island Grid</span>
        </div>
        <span className="card-badge badge-info">
          {islands.length} ISLANDS
        </span>
      </div>
      <div className="card-body">
        <div className="island-grid">
          {islands.map((snap) => (
            <IslandCard
              key={snap.slotId}
              snapshot={snap}
              allocation={capitalAllocations.find(a => a.slotId === snap.slotId) ?? null}
              isSelected={selectedIsland === snap.slotId}
              onSelect={setSelectedIsland}
              onPause={useCortexStore.getState().pauseIsland}
              onResume={useCortexStore.getState().resumeIsland}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

### Island Grid CSS
```css
.island-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

@media (max-width: 768px) {
  .island-grid {
    grid-template-columns: 1fr;
  }
}
```

---

## 📬 Migration Flow Display

### Migration Event Log
```tsx
function MigrationLog({ events }: { events: MigrationEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="empty-state">
        <GitBranch size={32} className="icon" />
        <p>No migrations yet. Strategies will migrate between islands as they prove themselves.</p>
      </div>
    );
  }

  return (
    <div className="log-feed" style={{ maxHeight: 200 }}>
      {[...events].reverse().map((event) => {
        const [srcPair, srcTf] = event.sourceSlotId.split(':');
        const [tgtPair, tgtTf] = event.targetSlotId.split(':');

        return (
          <div key={event.id} className="log-entry">
            <span className="log-time">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
            <span className="log-level evolution" />
            <span className="log-message">
              <strong>{srcPair}:{srcTf}</strong>
              {' → '}
              <strong>{tgtPair}:{tgtTf}</strong>
              {' — '}
              <em>{event.strategyName}</em>
              {' (fitness: '}
              <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                {event.strategyFitness.toFixed(1)}
              </span>
              {', affinity: '}
              <span style={{ color: 'var(--info)', fontFamily: 'var(--font-mono)' }}>
                {(event.migrationAffinity * 100).toFixed(0)}%
              </span>
              {')'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

---

## 📊 Capital Allocation Panel

### Allocation Bar + Donut View
```tsx
function CapitalAllocationPanel() {
  const { capitalAllocations, totalCapital } = useCortexStore();

  return (
    <section id="capital-allocation" className="glass-card col-4">
      <div className="card-header">
        <div className="card-title">
          <PieChartIcon size={18} className="icon" />
          <span>Capital Allocation</span>
        </div>
        <span className="card-badge badge-primary">
          ${totalCapital.toLocaleString()}
        </span>
      </div>
      <div className="card-body">
        {/* Allocation bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {capitalAllocations.map((alloc, i) => {
            const [pair, tf] = alloc.slotId.split(':');
            return (
              <div key={alloc.slotId}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: DATA_SERIES_COLORS[i % DATA_SERIES_COLORS.length],
                    }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{pair}</span>
                    <span style={{
                      fontSize: '0.65rem',
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: 'rgba(34, 211, 238, 0.1)',
                      color: 'var(--info)',
                    }}>
                      {tf}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--text-secondary)',
                  }}>
                    ${alloc.allocatedCapital.toLocaleString()} ({alloc.percentOfTotal.toFixed(1)}%)
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill primary"
                    style={{
                      width: `${alloc.percentOfTotal}%`,
                      background: DATA_SERIES_COLORS[i % DATA_SERIES_COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

---

## 🧭 Directional Correlation Guard Display

```tsx
function CorrelationIndicator({
  ratio,
  dominantDirection,
  overCorrelated,
}: {
  ratio: number;
  dominantDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  overCorrelated: boolean;
}) {
  const color = overCorrelated ? 'var(--danger)' : ratio > 0.5 ? 'var(--warning)' : 'var(--success)';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 14px',
      borderRadius: 'var(--radius-sm)',
      background: overCorrelated ? 'rgba(244, 63, 94, 0.08)' : 'rgba(52, 211, 153, 0.06)',
      border: `1px solid ${overCorrelated ? 'rgba(244, 63, 94, 0.2)' : 'var(--glass-border)'}`,
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `${color}20`,
        color,
        fontSize: '0.7rem',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
      }}>
        {(ratio * 100).toFixed(0)}%
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Directional Correlation
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {overCorrelated
            ? `⚠️ Over-correlated — ${dominantDirection} heavy`
            : `Balanced — ${dominantDirection}`
          }
        </div>
      </div>
    </div>
  );
}
```

---

## 📋 Cortex Global Controls Bar

```tsx
function CortexControlBar() {
  const {
    globalState,
    totalIslands,
    activeIslands,
    totalTradesAllIslands,
    globalBestFitness,
    pauseAll,
    resumeAll,
    emergencyStopAll,
  } = useCortexStore();

  const isPaused = globalState === BrainState.PAUSED;
  const isEmergency = globalState === BrainState.EMERGENCY_STOP;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 20px',
      background: 'rgba(14, 17, 30, 0.6)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--glass-border)',
      marginBottom: 16,
    }}>
      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div className={`brain-state ${globalState.toLowerCase()}`}>
          <span className="dot" />
          <span>CORTEX: {globalState}</span>
        </div>
        <div className="island-card__metrics">
          <div className="island-card__metric">
            <span className="metric-label">Islands</span>
            <span className="metric-value">{activeIslands}/{totalIslands}</span>
          </div>
          <div className="island-card__metric">
            <span className="metric-label">Trades</span>
            <span className="metric-value">{totalTradesAllIslands}</span>
          </div>
          <div className="island-card__metric">
            <span className="metric-label">Best</span>
            <span className="metric-value">{globalBestFitness.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        {isPaused ? (
          <button className="btn btn-primary btn-sm" onClick={resumeAll}>
            ▶ Resume All
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={pauseAll}>
            ⏸ Pause All
          </button>
        )}
        <button
          className="btn btn-danger btn-sm"
          onClick={emergencyStopAll}
          disabled={isEmergency}
        >
          🚨 Emergency Stop
        </button>
      </div>
    </div>
  );
}
```

---

## 🏗️ Recommended Cortex Dashboard Layout

```
┌──────────────────────────────────────────────────────┐
│ [CortexControlBar — CORTEX: TRADING | 5/5 Islands]  │
├──────────────────────────────────────────────────────┤
│ [Island Grid — col-8]          │ [Capital — col-4]   │
│  ┌──────┐ ┌──────┐ ┌──────┐  │  Allocation bars    │
│  │BTC:1h│ │ETH:1h│ │SOL:1h│  │  Donut chart        │
│  └──────┘ └──────┘ └──────┘  │  Correlation guard  │
│  ┌──────┐ ┌──────┐           │                     │
│  │BTC:15│ │ETH:15│           │                     │
│  └──────┘ └──────┘           │                     │
├──────────────────────────────────────────────────────┤
│ [Migration Log — col-6]       │ [Global Stats col-6] │
│  BTC:1h → BTC:15m ...        │  Fitness comparison   │
│  ETH:1h → SOL:1h ...         │  bar chart            │
└──────────────────────────────────────────────────────┘
```

---

## 📂 Key Files
- `src/lib/store/index.ts` → `useCortexStore` (12 actions)
- `src/lib/engine/cortex.ts` → `CortexSnapshot` data shape
- `src/types/index.ts` → `IslandSnapshot`, `CortexSnapshot`, `IslandAllocation`, `MigrationEvent`
- `src/types/trading-slot.ts` → `TradingSlot`, `TradingSlotStatus`

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `dashboard-development` | Parent | Island panels follow dashboard panel architecture |
| `data-visualization` | Extension | Capital allocation donut + fitness sparklines |
| `motion-design` | Extension | Island card transitions + staggered animations |
| `meta-evolution` | Data source | HyperDNA state displayed per-island card |
