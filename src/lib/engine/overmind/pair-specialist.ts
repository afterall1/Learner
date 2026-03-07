// ============================================================
// Learner: Pair Specialist — Pair-Specific Intelligence
// ============================================================
// Uses Opus 4.6 to create microstructure profiles for each
// trading pair. Profiles are cached (24h TTL) and include
// liquidity signatures, regime frequencies, and suggested
// strategy archetypes.
// ============================================================

import {
    type PairProfile,
    type PairArchetype,
    type OvermindIslandContext,
    OvermindEventType,
} from '@/types/overmind';
import { type OHLCV, MarketRegime, type IndicatorType } from '@/types';
import { OpusClient } from './opus-client';
import { buildPairProfilePrompt, getSystemPrompt } from './prompt-engine';
import { isNonNullObject } from './response-parser';
import { ReasoningJournal } from './reasoning-journal';

// ─── Pair Specialist ─────────────────────────────────────────

export class PairSpecialist {
    private profileCache: Map<string, PairProfile> = new Map();
    private readonly cacheTTL: number;
    private readonly opus: OpusClient;
    private readonly journal: ReasoningJournal;

    constructor(cacheTTL: number = 24 * 60 * 60 * 1000, journal: ReasoningJournal) {
        this.cacheTTL = cacheTTL;
        this.opus = OpusClient.getInstance();
        this.journal = journal;
    }

    // ─── Profile Generation ──────────────────────────────────

    /**
     * Build a comprehensive pair profile using Opus 4.6 analysis.
     * Results are cached for the configured TTL.
     */
    async buildPairProfile(pair: string, candles: OHLCV[]): Promise<PairProfile | null> {
        if (!this.opus.isAvailable()) {
            return this.buildFallbackProfile(pair, candles);
        }

        // Check cache
        const cached = this.getCachedProfile(pair);
        if (cached) return cached;

        // Calculate basic statistics from candle data
        const stats = this.calculatePairStats(pair, candles);

        const prompt = buildPairProfilePrompt(pair, stats);
        const response = await this.opus.analyzeWithSchema(
            getSystemPrompt(),
            prompt,
            isNonNullObject,
            { temperature: 0.5, budgetTokens: 6_000 },
        );

        if (!response?.content) {
            return this.buildFallbackProfile(pair, candles);
        }

        const profile = this.parseProfileResponse(response.content, pair, stats);
        if (profile) {
            this.profileCache.set(pair, profile);

            this.journal.recordEntry(
                OvermindEventType.CYCLE_COMPLETED,
                null,
                { regime: null, generation: null, populationSize: null, bestFitness: null },
                `Built pair profile for ${pair}: ${profile.dominantBehavior}, volatility ${profile.avgDailyVolatilityPercent.toFixed(1)}%`,
                0.8,
                response.usage.totalTokens,
            );
        }

        return profile;
    }

    /**
     * Get cached profile if it exists and hasn't expired.
     */
    getCachedProfile(pair: string): PairProfile | null {
        const cached = this.profileCache.get(pair);
        if (!cached) return null;
        if (Date.now() > cached.expiresAt) {
            this.profileCache.delete(pair);
            return null;
        }
        return cached;
    }

    /**
     * Get all cached profiles.
     */
    getAllProfiles(): PairProfile[] {
        return Array.from(this.profileCache.values()).filter(
            p => Date.now() <= p.expiresAt,
        );
    }

    /**
     * Load profiles from persistence.
     */
    loadProfiles(profiles: PairProfile[]): void {
        for (const p of profiles) {
            if (Date.now() <= p.expiresAt) {
                this.profileCache.set(p.pair, p);
            }
        }
    }

    // ─── Statistical Calculations ────────────────────────────

    /**
     * Calculate basic pair statistics from candle data.
     */
    private calculatePairStats(
        pair: string,
        candles: OHLCV[],
    ): {
        avgVolume: number;
        avgSpread: number;
        avgDailyRange: number;
        volatility: number;
        regimeCounts: Record<string, number>;
        totalCandles: number;
    } {
        if (candles.length === 0) {
            return {
                avgVolume: 0,
                avgSpread: 0,
                avgDailyRange: 0,
                volatility: 0,
                regimeCounts: {},
                totalCandles: 0,
            };
        }

        // Average volume
        const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;

        // Average spread (high - low) as percentage
        const spreads = candles.map(c => ((c.high - c.low) / c.low) * 100);
        const avgSpread = spreads.reduce((sum, s) => sum + s, 0) / spreads.length;

        // Daily range (average high-low as %)
        const avgDailyRange = avgSpread;

        // Volatility (standard deviation of returns)
        const returns = [];
        for (let i = 1; i < candles.length; i++) {
            returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
        }
        const meanReturn = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
        const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (returns.length || 1);
        const volatility = Math.sqrt(variance) * 100;

        // Simple regime classification from price action
        const regimeCounts: Record<string, number> = {
            [MarketRegime.TRENDING_UP]: 0,
            [MarketRegime.TRENDING_DOWN]: 0,
            [MarketRegime.RANGING]: 0,
            [MarketRegime.HIGH_VOLATILITY]: 0,
            [MarketRegime.LOW_VOLATILITY]: 0,
        };

        const windowSize = Math.min(20, Math.floor(candles.length / 5));
        for (let i = windowSize; i < candles.length; i++) {
            const windowReturn = (candles[i].close - candles[i - windowSize].close) / candles[i - windowSize].close;
            const windowSpread = spreads.slice(i - windowSize, i);
            const windowAvgSpread = windowSpread.reduce((s, v) => s + v, 0) / windowSpread.length;

            if (windowReturn > 0.02) regimeCounts[MarketRegime.TRENDING_UP]++;
            else if (windowReturn < -0.02) regimeCounts[MarketRegime.TRENDING_DOWN]++;
            else if (windowAvgSpread > avgSpread * 1.5) regimeCounts[MarketRegime.HIGH_VOLATILITY]++;
            else if (windowAvgSpread < avgSpread * 0.5) regimeCounts[MarketRegime.LOW_VOLATILITY]++;
            else regimeCounts[MarketRegime.RANGING]++;
        }

        return {
            avgVolume,
            avgSpread,
            avgDailyRange,
            volatility,
            regimeCounts,
            totalCandles: candles.length,
        };
    }

    // ─── Fallback Profile ────────────────────────────────────

    /**
     * Build a basic profile without Opus (when API is unavailable).
     */
    private buildFallbackProfile(pair: string, candles: OHLCV[]): PairProfile {
        const stats = this.calculatePairStats(pair, candles);
        const total = Object.values(stats.regimeCounts).reduce((s, c) => s + c, 0) || 1;

        const regimeFrequency: Record<MarketRegime, number> = {
            [MarketRegime.TRENDING_UP]: (stats.regimeCounts[MarketRegime.TRENDING_UP] || 0) / total,
            [MarketRegime.TRENDING_DOWN]: (stats.regimeCounts[MarketRegime.TRENDING_DOWN] || 0) / total,
            [MarketRegime.RANGING]: (stats.regimeCounts[MarketRegime.RANGING] || 0) / total,
            [MarketRegime.HIGH_VOLATILITY]: (stats.regimeCounts[MarketRegime.HIGH_VOLATILITY] || 0) / total,
            [MarketRegime.LOW_VOLATILITY]: (stats.regimeCounts[MarketRegime.LOW_VOLATILITY] || 0) / total,
        };

        // Determine dominant behavior
        let dominant: PairProfile['dominantBehavior'] = 'mixed';
        const trendingTotal = regimeFrequency[MarketRegime.TRENDING_UP] + regimeFrequency[MarketRegime.TRENDING_DOWN];
        if (trendingTotal > 0.5) dominant = 'trending';
        else if (regimeFrequency[MarketRegime.RANGING] > 0.4) dominant = 'ranging';
        else if (regimeFrequency[MarketRegime.HIGH_VOLATILITY] > 0.3) dominant = 'volatile';

        return {
            pair,
            liquidityScore: stats.avgVolume > 1_000_000 ? 0.9 : stats.avgVolume > 100_000 ? 0.7 : 0.4,
            avgDailyVolatilityPercent: stats.volatility,
            regimeFrequency,
            dominantBehavior: dominant,
            correlationMap: {},
            characterSummary: `${pair}: ${dominant} behavior, ${stats.volatility.toFixed(1)}% daily volatility, ${stats.totalCandles} candles analyzed.`,
            suggestedArchetypes: [],
            identifiedPatterns: [],
            createdAt: Date.now(),
            expiresAt: Date.now() + this.cacheTTL,
        };
    }

    // ─── Response Parsing ────────────────────────────────────

    private parseProfileResponse(
        rawContent: unknown,
        pair: string,
        stats: { avgVolume: number; volatility: number; totalCandles: number },
    ): PairProfile | null {
        if (typeof rawContent !== 'object' || rawContent === null) return null;
        const r = rawContent as Record<string, unknown>;

        // Parse regime frequency
        const rfRaw = r.regimeFrequency as Record<string, number> | undefined;
        const regimeFrequency: Record<MarketRegime, number> = {
            [MarketRegime.TRENDING_UP]: rfRaw?.TRENDING_UP ?? rfRaw?.['TRENDING_UP'] ?? 0.2,
            [MarketRegime.TRENDING_DOWN]: rfRaw?.TRENDING_DOWN ?? rfRaw?.['TRENDING_DOWN'] ?? 0.2,
            [MarketRegime.RANGING]: rfRaw?.RANGING ?? rfRaw?.['RANGING'] ?? 0.3,
            [MarketRegime.HIGH_VOLATILITY]: rfRaw?.HIGH_VOLATILITY ?? rfRaw?.['HIGH_VOLATILITY'] ?? 0.15,
            [MarketRegime.LOW_VOLATILITY]: rfRaw?.LOW_VOLATILITY ?? rfRaw?.['LOW_VOLATILITY'] ?? 0.15,
        };

        // Parse archetypes
        const archetypes: PairArchetype[] = [];
        if (Array.isArray(r.suggestedArchetypes)) {
            for (const arch of r.suggestedArchetypes) {
                if (typeof arch !== 'object' || arch === null) continue;
                const a = arch as Record<string, unknown>;
                archetypes.push({
                    name: String(a.name || 'Unknown'),
                    description: String(a.description || ''),
                    bestRegime: (String(a.bestRegime || 'RANGING')) as MarketRegime,
                    suggestedIndicators: Array.isArray(a.suggestedIndicators)
                        ? a.suggestedIndicators.map(String) as IndicatorType[]
                        : [],
                    suggestedRiskProfile: {
                        stopLossRange: Array.isArray((a.suggestedRiskProfile as Record<string, unknown>)?.stopLossRange)
                            ? (a.suggestedRiskProfile as Record<string, unknown>).stopLossRange as [number, number]
                            : [1.0, 2.5],
                        takeProfitRange: Array.isArray((a.suggestedRiskProfile as Record<string, unknown>)?.takeProfitRange)
                            ? (a.suggestedRiskProfile as Record<string, unknown>).takeProfitRange as [number, number]
                            : [3.0, 8.0],
                        leverageRange: Array.isArray((a.suggestedRiskProfile as Record<string, unknown>)?.leverageRange)
                            ? (a.suggestedRiskProfile as Record<string, unknown>).leverageRange as [number, number]
                            : [3, 7],
                    },
                    confidence: Math.max(0, Math.min(1, Number(a.confidence) || 0.5)),
                });
            }
        }

        return {
            pair,
            liquidityScore: Math.max(0, Math.min(1, Number(r.liquidityScore) || 0.5)),
            avgDailyVolatilityPercent: Number(r.avgDailyVolatilityPercent) || stats.volatility,
            regimeFrequency,
            dominantBehavior: (String(r.dominantBehavior || 'mixed')) as PairProfile['dominantBehavior'],
            correlationMap: (typeof r.correlationMap === 'object' && r.correlationMap !== null)
                ? r.correlationMap as Record<string, number>
                : {},
            characterSummary: String(r.characterSummary || `${pair} profile`),
            suggestedArchetypes: archetypes,
            identifiedPatterns: Array.isArray(r.identifiedPatterns)
                ? r.identifiedPatterns.map(String)
                : [],
            createdAt: Date.now(),
            expiresAt: Date.now() + this.cacheTTL,
        };
    }
}
