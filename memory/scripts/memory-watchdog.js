#!/usr/bin/env node
// ============================================================
// Learner: Memory Watchdog — Automated Orphan File Detector
// ============================================================
// Phase 28 Radical Innovation
//
// PURPOSE: Detect memory architecture drift by cross-referencing
// actual source files on disk against documented files in
// memory/file_map.md. Prevents undocumented files from
// silently accumulating across sessions.
//
// USAGE:
//   node memory/scripts/memory-watchdog.js           # --scan (default)
//   node memory/scripts/memory-watchdog.js --scan    # Full report
//   node memory/scripts/memory-watchdog.js --ci      # CI mode (exit 1 on drift)
//   node memory/scripts/memory-watchdog.js --auto-fix # Generate file_map entries
//
// EXIT CODES:
//   0 = All files synced (no orphans, no ghosts)
//   1 = Drift detected (orphans and/or ghosts found)
//
// ARCHITECTURE:
//   1. Scan SOURCE_DIRS for all .ts files (recursive)
//   2. Parse memory/file_map.md to extract documented basenames
//   3. Cross-reference to find ORPHAN (on disk, not in docs)
//      and GHOST (in docs, not on disk) files
//   4. Read orphan file headers for auto-detection of Phase/Purpose
//   5. Generate report with coverage percentage
// ============================================================

const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const FILE_MAP_PATH = path.join(PROJECT_ROOT, 'memory', 'file_map.md');

/** Directories to scan for source files */
const SOURCE_DIRS = [
    'src/lib/engine',
    'src/lib/engine/overmind',
    'src/lib/api',
    'src/lib/risk',
    'src/lib/hooks',
    'src/lib/store',
    'src/lib/db',
    'src/lib/config',
    'src/lib/utils',
    'src/app',
    'src/app/brain',
    'src/app/pipeline',
    'src/app/api',
    'src/types',
];

/** File extensions to track */
const TRACKED_EXTENSIONS = ['.ts', '.tsx'];

/** Directories to exclude from scanning */
const EXCLUDED_DIRS = ['__tests__', 'node_modules', '.next'];

/** Basenames to exclude from ghost detection (exist in non-scanned directories) */
const GHOST_EXCLUSIONS = [
    // App-layer files (multiple page.tsx/route.ts across app/ subdirs)
    'page.tsx', 'layout.tsx', 'route.ts',
    // Test files (in __tests__/ which is excluded from scanning)
    /\.test\.(ts|tsx)$/,
    // Config files
    'vitest.config.ts', 'next.config.ts',
];

/** Check if a basename should be excluded from ghost detection */
function isGhostExcluded(basename) {
    for (const rule of GHOST_EXCLUSIONS) {
        if (typeof rule === 'string' && basename === rule) return true;
        if (rule instanceof RegExp && rule.test(basename)) return true;
    }
    return false;
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Recursively scan a directory for files with tracked extensions.
 * Returns array of { basename, relativePath, absolutePath }
 */
function scanDirectory(dirPath) {
    const absoluteDir = path.join(PROJECT_ROOT, dirPath);
    const results = [];

    if (!fs.existsSync(absoluteDir)) return results;

    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });

    for (const entry of entries) {
        // Skip excluded directories
        if (entry.isDirectory() && EXCLUDED_DIRS.includes(entry.name)) continue;

        const fullPath = path.join(absoluteDir, entry.name);
        const relPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            // Only recurse into subdirs explicitly listed in SOURCE_DIRS
            // (prevents unwanted deep recursion)
            continue;
        }

        if (entry.isFile() && TRACKED_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
            results.push({
                basename: entry.name,
                relativePath: relPath.replace(/\\/g, '/'),
                absolutePath: fullPath,
            });
        }
    }

    return results;
}

/**
 * Parse file_map.md and extract all documented basenames.
 * Looks for patterns like: | `filename.ts` | ... |
 * Also handles directory-prefixed entries like: | `store/persistence.ts` |
 */
function parseFileMap() {
    if (!fs.existsSync(FILE_MAP_PATH)) {
        console.error('❌ file_map.md not found at:', FILE_MAP_PATH);
        process.exit(1);
    }

    const content = fs.readFileSync(FILE_MAP_PATH, 'utf8');
    const lines = content.split(/\r?\n/);
    const documented = new Set();

    // Match table rows with backtick-quoted filenames
    // Pattern: | `filename.ts` | ... |  OR  | `dir/filename.ts` | ... |
    const ROW_PATTERN = /\|\s*`([^`]+\.(ts|tsx))`\s*\|/;

    for (const line of lines) {
        const match = line.match(ROW_PATTERN);
        if (match) {
            const entry = match[1];
            // Extract just the basename (handles store/persistence.ts → persistence.ts)
            const basename = path.basename(entry);
            documented.add(basename);
        }
    }

    return documented;
}

/**
 * Read the first N lines of a file to auto-detect Phase and Purpose.
 */
function readFileHeader(absolutePath, maxLines = 15) {
    try {
        const content = fs.readFileSync(absolutePath, 'utf8');
        const lines = content.split(/\r?\n/).slice(0, maxLines);
        const header = lines.join('\n');

        // Detect Phase number
        let phase = '—';
        const phaseMatch = header.match(/Phase\s+(\d+[\.\d]*)/i);
        if (phaseMatch) phase = `Phase ${phaseMatch[1]}`;

        // Detect purpose from header comments
        let purpose = '(unknown)';
        // Try to find a descriptive line (first non-comment-marker, non-empty line after //)
        for (const line of lines) {
            const cleaned = line.replace(/^\/\/\s*/, '').replace(/^[=\-*\s]+$/, '').trim();
            if (cleaned.length > 20 && !cleaned.startsWith('===') && !cleaned.startsWith('---')) {
                purpose = cleaned.length > 80 ? cleaned.substring(0, 80) + '…' : cleaned;
                break;
            }
        }

        // Count total lines
        const totalLines = content.split(/\r?\n/).length;

        return { phase, purpose, totalLines };
    } catch (err) {
        return { phase: '—', purpose: '(read error)', totalLines: 0 };
    }
}

/**
 * Generate a suggested file_map.md entry for an orphan file.
 */
function generateSuggestedEntry(file, metadata) {
    return `| \`${file.basename}\` | **${metadata.phase}** — ${metadata.purpose} (~${metadata.totalLines} lines). | 🟡 |`;
}

// ─── Main Logic ──────────────────────────────────────────────

function runWatchdog(mode) {
    console.log('');
    console.log('🐕 MEMORY WATCHDOG — Orphan File Detection');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // 1. Scan all source directories
    const allFiles = [];
    for (const dir of SOURCE_DIRS) {
        const files = scanDirectory(dir);
        allFiles.push(...files);
    }
    console.log(`📂 Scanned ${SOURCE_DIRS.length} directories → ${allFiles.length} source files found`);

    // 2. Parse file_map.md
    const documented = parseFileMap();
    console.log(`📄 file_map.md → ${documented.size} documented basenames`);
    console.log('');

    // 3. Cross-reference
    const orphans = []; // On disk but NOT in file_map.md
    const synced = [];  // In both places
    const ghosts = new Set(documented); // Will remove matched ones

    for (const file of allFiles) {
        if (documented.has(file.basename)) {
            synced.push(file);
            ghosts.delete(file.basename);
        } else {
            orphans.push(file);
        }
    }

    // 4. Calculate coverage
    const totalFiles = allFiles.length;
    const coverage = totalFiles > 0 ? ((synced.length / totalFiles) * 100).toFixed(1) : '100.0';

    // 4.5 Filter ghosts (remove test files, app pages, config files)
    const filteredGhosts = [...ghosts].filter(g => !isGhostExcluded(g));

    // 5. Report
    console.log('╔══════════════════════════════════════════╗');
    console.log(`║  📊 COVERAGE: ${coverage}% (${synced.length}/${totalFiles} files)`.padEnd(44) + '║');
    console.log(`║  🟢 SYNCED:  ${synced.length} files`.padEnd(44) + '║');
    console.log(`║  🔴 ORPHAN:  ${orphans.length} files`.padEnd(44) + '║');
    console.log(`║  👻 GHOST:   ${filteredGhosts.length} files`.padEnd(44) + '║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');

    // 6. Detail: Orphan files
    if (orphans.length > 0) {
        console.log('🔴 ORPHAN FILES (exist on disk, NOT in file_map.md):');
        console.log('──────────────────────────────────────────');
        for (const file of orphans) {
            const meta = readFileHeader(file.absolutePath);
            console.log(`  📄 ${file.basename} (${meta.totalLines} lines, ${meta.phase})`);
            console.log(`     📍 ${file.relativePath}`);
            console.log(`     📝 ${meta.purpose}`);

            if (mode === 'auto-fix') {
                console.log(`     💡 ${generateSuggestedEntry(file, meta)}`);
            }
            console.log('');
        }
    }

    // 7. Detail: Ghost files (filtered)
    if (filteredGhosts.length > 0) {
        console.log('👻 GHOST FILES (in file_map.md but NOT found on disk):');
        console.log('──────────────────────────────────────────');
        for (const ghost of filteredGhosts) {
            console.log(`  🚫 ${ghost}`);
        }
        console.log('');
    }

    // 8. All synced
    if (orphans.length === 0 && filteredGhosts.length === 0) {
        console.log('✅ PERFECT SYNC — All source files are documented!');
        console.log('');
    }

    // 9. CI exit code
    const hasDrift = orphans.length > 0 || filteredGhosts.length > 0;

    if (mode === 'ci') {
        if (hasDrift) {
            console.log('❌ CI GATE FAILED — Memory drift detected');
            process.exit(1);
        } else {
            console.log('✅ CI GATE PASSED — No memory drift');
            process.exit(0);
        }
    }

    return { orphans: orphans.length, ghosts: filteredGhosts.length, synced: synced.length, coverage };
}

// ─── CLI Entry Point ─────────────────────────────────────────

const args = process.argv.slice(2);
const mode = args.includes('--ci') ? 'ci'
    : args.includes('--auto-fix') ? 'auto-fix'
        : 'scan';

runWatchdog(mode);
