#!/usr/bin/env node

/**
 * Git Guardian — Commit Message Validator
 * ═══════════════════════════════════════
 * Learner AI Trading System
 *
 * Enforces commit message conventions:
 * - Must start with "Phase N:" or a conventional prefix
 * - Minimum 10 characters for meaningful messages
 *
 * Install: node scripts/install-hooks.js
 * Usage:   Automatically runs on `git commit`
 */

const fs = require('fs');

// ─── ANSI Colors ──────────────────────────────────────────────
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ─── Valid Prefixes ───────────────────────────────────────────
const VALID_PREFIXES = [
    /^Phase \d+/i,         // Phase 18: description
    /^feat:/i,             // feat: new feature
    /^fix:/i,              // fix: bug fix
    /^docs:/i,             // docs: documentation
    /^refactor:/i,         // refactor: code improvement
    /^chore:/i,            // chore: maintenance
    /^test:/i,             // test: testing
    /^perf:/i,             // perf: performance
    /^style:/i,            // style: formatting
    /^ci:/i,               // ci: CI/CD changes
    /^build:/i,            // build: build system
    /^revert:/i,           // revert: revert commit
    /^hotfix:/i,           // hotfix: urgent fix
    /^security:/i,         // security: security fix
    /^Merge /i,            // Merge branch/PR (auto-generated)
    /^Initial commit/i,    // Initial commit
];

const MIN_MESSAGE_LENGTH = 10;

function main() {
    // commit-msg hook receives the commit message file path as first argument
    const commitMsgFile = process.argv[2];

    if (!commitMsgFile) {
        console.error(`${RED}Error: No commit message file provided${RESET}`);
        process.exit(1);
    }

    let message;
    try {
        message = fs.readFileSync(commitMsgFile, 'utf8').trim();
    } catch (err) {
        console.error(`${RED}Error reading commit message file: ${err.message}${RESET}`);
        process.exit(1);
    }

    // Extract first line (subject)
    const subject = message.split('\n')[0].trim();

    console.log(`\n${CYAN}╔══════════════════════════════════════════════╗${RESET}`);
    console.log(`${CYAN}║  📝 Git Guardian — Commit Message Validator  ║${RESET}`);
    console.log(`${CYAN}╚══════════════════════════════════════════════╝${RESET}\n`);

    // Check 1: Not empty
    if (!subject || subject.length === 0) {
        console.log(`${RED}${BOLD}❌ Commit message is empty${RESET}\n`);
        process.exit(1);
    }

    // Check 2: Minimum length
    if (subject.length < MIN_MESSAGE_LENGTH) {
        console.log(`${RED}${BOLD}❌ Commit message too short (${subject.length}/${MIN_MESSAGE_LENGTH} chars)${RESET}`);
        console.log(`${DIM}   Message: "${subject}"${RESET}\n`);
        printUsage();
        process.exit(1);
    }

    // Check 3: Valid prefix
    const hasValidPrefix = VALID_PREFIXES.some(regex => regex.test(subject));

    if (!hasValidPrefix) {
        console.log(`${RED}${BOLD}❌ Invalid commit message prefix${RESET}`);
        console.log(`${DIM}   Message: "${subject}"${RESET}\n`);
        printUsage();
        process.exit(1);
    }

    // All checks passed
    console.log(`${GREEN}${BOLD}✅ Commit message valid${RESET}`);
    console.log(`${DIM}   "${subject}"${RESET}\n`);
    process.exit(0);
}

function printUsage() {
    console.log(`${YELLOW}Valid prefixes:${RESET}`);
    console.log(`  ${DIM}Phase N:${RESET}   → Phase 18: Neural Brain Visualization`);
    console.log(`  ${DIM}feat:${RESET}      → feat: add new dashboard panel`);
    console.log(`  ${DIM}fix:${RESET}       → fix: resolve tooltip crash`);
    console.log(`  ${DIM}docs:${RESET}      → docs: update system design`);
    console.log(`  ${DIM}refactor:${RESET}  → refactor: simplify evolution loop`);
    console.log(`  ${DIM}chore:${RESET}     → chore: update dependencies`);
    console.log(`  ${DIM}test:${RESET}      → test: add validation tests`);
    console.log(`  ${DIM}security:${RESET}  → security: rotate API keys`);
    console.log(`  ${DIM}hotfix:${RESET}    → hotfix: fix critical bug\n`);
}

main();
