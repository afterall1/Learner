// ============================================================
// Learner: Reasoning Journal — Full Audit Trail
// ============================================================
// Records every Overmind decision with context and reasoning.
// Tracks outcomes to measure prediction accuracy over time.
// All entries are persisted via PersistenceBridge.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
    type ReasoningEntry,
    type OvermindEventType,
} from '@/types/overmind';
import { type MarketRegime } from '@/types';

// ─── Reasoning Journal ───────────────────────────────────────

export class ReasoningJournal {
    private entries: ReasoningEntry[] = [];
    private readonly maxEntries: number;

    constructor(maxEntries: number = 1000) {
        this.maxEntries = maxEntries;
    }

    // ─── Recording ───────────────────────────────────────────

    /**
     * Record a new reasoning entry with full context.
     */
    recordEntry(
        type: OvermindEventType,
        slotId: string | null,
        context: {
            regime: MarketRegime | null;
            generation: number | null;
            populationSize: number | null;
            bestFitness: number | null;
        },
        reasoning: string,
        confidence: number,
        tokensUsed: number,
    ): ReasoningEntry {
        const entry: ReasoningEntry = {
            id: uuidv4(),
            timestamp: Date.now(),
            type,
            slotId,
            context,
            reasoning,
            confidence: Math.max(0, Math.min(1, confidence)),
            outcomeVerified: false,
            outcomeCorrect: null,
            tokensUsed,
        };

        this.entries.push(entry);

        // Garbage collect old entries
        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(-this.maxEntries);
        }

        return entry;
    }

    /**
     * Track the outcome of a previously recorded reasoning entry.
     */
    trackOutcome(entryId: string, correct: boolean): void {
        const entry = this.entries.find(e => e.id === entryId);
        if (entry) {
            entry.outcomeVerified = true;
            entry.outcomeCorrect = correct;
        }
    }

    // ─── Queries ─────────────────────────────────────────────

    /**
     * Get the most recent N entries.
     */
    getRecentEntries(count: number = 10): ReasoningEntry[] {
        return this.entries.slice(-count);
    }

    /**
     * Get entries filtered by event type.
     */
    getEntriesByType(type: OvermindEventType): ReasoningEntry[] {
        return this.entries.filter(e => e.type === type);
    }

    /**
     * Get entries for a specific island (slotId).
     */
    getEntriesForIsland(slotId: string): ReasoningEntry[] {
        return this.entries.filter(e => e.slotId === slotId);
    }

    /**
     * Get the full reasoning timeline for an island.
     */
    getInsightTimeline(slotId: string, limit: number = 50): ReasoningEntry[] {
        return this.entries
            .filter(e => e.slotId === slotId)
            .slice(-limit);
    }

    /**
     * Get all entries (for persistence).
     */
    getAllEntries(): ReasoningEntry[] {
        return [...this.entries];
    }

    // ─── Analytics ───────────────────────────────────────────

    /**
     * Calculate overall prediction accuracy (verified entries only).
     */
    calculateAccuracy(): number {
        const verified = this.entries.filter(e => e.outcomeVerified);
        if (verified.length === 0) return 0;

        const correct = verified.filter(e => e.outcomeCorrect === true).length;
        return correct / verified.length;
    }

    /**
     * Calculate accuracy by event type.
     */
    calculateAccuracyByType(type: OvermindEventType): number {
        const verified = this.entries.filter(
            e => e.type === type && e.outcomeVerified,
        );
        if (verified.length === 0) return 0;

        const correct = verified.filter(e => e.outcomeCorrect === true).length;
        return correct / verified.length;
    }

    /**
     * Get total tokens used across all entries.
     */
    getTotalTokensUsed(): number {
        return this.entries.reduce((sum, e) => sum + e.tokensUsed, 0);
    }

    /**
     * Get entry count by type.
     */
    getCountByType(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const entry of this.entries) {
            counts[entry.type] = (counts[entry.type] || 0) + 1;
        }
        return counts;
    }

    /**
     * Get average confidence level.
     */
    getAverageConfidence(): number {
        if (this.entries.length === 0) return 0;
        const sum = this.entries.reduce((s, e) => s + e.confidence, 0);
        return sum / this.entries.length;
    }

    // ─── State Management ────────────────────────────────────

    /**
     * Load entries from persistence (called on startup).
     */
    loadEntries(entries: ReasoningEntry[]): void {
        this.entries = entries.slice(-this.maxEntries);
    }

    /**
     * Get total entry count.
     */
    getEntryCount(): number {
        return this.entries.length;
    }

    /**
     * Clear all entries (for testing).
     */
    clear(): void {
        this.entries = [];
    }
}
