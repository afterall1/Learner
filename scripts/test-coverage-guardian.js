#!/usr/bin/env node

// ============================================================
// Learner: Test Coverage Guardian — Phase 25 Radical Innovation
// ============================================================
// Automatic test coverage analysis that goes BEYOND line coverage:
//
// 1. Function Discovery: Scans all engine modules for exported functions
// 2. Test Mapping: Cross-references each function with test file imports
// 3. Coverage Scoring: Per-module and overall function coverage %
// 4. Gap Detection: Lists untested exported functions by importance
// 5. Staleness Check: Detects test files older than source files
//
// Usage: node scripts/test-coverage-guardian.js
// ============================================================

const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────

const ENGINE_DIR = path.join(__dirname, '..', 'src', 'lib', 'engine');
const RISK_DIR = path.join(__dirname, '..', 'src', 'lib', 'risk');
const HOOKS_DIR = path.join(__dirname, '..', 'src', 'lib', 'hooks');
const TEST_DIRS = [
    path.join(ENGINE_DIR, '__tests__'),
    path.join(RISK_DIR, '__tests__'),
    path.join(HOOKS_DIR, '__tests__'),
];

// Critical modules that MUST have test coverage
const CRITICAL_MODULES = [
    'evaluator.ts',
    'signal-engine.ts',
    'evolution.ts',
    'strategy-dna.ts',
    'walk-forward.ts',
    'monte-carlo.ts',
    'overfitting-detector.ts',
    'regime-detector.ts',
    'microstructure-genes.ts',
    'price-action-genes.ts',
    'migration.ts',
    'capital-allocator.ts',
    'backtester.ts',
    'market-simulator.ts',
    'manager.ts',
];

// ─── Phase 1: Discover Exported Functions ────────────────────

function discoverExportedFunctions(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const functions = [];

        // Match: export function name(
        const funcRegex = /export\s+function\s+(\w+)\s*\(/g;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
            functions.push({ name: match[1], type: 'function' });
        }

        // Match: export const name = (  or export const name: ... = (
        const constFuncRegex = /export\s+const\s+(\w+)\s*[=:][^=]*(?:=>|\()/g;
        while ((match = constFuncRegex.exec(content)) !== null) {
            // Skip if it's a config object (all caps or ends with CONFIG/DEFAULT)
            if (!/^[A-Z_]+$/.test(match[1]) && !match[1].endsWith('CONFIG')) {
                functions.push({ name: match[1], type: 'const-function' });
            }
        }

        // Match: export class Name
        const classRegex = /export\s+class\s+(\w+)/g;
        while ((match = classRegex.exec(content)) !== null) {
            functions.push({ name: match[1], type: 'class' });
        }

        // Match: export enum Name
        const enumRegex = /export\s+enum\s+(\w+)/g;
        while ((match = enumRegex.exec(content)) !== null) {
            functions.push({ name: match[1], type: 'enum' });
        }

        // Match: export interface Name
        const interfaceRegex = /export\s+interface\s+(\w+)/g;
        while ((match = interfaceRegex.exec(content)) !== null) {
            functions.push({ name: match[1], type: 'interface' });
        }

        return functions;
    } catch (error) {
        return [];
    }
}

// ─── Phase 2: Discover Test References ───────────────────────

function discoverTestReferences(testDirs) {
    const references = new Map(); // functionName → [testFile, ...]

    for (const dir of testDirs) {
        if (!fs.existsSync(dir)) continue;

        const testFiles = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

        for (const file of testFiles) {
            const filePath = path.join(dir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf8');

                // Extract all imported identifiers
                const importRegex = /import\s*\{([^}]+)\}\s*from/g;
                let match;
                while ((match = importRegex.exec(content)) !== null) {
                    const imports = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
                    for (const imp of imports) {
                        if (imp && imp !== 'type') {
                            if (!references.has(imp)) references.set(imp, []);
                            references.get(imp).push(file);
                        }
                    }
                }

                // Also scan for function calls in test body (not just imports)
                const callRegex = /\b(calculate\w+|evaluate\w+|generate\w+|run\w+|crossover\w+|mutate\w+|detect\w+|adapt\w+)\s*\(/g;
                while ((match = callRegex.exec(content)) !== null) {
                    const funcName = match[1];
                    if (!references.has(funcName)) references.set(funcName, []);
                    if (!references.get(funcName).includes(file)) {
                        references.get(funcName).push(file);
                    }
                }
            } catch (error) {
                // Skip unreadable files
            }
        }
    }

    return references;
}

// ─── Phase 3: Count Tests Per File ───────────────────────────

function countTests(testDirs) {
    const counts = {};
    let total = 0;

    for (const dir of testDirs) {
        if (!fs.existsSync(dir)) continue;

        const testFiles = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

        for (const file of testFiles) {
            const filePath = path.join(dir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const itCount = (content.match(/\bit\s*\(/g) || []).length;
                counts[file] = itCount;
                total += itCount;
            } catch (error) {
                counts[file] = 0;
            }
        }
    }

    return { counts, total };
}

// ─── Phase 4: Staleness Detection ────────────────────────────

function detectStaleness(engineDir, testDirs) {
    const staleTests = [];

    for (const dir of testDirs) {
        if (!fs.existsSync(dir)) continue;

        const testFiles = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

        for (const file of testFiles) {
            const testPath = path.join(dir, file);
            const testStat = fs.statSync(testPath);

            // Try to find corresponding source file
            const baseName = file.replace('.test.ts', '.ts');
            const possibleSources = [
                path.join(engineDir, baseName),
                path.join(engineDir, baseName.replace('-', '_')),
            ];

            for (const sourcePath of possibleSources) {
                if (fs.existsSync(sourcePath)) {
                    const sourceStat = fs.statSync(sourcePath);
                    if (sourceStat.mtimeMs > testStat.mtimeMs + 86400000) { // Source modified >24h after test
                        staleTests.push({
                            test: file,
                            source: path.basename(sourcePath),
                            testAge: testStat.mtime.toISOString().split('T')[0],
                            sourceAge: sourceStat.mtime.toISOString().split('T')[0],
                        });
                    }
                }
            }
        }
    }

    return staleTests;
}

// ─── Phase 5: Generate Report ────────────────────────────────

function generateReport() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  🛡️  TEST COVERAGE GUARDIAN — Learner Phase 25       ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // Discover all source modules
    const sourceModules = [];
    const scanDirs = [ENGINE_DIR, RISK_DIR, HOOKS_DIR];

    for (const dir of scanDirs) {
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir).filter(f =>
            f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts')
        );

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                const exported = discoverExportedFunctions(filePath);
                const isCritical = CRITICAL_MODULES.includes(file);
                sourceModules.push({ file, filePath, exported, isCritical });
            }
        }
    }

    // Discover test references
    const testRefs = discoverTestReferences(TEST_DIRS);

    // Count tests
    const { counts: testCounts, total: totalTests } = countTests(TEST_DIRS);

    // ── Section 1: Test File Summary ──
    console.log('━━━ 📊 Test File Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const testFileEntries = Object.entries(testCounts).sort((a, b) => b[1] - a[1]);
    for (const [file, count] of testFileEntries) {
        const bar = '█'.repeat(Math.ceil(count / 2));
        console.log(`  ${file.padEnd(40)} ${String(count).padStart(3)} tests  ${bar}`);
    }
    console.log(`${''.padEnd(44)} ───────`);
    console.log(`  ${'TOTAL'.padEnd(40)} ${String(totalTests).padStart(3)} tests\n`);

    // ── Section 2: Function Coverage Analysis ──
    console.log('━━━ 🔍 Function Coverage Analysis ━━━━━━━━━━━━━━━━━━━\n');

    let totalFunctions = 0;
    let testedFunctions = 0;
    let criticalUntested = [];
    let standardUntested = [];
    const moduleScores = [];

    for (const mod of sourceModules) {
        const funcsOnly = mod.exported.filter(e =>
            e.type === 'function' || e.type === 'const-function' || e.type === 'class'
        );

        if (funcsOnly.length === 0) continue;

        let modTested = 0;
        const modUntested = [];

        for (const func of funcsOnly) {
            totalFunctions++;
            if (testRefs.has(func.name)) {
                testedFunctions++;
                modTested++;
            } else {
                modUntested.push(func);
            }
        }

        const coveragePct = funcsOnly.length > 0
            ? Math.round((modTested / funcsOnly.length) * 100)
            : 0;

        const icon = mod.isCritical ? '🔴' : '🟢';
        const coverageBar = coveragePct >= 80 ? '✅' : coveragePct >= 50 ? '⚠️' : '❌';

        moduleScores.push({
            file: mod.file,
            total: funcsOnly.length,
            tested: modTested,
            coverage: coveragePct,
            isCritical: mod.isCritical,
        });

        for (const func of modUntested) {
            if (mod.isCritical) {
                criticalUntested.push({ module: mod.file, func: func.name, type: func.type });
            } else {
                standardUntested.push({ module: mod.file, func: func.name, type: func.type });
            }
        }
    }

    // Sort by coverage ascending (worst first)
    moduleScores.sort((a, b) => a.coverage - b.coverage);

    for (const mod of moduleScores) {
        const icon = mod.isCritical ? '🔴' : '🟢';
        const coverageBar = mod.coverage >= 80 ? '✅' : mod.coverage >= 50 ? '⚠️' : '❌';
        const pctStr = `${mod.coverage}%`.padStart(4);
        const bar = '█'.repeat(Math.ceil(mod.coverage / 5));
        console.log(`  ${icon} ${mod.file.padEnd(35)} ${mod.tested}/${mod.total}  ${pctStr}  ${coverageBar}  ${bar}`);
    }

    const overallCoverage = totalFunctions > 0
        ? Math.round((testedFunctions / totalFunctions) * 100)
        : 0;

    console.log(`\n  📈 Overall Function Coverage: ${testedFunctions}/${totalFunctions} (${overallCoverage}%)\n`);

    // ── Section 3: Critical Gaps ──
    if (criticalUntested.length > 0) {
        console.log('━━━ 🚨 Critical Untested Functions ━━━━━━━━━━━━━━━━━━\n');
        console.log('  These are exported functions in 🔴 Critical modules');
        console.log('  that have NO test references anywhere:\n');

        for (const gap of criticalUntested) {
            console.log(`  ❌ ${gap.module} → ${gap.func}() [${gap.type}]`);
        }
        console.log();
    }

    // ── Section 4: Staleness Check ──
    const stale = detectStaleness(ENGINE_DIR, TEST_DIRS);
    if (stale.length > 0) {
        console.log('━━━ ⏰ Stale Tests (source modified after test) ━━━━━\n');
        for (const s of stale) {
            console.log(`  ⚠️  ${s.test} (${s.testAge}) ← ${s.source} (${s.sourceAge})`);
        }
        console.log();
    }

    // ── Section 5: Health Score ──
    console.log('━━━ 🏥 Test Health Score ━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const criticalCoverage = moduleScores.filter(m => m.isCritical);
    const criticalCovPct = criticalCoverage.length > 0
        ? Math.round(criticalCoverage.reduce((s, m) => s + m.coverage, 0) / criticalCoverage.length)
        : 0;

    const hasChaosMonkey = testCounts['property-fuzzer.test.ts'] > 0;
    const stalePenalty = stale.length * 5;
    const baseScore = Math.round(overallCoverage * 0.4 + criticalCovPct * 0.4 + (hasChaosMonkey ? 20 : 0));
    const healthScore = Math.max(0, Math.min(100, baseScore - stalePenalty));

    const grade = healthScore >= 90 ? 'A' : healthScore >= 75 ? 'B' : healthScore >= 60 ? 'C' : healthScore >= 40 ? 'D' : 'F';
    const gradeEmoji = grade === 'A' ? '🏆' : grade === 'B' ? '✅' : grade === 'C' ? '⚠️' : '❌';

    console.log(`  Overall Coverage:   ${overallCoverage}% (weight: 40%)`);
    console.log(`  Critical Coverage:  ${criticalCovPct}% (weight: 40%)`);
    console.log(`  Chaos Monkey:       ${hasChaosMonkey ? '✅ Active' : '❌ Missing'} (weight: 20%)`);
    console.log(`  Stale Test Penalty: -${stalePenalty}`);
    console.log(`  ─────────────────────────────`);
    console.log(`  ${gradeEmoji} Test Health Score: ${healthScore}/100 (Grade ${grade})\n`);

    // ── Section 6: Recommendations ──
    if (criticalUntested.length > 0 || overallCoverage < 60) {
        console.log('━━━ 💡 Recommendations ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (criticalUntested.length > 0) {
            const topGaps = criticalUntested.slice(0, 5);
            console.log('  Priority 1: Add tests for these critical functions:');
            for (const gap of topGaps) {
                console.log(`    → ${gap.module}::${gap.func}()`);
            }
            console.log();
        }

        if (overallCoverage < 60) {
            const worstModules = moduleScores.filter(m => m.coverage < 50).slice(0, 3);
            if (worstModules.length > 0) {
                console.log('  Priority 2: Improve these low-coverage modules:');
                for (const mod of worstModules) {
                    console.log(`    → ${mod.file} (${mod.coverage}%)`);
                }
                console.log();
            }
        }
    }

    console.log('══════════════════════════════════════════════════════\n');
}

// ─── Main ────────────────────────────────────────────────────

generateReport();
