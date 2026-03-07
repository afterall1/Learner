// ============================================================
// Learner: Response Parser — 4-Tier JSON Extraction
// ============================================================
// Extracts structured JSON from Opus 4.6 responses.
// Uses a 4-tier strategy: direct JSON → code block → regex → partial.
// Never throws — returns partial results with warnings.
// ============================================================

// ─── 4-Tier Response Parser ──────────────────────────────────

/**
 * Parse an Opus response string into a typed object using 4-tier extraction.
 *
 * Tier 1: Direct JSON parse (pure JSON response)
 * Tier 2: Extract from markdown code block (```json ... ```)
 * Tier 3: Regex extraction of JSON objects/arrays
 * Tier 4: Return null with warnings
 */
export function parseOpusResponse<T>(
    rawText: string,
    validator?: (obj: unknown) => obj is T,
): { content: T | null; warnings: string[] } {
    const warnings: string[] = [];

    if (!rawText || rawText.trim().length === 0) {
        return { content: null, warnings: ['Empty response from Opus'] };
    }

    // ── Tier 1: Direct JSON parse ────────────────────────────
    const tier1 = tryDirectParse<T>(rawText, validator);
    if (tier1 !== null) {
        return { content: tier1, warnings };
    }

    // ── Tier 2: Extract from markdown code block ─────────────
    const tier2 = tryCodeBlockExtract<T>(rawText, validator);
    if (tier2 !== null) {
        warnings.push('Extracted JSON from markdown code block (Tier 2)');
        return { content: tier2, warnings };
    }

    // ── Tier 3: Regex extraction of JSON objects/arrays ──────
    const tier3 = tryRegexExtract<T>(rawText, validator);
    if (tier3 !== null) {
        warnings.push('Extracted JSON via regex pattern matching (Tier 3)');
        return { content: tier3, warnings };
    }

    // ── Tier 4: Failed extraction ────────────────────────────
    warnings.push('All 4 extraction tiers failed');
    warnings.push(`Raw response starts with: "${rawText.substring(0, 200)}..."`);
    return { content: null, warnings };
}

// ─── Tier 1: Direct JSON Parse ───────────────────────────────

function tryDirectParse<T>(
    text: string,
    validator?: (obj: unknown) => obj is T,
): T | null {
    try {
        const trimmed = text.trim();
        // Only attempt if it looks like JSON
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            return null;
        }
        const parsed = JSON.parse(trimmed);
        if (validator && !validator(parsed)) {
            return null;
        }
        return parsed as T;
    } catch {
        return null;
    }
}

// ─── Tier 2: Code Block Extraction ───────────────────────────

function tryCodeBlockExtract<T>(
    text: string,
    validator?: (obj: unknown) => obj is T,
): T | null {
    // Match ```json ... ``` or ``` ... ```
    const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
        const blockContent = match[1].trim();
        try {
            const parsed = JSON.parse(blockContent);
            if (validator && !validator(parsed)) {
                continue;
            }
            return parsed as T;
        } catch {
            continue;
        }
    }

    return null;
}

// ─── Tier 3: Regex JSON Extraction ───────────────────────────

function tryRegexExtract<T>(
    text: string,
    validator?: (obj: unknown) => obj is T,
): T | null {
    // Try to find JSON objects
    const objectMatches = findJsonObjects(text);
    for (const candidate of objectMatches) {
        try {
            const parsed = JSON.parse(candidate);
            if (validator && !validator(parsed)) {
                continue;
            }
            return parsed as T;
        } catch {
            continue;
        }
    }

    // Try to find JSON arrays
    const arrayMatches = findJsonArrays(text);
    for (const candidate of arrayMatches) {
        try {
            const parsed = JSON.parse(candidate);
            if (validator && !validator(parsed)) {
                continue;
            }
            return parsed as T;
        } catch {
            continue;
        }
    }

    return null;
}

/**
 * Find potential JSON object substrings by matching balanced braces.
 */
function findJsonObjects(text: string): string[] {
    const results: string[] = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (text[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                results.push(text.substring(start, i + 1));
                start = -1;
            }
        }
    }

    return results;
}

/**
 * Find potential JSON array substrings by matching balanced brackets.
 */
function findJsonArrays(text: string): string[] {
    const results: string[] = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '[') {
            if (depth === 0) start = i;
            depth++;
        } else if (text[i] === ']') {
            depth--;
            if (depth === 0 && start !== -1) {
                results.push(text.substring(start, i + 1));
                start = -1;
            }
        }
    }

    return results;
}

// ─── Type Guards ─────────────────────────────────────────────

export function isNonNullObject(obj: unknown): obj is Record<string, unknown> {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

export function isArrayOf<T>(
    arr: unknown,
    itemGuard: (item: unknown) => item is T,
): arr is T[] {
    return Array.isArray(arr) && arr.every(itemGuard);
}

export function hasRequiredFields(
    obj: unknown,
    fields: string[],
): obj is Record<string, unknown> {
    if (!isNonNullObject(obj)) return false;
    return fields.every(field => field in obj);
}

// ─── Specialized Validators ─────────────────────────────────

export function isHypothesisArray(obj: unknown): obj is Array<{
    hypothesis: string;
    confidence: number;
    evidence: unknown[];
}> {
    if (!Array.isArray(obj)) return false;
    return obj.every(
        item =>
            isNonNullObject(item) &&
            typeof item.hypothesis === 'string' &&
            typeof item.confidence === 'number',
    );
}

export function isDirectiveObject(obj: unknown): obj is {
    analysis: string;
    populationHealth: unknown;
    mutations: unknown[];
} {
    return (
        isNonNullObject(obj) &&
        typeof obj.analysis === 'string' &&
        'populationHealth' in obj
    );
}

export function isAdversarialArray(obj: unknown): obj is Array<{
    name: string;
    description: string;
    conditions: unknown[];
    severity: string;
}> {
    if (!Array.isArray(obj)) return false;
    return obj.every(
        item =>
            isNonNullObject(item) &&
            typeof item.name === 'string' &&
            typeof item.description === 'string',
    );
}

export function isEmergentIndicatorArray(obj: unknown): obj is Array<{
    name: string;
    description: string;
    formula: string;
}> {
    if (!Array.isArray(obj)) return false;
    return obj.every(
        item =>
            isNonNullObject(item) &&
            typeof item.name === 'string' &&
            typeof item.formula === 'string',
    );
}

export function isRSRDObject(obj: unknown): obj is {
    selectedAtoms: unknown[];
    compatibilityReasoning: string;
} {
    return (
        isNonNullObject(obj) &&
        Array.isArray(obj.selectedAtoms) &&
        typeof obj.compatibilityReasoning === 'string'
    );
}
