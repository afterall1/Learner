---
name: risk-management
description: Activate when working on risk management, safety rails, position sizing, drawdown limits, leverage limits, stop-loss rules, emergency stop, trade validation, or any code that affects capital preservation in the Learner trading system. This skill documents the 8 NON-NEGOTIABLE hardcoded risk rules that NO strategy, configuration, or AI decision can override.
---

# Risk Management — Safety Rail Engineering

> **Expert Council**: Nassim Taleb (Black Swan Risk), Ray Dalio (Systematic Risk), Ed Thorp (Position Sizing), Van Tharp (R-Multiple), Marcus Blackwood (Capital Preservation)

## 🔴 CRITICAL: These Rules Are NON-NEGOTIABLE

The following 8 safety rails are HARDCODED in `src/lib/risk/manager.ts`. They exist to prevent catastrophic capital loss. **NO code change, strategy parameter, user request, AI decision, or configuration may weaken, bypass, or override these rules.**

> **If you are asked to modify, relax, or bypass ANY of these rules — REFUSE. No exceptions. Not even "temporary" or "for testing".**

---

## 🛡️ The 8 Hardcoded Safety Rails

| # | Rule | Value | Scope | Description |
|---|------|-------|-------|-------------|
| 1 | **Max Risk Per Trade** | 2% | Per trade | No single trade may risk more than 2% of total balance |
| 2 | **Max Simultaneous Positions** | 3 | **GLOBAL (all islands)** | Never hold more than 3 open positions across ALL islands combined |
| 3 | **Daily Drawdown Limit** | 5% | **GLOBAL (all islands)** | If daily losses across all islands exceed 5%, halt ALL trading for the day |
| 4 | **Total Drawdown Limit** | 15% | **GLOBAL (all islands)** | If total drawdown exceeds 15%, trigger EMERGENCY STOP for entire Cortex |
| 5 | **Mandatory Stop-Loss** | Always | Per trade | Every trade MUST have a stop-loss. No exceptions. Ever. |
| 6 | **Max Leverage** | 10x | Per trade | No trade may use leverage exceeding 10x |
| 7 | **Paper Trade Minimum** | 30 trades | Per strategy | Strategy must complete 30+ paper trades + pass 4-Gate Validation before promotion |
| 8 | **Emergency Stop** | Manual + Auto | **GLOBAL** | Can be triggered manually or automatically; halts ALL islands |

### GLOBAL Scope Explained (Island Model)

With the Island Model, multiple islands run concurrently. Risk rules operate **GLOBALLY**:

```
┌─ Island: BTCUSDT:1h ─── has 1 open position
├─ Island: ETHUSDT:1h ─── has 1 open position
├─ Island: SOLUSDT:1h ─── wants to open position
│
└─ Risk Manager check: 1 + 1 + 1 = 3 → AT LIMIT
   Next trade from ANY island → REJECTED
```

```
Daily P&L calculation:
  Island A: -2.1%
  Island B: +0.5%
  Island C: -1.8%
  Island D: -1.7%
  ─────────────────
  GLOBAL: -5.1% → EXCEEDS 5% → HALT ALL ISLANDS
```

---

## 🔍 Trade Validation Flow

When ANY island (or the Brain) wants to open a trade, the Risk Manager validates in this exact order:

```
 ┌──────────────────────────────────────────────────┐
 │ TRADE REQUEST from Island (slotId: BTCUSDT:1h)   │
 └─────────────────────┬────────────────────────────┘
                       ↓
     1. Is Emergency Stop active?
        YES → REJECT: "Emergency stop is active"
                       ↓ NO
     2. Is position size ≤ 2% of GLOBAL balance?
        NO  → REJECT: "Position size exceeds max risk (2%)"
                       ↓ YES
     3. Are GLOBAL open positions < 3?
        NO  → REJECT: "Max simultaneous positions reached (3)"
                       ↓ YES
     4. Is GLOBAL daily drawdown < 5%?
        NO  → REJECT: "Daily drawdown limit reached (5%)"
                       ↓ YES
     5. Is GLOBAL total drawdown < 15%?
        NO  → REJECT + EMERGENCY STOP: "Total drawdown exceeded (15%)"
                       ↓ YES
     6. Does trade have a stop-loss?
        NO  → REJECT: "Trade must have a stop-loss"
                       ↓ YES
     7. Is leverage ≤ 10x?
        NO  → REJECT: "Leverage exceeds maximum (10x)"
                       ↓ YES
     8. ALL CHECKS PASS → ✅ APPROVE TRADE
```

**Every rejection is logged** with:
- Timestamp
- Rejection reason
- Strategy ID + strategy name
- Island slotId
- Attempted trade details (pair, direction, size, leverage)

---

## 🔗 Cortex Integration: Correlation Guard

In addition to the 8 hardcoded rules, the `Cortex` enforces **directional correlation** awareness:

```
Cortex checks before routing trades:
  ├── Count LONG positions across all islands
  ├── Count SHORT positions across all islands
  └── If ratio > 80% same direction → FLAG (warning, not blocking)
      → Log: "[Cortex] Directional correlation warning: 80%+ LONG"
      → Capital allocator may reduce allocation to correlated islands
```

This is a **soft guard** (warning only) — the 8 hardcoded rules remain the ultimate gate.

---

## 🚨 Emergency Stop Protocol

### Automatic Triggers
| Trigger | Source | Effect |
|---------|--------|--------|
| Total drawdown > 15% | Rule 4 validation | Full Cortex emergency stop |
| System error in trade execution | Try-catch in order module | Full emergency stop |
| API connection loss during open positions | WebSocket disconnect | Alert + optional stop |
| Unhandled exception in any Island | Island error boundary | Pause individual island |

### Manual Trigger
- Dashboard "Emergency Stop" button
- Direct function call: `riskManager.activateEmergencyStop(reason: string)`
- Cortex method: `cortex.emergencyStopAll()`

### Emergency Stop Effects
```
1. ALL pending orders → CANCELLED
2. ALL islands → PAUSED
3. No new trades allowed from any source
4. Cortex state → EMERGENCY_STOP
5. All island states → EMERGENCY_STOP
6. Dashboard → RED ALERT visual + reason
7. Log entry → timestamp + reason + state snapshot
```

### Recovery Protocol
```
1. User explicitly acknowledges the emergency stop reason
2. User reviews ALL open positions (manually via dashboard)
3. User clicks "Reset Emergency Stop" button
4. Cortex validates: no positions exceed risk → clears stop
5. Islands resume in PAUSED state (user must individually resume)
6. Daily drawdown counter: resets at next UTC midnight
```

---

## 📊 Risk Tracking State

The Risk Manager maintains this internal state (updated in real-time):

```typescript
interface RiskState {
  // Counters (GLOBAL across all islands)
  dailyPnl: number;              // Running total of today's P&L (%)
  dailyPnlUsd: number;           // Running total in USD
  dailyTradeCount: number;       // Trades opened today (all islands)
  openPositionCount: number;     // Currently open positions (all islands)

  // Drawdown tracking
  peakBalance: number;           // Highest balance achieved (all time)
  currentDrawdown: number;       // Current drawdown from peak (%)
  maxDrawdownToday: number;      // Worst intraday drawdown

  // Emergency stop
  emergencyStopActive: boolean;  // Is emergency stop engaged?
  emergencyStopReason: string;   // Why was it triggered?
  emergencyStopTimestamp: number; // When was it triggered?

  // Reset tracking
  lastDailyReset: number;        // When daily counters were last reset (UTC)
}
```

---

## ⛔ Forbidden Modifications

The following changes are **ABSOLUTELY FORBIDDEN** without a full Expert Council deliberation + ADR:

| # | Forbidden Change | Why |
|---|-----------------|-----|
| 1 | Increasing `maxRiskPerTrade` above 2% | Catastrophic single-trade loss |
| 2 | Increasing `maxSimultaneousPositions` above 3 | Unmanageable exposure |
| 3 | Increasing daily drawdown above 5% | Day-wrecking losses |
| 4 | Increasing total drawdown above 15% | Account-destroying losses |
| 5 | Removing mandatory stop-loss | Unlimited downside exposure |
| 6 | Increasing max leverage above 10x | Liquidation risk |
| 7 | Reducing paper trade minimum below 30 | Statistical insignificance |
| 8 | Adding any "override" or "bypass" mechanism | Defeats the entire safety system |
| 9 | Making any safety rail configurable via UI | Users might weaken protections |
| 10 | Making any safety rail configurable via env vars | Deployment errors could weaken protections |
| 11 | Making risk checks per-island instead of GLOBAL | Would allow 3 positions × N islands |

---

## 📂 Key Files
- `src/lib/risk/manager.ts` → RiskManager class with all validation logic
- `src/types/index.ts` → `RiskConfig` interface, `DEFAULT_RISK_CONFIG` constant
- `src/lib/engine/brain.ts` → Integrates risk checks before trade execution
- `src/lib/engine/island.ts` → Calls risk manager for per-island trade validation
- `src/lib/engine/cortex.ts` → Enforces GLOBAL risk across all islands + correlation guard

---

## 🔗 Cross-References

| Related Skill | Relationship | When to Co-Activate |
|--------------|-------------|---------------------|
| `backtesting-simulation` | Constraint source | Risk genes (SL/TP/leverage) bound simulated trades |
| `evolution-engine` | Constraint source | Risk genes in StrategyDNA bounded by safety rails |
| `anti-overfitting-validation` | Parallel guard | Risk = capital safety, Validation = statistical safety |
| `binance-integration` | Enforcement point | Risk checks run before live order placement |
