# Learner — Self-Evolving AI Algorithmic Trading System

## 🎯 Project Identity
**Name**: Learner
**Type**: Self-evolving AI-powered algorithmic trading system
**Target**: Binance Futures (USDT-M perpetual contracts)
**Status**: Active Development — Phase 5 (Meta-Evolution GA² + Dashboard Enhancement Complete)
**Created**: 2026-03-05

---

## 🏗️ Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------||
| **Framework** | Next.js 15 (App Router) | SSR, routing, build system |
| **Language** | TypeScript (Strict) | Type safety across all modules |
| **State** | Zustand (6 stores) | Real-time reactive state |
| **Charts** | Recharts | Performance & evolution visualization |
| **Icons** | Lucide React | Premium icon system |
| **IDs** | UUID v4 | Strategy & trade identification |
| **Styling** | Vanilla CSS (Glassmorphism) | Premium dark theme design system |

---

## 🧠 Core Architecture

The system is built on a **Genetic Algorithm** paradigm (not Reinforcement Learning). Strategies are represented as **Strategy DNA genomes** that evolve through generations via crossover, mutation, and tournament selection.

### Key Architectural Features
- **Island Model GA**: Each pair+timeframe combination has its own isolated evolution engine
- **Meta-Evolution (GA²)**: Second-layer genetic algorithm that optimizes evolution parameters (HyperDNA) per-island
- **4-Gate Validation Pipeline**: Walk-Forward Analysis → Monte Carlo → Overfitting Detection → Regime Diversity
- **3-Stage Promotion**: Paper Trading → Candidate → Active
- **Market Regime Detection**: 5 regimes (Trending Up/Down, Ranging, High/Low Volatility)
- **Cross-Island Migration**: Top strategies shared between related islands

### Module Map

```
src/
├── types/
│   ├── index.ts              → 560+ line type system (DNA, Trade, Evolution, Risk, Island, HyperDNA)
│   └── trading-slot.ts       → TradingSlot pair+timeframe identifier system
├── lib/engine/
│   ├── strategy-dna.ts       → Genome generation, crossover, mutation operators
│   ├── evaluator.ts          → Composite fitness + complexity penalty + deflated fitness
│   ├── evolution.ts          → GA: adaptive mutation, diversity pressure, Strategy Memory
│   ├── brain.ts              → AI Brain (single-island, 4-Gate validation, 3-stage promotion)
│   ├── island.ts             → Island: self-contained evolution unit + HyperDNA (GA²)
│   ├── cortex.ts             → Cortex: multi-island orchestrator + Meta-Evolution cycles
│   ├── meta-evolution.ts     → Meta-Evolution Engine (GA²): HyperDNA genome, meta-fitness, stability
│   ├── migration.ts          → Cross-island knowledge transfer (3 topologies)
│   ├── capital-allocator.ts  → Dynamic performance-weighted capital distribution
│   ├── walk-forward.ts       → Walk-Forward Analysis (rolling IS/OOS windows)
│   ├── monte-carlo.ts        → Monte Carlo permutation testing + Deflated Sharpe Ratio
│   ├── regime-detector.ts    → Market regime classification (ADX/ATR/SMA-based)
│   └── overfitting-detector.ts → Composite overfitting risk scoring (0-100)
├── lib/risk/
│   └── manager.ts            → 8 hardcoded, non-negotiable risk safety rails
├── lib/store/
│   └── index.ts              → 6 Zustand stores (Brain, Cortex, Portfolio, Trade, Market, Config)
└── app/
    ├── layout.tsx             → Root layout with Inter + JetBrains Mono fonts
    ├── globals.css            → Premium dark glassmorphism design system (1060+ lines)
    └── page.tsx               → 9-panel dashboard + Cortex Neural Map (1300+ lines)
```

---

## 🛡️ Critical Rules (Non-Negotiable)

1. **Risk Rails are HARDCODED** — No strategy, AI, or configuration can override them:
   - Max 2% risk per trade
   - Max 3 simultaneous positions (GLOBAL across all islands)
   - Max 5% daily drawdown
   - Max 15% total drawdown
   - Mandatory stop-loss on every trade
   - Max 10x leverage

2. **Paper Trading First** — Every strategy must complete 30+ trades + pass 4-Gate Validation before promotion

3. **Testnet Default** — System defaults to Binance Testnet. Live trading requires explicit opt-in

4. **No Initial Strategy** — The AI discovers strategies from scratch through genetic evolution

5. **Risk is GLOBAL** — The 3-position limit and drawdown limits apply across ALL islands simultaneously

---

## 📊 Dashboard Panels (9)

1. Portfolio Overview — Balance, P&L metrics, animated counter
2. Active Strategy — DNA strand visualization, fitness score
3. Risk Monitor — SVG gauge, drawdown/position bars, Emergency Stop, critical pulse
4. Performance Charts — Equity curve / Drawdown toggle (Recharts)
5. Evolution Timeline — Generation scores bar chart
6. AI Brain Monitor — Real-time color-coded log feed
7. **Cortex Neural Map** — Live island visualization, migration flows, HyperDNA meta-gen
8. Trade History — Expandable table with AI reasoning
9. Market Overview — Binance Futures pair prices

---

## 🔧 Dev Commands

| Command | Purpose |
|---------|---------||
| `npm run dev` | Start development server (port 3000) |
| `npx next build` | Production build (TypeScript strict) |
| `npm install` | Install dependencies |

---

## 📁 Configuration Files

| File | Purpose |
|------|---------||
| `.env.local` | API keys, testnet toggle |
| `tsconfig.json` | TypeScript strict configuration |
| `next.config.ts` | Next.js settings |
| `postcss.config.mjs` | PostCSS configuration |
| `eslint.config.mjs` | ESLint rules |

---

*Last Updated: 2026-03-06*
*Build Status: ✅ Passing (zero errors)*
