#!/usr/bin/env node

/**
 * Git Guardian — 3-Gate Pre-Commit Hook
 * ══════════════════════════════════════
 * Learner AI Trading System
 *
 * Gate 1: Secret Scanner — blocks commits containing API keys/tokens
 * Gate 2: Build Artifact Guard — blocks commits with build artifacts
 * Gate 3: Context DNA Drift Warning — warns if memory docs are stale
 *
 * Install: node scripts/install-hooks.js
 * Usage:   Automatically runs on `git commit`
 */

const { execSync } = require('child_process');
const path = require('path');

// ─── ANSI Colors ──────────────────────────────────────────────
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ─── Gate Results ─────────────────────────────────────────────
let totalBlocked = 0;
let totalWarnings = 0;

function printBanner() {
    console.log(`\n${CYAN}╔══════════════════════════════════════════════╗${RESET}`);
    console.log(`${CYAN}║  🛡️  Git Guardian — Pre-Commit Validation    ║${RESET}`);
    console.log(`${CYAN}╚══════════════════════════════════════════════╝${RESET}\n`);
}

function getStagedFiles() {
    try {
        const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return output.trim().split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

function getStagedFileContent(filePath) {
    try {
        return execSync(`git show :${filePath}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    } catch {
        return '';
    }
}

// ─── Gate 1: Secret Scanner ────────────────────────────────────
function gate1SecretScanner(stagedFiles) {
    console.log(`${BOLD}Gate 1: Secret Scanner${RESET}`);

    const SECRET_PATTERNS = [
        // AWS
        { regex: /AKIA[0-9A-Z]{16}/g, label: 'AWS Access Key' },
        // GitHub
        { regex: /ghp_[a-zA-Z0-9]{36}/g, label: 'GitHub Personal Access Token' },
        { regex: /gho_[a-zA-Z0-9]{36}/g, label: 'GitHub OAuth Token' },
        { regex: /ghs_[a-zA-Z0-9]{36}/g, label: 'GitHub App Token' },
        // Anthropic
        { regex: /sk-ant-[a-zA-Z0-9\-_]{40,}/g, label: 'Anthropic API Key' },
        // OpenAI
        { regex: /sk-[a-zA-Z0-9]{20,}/g, label: 'OpenAI-style API Key' },
        // Generic private keys
        { regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, label: 'Private Key' },
        // Generic long hex/base64 secrets (64+ chars preceded by key-like variable names)
        { regex: /(?:api_?key|api_?secret|password|token|secret)\s*[:=]\s*['"]?[A-Za-z0-9+/=]{40,}['"]?/gi, label: 'Potential Secret Assignment' },
    ];

    // Files to skip during secret scanning
    const SKIP_EXTENSIONS = ['.svg', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.woff', '.woff2', '.ttf', '.eot'];
    const SKIP_FILES = ['package-lock.json', '.agent/skill-map.json', '_FINGERPRINT.json'];

    let blocked = 0;

    for (const file of stagedFiles) {
        const ext = path.extname(file).toLowerCase();
        const basename = path.basename(file);

        // Skip binary/large files and known safe files
        if (SKIP_EXTENSIONS.includes(ext) || SKIP_FILES.includes(basename)) {
            continue;
        }

        const content = getStagedFileContent(file);
        if (!content) continue;

        for (const { regex, label } of SECRET_PATTERNS) {
            // Reset regex state for global patterns
            regex.lastIndex = 0;
            const matches = content.match(regex);
            if (matches) {
                // Check if this is in a comment or example context
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    regex.lastIndex = 0;
                    if (regex.test(lines[i])) {
                        const trimmed = lines[i].trim();
                        // Skip lines that are clearly comments/documentation
                        if (trimmed.startsWith('//') && trimmed.includes('example')) continue;
                        if (trimmed.startsWith('#') && trimmed.includes('example')) continue;
                        if (trimmed.startsWith('*') && trimmed.includes('example')) continue;

                        console.log(`  ${RED}❌ BLOCKED${RESET} ${file}:${i + 1}`);
                        console.log(`     ${DIM}Pattern: ${label}${RESET}`);
                        console.log(`     ${DIM}Line: ${trimmed.substring(0, 80)}${trimmed.length > 80 ? '...' : ''}${RESET}`);
                        blocked++;
                    }
                }
            }
        }
    }

    if (blocked === 0) {
        console.log(`  ${GREEN}✓ No secrets detected${RESET}\n`);
    } else {
        console.log(`\n  ${RED}${BOLD}✗ ${blocked} potential secret(s) found — commit blocked${RESET}\n`);
        totalBlocked += blocked;
    }
}

// ─── Gate 2: Build Artifact Guard ──────────────────────────────
function gate2ArtifactGuard(stagedFiles) {
    console.log(`${BOLD}Gate 2: Build Artifact Guard${RESET}`);

    const BLOCKED_PATTERNS = [
        { pattern: /\.tsbuildinfo$/i, label: 'TypeScript build info' },
        { pattern: /^build_errors\.txt$/i, label: 'Build error log' },
        { pattern: /^\.next\//i, label: 'Next.js build output' },
        { pattern: /^\.vercel\//i, label: 'Vercel deployment cache' },
        { pattern: /^coverage\//i, label: 'Test coverage output' },
        { pattern: /^out\//i, label: 'Static export output' },
        { pattern: /^build\//i, label: 'Production build output' },
        { pattern: /npm-debug\.log/i, label: 'NPM debug log' },
        { pattern: /yarn-debug\.log/i, label: 'Yarn debug log' },
        { pattern: /yarn-error\.log/i, label: 'Yarn error log' },
        { pattern: /\.env\.local$/i, label: 'Local env file (secrets!)' },
        { pattern: /\.env\.production$/i, label: 'Production env file' },
        { pattern: /\.env\.development$/i, label: 'Development env file' },
    ];

    let blocked = 0;

    for (const file of stagedFiles) {
        for (const { pattern, label } of BLOCKED_PATTERNS) {
            if (pattern.test(file)) {
                console.log(`  ${RED}❌ BLOCKED${RESET} ${file}`);
                console.log(`     ${DIM}Reason: ${label} should not be committed${RESET}`);
                blocked++;
                break;
            }
        }
    }

    if (blocked === 0) {
        console.log(`  ${GREEN}✓ No build artifacts detected${RESET}\n`);
    } else {
        console.log(`\n  ${RED}${BOLD}✗ ${blocked} build artifact(s) found — commit blocked${RESET}\n`);
        totalBlocked += blocked;
    }
}

// ─── Gate 3: Context DNA Drift Warning ─────────────────────────
function gate3ContextDNA() {
    console.log(`${BOLD}Gate 3: Context DNA Drift Check${RESET}`);

    const fingerprintScript = path.join(__dirname, '..', 'memory', 'scripts', 'context-fingerprint.js');

    try {
        // Check if fingerprint script exists
        require('fs').accessSync(fingerprintScript);

        const output = execSync(`node "${fingerprintScript}" --verify`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 15000,
        });

        // Check if output indicates drift
        if (output.includes('DRIFT DETECTED') || output.includes('DRIFT')) {
            // Extract issue count
            const issueMatch = output.match(/(\d+)\s+issue/);
            const issueCount = issueMatch ? issueMatch[1] : '?';

            console.log(`  ${YELLOW}⚠️  WARNING: Context DNA drift detected (${issueCount} issue(s))${RESET}`);
            console.log(`  ${DIM}   Run: node memory/scripts/context-fingerprint.js --verify${RESET}`);
            console.log(`  ${DIM}   Consider running /memory-sync before committing${RESET}\n`);
            totalWarnings++;
        } else if (output.includes('VALID') || output.includes('✓')) {
            console.log(`  ${GREEN}✓ Context DNA is in sync${RESET}\n`);
        } else {
            console.log(`  ${GREEN}✓ Fingerprint check completed${RESET}\n`);
        }
    } catch (err) {
        // Non-blocking — if script doesn't exist or fails, just warn
        console.log(`  ${YELLOW}⚠️  Could not run fingerprint check${RESET}`);
        console.log(`  ${DIM}   ${err.message || 'Script not found'}${RESET}\n`);
        totalWarnings++;
    }
}

// ─── Main Execution ───────────────────────────────────────────
function main() {
    printBanner();

    const stagedFiles = getStagedFiles();

    if (stagedFiles.length === 0) {
        console.log(`${DIM}No staged files to check.${RESET}\n`);
        process.exit(0);
    }

    console.log(`${DIM}Scanning ${stagedFiles.length} staged file(s)...${RESET}\n`);

    // Run all 3 gates
    gate1SecretScanner(stagedFiles);
    gate2ArtifactGuard(stagedFiles);
    gate3ContextDNA();

    // Final verdict
    console.log(`${CYAN}──────────────────────────────────────────────${RESET}`);

    if (totalBlocked > 0) {
        console.log(`\n${RED}${BOLD}🚫 COMMIT BLOCKED — ${totalBlocked} issue(s) must be resolved${RESET}`);
        console.log(`${DIM}Fix the issues above and try again.${RESET}\n`);
        process.exit(1);
    }

    if (totalWarnings > 0) {
        console.log(`\n${YELLOW}${BOLD}⚠️  COMMIT ALLOWED with ${totalWarnings} warning(s)${RESET}`);
        console.log(`${DIM}Consider addressing the warnings above.${RESET}\n`);
        process.exit(0);
    }

    console.log(`\n${GREEN}${BOLD}✅ All gates passed — commit allowed${RESET}\n`);
    process.exit(0);
}

main();
