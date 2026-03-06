---
name: dashboard-development
description: Activate when working on the Learner dashboard UI, React components, CSS styling, glassmorphism effects, chart components, Recharts integration, panel layouts, responsive design, micro-animations, data visualization, or any frontend presentation code in the Learner trading system.
---

# Dashboard Development — Ultra-Premium UI Engineering

> **Expert Council**: Jony Ive (Design Philosophy), Vitaly Friedman (UI Engineering), Adam Argyle (CSS Architecture), Steve Schoger (Visual Design), Sarah Drasner (Animation)

## 🎯 Design Philosophy

The Learner dashboard is an **institutional-grade trading terminal** that must achieve three things simultaneously:
1. **Information Density** — Maximum data, minimum clutter
2. **Cognitive Load Reduction** — Color, motion, and hierarchy guide the eye
3. **Premium Presence** — First impression must communicate "world-class"

> **Rule**: If it looks like a tutorial project, you have FAILED. Every pixel must feel intentional.

---

## 🏗️ Design System Reference

### Source of Truth
- **CSS Variables**: `src/app/globals.css` (764 lines) — ALL styling MUST use existing CSS variables
- **Layout**: 12-column grid with `col-4`, `col-6`, `col-8`, `col-12` span classes
- **Component Classes**: `.glass-card`, `.card-header`, `.card-body`, `.card-badge`, `.metric-card`, `.data-table`, `.btn-*`, `.brain-state.*`

### Color Semantic System (MANDATORY)

| Semantic Purpose | CSS Variable | Usage |
|-----------------|-------------|-------|
| Profit / Growth / Active | `--success` (#34d399) | P&L positive, ACTIVE state, fills |
| Loss / Risk / Error | `--danger` (#f43f5e) | P&L negative, EMERGENCY, alerts |
| Warning / Caution / Pending | `--warning` (#fbbf24) | PAUSED, drawdown approaching limit |
| Info / Data / Exploring | `--info` (#22d3ee) | EXPLORING state, neutral metrics |
| AI / Intelligence / Primary | `--accent-primary` (#6366f1) | Brand, primary actions, evolution |
| Genetic / Evolution | `--accent-secondary` (#8b5cf6) | EVOLVING state, DNA visualization |

> **NEVER** use raw hex values inline. ALWAYS reference CSS custom properties.

### Background Hierarchy (Dark → Light)

```
--bg-primary (#06080d)     → Page background (deepest)
  --bg-secondary (#0c0f18) → Section/panel backgrounds
    --bg-tertiary (#111627) → Elevated containers
      --bg-card (rgba)      → Glass cards
        --bg-card-hover     → Hover states
          --bg-elevated     → Tooltips, dropdowns, overlays
```

---

## 📐 Panel Architecture

### Panel Create Checklist
Every new dashboard panel MUST include:
1. `<section className="glass-card col-N">` wrapper
2. `<div className="card-header">` with icon + title + optional badge
3. `<div className="card-body">` for content
4. Unique `id` attribute for browser testing
5. Loading state (skeleton)
6. Empty state (centered icon + message)
7. Error boundary with retry

### Standard Panel Template (TSX)

```tsx
// Panel component — follows Learner panel architecture
interface PanelNameProps {
  className?: string;
}

function PanelName({ className = '' }: PanelNameProps) {
  return (
    <section
      id="panel-name"
      className={`glass-card col-4 ${className}`}
    >
      <div className="card-header">
        <div className="card-title">
          <IconComponent size={18} className="icon" />
          <span>Panel Title</span>
        </div>
        <span className="card-badge badge-info">STATUS</span>
      </div>
      <div className="card-body">
        {/* Content */}
      </div>
    </section>
  );
}
```

### Grid Span Guide

| Span | CSS Class | Usage |
|------|----------|-------|
| 1/3 width | `col-4` | Compact metric panels (Portfolio, Risk, Market) |
| 1/2 width | `col-6` | Medium panels |
| 2/3 width | `col-8` | Wide panels (Performance, Brain Monitor, Trade History) |
| Full width | `col-12` | Full bleed panels |

### Responsive Breakpoints (Already in CSS)

| Breakpoint | Behavior |
|-----------|----------|
| > 1200px | Normal grid |
| ≤ 1200px | col-4 → col-6, col-8 → col-12 |
| ≤ 768px | All columns → col-12 (stacked) |

---

## 🔤 Typography Rules

### Font Stack
| Purpose | Font | Variable |
|---------|------|----------|
| UI text, headings, labels | Inter | `--font-sans` |
| Numbers, code, data values | JetBrains Mono | `--font-mono` |

### Size Scale
| Element | Size | Weight | Extra |
|---------|------|--------|-------|
| Page title / Logo | 1.125rem | 700 | Gradient text |
| Stat value (large) | 1.75rem | 700 | `tabular-nums` |
| Stat value (medium) | 1.25rem | 700 | `tabular-nums` |
| Panel title | 0.875rem | 600 | UPPERCASE + 0.05em spacing |
| Body text | 0.8125rem | 400 | |
| Labels / Small | 0.75rem | 500 | UPPERCASE + 0.05em spacing |
| Micro labels | 0.7rem | 600 | UPPERCASE + 0.06em spacing |
| Log entries | 0.8rem | 400 | Mono font |

### Number Formatting Rules
```tsx
// ALWAYS use tabular-nums for financial data
<span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>

// P&L formatting
const formatPnl = (value: number): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

// Color by sign
const pnlColor = value >= 0 ? 'var(--success)' : 'var(--danger)';

// USD formatting
const formatUsd = (v: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

// Fitness score display
const formatFitness = (score: number): string => `${score.toFixed(1)}/100`;
```

---

## 📊 Recharts Integration Standards

### Mandatory Tooltip Style (ALL charts)
```tsx
const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: 'rgba(14, 17, 30, 0.95)',
  border: '1px solid rgba(99, 115, 171, 0.2)',
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  padding: '8px 12px',
};
```

### Safe Formatter Pattern
```tsx
// ALWAYS handle undefined values — Recharts can pass undefined
const safeFormatter = (value: string | number | undefined, name: string): [string, string] => {
  const num = Number(value ?? 0);
  return [`$${num.toFixed(2)}`, name];
};
```

### Area Chart with Gradient (Standard Pattern)
```tsx
<ResponsiveContainer width="100%" height={200}>
  <AreaChart data={data}>
    <defs>
      <linearGradient id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
        <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} />
      </linearGradient>
    </defs>
    <XAxis
      dataKey="time"
      tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
      axisLine={{ stroke: 'rgba(99, 115, 171, 0.1)' }}
      tickLine={false}
    />
    <YAxis
      tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
      axisLine={false}
      tickLine={false}
      width={60}
    />
    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={safeFormatter} />
    <Area
      type="monotone"
      dataKey="value"
      stroke="var(--accent-primary)"
      strokeWidth={2}
      fill="url(#gradientId)"
      dot={false}
      activeDot={{ r: 4, strokeWidth: 2, fill: 'var(--bg-primary)' }}
    />
  </AreaChart>
</ResponsiveContainer>
```

### Bar Chart Pattern
```tsx
<ResponsiveContainer width="100%" height={120}>
  <BarChart data={data} barCategoryGap="20%">
    <Bar
      dataKey="score"
      radius={[4, 4, 0, 0]}
      fill="var(--accent-primary)"
    />
    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
  </BarChart>
</ResponsiveContainer>
```

---

## 🧩 Component Patterns

### Status Badge
```tsx
// Use card-badge with semantic color class
<span className={`card-badge badge-${status}`}>{label}</span>

// status: 'success' | 'danger' | 'warning' | 'info' | 'primary'
```

### Brain State Indicator
```tsx
// CSS classes already exist for all states
<div className={`brain-state ${stateClass}`}>
  <span className="dot" />
  <span>{label}</span>
</div>
```

| BrainState | CSS Class | Color |
|-----------|-----------|-------|
| IDLE | `idle` | Muted gray |
| EXPLORING | `exploring` | Cyan + pulse |
| EVALUATING | `evaluating` | Amber + pulse |
| EVOLVING | `evolving` | Violet + fast pulse |
| TRADING | `trading` | Green + slow pulse |
| PAUSED | `paused` | Amber (no pulse) |
| EMERGENCY_STOP | `emergency` | Red + rapid pulse |

### DNA Gene Chip
```tsx
<div className="dna-strand">
  <span className="dna-gene indicator">RSI(14)</span>
  <span className="dna-gene timeframe">1H</span>
  <span className="dna-gene risk">SL:2.5%</span>
  <span className="dna-gene direction">LONG</span>
</div>

// Types: indicator, timeframe, risk, direction
```

### SVG Gauge Arc
```tsx
// Semi-circle gauge — 180° arc
const radius = 60;
const circumference = Math.PI * radius;
const offset = circumference * (1 - utilization);

<svg viewBox="0 0 140 80">
  {/* Background arc */}
  <path
    d="M 10 70 A 60 60 0 0 1 130 70"
    fill="none"
    stroke="rgba(99, 115, 171, 0.1)"
    strokeWidth={8}
    strokeLinecap="round"
  />
  {/* Filled arc */}
  <path
    d="M 10 70 A 60 60 0 0 1 130 70"
    fill="none"
    stroke={gaugeColor}
    strokeWidth={8}
    strokeLinecap="round"
    strokeDasharray={circumference}
    strokeDashoffset={offset}
    className="risk-gauge-arc"
  />
</svg>
```

### Progress Bar
```tsx
<div className="progress-bar">
  <div
    className={`progress-fill ${variant}`}
    style={{ width: `${Math.min(100, percent)}%` }}
  />
</div>

// variant: 'primary' | 'success' | 'danger' | 'warning'
```

### Empty State
```tsx
<div className="empty-state">
  <IconComponent size={48} className="icon" />
  <p>No data available yet. Start the AI Brain to begin evolution.</p>
</div>
```

---

## 🛡️ Forbidden Patterns

| ❌ NEVER | ✅ INSTEAD |
|---------|----------|
| Inline hex colors `color: '#f43f5e'` | CSS variable `color: 'var(--danger)'` |
| Fixed pixel widths on charts | `<ResponsiveContainer width="100%" height={N}>` |
| `any` type on event handlers | Proper React event types |
| Missing `key` prop in lists | Unique, stable keys (never array index) |
| String concatenation for classes | Template literals `` `class-${var}` `` |
| Hardcoded font sizes | Use the size scale from typography rules |
| `import React from 'react'` | Not needed in Next.js 15 (automatic JSX) |
| Unhandled undefined in formatters | `Number(value ?? 0)` pattern |

---

## 📂 Key Files
- `src/app/globals.css` → Complete design system (764 lines)
- `src/app/page.tsx` → Dashboard page with 8 panels (1010+ lines)
- `src/app/layout.tsx` → Root layout with fonts and metadata
- `src/lib/store/index.ts` → 6 Zustand stores

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `data-visualization` | Extension | Chart components follow dashboard design system |
| `motion-design` | Extension | Animations follow dashboard timing conventions |
| `multi-island-ui` | Extension | Island panels follow dashboard panel architecture |
| `learner-conventions` | Standard | All UI code must follow naming/import rules |
