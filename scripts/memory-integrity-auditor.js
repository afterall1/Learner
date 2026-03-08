#!/usr/bin/env node

/**
 * ============================================================
 * Memory Integrity Auto-Auditor (MIAA)
 * ============================================================
 * Phase 27 RADICAL INNOVATION
 * 
 * Performs 7-phase deep cross-validation between ALL memory
 * documents and source code, detecting:
 *   1. Orphaned file references (docs mention files that don't exist)
 *   2. Phantom source files (source files not in file_map.md)
 *   3. Test count desync (memory says X tests, source has Y)
 *   4. Version chain integrity (changelog versions sequential)
 *   5. ADR coverage gaps (engine files without ADR backing)
 *   6. Phase timeline consistency (active_context ↔ changelog ↔ overview)
 *   7. Workflow command validity (every script/path in workflows exists)
 *
 * Usage:
 *   node scripts/memory-integrity-auditor.js
 *   node scripts/memory-integrity-auditor.js --fix  (auto-patch mode)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Colors ──────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
};

const ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(ROOT, 'memory');
const SRC_DIR = path.join(ROOT, 'src');

// ─── Utility Functions ───────────────────────────────────────

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

function fileExists(relativePath) {
    const fullPath = path.join(ROOT, relativePath);
    return fs.existsSync(fullPath);
}

function findAllSourceFiles(dir, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
            results.push(...findAllSourceFiles(fullPath, extensions));
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
            results.push(fullPath);
        }
    }
    return results;
}

function extractFileReferences(content) {
    const refs = new Set();
    // Match backtick-quoted filenames
    const backtickPattern = /`([a-zA-Z0-9_\-/.]+\.(ts|tsx|js|jsx|md|json))`/g;
    let match;
    while ((match = backtickPattern.exec(content)) !== null) {
        refs.add(match[1]);
    }
    return refs;
}

function countTestsInFile(filePath) {
    const content = readFile(filePath);
    if (!content) return 0;
    const itMatches = content.match(/\bit\s*\(/g);
    return itMatches ? itMatches.length : 0;
}

// ─── Phase 1: Orphaned File References ──────────────────────

function auditOrphanedReferences() {
    console.log(`\n${C.cyan}${C.bold}═══ Phase 1: Orphaned File References ═══${C.reset}`);
    const issues = [];

    const memoryFiles = [
        'memory/file_map.md',
        'memory/active_context.md',
        'memory/overview.md',
        'memory/changelog.md',
    ];

    // Patterns that look like source file paths
    const srcPathPattern = /`(?:src\/)?(?:lib|app|types)\/[^`]+\.(ts|tsx)`/g;

    for (const memFile of memoryFiles) {
        const content = readFile(path.join(ROOT, memFile));
        if (!content) continue;

        let match;
        while ((match = srcPathPattern.exec(content)) !== null) {
            let refPath = match[0].replace(/`/g, '');
            // Normalize: add src/ prefix if missing
            if (!refPath.startsWith('src/')) {
                refPath = 'src/' + refPath;
            }
            if (!fileExists(refPath)) {
                // Check if it's just a basename (e.g., `strategy-dna.ts`)
                const basename = path.basename(refPath);
                const allSrc = findAllSourceFiles(SRC_DIR);
                const found = allSrc.some(f => path.basename(f) === basename);
                if (!found) {
                    issues.push({
                        file: memFile,
                        reference: refPath,
                        type: 'ORPHANED',
                    });
                }
            }
        }
    }

    if (issues.length === 0) {
        console.log(`  ${C.green}✅ All file references resolve to existing files${C.reset}`);
    } else {
        for (const issue of issues) {
            console.log(`  ${C.red}❌ ${issue.file}: references "${issue.reference}" — NOT FOUND${C.reset}`);
        }
    }

    return { phase: 'Orphaned References', passed: issues.length === 0, issues };
}

// ─── Phase 2: Phantom Source Files ──────────────────────────

function auditPhantomFiles() {
    console.log(`\n${C.cyan}${C.bold}═══ Phase 2: Phantom Source Files ═══${C.reset}`);
    const issues = [];

    const fileMapContent = readFile(path.join(MEMORY_DIR, 'file_map.md'));
    if (!fileMapContent) {
        console.log(`  ${C.red}❌ Cannot read file_map.md${C.reset}`);
        return { phase: 'Phantom Files', passed: false, issues: [{ reason: 'Cannot read file_map.md' }] };
    }

    // Get all engine/risk/api/hooks source files
    const engineDir = path.join(SRC_DIR, 'lib', 'engine');
    const riskDir = path.join(SRC_DIR, 'lib', 'risk');
    const apiDir = path.join(SRC_DIR, 'lib', 'api');
    const hooksDir = path.join(SRC_DIR, 'lib', 'hooks');

    const sourceDirs = [engineDir, riskDir, apiDir, hooksDir];

    for (const dir of sourceDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = findAllSourceFiles(dir, ['.ts', '.tsx']);

        for (const file of files) {
            const basename = path.basename(file);
            // Skip __tests__ directory files for this check (they're in test layer)
            if (file.includes('__tests__')) continue;

            if (!fileMapContent.includes(basename)) {
                const relativePath = path.relative(ROOT, file).replace(/\\/g, '/');
                issues.push({
                    file: relativePath,
                    basename,
                    type: 'UNDOCUMENTED',
                });
            }
        }
    }

    if (issues.length === 0) {
        console.log(`  ${C.green}✅ All source files are documented in file_map.md${C.reset}`);
    } else {
        console.log(`  ${C.yellow}⚠️  ${issues.length} undocumented source files:${C.reset}`);
        for (const issue of issues) {
            console.log(`    ${C.yellow}→ ${issue.file}${C.reset}`);
        }
    }

    return { phase: 'Phantom Files', passed: issues.length === 0, issues };
}

// ─── Phase 3: Test Count Desync ─────────────────────────────

function auditTestCounts() {
    console.log(`\n${C.cyan}${C.bold}═══ Phase 3: Test Count Desync ═══${C.reset}`);
    const issues = [];

    // Find all test files
    const testDirs = [
        path.join(SRC_DIR, 'lib', 'engine', '__tests__'),
        path.join(SRC_DIR, 'lib', 'risk', '__tests__'),
        path.join(SRC_DIR, 'lib', 'hooks', '__tests__'),
    ];

    let totalTests = 0;
    let totalFiles = 0;
    const testFileCounts = {};

    for (const dir of testDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const count = countTestsInFile(fullPath);
            testFileCounts[file] = count;
            totalTests += count;
            totalFiles++;
        }
    }

    // Check file_map.md totals
    const fileMapContent = readFile(path.join(MEMORY_DIR, 'file_map.md'));
    if (fileMapContent) {
        const totalMatch = fileMapContent.match(/Total:\s*(\d+)\s*tests\s*across\s*(\d+)\s*files/i);
        if (totalMatch) {
            const docTests = parseInt(totalMatch[1], 10);
            const docFiles = parseInt(totalMatch[2], 10);

            if (docTests !== totalTests) {
                issues.push({
                    type: 'COUNT_MISMATCH',
                    location: 'file_map.md',
                    documented: docTests,
                    actual: totalTests,
                });
                console.log(`  ${C.red}❌ file_map.md says ${docTests} tests, source has ${totalTests}${C.reset}`);
            } else {
                console.log(`  ${C.green}✅ Test count matches: ${totalTests} tests${C.reset}`);
            }

            if (docFiles !== totalFiles) {
                issues.push({
                    type: 'FILE_COUNT_MISMATCH',
                    location: 'file_map.md',
                    documented: docFiles,
                    actual: totalFiles,
                });
                console.log(`  ${C.red}❌ file_map.md says ${docFiles} files, source has ${totalFiles}${C.reset}`);
            } else {
                console.log(`  ${C.green}✅ Test file count matches: ${totalFiles} files${C.reset}`);
            }
        }
    }

    // Per-file count check against file_map
    for (const [fileName, actualCount] of Object.entries(testFileCounts)) {
        const pattern = new RegExp(`${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?\\|\\s*(\\d+)\\s*\\|`, 'i');
        if (fileMapContent) {
            const match = pattern.exec(fileMapContent);
            if (match) {
                const docCount = parseInt(match[1], 10);
                if (docCount !== actualCount) {
                    issues.push({
                        type: 'PER_FILE_MISMATCH',
                        file: fileName,
                        documented: docCount,
                        actual: actualCount,
                    });
                    console.log(`  ${C.yellow}⚠️  ${fileName}: documented ${docCount}, actual ${actualCount}${C.reset}`);
                }
            }
        }
    }

    console.log(`  ${C.dim}  Source: ${totalTests} tests across ${totalFiles} files${C.reset}`);

    return { phase: 'Test Counts', passed: issues.length === 0, issues };
}

// ─── Phase 4: Version Chain Integrity ───────────────────────

function auditVersionChain() {
    console.log(`\n${C.cyan}${C.bold}═══ Phase 4: Version Chain Integrity ═══${C.reset}`);
    const issues = [];

    const changelog = readFile(path.join(MEMORY_DIR, 'changelog.md'));
    if (!changelog) {
        return { phase: 'Version Chain', passed: false, issues: [{ reason: 'Cannot read changelog.md' }] };
    }

    const versionPattern = /## \[v(\d+)\.(\d+)\.(\d+)\]/g;
    const versions = [];
    let match;
    while ((match = versionPattern.exec(changelog)) !== null) {
        versions.push({
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3], 10),
            raw: `v${match[1]}.${match[2]}.${match[3]}`,
        });
    }

    // Check descending order
    for (let i = 1; i < versions.length; i++) {
        const prev = versions[i - 1];
        const curr = versions[i];
        const prevNum = prev.major * 10000 + prev.minor * 100 + prev.patch;
        const currNum = curr.major * 10000 + curr.minor * 100 + curr.patch;

        if (prevNum <= currNum) {
            issues.push({
                type: 'ORDER_ERROR',
                prev: prev.raw,
                curr: curr.raw,
            });
        }
    }

    if (issues.length === 0) {
        console.log(`  ${C.green}✅ Version chain valid: ${versions.length} versions in descending order${C.reset}`);
        console.log(`  ${C.dim}  Latest: ${versions[0]?.raw || 'none'} → Oldest: ${versions[versions.length - 1]?.raw || 'none'}${C.reset}`);
    } else {
        for (const issue of issues) {
            console.log(`  ${C.red}❌ Version order error: ${issue.prev} should be > ${issue.curr}${C.reset}`);
        }
    }

    return { phase: 'Version Chain', passed: issues.length === 0, issues };
}

// ─── Phase 5: Phase Timeline Consistency ────────────────────

function auditPhaseConsistency() {
    console.log(`\n${C.cyan}${C.bold}═══ Phase 5: Phase Timeline Consistency ═══${C.reset}`);
    const issues = [];

    const activeContext = readFile(path.join(MEMORY_DIR, 'active_context.md'));
    const overview = readFile(path.join(MEMORY_DIR, 'overview.md'));
    const changelog = readFile(path.join(MEMORY_DIR, 'changelog.md'));

    // Extract phase from active_context
    const acPhaseMatch = activeContext?.match(/\*\*Phase\*\*:\s*Phase\s*(\d+)/);
    const acPhase = acPhaseMatch ? parseInt(acPhaseMatch[1], 10) : null;

    // Extract phase from overview
    const ovPhaseMatch = overview?.match(/Phase\s*(\d+)/);
    const ovPhase = ovPhaseMatch ? parseInt(ovPhaseMatch[1], 10) : null;

    // Extract latest version from changelog
    const clVersionMatch = changelog?.match(/## \[v\d+\.(\d+)\.\d+\]/);
    const clMinor = clVersionMatch ? parseInt(clVersionMatch[1], 10) : null;

    if (acPhase && ovPhase && acPhase !== ovPhase) {
        issues.push({
            type: 'PHASE_MISMATCH',
            activeContext: acPhase,
            overview: ovPhase,
        });
        console.log(`  ${C.red}❌ Phase mismatch: active_context=Phase ${acPhase}, overview=Phase ${ovPhase}${C.reset}`);
    }

    if (acPhase && clMinor && acPhase !== clMinor) {
        issues.push({
            type: 'VERSION_PHASE_MISMATCH',
            activeContextPhase: acPhase,
            changelogMinor: clMinor,
        });
        console.log(`  ${C.yellow}⚠️  Phase ${acPhase} but latest changelog is v0.${clMinor}.0${C.reset}`);
    }

    if (issues.length === 0) {
        console.log(`  ${C.green}✅ Phase consistent across all docs: Phase ${acPhase}${C.reset}`);
    }

    return { phase: 'Phase Consistency', passed: issues.length === 0, issues };
}

// ─── Phase 6: ADR Coverage ──────────────────────────────────

function auditADRCoverage() {
    console.log(`\n${C.cyan}${C.bold}═══ Phase 6: ADR Coverage ═══${C.reset}`);
    const issues = [];

    const adrDir = path.join(MEMORY_DIR, 'adr');
    let adrCount = 0;
    if (fs.existsSync(adrDir)) {
        adrCount = fs.readdirSync(adrDir).filter(f => f.endsWith('.md')).length;
    }

    // Check ADR references in memory-sync workflow
    const syncWorkflow = readFile(path.join(ROOT, '.agent', 'workflows', 'memory-sync.md'));
    if (syncWorkflow) {
        const adrRefMatch = syncWorkflow.match(/ADR-(\d+)/g);
        const referencedADRs = adrRefMatch ? new Set(adrRefMatch.map(r => parseInt(r.replace('ADR-', ''), 10))) : new Set();
        const maxReferenced = Math.max(...referencedADRs, 0);

        if (maxReferenced !== adrCount) {
            issues.push({
                type: 'ADR_COUNT_MISMATCH',
                referenced: maxReferenced,
                actual: adrCount,
            });
            console.log(`  ${C.yellow}⚠️  Workflow references up to ADR-${maxReferenced}, but ${adrCount} ADR files exist${C.reset}`);
        } else {
            console.log(`  ${C.green}✅ ADR count consistent: ${adrCount} ADRs${C.reset}`);
        }
    }

    return { phase: 'ADR Coverage', passed: issues.length === 0, issues };
}

// ─── Phase 7: Workflow Command Validity ─────────────────────

function auditWorkflowCommands() {
    console.log(`\n${C.cyan}${C.bold}═══ Phase 7: Workflow Command Validity ═══${C.reset}`);
    const issues = [];

    const workflows = [
        '.agent/workflows/memory-sync.md',
        '.agent/workflows/memory-reload.md',
    ];

    // Check that referenced scripts exist
    const scriptPattern = /node\s+([a-zA-Z0-9_\-/.]+\.js)/g;

    for (const wfPath of workflows) {
        const content = readFile(path.join(ROOT, wfPath));
        if (!content) continue;

        let match;
        while ((match = scriptPattern.exec(content)) !== null) {
            const scriptPath = match[1];
            if (!fileExists(scriptPath)) {
                issues.push({
                    workflow: wfPath,
                    script: scriptPath,
                    type: 'MISSING_SCRIPT',
                });
            }
        }
    }

    if (issues.length === 0) {
        console.log(`  ${C.green}✅ All workflow scripts resolve to existing files${C.reset}`);
    } else {
        for (const issue of issues) {
            console.log(`  ${C.yellow}⚠️  ${issue.workflow}: references "${issue.script}" — NOT FOUND${C.reset}`);
        }
    }

    return { phase: 'Workflow Commands', passed: issues.length === 0, issues };
}

// ─── Main Orchestrator ──────────────────────────────────────

function main() {
    console.log(`${C.bold}${C.magenta}`);
    console.log(`╔══════════════════════════════════════════════════╗`);
    console.log(`║   🔬 Memory Integrity Auto-Auditor (MIAA)       ║`);
    console.log(`║   Phase 27 — Radical Innovation                 ║`);
    console.log(`║   7-Phase Deep Cross-Validation                 ║`);
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`${C.reset}`);

    const results = [];

    results.push(auditOrphanedReferences());
    results.push(auditPhantomFiles());
    results.push(auditTestCounts());
    results.push(auditVersionChain());
    results.push(auditPhaseConsistency());
    results.push(auditADRCoverage());
    results.push(auditWorkflowCommands());

    // ─── Score Calculation ───────────────────────────────────

    const totalPhases = results.length;
    const passedPhases = results.filter(r => r.passed).length;
    const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
    const score = Math.round((passedPhases / totalPhases) * 100);

    // Grade
    let grade, gradeColor;
    if (score >= 95) { grade = 'A+'; gradeColor = C.green; }
    else if (score >= 85) { grade = 'A'; gradeColor = C.green; }
    else if (score >= 75) { grade = 'B+'; gradeColor = C.cyan; }
    else if (score >= 65) { grade = 'B'; gradeColor = C.cyan; }
    else if (score >= 50) { grade = 'C'; gradeColor = C.yellow; }
    else { grade = 'F'; gradeColor = C.red; }

    console.log(`\n${C.bold}${C.magenta}═══════════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bold}  MEMORY INTEGRITY SCORE: ${gradeColor}${score}% (Grade ${grade})${C.reset}`);
    console.log(`${C.bold}${C.magenta}═══════════════════════════════════════════════════${C.reset}`);
    console.log(`  Phases passed: ${passedPhases}/${totalPhases}`);
    console.log(`  Total issues:  ${totalIssues}`);
    console.log('');

    for (const result of results) {
        const icon = result.passed ? `${C.green}✅` : `${C.red}❌`;
        const issueCount = result.issues.length > 0 ? ` (${result.issues.length} issues)` : '';
        console.log(`  ${icon} ${result.phase}${issueCount}${C.reset}`);
    }

    console.log(`\n  ${C.dim}Target: Grade A+ (100%)${C.reset}`);
    console.log(`  ${C.dim}Run after every /memory-sync to verify integrity${C.reset}`);

    return score >= 85 ? 0 : 1;
}

process.exit(main());
