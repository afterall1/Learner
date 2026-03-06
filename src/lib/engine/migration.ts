// ============================================================
// Learner: Migration Engine — Cross-Island Knowledge Transfer
// ============================================================
// Periodically shares top-performing strategies between related
// islands. Strategies are adapted (re-scoped) before migration.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { StrategyDNA, MigrationEvent, Timeframe } from '@/types';
import { TradingSlot } from '@/types/trading-slot';
import { Island } from './island';

// ─── Configuration ───────────────────────────────────────────

export enum MigrationTopology {
    RING = 'RING',               // Each island sends to next in ring
    STAR = 'STAR',               // Best island broadcasts to all
    NEIGHBORHOOD = 'NEIGHBORHOOD', // Only between similar slots
}

export interface MigrationConfig {
    topology: MigrationTopology;
    generationInterval: number;    // Run migration every N generations
    migrantCount: number;          // Number of strategies to migrate per cycle
    minFitnessForMigration: number; // Minimum fitness score to be eligible for migration
    affinityThreshold: number;     // Minimum affinity to allow migration (0-1)
}

export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
    topology: MigrationTopology.NEIGHBORHOOD,
    generationInterval: 5,
    migrantCount: 1,
    minFitnessForMigration: 30,
    affinityThreshold: 0.3,
};

// ─── Migration Engine ────────────────────────────────────────

export class MigrationEngine {
    private config: MigrationConfig;
    private migrationHistory: MigrationEvent[] = [];
    private cycleCounter: number = 0;

    constructor(config: Partial<MigrationConfig> = {}) {
        this.config = { ...DEFAULT_MIGRATION_CONFIG, ...config };
    }

    /**
     * Run a migration cycle across all active islands.
     * Called periodically by the Cortex after each generation evaluation.
     *
     * Returns a list of migration events that occurred.
     */
    runMigrationCycle(islands: Map<string, Island>): MigrationEvent[] {
        this.cycleCounter++;

        // Only run migration at configured intervals
        if (this.cycleCounter % this.config.generationInterval !== 0) {
            return [];
        }

        const islandArray = Array.from(islands.values());
        if (islandArray.length < 2) return [];

        const events: MigrationEvent[] = [];

        switch (this.config.topology) {
            case MigrationTopology.NEIGHBORHOOD:
                events.push(...this.neighborhoodMigration(islandArray));
                break;
            case MigrationTopology.RING:
                events.push(...this.ringMigration(islandArray));
                break;
            case MigrationTopology.STAR:
                events.push(...this.starMigration(islandArray));
                break;
        }

        this.migrationHistory.push(...events);

        // Keep only last 200 migration events
        if (this.migrationHistory.length > 200) {
            this.migrationHistory = this.migrationHistory.slice(-200);
        }

        return events;
    }

    /**
     * NEIGHBORHOOD topology: Migrate between islands with high affinity.
     * Same pair, different timeframe → high affinity (0.8)
     * Same timeframe, different pair → medium affinity (0.5)
     */
    private neighborhoodMigration(islands: Island[]): MigrationEvent[] {
        const events: MigrationEvent[] = [];

        for (const sourceIsland of islands) {
            const elites = sourceIsland.exportElites(this.config.migrantCount);
            if (elites.length === 0) continue;

            // Only migrate strategies that meet minimum fitness
            const eligibleElites = elites.filter(
                s => s.metadata.fitnessScore >= this.config.minFitnessForMigration
            );
            if (eligibleElites.length === 0) continue;

            // Find target islands with high affinity
            for (const targetIsland of islands) {
                if (targetIsland.slot.id === sourceIsland.slot.id) continue;

                const affinity = calculateMigrationAffinity(sourceIsland.slot, targetIsland.slot);
                if (affinity < this.config.affinityThreshold) continue;

                for (const elite of eligibleElites) {
                    const adapted = adaptMigrant(elite, targetIsland.slot);
                    targetIsland.importMigrants([adapted]);

                    const event: MigrationEvent = {
                        id: uuidv4(),
                        sourceSlotId: sourceIsland.slot.id,
                        targetSlotId: targetIsland.slot.id,
                        strategyName: elite.name,
                        strategyFitness: elite.metadata.fitnessScore,
                        timestamp: Date.now(),
                        migrationAffinity: affinity,
                    };
                    events.push(event);
                }
            }
        }

        return events;
    }

    /**
     * RING topology: Each island sends its best to the next island in order.
     */
    private ringMigration(islands: Island[]): MigrationEvent[] {
        const events: MigrationEvent[] = [];

        for (let i = 0; i < islands.length; i++) {
            const source = islands[i];
            const target = islands[(i + 1) % islands.length];

            const elites = source.exportElites(this.config.migrantCount);
            const eligible = elites.filter(
                s => s.metadata.fitnessScore >= this.config.minFitnessForMigration
            );

            for (const elite of eligible) {
                const adapted = adaptMigrant(elite, target.slot);
                target.importMigrants([adapted]);

                events.push({
                    id: uuidv4(),
                    sourceSlotId: source.slot.id,
                    targetSlotId: target.slot.id,
                    strategyName: elite.name,
                    strategyFitness: elite.metadata.fitnessScore,
                    timestamp: Date.now(),
                    migrationAffinity: calculateMigrationAffinity(source.slot, target.slot),
                });
            }
        }

        return events;
    }

    /**
     * STAR topology: The best-performing island broadcasts its top strategies to all others.
     */
    private starMigration(islands: Island[]): MigrationEvent[] {
        const events: MigrationEvent[] = [];

        // Find the best island
        let bestIsland: Island | null = null;
        let bestFitness = -1;

        for (const island of islands) {
            const fitness = island.getLifetimeBestFitness();
            if (fitness > bestFitness) {
                bestFitness = fitness;
                bestIsland = island;
            }
        }

        if (!bestIsland) return events;

        const elites = bestIsland.exportElites(this.config.migrantCount);
        const eligible = elites.filter(
            s => s.metadata.fitnessScore >= this.config.minFitnessForMigration
        );

        for (const target of islands) {
            if (target.slot.id === bestIsland.slot.id) continue;

            for (const elite of eligible) {
                const adapted = adaptMigrant(elite, target.slot);
                target.importMigrants([adapted]);

                events.push({
                    id: uuidv4(),
                    sourceSlotId: bestIsland.slot.id,
                    targetSlotId: target.slot.id,
                    strategyName: elite.name,
                    strategyFitness: elite.metadata.fitnessScore,
                    timestamp: Date.now(),
                    migrationAffinity: calculateMigrationAffinity(bestIsland.slot, target.slot),
                });
            }
        }

        return events;
    }

    // ─── Getters ─────────────────────────────────────────────────

    getMigrationHistory(): MigrationEvent[] {
        return [...this.migrationHistory];
    }

    getCycleCounter(): number {
        return this.cycleCounter;
    }
}

// ─── Utility Functions ───────────────────────────────────────

/**
 * Calculate migration affinity between two trading slots.
 * Higher affinity = more likely strategies will transfer well.
 *
 * Same pair, different TF → 0.8 (strong transfer)
 * Same TF, different pair → 0.5 (moderate transfer)
 * Same asset class (e.g., both altcoins) → 0.3
 * Different pair and TF → 0.2 (weak transfer)
 */
export function calculateMigrationAffinity(source: TradingSlot, target: TradingSlot): number {
    if (source.id === target.id) return 1.0; // Same slot

    const samePair = source.pair === target.pair;
    const sameTimeframe = source.timeframe === target.timeframe;

    if (samePair && sameTimeframe) return 1.0;
    if (samePair) return 0.8;   // Same pair, different TF
    if (sameTimeframe) return 0.5; // Same TF, different pair

    // Check if pairs are in same "category" (e.g., both top-cap)
    const topCap = ['BTCUSDT', 'ETHUSDT'];
    const midCap = ['BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'];
    const sourceIsTopCap = topCap.includes(source.pair);
    const targetIsTopCap = topCap.includes(target.pair);
    const sourceIsMidCap = midCap.includes(source.pair);
    const targetIsMidCap = midCap.includes(target.pair);

    if ((sourceIsTopCap && targetIsTopCap) || (sourceIsMidCap && targetIsMidCap)) {
        return 0.4; // Same market cap tier
    }

    // Check adjacent timeframes
    const tfOrder: Timeframe[] = [Timeframe.M1, Timeframe.M5, Timeframe.M15, Timeframe.H1, Timeframe.H4, Timeframe.D1];
    const sourceIdx = tfOrder.indexOf(source.timeframe);
    const targetIdx = tfOrder.indexOf(target.timeframe);
    if (Math.abs(sourceIdx - targetIdx) === 1) {
        return 0.3; // Adjacent timeframes
    }

    return 0.2; // Default low affinity
}

/**
 * Adapt a migrant strategy for a new trading slot.
 * Preserves indicator genes and risk genes (transferable knowledge),
 * but resets fitness/trades and re-scopes to the target slot.
 */
export function adaptMigrant(strategy: StrategyDNA, targetSlot: TradingSlot): StrategyDNA {
    const adapted: StrategyDNA = JSON.parse(JSON.stringify(strategy));

    // Re-scope to target slot
    adapted.id = uuidv4 ? uuidv4() : `migrant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    adapted.slotId = targetSlot.id;
    adapted.preferredPairs = [targetSlot.pair];
    adapted.preferredTimeframe = targetSlot.timeframe;

    // Reset performance — must prove itself in new environment
    adapted.metadata.fitnessScore = 0;
    adapted.metadata.tradeCount = 0;
    adapted.metadata.lastEvaluated = null;
    adapted.metadata.validation = null;
    adapted.metadata.mutationHistory = [
        ...strategy.metadata.mutationHistory,
        `migration:${strategy.slotId}→${targetSlot.id}`,
    ];

    // Keep lineage for tracking
    adapted.parentIds = [strategy.id];
    adapted.status = StrategyStatus.PAPER;

    return adapted;
}

// Need StrategyStatus for adaptMigrant
import { StrategyStatus } from '@/types';
