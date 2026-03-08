#!/usr/bin/env node
// ============================================================
// Learner: Memory Cross-Reference Integrity Validator
// ============================================================
// Phase 35 RADICAL INNOVATION
//
// Goes BEYOND memory-watchdog.js (file existence checks) to
// validate the CONTENT ACCURACY of all memory documentation:
//
//   1. Line Count Audit — reads actual source file line counts
//      and compares against ~NNN values in file_map.md
//   2. Export Symbol Verification — checks that documented
//      function/class/type names actually exist in source
//   3. Phase Consistency Check — validates Phase numbers are
//      consistent across active_context.md, changelog.md,
//      and file_map.md
//   4. Modification Freshness — detects when source files have
//      been modified more recently than last memory sync
//
// Usage:
//   node memory-integrity-validator.js            # full report
//   node memory-integrity-validator.js --ci       # exit code 1 if issues
//   node memory-integrity-validator.js --summary  # summary only
// ============================================================

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MEMORY_DIR = path.join(PROJECT_ROOT, 'memory');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// ─── ANSI colors for terminal output ─────────────────────────
const C = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
};

// ─── Result Accumulators ─────────────────────────────────────
const results = {
    lineCountDrifts: [],     // { file, documented, actual, diff }
    missingExports: [],      // { file, symbol, type }
    phaseInconsistencies: [], // { phase, sources }
    staleFiles: [],          // { file, lastModified, lastSync }
    totalChecked: 0,
    totalPassed: 0,
};

// ─── 1. Line Count Audit ─────────────────────────────────────
// Reads file_map.md, extracts ~NNN line counts, compares to
// actual source files.

function auditLineCounts() {
    const fileMapPath = path.join(MEMORY_DIR, 'file_map.md');
    if (!fs.existsSync(fileMapPath)) {
        console.log(`${C.yellow}⚠ file_map.md not found, skipping line count audit${C.reset}`);
        return;
    }

    const content = fs.readFileSync(fileMapPath, 'utf-8');
    // Match patterns like: | `filename.ts` | ... (~290 lines) ... |
    // Also handle prefix patterns like: | `hooks/usePipelineLiveData.ts` |
    const linePattern = /\|\s*`([^`]+\.(?:ts|tsx|js|css))`\s*\|[^|]*?~(\d+)\s*lines/gi;
    let match;

    while ((match = linePattern.exec(content)) !== null) {
        const fileRef = match[1]; // e.g. "stress-temporal-tracker.ts" or "hooks/usePipelineLiveData.ts"
        const documentedLines = parseInt(match[2], 10);

        // Find the actual file
        const actualPath = findSourceFile(fileRef);
        if (!actualPath) continue; // file doesn't exist (handled by watchdog)

        try {
            const fileContent = fs.readFileSync(actualPath, 'utf-8');
            const actualLines = fileContent.split('\n').length;
            const diff = Math.abs(actualLines - documentedLines);
            const driftPercent = (diff / documentedLines) * 100;

            results.totalChecked++;

            // Allow 20% tolerance for line counts (documentation rounds)
            if (driftPercent > 20 && diff > 30) {
                results.lineCountDrifts.push({
                    file: fileRef,
                    documented: documentedLines,
                    actual: actualLines,
                    diff: actualLines - documentedLines,
                    driftPercent: driftPercent.toFixed(1),
                });
            } else {
                results.totalPassed++;
            }
        } catch (err) {
            // File read error — skip
        }
    }
}

// ─── 2. Export Symbol Verification ───────────────────────────
// Checks that specific documented exports exist in source files.
// Reads file_map.md for key function/class mentions and verifies.

function verifyExportSymbols() {
    const fileMapPath = path.join(MEMORY_DIR, 'file_map.md');
    if (!fs.existsSync(fileMapPath)) return;

    const content = fs.readFileSync(fileMapPath, 'utf-8');

    // Extract documented symbols: look for `functionName()` or `ClassName` patterns
    // within file_map.md table rows
    const rows = content.split('\n').filter(l => l.startsWith('|') && l.includes('`'));

    for (const row of rows) {
        // Get file basename from first column
        const fileMatch = row.match(/\|\s*`([^`]+\.(?:ts|tsx))`\s*\|/);
        if (!fileMatch) continue;

        const fileRef = fileMatch[1];
        const actualPath = findSourceFile(fileRef);
        if (!actualPath) continue;

        let fileContent;
        try {
            fileContent = fs.readFileSync(actualPath, 'utf-8');
        } catch {
            continue;
        }

        // Find documented function/method names (pattern: `functionName()`)
        const funcPattern = /`(\w+)\(\)`/g;
        let funcMatch;
        while ((funcMatch = funcPattern.exec(row)) !== null) {
            const funcName = funcMatch[1];
            // Skip common noise words
            if (['toString', 'toFixed', 'console', 'require', 'process'].includes(funcName)) continue;

            results.totalChecked++;
            // Check if the function exists in the source (as function/method/export)
            const funcExists =
                fileContent.includes(`function ${funcName}`) ||
                fileContent.includes(`${funcName}(`) ||
                fileContent.includes(`${funcName} =`) ||
                fileContent.includes(`.${funcName}`);

            if (funcExists) {
                results.totalPassed++;
            } else {
                results.missingExports.push({
                    file: fileRef,
                    symbol: funcName,
                    type: 'function',
                });
            }
        }

        // Find documented class names (pattern: `ClassName` — PascalCase, not in backtick-parens)
        const classPattern = /`([A-Z][a-zA-Z]+(?:Engine|Manager|Tracker|Calibrator|Monitor|Bridge|Cache|Store|Detector|Analyzer|Client|Matrix|Grid|Bus|Allocator|Roster|Director|Tester|Orchestrator|Scheduler|Validator|Sentinel|Profiler|Executor))`/g;
        let classMatch;
        while ((classMatch = classPattern.exec(row)) !== null) {
            const className = classMatch[1];
            results.totalChecked++;

            const classExists =
                fileContent.includes(`class ${className}`) ||
                fileContent.includes(`const ${className}`) ||
                fileContent.includes(`function ${className}`) ||
                fileContent.includes(`export { ${className}`) ||
                fileContent.includes(`type ${className}`) ||
                fileContent.includes(`import { ${className}`) ||
                fileContent.includes(`import {${className}`) ||
                fileContent.includes(`, ${className}`) ||
                fileContent.includes(`${className},`);

            if (classExists) {
                results.totalPassed++;
            } else {
                results.missingExports.push({
                    file: fileRef,
                    symbol: className,
                    type: 'class/type',
                });
            }
        }
    }
}

// ─── 3. Phase Consistency Check ──────────────────────────────
// Collects Phase numbers from active_context, changelog, and
// file_map, then checks for missing or inconsistent references.

function checkPhaseConsistency() {
    const phaseSources = {
        active_context: new Set(),
        changelog: new Set(),
        file_map: new Set(),
    };

    const files = {
        active_context: path.join(MEMORY_DIR, 'active_context.md'),
        changelog: path.join(MEMORY_DIR, 'changelog.md'),
        file_map: path.join(MEMORY_DIR, 'file_map.md'),
    };

    const phasePattern = /Phase\s+(\d+)/gi;

    for (const [key, filePath] of Object.entries(files)) {
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf-8');
        let match;
        while ((match = phasePattern.exec(content)) !== null) {
            phaseSources[key].add(parseInt(match[1], 10));
        }
    }

    // Find all unique phase numbers
    const allPhases = new Set([
        ...phaseSources.active_context,
        ...phaseSources.changelog,
        ...phaseSources.file_map,
    ]);

    for (const phase of [...allPhases].sort((a, b) => a - b)) {
        const inAC = phaseSources.active_context.has(phase);
        const inCL = phaseSources.changelog.has(phase);
        const inFM = phaseSources.file_map.has(phase);

        results.totalChecked++;

        // A phase should ideally be in at least 2 of 3 docs
        const presentCount = [inAC, inCL, inFM].filter(Boolean).length;
        if (presentCount < 2 && phase >= 10) {
            // Only flag significant phases (>=10), sub-phases may not be in all docs
            results.phaseInconsistencies.push({
                phase,
                inActiveContext: inAC,
                inChangelog: inCL,
                inFileMap: inFM,
                missingIn: [
                    !inAC ? 'active_context' : null,
                    !inCL ? 'changelog' : null,
                    !inFM ? 'file_map' : null,
                ].filter(Boolean),
            });
        } else {
            results.totalPassed++;
        }
    }
}

// ─── 4. Modification Freshness Check ─────────────────────────
// Compares source file mtimes against last memory sync timestamp.

function checkModificationFreshness() {
    const acPath = path.join(MEMORY_DIR, 'active_context.md');
    if (!fs.existsSync(acPath)) return;

    const acContent = fs.readFileSync(acPath, 'utf-8');
    // Extract last sync timestamp
    const syncMatch = acContent.match(/Last Synced:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
    if (!syncMatch) return;

    const lastSyncStr = syncMatch[1];
    // Parse as local time (Turkish timezone, UTC+3)
    const parts = lastSyncStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!parts) return;
    const lastSyncDate = new Date(
        parseInt(parts[1]),
        parseInt(parts[2]) - 1,
        parseInt(parts[3]),
        parseInt(parts[4]) - 3, // Convert UTC+3 to UTC
        parseInt(parts[5])
    );

    // ── Build whitelist from changelog ──
    // Files mentioned in the latest changelog entries (current session) are
    // expected to have been modified — they were the SUBJECT of the sync.
    const recentlyDocumentedBasenames = new Set();

    // Helper: extract basename from a reference like "pipeline/page.tsx" → "page.tsx"
    const addFileRef = (ref) => {
        const basename = ref.includes('/') ? ref.split('/').pop() : ref;
        recentlyDocumentedBasenames.add(basename);
    };

    // Regex that captures filenames WITH optional path prefixes inside backticks
    // Matches: `page.tsx`, `pipeline/page.tsx`, `stress-matrix.ts`, etc.
    const fileRefPattern = /`((?:[\w-]+\/)*[\w-]+\.(?:ts|tsx|js|css))`/g;

    const clPath = path.join(MEMORY_DIR, 'changelog.md');
    if (fs.existsSync(clPath)) {
        const clContent = fs.readFileSync(clPath, 'utf-8');
        // Extract the latest 3 version blocks (covers multi-phase sessions)
        const versionBlocks = clContent.split(/^## \[/m).slice(1, 4);
        for (const block of versionBlocks) {
            const fileRefs = [...block.matchAll(fileRefPattern)];
            for (const ref of fileRefs) {
                addFileRef(ref[1]);
            }
        }
    }

    // Scan ALL session entries from same sync day in active_context.md
    const syncDayStr = lastSyncStr.split(' ')[0]; // e.g. "2026-03-08"
    const sessionBlocks = acContent.split(/^### Session:/m);
    for (let i = 1; i < sessionBlocks.length; i++) {
        const block = sessionBlocks[i];
        // Check if this session is from the same day
        if (block.includes(syncDayStr)) {
            const fileRefs = [...block.matchAll(fileRefPattern)];
            for (const ref of fileRefs) {
                addFileRef(ref[1]);
            }
        }
    }

    // Scan key source directories
    const scanDirs = [
        path.join(SRC_DIR, 'lib', 'engine'),
        path.join(SRC_DIR, 'lib', 'hooks'),
        path.join(SRC_DIR, 'lib', 'api'),
        path.join(SRC_DIR, 'lib', 'risk'),
        path.join(SRC_DIR, 'app', 'pipeline'),
    ];

    for (const dir of scanDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

        for (const file of files) {
            const filePath = path.join(dir, file);
            try {
                const stat = fs.statSync(filePath);
                const modTime = stat.mtime;

                results.totalChecked++;

                // File was modified AFTER last memory sync
                if (modTime > lastSyncDate) {
                    const diffMinutes = (modTime - lastSyncDate) / (1000 * 60);

                    // Grace conditions:
                    // 1. Within 5 minutes of sync (sync process itself)
                    // 2. File basename appears in recent changelog/session docs (already documented)
                    const isGraced = diffMinutes <= 5 || recentlyDocumentedBasenames.has(file);

                    if (!isGraced) {
                        results.staleFiles.push({
                            file: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'),
                            lastModified: modTime.toISOString().slice(0, 16),
                            minutesAfterSync: Math.round(diffMinutes),
                        });
                    } else {
                        results.totalPassed++;
                    }
                } else {
                    results.totalPassed++;
                }
            } catch {
                // Skip files that can't be stat'd
            }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────

function findSourceFile(fileRef) {
    // fileRef can be "filename.ts" or "dir/filename.ts" or "trading/status/route.ts"

    // ── Priority 1: Direct path resolution (for path-prefixed entries) ──
    if (fileRef.includes('/')) {
        // Try multiple base prefixes in priority order
        const prefixes = [
            SRC_DIR,                            // src/hooks/usePipelineLiveData.ts
            path.join(SRC_DIR, 'lib'),          // src/lib/engine/evolution-health.ts
            path.join(SRC_DIR, 'app'),          // src/app/pipeline/page.tsx
            path.join(SRC_DIR, 'app', 'api'),   // src/app/api/trading/session/route.ts
            PROJECT_ROOT,                       // vitest.config.ts
        ];
        for (const prefix of prefixes) {
            const candidate = path.join(prefix, fileRef);
            if (fs.existsSync(candidate)) return candidate;
        }
    }

    // ── Priority 2: Basename search in known directories ──
    const basename = path.basename(fileRef);

    // Skip ambiguous basenames (page.tsx, route.ts, layout.tsx)
    // These MUST be resolved via path prefix — basename match is unreliable
    const ambiguousNames = ['page.tsx', 'route.ts', 'layout.tsx'];
    if (ambiguousNames.includes(basename)) {
        return null; // Force path-prefixed resolution only
    }

    const searchDirs = [
        path.join(SRC_DIR, 'lib', 'engine'),
        path.join(SRC_DIR, 'lib', 'engine', 'overmind'),
        path.join(SRC_DIR, 'lib', 'hooks'),
        path.join(SRC_DIR, 'lib', 'api'),
        path.join(SRC_DIR, 'lib', 'risk'),
        path.join(SRC_DIR, 'lib', 'store'),
        path.join(SRC_DIR, 'lib', 'db'),
        path.join(SRC_DIR, 'lib', 'config'),
        path.join(SRC_DIR, 'lib', 'utils'),
        path.join(SRC_DIR, 'types'),
        path.join(SRC_DIR, 'app'),
        path.join(SRC_DIR, 'app', 'pipeline'),
        path.join(SRC_DIR, 'app', 'brain'),
        path.join(SRC_DIR, 'app', 'api', 'trading', 'testnet-probe'),
        path.join(SRC_DIR, 'app', 'api', 'trading', 'session'),
        path.join(SRC_DIR, 'app', 'api', 'trading', 'status'),
        path.join(SRC_DIR, 'app', 'api', 'sentinel'),
        PROJECT_ROOT,
    ];

    for (const dir of searchDirs) {
        const candidate = path.join(dir, basename);
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

// ─── Report Generation ───────────────────────────────────────

function generateReport(mode) {
    const totalIssues =
        results.lineCountDrifts.length +
        results.missingExports.length +
        results.phaseInconsistencies.length +
        results.staleFiles.length;

    const healthScore = results.totalChecked > 0
        ? Math.round((results.totalPassed / results.totalChecked) * 100)
        : 100;

    const healthColor = healthScore >= 90 ? C.green :
        healthScore >= 70 ? C.yellow : C.red;
    const healthEmoji = healthScore >= 90 ? '✅' :
        healthScore >= 70 ? '⚠️' : '❌';

    console.log(`\n${C.bold}╔${'═'.repeat(60)}╗${C.reset}`);
    console.log(`${C.bold}║${C.cyan}  🧬 Memory Cross-Reference Integrity Validator${' '.repeat(12)}${C.reset}${C.bold}║${C.reset}`);
    console.log(`${C.bold}║${C.dim}  Phase 35 Radical Innovation${' '.repeat(31)}${C.reset}${C.bold}║${C.reset}`);
    console.log(`${C.bold}╚${'═'.repeat(60)}╝${C.reset}\n`);

    // Health Score
    console.log(`  ${C.bold}Memory Health Score: ${healthColor}${healthEmoji} ${healthScore}%${C.reset}`);
    console.log(`  ${C.dim}Checked: ${results.totalChecked} | Passed: ${results.totalPassed} | Issues: ${totalIssues}${C.reset}\n`);

    if (mode === 'summary') {
        printSummaryBar(totalIssues);
        return totalIssues;
    }

    // 1. Line Count Drifts
    console.log(`  ${C.bold}📏 Line Count Audit${C.reset} ${C.dim}(±20% or ±30 lines tolerance)${C.reset}`);
    if (results.lineCountDrifts.length === 0) {
        console.log(`  ${C.green}  ✓ All documented line counts are accurate${C.reset}\n`);
    } else {
        for (const d of results.lineCountDrifts) {
            const arrow = d.diff > 0 ? '↑' : '↓';
            const color = Math.abs(d.diff) > 100 ? C.red : C.yellow;
            console.log(`  ${color}  ✗ ${d.file}: documented ~${d.documented}L, actual ${d.actual}L (${arrow}${Math.abs(d.diff)}, ${d.driftPercent}% drift)${C.reset}`);
        }
        console.log();
    }

    // 2. Missing Exports
    console.log(`  ${C.bold}🔍 Export Symbol Verification${C.reset}`);
    if (results.missingExports.length === 0) {
        console.log(`  ${C.green}  ✓ All documented symbols found in source${C.reset}\n`);
    } else {
        for (const m of results.missingExports) {
            console.log(`  ${C.yellow}  ✗ ${m.file}: ${m.type} \`${m.symbol}\` not found${C.reset}`);
        }
        console.log();
    }

    // 3. Phase Consistency
    console.log(`  ${C.bold}🔢 Phase Consistency Check${C.reset}`);
    if (results.phaseInconsistencies.length === 0) {
        console.log(`  ${C.green}  ✓ All phases consistent across memory docs${C.reset}\n`);
    } else {
        for (const p of results.phaseInconsistencies) {
            console.log(`  ${C.yellow}  ✗ Phase ${p.phase}: missing in ${p.missingIn.join(', ')}${C.reset}`);
        }
        console.log();
    }

    // 4. Stale Files
    console.log(`  ${C.bold}🕐 Modification Freshness${C.reset}`);
    if (results.staleFiles.length === 0) {
        console.log(`  ${C.green}  ✓ All source files synced with memory docs${C.reset}\n`);
    } else {
        console.log(`  ${C.dim}  Files modified after last memory sync:${C.reset}`);
        for (const s of results.staleFiles) {
            console.log(`  ${C.yellow}  ✗ ${s.file} (modified ${s.minutesAfterSync}m after sync)${C.reset}`);
        }
        console.log();
    }

    printSummaryBar(totalIssues);
    return totalIssues;
}

function printSummaryBar(totalIssues) {
    if (totalIssues === 0) {
        console.log(`  ${C.bgGreen}${C.bold}  INTEGRITY CHECK PASSED — All memory docs are accurate  ${C.reset}\n`);
    } else {
        console.log(`  ${C.bgYellow}${C.bold}  ${totalIssues} INTEGRITY ISSUES DETECTED — Run memory-sync to fix  ${C.reset}\n`);
    }
}

// ─── 5. Auto-Fix Engine (RADICAL INNOVATION) ────────────────
// Self-healing mode: patches file_map.md line counts in-place.
// Transforms 15+ manual edits into a single command.

function autoFixLineCounts() {
    const fileMapPath = path.join(MEMORY_DIR, 'file_map.md');
    if (!fs.existsSync(fileMapPath)) {
        console.log(`${C.red}  ✗ file_map.md not found, cannot auto-fix${C.reset}`);
        return 0;
    }

    let content = fs.readFileSync(fileMapPath, 'utf-8');
    let fixCount = 0;

    // For each drifted file, find and replace the ~NNN value
    for (const drift of results.lineCountDrifts) {
        // Build a targeted regex to find the exact line in file_map.md
        // Match: | `filename.ts` | ... (~OLD lines) ... |
        const escapedFile = drift.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
            `(\\|\\s*\`${escapedFile}\`\\s*\\|[^|]*?)~${drift.documented}\\s*lines`,
            'g'
        );

        const newContent = content.replace(pattern, (match, prefix) => {
            // Round to nearest 5 for clean documentation
            const rounded = Math.round(drift.actual / 5) * 5;
            fixCount++;
            return `${prefix}~${rounded} lines`;
        });

        if (newContent !== content) {
            content = newContent;
        }
    }

    if (fixCount > 0) {
        fs.writeFileSync(fileMapPath, content, 'utf-8');
        console.log(`\n  ${C.bold}${C.green}🔧 AUTO-FIX APPLIED${C.reset}`);
        console.log(`  ${C.green}  ✓ Patched ${fixCount} line counts in file_map.md${C.reset}`);

        // Attempt to regenerate Context DNA fingerprint
        const fingerprintScript = path.join(MEMORY_DIR, 'scripts', 'context-fingerprint.js');
        if (fs.existsSync(fingerprintScript)) {
            try {
                const { execSync } = require('child_process');
                execSync(`node "${fingerprintScript}" --generate`, {
                    cwd: PROJECT_ROOT,
                    stdio: 'pipe',
                });
                console.log(`  ${C.green}  ✓ Context DNA fingerprint regenerated${C.reset}`);
            } catch {
                console.log(`  ${C.yellow}  ⚠ Fingerprint regeneration failed (run manually)${C.reset}`);
            }
        }

        // Update sync timestamp in active_context.md
        const acPath = path.join(MEMORY_DIR, 'active_context.md');
        if (fs.existsSync(acPath)) {
            let acContent = fs.readFileSync(acPath, 'utf-8');
            const now = new Date();
            // Format as UTC+3 (Turkey)
            const utc3 = new Date(now.getTime() + 3 * 60 * 60 * 1000);
            const dateStr = utc3.toISOString().slice(0, 10);
            const timeStr = utc3.toISOString().slice(11, 16);
            const newTimestamp = `*Last Synced: ${dateStr} ${timeStr} (UTC+3)*`;
            acContent = acContent.replace(
                /\*Last Synced:.*?\*/,
                newTimestamp
            );
            fs.writeFileSync(acPath, acContent, 'utf-8');
            console.log(`  ${C.green}  ✓ Sync timestamp updated in active_context.md${C.reset}`);
        }

        console.log(`\n  ${C.dim}Run validator again to verify: node memory/scripts/memory-integrity-validator.js${C.reset}\n`);
    } else {
        console.log(`\n  ${C.green}  ✓ No line counts to fix — all accurate${C.reset}\n`);
    }

    return fixCount;
}

// ─── Main ────────────────────────────────────────────────────

function main() {
    const args = process.argv.slice(2);
    const mode = args.includes('--ci') ? 'ci' :
        args.includes('--summary') ? 'summary' :
            args.includes('--auto-fix') ? 'auto-fix' : 'full';

    // Run all 4 audit stages
    auditLineCounts();
    verifyExportSymbols();
    checkPhaseConsistency();
    checkModificationFreshness();

    // Generate report
    const totalIssues = generateReport(mode === 'auto-fix' ? 'full' : mode);

    // Auto-fix mode: patch file_map.md with correct line counts
    if (mode === 'auto-fix' && results.lineCountDrifts.length > 0) {
        autoFixLineCounts();
    } else if (mode === 'auto-fix') {
        console.log(`\n  ${C.green}  ✓ No line count drifts to auto-fix${C.reset}\n`);
    }

    // CI mode: exit with error code if issues found
    if (mode === 'ci' && totalIssues > 0) {
        process.exit(1);
    }
}

main();
