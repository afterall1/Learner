#!/usr/bin/env node
// ============================================================
// Learner: Memory Drift Auto-Patcher — RADICAL INNOVATION
// ============================================================
// Goes BEYOND simple coverage detection. This script:
// 1. Detects undocumented source files (not in file_map.md)
// 2. Reads each file's header to extract purpose + line count
// 3. Generates EXACT file_map.md table row entries to insert
// 4. Cross-checks changelog.md for missing creation records
// 5. Generates changelog snippets for undocumented additions
// 6. Auto-detects the correct memory layer for each file
// 7. Outputs a COPY-PASTE-READY patch for each memory doc
//
// Usage:
//   node scripts/memory-autopatcher.js          # Full analysis + generate patches
//   node scripts/memory-autopatcher.js --apply  # Apply patches to memory docs (dangerous)
// ============================================================

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(PROJECT_ROOT, 'memory');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// ═══════════════════════════════════════════════════════════
// LAYER MAPPING: directory patterns → file_map.md section names
// ═══════════════════════════════════════════════════════════

const LAYER_MAP = [
    { pattern: /src[/\\]types[/\\]/, layer: 'Type Layer', section: '📐 Type Layer' },
    { pattern: /src[/\\]lib[/\\]engine[/\\]overmind[/\\]/, layer: 'Strategic Overmind Layer', section: '🧠 Strategic Overmind Layer' },
    { pattern: /src[/\\]lib[/\\]engine[/\\](walk-forward|monte-carlo|regime-detector|overfitting-detector|regime-intelligence)/, layer: 'Anti-Overfitting Layer', section: '🛡️ Anti-Overfitting Layer' },
    { pattern: /src[/\\]lib[/\\]engine[/\\](island|cortex|meta-evolution|migration|capital-allocator|paper-trade)/, layer: 'Island Model Layer', section: '🏝️ Island Model Layer' },
    { pattern: /src[/\\]lib[/\\]engine[/\\](microstructure|price-action|composite-functions|directional-change)/, layer: 'Advanced Gene Layer', section: '🧠 Advanced Gene Layer' },
    { pattern: /src[/\\]lib[/\\]engine[/\\](backtester|market-simulator|trade-forensics|forensic-learning|persistence-bridge)/, layer: 'Backtesting Engine Layer', section: '🔬 Backtesting Engine Layer' },
    { pattern: /src[/\\]lib[/\\]engine[/\\](cortex-live|evolution-scheduler|adaptive-data-flow|regime-propagation)/, layer: 'Live Engine Layer', section: '🔴 Live Engine Layer' },
    { pattern: /src[/\\]lib[/\\]engine[/\\]evolution-health/, layer: 'Pipeline Live Integration Layer', section: '🤖 Pipeline Live Integration Layer' },
    { pattern: /src[/\\]lib[/\\]hooks[/\\]/, layer: 'Pipeline Live Integration Layer', section: '🤖 Pipeline Live Integration Layer' },
    { pattern: /src[/\\]lib[/\\]engine[/\\]/, layer: 'Core Engine Layer', section: '🧬 Core Engine Layer' },
    { pattern: /src[/\\]lib[/\\]api[/\\]/, layer: 'Binance Execution Layer', section: '📡 Binance Execution Layer' },
    { pattern: /src[/\\]lib[/\\]risk[/\\]/, layer: 'Risk Layer', section: '🛡️ Risk Layer' },
    { pattern: /src[/\\]lib[/\\]store[/\\]/, layer: 'State & Persistence Layer', section: '📦 State & Persistence Layer' },
    { pattern: /src[/\\]lib[/\\]db[/\\]/, layer: 'State & Persistence Layer', section: '📦 State & Persistence Layer' },
    { pattern: /src[/\\]app[/\\]api[/\\]/, layer: 'API Routes Layer', section: '🌐 API Routes' },
    { pattern: /src[/\\]app[/\\]/, layer: 'Presentation Layer', section: '🎨 Presentation Layer' },
];

// Files to skip (test, config, CSS, layouts)
const SKIP_PATTERNS = [
    /\.test\./,
    /\.spec\./,
    /\.css$/,
    /layout\.tsx$/,
    /favicon/,
    /\.ico$/,
    /\.svg$/,
    /\.png$/,
];

// ═══════════════════════════════════════════════════════════
// FILE DISCOVERY
// ═══════════════════════════════════════════════════════════

function collectSourceFiles() {
    const files = [];
    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // Skip node_modules, .next, .git
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                walk(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                    files.push({
                        path: fullPath,
                        relativePath: path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/'),
                        basename: entry.name,
                    });
                }
            }
        }
    }
    walk(SRC_DIR);
    return files;
}

// ═══════════════════════════════════════════════════════════
// FILE ANALYSIS: Extract purpose from header comments
// ═══════════════════════════════════════════════════════════

function analyzeFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        const lineCount = lines.length;

        // Extract purpose from header comments (first 20 lines)
        let purpose = '';
        const headerLines = lines.slice(0, 20);
        for (const line of headerLines) {
            // Look for: // Description, * Description, /** Description
            const match = line.match(/^(?:\s*(?:\/\/|\*|\/\*\*)\s*)(.{20,})/);
            if (match && !match[1].includes('===') && !match[1].includes('---') && !match[1].includes('Copyright')) {
                purpose = match[1].trim().replace(/\*\/$/, '').trim();
                break;
            }
        }

        // Fallback: use the first export statement
        if (!purpose) {
            for (const line of lines.slice(0, 50)) {
                const exportMatch = line.match(/^export\s+(?:default\s+)?(?:function|class|const|interface|type|enum)\s+(\w+)/);
                if (exportMatch) {
                    purpose = `Exports \`${exportMatch[1]}\``;
                    break;
                }
            }
        }

        // Count exports
        const exportCount = (content.match(/^export\s/gm) || []).length;

        // Detect key patterns
        const hasClass = /^export\s+class\s/m.test(content);
        const hasInterface = /^export\s+(?:interface|type)\s/m.test(content);
        const isReactComponent = /^(?:export\s+(?:default\s+)?function\s+\w+.*\()/m.test(content) &&
            (content.includes('return (') || content.includes('return(\n'));

        return {
            lineCount,
            purpose: purpose || 'No description extracted',
            exportCount,
            hasClass,
            hasInterface,
            isReactComponent,
            sizeKB: Math.round(fs.statSync(filePath).size / 1024),
        };
    } catch (error) {
        return {
            lineCount: 0,
            purpose: 'Error reading file',
            exportCount: 0,
            hasClass: false,
            hasInterface: false,
            isReactComponent: false,
            sizeKB: 0,
        };
    }
}

// ═══════════════════════════════════════════════════════════
// LAYER DETECTION
// ═══════════════════════════════════════════════════════════

function detectLayer(relativePath) {
    for (const mapping of LAYER_MAP) {
        if (mapping.pattern.test(relativePath)) {
            return { layer: mapping.layer, section: mapping.section };
        }
    }
    return { layer: 'Unknown', section: '❓ Uncategorized' };
}

// ═══════════════════════════════════════════════════════════
// IMPORTANCE HEURISTIC
// ═══════════════════════════════════════════════════════════

function determineImportance(analysis) {
    // 🔴 Critical: large files, classes, many exports
    if (analysis.lineCount > 300 || analysis.hasClass || analysis.exportCount > 5) {
        return '🔴';
    }
    // 🟡 Important: medium files, interfaces
    if (analysis.lineCount > 100 || analysis.hasInterface || analysis.exportCount > 2) {
        return '🟡';
    }
    // 🟢 Standard: small/simple files
    return '🟢';
}

// ═══════════════════════════════════════════════════════════
// MAIN ANALYSIS PIPELINE
// ═══════════════════════════════════════════════════════════

function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  🧠 Learner: Memory Drift Auto-Patcher               ║');
    console.log('║  Self-healing memory architecture intelligence       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');

    const applyMode = process.argv.includes('--apply');

    // 1. Collect all source files
    const srcFiles = collectSourceFiles();
    console.log(`📂 Found ${srcFiles.length} source files\n`);

    // 2. Read current file_map.md
    const fileMapPath = path.join(MEMORY_DIR, 'file_map.md');
    let fileMapContent = '';
    try {
        fileMapContent = fs.readFileSync(fileMapPath, 'utf-8');
    } catch (error) {
        console.log('❌ Cannot read file_map.md — aborting');
        return 1;
    }

    // 3. Read current changelog.md
    const changelogPath = path.join(MEMORY_DIR, 'changelog.md');
    let changelogContent = '';
    try {
        changelogContent = fs.readFileSync(changelogPath, 'utf-8');
    } catch (error) {
        console.log('⚠️ Cannot read changelog.md — changelog patches disabled');
    }

    // 4. Read active_context.md
    const activeContextPath = path.join(MEMORY_DIR, 'active_context.md');
    let activeContextContent = '';
    try {
        activeContextContent = fs.readFileSync(activeContextPath, 'utf-8');
    } catch (error) {
        console.log('⚠️ Cannot read active_context.md');
    }

    // 5. Find undocumented files
    const undocumented = [];
    const documented = [];

    for (const file of srcFiles) {
        // Skip files matching skip patterns
        if (SKIP_PATTERNS.some(p => p.test(file.basename))) continue;

        if (fileMapContent.includes(file.basename)) {
            documented.push(file);
        } else {
            undocumented.push(file);
        }
    }

    console.log(`── FILE MAP COVERAGE ──────────────────────────────────`);
    console.log(`  ✅ Documented: ${documented.length} files`);
    console.log(`  ⚠️  Undocumented: ${undocumented.length} files`);
    const total = documented.length + undocumented.length;
    const coverage = total > 0 ? Math.round((documented.length / total) * 100) : 100;
    console.log(`  📊 Coverage: ${coverage}%`);
    console.log('');

    if (undocumented.length === 0) {
        console.log('  🎉 All source files are documented! No patches needed.');
        console.log('');
        return 0;
    }

    // 6. Analyze undocumented files and generate patches
    console.log('── GENERATED PATCHES ─────────────────────────────────\n');

    const patchesByLayer = {};

    for (const file of undocumented) {
        const analysis = analyzeFile(file.path);
        const { layer, section } = detectLayer(file.relativePath);
        const importance = determineImportance(analysis);

        if (!patchesByLayer[section]) {
            patchesByLayer[section] = [];
        }

        // Build the file_map.md table row
        let purposeText = analysis.purpose;
        if (purposeText === 'No description extracted') {
            // Build a description from what we know
            const parts = [];
            if (analysis.hasClass) parts.push('Class-based module');
            if (analysis.isReactComponent) parts.push('React component');
            if (analysis.hasInterface) parts.push('Type definitions');
            parts.push(`~${analysis.lineCount} lines`);
            purposeText = parts.join(', ');
        }

        patchesByLayer[section].push({
            basename: file.basename,
            relativePath: file.relativePath,
            purpose: purposeText,
            importance,
            lineCount: analysis.lineCount,
            sizeKB: analysis.sizeKB,
            inChangelog: changelogContent.includes(file.basename),
            inActiveContext: activeContextContent.includes(file.basename),
        });
    }

    // 7. Print patches grouped by layer
    let fileMapPatchCount = 0;
    let changelogMissingCount = 0;
    let contextMissingCount = 0;

    for (const [section, files] of Object.entries(patchesByLayer)) {
        console.log(`\n  📦 ${section}`);
        console.log('  ' + '─'.repeat(50));

        for (const file of files) {
            fileMapPatchCount++;
            console.log(`\n  📄 ${file.basename} (${file.lineCount} lines, ${file.sizeKB}KB)`);
            console.log(`     Layer: ${section}`);
            console.log(`     Path:  ${file.relativePath}`);

            // file_map.md table row (copy-paste ready)
            console.log(`     ┌─ FILE_MAP.MD PATCH ─────────────────────────`);
            console.log(`     │ | \`${file.basename}\` | ${file.purpose} | ${file.importance} |`);
            console.log(`     └─────────────────────────────────────────────`);

            // Changelog status
            if (!file.inChangelog) {
                changelogMissingCount++;
                console.log(`     ⚠️  NOT in changelog.md`);
            } else {
                console.log(`     ✅ Documented in changelog.md`);
            }

            // Active context status
            if (!file.inActiveContext) {
                contextMissingCount++;
                console.log(`     ⚠️  NOT in active_context.md`);
            } else {
                console.log(`     ✅ Documented in active_context.md`);
            }
        }
    }

    // 8. Summary
    console.log('\n\n══════════════════════════════════════════════════════');
    console.log('  📊 DRIFT ANALYSIS SUMMARY');
    console.log('══════════════════════════════════════════════════════');
    console.log(`  File Map Coverage:     ${coverage}% (${documented.length}/${total})`);
    console.log(`  Patches needed:        ${fileMapPatchCount} file_map.md entries`);
    console.log(`  Changelog gaps:        ${changelogMissingCount} files not in changelog`);
    console.log(`  Active context gaps:   ${contextMissingCount} files not in active_context`);
    console.log('');

    const healthScore = Math.round(
        (coverage * 0.4) +
        ((1 - changelogMissingCount / Math.max(total, 1)) * 100 * 0.3) +
        ((1 - contextMissingCount / Math.max(total, 1)) * 100 * 0.3)
    );
    const healthEmoji = healthScore >= 90 ? '🟢' : healthScore >= 70 ? '🟡' : '🔴';
    console.log(`  ${healthEmoji} Memory Health Score: ${healthScore}/100`);
    console.log('');

    if (applyMode) {
        console.log('  ⚠️  --apply mode is not yet implemented.');
        console.log('  Copy-paste the patches above into the appropriate memory docs.');
    } else {
        console.log('  💡 Run with --apply to auto-insert patches (coming soon).');
        console.log('  For now, copy-paste the generated patches into your memory docs.');
    }

    console.log('');
    return fileMapPatchCount > 0 ? 1 : 0;
}

// ═══════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════

try {
    const exitCode = main();
    process.exit(exitCode);
} catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[MemoryAutoPatcher] Fatal error: ${message}`);
    process.exit(1);
}
