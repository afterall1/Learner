---
name: data-visualization
description: Activate when working on advanced chart components, financial data visualization, real-time streaming data display, heatmaps, treemaps, radar charts, multi-series charts, custom Recharts components, sparklines, or any complex data visualization in the Learner trading system.
---

# Data Visualization — Financial Chart Engineering

> **Expert Council**: Mike Bostock (D3 Creator), Nadieh Bremer (Data Art), Edward Tufte (Information Design), Amanda Cox (NYT Data Viz), Shirley Wu (Interactive Viz)

## 🎯 Visualization Philosophy

> "Above all else, show the data." — Edward Tufte

Financial data visualization demands:
1. **Data-Ink Ratio**: Maximize data, minimize decoration
2. **Pre-attentive Processing**: Use color, size, and position to convey meaning instantly
3. **Temporal Context**: Trading data is ALWAYS time-series — respect the time axis
4. **Actionability**: Every chart must answer a specific question

---

## 📊 Chart Type Selection Guide

| Data Question | Chart Type | Recharts Component |
|--------------|-----------|-------------------|
| How has equity changed over time? | Area Chart | `<AreaChart>` |
| What's the drawdown profile? | Inverted Area | `<AreaChart>` (negative Y) |
| Compare generation fitness scores | Bar Chart | `<BarChart>` |
| Strategy indicator composition | Radar Chart | `<RadarChart>` |
| P&L distribution of trades | Histogram | `<BarChart>` (binned data) |
| Correlation between metrics | Scatter Plot | `<ScatterChart>` |
| Current value vs. max | Gauge / Arc | Custom SVG component |
| Quick inline trend | Sparkline | Mini `<AreaChart>` (no axes) |
| Multiple metrics over time | Multi-series Line | `<LineChart>` (multiple `<Line>`) |
| Portfolio allocation | Donut / Pie | `<PieChart>` with inner radius |
| Win/Loss streak | Heatmap Grid | Custom CSS Grid component |
| Island capital distribution | Treemap | `<Treemap>` |

---

## 🏗️ Shared Chart Infrastructure

### Color Palette for Data Series
```tsx
// Multi-series color sequence — designed for maximum perceptual distance
const DATA_SERIES_COLORS = [
  'var(--accent-primary)',    // #6366f1 — Indigo
  'var(--accent-cyan)',       // #22d3ee — Cyan
  'var(--accent-secondary)',  // #8b5cf6 — Violet
  'var(--accent-emerald)',    // #34d399 — Emerald
  'var(--accent-amber)',      // #fbbf24 — Amber
  'var(--accent-rose)',       // #f43f5e — Rose
] as const;

// For P&L-specific charts ONLY
const PNL_COLOR = (value: number): string =>
  value >= 0 ? 'var(--success)' : 'var(--danger)';
```

### Universal Tooltip (ALL Charts MUST Use)
```tsx
const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'rgba(14, 17, 30, 0.95)',
  border: '1px solid rgba(99, 115, 171, 0.2)',
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  padding: '8px 12px',
  color: '#f1f5f9',
};

const AXIS_TICK_STYLE = {
  fill: 'var(--text-muted)',
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
};

const AXIS_LINE_STYLE = {
  stroke: 'rgba(99, 115, 171, 0.08)',
};
```

### Safe Value Handling (CRITICAL)
```tsx
// Recharts can pass undefined, null, or string — ALWAYS guard
const safeNumber = (v: string | number | undefined | null): number =>
  Number(v ?? 0);

const safePercent = (v: string | number | undefined | null): string =>
  `${safeNumber(v).toFixed(2)}%`;

const safeUsd = (v: string | number | undefined | null): string =>
  `$${safeNumber(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const safeFitness = (v: string | number | undefined | null): string =>
  `${safeNumber(v).toFixed(1)}/100`;
```

---

## 📈 Chart Patterns (Copy-Paste Ready)

### 1. Equity Curve with Drawdown Overlay
```tsx
function EquityCurveChart({ data }: { data: { time: string; equity: number; drawdown: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.2} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="time"
          tick={AXIS_TICK_STYLE}
          axisLine={AXIS_LINE_STYLE}
          tickLine={false}
        />
        <YAxis
          yAxisId="equity"
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          width={55}
          tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
        />
        <YAxis
          yAxisId="dd"
          orientation="right"
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          width={45}
          tickFormatter={(v) => `${v}%`}
          reversed
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Area
          yAxisId="equity"
          type="monotone"
          dataKey="equity"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#equityFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, fill: '#06080d' }}
        />
        <Area
          yAxisId="dd"
          type="monotone"
          dataKey="drawdown"
          stroke="#f43f5e"
          strokeWidth={1.5}
          fill="url(#drawdownFill)"
          dot={false}
          strokeDasharray="4 2"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

### 2. Sparkline (Inline Mini Chart)
```tsx
function Sparkline({
  data,
  color = 'var(--accent-primary)',
  height = 32,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const sparkData = data.map((v, i) => ({ i, v }));

  return (
    <div className="sparkline-container" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sparkData}>
          <defs>
            <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### 3. Strategy Radar Chart (Multi-Metric Profile)
```tsx
function StrategyRadar({ strategy }: { strategy: StrategyDNA }) {
  const radarData = [
    { metric: 'Sharpe', value: Math.min(100, strategy.metadata.fitnessScore * 1.2) },
    { metric: 'Win Rate', value: 65 }, // compute from trades
    { metric: 'Risk/Reward', value: 70 },
    { metric: 'Stability', value: 55 },
    { metric: 'Diversity', value: 80 },
    { metric: 'Simplicity', value: 100 - strategy.indicators.length * 15 },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
        <PolarGrid stroke="rgba(99, 115, 171, 0.1)" />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
        />
        <Radar
          dataKey="value"
          stroke="var(--accent-primary)"
          fill="var(--accent-primary)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
```

### 4. P&L Distribution Histogram
```tsx
function PnlHistogram({ trades }: { trades: Trade[] }) {
  // Bin trades by P&L percentage
  const bins = createBins(trades.map(t => t.pnlPercent), 10);

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={bins} barCategoryGap="10%">
        <XAxis
          dataKey="range"
          tick={AXIS_TICK_STYLE}
          axisLine={AXIS_LINE_STYLE}
          tickLine={false}
        />
        <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={30} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {bins.map((bin, i) => (
            <Cell
              key={`cell-${i}`}
              fill={bin.midpoint >= 0 ? 'var(--success)' : 'var(--danger)'}
              fillOpacity={0.7}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function createBins(values: number[], binCount: number): { range: string; count: number; midpoint: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = (max - min) / binCount;

  return Array.from({ length: binCount }, (_, i) => {
    const lo = min + i * binWidth;
    const hi = lo + binWidth;
    return {
      range: `${lo.toFixed(1)}`,
      count: values.filter(v => v >= lo && (i === binCount - 1 ? v <= hi : v < hi)).length,
      midpoint: (lo + hi) / 2,
    };
  });
}
```

### 5. Capital Allocation Donut
```tsx
function AllocationDonut({ allocations }: { allocations: IslandAllocation[] }) {
  const data = allocations.map((a, i) => ({
    name: a.slotId,
    value: a.percentOfTotal,
    fill: DATA_SERIES_COLORS[i % DATA_SERIES_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={70}
          dataKey="value"
          paddingAngle={2}
          stroke="none"
        >
          {data.map((entry, i) => (
            <Cell key={`cell-${i}`} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${safeNumber(v).toFixed(1)}%`, 'Allocation']} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

---

## 🔥 Win/Loss Heatmap Grid (Pure CSS)

```tsx
function WinLossGrid({ trades }: { trades: Trade[] }) {
  const last30 = trades.slice(-30);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(10, 1fr)',
      gap: 3,
    }}>
      {last30.map((trade, i) => (
        <div
          key={trade.id}
          title={`${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%`}
          style={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: 3,
            background: trade.pnlPercent >= 0
              ? `rgba(52, 211, 153, ${Math.min(1, trade.pnlPercent / 5) * 0.7 + 0.15})`
              : `rgba(244, 63, 94, ${Math.min(1, Math.abs(trade.pnlPercent) / 5) * 0.7 + 0.15})`,
            transition: 'transform 150ms ease',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        />
      ))}
    </div>
  );
}
```

---

## ⚡ Performance Rules for Real-Time Data

1. **Memoize derived data**: Use `useMemo` for chart data transformations
2. **Limit re-renders**: Chart components should receive primitive props or memoized arrays
3. **Virtual scrolling**: For 500+ data points, implement windowing
4. **Animation throttling**: Disable chart animations for real-time streaming updates
5. **Canvas fallback**: For 10,000+ data points, consider `<canvas>` instead of SVG

```tsx
// Pattern: Memoize chart data
const chartData = useMemo(() =>
  trades.map(t => ({
    time: new Date(t.entryTime).toLocaleTimeString(),
    pnl: t.pnlPercent,
  })),
  [trades]
);
```

---

## 🛡️ Forbidden Visualization Patterns

| ❌ NEVER | ✅ INSTEAD |
|---------|----------|
| 3D charts | Flat 2D — 3D distorts perception |
| Pie chart for >6 items | Bar chart or treemap |
| Rainbow color scales | Perceptually uniform: sequential or diverging |
| Missing zero baseline | Always include zero in bar charts |
| Chart without title | Always label what the data shows |
| Unlabeled axes | At minimum: unit or format in tick formatter |
| Raw timestamps | Formatted: `HH:mm`, `MMM DD`, or relative |

---

## 📂 Key Files
- `src/app/globals.css` → Sparkline, evolution-timeline CSS
- `src/app/page.tsx` → EquityCurveChart, EvolutionTimeline patterns
- `src/lib/store/index.ts` → Data shape from Zustand stores

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `dashboard-development` | Parent | Charts live inside dashboard panel architecture |
| `motion-design` | Extension | Chart animations follow motion timing rules |
| `backtesting-simulation` | Data source | Equity curve + trade data from backtest results |
| `performance-analysis` | Data source | Strategy metrics feed radar/bar charts |
