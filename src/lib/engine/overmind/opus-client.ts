// ============================================================
// Learner: Opus Client — Claude Opus 4.6 API Integration
// ============================================================
// Singleton API client with adaptive thinking, token budget
// management, rate limiting, and graceful degradation.
// If no ANTHROPIC_API_KEY is configured, all methods return null.
// ============================================================

import {
    type OvermindConfig,
    type OpusRequestOptions,
    type OpusResponse,
    DEFAULT_OVERMIND_CONFIG,
} from '@/types/overmind';
import { parseOpusResponse } from './response-parser';

// ─── Opus Client ─────────────────────────────────────────────

export class OpusClient {
    private static instance: OpusClient | null = null;

    private apiKey: string | null;
    private model: string;
    private config: OvermindConfig;

    // ── Rate Limiting ────────────────────────────────────────
    private tokensUsedThisHour: number = 0;
    private callsThisHour: number = 0;
    private hourStartTime: number = Date.now();

    // ── Lifetime Stats ───────────────────────────────────────
    private totalTokensUsed: number = 0;
    private totalCallsMade: number = 0;

    // ── Response Cache ───────────────────────────────────────
    private responseCache: Map<string, { response: string; expiresAt: number }> = new Map();
    private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    private constructor(config: Partial<OvermindConfig> = {}) {
        this.config = { ...DEFAULT_OVERMIND_CONFIG, ...config };

        // Wire environment variables → config (Next.js server-side)
        if (typeof process !== 'undefined' && process.env) {
            // OVERMIND_ENABLED: override config.enabled from env
            const envEnabled = process.env.OVERMIND_ENABLED;
            if (envEnabled !== undefined) {
                this.config.enabled = envEnabled === 'true';
            }

            // OVERMIND_MAX_TOKENS_PER_HOUR: override token budget from env
            const envTokenBudget = process.env.OVERMIND_MAX_TOKENS_PER_HOUR;
            if (envTokenBudget !== undefined) {
                const parsed = parseInt(envTokenBudget, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    this.config.maxTokensPerHour = parsed;
                }
            }
        }

        this.model = this.config.model;

        // Read API key from environment — trim whitespace to prevent 401 errors
        const rawKey = typeof process !== 'undefined'
            ? (process.env?.ANTHROPIC_API_KEY ?? null)
            : null;
        this.apiKey = rawKey ? rawKey.trim() : null;
    }

    static getInstance(config?: Partial<OvermindConfig>): OpusClient {
        if (!OpusClient.instance) {
            OpusClient.instance = new OpusClient(config);
        }
        return OpusClient.instance;
    }

    /** Reset singleton — for testing only */
    static resetInstance(): void {
        OpusClient.instance = null;
    }

    // ─── Public API ──────────────────────────────────────────

    /**
     * Check if the Opus client is available (API key configured).
     */
    isAvailable(): boolean {
        return this.apiKey !== null && this.apiKey.length > 0 && this.config.enabled;
    }

    /**
     * Send a prompt to Opus 4.6 and get a raw text response.
     * Returns null if API is not available or budget is exhausted.
     */
    async analyze(
        systemPrompt: string,
        userPrompt: string,
        options: OpusRequestOptions = {},
    ): Promise<OpusResponse | null> {
        if (!this.isAvailable()) {
            return null;
        }

        // Check rate limits
        this.refreshHourlyCounters();
        if (this.tokensUsedThisHour >= this.config.maxTokensPerHour) {
            console.warn('[Overmind] Token budget exhausted for this hour');
            return null;
        }
        if (this.callsThisHour >= this.config.maxCallsPerHour) {
            console.warn('[Overmind] Call rate limit reached for this hour');
            return null;
        }

        // Check cache
        const cacheKey = this.buildCacheKey(systemPrompt, userPrompt);
        const cached = this.responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return {
                content: cached.response,
                rawText: cached.response,
                parseSuccess: true,
                warnings: ['Response from cache'],
                usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 },
                latencyMs: 0,
            };
        }

        const startTime = Date.now();
        const budgetTokens = options.budgetTokens ?? this.config.defaultBudgetTokens;
        const temperature = options.temperature ?? this.config.analyticalTemperature;
        const maxTokens = options.maxTokens ?? 16_000;
        const timeoutMs = options.timeoutMs ?? 120_000;

        try {
            const response = await this.callAnthropicAPI(
                systemPrompt,
                userPrompt,
                budgetTokens,
                temperature,
                maxTokens,
                timeoutMs,
            );

            const latencyMs = Date.now() - startTime;

            // Update counters
            const totalTokens = response.usage.inputTokens + response.usage.outputTokens;
            this.tokensUsedThisHour += totalTokens;
            this.totalTokensUsed += totalTokens;
            this.callsThisHour++;
            this.totalCallsMade++;

            // Cache the response
            this.responseCache.set(cacheKey, {
                response: response.text,
                expiresAt: Date.now() + this.CACHE_TTL_MS,
            });

            return {
                content: response.text,
                rawText: response.text,
                parseSuccess: true,
                warnings: [],
                usage: {
                    inputTokens: response.usage.inputTokens,
                    outputTokens: response.usage.outputTokens,
                    thinkingTokens: response.usage.thinkingTokens,
                    totalTokens,
                },
                latencyMs,
            };
        } catch (error) {
            const latencyMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[Overmind] Opus API error:', errorMessage);

            return {
                content: null,
                rawText: '',
                parseSuccess: false,
                warnings: [`API error: ${errorMessage}`],
                usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 },
                latencyMs,
            };
        }
    }

    /**
     * Send a prompt and parse the response into a typed object.
     * Uses 4-tier JSON extraction from response-parser.
     */
    async analyzeWithSchema<T>(
        systemPrompt: string,
        userPrompt: string,
        validator?: (obj: unknown) => obj is T,
        options: OpusRequestOptions = {},
    ): Promise<OpusResponse<T> | null> {
        const rawResponse = await this.analyze(systemPrompt, userPrompt, options);
        if (!rawResponse || rawResponse.content === null) {
            return rawResponse as OpusResponse<T> | null;
        }

        const { content: parsed, warnings: parseWarnings } = parseOpusResponse<T>(
            rawResponse.rawText,
            validator,
        );

        return {
            content: parsed,
            rawText: rawResponse.rawText,
            parseSuccess: parsed !== null,
            warnings: [...rawResponse.warnings, ...parseWarnings],
            usage: rawResponse.usage,
            latencyMs: rawResponse.latencyMs,
        };
    }

    // ─── Stats ───────────────────────────────────────────────

    getTokensUsedThisHour(): number {
        this.refreshHourlyCounters();
        return this.tokensUsedThisHour;
    }

    getTokenBudgetRemaining(): number {
        this.refreshHourlyCounters();
        return Math.max(0, this.config.maxTokensPerHour - this.tokensUsedThisHour);
    }

    getTotalTokensUsed(): number {
        return this.totalTokensUsed;
    }

    getTotalCallsMade(): number {
        return this.totalCallsMade;
    }

    getEstimatedCostUSD(): number {
        // Approximate pricing: $15/M input + $75/M output
        // Using a blended average of ~$30/M tokens
        return (this.totalTokensUsed / 1_000_000) * 30;
    }

    // ─── Internal Methods ────────────────────────────────────

    private async callAnthropicAPI(
        systemPrompt: string,
        userPrompt: string,
        budgetTokens: number,
        temperature: number,
        maxTokens: number,
        timeoutMs: number,
    ): Promise<{
        text: string;
        usage: { inputTokens: number; outputTokens: number; thinkingTokens: number };
    }> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey!,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: maxTokens,
                    temperature,
                    thinking: {
                        type: 'enabled',
                        budget_tokens: budgetTokens,
                    },
                    system: systemPrompt,
                    messages: [
                        {
                            role: 'user',
                            content: userPrompt,
                        },
                    ],
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => 'Unable to read error body');
                throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
            }

            const data = await response.json();

            // Extract text from content blocks
            let text = '';
            let thinkingTokens = 0;

            if (Array.isArray(data.content)) {
                for (const block of data.content) {
                    if (block.type === 'text') {
                        text += block.text;
                    } else if (block.type === 'thinking') {
                        thinkingTokens += (block.thinking || '').length;
                    }
                }
            }

            return {
                text,
                usage: {
                    inputTokens: data.usage?.input_tokens ?? 0,
                    outputTokens: data.usage?.output_tokens ?? 0,
                    thinkingTokens,
                },
            };
        } finally {
            clearTimeout(timeout);
        }
    }

    private refreshHourlyCounters(): void {
        const now = Date.now();
        if (now - this.hourStartTime >= 60 * 60 * 1000) {
            this.tokensUsedThisHour = 0;
            this.callsThisHour = 0;
            this.hourStartTime = now;
        }
    }

    private buildCacheKey(systemPrompt: string, userPrompt: string): string {
        // Simple hash — use first 100 chars of each + length
        return `${systemPrompt.length}:${systemPrompt.substring(0, 100)}|${userPrompt.length}:${userPrompt.substring(0, 100)}`;
    }
}
