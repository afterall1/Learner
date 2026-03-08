#!/usr/bin/env node

/**
 * Test↔Memory Cross-Validator (Radical Innovation - Phase 22)
 *
 * Performs 5-phase semantic cross-validation between:
 *   1. Vitest test files ↔ file_map.md (documentation coverage)
 *   2. Critical (🔴) source files ↔ test files (test coverage)
 *   3. ADR references ↔ existing ADR files (ADR integrity)
 *   4. Changelog version ↔ active_context phase (version sync)
 *   5. Test count in memory docs ↔ actual test count (metric accuracy)
 *
 * Usage:   node scripts/test-memory-validator.js
 * Output:  Coverage report + integrity score (0-100%)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MEMORY = path.join(ROOT, 'memory');
const SRC = path.join(ROOT, 'src');

// ─── Colors ──────────────────────────────────────────────────
const C = {
    R: '\x1b[31m', G: '\x1b[32m', Y: '\x1b[33m',
    B: '\x1b[34m', M: '\x1b[35m', C: '\x1b[36m',
    W: '\x1b[97m', D: '\x1b[90m', X: '\x1b[0m',
    BG: '\x1b[42m', BR: '\x1b[41m', BY: '\x1b[43m',
};

function header(title) {
    console.log(`\n${C.C}${'═'.repeat(60)}${C.X}`);
    console.log(`${C.W}  ${title}${C.X}`);
    console.log(`${C.C}${'═'.repeat(60)}${C.X}\n`);
}

function pass(msg) { console.log(`  ${C.G}✓${C.X} ${msg}`); }
function fail(msg) { console.log(`  ${C.R}✗${C.X} ${msg}`); }
function warn(msg) { console.log(`  ${C.Y}⚠${C.X} ${msg}`); }
function info(msg) { console.log(`  ${C.D}ℹ${C.X} ${msg}`); }

// ─── Helpers ─────────────────────────────────────────────────

function findFiles(dir, pattern, results = []) {
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.next') continue;
            findFiles(full, pattern, results);
        } else if (pattern.test(entry.name)) {
            results.push(full.replace(ROOT + path.sep, '').replace(/\\/g, '/'));
        }
    }
    return results;
}

function readSafe(filePath) {
    try { return fs.readFileSync(filePath, 'utf-8'); } catch { return ''; }
}

// ─── Phase 1: Test Files ↔ file_map.md ──────────────────────

function phase1_testFileDocumentation() {
    header('Phase 1: Test File Documentation Coverage');

    const testFiles = findFiles(SRC, /\.test\.(ts|tsx)$/);
    const fileMap = readSafe(path.join(MEMORY, 'file_map.md'));

    let documented = 0;
    let undocumented = 0;

    for (const tf of testFiles) {
        const basename = path.basename(tf);
        if (fileMap.includes(basename)) {
            pass(`${basename} documented in file_map.md`);
            documented++;
        } else {
            fail(`${basename} NOT in file_map.md`);
            undocumented++;
        }
    }

    if (testFiles.length === 0) {
        warn('No test files found');
        return { score: 0, total: 0 };
    }

    const score = Math.round((documented / testFiles.length) * 100);
    info(`${documented}/${testFiles.length} test files documented (${score}%)`);
    return { score, total: testFiles.length };
}

// ─── Phase 2: Critical Files ↔ Test Coverage ─────────────────

function phase2_criticalFileCoverage() {
    header('Phase 2: Critical File Test Coverage');

    const fileMap = readSafe(path.join(MEMORY, 'file_map.md'));
    const testFiles = findFiles(SRC, /\.test\.(ts|tsx)$/);
    const testContent = testFiles.map(f => readSafe(path.join(ROOT, f))).join('\n');

    // Extract 🔴 Critical files from file_map.md
    const criticalPattern = /\|\s*`([^`]+)`\s*\|[^|]*\|\s*🔴\s*\|/g;
    const criticals = [];
    let match;
    while ((match = criticalPattern.exec(fileMap)) !== null) {
        criticals.push(match[1]);
    }

    let covered = 0;
    let uncovered = 0;

    for (const cf of criticals) {
        const baseName = cf.replace('.ts', '').replace('.tsx', '');
        // Check if any test file imports or references this module
        const referenced = testContent.includes(baseName) ||
            testContent.includes(`/${cf}`) ||
            testContent.includes(`'@/lib/risk/manager'`) && cf === 'manager.ts' ||
            testContent.includes(`'@/lib/engine/cortex'`) && cf === 'cortex.ts';

        if (referenced) {
            pass(`${cf} has test coverage`);
            covered++;
        } else {
            warn(`${cf} no test coverage (consider adding tests)`);
            uncovered++;
        }
    }

    if (criticals.length === 0) {
        warn('No critical files found in file_map.md');
        return { score: 0, total: 0, covered, uncovered };
    }

    const score = Math.round((covered / criticals.length) * 100);
    info(`${covered}/${criticals.length} critical files have test coverage (${score}%)`);
    return { score, total: criticals.length, covered, uncovered };
}

// ─── Phase 3: ADR Reference Integrity ────────────────────────

function phase3_adrIntegrity() {
    header('Phase 3: ADR Reference Integrity');

    const adrDir = path.join(MEMORY, 'adr');
    if (!fs.existsSync(adrDir)) {
        warn('ADR directory not found');
        return { score: 0, total: 0 };
    }

    const adrFiles = fs.readdirSync(adrDir).filter(f => f.endsWith('.md'));
    const syncWorkflow = readSafe(path.join(ROOT, '.agent', 'workflows', 'memory-sync.md'));
    const reloadWorkflow = readSafe(path.join(ROOT, '.agent', 'workflows', 'memory-reload.md'));
    const allWorkflows = syncWorkflow + '\n' + reloadWorkflow;

    let referenced = 0;
    let orphaned = 0;

    for (const adr of adrFiles) {
        // Extract ADR number
        const numMatch = adr.match(/(\d{3})/);
        if (!numMatch) continue;
        const adrNum = parseInt(numMatch[1]);
        const adrRef = `ADR-${String(adrNum).padStart(3, '0')}`;

        if (allWorkflows.includes(adrRef)) {
            pass(`${adrRef} referenced in workflows`);
            referenced++;
        } else {
            fail(`${adrRef} (${adr}) NOT referenced in any workflow`);
            orphaned++;
        }
    }

    const total = referenced + orphaned;
    const score = total > 0 ? Math.round((referenced / total) * 100) : 100;
    info(`${referenced}/${total} ADRs referenced in workflows (${score}%)`);
    return { score, total };
}

// ─── Phase 4: Version Sync ───────────────────────────────────

function phase4_versionSync() {
    header('Phase 4: Version ↔ Phase Sync');

    const changelog = readSafe(path.join(MEMORY, 'changelog.md'));
    const activeCtx = readSafe(path.join(MEMORY, 'active_context.md'));

    // Get latest version from changelog
    const versionMatch = changelog.match(/##\s*\[v([\d.]+)\]/);
    const latestVersion = versionMatch ? versionMatch[1] : 'unknown';

    // Get phase from active context
    const phaseMatch = activeCtx.match(/\*\*Phase\*\*:\s*Phase\s*(\d+)/);
    const currentPhase = phaseMatch ? phaseMatch[1] : 'unknown';

    // Extract minor version number and check against phase
    const versionParts = latestVersion.split('.');
    const minorVersion = versionParts.length >= 2 ? versionParts[1] : '0';

    let score = 100;

    if (minorVersion === currentPhase) {
        pass(`Changelog v${latestVersion} matches Phase ${currentPhase}`);
    } else {
        warn(`Changelog minor v${minorVersion} ≠ Phase ${currentPhase} (may be intentional)`);
        score = 50;
    }

    // Check if active_context has today's date
    const today = new Date().toISOString().split('T')[0];
    if (activeCtx.includes(today)) {
        pass(`active_context.md has today's date (${today})`);
    } else {
        warn('active_context.md may be stale (no today\'s date)');
        score -= 25;
    }

    return { score, total: 2 };
}

// ─── Phase 5: Test Count Accuracy ────────────────────────────

function phase5_testCountAccuracy() {
    header('Phase 5: Test Count Accuracy in Memory');

    const overview = readSafe(path.join(MEMORY, 'overview.md'));
    const changelog = readSafe(path.join(MEMORY, 'changelog.md'));

    // Count actual tests by parsing test files
    const testFiles = findFiles(SRC, /\.test\.(ts|tsx)$/);
    let actualTestCount = 0;

    for (const tf of testFiles) {
        const content = readSafe(path.join(ROOT, tf));
        const itMatches = content.match(/\bit\s*\(/g);
        if (itMatches) actualTestCount += itMatches.length;
    }

    info(`Actual test count (from source): ${actualTestCount}`);

    // Check if memory docs mention the correct count
    let score = 100;
    const countPattern = /(\d+)\s*tests?\s*pass/i;

    const overviewMatch = overview.match(countPattern);
    if (overviewMatch) {
        const docCount = parseInt(overviewMatch[1]);
        if (docCount === actualTestCount) {
            pass(`overview.md reports ${docCount} tests ✓`);
        } else {
            fail(`overview.md reports ${docCount} tests, actual: ${actualTestCount}`);
            score -= 50;
        }
    }

    const changelogMatch = changelog.match(/(\d+)\/\d+\s*tests?\s*pass/i);
    if (changelogMatch) {
        const docCount = parseInt(changelogMatch[1]);
        if (docCount === actualTestCount) {
            pass(`changelog.md reports ${docCount} tests ✓`);
        } else {
            fail(`changelog.md reports ${docCount} tests, actual: ${actualTestCount}`);
            score -= 50;
        }
    }

    return { score, total: actualTestCount };
}

// ─── Main Execution ──────────────────────────────────────────

function main() {
    console.log(`\n${C.BG}${C.W}   🧪 TEST ↔ MEMORY CROSS-VALIDATOR   ${C.X}`);
    console.log(`${C.D}   Validates memory documentation integrity   ${C.X}`);

    const results = [
        { name: 'Test Documentation', ...phase1_testFileDocumentation() },
        { name: 'Critical File Coverage', ...phase2_criticalFileCoverage() },
        { name: 'ADR Integrity', ...phase3_adrIntegrity() },
        { name: 'Version Sync', ...phase4_versionSync() },
        { name: 'Test Count Accuracy', ...phase5_testCountAccuracy() },
    ];

    // ─── Final Report ────────────────────────────────────────
    header('CROSS-VALIDATION REPORT');

    let totalScore = 0;
    let phases = 0;

    for (const r of results) {
        const emoji = r.score >= 90 ? '🟢' : r.score >= 60 ? '🟡' : '🔴';
        console.log(`  ${emoji} ${r.name.padEnd(26)} ${String(r.score).padStart(3)}%`);
        totalScore += r.score;
        phases++;
    }

    const compositeScore = Math.round(totalScore / phases);
    const grade = compositeScore >= 95 ? 'A+' :
        compositeScore >= 85 ? 'A' :
            compositeScore >= 75 ? 'B' :
                compositeScore >= 60 ? 'C' :
                    compositeScore >= 40 ? 'D' : 'F';

    console.log(`\n  ${'─'.repeat(40)}`);
    const gradeColor = compositeScore >= 85 ? C.G : compositeScore >= 60 ? C.Y : C.R;
    console.log(`  ${C.W}Composite Integrity Score: ${gradeColor}${compositeScore}% (Grade: ${grade})${C.X}\n`);

    if (compositeScore >= 95) {
        console.log(`  ${C.BG}${C.W} EXCELLENT ${C.X} Memory ↔ Test integrity is pristine.`);
    } else if (compositeScore >= 75) {
        console.log(`  ${C.BY}${C.W} GOOD ${C.X} Minor gaps detected. Review warnings above.`);
    } else {
        console.log(`  ${C.BR}${C.W} ATTENTION ${C.X} Significant integrity gaps. Fix items marked ✗.`);
    }

    console.log('');
}

main();
