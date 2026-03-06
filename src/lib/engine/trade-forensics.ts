// ============================================================
// Learner: Trade Forensics Engine — Closed-Loop Intelligence
// ============================================================
// Phase 12: The system's "flight recorder" + "crash investigator."
//
// Every trade gets a black box that records its entire lifecycle:
// regime changes, indicator shifts, price excursions, near-misses.
// After close, a ForensicAnalyzer performs a full autopsy, and a
// CausalAttributor assigns WHY the trade succeeded or failed.
//
// This forms a CLOSED LOOP: trade outcomes → lessons → evolution
// bias → smarter next generation → better trades.
//
// Council: López de Prado (forensics), Andrew Lo (adaptive),
//          David Blei (Bayesian), Rich Sutton (credit assignment)
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    Trade,
    OHLCV,
    MarketRegime,
    TradeEventType,
    TradeLifecycleEvent,
    TradeForensicReport,
    CausalFactorType,
    CausalFactor,
    TradeLessonType,
    TradeLesson,
} from '@/types';
import { detectRegime, calculateATR } from './regime-detector';

// ─── Configuration ───────────────────────────────────────────

export interface TradeForensicsConfig {
    nearMissThreshold: number;          // % of SL/TP distance to trigger near-miss (0.15 = 15%)
    drawdownSpikeThreshold: number;     // % of SL distance for drawdown spike (0.50 = 50%)
    volatilityShiftThreshold: number;   // ATR change ratio to trigger event (0.30 = 30%)
    indicatorShiftThreshold: number;    // % change in indicator to log (0.20 = 20%)
    maxEventsPerTrade: number;          // Prevent memory explosion
    minCandlesForLesson: number;        // Min candles for statistically useful lesson
}

export const DEFAULT_FORENSICS_CONFIG: TradeForensicsConfig = {
    nearMissThreshold: 0.15,
    drawdownSpikeThreshold: 0.50,
    volatilityShiftThreshold: 0.30,
    indicatorShiftThreshold: 0.20,
    maxEventsPerTrade: 100,
    minCandlesForLesson: 3,
};

// ─── Layer 1: Trade Black Box ────────────────────────────────

/**
 * The "flight recorder" for a single trade.
 * Records every meaningful event during the trade's lifecycle.
 * Created when a trade opens, finalized when it closes.
 */
export class TradeBlackBox {
    readonly tradeId: string;
    readonly strategyId: string;
    readonly strategyName: string;
    readonly slotId: string;
    readonly direction: 'LONG' | 'SHORT';
    readonly entryPrice: number;
    readonly stopLoss: number;
    readonly takeProfit: number;
    readonly entryTime: number;
    readonly entryRegime: MarketRegime;
    readonly entryIndicators: Record<string, number>;

    private readonly config: TradeForensicsConfig;
    private events: TradeLifecycleEvent[] = [];
    private candleIndex: number = 0;
    private currentRegime: MarketRegime;
    private regimeChangeCount: number = 0;

    // ── Excursion Tracking ──
    private mfe: number = 0;                     // Maximum Favorable Excursion (%)
    private mae: number = 0;                     // Maximum Adverse Excursion (%)
    private mfeCandle: number = 0;
    private maeCandle: number = 0;
    private previousMfe: number = 0;
    private previousMae: number = 0;

    // ── ATR Tracking (for volatility shift) ──
    private entryATR: number = 0;

    // ── Near-miss flags (fire once) ──
    private slNearMissFired: boolean = false;
    private tpNearMissFired: boolean = false;
    private drawdownSpikeFired: boolean = false;

    constructor(
        trade: Trade,
        entryRegime: MarketRegime,
        entryIndicators: Record<string, number>,
        entryATR: number,
        config: TradeForensicsConfig = DEFAULT_FORENSICS_CONFIG,
    ) {
        this.tradeId = trade.id;
        this.strategyId = trade.strategyId;
        this.strategyName = trade.strategyName;
        this.slotId = trade.slotId;
        this.direction = trade.direction;
        this.entryPrice = trade.entryPrice;
        this.stopLoss = trade.stopLoss;
        this.takeProfit = trade.takeProfit;
        this.entryTime = trade.entryTime;
        this.entryRegime = entryRegime;
        this.entryIndicators = { ...entryIndicators };
        this.entryATR = entryATR;
        this.currentRegime = entryRegime;
        this.config = config;
    }

    /**
     * Tick the black box with new candle data.
     * Called on EVERY candle while the trade is open.
     */
    tick(
        candle: OHLCV,
        currentRegime: MarketRegime,
        indicators: Record<string, number>,
        currentATR: number,
    ): void {
        this.candleIndex++;

        if (this.events.length >= this.config.maxEventsPerTrade) return;

        // ── Regime Change Detection ──
        this.detectRegimeChange(candle, currentRegime);

        // ── Excursion Tracking ──
        this.trackExcursion(candle);

        // ── Near-Miss Detection ──
        this.detectNearMissSL(candle);
        this.detectNearMissTP(candle);

        // ── Drawdown Spike ──
        this.detectDrawdownSpike(candle);

        // ── Volatility Shift ──
        this.detectVolatilityShift(currentATR);

        // ── Indicator Shifts ──
        this.detectIndicatorShifts(indicators);
    }

    // ── Event Detection Methods ──────────────────────────────

    private detectRegimeChange(candle: OHLCV, newRegime: MarketRegime): void {
        if (newRegime !== this.currentRegime) {
            this.addEvent({
                timestamp: candle.timestamp,
                candleIndex: this.candleIndex,
                type: TradeEventType.REGIME_CHANGE,
                severity: 0.9,
                details: {
                    previousValue: this.currentRegime,
                    currentValue: newRegime,
                    description: `Regime changed: ${this.currentRegime} → ${newRegime}`,
                },
            });
            this.currentRegime = newRegime;
            this.regimeChangeCount++;
        }
    }

    private trackExcursion(candle: OHLCV): void {
        // Calculate unrealized PnL at high and low
        const isLong = this.direction === 'LONG';

        const pnlAtHigh = isLong
            ? ((candle.high - this.entryPrice) / this.entryPrice) * 100
            : ((this.entryPrice - candle.high) / this.entryPrice) * 100;

        const pnlAtLow = isLong
            ? ((candle.low - this.entryPrice) / this.entryPrice) * 100
            : ((this.entryPrice - candle.low) / this.entryPrice) * 100;

        const bestPnl = Math.max(pnlAtHigh, pnlAtLow);
        const worstPnl = Math.min(pnlAtHigh, pnlAtLow);

        // Track MFE
        if (bestPnl > this.mfe) {
            this.previousMfe = this.mfe;
            this.mfe = bestPnl;
            this.mfeCandle = this.candleIndex;

            // Log significant new MFE (>0.5% improvement)
            if (this.mfe - this.previousMfe > 0.5) {
                this.addEvent({
                    timestamp: candle.timestamp,
                    candleIndex: this.candleIndex,
                    type: TradeEventType.MAX_FAVORABLE_EXCURSION,
                    severity: Math.min(1, this.mfe / 5), // Scales up to 5%
                    details: {
                        previousValue: this.previousMfe,
                        currentValue: this.mfe,
                        description: `New MFE: ${this.mfe.toFixed(2)}% (was ${this.previousMfe.toFixed(2)}%)`,
                    },
                });
            }
        }

        // Track MAE
        if (worstPnl < this.mae) {
            this.previousMae = this.mae;
            this.mae = worstPnl;
            this.maeCandle = this.candleIndex;

            // Log significant new MAE (>0.5% worse)
            if (this.previousMae - this.mae > 0.5) {
                this.addEvent({
                    timestamp: candle.timestamp,
                    candleIndex: this.candleIndex,
                    type: TradeEventType.MAX_ADVERSE_EXCURSION,
                    severity: Math.min(1, Math.abs(this.mae) / 5),
                    details: {
                        previousValue: this.previousMae,
                        currentValue: this.mae,
                        description: `New MAE: ${this.mae.toFixed(2)}% (was ${this.previousMae.toFixed(2)}%)`,
                    },
                });
            }
        }
    }

    private detectNearMissSL(candle: OHLCV): void {
        if (this.slNearMissFired) return;

        const slDistance = Math.abs(this.entryPrice - this.stopLoss);
        if (slDistance === 0) return;

        const isLong = this.direction === 'LONG';
        const priceToSL = isLong
            ? candle.low - this.stopLoss
            : this.stopLoss - candle.high;

        // Near miss if price came within threshold % of SL distance
        if (priceToSL >= 0 && priceToSL < slDistance * this.config.nearMissThreshold) {
            this.slNearMissFired = true;
            this.addEvent({
                timestamp: candle.timestamp,
                candleIndex: this.candleIndex,
                type: TradeEventType.NEAR_MISS_SL,
                severity: 0.85,
                details: {
                    currentValue: priceToSL,
                    threshold: slDistance * this.config.nearMissThreshold,
                    description: `SL near-miss: price within ${(priceToSL / slDistance * 100).toFixed(1)}% of stop loss`,
                },
            });
        }
    }

    private detectNearMissTP(candle: OHLCV): void {
        if (this.tpNearMissFired) return;

        const tpDistance = Math.abs(this.takeProfit - this.entryPrice);
        if (tpDistance === 0) return;

        const isLong = this.direction === 'LONG';
        const priceToTP = isLong
            ? this.takeProfit - candle.high
            : candle.low - this.takeProfit;

        if (priceToTP >= 0 && priceToTP < tpDistance * this.config.nearMissThreshold) {
            this.tpNearMissFired = true;
            this.addEvent({
                timestamp: candle.timestamp,
                candleIndex: this.candleIndex,
                type: TradeEventType.NEAR_MISS_TP,
                severity: 0.7,
                details: {
                    currentValue: priceToTP,
                    threshold: tpDistance * this.config.nearMissThreshold,
                    description: `TP near-miss: price within ${(priceToTP / tpDistance * 100).toFixed(1)}% of take profit`,
                },
            });
        }
    }

    private detectDrawdownSpike(candle: OHLCV): void {
        if (this.drawdownSpikeFired) return;

        const slDistance = Math.abs(this.entryPrice - this.stopLoss);
        if (slDistance === 0) return;

        const isLong = this.direction === 'LONG';
        const currentDrawdown = isLong
            ? this.entryPrice - candle.low
            : candle.high - this.entryPrice;

        if (currentDrawdown > slDistance * this.config.drawdownSpikeThreshold) {
            this.drawdownSpikeFired = true;
            this.addEvent({
                timestamp: candle.timestamp,
                candleIndex: this.candleIndex,
                type: TradeEventType.DRAWDOWN_SPIKE,
                severity: 0.8,
                details: {
                    currentValue: currentDrawdown,
                    threshold: slDistance * this.config.drawdownSpikeThreshold,
                    description: `Drawdown spike: ${((currentDrawdown / slDistance) * 100).toFixed(1)}% of SL distance consumed`,
                },
            });
        }
    }

    private detectVolatilityShift(currentATR: number): void {
        if (this.entryATR === 0) return;

        const atrChange = Math.abs(currentATR - this.entryATR) / this.entryATR;
        if (atrChange > this.config.volatilityShiftThreshold) {
            this.addEvent({
                timestamp: Date.now(),
                candleIndex: this.candleIndex,
                type: TradeEventType.VOLATILITY_SHIFT,
                severity: Math.min(1, atrChange),
                details: {
                    previousValue: this.entryATR,
                    currentValue: currentATR,
                    description: `ATR shifted ${(atrChange * 100).toFixed(0)}%: ${this.entryATR.toFixed(4)} → ${currentATR.toFixed(4)}`,
                },
            });
            // Update reference to prevent re-triggering on same shift
            this.entryATR = currentATR;
        }
    }

    private detectIndicatorShifts(indicators: Record<string, number>): void {
        for (const [key, currentValue] of Object.entries(indicators)) {
            const entryValue = this.entryIndicators[key];
            if (entryValue === undefined || entryValue === 0) continue;

            const change = Math.abs(currentValue - entryValue) / Math.abs(entryValue);
            if (change > this.config.indicatorShiftThreshold) {
                this.addEvent({
                    timestamp: Date.now(),
                    candleIndex: this.candleIndex,
                    type: TradeEventType.INDICATOR_SHIFT,
                    severity: Math.min(1, change),
                    details: {
                        previousValue: entryValue,
                        currentValue: currentValue,
                        description: `${key} shifted ${(change * 100).toFixed(0)}%: ${entryValue.toFixed(2)} → ${currentValue.toFixed(2)}`,
                    },
                });
                // Update reference to prevent flooding
                this.entryIndicators[key] = currentValue;
            }
        }
    }

    private addEvent(event: TradeLifecycleEvent): void {
        if (this.events.length < this.config.maxEventsPerTrade) {
            this.events.push(event);
        }
    }

    // ── Getters ──────────────────────────────────────────────

    getEvents(): TradeLifecycleEvent[] {
        return [...this.events];
    }

    getMFE(): number { return this.mfe; }
    getMAE(): number { return this.mae; }
    getMFECandle(): number { return this.mfeCandle; }
    getMAECandle(): number { return this.maeCandle; }
    getDurationCandles(): number { return this.candleIndex; }
    getExitRegime(): MarketRegime { return this.currentRegime; }
    getRegimeChangeCount(): number { return this.regimeChangeCount; }
}

// ─── Layer 2: Forensic Analyzer ──────────────────────────────

/**
 * Performs a full post-trade autopsy.
 * Takes a closed TradeBlackBox and produces a TradeForensicReport.
 */
export class ForensicAnalyzer {

    /**
     * Analyze a completed trade and produce a forensic report.
     */
    analyze(
        blackBox: TradeBlackBox,
        closedTrade: Trade,
        exitIndicators: Record<string, number>,
    ): TradeForensicReport {
        const events = blackBox.getEvents();
        const durationCandles = blackBox.getDurationCandles();
        const mfe = blackBox.getMFE();
        const mae = blackBox.getMAE();
        const pnlPercent = closedTrade.pnlPercent ?? 0;
        const pnlUSD = closedTrade.pnlUSD ?? 0;

        // ── Efficiency Scores ──
        const entryEfficiency = this.calculateEntryEfficiency(blackBox, closedTrade);
        const exitEfficiency = this.calculateExitEfficiency(mfe, pnlPercent);
        const holdEfficiency = this.calculateHoldEfficiency(mfe, mae, pnlPercent);

        // ── Excursion Ratio ──
        const excursionRatio = mae !== 0
            ? Math.round((mfe / Math.abs(mae)) * 100) / 100
            : mfe > 0 ? 10 : 0;

        // ── Indicator Deltas ──
        const indicatorDelta: Record<string, { atEntry: number; atExit: number; changePercent: number }> = {};
        for (const [key, entryVal] of Object.entries(blackBox.entryIndicators)) {
            const exitVal = exitIndicators[key] ?? entryVal;
            const change = entryVal !== 0
                ? Math.round(((exitVal - entryVal) / Math.abs(entryVal)) * 10000) / 100
                : 0;
            indicatorDelta[key] = { atEntry: entryVal, atExit: exitVal, changePercent: change };
        }

        // ── Causal Attribution ──
        const causalFactors = this.attributeCause(blackBox, closedTrade, events);
        const primaryCause = causalFactors.reduce(
            (best, f) => Math.abs(f.contribution) > Math.abs(best.contribution) ? f : best,
            causalFactors[0],
        ).type;

        // ── Lessons ──
        const lessons = this.extractLessons(blackBox, closedTrade, events, causalFactors);

        return {
            tradeId: closedTrade.id,
            strategyId: closedTrade.strategyId,
            strategyName: closedTrade.strategyName,
            slotId: closedTrade.slotId,

            entryTime: closedTrade.entryTime,
            exitTime: closedTrade.exitTime ?? Date.now(),
            durationCandles,
            events,

            maxFavorableExcursion: Math.round(mfe * 100) / 100,
            maxAdverseExcursion: Math.round(mae * 100) / 100,
            mfeCandle: blackBox.getMFECandle(),
            maeCandle: blackBox.getMAECandle(),
            excursionRatio,

            entryEfficiency,
            exitEfficiency,
            holdEfficiency,

            entryRegime: blackBox.entryRegime,
            exitRegime: blackBox.getExitRegime(),
            regimeChangedDuringTrade: blackBox.getRegimeChangeCount() > 0,
            regimeChangeCount: blackBox.getRegimeChangeCount(),

            causalFactors,
            primaryCause,
            lessons,
            indicatorDelta,

            pnlPercent: Math.round(pnlPercent * 100) / 100,
            pnlUSD: Math.round(pnlUSD * 100) / 100,
            wasSuccessful: pnlPercent > 0,
        };
    }

    // ── Efficiency Calculations ──────────────────────────────

    /**
     * Entry Efficiency: How close was the entry to the best possible price?
     * For LONG: lower entry = better.  MFE gives us the best price seen.
     * Score 0-100.
     */
    private calculateEntryEfficiency(blackBox: TradeBlackBox, trade: Trade): number {
        const mfe = blackBox.getMFE();
        const mae = blackBox.getMAE();

        // Total price range = MFE - MAE (in %)
        const totalRange = mfe - mae;
        if (totalRange <= 0) return 50; // No range = neutral

        // Entry was at 0% PnL mark. How well is that positioned?
        // Best entry would be at MAE (buy the dip for LONG, sell the peak for SHORT)
        // Worst entry would be at MFE (buy the top for LONG)
        const entryPosition = (0 - mae) / totalRange; // 0 = at MAE (best), 1 = at MFE (worst)
        const efficiency = Math.round((1 - entryPosition) * 100);

        return Math.max(0, Math.min(100, efficiency));
    }

    /**
     * Exit Efficiency: How close was the exit to MFE?
     * Score 0-100 (100 = exited at perfect peak).
     */
    private calculateExitEfficiency(mfe: number, pnlPercent: number): number {
        if (mfe <= 0) return pnlPercent > 0 ? 50 : 0;

        const efficiency = Math.round((pnlPercent / mfe) * 100);
        return Math.max(0, Math.min(100, efficiency));
    }

    /**
     * Hold Efficiency: How much of the available PnL was captured?
     * Combines entry timing, exit timing, and drawdown management.
     */
    private calculateHoldEfficiency(mfe: number, mae: number, pnlPercent: number): number {
        const totalRange = mfe - mae;
        if (totalRange <= 0) return 50;

        // How much of the total price range did trading PnL capture?
        const capturedRatio = (pnlPercent - mae) / totalRange;
        const efficiency = Math.round(capturedRatio * 100);

        return Math.max(0, Math.min(100, efficiency));
    }

    // ── Causal Attribution ───────────────────────────────────

    /**
     * 4-factor Bayesian causal attribution model.
     * Determines WHY a trade succeeded or failed.
     */
    private attributeCause(
        blackBox: TradeBlackBox,
        trade: Trade,
        events: TradeLifecycleEvent[],
    ): CausalFactor[] {
        const pnl = trade.pnlPercent ?? 0;
        const isWin = pnl > 0;

        // ─── Factor 1: Strategy Quality ───
        // Signal accuracy: did indicators remain favorable? Excursion ratio good?
        const mfe = blackBox.getMFE();
        const mae = blackBox.getMAE();
        const excursionRatio = Math.abs(mae) > 0 ? mfe / Math.abs(mae) : mfe > 0 ? 5 : 0;
        const strategySignal = excursionRatio > 1.5 ? 0.7 : excursionRatio > 0.8 ? 0.2 : -0.5;
        const strategyQuality: CausalFactor = {
            type: CausalFactorType.STRATEGY_QUALITY,
            contribution: isWin
                ? Math.min(1, strategySignal)
                : Math.max(-1, -Math.abs(strategySignal)),
            confidence: Math.min(1, blackBox.getDurationCandles() / 10),
            evidence: excursionRatio > 1.5
                ? `Strong signal: MFE/MAE ratio ${excursionRatio.toFixed(2)} (favorable excursion dominated)`
                : excursionRatio < 0.8
                    ? `Weak signal: MFE/MAE ratio ${excursionRatio.toFixed(2)} (adverse excursion dominated)`
                    : `Neutral signal quality: MFE/MAE ratio ${excursionRatio.toFixed(2)}`,
        };

        // ─── Factor 2: Market Conditions ───
        // Regime changes hurt. Volatility shifts disrupt.
        const regimeEvents = events.filter(e => e.type === TradeEventType.REGIME_CHANGE);
        const volatilityEvents = events.filter(e => e.type === TradeEventType.VOLATILITY_SHIFT);
        const marketDisruption = (regimeEvents.length * 0.4 + volatilityEvents.length * 0.2);
        const marketConditions: CausalFactor = {
            type: CausalFactorType.MARKET_CONDITIONS,
            contribution: isWin
                ? Math.max(0, 0.5 - marketDisruption)
                : Math.min(0, -(0.3 + marketDisruption * 0.3)),
            confidence: Math.min(1, 0.5 + regimeEvents.length * 0.2),
            evidence: regimeEvents.length > 0
                ? `Market disruption: ${regimeEvents.length} regime changes, ${volatilityEvents.length} volatility shifts during trade`
                : blackBox.getExitRegime() === blackBox.entryRegime
                    ? `Stable market: regime stayed ${blackBox.entryRegime} throughout`
                    : `Market conditions were relatively stable`,
        };

        // ─── Factor 3: Timing ───
        // Near-misses suggest timing was an issue.
        const nearMissSL = events.filter(e => e.type === TradeEventType.NEAR_MISS_SL);
        const nearMissTP = events.filter(e => e.type === TradeEventType.NEAR_MISS_TP);
        const timingScore = isWin
            ? (nearMissTP.length > 0 ? -0.2 : 0.3)  // Won despite near-miss TP = could have been better
            : (nearMissSL.length > 0 ? -0.3 : -0.1); // Lost with near-miss SL = bad timing
        const timing: CausalFactor = {
            type: CausalFactorType.TIMING,
            contribution: timingScore,
            confidence: 0.6,
            evidence: nearMissSL.length > 0
                ? `Timing pressure: ${nearMissSL.length} SL near-miss events (SL was almost hit)`
                : nearMissTP.length > 0
                    ? `Close to target: ${nearMissTP.length} TP near-miss events`
                    : `No extreme timing pressure detected`,
        };

        // ─── Factor 4: Luck (Residual) ───
        // Whatever cannot be explained by the above 3 factors
        const explainedTotal = Math.abs(strategyQuality.contribution)
            + Math.abs(marketConditions.contribution)
            + Math.abs(timing.contribution);
        const luckContribution = explainedTotal < 1.0
            ? (isWin ? 1.0 - explainedTotal : -(1.0 - explainedTotal)) * 0.5
            : 0;
        const luck: CausalFactor = {
            type: CausalFactorType.LUCK,
            contribution: Math.round(luckContribution * 100) / 100,
            confidence: 0.3, // Luck is inherently uncertain
            evidence: Math.abs(luckContribution) > 0.3
                ? `Significant unexplained component — outcome may be partially random`
                : `Small residual — outcome mostly explained by fundamentals`,
        };

        return [strategyQuality, marketConditions, timing, luck];
    }

    // ── Lesson Extraction ────────────────────────────────────

    /**
     * Extract structured, actionable lessons from the trade forensics.
     * Each lesson tells the Evolution Engine what to adjust.
     */
    private extractLessons(
        blackBox: TradeBlackBox,
        trade: Trade,
        events: TradeLifecycleEvent[],
        causalFactors: CausalFactor[],
    ): TradeLesson[] {
        const lessons: TradeLesson[] = [];
        const pnl = trade.pnlPercent ?? 0;
        const isWin = pnl > 0;
        const regime = blackBox.entryRegime;

        // ── Lesson: Regime Transition Risk ──
        const regimeEvents = events.filter(e => e.type === TradeEventType.REGIME_CHANGE);
        if (regimeEvents.length > 0 && !isWin) {
            lessons.push({
                id: uuidv4(),
                tradeId: trade.id,
                strategyId: trade.strategyId,
                type: TradeLessonType.REGIME_TRANSITION_RISK,
                regime,
                severity: Math.min(1, 0.5 + regimeEvents.length * 0.2),
                description: `Trade lost during ${regimeEvents.length} regime transitions (${blackBox.entryRegime} → ${blackBox.getExitRegime()})`,
                actionableAdvice: 'Consider adding regime-transition guard: exit or reduce on regime change, or evolve strategies with wider regime tolerance',
                confidence: 0.8,
                timestamp: Date.now(),
            });
        }

        // ── Lesson: Avoid/Prefer Regime ──
        const marketFactor = causalFactors.find(f => f.type === CausalFactorType.MARKET_CONDITIONS);
        if (marketFactor && Math.abs(marketFactor.contribution) > 0.3) {
            if (!isWin && marketFactor.contribution < -0.3) {
                lessons.push({
                    id: uuidv4(),
                    tradeId: trade.id,
                    strategyId: trade.strategyId,
                    type: TradeLessonType.AVOID_REGIME,
                    regime,
                    severity: Math.abs(marketFactor.contribution),
                    description: `Strategy underperformed in ${regime}: market conditions contributed ${(marketFactor.contribution * 100).toFixed(0)}% to loss`,
                    actionableAdvice: `Reduce fitness for strategies trading in ${regime}, or evolve regime-specific variants`,
                    confidence: marketFactor.confidence,
                    timestamp: Date.now(),
                });
            } else if (isWin && marketFactor.contribution > 0.3) {
                lessons.push({
                    id: uuidv4(),
                    tradeId: trade.id,
                    strategyId: trade.strategyId,
                    type: TradeLessonType.PREFER_REGIME,
                    regime,
                    severity: marketFactor.contribution,
                    description: `Strategy thrived in ${regime}: favorable market conditions (+${(marketFactor.contribution * 100).toFixed(0)}%)`,
                    actionableAdvice: `Prioritize this strategy for ${regime} conditions, bank in Roster`,
                    confidence: marketFactor.confidence,
                    timestamp: Date.now(),
                });
            }
        }

        // ── Lesson: SL Too Tight ──
        const nearMissSL = events.filter(e => e.type === TradeEventType.NEAR_MISS_SL);
        if (nearMissSL.length > 0 && !isWin) {
            lessons.push({
                id: uuidv4(),
                tradeId: trade.id,
                strategyId: trade.strategyId,
                type: TradeLessonType.LOOSEN_SL,
                regime,
                severity: 0.7,
                description: `SL was hit after ${nearMissSL.length} near-miss events — SL may be too tight for volatility`,
                actionableAdvice: 'Consider evolving wider SL genes (increase stopLossATRMultiplier range), or use ATR-adaptive stops',
                confidence: 0.7,
                timestamp: Date.now(),
            });
        }

        // ── Lesson: SL Too Wide (large MAE with eventual loss) ──
        const mae = blackBox.getMAE();
        if (!isWin && Math.abs(mae) > 3 && nearMissSL.length === 0) {
            lessons.push({
                id: uuidv4(),
                tradeId: trade.id,
                strategyId: trade.strategyId,
                type: TradeLessonType.TIGHTEN_SL,
                regime,
                severity: Math.min(1, Math.abs(mae) / 5),
                description: `Large drawdown (MAE: ${mae.toFixed(2)}%) before stop loss — SL may be too wide`,
                actionableAdvice: 'Evolve tighter SL genes to reduce MAE exposure, especially in current volatility regime',
                confidence: 0.65,
                timestamp: Date.now(),
            });
        }

        // ── Lesson: Poor Entry Timing ──
        const mfe = blackBox.getMFE();
        if (isWin && mfe > pnl * 2.5 && mfe > 2) {
            lessons.push({
                id: uuidv4(),
                tradeId: trade.id,
                strategyId: trade.strategyId,
                type: TradeLessonType.IMPROVE_EXIT,
                regime,
                severity: Math.min(1, (mfe - pnl) / mfe),
                description: `Captured only ${((pnl / mfe) * 100).toFixed(0)}% of available profit (MFE: ${mfe.toFixed(2)}%, actual: ${pnl.toFixed(2)}%)`,
                actionableAdvice: 'Evolve better exit signals — trailing stop or dynamic TP could capture more of MFE',
                confidence: 0.6,
                timestamp: Date.now(),
            });
        }

        // ── Lesson: Indicator Unreliable ──
        const indicatorShifts = events.filter(e => e.type === TradeEventType.INDICATOR_SHIFT);
        if (indicatorShifts.length > 3 && !isWin) {
            lessons.push({
                id: uuidv4(),
                tradeId: trade.id,
                strategyId: trade.strategyId,
                type: TradeLessonType.INDICATOR_UNRELIABLE,
                regime,
                severity: Math.min(1, indicatorShifts.length / 5),
                description: `${indicatorShifts.length} indicator shifts during losing trade — entry signals were unstable`,
                actionableAdvice: 'Consider using more stable indicators for this regime, or add confirmation filters',
                confidence: 0.55,
                timestamp: Date.now(),
            });
        }

        return lessons;
    }
}

// ─── Layer 3: Trade Forensics Engine (Orchestrator) ──────────

/**
 * The main orchestrator that manages black boxes, runs analysis,
 * and stores forensic reports for learning.
 */
export class TradeForensicsEngine {
    private readonly config: TradeForensicsConfig;
    private readonly analyzer: ForensicAnalyzer;
    private activeBlackBoxes: Map<string, TradeBlackBox> = new Map();
    private completedReports: TradeForensicReport[] = [];
    private lessonArchive: TradeLesson[] = [];
    private readonly maxReports: number = 200;
    private readonly maxLessons: number = 500;

    constructor(config: Partial<TradeForensicsConfig> = {}) {
        this.config = { ...DEFAULT_FORENSICS_CONFIG, ...config };
        this.analyzer = new ForensicAnalyzer();
    }

    // ── Lifecycle ────────────────────────────────────────────

    /**
     * Open a new black box when a trade is entered.
     */
    openBlackBox(
        trade: Trade,
        currentRegime: MarketRegime,
        indicators: Record<string, number>,
        currentATR: number,
    ): void {
        const blackBox = new TradeBlackBox(
            trade,
            currentRegime,
            indicators,
            currentATR,
            this.config,
        );
        this.activeBlackBoxes.set(trade.id, blackBox);
    }

    /**
     * Tick all active black boxes with new candle data.
     * Called on every candle update while positions are open.
     */
    tickAll(
        candle: OHLCV,
        currentRegime: MarketRegime,
        indicators: Record<string, number>,
        currentATR: number,
    ): void {
        for (const [, blackBox] of this.activeBlackBoxes) {
            blackBox.tick(candle, currentRegime, indicators, currentATR);
        }
    }

    /**
     * Tick a specific black box by trade ID.
     */
    tick(
        tradeId: string,
        candle: OHLCV,
        currentRegime: MarketRegime,
        indicators: Record<string, number>,
        currentATR: number,
    ): void {
        const blackBox = this.activeBlackBoxes.get(tradeId);
        if (blackBox) {
            blackBox.tick(candle, currentRegime, indicators, currentATR);
        }
    }

    /**
     * Close a trade and generate a forensic report.
     * The black box is finalized, analyzed, and archived.
     */
    closeAndAnalyze(
        closedTrade: Trade,
        exitIndicators: Record<string, number>,
    ): TradeForensicReport | null {
        const blackBox = this.activeBlackBoxes.get(closedTrade.id);
        if (!blackBox) return null;

        try {
            // Generate forensic report
            const report = this.analyzer.analyze(blackBox, closedTrade, exitIndicators);

            // Archive report
            this.completedReports.push(report);
            if (this.completedReports.length > this.maxReports) {
                this.completedReports = this.completedReports.slice(-this.maxReports);
            }

            // Archive lessons
            this.lessonArchive.push(...report.lessons);
            if (this.lessonArchive.length > this.maxLessons) {
                this.lessonArchive = this.lessonArchive.slice(-this.maxLessons);
            }

            // Remove from active
            this.activeBlackBoxes.delete(closedTrade.id);

            return report;
        } catch (error) {
            // Defensive: never let forensics crash the trading engine
            this.activeBlackBoxes.delete(closedTrade.id);
            return null;
        }
    }

    // ── Query Methods ────────────────────────────────────────

    /**
     * Get all lessons for a specific regime.
     */
    getLessonsForRegime(regime: MarketRegime): TradeLesson[] {
        return this.lessonArchive.filter(l => l.regime === regime);
    }

    /**
     * Get all lessons for a specific strategy.
     */
    getLessonsForStrategy(strategyId: string): TradeLesson[] {
        return this.lessonArchive.filter(l => l.strategyId === strategyId);
    }

    /**
     * Get lessons by type (e.g., all AVOID_REGIME lessons).
     */
    getLessonsByType(type: TradeLessonType): TradeLesson[] {
        return this.lessonArchive.filter(l => l.type === type);
    }

    /**
     * Get the most recent forensic reports.
     */
    getRecentReports(count: number = 20): TradeForensicReport[] {
        return this.completedReports.slice(-count);
    }

    /**
     * Get reports for a specific strategy.
     */
    getReportsForStrategy(strategyId: string): TradeForensicReport[] {
        return this.completedReports.filter(r => r.strategyId === strategyId);
    }

    /**
     * Check if a trade has an active black box recording.
     */
    hasActiveBlackBox(tradeId: string): boolean {
        return this.activeBlackBoxes.has(tradeId);
    }

    /**
     * Get aggregate forensic statistics.
     */
    getForensicStats(): {
        totalReports: number;
        totalLessons: number;
        activeBlackBoxes: number;
        avgEntryEfficiency: number;
        avgExitEfficiency: number;
        avgHoldEfficiency: number;
        regimeChangeDuringTradeRate: number;
        topLessonTypes: Array<{ type: TradeLessonType; count: number }>;
    } {
        const reports = this.completedReports;
        const total = reports.length;

        if (total === 0) {
            return {
                totalReports: 0,
                totalLessons: this.lessonArchive.length,
                activeBlackBoxes: this.activeBlackBoxes.size,
                avgEntryEfficiency: 0,
                avgExitEfficiency: 0,
                avgHoldEfficiency: 0,
                regimeChangeDuringTradeRate: 0,
                topLessonTypes: [],
            };
        }

        const avgEntry = reports.reduce((s, r) => s + r.entryEfficiency, 0) / total;
        const avgExit = reports.reduce((s, r) => s + r.exitEfficiency, 0) / total;
        const avgHold = reports.reduce((s, r) => s + r.holdEfficiency, 0) / total;
        const regimeChangeRate = reports.filter(r => r.regimeChangedDuringTrade).length / total;

        // Count lesson types
        const typeCounts = new Map<TradeLessonType, number>();
        for (const lesson of this.lessonArchive) {
            typeCounts.set(lesson.type, (typeCounts.get(lesson.type) ?? 0) + 1);
        }
        const topLessonTypes = Array.from(typeCounts.entries())
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            totalReports: total,
            totalLessons: this.lessonArchive.length,
            activeBlackBoxes: this.activeBlackBoxes.size,
            avgEntryEfficiency: Math.round(avgEntry * 10) / 10,
            avgExitEfficiency: Math.round(avgExit * 10) / 10,
            avgHoldEfficiency: Math.round(avgHold * 10) / 10,
            regimeChangeDuringTradeRate: Math.round(regimeChangeRate * 1000) / 1000,
            topLessonTypes,
        };
    }

    /**
     * Get full lesson archive for dashboard.
     */
    getAllLessons(): TradeLesson[] {
        return [...this.lessonArchive];
    }

    /**
     * Get all completed reports for dashboard.
     */
    getAllReports(): TradeForensicReport[] {
        return [...this.completedReports];
    }
}
