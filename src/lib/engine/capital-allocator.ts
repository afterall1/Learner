// ============================================================
// Learner: Capital Allocator — Dynamic Risk Budget Distribution
// ============================================================
// Distributes total capital across islands based on performance.
// Higher-performing islands get more capital, but floors and
// caps prevent starvation and concentration.
// ============================================================

import { IslandAllocation } from '@/types';
import { Island } from './island';

// ─── Configuration ───────────────────────────────────────────

export interface AllocationConfig {
    minPerIslandPercent: number;   // Floor: minimum % per island (default: 5%)
    maxPerIslandPercent: number;   // Cap: maximum % per island (default: 30%)
    rebalanceInterval: number;     // Rebalance every N generations
    lifetimeFitnessWeight: number; // Weight for lifetime best fitness (0-1)
    recentTrendWeight: number;     // Weight for recent trend (0-1)
    diversityWeight: number;       // Weight for diversity contribution (0-1)
}

export const DEFAULT_ALLOCATION_CONFIG: AllocationConfig = {
    minPerIslandPercent: 5,
    maxPerIslandPercent: 30,
    rebalanceInterval: 3,
    lifetimeFitnessWeight: 0.60,
    recentTrendWeight: 0.30,
    diversityWeight: 0.10,
};

// ─── Capital Allocator ───────────────────────────────────────

export class CapitalAllocator {
    private config: AllocationConfig;
    private currentAllocations: IslandAllocation[] = [];
    private rebalanceCounter: number = 0;

    constructor(config: Partial<AllocationConfig> = {}) {
        this.config = { ...DEFAULT_ALLOCATION_CONFIG, ...config };
    }

    /**
     * Calculate raw weights for each island based on multi-factor scoring.
     *
     * Factors:
     * 1. Lifetime Best Fitness (60%) — higher = better historically
     * 2. Recent Performance Trend (30%) — improving islands get more
     * 3. Diversity Contribution (10%) — uncorrelated islands are valuable
     *
     * Returns a map of slotId → normalized weight (0-1).
     */
    calculateWeights(islands: Map<string, Island>): Map<string, number> {
        const weights = new Map<string, number>();
        const islandEntries = Array.from(islands.entries());

        if (islandEntries.length === 0) return weights;

        // Collect raw scores
        const scores: { slotId: string; lifetimeFitness: number; recentTrend: number; diversityScore: number }[] = [];

        for (const [slotId, island] of islandEntries) {
            const lifetimeFitness = island.getLifetimeBestFitness();
            const recentTrend = island.getRecentPerformanceTrend();
            // Diversity score: islands on less common pairs/timeframes get a bonus
            const diversityScore = this.calculateDiversityContribution(slotId, islandEntries);

            scores.push({ slotId, lifetimeFitness, recentTrend, diversityScore });
        }

        // Normalize each factor to 0-1
        const maxFitness = Math.max(...scores.map(s => s.lifetimeFitness), 1);
        const maxDiversity = Math.max(...scores.map(s => s.diversityScore), 0.01);

        for (const score of scores) {
            const normalizedFitness = score.lifetimeFitness / maxFitness;
            const normalizedTrend = (score.recentTrend + 1) / 2; // -1..1 → 0..1
            const normalizedDiversity = score.diversityScore / maxDiversity;

            const compositeWeight =
                normalizedFitness * this.config.lifetimeFitnessWeight +
                normalizedTrend * this.config.recentTrendWeight +
                normalizedDiversity * this.config.diversityWeight;

            weights.set(score.slotId, Math.max(0.01, compositeWeight));
        }

        // Normalize weights to sum to 1.0
        const totalWeight = Array.from(weights.values()).reduce((sum, w) => sum + w, 0);
        if (totalWeight > 0) {
            for (const [slotId, weight] of weights) {
                weights.set(slotId, weight / totalWeight);
            }
        }

        return weights;
    }

    /**
     * Rebalance capital across all islands.
     *
     * @param totalCapital - Total available capital for all islands
     * @param islands - Map of all active islands
     * @returns Array of allocation results with applied floors and caps
     */
    rebalance(totalCapital: number, islands: Map<string, Island>): IslandAllocation[] {
        this.rebalanceCounter++;

        // Only rebalance at configured intervals (or first time)
        if (this.rebalanceCounter > 1 && this.rebalanceCounter % this.config.rebalanceInterval !== 0) {
            return this.currentAllocations;
        }

        const rawWeights = this.calculateWeights(islands);
        const allocations: IslandAllocation[] = [];
        const islandCount = islands.size;

        if (islandCount === 0) {
            this.currentAllocations = [];
            return [];
        }

        // Calculate floor and cap in absolute terms
        const minPercent = this.config.minPerIslandPercent;
        const maxPercent = this.config.maxPerIslandPercent;

        // First pass: apply raw weights with floor and cap
        let totalAllocatedPercent = 0;

        for (const [slotId, island] of islands) {
            const rawWeight = rawWeights.get(slotId) ?? (1 / islandCount);
            let percentOfTotal = rawWeight * 100;

            // Apply floor
            percentOfTotal = Math.max(minPercent, percentOfTotal);
            // Apply cap
            percentOfTotal = Math.min(maxPercent, percentOfTotal);

            totalAllocatedPercent += percentOfTotal;

            allocations.push({
                slotId,
                weight: rawWeight,
                allocatedCapital: 0, // Set below after normalization
                percentOfTotal,
                lifetimeBestFitness: island.getLifetimeBestFitness(),
                recentTrend: island.getRecentPerformanceTrend(),
            });
        }

        // Second pass: normalize to 100% (after floor/cap adjustments)
        if (totalAllocatedPercent > 0) {
            const normalizationFactor = 100 / totalAllocatedPercent;
            for (const allocation of allocations) {
                allocation.percentOfTotal = Math.round(allocation.percentOfTotal * normalizationFactor * 100) / 100;
                allocation.allocatedCapital = Math.round((allocation.percentOfTotal / 100) * totalCapital * 100) / 100;
            }
        }

        // Apply allocations to islands
        for (const allocation of allocations) {
            const island = islands.get(allocation.slotId);
            if (island) {
                island.setAllocatedCapital(allocation.allocatedCapital);
            }
        }

        this.currentAllocations = allocations;
        return allocations;
    }

    /**
     * Calculate how much diversity an island contributes.
     * Islands trading unique pairs or rare timeframes get a bonus.
     */
    private calculateDiversityContribution(
        slotId: string,
        allIslands: [string, Island][]
    ): number {
        const [pair, tf] = slotId.split(':');

        // Count how many other islands share this pair or timeframe
        let samePairCount = 0;
        let sameTimeframeCount = 0;

        for (const [otherId] of allIslands) {
            if (otherId === slotId) continue;
            const [otherPair, otherTf] = otherId.split(':');
            if (otherPair === pair) samePairCount++;
            if (otherTf === tf) sameTimeframeCount++;
        }

        const total = allIslands.length - 1;
        if (total === 0) return 1;

        // Rarity bonus: the fewer islands share this pair/TF, the more diverse
        const pairRarity = 1 - (samePairCount / total);
        const tfRarity = 1 - (sameTimeframeCount / total);

        return (pairRarity * 0.6 + tfRarity * 0.4);
    }

    // ─── Getters ─────────────────────────────────────────────────

    getCurrentAllocations(): IslandAllocation[] {
        return [...this.currentAllocations];
    }

    getRebalanceCounter(): number {
        return this.rebalanceCounter;
    }
}

/**
 * Calculate equal allocation for initial setup or fallback.
 */
export function calculateEqualAllocation(
    totalCapital: number,
    slotIds: string[]
): IslandAllocation[] {
    const perIsland = totalCapital / slotIds.length;
    const percent = 100 / slotIds.length;

    return slotIds.map(slotId => ({
        slotId,
        weight: 1 / slotIds.length,
        allocatedCapital: Math.round(perIsland * 100) / 100,
        percentOfTotal: Math.round(percent * 100) / 100,
        lifetimeBestFitness: 0,
        recentTrend: 0,
    }));
}
