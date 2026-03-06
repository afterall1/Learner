---
name: motion-design
description: Activate when working on CSS animations, micro-interactions, state transitions, loading states, skeleton screens, spring physics, gesture feedback, scroll-driven animations, or any motion/animation work in the Learner trading system.
---

# Motion Design — Animation & Interaction Engineering

> **Expert Council**: Sarah Drasner (SVG Animation), Josh Comeau (CSS Springs), Jhey Tompkins (Creative CSS), Adam Argyle (Scroll Animations), Yuri Artyukh (WebGL Motion)

## 🎯 Motion Philosophy

> "Good animation is invisible. Bad animation is distracting." — Sarah Drasner

Motion in Learner serves three purposes:
1. **State Communication** — Animate state changes so users feel the transition
2. **Spatial Orientation** — Motion reveals hierarchy and relationships
3. **Perceived Performance** — Loading animations make waits feel shorter

> **Rule**: NO motion for motion's sake. Every animation must reduce cognitive load or enhance data comprehension.

---

## ⏱️ Timing & Easing Reference

### Existing CSS Variables (USE THESE)
```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);  /* Hover, toggle */
--transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);  /* Panel, card */
--transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);  /* Progress fill */
```

### Motion Duration Guide

| Action | Duration | Easing | Variable |
|--------|----------|--------|----------|
| Hover enter/exit | 150ms | ease-out | `--transition-fast` |
| Color change | 150ms | linear | `--transition-fast` |
| Card elevation | 250ms | ease-in-out | `--transition-base` |
| Panel expand/collapse | 300ms | ease-out | custom |
| Progress fill | 400ms | ease-in-out | `--transition-slow` |
| Page enter | 500ms | ease-out | custom |
| Complex orchestration | 600-800ms | custom spring | custom |

### Easing Functions

```css
/* Standard Material easing — already in CSS vars */
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);

/* Decelerate — entering elements */
--ease-decel: cubic-bezier(0, 0, 0.2, 1);

/* Accelerate — exiting elements */
--ease-accel: cubic-bezier(0.4, 0, 1, 1);

/* Spring — bouncy emphasis */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

/* Smooth overshoot — subtle bounce */
--ease-overshoot: cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

---

## 🎭 State Transition Animations

### BrainState Transition (Existing + Enhanced)

The existing CSS already has pulse animations for each brain state. These can be enhanced:

```css
/* Existing */
@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Enhanced: State change ripple */
@keyframes state-change {
  0% { transform: scale(1); box-shadow: 0 0 0 0 currentColor; }
  50% { transform: scale(1.02); box-shadow: 0 0 0 8px transparent; }
  100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
}

.brain-state-transition {
  animation: state-change 600ms var(--ease-spring);
}
```

### Value Change Flash
When a financial value updates, briefly flash the background to draw attention:

```css
@keyframes value-flash-positive {
  0% { background-color: rgba(52, 211, 153, 0.2); }
  100% { background-color: transparent; }
}

@keyframes value-flash-negative {
  0% { background-color: rgba(244, 63, 94, 0.2); }
  100% { background-color: transparent; }
}

.value-flash-positive {
  animation: value-flash-positive 800ms ease-out;
}

.value-flash-negative {
  animation: value-flash-negative 800ms ease-out;
}
```

### Usage in React:
```tsx
function AnimatedValue({ value, prevValue }: { value: number; prevValue: number }) {
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    if (value !== prevValue) {
      setFlashClass(value > prevValue ? 'value-flash-positive' : 'value-flash-negative');
      const timer = setTimeout(() => setFlashClass(''), 800);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue]);

  return (
    <span className={`stat-value ${value >= 0 ? 'positive' : 'negative'} ${flashClass}`}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}
```

---

## 🦴 Skeleton Loading States

### Skeleton Base CSS
```css
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(99, 115, 171, 0.06) 25%,
    rgba(99, 115, 171, 0.12) 50%,
    rgba(99, 115, 171, 0.06) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

.skeleton-text {
  height: 14px;
  margin: 8px 0;
}

.skeleton-heading {
  height: 24px;
  width: 60%;
  margin: 8px 0;
}

.skeleton-chart {
  height: 200px;
  border-radius: var(--radius-md);
}

.skeleton-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}
```

### Skeleton Panel Component
```tsx
function SkeletonPanel() {
  return (
    <section className="glass-card col-4">
      <div className="card-header">
        <div className="skeleton skeleton-text" style={{ width: '40%' }} />
        <div className="skeleton skeleton-text" style={{ width: 60 }} />
      </div>
      <div className="card-body">
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-text" style={{ width: '80%' }} />
        <div className="skeleton skeleton-text" style={{ width: '65%' }} />
        <div className="skeleton skeleton-chart" style={{ marginTop: 16 }} />
      </div>
    </section>
  );
}
```

---

## 📈 Counter Animation (Number Counting)

```tsx
function AnimatedCounter({
  value,
  duration = 800,
  decimals = 2,
  prefix = '',
  suffix = '',
}: {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevValue.current = end;
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{displayValue.toFixed(decimals)}{suffix}
    </span>
  );
}
```

---

## 🌊 Staggered List Animation

### CSS
```css
@keyframes stagger-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stagger-list > * {
  animation: stagger-in 400ms cubic-bezier(0, 0, 0.2, 1) backwards;
}

/* Generate stagger delays for up to 12 items */
.stagger-list > *:nth-child(1) { animation-delay: 0ms; }
.stagger-list > *:nth-child(2) { animation-delay: 50ms; }
.stagger-list > *:nth-child(3) { animation-delay: 100ms; }
.stagger-list > *:nth-child(4) { animation-delay: 150ms; }
.stagger-list > *:nth-child(5) { animation-delay: 200ms; }
.stagger-list > *:nth-child(6) { animation-delay: 250ms; }
.stagger-list > *:nth-child(7) { animation-delay: 300ms; }
.stagger-list > *:nth-child(8) { animation-delay: 350ms; }
.stagger-list > *:nth-child(9) { animation-delay: 400ms; }
.stagger-list > *:nth-child(10) { animation-delay: 450ms; }
.stagger-list > *:nth-child(11) { animation-delay: 500ms; }
.stagger-list > *:nth-child(12) { animation-delay: 550ms; }
```

### Usage
```tsx
<div className="island-grid stagger-list">
  {islands.map((snap) => (
    <IslandCard key={snap.slotId} snapshot={snap} />
  ))}
</div>
```

---

## 🔴 Notification Ping

```css
@keyframes ping {
  0% { transform: scale(1); opacity: 1; }
  75% { transform: scale(2); opacity: 0; }
  100% { transform: scale(2); opacity: 0; }
}

.notification-ping {
  position: relative;
}

.notification-ping::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 8px;
  background: var(--danger);
  border-radius: 50%;
}

.notification-ping::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 8px;
  background: var(--danger);
  border-radius: 50%;
  animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
}
```

---

## ⚡ Reduced Motion Support (MANDATORY)

```css
/* ALWAYS include this at the end of globals.css */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 🛡️ Motion Anti-Patterns

| ❌ NEVER | ✅ INSTEAD |
|---------|----------|
| Animations > 1s (except special) | Keep under 600ms for UI |
| Blocking animations (user must wait) | Non-blocking, cancellable |
| Animation on initial server render | Only animate after hydration |
| Bounce/elastic for financial data | Use ease-out for trustworthy feel |
| Animating layout/reflow properties | Use transform and opacity only |
| Missing `prefers-reduced-motion` | ALWAYS include the media query |
| Infinite animations on many elements | Limit to 1-2 pulsing indicators |

---

## 📂 Key Files
- `src/app/globals.css` → Existing animations: `pulse-glow`, `fadeIn`, `risk-gauge-arc`
- `src/app/page.tsx` → BrainStateIndicator animation classes
