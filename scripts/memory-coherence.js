#!/usr/bin/env node

/**
 * ============================================================
 * Memory Coherence Validator (Radical Innovation)
 * ============================================================
 * 
 * Goes BEYOND Context DNA hashes: performs semantic cross-reference
 * validation between memory documentation and actual source files.
 *
 * What it catches (that hash-based checks CANNOT):
 *   - Deleted files still referenced in file_map.md / overview.md
 *   - Renamed types/enums still documented in old names
 *   - ADRs referencing non-existent source files
 *   - Workflow commands referencing missing scripts
 *   - Phantom modules in system_design.md Mermaid diagrams
 *
 * Usage:
 *   node scripts/memory-coherence.js           # Full validation
 *   node scripts/memory-coherence.js --fix     # Show fix suggestions
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(ROOT, 'memory');
const SRC_DIR = path.join(ROOT, 'src');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const AGENT_DIR = path.join(ROOT, '.agent');

const SHOW_FIX = process.argv.includes('--fix');

// ─── Color Output ───────────────────────────────────────────

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ─── File Discovery ─────────────────────────────────────────

function getAllFiles(dir, extensions, relative = '') {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relative, entry.name);

        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.next') continue;

        if (entry.isDirectory()) {
            results.push(...getAllFiles(fullPath, extensions, relPath));
        } else if (!extensions || extensions.some(ext => entry.name.endsWith(ext))) {
            results.push(relPath.replace(/\\/g, '/'));
        }
    }
    return results;
}

// ─── Extract References from Memory Docs ────────────────────

function extractFileReferences(content, docName) {
    const refs = [];

    // Pattern 1: Backtick file references: `filename.ts`
    const backtickPattern = /`([a-zA-Z0-9_\-/.]+\.(ts|tsx|js|jsx|css|json|md))`/g;
    let match;
    while ((match = backtickPattern.exec(content)) !== null) {
        refs.push({
            ref: match[1],
            source: docName,
            type: 'backtick',
            line: content.substring(0, match.index).split('\n').length,
        });
    }

    // Pattern 2: Path-like references: src/lib/api/binance-rest.ts
    const pathPattern = /(?:src\/[a-zA-Z0-9_\-/.]+\.(ts|tsx|js|jsx|css|json))/g;
    while ((match = pathPattern.exec(content)) !== null) {
        refs.push({
            ref: match[0],
            source: docName,
            type: 'path',
            line: content.substring(0, match.index).split('\n').length,
        });
    }

    // Pattern 3: Mermaid node references with file extensions
    const mermaidPattern = /\[([a-zA-Z0-9_\-/.]+\.(ts|tsx|js))\]/g;
    while ((match = mermaidPattern.exec(content)) !== null) {
        refs.push({
            ref: match[1],
            source: docName,
            type: 'mermaid',
            line: content.substring(0, match.index).split('\n').length,
        });
    }

    // Pattern 4: scripts/ references
    const scriptPattern = /(?:scripts\/[a-zA-Z0-9_\-]+\.(js|ts))/g;
    while ((match = scriptPattern.exec(content)) !== null) {
        refs.push({
            ref: match[0],
            source: docName,
            type: 'script',
            line: content.substring(0, match.index).split('\n').length,
        });
    }

    return refs;
}

// ─── Extract Type/Enum Names ────────────────────────────────

function extractTypeReferences(content, docName) {
    const refs = [];

    // Pattern: PascalCase type names that look like TypeScript types
    const typePattern = /`((?:[A-Z][a-zA-Z0-9]*){2,})`/g;
    let match;
    while ((match = typePattern.exec(content)) !== null) {
        const name = match[1];
        // Filter common false positives
        if (['TypeScript', 'JavaScript', 'IndexedDB', 'PostgreSQL', 'WebSocket',
            'CortexNeuralMap', 'CortexNeuralMapPanel', 'JetBrains',
            'NextJs', 'GitHub', 'Supabase', 'NodeName', 'Google'].includes(name)) continue;
        refs.push({
            ref: name,
            source: docName,
            type: 'type',
            line: content.substring(0, match.index).split('\n').length,
        });
    }

    return refs;
}

// ─── Validate File References ───────────────────────────────

function resolveFileRef(ref) {
    // Direct path check
    if (fs.existsSync(path.join(ROOT, ref))) return true;

    // Try with src/ prefix
    if (fs.existsSync(path.join(SRC_DIR, ref))) return true;

    // Try as basename in known directories
    const basename = path.basename(ref);
    const searchDirs = [
        SRC_DIR,
        path.join(SRC_DIR, 'lib', 'engine'),
        path.join(SRC_DIR, 'lib', 'api'),
        path.join(SRC_DIR, 'lib', 'risk'),
        path.join(SRC_DIR, 'lib', 'store'),
        path.join(SRC_DIR, 'lib', 'db'),
        path.join(SRC_DIR, 'lib', 'engine', 'overmind'),
        path.join(SRC_DIR, 'app'),
        path.join(SRC_DIR, 'app', 'brain'),
        path.join(SRC_DIR, 'app', 'pipeline'),
        path.join(SRC_DIR, 'types'),
        SCRIPTS_DIR,
        path.join(ROOT, 'memory'),
        path.join(ROOT, 'memory', 'adr'),
        path.join(ROOT, 'memory', 'architecture'),
    ];

    for (const dir of searchDirs) {
        if (fs.existsSync(path.join(dir, basename))) return true;
    }

    // Check API routes
    if (ref.includes('route.ts')) {
        const routeDirs = getAllFiles(path.join(SRC_DIR, 'app', 'api'), ['.ts']);
        if (routeDirs.some(f => f.endsWith(basename))) return true;
    }

    return false;
}

// ─── Validate Type References ───────────────────────────────

function findTypeInSource(typeName) {
    const typesFile = path.join(SRC_DIR, 'types', 'index.ts');
    if (!fs.existsSync(typesFile)) return false;

    const content = fs.readFileSync(typesFile, 'utf-8');

    // Check for enum, interface, type declarations
    const patterns = [
        new RegExp(`enum\\s+${typeName}\\b`),
        new RegExp(`interface\\s+${typeName}\\b`),
        new RegExp(`type\\s+${typeName}\\b`),
    ];

    return patterns.some(p => p.test(content));
}

// ─── ADR Validation ─────────────────────────────────────────

function validateADRs() {
    const adrDir = path.join(MEMORY_DIR, 'adr');
    if (!fs.existsSync(adrDir)) return [];

    const issues = [];
    const adrFiles = fs.readdirSync(adrDir).filter(f => f.endsWith('.md'));

    for (const adrFile of adrFiles) {
        const content = fs.readFileSync(path.join(adrDir, adrFile), 'utf-8');
        const refs = extractFileReferences(content, `adr/${adrFile}`);

        for (const ref of refs) {
            if (!resolveFileRef(ref.ref)) {
                issues.push({
                    ...ref,
                    issue: 'ADR references non-existent file',
                });
            }
        }
    }

    return issues;
}

// ─── Workflow Validation ────────────────────────────────────

function validateWorkflows() {
    const workflows = [
        path.join(AGENT_DIR, 'workflows', 'memory-sync.md'),
        path.join(AGENT_DIR, 'workflows', 'memory-reload.md'),
    ];

    const issues = [];

    for (const wfPath of workflows) {
        if (!fs.existsSync(wfPath)) continue;
        const content = fs.readFileSync(wfPath, 'utf-8');
        const basename = path.basename(wfPath);

        // Check script commands
        const cmdPattern = /(?:node|cat)\s+([a-zA-Z0-9_\-/.]+)/g;
        let match;
        while ((match = cmdPattern.exec(content)) !== null) {
            const script = match[1];
            if (!fs.existsSync(path.join(ROOT, script))) {
                issues.push({
                    ref: script,
                    source: `workflows/${basename}`,
                    type: 'command',
                    line: content.substring(0, match.index).split('\n').length,
                    issue: 'Workflow references non-existent script/file',
                });
            }
        }
    }

    return issues;
}

// ─── Main ───────────────────────────────────────────────────

function main() {
    console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}${CYAN}║  Memory Coherence Validator — Semantic Check  ║${RESET}`);
    console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}\n`);

    const memoryDocs = [
        'overview.md',
        'active_context.md',
        'file_map.md',
        'changelog.md',
        'architecture/system_design.md',
    ];

    let totalRefs = 0;
    let totalValid = 0;
    let allIssues = [];

    // Phase 1: File Reference Validation
    console.log(`${BOLD}Phase 1: File Reference Validation${RESET}`);
    console.log(`${'─'.repeat(50)}`);

    for (const doc of memoryDocs) {
        const docPath = path.join(MEMORY_DIR, doc);
        if (!fs.existsSync(docPath)) {
            console.log(`  ${YELLOW}⚠ ${doc} not found${RESET}`);
            continue;
        }

        const content = fs.readFileSync(docPath, 'utf-8');
        const refs = extractFileReferences(content, doc);

        // Deduplicate by ref name within same doc
        const uniqueRefs = [...new Map(refs.map(r => [r.ref, r])).values()];
        totalRefs += uniqueRefs.length;

        let valid = 0;
        let invalid = 0;

        for (const ref of uniqueRefs) {
            if (resolveFileRef(ref.ref)) {
                valid++;
                totalValid++;
            } else {
                invalid++;
                allIssues.push({
                    ...ref,
                    issue: `File not found: ${ref.ref}`,
                });
            }
        }

        const status = invalid === 0 ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
        console.log(`  ${status} ${doc}: ${valid}/${uniqueRefs.length} refs valid${invalid > 0 ? ` (${RED}${invalid} broken${RESET})` : ''}`);
    }

    // Phase 2: ADR Validation
    console.log(`\n${BOLD}Phase 2: ADR Cross-Reference Validation${RESET}`);
    console.log(`${'─'.repeat(50)}`);
    const adrIssues = validateADRs();
    allIssues.push(...adrIssues);
    console.log(`  ${adrIssues.length === 0 ? GREEN + '✓' : RED + '✗'} ${RESET}ADR validation: ${adrIssues.length} issues`);

    // Phase 3: Workflow Validation
    console.log(`\n${BOLD}Phase 3: Workflow Command Validation${RESET}`);
    console.log(`${'─'.repeat(50)}`);
    const wfIssues = validateWorkflows();
    allIssues.push(...wfIssues);
    console.log(`  ${wfIssues.length === 0 ? GREEN + '✓' : RED + '✗'} ${RESET}Workflow validation: ${wfIssues.length} issues`);

    // Phase 4: Type Reference Spot-Check
    console.log(`\n${BOLD}Phase 4: Critical Type Validation${RESET}`);
    console.log(`${'─'.repeat(50)}`);
    const criticalTypes = [
        'OrderLifecycleState', 'OrderGroupConfig', 'OrderGroup',
        'StateTransition', 'ExecutionRecord', 'ExecutionQualityStats',
        'AdaptiveRateStatus', 'OrderResult', 'PositionInfo',
        'OrderBookSnapshot', 'StrategyDNA', 'MarketRegime',
        'HyperDNA', 'MicrostructureGene', 'CompositeFunctionGene',
    ];

    let typeValid = 0;
    let typeInvalid = 0;
    for (const typeName of criticalTypes) {
        if (findTypeInSource(typeName)) {
            typeValid++;
        } else {
            typeInvalid++;
            allIssues.push({
                ref: typeName,
                source: 'types/index.ts',
                type: 'type',
                line: 0,
                issue: `Critical type not found in source: ${typeName}`,
            });
        }
    }
    console.log(`  ${typeInvalid === 0 ? GREEN + '✓' : RED + '✗'} ${RESET}Critical types: ${typeValid}/${criticalTypes.length} found in source`);

    // ─── Summary ────────────────────────────────────────────

    console.log(`\n${BOLD}${'═'.repeat(50)}${RESET}`);

    const coherenceScore = totalRefs > 0
        ? Math.round(((totalValid) / (totalRefs)) * 100)
        : 100;

    const scoreColor = coherenceScore >= 95 ? GREEN : coherenceScore >= 80 ? YELLOW : RED;

    console.log(`${BOLD}Memory Coherence Score: ${scoreColor}${coherenceScore}%${RESET}`);
    console.log(`  File refs: ${totalValid}/${totalRefs} valid`);
    console.log(`  ADR issues: ${adrIssues.length}`);
    console.log(`  Workflow issues: ${wfIssues.length}`);
    console.log(`  Type issues: ${typeInvalid}`);
    console.log(`  Total issues: ${allIssues.length}`);

    // Show issues
    if (allIssues.length > 0) {
        console.log(`\n${BOLD}${RED}Issues Found:${RESET}`);
        for (const issue of allIssues) {
            console.log(`  ${RED}✗${RESET} [${issue.source}:${issue.line}] ${issue.issue}`);
            if (SHOW_FIX) {
                console.log(`    ${DIM}→ Fix: Check if file was renamed/moved, or update the reference in ${issue.source}${RESET}`);
            }
        }
    } else {
        console.log(`\n${GREEN}${BOLD}✓ All memory references are coherent!${RESET}`);
    }

    console.log('');
    process.exit(allIssues.length > 0 ? 1 : 0);
}

main();
