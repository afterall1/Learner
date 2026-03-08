// ============================================================
// Learner: Structured Logger — Production-Grade Logging System
// ============================================================
// Phase 29 — Production Deployment Preparation
//
// PURPOSE: Replace raw console.log calls with a structured,
// environment-aware logging system. Every log has:
//   - Module tag ([CortexLive], [BinanceWS], etc.)
//   - Log level (DEBUG, INFO, WARN, ERROR)
//   - ISO 8601 timestamp
//   - Production suppression (DEBUG silent in prod)
//
// USAGE:
//   import { createLogger } from '@/lib/utils/logger';
//   const log = createLogger('CortexLive');
//   log.info('Engine started', { islands: 5 });
//   log.warn('High latency detected', { ms: 450 });
//   log.error('WebSocket disconnected', { code: 1006 });
//   log.debug('Candle processed', { pair: 'BTCUSDT' });
// ============================================================

// ─── Types ──────────────────────────────────────────────────

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    data?: Record<string, unknown>;
}

export interface Logger {
    debug: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
    /** Get the module name this logger was created for */
    readonly module: string;
}

// ─── Level Hierarchy ────────────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

// ─── ANSI Colors (dev only) ─────────────────────────────────

const COLORS: Record<LogLevel, string> = {
    DEBUG: '\x1b[36m',  // cyan
    INFO: '\x1b[32m',   // green
    WARN: '\x1b[33m',   // yellow
    ERROR: '\x1b[31m',  // red
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

// ─── Emoji Prefixes ─────────────────────────────────────────

const LEVEL_EMOJI: Record<LogLevel, string> = {
    DEBUG: '🔍',
    INFO: '✅',
    WARN: '⚠️',
    ERROR: '❌',
};

// ─── Environment Detection ──────────────────────────────────

function isProduction(): boolean {
    return typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
}

function isBrowser(): boolean {
    return typeof window !== 'undefined';
}

/**
 * Get minimum log level based on environment.
 * Production: INFO (suppresses DEBUG)
 * Development: DEBUG (shows everything)
 */
function getMinLevel(): LogLevel {
    if (isProduction()) return 'INFO';
    return 'DEBUG';
}

// ─── Core Log Function ─────────────────────────────────────

function formatLogEntry(entry: LogEntry): string {
    const { timestamp, level, module, message, data } = entry;

    // Browser or production: simple format
    if (isBrowser() || isProduction()) {
        const dataStr = data ? ` ${JSON.stringify(data)}` : '';
        return `${LEVEL_EMOJI[level]} [${module}] ${message}${dataStr}`;
    }

    // Server dev: colored format with timestamp
    const timeStr = `${DIM}${timestamp}${RESET}`;
    const levelStr = `${COLORS[level]}${BOLD}${level.padEnd(5)}${RESET}`;
    const moduleStr = `${COLORS[level]}[${module}]${RESET}`;
    const dataStr = data ? ` ${DIM}${JSON.stringify(data)}${RESET}` : '';

    return `${timeStr} ${levelStr} ${moduleStr} ${message}${dataStr}`;
}

function shouldLog(level: LogLevel): boolean {
    const minLevel = getMinLevel();
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function emitLog(entry: LogEntry): void {
    if (!shouldLog(entry.level)) return;

    const formatted = formatLogEntry(entry);

    switch (entry.level) {
        case 'DEBUG':
            console.debug(formatted);
            break;
        case 'INFO':
            console.info(formatted);
            break;
        case 'WARN':
            console.warn(formatted);
            break;
        case 'ERROR':
            console.error(formatted);
            break;
    }
}

// ─── Logger Factory ─────────────────────────────────────────

/**
 * Create a structured logger for a specific module.
 *
 * @param module Module name (e.g., 'CortexLive', 'BinanceWS', 'RiskManager')
 * @returns Logger instance with debug/info/warn/error methods
 *
 * @example
 * const log = createLogger('CortexLive');
 * log.info('Engine started', { islands: 5 });
 * log.error('Connection lost', { reason: 'timeout' });
 */
export function createLogger(module: string): Logger {
    const makeLogFn = (level: LogLevel) => {
        return (message: string, data?: Record<string, unknown>): void => {
            emitLog({
                timestamp: new Date().toISOString(),
                level,
                module,
                message,
                data,
            });
        };
    };

    return {
        debug: makeLogFn('DEBUG'),
        info: makeLogFn('INFO'),
        warn: makeLogFn('WARN'),
        error: makeLogFn('ERROR'),
        get module() {
            return module;
        },
    };
}

// ─── Pre-built Loggers (convenience) ────────────────────────

/** Logger for CortexLiveEngine */
export const cortexLog = createLogger('CortexLive');

/** Logger for Binance REST API */
export const binanceLog = createLogger('BinanceREST');

/** Logger for Binance WebSocket */
export const wsLog = createLogger('BinanceWS');

/** Logger for Risk Manager */
export const riskLog = createLogger('RiskManager');

/** Logger for Persistence Bridge */
export const persistenceLog = createLogger('Persistence');

/** Logger for LiveTradeExecutor */
export const tradeLog = createLogger('LiveTrade');

/** Logger for Evolution Scheduler */
export const evolutionLog = createLogger('Evolution');

/** Logger for ADFI (Adaptive Data Flow) */
export const adfiLog = createLogger('ADFI');

/** Logger for CIRPN (Regime Propagation) */
export const cirpnLog = createLogger('CIRPN');

/** Logger for User Data Stream */
export const userDataLog = createLogger('UserData');

/** Logger for Circuit Breaker */
export const circuitLog = createLogger('CircuitBreaker');

/** Logger for Account Sync */
export const accountLog = createLogger('AccountSync');

/** Logger for Order Lifecycle */
export const orderLog = createLogger('OrderLifecycle');

/** Logger for Deployment Sentinel */
export const sentinelLog = createLogger('Sentinel');

/** Logger for Stress Matrix */
export const stressLog = createLogger('StressMatrix');

/** Logger for Evolution Scheduler */
export const schedulerLog = createLogger('EvolutionScheduler');

/** Logger for System Bootstrap */
export const bootLog = createLogger('SystemBoot');

