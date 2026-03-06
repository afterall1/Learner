#!/usr/bin/env node
/**
 * Context DNA Fingerprint — Memory Integrity Verification System
 * 
 * This script creates a cryptographic fingerprint of the project's memory architecture
 * and source code structure. It detects "drift" — when source files change but memory
 * documentation hasn't been updated to reflect those changes.
 * 
 * Usage:
 *   node memory/scripts/context-fingerprint.js --generate   # Create/update fingerprint
 *   node memory/scripts/context-fingerprint.js --verify     # Check for drift
 *   node memory/scripts/context-fingerprint.js --report      # Detailed drift report
 *   node memory/scripts/context-fingerprint.js --smart-sync  # Auto-detect which docs need updating
 * 
 * The fingerprint tracks:
 *   1. Source file hashes (detects code changes)
 *   2. Memory file hashes (detects doc updates)
 *   3. Cross-reference matrix (validates doc coverage)
 *   4. Structural integrity (validates file existence)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const FINGERPRINT_PATH = path.resolve(__dirname, '..', '_FINGERPRINT.json');

/** Source files tracked for drift detection */
const SOURCE_FILES = [
    // Type Layer
    'src/types/index.ts',
    'src/types/trading-slot.ts',
    // Core Engine Layer
    'src/lib/engine/strategy-dna.ts',
    'src/lib/engine/evaluator.ts',
    'src/lib/engine/signal-engine.ts',
    'src/lib/engine/evolution.ts',
    'src/lib/engine/experience-replay.ts',
    'src/lib/engine/brain.ts',
    // Advanced Gene Layer (Phase 9)
    'src/lib/engine/microstructure-genes.ts',
    'src/lib/engine/price-action-genes.ts',
    'src/lib/engine/composite-functions.ts',
    'src/lib/engine/directional-change.ts',
    // Backtesting Engine Layer (Phase 10)
    'src/lib/engine/backtester.ts',
    'src/lib/engine/market-simulator.ts',
    // Anti-Overfitting Layer
    'src/lib/engine/walk-forward.ts',
    'src/lib/engine/monte-carlo.ts',
    'src/lib/engine/regime-detector.ts',
    'src/lib/engine/overfitting-detector.ts',
    // Island Model Layer
    'src/lib/engine/island.ts',
    'src/lib/engine/cortex.ts',
    'src/lib/engine/meta-evolution.ts',
    'src/lib/engine/migration.ts',
    'src/lib/engine/capital-allocator.ts',
    // Risk Layer
    'src/lib/risk/manager.ts',
    // State Layer
    'src/lib/store/index.ts',
    // Presentation Layer
    'src/app/page.tsx',
    'src/app/pipeline/page.tsx',
    'src/app/globals.css',
    'src/app/layout.tsx',
];

/** Memory files that must stay in sync with source */
const MEMORY_FILES = [
    'memory/overview.md',
    'memory/active_context.md',
    'memory/architecture/system_design.md',
    'memory/file_map.md',
    'memory/changelog.md',
    'memory/_SYNC_CHECKLIST.md',
];

/** Cross-reference rules: source → which memory files should mention it */
const CROSS_REFERENCES = {
    'src/lib/engine/meta-evolution.ts': [
        'memory/overview.md',
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/lib/engine/island.ts': [
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/lib/engine/cortex.ts': [
        'memory/file_map.md',
        'memory/architecture/system_design.md',
        'memory/active_context.md',
    ],
    // Advanced Gene Layer (Phase 9)
    'src/lib/engine/microstructure-genes.ts': [
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/lib/engine/price-action-genes.ts': [
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/lib/engine/composite-functions.ts': [
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/lib/engine/directional-change.ts': [
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/lib/engine/signal-engine.ts': [
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/lib/engine/experience-replay.ts': [
        'memory/file_map.md',
    ],
    // Backtesting Engine Layer (Phase 10)
    'src/lib/engine/backtester.ts': [
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/lib/engine/market-simulator.ts': [
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/app/page.tsx': [
        'memory/overview.md',
        'memory/file_map.md',
    ],
    'src/app/pipeline/page.tsx': [
        'memory/overview.md',
        'memory/file_map.md',
        'memory/architecture/system_design.md',
    ],
    'src/app/globals.css': [
        'memory/file_map.md',
    ],
};

/** Smart Sync Rules: source file → which memory docs to update and what to check */
const SYNC_RULES = {
    'src/types/index.ts': {
        docs: ['memory/overview.md', 'memory/file_map.md'],
        check: 'Type system changes: update Module Map + File Map descriptions',
    },
    'src/types/trading-slot.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'TradingSlot changes: update File Map + System Design Island architecture',
    },
    'src/lib/engine/strategy-dna.ts': {
        docs: ['memory/architecture/system_design.md', 'memory/overview.md', 'memory/file_map.md'],
        check: 'DNA changes: update System Design DNA flow + Overview Module Map + File Map',
    },
    'src/lib/engine/evaluator.ts': {
        docs: ['memory/architecture/system_design.md'],
        check: 'Evaluator changes: update System Design fitness scoring section',
    },
    'src/lib/engine/signal-engine.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Signal Engine changes: update File Map + System Design Advanced Gene Signal Flow',
    },
    'src/lib/engine/evolution.ts': {
        docs: ['memory/architecture/system_design.md'],
        check: 'Evolution changes: update System Design GA pipeline section',
    },
    'src/lib/engine/experience-replay.ts': {
        docs: ['memory/file_map.md'],
        check: 'Experience Replay changes: update File Map pattern types',
    },
    'src/lib/engine/brain.ts': {
        docs: ['memory/architecture/system_design.md', 'memory/active_context.md'],
        check: 'Brain changes: update System Design lifecycle + Active Context brain status',
    },
    // Advanced Gene Layer (Phase 9)
    'src/lib/engine/microstructure-genes.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Microstructure Gene changes: update File Map Advanced Gene Layer + System Design signal flow',
    },
    'src/lib/engine/price-action-genes.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Price Action Gene changes: update File Map Advanced Gene Layer + System Design signal flow',
    },
    'src/lib/engine/composite-functions.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Composite Function changes: update File Map Advanced Gene Layer + System Design signal flow',
    },
    'src/lib/engine/directional-change.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Directional Change changes: update File Map Advanced Gene Layer + System Design signal flow',
    },
    // Backtesting Engine Layer (Phase 10)
    'src/lib/engine/backtester.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Backtester changes: update File Map Backtesting Engine Layer + System Design backtest data flow',
    },
    'src/lib/engine/market-simulator.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Market Simulator changes: update File Map Backtesting Engine Layer + System Design execution modeling',
    },
    'src/lib/engine/island.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Island changes: update File Map + System Design Island architecture',
    },
    'src/lib/engine/cortex.ts': {
        docs: ['memory/file_map.md', 'memory/architecture/system_design.md', 'memory/active_context.md'],
        check: 'Cortex changes: update File Map + System Design Cortex flow + Active Context brain status',
    },
    'src/lib/engine/meta-evolution.ts': {
        docs: ['memory/overview.md', 'memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Meta-Evolution changes: update Overview key features + File Map + System Design GA² flow',
    },
    'src/lib/engine/migration.ts': {
        docs: ['memory/architecture/system_design.md'],
        check: 'Migration changes: update System Design migration topology',
    },
    'src/lib/engine/capital-allocator.ts': {
        docs: ['memory/architecture/system_design.md'],
        check: 'Capital Allocator changes: update System Design capital allocation flow',
    },
    'src/lib/risk/manager.ts': {
        docs: ['memory/overview.md', 'memory/architecture/system_design.md'],
        check: 'Risk changes: update Overview Critical Rules + System Design risk integration',
    },
    'src/lib/store/index.ts': {
        docs: ['memory/architecture/system_design.md'],
        check: 'Store changes: update System Design store architecture table',
    },
    'src/app/page.tsx': {
        docs: ['memory/overview.md', 'memory/file_map.md'],
        check: 'Main dashboard changes: update Overview dashboard panels + File Map',
    },
    'src/app/pipeline/page.tsx': {
        docs: ['memory/overview.md', 'memory/file_map.md', 'memory/architecture/system_design.md'],
        check: 'Pipeline dashboard changes: update Overview pipeline panels + File Map + System Design pipeline data flow',
    },
    'src/app/globals.css': {
        docs: ['memory/file_map.md'],
        check: 'CSS changes: update File Map line count (styling only, no arch changes)',
    },
};

// ═══════════════════════════════════════════════════════════════
// CORE ENGINE
// ═══════════════════════════════════════════════════════════════

function hashFile(filePath) {
    try {
        const fullPath = path.resolve(PROJECT_ROOT, filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    } catch (err) {
        return null; // File doesn't exist
    }
}

function countLines(filePath) {
    try {
        const fullPath = path.resolve(PROJECT_ROOT, filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        return content.split('\n').length;
    } catch (err) {
        return 0;
    }
}

function fileContains(memoryFile, searchTerm) {
    try {
        const fullPath = path.resolve(PROJECT_ROOT, memoryFile);
        const content = fs.readFileSync(fullPath, 'utf-8').toLowerCase();
        return content.includes(searchTerm.toLowerCase());
    } catch (err) {
        return false;
    }
}

function generateFingerprint() {
    const timestamp = new Date().toISOString();
    const sourceHashes = {};
    const memoryHashes = {};
    const lineCounts = {};
    const crossRefStatus = {};

    // Hash all source files
    for (const file of SOURCE_FILES) {
        sourceHashes[file] = hashFile(file);
        lineCounts[file] = countLines(file);
    }

    // Hash all memory files
    for (const file of MEMORY_FILES) {
        memoryHashes[file] = hashFile(file);
    }

    // Validate cross-references
    for (const [sourceFile, memoryFiles] of Object.entries(CROSS_REFERENCES)) {
        const baseName = path.basename(sourceFile, path.extname(sourceFile));
        crossRefStatus[sourceFile] = {};
        for (const memFile of memoryFiles) {
            crossRefStatus[sourceFile][memFile] = fileContains(memFile, baseName);
        }
    }

    const fingerprint = {
        version: '1.0.0',
        generatedAt: timestamp,
        projectVersion: detectProjectVersion(),
        sourceHashes,
        memoryHashes,
        lineCounts,
        crossRefStatus,
        structuralIntegrity: {
            sourceFilesPresent: Object.values(sourceHashes).filter(h => h !== null).length,
            sourceFilesTotal: SOURCE_FILES.length,
            memoryFilesPresent: Object.values(memoryHashes).filter(h => h !== null).length,
            memoryFilesTotal: MEMORY_FILES.length,
        },
    };

    return fingerprint;
}

function detectProjectVersion() {
    try {
        const changelog = fs.readFileSync(
            path.resolve(PROJECT_ROOT, 'memory/changelog.md'), 'utf-8'
        );
        const match = changelog.match(/## \[v([\d.]+)\]/);
        return match ? `v${match[1]}` : 'unknown';
    } catch (err) {
        return 'unknown';
    }
}

function loadFingerprint() {
    try {
        const content = fs.readFileSync(FINGERPRINT_PATH, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        return null;
    }
}

function saveFingerprint(fingerprint) {
    fs.writeFileSync(FINGERPRINT_PATH, JSON.stringify(fingerprint, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// DRIFT DETECTION
// ═══════════════════════════════════════════════════════════════

function detectDrift(previous, current) {
    const drifts = [];

    // Check for source file changes without memory updates
    for (const file of SOURCE_FILES) {
        const prevHash = previous.sourceHashes[file];
        const currHash = current.sourceHashes[file];

        if (prevHash && currHash && prevHash !== currHash) {
            // Source file changed — check if any memory file also changed
            let memoryUpdated = false;
            for (const memFile of MEMORY_FILES) {
                if (previous.memoryHashes[memFile] !== current.memoryHashes[memFile]) {
                    memoryUpdated = true;
                    break;
                }
            }

            if (!memoryUpdated) {
                drifts.push({
                    type: 'SOURCE_CHANGED_NO_MEMORY_UPDATE',
                    severity: 'HIGH',
                    file,
                    message: `${file} changed but no memory files were updated`,
                });
            }
        }
    }

    // Check cross-reference integrity
    for (const [sourceFile, refs] of Object.entries(current.crossRefStatus)) {
        for (const [memFile, found] of Object.entries(refs)) {
            if (!found) {
                drifts.push({
                    type: 'MISSING_CROSS_REFERENCE',
                    severity: 'MEDIUM',
                    file: sourceFile,
                    memoryFile: memFile,
                    message: `${memFile} does not reference ${path.basename(sourceFile)}`,
                });
            }
        }
    }

    // Check for missing files
    for (const file of SOURCE_FILES) {
        if (current.sourceHashes[file] === null) {
            drifts.push({
                type: 'SOURCE_FILE_MISSING',
                severity: 'CRITICAL',
                file,
                message: `Source file ${file} is expected but does not exist`,
            });
        }
    }

    for (const file of MEMORY_FILES) {
        if (current.memoryHashes[file] === null) {
            drifts.push({
                type: 'MEMORY_FILE_MISSING',
                severity: 'CRITICAL',
                file,
                message: `Memory file ${file} is expected but does not exist`,
            });
        }
    }

    // Check line count anomalies (significant size changes)
    for (const file of SOURCE_FILES) {
        const prevLines = previous.lineCounts[file] || 0;
        const currLines = current.lineCounts[file] || 0;
        if (prevLines > 0 && currLines > 0) {
            const changePercent = Math.abs(currLines - prevLines) / prevLines;
            if (changePercent > 0.3) { // >30% size change
                drifts.push({
                    type: 'SIGNIFICANT_SIZE_CHANGE',
                    severity: 'LOW',
                    file,
                    message: `${file}: ${prevLines} → ${currLines} lines (${(changePercent * 100).toFixed(0)}% change)`,
                });
            }
        }
    }

    return drifts;
}

// ═══════════════════════════════════════════════════════════════
// CLI INTERFACE
// ═══════════════════════════════════════════════════════════════

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
};

function printHeader() {
    console.log('');
    console.log(`${COLORS.cyan}╔══════════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.cyan}║  🧬 Context DNA Fingerprint — Learner       ║${COLORS.reset}`);
    console.log(`${COLORS.cyan}╚══════════════════════════════════════════════╝${COLORS.reset}`);
    console.log('');
}

function printStatus(label, value, isGood) {
    const icon = isGood ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.reset}`;
    console.log(`  ${icon} ${label}: ${COLORS.bold}${value}${COLORS.reset}`);
}

function commandGenerate() {
    printHeader();
    const fingerprint = generateFingerprint();
    saveFingerprint(fingerprint);

    const { structuralIntegrity } = fingerprint;
    console.log(`${COLORS.green}Fingerprint generated successfully!${COLORS.reset}`);
    console.log('');
    printStatus('Source files', `${structuralIntegrity.sourceFilesPresent}/${structuralIntegrity.sourceFilesTotal}`, structuralIntegrity.sourceFilesPresent === structuralIntegrity.sourceFilesTotal);
    printStatus('Memory files', `${structuralIntegrity.memoryFilesPresent}/${structuralIntegrity.memoryFilesTotal}`, structuralIntegrity.memoryFilesPresent === structuralIntegrity.memoryFilesTotal);
    printStatus('Project version', fingerprint.projectVersion, true);
    printStatus('Generated at', fingerprint.generatedAt, true);
    console.log('');
    console.log(`${COLORS.dim}Fingerprint saved to: memory/_FINGERPRINT.json${COLORS.reset}`);
    console.log('');
}

function commandVerify() {
    printHeader();
    const previous = loadFingerprint();
    const current = generateFingerprint();

    if (!previous) {
        console.log(`${COLORS.yellow}⚠ No previous fingerprint found. Generating initial fingerprint...${COLORS.reset}`);
        saveFingerprint(current);
        console.log(`${COLORS.green}✓ Initial fingerprint created. Run --verify again after changes.${COLORS.reset}`);
        console.log('');
        return;
    }

    const drifts = detectDrift(previous, current);

    if (drifts.length === 0) {
        console.log(`${COLORS.green}${COLORS.bold}✓ VALID — No drift detected${COLORS.reset}`);
        console.log('');
        printStatus('Source files', `${current.structuralIntegrity.sourceFilesPresent}/${current.structuralIntegrity.sourceFilesTotal}`, true);
        printStatus('Memory files', `${current.structuralIntegrity.memoryFilesPresent}/${current.structuralIntegrity.memoryFilesTotal}`, true);
        printStatus('Cross-references', 'All valid', true);
        printStatus('Last sync', previous.generatedAt, true);
    } else {
        const critCount = drifts.filter(d => d.severity === 'CRITICAL').length;
        const highCount = drifts.filter(d => d.severity === 'HIGH').length;
        const medCount = drifts.filter(d => d.severity === 'MEDIUM').length;
        const lowCount = drifts.filter(d => d.severity === 'LOW').length;

        console.log(`${COLORS.red}${COLORS.bold}✗ DRIFT DETECTED — ${drifts.length} issue(s) found${COLORS.reset}`);
        console.log('');

        if (critCount > 0) {
            console.log(`  ${COLORS.red}CRITICAL (${critCount}):${COLORS.reset}`);
            drifts.filter(d => d.severity === 'CRITICAL').forEach(d => {
                console.log(`    ${COLORS.red}✗${COLORS.reset} ${d.message}`);
            });
        }
        if (highCount > 0) {
            console.log(`  ${COLORS.red}HIGH (${highCount}):${COLORS.reset}`);
            drifts.filter(d => d.severity === 'HIGH').forEach(d => {
                console.log(`    ${COLORS.yellow}▲${COLORS.reset} ${d.message}`);
            });
        }
        if (medCount > 0) {
            console.log(`  ${COLORS.yellow}MEDIUM (${medCount}):${COLORS.reset}`);
            drifts.filter(d => d.severity === 'MEDIUM').forEach(d => {
                console.log(`    ${COLORS.yellow}○${COLORS.reset} ${d.message}`);
            });
        }
        if (lowCount > 0) {
            console.log(`  ${COLORS.dim}LOW (${lowCount}):${COLORS.reset}`);
            drifts.filter(d => d.severity === 'LOW').forEach(d => {
                console.log(`    ${COLORS.dim}·${COLORS.reset} ${d.message}`);
            });
        }

        console.log('');
        console.log(`${COLORS.yellow}Run with --generate to update the fingerprint after fixing drift.${COLORS.reset}`);
    }

    console.log('');
}

function commandReport() {
    printHeader();
    const current = generateFingerprint();

    console.log(`${COLORS.bold}Source File Status:${COLORS.reset}`);
    console.log('');
    for (const file of SOURCE_FILES) {
        const hash = current.sourceHashes[file];
        const lines = current.lineCounts[file];
        const status = hash ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.reset}`;
        const lineStr = lines > 0 ? `${COLORS.dim}(${lines} lines)${COLORS.reset}` : '';
        console.log(`  ${status} ${file} ${lineStr}`);
    }

    console.log('');
    console.log(`${COLORS.bold}Memory File Status:${COLORS.reset}`);
    console.log('');
    for (const file of MEMORY_FILES) {
        const hash = current.memoryHashes[file];
        const status = hash ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.reset}`;
        console.log(`  ${status} ${file}`);
    }

    console.log('');
    console.log(`${COLORS.bold}Cross-Reference Matrix:${COLORS.reset}`);
    console.log('');
    for (const [sourceFile, refs] of Object.entries(current.crossRefStatus)) {
        const baseName = path.basename(sourceFile);
        console.log(`  ${COLORS.cyan}${baseName}${COLORS.reset}:`);
        for (const [memFile, found] of Object.entries(refs)) {
            const icon = found ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.reset}`;
            console.log(`    ${icon} ${path.basename(memFile)}`);
        }
    }

    console.log('');
}

function commandSmartSync() {
    printHeader();
    const previous = loadFingerprint();
    const current = generateFingerprint();

    if (!previous) {
        console.log(`${COLORS.yellow}⚠ No previous fingerprint found. Generating initial fingerprint...${COLORS.reset}`);
        saveFingerprint(current);
        console.log(`${COLORS.green}✓ Initial fingerprint created. Make changes, then run --smart-sync again.${COLORS.reset}`);
        console.log('');
        return;
    }

    console.log(`${COLORS.bold}🔍 Smart Sync Analysis${COLORS.reset}`);
    console.log(`${COLORS.dim}Comparing against fingerprint from: ${previous.generatedAt}${COLORS.reset}`);
    console.log('');

    // Detect changed source files
    const changedFiles = [];
    for (const file of SOURCE_FILES) {
        const prevHash = previous.sourceHashes[file];
        const currHash = current.sourceHashes[file];

        if (!prevHash && currHash) {
            changedFiles.push({ file, reason: 'NEW FILE' });
        } else if (prevHash && currHash && prevHash !== currHash) {
            const prevLines = previous.lineCounts[file] || 0;
            const currLines = current.lineCounts[file] || 0;
            const delta = currLines - prevLines;
            const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
            changedFiles.push({ file, reason: `MODIFIED (${deltaStr} lines)` });
        } else if (prevHash && !currHash) {
            changedFiles.push({ file, reason: 'DELETED' });
        }
    }

    if (changedFiles.length === 0) {
        console.log(`${COLORS.green}${COLORS.bold}✓ No source changes detected — memory is in sync${COLORS.reset}`);
        console.log('');
        return;
    }

    // Display changed files
    console.log(`${COLORS.yellow}${COLORS.bold}Changed Source Files (${changedFiles.length}):${COLORS.reset}`);
    console.log('');
    for (const { file, reason } of changedFiles) {
        const icon = reason === 'NEW FILE' ? `${COLORS.green}+${COLORS.reset}` :
            reason === 'DELETED' ? `${COLORS.red}-${COLORS.reset}` :
                `${COLORS.yellow}~${COLORS.reset}`;
        console.log(`  ${icon} ${file} ${COLORS.dim}[${reason}]${COLORS.reset}`);
    }

    // Build memory update plan
    const docUpdatePlan = {};
    const actionItems = [];

    for (const { file } of changedFiles) {
        const rule = SYNC_RULES[file];
        if (rule) {
            actionItems.push({ file, check: rule.check });
            for (const doc of rule.docs) {
                if (!docUpdatePlan[doc]) {
                    docUpdatePlan[doc] = [];
                }
                docUpdatePlan[doc].push(path.basename(file));
            }
        }
    }

    // Display update plan
    console.log('');
    console.log(`${COLORS.cyan}${COLORS.bold}═══ MEMORY UPDATE PLAN ═══${COLORS.reset}`);
    console.log('');

    const docEntries = Object.entries(docUpdatePlan);
    if (docEntries.length === 0) {
        console.log(`${COLORS.dim}  No memory docs require updating for these changes.${COLORS.reset}`);
    } else {
        // Always-required docs
        console.log(`${COLORS.bold}  Always Required:${COLORS.reset}`);
        console.log(`    ${COLORS.yellow}▸${COLORS.reset} memory/active_context.md — Add session entry with completed tasks`);
        console.log(`    ${COLORS.yellow}▸${COLORS.reset} memory/changelog.md — Add version entry if significant changes`);
        console.log('');

        console.log(`${COLORS.bold}  Change-Specific Docs (${docEntries.length}):${COLORS.reset}`);
        for (const [doc, triggers] of docEntries) {
            const triggerStr = triggers.join(', ');
            console.log(`    ${COLORS.cyan}▸${COLORS.reset} ${doc}`);
            console.log(`      ${COLORS.dim}triggered by: ${triggerStr}${COLORS.reset}`);
        }
    }

    // Display action checklist
    console.log('');
    console.log(`${COLORS.bold}  Action Checklist:${COLORS.reset}`);
    for (let i = 0; i < actionItems.length; i++) {
        console.log(`    ${COLORS.yellow}${i + 1}.${COLORS.reset} ${actionItems[i].check}`);
    }

    // Memory health score
    const changedMemDocs = MEMORY_FILES.filter(f =>
        previous.memoryHashes[f] !== current.memoryHashes[f]
    );
    const requiredDocs = Object.keys(docUpdatePlan);
    const updatedRequired = requiredDocs.filter(d => changedMemDocs.includes(d));
    const healthScore = requiredDocs.length > 0
        ? Math.round((updatedRequired.length / requiredDocs.length) * 100)
        : 100;

    console.log('');
    console.log(`${COLORS.bold}  Memory Health Score:${COLORS.reset}`);
    const healthColor = healthScore === 100 ? COLORS.green :
        healthScore >= 50 ? COLORS.yellow : COLORS.red;
    const healthBar = '█'.repeat(Math.round(healthScore / 10)) + '░'.repeat(10 - Math.round(healthScore / 10));
    console.log(`    ${healthColor}${healthBar} ${healthScore}%${COLORS.reset}`);
    if (healthScore < 100) {
        const missing = requiredDocs.filter(d => !changedMemDocs.includes(d));
        console.log(`    ${COLORS.red}Missing updates: ${missing.map(d => path.basename(d)).join(', ')}${COLORS.reset}`);
    } else {
        console.log(`    ${COLORS.green}All required memory docs have been updated!${COLORS.reset}`);
    }

    console.log('');
    console.log(`${COLORS.dim}After completing updates, run: --generate to save new fingerprint${COLORS.reset}`);
    console.log('');
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const command = args[0] || '--verify';

switch (command) {
    case '--generate':
        commandGenerate();
        break;
    case '--verify':
        commandVerify();
        break;
    case '--report':
        commandReport();
        break;
    case '--smart-sync':
        commandSmartSync();
        break;
    default:
        console.log('Usage:');
        console.log('  node context-fingerprint.js --generate    Create/update fingerprint');
        console.log('  node context-fingerprint.js --verify      Check for drift');
        console.log('  node context-fingerprint.js --report      Detailed status report');
        console.log('  node context-fingerprint.js --smart-sync  Auto-detect memory update plan');
        break;
}
