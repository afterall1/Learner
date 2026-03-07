#!/usr/bin/env node
// ============================================================
// Learner: Skill Integrity Validator — Self-Auditing Knowledge Graph
// ============================================================
// Radical Innovation: Automated cross-referencing of agent skills
// against actual source files.
//
// Detects:
//   1. ORPHANED FILES  — src files not covered by ANY skill
//   2. STALE REFS      — skills referencing files that don't exist
//   3. MISSING LINKS   — skills that should cross-reference each other
//
// Usage: node scripts/validate-skills.js
// ============================================================

const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.agent', 'skills');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

const IGNORED_PATTERNS = [
    '**/*.css',
    '**/*.test.*',
    '**/layout.tsx',
    '**/globals.css',
];

// ─── Parse SKILL.md Files ────────────────────────────────────

function parseSkillFile(skillDir) {
    const skillPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) return null;

    const content = fs.readFileSync(skillPath, 'utf-8');
    const name = path.basename(skillDir);

    // Extract key files section
    const keyFilesMatch = content.match(/## 📁 Key Files\s*\n([\s\S]*?)(?=\n## |\n---|\n$)/);
    const keyFiles = [];
    if (keyFilesMatch) {
        const lines = keyFilesMatch[1].split('\n');
        for (const line of lines) {
            const fileMatch = line.match(/`(src\/[^`]+)`/);
            if (fileMatch) {
                keyFiles.push(fileMatch[1]);
            } else {
                // Also match — format: - src/... → description
                const dashMatch = line.match(/- `?(src\/\S+)`?/);
                if (dashMatch) {
                    keyFiles.push(dashMatch[1].replace(/`/g, ''));
                }
            }
        }
    }

    // Extract cross-references section
    const crossRefMatch = content.match(/## 🔗 Cross-References\s*\n([\s\S]*?)(?=\n## |\n---|\n$)/);
    const crossRefs = [];
    if (crossRefMatch) {
        const lines = crossRefMatch[1].split('\n');
        for (const line of lines) {
            const refMatch = line.match(/\|\s*`([^`]+)`\s*\|/);
            if (refMatch && refMatch[1] !== '_(all skills)_') {
                crossRefs.push(refMatch[1]);
            }
        }
    }

    // Extract description from frontmatter
    const descMatch = content.match(/description:\s*(.+)/);
    const description = descMatch ? descMatch[1].trim() : '';

    return { name, keyFiles, crossRefs, description };
}

// ─── Collect Source Files ────────────────────────────────────

function collectSourceFiles() {
    const files = [];
    const extensions = ['.ts', '.tsx'];

    function walk(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    // Skip node_modules, .next, etc.
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        walk(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (extensions.includes(ext)) {
                        const relativePath = path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/');
                        files.push(relativePath);
                    }
                }
            }
        } catch (err) {
            // Directory not accessible
        }
    }

    walk(SRC_DIR);
    return files;
}

// ─── Validation Logic ────────────────────────────────────────

function validate() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  🛡️  SKILL INTEGRITY VALIDATOR — Learner Knowledge Graph  ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // 1. Parse all skills
    const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(SKILLS_DIR, d.name));

    const skills = skillDirs
        .map(parseSkillFile)
        .filter(Boolean);

    console.log(`📚 Skills found: ${skills.length}\n`);
    for (const skill of skills) {
        console.log(`  • ${skill.name} (${skill.keyFiles.length} key files, ${skill.crossRefs.length} cross-refs)`);
    }

    // 2. Collect all source files
    const srcFiles = collectSourceFiles();
    console.log(`\n📂 Source files found: ${srcFiles.length}\n`);

    // 3. Build coverage map: which files are covered by which skills
    const fileCoverage = new Map(); // file → skill[]
    const allKeyFiles = new Set();

    for (const skill of skills) {
        for (const keyFile of skill.keyFiles) {
            allKeyFiles.add(keyFile);
            if (!fileCoverage.has(keyFile)) {
                fileCoverage.set(keyFile, []);
            }
            fileCoverage.get(keyFile).push(skill.name);
        }
    }

    // 4. Detect ORPHANED FILES
    console.log('─── CHECK 1: Orphaned Files (not covered by any skill) ───\n');
    let orphanCount = 0;
    const significantFiles = srcFiles.filter(f => {
        // Filter out test files, CSS, etc.
        if (f.includes('.test.')) return false;
        if (f.endsWith('.css')) return false;
        if (f.includes('/api/')) return false; // API routes are infrastructure
        return true;
    });

    for (const file of significantFiles) {
        const isCovered = [...allKeyFiles].some(keyFile => {
            // Check if the file matches or is within a referenced directory
            return file === keyFile || file.startsWith(keyFile.replace(/\.ts$/, '/'));
        });
        if (!isCovered) {
            console.log(`  ⚠️  ORPHAN: ${file}`);
            orphanCount++;
        }
    }
    if (orphanCount === 0) {
        console.log('  ✅ No orphaned files detected!');
    } else {
        console.log(`\n  Total orphans: ${orphanCount}`);
    }

    // 5. Detect STALE REFERENCES
    console.log('\n─── CHECK 2: Stale References (skill references non-existent file) ───\n');
    let staleCount = 0;
    for (const skill of skills) {
        for (const keyFile of skill.keyFiles) {
            const fullPath = path.join(PROJECT_ROOT, keyFile);
            if (!fs.existsSync(fullPath)) {
                console.log(`  ❌ STALE: [${skill.name}] → ${keyFile}`);
                staleCount++;
            }
        }
    }
    if (staleCount === 0) {
        console.log('  ✅ No stale references found!');
    } else {
        console.log(`\n  Total stale refs: ${staleCount}`);
    }

    // 6. Detect MISSING CROSS-LINKS
    console.log('\n─── CHECK 3: Missing Cross-Links ───\n');
    let missingLinkCount = 0;
    const skillNames = new Set(skills.map(s => s.name));

    for (const skill of skills) {
        for (const ref of skill.crossRefs) {
            if (!skillNames.has(ref)) {
                console.log(`  🔗 MISSING: [${skill.name}] references "${ref}" but no such skill exists`);
                missingLinkCount++;
            }
        }
    }

    // Check bidirectional: if A references B, does B reference A?
    for (const skillA of skills) {
        for (const ref of skillA.crossRefs) {
            const skillB = skills.find(s => s.name === ref);
            if (skillB) {
                const bRefsA = skillB.crossRefs.includes(skillA.name);
                if (!bRefsA && skillA.name !== 'learner-conventions') {
                    // learner-conventions is exempt (it references everything)
                    console.log(`  ↔️  ONE-WAY: [${skillA.name}] → [${skillB.name}] but not reverse`);
                    missingLinkCount++;
                }
            }
        }
    }

    if (missingLinkCount === 0) {
        console.log('  ✅ All cross-links are valid and bidirectional!');
    } else {
        console.log(`\n  Total missing links: ${missingLinkCount}`);
    }

    // 7. Summary
    const totalIssues = orphanCount + staleCount + missingLinkCount;
    console.log('\n═══════════════════════════════════════════════════════════');
    if (totalIssues === 0) {
        console.log('✅ SKILL INTEGRITY: PERFECT — All files covered, no stale refs, all links valid');
    } else {
        console.log(`⚠️  SKILL INTEGRITY: ${totalIssues} issues found`);
        console.log(`   Orphaned files: ${orphanCount}`);
        console.log(`   Stale references: ${staleCount}`);
        console.log(`   Missing links: ${missingLinkCount}`);
    }
    console.log('═══════════════════════════════════════════════════════════\n');

    return totalIssues;
}

// ─── Run ─────────────────────────────────────────────────────

const issues = validate();
process.exit(issues > 0 ? 1 : 0);
