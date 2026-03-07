#!/usr/bin/env node
// ============================================================
// Learner: Memory Health Dashboard — Automated Sync Intel
// ============================================================
// Radical Innovation: Cross-references source files against 
// memory docs to automatically detect what's stale, missing,
// or undocumented. Replaces manual checklist guesswork.
//
// Generates:
//   1. FRESHNESS SCORES  — per-memory-file staleness detection
//   2. UNDOCUMENTED FILES — src files missing from file_map.md
//   3. ADR COVERAGE       — architectural decisions vs ADR count
//   4. OVERALL HEALTH     — composite memory integrity score
//
// Usage: node scripts/memory-health.js
// ============================================================

const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(PROJECT_ROOT, 'memory');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.agent', 'skills');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');

// Memory files to track
const MEMORY_FILES = [
    'memory/overview.md',
    'memory/active_context.md',
    'memory/file_map.md',
    'memory/changelog.md',
    'memory/architecture/system_design.md',
    'memory/_SYNC_CHECKLIST.md',
];

// ─── Utility Functions ───────────────────────────────────────

function getFileMtime(filePath) {
    try {
        const fullPath = path.join(PROJECT_ROOT, filePath);
        const stat = fs.statSync(fullPath);
        return stat.mtimeMs;
    } catch (err) {
        return 0;
    }
}

function getFileSize(filePath) {
    try {
        const fullPath = path.join(PROJECT_ROOT, filePath);
        const stat = fs.statSync(fullPath);
        return stat.size;
    } catch (err) {
        return 0;
    }
}

function collectSourceFiles() {
    const files = [];
    const extensions = ['.ts', '.tsx'];

    function walk(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '.next') {
                        walk(fullPath);
                    }
                } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
                    const relativePath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
                    files.push({
                        path: relativePath,
                        mtime: fs.statSync(fullPath).mtimeMs,
                        size: fs.statSync(fullPath).size,
                    });
                }
            }
        } catch (err) {
            // Directory not accessible
        }
    }

    walk(SRC_DIR);
    return files;
}

// ─── Check 1: Memory Freshness ──────────────────────────────

function checkFreshness(srcFiles) {
    console.log('\n─── CHECK 1: Memory Document Freshness ───\n');

    const latestSrcMtime = Math.max(...srcFiles.map(f => f.mtime));
    const latestSrcDate = new Date(latestSrcMtime);
    console.log(`  📊 Latest source file change: ${latestSrcDate.toLocaleString()}\n`);

    let freshCount = 0;
    let staleCount = 0;
    const results = [];

    for (const memFile of MEMORY_FILES) {
        const mtime = getFileMtime(memFile);
        if (mtime === 0) {
            console.log(`  ❌ MISSING: ${memFile}`);
            staleCount++;
            results.push({ file: memFile, status: 'MISSING', score: 0 });
            continue;
        }

        const memDate = new Date(mtime);
        const hoursBehind = (latestSrcMtime - mtime) / (1000 * 60 * 60);

        if (hoursBehind <= 1) {
            console.log(`  ✅ FRESH:  ${memFile} (${memDate.toLocaleString()})`);
            freshCount++;
            results.push({ file: memFile, status: 'FRESH', score: 100 });
        } else if (hoursBehind <= 24) {
            console.log(`  ⚠️  AGING:  ${memFile} (${Math.round(hoursBehind)}h behind)`);
            staleCount++;
            results.push({ file: memFile, status: 'AGING', score: 75 });
        } else {
            console.log(`  🔴 STALE:  ${memFile} (${Math.round(hoursBehind / 24)}d behind)`);
            staleCount++;
            results.push({ file: memFile, status: 'STALE', score: 25 });
        }
    }

    const avgFreshness = results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
        : 0;

    console.log(`\n  Freshness Score: ${avgFreshness}% (${freshCount} fresh, ${staleCount} stale/aging)`);
    return avgFreshness;
}

// ─── Check 2: File Map Coverage ─────────────────────────────

function checkFileMapCoverage(srcFiles) {
    console.log('\n─── CHECK 2: File Map Coverage ───\n');

    const fileMapPath = path.join(MEMORY_DIR, 'file_map.md');
    let fileMapContent = '';
    try {
        fileMapContent = fs.readFileSync(fileMapPath, 'utf-8');
    } catch (err) {
        console.log('  ❌ file_map.md not found!');
        return 0;
    }

    let documented = 0;
    let undocumented = 0;
    const undocumentedFiles = [];

    for (const file of srcFiles) {
        const basename = path.basename(file.path);
        // Check if the file is mentioned in the file map
        if (fileMapContent.includes(basename)) {
            documented++;
        } else {
            // Skip test files, CSS, and layout
            if (basename.includes('.test.') || basename.endsWith('.css')) continue;
            undocumented++;
            undocumentedFiles.push(file.path);
        }
    }

    if (undocumentedFiles.length > 0) {
        console.log('  Undocumented source files:');
        for (const f of undocumentedFiles) {
            const sizeKB = Math.round(getFileSize(f) / 1024);
            console.log(`    ⚠️  ${f} (${sizeKB}KB)`);
        }
    } else {
        console.log('  ✅ All source files documented in file_map.md!');
    }

    const total = documented + undocumented;
    const coverage = total > 0 ? Math.round((documented / total) * 100) : 100;
    console.log(`\n  Coverage: ${coverage}% (${documented}/${total} files documented)`);
    return coverage;
}

// ─── Check 3: ADR Coverage ──────────────────────────────────

function checkADRCoverage() {
    console.log('\n─── CHECK 3: ADR Coverage ───\n');

    const adrDir = path.join(MEMORY_DIR, 'adr');
    let existingADRs = [];
    try {
        existingADRs = fs.readdirSync(adrDir)
            .filter(f => f.endsWith('.md'))
            .sort();
    } catch (err) {
        console.log('  ❌ ADR directory not found!');
        return 0;
    }

    console.log(`  📋 Existing ADRs: ${existingADRs.length}`);
    for (const adr of existingADRs) {
        const content = fs.readFileSync(path.join(adrDir, adr), 'utf-8');
        const titleMatch = content.match(/# ADR-\d+:\s*(.+)/);
        const title = titleMatch ? titleMatch[1] : adr;
        console.log(`    • ${adr} — ${title}`);
    }

    // Check for potentially missing ADRs based on major module directories
    const majorModules = [
        { dir: 'src/lib/engine/overmind', adrKeyword: 'overmind', name: 'Strategic Overmind' },
        { dir: 'src/lib/store/persistence.ts', adrKeyword: 'persistence', name: 'Persistence Layer' },
        { dir: 'src/lib/engine/meta-evolution.ts', adrKeyword: 'meta-evolution', name: 'Meta-Evolution' },
    ];

    let uncoveredModules = 0;
    for (const mod of majorModules) {
        const modPath = path.join(PROJECT_ROOT, mod.dir);
        if (fs.existsSync(modPath)) {
            const hasADR = existingADRs.some(adr => {
                const content = fs.readFileSync(path.join(adrDir, adr), 'utf-8').toLowerCase();
                return content.includes(mod.adrKeyword);
            });
            if (!hasADR) {
                console.log(`\n  ⚠️  MISSING ADR: ${mod.name} has no architectural decision record`);
                uncoveredModules++;
            }
        }
    }

    if (uncoveredModules === 0) {
        console.log('\n  ✅ All major modules have ADRs!');
    }

    const score = existingADRs.length >= 9 ? 100 : Math.round((existingADRs.length / 9) * 100);
    return score;
}

// ─── Check 4: Skill System Health ───────────────────────────

function checkSkillHealth(srcFiles) {
    console.log('\n─── CHECK 4: Skill System Health ───\n');

    let skillCount = 0;
    let skillMapExists = false;
    let skillGraphExists = false;

    try {
        const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory());
        skillCount = skillDirs.length;
        console.log(`  📚 Skills: ${skillCount}`);
    } catch (err) {
        console.log('  ❌ Skills directory not found!');
    }

    // Check auto-generated files
    const mapPath = path.join(PROJECT_ROOT, '.agent', 'skill-map.json');
    const graphPath = path.join(PROJECT_ROOT, '.agent', 'skill-graph.md');

    skillMapExists = fs.existsSync(mapPath);
    skillGraphExists = fs.existsSync(graphPath);

    console.log(`  📄 skill-map.json: ${skillMapExists ? '✅ Present' : '❌ Missing'}`);
    console.log(`  📄 skill-graph.md: ${skillGraphExists ? '✅ Present' : '❌ Missing'}`);

    // Check if skill-map.json is current
    if (skillMapExists) {
        try {
            const mapContent = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
            const mapFiles = Object.keys(mapContent.fileToSkills || {}).length;
            const actualFiles = srcFiles.length;
            const coverage = Math.round((mapFiles / actualFiles) * 100);
            console.log(`  📊 Skill map coverage: ${mapFiles}/${actualFiles} files (${coverage}%)`);

            // Check staleness
            const mapMtime = fs.statSync(mapPath).mtimeMs;
            const latestSrcMtime = Math.max(...srcFiles.map(f => f.mtime));
            if (latestSrcMtime > mapMtime) {
                console.log('  ⚠️  Skill map is older than latest source changes — regenerate with:');
                console.log('     node scripts/generate-skill-map.js');
            } else {
                console.log('  ✅ Skill map is up to date');
            }
        } catch (err) {
            console.log(`  ⚠️  Could not parse skill-map.json: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    let score = 0;
    if (skillCount >= 16) score += 40;
    else score += Math.round((skillCount / 16) * 40);
    if (skillMapExists) score += 30;
    if (skillGraphExists) score += 30;

    console.log(`\n  Skill Health Score: ${score}%`);
    return score;
}

// ─── Check 5: Workflow Completeness ─────────────────────────

function checkWorkflows() {
    console.log('\n─── CHECK 5: Workflow Completeness ───\n');

    const workflows = [
        { file: '.agent/workflows/memory-sync.md', name: '/memory-sync' },
        { file: '.agent/workflows/memory-reload.md', name: '/memory-reload' },
    ];

    let score = 0;
    const requiredKeywords = [
        'overmind',
        'skill-map',
        'ADR-008',
        'ADR-009',
        'persistence',
        'forensics',
        'brain',
    ];

    for (const wf of workflows) {
        const fullPath = path.join(PROJECT_ROOT, wf.file);
        if (!fs.existsSync(fullPath)) {
            console.log(`  ❌ ${wf.name} — MISSING`);
            continue;
        }

        const content = fs.readFileSync(fullPath, 'utf-8').toLowerCase();
        const present = requiredKeywords.filter(kw => content.includes(kw));
        const missing = requiredKeywords.filter(kw => !content.includes(kw));

        if (missing.length === 0) {
            console.log(`  ✅ ${wf.name} — All ${requiredKeywords.length} keywords present`);
            score += 50;
        } else {
            console.log(`  ⚠️  ${wf.name} — Missing: ${missing.join(', ')}`);
            score += Math.round((present.length / requiredKeywords.length) * 50);
        }
    }

    console.log(`\n  Workflow Score: ${score}%`);
    return score;
}

// ─── Check 6: Cross-Reference Consistency Matrix ────────────

function checkCrossReferenceConsistency() {
    console.log('\n─── CHECK 6: Cross-Reference Consistency Matrix ───\n');

    const memoryDocs = {
        overview: readMemFile('overview.md'),
        activeContext: readMemFile('active_context.md'),
        fileMap: readMemFile('file_map.md'),
        changelog: readMemFile('changelog.md'),
        systemDesign: readMemFile('architecture/system_design.md'),
    };

    let totalChecks = 0;
    let passedChecks = 0;
    const mismatches = [];

    // 1. ADR Cross-Reference: every ADR file should be referenced in file_map + memory-reload + memory-sync
    const adrDir = path.join(MEMORY_DIR, 'adr');
    try {
        const adrFiles = fs.readdirSync(adrDir).filter(f => f.endsWith('.md'));
        for (const adr of adrFiles) {
            const adrContent = fs.readFileSync(path.join(adrDir, adr), 'utf-8');
            const numMatch = adr.match(/(\d+)/);
            const adrNum = numMatch ? `ADR-${numMatch[1].padStart(3, '0')}` : adr;

            // Check file_map
            totalChecks++;
            if (memoryDocs.fileMap.includes(adr) || memoryDocs.fileMap.includes(adrNum)) {
                passedChecks++;
            } else {
                mismatches.push(`  ⚠️  ${adrNum} missing from file_map.md`);
            }

            // Check changelog
            totalChecks++;
            if (memoryDocs.changelog.toLowerCase().includes(adrNum.toLowerCase())) {
                passedChecks++;
            } else {
                mismatches.push(`  ⚠️  ${adrNum} missing from changelog.md`);
            }
        }
    } catch (err) {
        // ADR directory may not exist
    }

    // 2. Page Route Cross-Reference: every /route in overview should be in file_map
    const routePatterns = [
        { route: 'page.tsx', label: 'Main Dashboard' },
        { route: 'brain/page.tsx', label: 'Brain Visualization' },
        { route: 'pipeline/page.tsx', label: 'Pipeline Dashboard' },
    ];

    for (const rp of routePatterns) {
        totalChecks++;
        const inOverview = memoryDocs.overview.includes(rp.route);
        const inFileMap = memoryDocs.fileMap.includes(rp.route);
        if (inOverview && inFileMap) {
            passedChecks++;
        } else if (!inOverview && !inFileMap) {
            mismatches.push(`  ⚠️  ${rp.label} (${rp.route}) missing from BOTH overview.md and file_map.md`);
        } else if (!inOverview) {
            mismatches.push(`  ⚠️  ${rp.label} (${rp.route}) in file_map but missing from overview.md`);
        } else {
            mismatches.push(`  ⚠️  ${rp.label} (${rp.route}) in overview but missing from file_map.md`);
        }
    }

    // 3. Phase Milestone Cross-Reference: every Phase N in active_context should be in changelog
    const phaseRegex = /Phase (\d+)/g;
    const contextPhases = new Set();
    let match;
    while ((match = phaseRegex.exec(memoryDocs.activeContext)) !== null) {
        contextPhases.add(match[1]);
    }

    for (const phase of contextPhases) {
        totalChecks++;
        if (memoryDocs.changelog.includes(`Phase ${phase}`)) {
            passedChecks++;
        } else {
            mismatches.push(`  ⚠️  Phase ${phase} in active_context but missing from changelog.md`);
        }
    }

    // Report
    if (mismatches.length === 0) {
        console.log('  ✅ All cross-references are consistent across memory docs!');
    } else {
        console.log('  Cross-reference mismatches found:');
        for (const m of mismatches) {
            console.log(m);
        }
    }

    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
    console.log(`\n  Cross-Reference Score: ${score}% (${passedChecks}/${totalChecks} checks passed)`);
    return score;
}

function readMemFile(relativePath) {
    try {
        return fs.readFileSync(path.join(MEMORY_DIR, relativePath), 'utf-8');
    } catch (err) {
        return '';
    }
}

// ─── Main ────────────────────────────────────────────────────

function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  🩺 MEMORY HEALTH DASHBOARD — Learner Context Intelligence   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    const srcFiles = collectSourceFiles();
    console.log(`\n📂 Source files: ${srcFiles.length}`);

    // Run all checks
    const freshnessScore = checkFreshness(srcFiles);
    const coverageScore = checkFileMapCoverage(srcFiles);
    const adrScore = checkADRCoverage();
    const skillScore = checkSkillHealth(srcFiles);
    const workflowScore = checkWorkflows();
    const xrefScore = checkCrossReferenceConsistency();

    // Overall Health (6-factor weighted)
    const overallHealth = Math.round(
        (freshnessScore * 0.25) +
        (coverageScore * 0.20) +
        (adrScore * 0.12) +
        (skillScore * 0.13) +
        (workflowScore * 0.12) +
        (xrefScore * 0.18)
    );

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  🩺 OVERALL MEMORY HEALTH: ${overallHealth}%`);
    console.log('');
    console.log(`     Memory Freshness:      ${freshnessScore}%  (weight: 25%)`);
    console.log(`     File Map Coverage:     ${coverageScore}%  (weight: 20%)`);
    console.log(`     ADR Coverage:          ${adrScore}%  (weight: 12%)`);
    console.log(`     Skill Health:          ${skillScore}%  (weight: 13%)`);
    console.log(`     Workflow Health:       ${workflowScore}%  (weight: 12%)`);
    console.log(`     Cross-Ref Consistency: ${xrefScore}%  (weight: 18%)`);
    console.log('');

    if (overallHealth >= 90) {
        console.log('  ✅ EXCELLENT — Memory is in perfect sync with source code');
    } else if (overallHealth >= 70) {
        console.log('  ⚠️  GOOD — Minor updates needed');
    } else if (overallHealth >= 50) {
        console.log('  🟡 FAIR — Several memory docs need attention');
    } else {
        console.log('  🔴 CRITICAL — Memory is significantly out of date');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

    return overallHealth >= 70 ? 0 : 1;
}

try {
    const exitCode = main();
    process.exit(exitCode);
} catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[MemoryHealth] Fatal error: ${message}`);
    process.exit(1);
}
