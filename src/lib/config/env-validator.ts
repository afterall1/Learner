// ============================================================
// Learner: Environment Validator — Fail-Fast Boot Configuration
// ============================================================
// Production-grade environment validation. Validates all required
// env vars at app boot and returns a typed object so consumers
// never touch process.env directly.
//
// Usage:
//   import { getEnv } from '@/lib/config/env-validator';
//   const env = getEnv();
//   console.log(env.binance.apiKey);
// ============================================================

// ─── Validated Environment Types ────────────────────────────

export interface ValidatedBinanceEnv {
    apiKey: string;
    apiSecret: string;
    isTestnet: boolean;
}

export interface ValidatedSupabaseEnv {
    url: string;
    anonKey: string;
}

export interface ValidatedOvermindEnv {
    enabled: boolean;
    apiKey: string;
    maxTokensPerHour: number;
}

export interface ValidatedEnv {
    binance: ValidatedBinanceEnv;
    supabase: ValidatedSupabaseEnv;
    overmind: ValidatedOvermindEnv;
    nodeEnv: string;
    isProduction: boolean;
}

// ─── Validation Errors ──────────────────────────────────────

export class EnvValidationError extends Error {
    constructor(
        public readonly missingVars: string[],
        public readonly warnings: string[],
    ) {
        const msg = [
            `[EnvValidator] ❌ ${missingVars.length} missing environment variable(s):`,
            ...missingVars.map(v => `  • ${v}`),
            ...(warnings.length > 0 ? ['\n⚠️ Warnings:', ...warnings.map(w => `  • ${w}`)] : []),
        ].join('\n');
        super(msg);
        this.name = 'EnvValidationError';
    }
}

// ─── Core Validator ─────────────────────────────────────────

/**
 * Validate all required environment variables.
 * Throws EnvValidationError if any required vars are missing.
 * Returns a typed, validated environment object.
 */
export function validateEnvironment(): ValidatedEnv {
    const missing: string[] = [];
    const warnings: string[] = [];

    // ─── Binance ─────────────────────────────────────────
    const binanceApiKey = process.env.BINANCE_API_KEY ?? '';
    const binanceApiSecret = process.env.BINANCE_API_SECRET ?? '';
    const binanceTestnet = process.env.BINANCE_TESTNET;

    if (!binanceApiKey) missing.push('BINANCE_API_KEY');
    if (!binanceApiSecret) missing.push('BINANCE_API_SECRET');

    // Validate key format (Binance keys are 64-char alphanumeric)
    if (binanceApiKey && !/^[A-Za-z0-9]{20,}$/.test(binanceApiKey)) {
        warnings.push('BINANCE_API_KEY format looks invalid (expected 64-char alphanumeric)');
    }

    // Testnet safety check
    const isTestnet = binanceTestnet !== 'false';
    if (!isTestnet) {
        warnings.push('🚨 BINANCE_TESTNET=false — LIVE MAINNET MODE ENABLED. Real funds at risk!');
    }

    // ─── Supabase ────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

    if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    // Validate Supabase URL format
    if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
        warnings.push('NEXT_PUBLIC_SUPABASE_URL should be an HTTPS URL');
    }

    // ─── Overmind (Claude Opus) ──────────────────────────
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
    const overmindEnabled = process.env.OVERMIND_ENABLED === 'true';
    const overmindTokens = parseInt(process.env.OVERMIND_MAX_TOKENS_PER_HOUR ?? '0', 10);

    if (overmindEnabled && !anthropicKey) {
        missing.push('ANTHROPIC_API_KEY (required when OVERMIND_ENABLED=true)');
    }

    if (overmindEnabled && overmindTokens <= 0) {
        warnings.push('OVERMIND_MAX_TOKENS_PER_HOUR is 0 or not set — Overmind will be rate-limited');
    }

    // ─── Fail fast on missing ────────────────────────────
    if (missing.length > 0) {
        throw new EnvValidationError(missing, warnings);
    }

    // Log warnings even on success
    if (warnings.length > 0) {
        for (const w of warnings) {
            console.warn(`[EnvValidator] ⚠️ ${w}`);
        }
    }

    console.log(
        `[EnvValidator] ✅ Environment validated — ` +
        `Binance: ${isTestnet ? 'TESTNET' : '🚨 MAINNET'}, ` +
        `Supabase: OK, ` +
        `Overmind: ${overmindEnabled ? 'ON' : 'OFF'}`,
    );

    return {
        binance: {
            apiKey: binanceApiKey,
            apiSecret: binanceApiSecret,
            isTestnet,
        },
        supabase: {
            url: supabaseUrl,
            anonKey: supabaseKey,
        },
        overmind: {
            enabled: overmindEnabled,
            apiKey: anthropicKey,
            maxTokensPerHour: overmindTokens || 100000,
        },
        nodeEnv: process.env.NODE_ENV ?? 'development',
        isProduction: process.env.NODE_ENV === 'production',
    };
}

// ─── Singleton Cache ────────────────────────────────────────

let cachedEnv: ValidatedEnv | null = null;

/**
 * Get the validated environment (lazy singleton).
 * First call validates; subsequent calls return cached result.
 */
export function getEnv(): ValidatedEnv {
    if (!cachedEnv) {
        cachedEnv = validateEnvironment();
    }
    return cachedEnv;
}

/**
 * Reset cached env (for testing only).
 */
export function resetEnvCache(): void {
    cachedEnv = null;
}
