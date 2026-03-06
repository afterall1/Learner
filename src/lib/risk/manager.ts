// ============================================================
// Learner: Risk Management Engine — Hardcoded Safety Rails
// ============================================================

import {
    RiskConfig,
    DEFAULT_RISK_CONFIG,
    Position,
    Trade,
    TradeDirection,
    TradeStatus,
    StrategyDNA,
    BrainLog,
    LogLevel,
} from '@/types';
import { v4 as uuidv4 } from 'uuid';

// ─── Risk Violation Types ────────────────────────────────────

export enum RiskViolation {
    MAX_RISK_PER_TRADE = 'MAX_RISK_PER_TRADE',
    MAX_SIMULTANEOUS_POSITIONS = 'MAX_SIMULTANEOUS_POSITIONS',
    DAILY_DRAWDOWN_LIMIT = 'DAILY_DRAWDOWN_LIMIT',
    TOTAL_DRAWDOWN_LIMIT = 'TOTAL_DRAWDOWN_LIMIT',
    MAX_LEVERAGE = 'MAX_LEVERAGE',
    NO_STOP_LOSS = 'NO_STOP_LOSS',
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
}

export interface RiskCheckResult {
    approved: boolean;
    violations: RiskViolation[];
    messages: string[];
}

// ─── Risk Manager ────────────────────────────────────────────

export class RiskManager {
    private config: RiskConfig;
    private dailyPnl: number = 0;
    private dailyStartBalance: number = 0;
    private totalStartBalance: number = 0;
    private isEmergencyStopped: boolean = false;
    private riskLogs: BrainLog[] = [];

    constructor(config: Partial<RiskConfig> = {}) {
        this.config = { ...DEFAULT_RISK_CONFIG, ...config };
    }

    /**
     * Initialize the risk manager with the current balance.
     * Must be called at the start of each trading day.
     */
    initialize(currentBalance: number): void {
        this.dailyStartBalance = currentBalance;
        if (this.totalStartBalance === 0) {
            this.totalStartBalance = currentBalance;
        }
        this.dailyPnl = 0;
        this.isEmergencyStopped = false;
        this.log(LogLevel.INFO, 'Risk Manager initialized', {
            balance: currentBalance,
            dailyLimit: this.config.dailyDrawdownLimit * 100 + '%',
            totalLimit: this.config.totalDrawdownLimit * 100 + '%',
        });
    }

    /**
     * Pre-trade risk check. MUST pass before any trade is executed.
     * These are NON-NEGOTIABLE safety rails.
     */
    checkTradeRisk(
        strategy: StrategyDNA,
        direction: TradeDirection,
        currentBalance: number,
        openPositions: Position[],
        entryPrice: number,
        quantity: number,
        leverage: number,
        stopLoss: number | undefined
    ): RiskCheckResult {
        const violations: RiskViolation[] = [];
        const messages: string[] = [];

        // RAIL 1: Emergency stop active
        if (this.isEmergencyStopped) {
            return {
                approved: false,
                violations: [RiskViolation.TOTAL_DRAWDOWN_LIMIT],
                messages: ['EMERGENCY STOP is active. No trades allowed.'],
            };
        }

        // RAIL 2: Stop-loss is MANDATORY
        if (stopLoss === undefined || stopLoss <= 0) {
            violations.push(RiskViolation.NO_STOP_LOSS);
            messages.push('Stop-loss is MANDATORY for all trades. Cannot trade without SL.');
        }

        // RAIL 3: Max risk per trade (2%)
        if (stopLoss !== undefined && stopLoss > 0) {
            const riskAmount = Math.abs(entryPrice - stopLoss) * quantity * leverage;
            const riskPercent = riskAmount / currentBalance;
            if (riskPercent > this.config.maxRiskPerTrade) {
                violations.push(RiskViolation.MAX_RISK_PER_TRADE);
                messages.push(
                    `Risk per trade ${(riskPercent * 100).toFixed(2)}% exceeds max ${(this.config.maxRiskPerTrade * 100).toFixed(2)}%`
                );
            }
        }

        // RAIL 4: Max simultaneous positions
        if (openPositions.length >= this.config.maxSimultaneousPositions) {
            violations.push(RiskViolation.MAX_SIMULTANEOUS_POSITIONS);
            messages.push(
                `Already ${openPositions.length} open positions (max: ${this.config.maxSimultaneousPositions})`
            );
        }

        // RAIL 5: Max leverage
        if (leverage > this.config.maxLeverage) {
            violations.push(RiskViolation.MAX_LEVERAGE);
            messages.push(`Leverage ${leverage}x exceeds max ${this.config.maxLeverage}x`);
        }

        // RAIL 6: Daily drawdown limit
        const dailyDrawdown = this.dailyStartBalance > 0
            ? (this.dailyStartBalance - currentBalance + this.dailyPnl) / this.dailyStartBalance
            : 0;
        if (dailyDrawdown >= this.config.dailyDrawdownLimit) {
            violations.push(RiskViolation.DAILY_DRAWDOWN_LIMIT);
            messages.push(
                `Daily drawdown ${(dailyDrawdown * 100).toFixed(2)}% reached limit ${(this.config.dailyDrawdownLimit * 100).toFixed(2)}%`
            );
        }

        // RAIL 7: Total drawdown limit
        const totalDrawdown = this.totalStartBalance > 0
            ? (this.totalStartBalance - currentBalance) / this.totalStartBalance
            : 0;
        if (totalDrawdown >= this.config.totalDrawdownLimit) {
            violations.push(RiskViolation.TOTAL_DRAWDOWN_LIMIT);
            messages.push(
                `Total drawdown ${(totalDrawdown * 100).toFixed(2)}% reached limit ${(this.config.totalDrawdownLimit * 100).toFixed(2)}%`
            );
            this.triggerEmergencyStop('Total drawdown limit breached');
        }

        // RAIL 8: Sufficient balance for position
        const requiredMargin = (entryPrice * quantity) / leverage;
        if (requiredMargin > currentBalance * 0.9) { // Keep 10% buffer
            violations.push(RiskViolation.INSUFFICIENT_BALANCE);
            messages.push(`Insufficient balance. Required margin: $${requiredMargin.toFixed(2)}, Available: $${(currentBalance * 0.9).toFixed(2)}`);
        }

        const approved = violations.length === 0;

        if (!approved) {
            this.log(LogLevel.RISK, `Trade REJECTED for ${strategy.name}`, {
                direction,
                violations,
                messages,
            });
        } else {
            this.log(LogLevel.INFO, `Trade APPROVED for ${strategy.name}`, {
                direction,
                entryPrice,
                leverage,
            });
        }

        return { approved, violations, messages };
    }

    /**
     * Update daily PnL tracking after a trade closes.
     */
    recordTradeResult(trade: Trade): void {
        if (trade.status === TradeStatus.CLOSED && trade.pnlUSD !== null) {
            this.dailyPnl += trade.pnlUSD;
            this.log(LogLevel.TRADE, `Trade ${trade.id.slice(0, 8)} closed: $${trade.pnlUSD.toFixed(2)}`, {
                pnlPercent: trade.pnlPercent,
                dailyPnl: this.dailyPnl,
            });
        }
    }

    /**
     * Trigger emergency stop — halts all trading immediately.
     */
    triggerEmergencyStop(reason: string): void {
        this.isEmergencyStopped = true;
        this.log(LogLevel.ERROR, `🚨 EMERGENCY STOP TRIGGERED: ${reason}`);
    }

    /**
     * Reset emergency stop (manual action only).
     */
    resetEmergencyStop(): void {
        this.isEmergencyStopped = false;
        this.log(LogLevel.WARNING, 'Emergency stop RESET by user');
    }

    /**
     * Reset daily tracking (call at the start of each trading day).
     */
    resetDaily(currentBalance: number): void {
        this.dailyStartBalance = currentBalance;
        this.dailyPnl = 0;
        this.log(LogLevel.INFO, 'Daily risk counters reset', { balance: currentBalance });
    }

    // ─── Getters ─────────────────────────────────────────────────

    getConfig(): RiskConfig {
        return { ...this.config };
    }

    getDailyPnl(): number {
        return this.dailyPnl;
    }

    isEmergencyStopActive(): boolean {
        return this.isEmergencyStopped;
    }

    getDailyDrawdownPercent(currentBalance: number): number {
        if (this.dailyStartBalance === 0) return 0;
        return Math.max(0, (this.dailyStartBalance - currentBalance) / this.dailyStartBalance);
    }

    getTotalDrawdownPercent(currentBalance: number): number {
        if (this.totalStartBalance === 0) return 0;
        return Math.max(0, (this.totalStartBalance - currentBalance) / this.totalStartBalance);
    }

    getRiskUtilization(currentBalance: number, openPositions: Position[]): number {
        // Composite risk utilization (0-1)
        const positionUtil = openPositions.length / this.config.maxSimultaneousPositions;
        const dailyDDUtil = this.getDailyDrawdownPercent(currentBalance) / this.config.dailyDrawdownLimit;
        const totalDDUtil = this.getTotalDrawdownPercent(currentBalance) / this.config.totalDrawdownLimit;
        return Math.max(positionUtil, dailyDDUtil, totalDDUtil);
    }

    getLogs(): BrainLog[] {
        return [...this.riskLogs];
    }

    // ─── Private ─────────────────────────────────────────────────

    private log(level: LogLevel, message: string, details?: Record<string, unknown>): void {
        this.riskLogs.push({
            id: uuidv4(),
            timestamp: Date.now(),
            level,
            message,
            details,
        });

        // Keep only last 500 risk logs
        if (this.riskLogs.length > 500) {
            this.riskLogs = this.riskLogs.slice(-500);
        }
    }
}
