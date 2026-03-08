// ============================================================
// Learner: Neural Impulse Event Bus (NIEB)
// ============================================================
// Radical Innovation — Phase 22
//
// A singleton event emitter that captures discrete engine events
// in real-time and translates them into neuron impulses for the
// holographic brain visualization. This creates sub-second neural
// response to actual engine activity — the brain literally reacts
// to evolution completing, trades being analyzed, regimes shifting.
//
// Architecture:
//   - Ring buffer of last 500 impulses for heatmap history
//   - Subscriber pattern for React hook integration
//   - Activity summary with configurable time window
//   - Zero dependencies on React (pure TypeScript engine module)
//
// Integration:
//   - CortexLiveStore wires engine callbacks → bus.emit()
//   - useBrainLiveData hook subscribes → drives neuron firing
// ============================================================

// ─── Types ───────────────────────────────────────────────────

/** Neuron IDs matching brain/page.tsx layout */
export type NeuronId =
    | 'evolution'
    | 'bayesian'
    | 'metacog'
    | 'kdss'
    | 'saie'
    | 'market'
    | 'forensics'
    | 'replay'
    | 'mapelites'
    | 'regime';

/** A single neural impulse event */
export interface NeuralImpulse {
    /** Which neuron module this impulse targets */
    source: NeuronId;
    /** Intensity of the impulse (0-1) */
    intensity: number;
    /** When this impulse was emitted */
    timestamp: number;
    /** Human-readable label for HUD enrichment */
    label?: string;
    /** Optional metadata for detailed analysis */
    metadata?: Record<string, unknown>;
}

/** Callback type for impulse subscribers */
export type ImpulseSubscriber = (impulse: NeuralImpulse) => void;

/** Summary of neural activity over a time window */
export interface NeuralActivitySummary {
    /** Per-neuron average intensity over the window (0-1) */
    activities: Record<NeuronId, number>;
    /** Total impulses in the window */
    totalImpulses: number;
    /** Most active neuron in the window */
    dominantNeuron: NeuronId;
    /** Impulses per second rate */
    impulsesPerSecond: number;
}

// ─── Constants ───────────────────────────────────────────────

const RING_BUFFER_SIZE = 500;
const DEFAULT_WINDOW_MS = 5000;
const ALL_NEURON_IDS: NeuronId[] = [
    'evolution', 'bayesian', 'metacog', 'kdss', 'saie',
    'market', 'forensics', 'replay', 'mapelites', 'regime',
];

// ─── Neural Impulse Event Bus ────────────────────────────────

export class NeuralImpulseEventBus {
    private impulses: NeuralImpulse[] = [];
    private subscribers: Set<ImpulseSubscriber> = new Set();
    private head = 0; // Ring buffer write head
    private count = 0; // Total impulses ever emitted

    // ─── Emit ────────────────────────────────────────────────

    /**
     * Emit a neural impulse into the bus.
     * All subscribers are notified synchronously.
     * The impulse is stored in the ring buffer for history.
     */
    emit(impulse: NeuralImpulse): void {
        // Clamp intensity to [0, 1]
        const clamped: NeuralImpulse = {
            ...impulse,
            intensity: Math.max(0, Math.min(1, impulse.intensity)),
            timestamp: impulse.timestamp || Date.now(),
        };

        // Ring buffer write
        if (this.impulses.length < RING_BUFFER_SIZE) {
            this.impulses.push(clamped);
        } else {
            this.impulses[this.head] = clamped;
        }
        this.head = (this.head + 1) % RING_BUFFER_SIZE;
        this.count++;

        // Notify all subscribers
        for (const sub of this.subscribers) {
            try {
                sub(clamped);
            } catch (err) {
                console.error('[NIEB] Subscriber error:', err);
            }
        }
    }

    // ─── Convenience Emitters ────────────────────────────────

    /** Emit a simple impulse for a neuron */
    fire(source: NeuronId, intensity: number, label?: string): void {
        this.emit({ source, intensity, timestamp: Date.now(), label });
    }

    /** Emit multiple impulses at once (batch) */
    fireBatch(impulses: Array<{ source: NeuronId; intensity: number; label?: string }>): void {
        const now = Date.now();
        for (const imp of impulses) {
            this.emit({ source: imp.source, intensity: imp.intensity, timestamp: now, label: imp.label });
        }
    }

    // ─── Subscribe / Unsubscribe ─────────────────────────────

    /**
     * Subscribe to all impulse events.
     * Returns an unsubscribe function.
     */
    subscribe(callback: ImpulseSubscriber): () => void {
        this.subscribers.add(callback);
        return () => {
            this.subscribers.delete(callback);
        };
    }

    // ─── Query ───────────────────────────────────────────────

    /**
     * Get all impulses within a time window.
     * @param windowMs - How far back to look (default: 5s)
     */
    getRecentImpulses(windowMs: number = DEFAULT_WINDOW_MS): NeuralImpulse[] {
        const cutoff = Date.now() - windowMs;
        return this.impulses.filter(imp => imp.timestamp >= cutoff);
    }

    /**
     * Get a summary of neural activity over a time window.
     * Returns per-neuron averaged intensity, dominant neuron, and rate.
     */
    getActivitySummary(windowMs: number = DEFAULT_WINDOW_MS): NeuralActivitySummary {
        const recent = this.getRecentImpulses(windowMs);
        const windowSec = windowMs / 1000;

        // Accumulate intensity per neuron
        const sums: Record<string, number> = {};
        const counts: Record<string, number> = {};
        for (const id of ALL_NEURON_IDS) {
            sums[id] = 0;
            counts[id] = 0;
        }

        for (const imp of recent) {
            sums[imp.source] = (sums[imp.source] ?? 0) + imp.intensity;
            counts[imp.source] = (counts[imp.source] ?? 0) + 1;
        }

        // Average intensity per neuron
        const activities: Record<NeuronId, number> = {} as Record<NeuronId, number>;
        let maxActivity = 0;
        let dominantNeuron: NeuronId = 'evolution';

        for (const id of ALL_NEURON_IDS) {
            // Weighted: average intensity × frequency factor
            // A neuron that fires often at medium intensity > one that fires once at high intensity
            const avgIntensity = counts[id] > 0 ? sums[id] / counts[id] : 0;
            const frequencyFactor = Math.min(1, counts[id] / (windowSec * 2)); // Normalize to ~2 fires/sec = max
            const combined = Math.min(1, avgIntensity * 0.6 + frequencyFactor * 0.4);

            activities[id as NeuronId] = combined;

            if (combined > maxActivity) {
                maxActivity = combined;
                dominantNeuron = id as NeuronId;
            }
        }

        return {
            activities,
            totalImpulses: recent.length,
            dominantNeuron,
            impulsesPerSecond: windowSec > 0 ? recent.length / windowSec : 0,
        };
    }

    // ─── Stats ───────────────────────────────────────────────

    /** Total impulses ever emitted (monotonically increasing) */
    getTotalCount(): number {
        return this.count;
    }

    /** Number of active subscribers */
    getSubscriberCount(): number {
        return this.subscribers.size;
    }

    /** Clear all history (for testing/reset) */
    reset(): void {
        this.impulses = [];
        this.head = 0;
        this.count = 0;
    }
}

// ─── Singleton Instance ──────────────────────────────────────

let _instance: NeuralImpulseEventBus | null = null;

/**
 * Get the global Neural Impulse Event Bus singleton.
 * Thread-safe — always returns the same instance.
 */
export function getNeuralImpulseBus(): NeuralImpulseEventBus {
    if (!_instance) {
        _instance = new NeuralImpulseEventBus();
    }
    return _instance;
}

/**
 * Reset the global bus (for testing only).
 */
export function resetNeuralImpulseBus(): void {
    if (_instance) {
        _instance.reset();
    }
    _instance = null;
}
