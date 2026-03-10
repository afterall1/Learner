#!/usr/bin/env node
/**
 * ============================================================================
 * Memory Temporal Integrity Engine (MTIE)
 * Phase 37 — RADICAL INNOVATION
 * ============================================================================
 * 
 * PURPOSE: Detects source files modified AFTER the last memory sync by
 * comparing file modification timestamps against documentation sync timestamps.
 * 
 * INNOVATION: Hash-based fingerprinting tells you IF files changed.
 * MTIE tells you WHEN files changed relative to the last documentation update,
 * computing an importance-weighted freshness score.
 * 
 * 5-Phase Temporal Analysis:
 *   Phase 1: Extract last sync timestamp from memory files
 *   Phase 2: Scan all source files for modification times
 *   Phase 3: Classify staleness by importance tier
 *   Phase 4: Compute weighted freshness score (0-100)
 *   Phase 5: Generate auto-triage report
 * 
 * USAGE:
 *   node scripts/memory-temporal-integrity.js              # Full report
 *   node scripts/memory-temporal-integrity.js --json        # JSON output
 *   node scripts/memory-temporal-integrity.js --ci          # CI mode (exit 1 if <80%)
 * 
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

// ——————————————————————————————————————————————
// Configuration
// ——————————————————————————————————————————————

const PROJECT_ROOT = path.resolve(__dirname, '..');

/** Importance tiers for staleness weighting */
const IMPORTANCE_TIERS = {
  CRITICAL: { weight: 1.0, emoji: '🔴', label: 'CRITICAL' },
  IMPORTANT: { weight: 0.6, emoji: '🟡', label: 'IMPORTANT' },
  STANDARD: { weight: 0.3, emoji: '🟢', label: 'STANDARD' },
};

/** File importance classification rules */
const FILE_IMPORTANCE = {
  // CRITICAL — Core engine, types, risk, stores
  'src/types/index.ts': 'CRITICAL',
  'src/lib/engine/strategy-dna.ts': 'CRITICAL',
  'src/lib/engine/evolution.ts': 'CRITICAL',
  'src/lib/engine/evaluator.ts': 'CRITICAL',
  'src/lib/engine/signal-engine.ts': 'CRITICAL',
  'src/lib/engine/brain.ts': 'CRITICAL',
  'src/lib/engine/island.ts': 'CRITICAL',
  'src/lib/engine/cortex.ts': 'CRITICAL',
  'src/lib/engine/cortex-live-engine.ts': 'CRITICAL',
  'src/lib/engine/system-bootstrap.ts': 'CRITICAL',
  'src/lib/risk/manager.ts': 'CRITICAL',
  'src/lib/store/index.ts': 'CRITICAL',
  'src/lib/api/binance-rest.ts': 'CRITICAL',
  'src/lib/api/order-lifecycle.ts': 'CRITICAL',
  'src/lib/engine/persistence-bridge.ts': 'CRITICAL',
  // IMPORTANT — Advanced genes, overmind, hooks, dashboard pages, tests
  'src/lib/engine/microstructure-genes.ts': 'IMPORTANT',
  'src/lib/engine/price-action-genes.ts': 'IMPORTANT',
  'src/lib/engine/composite-functions.ts': 'IMPORTANT',
  'src/lib/engine/directional-change.ts': 'IMPORTANT',
  'src/lib/engine/regime-intelligence.ts': 'IMPORTANT',
  'src/lib/engine/meta-evolution.ts': 'IMPORTANT',
  'src/lib/engine/trade-forensics.ts': 'IMPORTANT',
  'src/lib/engine/stress-matrix.ts': 'IMPORTANT',
  'src/lib/hooks/usePipelineLiveData.ts': 'IMPORTANT',
  'src/app/page.tsx': 'IMPORTANT',
  'src/app/pipeline/page.tsx': 'IMPORTANT',
  'src/app/brain/page.tsx': 'IMPORTANT',
  'src/app/globals.css': 'IMPORTANT',
  'src/components/panels/IgnitionSequencePanel.tsx': 'IMPORTANT',
};

/** Memory files to extract sync timestamps from */
const SYNC_TIMESTAMP_SOURCES = [
  'memory/overview.md',
  'memory/active_context.md',
  'memory/file_map.md',
  'memory/architecture/system_design.md',
  'memory/changelog.md',
];

/** Source file patterns to scan */
const SOURCE_PATTERNS = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.css',
];

// ——————————————————————————————————————————————
// Phase 1: Extract Last Sync Timestamp
// ——————————————————————————————————————————————

function extractSyncTimestamp() {
  const timestamps = [];

  for (const relPath of SYNC_TIMESTAMP_SOURCES) {
    const fullPath = path.join(PROJECT_ROOT, relPath);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');

    // Match patterns like: *Last Updated: 2026-03-10 17:00 (UTC+3)*
    // or: *Last Synced: 2026-03-10 17:00 (UTC+3)*
    const patterns = [
      /Last (?:Updated|Synced):\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/i,
      /\*Last (?:Updated|Synced):\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const dateStr = `${match[1]}T${match[2]}:00+03:00`;
        const ts = new Date(dateStr).getTime();
        if (!isNaN(ts)) {
          timestamps.push({ file: relPath, timestamp: ts, dateStr: `${match[1]} ${match[2]}` });
        }
        break;
      }
    }
  }

  if (timestamps.length === 0) {
    console.error('❌ FATAL: No sync timestamps found in any memory file');
    process.exit(1);
  }

  // Use the LATEST sync timestamp as reference
  timestamps.sort((a, b) => b.timestamp - a.timestamp);
  return timestamps[0];
}

// ——————————————————————————————————————————————
// Phase 2: Scan Source Files
// ——————————————————————————————————————————————

function scanSourceFiles() {
  const results = [];
  const srcDir = path.join(PROJECT_ROOT, 'src');

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, .next, __tests__ for staleness (tests are tracked separately)
        if (['node_modules', '.next'].includes(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (['.ts', '.tsx', '.css'].includes(ext)) {
          const stat = fs.statSync(fullPath);
          const relPath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
          results.push({
            path: relPath,
            modified: stat.mtimeMs,
            modifiedDate: new Date(stat.mtimeMs).toISOString(),
            size: stat.size,
          });
        }
      }
    }
  }

  walk(srcDir);
  return results;
}

// ——————————————————————————————————————————————
// Phase 3: Classify Staleness
// ——————————————————————————————————————————————

function classifyStaleness(files, syncTimestamp) {
  const stale = [];
  const fresh = [];

  for (const file of files) {
    const importance = getImportance(file.path);
    const gapMs = file.modified - syncTimestamp;
    const gapHours = gapMs / (1000 * 60 * 60);

    const entry = {
      ...file,
      importance: importance.label,
      weight: importance.weight,
      emoji: importance.emoji,
      gapMs,
      gapHours: Math.round(gapHours * 10) / 10,
    };

    if (gapMs > 0) {
      // File was modified AFTER last sync — STALE
      stale.push(entry);
    } else {
      fresh.push(entry);
    }
  }

  // Sort stale files: CRITICAL first, then by gap descending
  stale.sort((a, b) => {
    if (a.weight !== b.weight) return b.weight - a.weight;
    return b.gapMs - a.gapMs;
  });

  return { stale, fresh };
}

function getImportance(filePath) {
  // Direct match
  if (FILE_IMPORTANCE[filePath]) {
    return IMPORTANCE_TIERS[FILE_IMPORTANCE[filePath]];
  }

  // Pattern-based classification
  if (filePath.includes('__tests__/')) return IMPORTANCE_TIERS.IMPORTANT;
  if (filePath.includes('/engine/overmind/')) return IMPORTANCE_TIERS.IMPORTANT;
  if (filePath.includes('/api/')) return IMPORTANCE_TIERS.IMPORTANT;
  if (filePath.includes('/engine/')) return IMPORTANCE_TIERS.IMPORTANT;
  if (filePath.includes('/risk/')) return IMPORTANCE_TIERS.CRITICAL;
  if (filePath.includes('/store/')) return IMPORTANCE_TIERS.IMPORTANT;
  if (filePath.includes('/hooks/')) return IMPORTANCE_TIERS.IMPORTANT;
  if (filePath.includes('/types/')) return IMPORTANCE_TIERS.CRITICAL;

  return IMPORTANCE_TIERS.STANDARD;
}

// ——————————————————————————————————————————————
// Phase 4: Compute Weighted Freshness Score
// ——————————————————————————————————————————————

function computeFreshnessScore(stale, fresh) {
  const allFiles = [...stale, ...fresh];

  if (allFiles.length === 0) return { score: 100, grade: 'A+' };

  // Weighted freshness: fresh files contribute positively, stale files negatively
  let totalWeight = 0;
  let freshWeight = 0;

  for (const file of allFiles) {
    totalWeight += file.weight;
  }

  for (const file of fresh) {
    freshWeight += file.weight;
  }

  const score = Math.round((freshWeight / totalWeight) * 100);

  // Grade assignment
  let grade;
  if (score >= 95) grade = 'A+';
  else if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return { score, grade };
}

// ——————————————————————————————————————————————
// Phase 5: Generate Auto-Triage Report
// ——————————————————————————————————————————————

function generateReport(syncRef, stale, fresh, freshnessResult) {
  const totalFiles = stale.length + fresh.length;
  const { score, grade } = freshnessResult;

  const criticalStale = stale.filter(f => f.importance === 'CRITICAL');
  const importantStale = stale.filter(f => f.importance === 'IMPORTANT');
  const standardStale = stale.filter(f => f.importance === 'STANDARD');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        MEMORY TEMPORAL INTEGRITY ENGINE (MTIE)              ║');
  console.log('║        Phase 37 — Radical Innovation                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📅 Last Sync Reference: ${syncRef.dateStr} (from ${syncRef.file})`);
  console.log(`📊 Files Scanned: ${totalFiles}`);
  console.log(`✅ Fresh: ${fresh.length} | ⚠️  Stale: ${stale.length}`);
  console.log('');

  // Freshness Score
  const scoreBar = generateBar(score);
  console.log(`🎯 Freshness Score: ${scoreBar} ${score}% (Grade: ${grade})`);
  console.log('');

  if (stale.length === 0) {
    console.log('🏆 PERFECT TEMPORAL INTEGRITY — All files synced!');
    console.log('');
    return;
  }

  // Stale files by tier
  if (criticalStale.length > 0) {
    console.log(`🔴 CRITICAL STALE (${criticalStale.length} files) — Immediate sync required:`);
    for (const f of criticalStale) {
      console.log(`   ${f.emoji} ${f.path} — modified ${f.gapHours}h after sync`);
    }
    console.log('');
  }

  if (importantStale.length > 0) {
    console.log(`🟡 IMPORTANT STALE (${importantStale.length} files) — Should sync soon:`);
    for (const f of importantStale) {
      console.log(`   ${f.emoji} ${f.path} — modified ${f.gapHours}h after sync`);
    }
    console.log('');
  }

  if (standardStale.length > 0) {
    console.log(`🟢 STANDARD STALE (${standardStale.length} files) — Low priority:`);
    for (const f of standardStale.slice(0, 10)) {
      console.log(`   ${f.emoji} ${f.path} — modified ${f.gapHours}h after sync`);
    }
    if (standardStale.length > 10) {
      console.log(`   ... and ${standardStale.length - 10} more`);
    }
    console.log('');
  }

  // Recommendations
  console.log('📋 AUTO-TRIAGE RECOMMENDATIONS:');
  if (criticalStale.length > 0) {
    console.log(`   1. 🚨 Run /memory-sync immediately — ${criticalStale.length} CRITICAL files need documentation`);
  }
  if (importantStale.length > 0) {
    console.log(`   2. ⚠️  Update file_map.md with new line counts for ${importantStale.length} IMPORTANT files`);
  }
  if (score < 80) {
    console.log(`   3. 🔴 Freshness below 80% — consider blocking new development until sync is complete`);
  }
  console.log('');
}

function generateBar(score) {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const color = score >= 80 ? '🟩' : score >= 60 ? '🟨' : '🟥';
  return color.repeat(filled) + '⬜'.repeat(empty);
}

// ——————————————————————————————————————————————
// Main Execution
// ——————————————————————————————————————————————

function main() {
  const args = process.argv.slice(2);
  const isJSON = args.includes('--json');
  const isCI = args.includes('--ci');

  // Phase 1: Extract sync timestamp
  const syncRef = extractSyncTimestamp();

  // Phase 2: Scan source files
  const files = scanSourceFiles();

  // Phase 3: Classify staleness
  const { stale, fresh } = classifyStaleness(files, syncRef.timestamp);

  // Phase 4: Compute freshness score
  const freshnessResult = computeFreshnessScore(stale, fresh);

  // Phase 5: Output
  if (isJSON) {
    const output = {
      syncReference: syncRef,
      freshness: freshnessResult,
      totalFiles: files.length,
      staleCount: stale.length,
      freshCount: fresh.length,
      staleFiles: stale.map(f => ({
        path: f.path,
        importance: f.importance,
        gapHours: f.gapHours,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    generateReport(syncRef, stale, fresh, freshnessResult);
  }

  // CI mode: exit with error if score below threshold
  if (isCI && freshnessResult.score < 80) {
    console.error(`❌ CI GATE FAILED: Freshness score ${freshnessResult.score}% < 80% threshold`);
    process.exit(1);
  }
}

main();
