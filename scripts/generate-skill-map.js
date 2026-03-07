#!/usr/bin/env node
// ============================================================
// Learner: Skill Auto-Activation Intelligence — Dependency Graph Generator
// ============================================================
// Radical Innovation: Transforms passive skill docs into an active
// intelligence layer via static import analysis.
//
// Generates:
//   1. .agent/skill-map.json  — machine-readable file → skill index
//   2. .agent/skill-graph.md  — Mermaid DAG of skill dependencies
//
// Usage: node scripts/generate-skill-map.js
// ============================================================

const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.agent', 'skills');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const OUTPUT_MAP = path.join(PROJECT_ROOT, '.agent', 'skill-map.json');
const OUTPUT_GRAPH = path.join(PROJECT_ROOT, '.agent', 'skill-graph.md');

// ─── Skill Parser ────────────────────────────────────────────

function parseAllSkills() {
    const skills = [];
    try {
        const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory());

        for (const dir of dirs) {
            const skillPath = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
            if (!fs.existsSync(skillPath)) continue;

            const content = fs.readFileSync(skillPath, 'utf-8');
            const name = dir.name;

            // Extract key files
            const keyFilesMatch = content.match(/## 📁 Key Files\s*\n([\s\S]*?)(?=\n## |\n---|\n$)/);
            const keyFiles = [];
            if (keyFilesMatch) {
                const lines = keyFilesMatch[1].split('\n');
                for (const line of lines) {
                    const fileMatch = line.match(/`(src\/[^`]+)`/);
                    if (fileMatch) {
                        keyFiles.push(fileMatch[1].replace(/\\/g, '/'));
                    } else {
                        const dashMatch = line.match(/- `?(src\/\S+)`?/);
                        if (dashMatch) {
                            keyFiles.push(dashMatch[1].replace(/`/g, '').replace(/\\/g, '/'));
                        }
                    }
                }
            }

            // Extract cross-references
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

            // Extract description
            const descMatch = content.match(/description:\s*(.+)/);
            const description = descMatch ? descMatch[1].trim() : '';

            // Extract activation triggers from description
            const triggers = description
                .split(/,\s*/)
                .map(t => t.trim().toLowerCase())
                .filter(t => t.length > 3);

            skills.push({ name, keyFiles, crossRefs, description, triggers });
        }
    } catch (err) {
        console.error(`[SkillMapGen] Failed to parse skills: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    return skills;
}

// ─── Source File Import Analyzer ─────────────────────────────

function collectSourceImports() {
    const fileImports = new Map(); // file → Set<imported file>
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
                    const imports = extractImports(fullPath, path.dirname(fullPath));
                    fileImports.set(relativePath, imports);
                }
            }
        } catch (err) {
            // Directory not accessible
        }
    }

    walk(SRC_DIR);
    return fileImports;
}

function extractImports(filePath, fileDir) {
    const imports = new Set();
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Match: import ... from 'X' or import ... from "X"
        const importRegex = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];

            // Resolve @/ alias
            if (importPath.startsWith('@/')) {
                const resolved = 'src/' + importPath.slice(2);
                imports.add(resolveFilePath(resolved));
            }
            // Resolve relative imports
            else if (importPath.startsWith('./') || importPath.startsWith('../')) {
                const resolved = path.relative(
                    PROJECT_ROOT,
                    path.resolve(fileDir, importPath)
                ).replace(/\\/g, '/');
                imports.add(resolveFilePath(resolved));
            }
            // Skip node_modules imports (react, zustand, etc.)
        }
    } catch (err) {
        // File not readable
    }
    return imports;
}

function resolveFilePath(importPath) {
    // Try exact path, then with extensions
    const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx', ''];
    for (const ext of extensions) {
        const candidate = importPath + ext;
        const fullPath = path.join(PROJECT_ROOT, candidate);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            return candidate;
        }
    }
    return importPath; // Return as-is if not resolvable
}

// ─── Dependency Graph Builder ────────────────────────────────

function buildFileToSkillMap(skills, fileImports) {
    const fileToSkills = {};
    const skillToFiles = {};
    const skillDependencies = {};

    // Build direct key file → skill mapping
    const keyFileToSkill = new Map(); // file → skill name
    for (const skill of skills) {
        skillToFiles[skill.name] = {
            keyFiles: [...skill.keyFiles],
            dependentFiles: [],
        };
        skillDependencies[skill.name] = new Set(skill.crossRefs);

        for (const keyFile of skill.keyFiles) {
            if (!keyFileToSkill.has(keyFile)) {
                keyFileToSkill.set(keyFile, []);
            }
            keyFileToSkill.get(keyFile).push(skill.name);
        }
    }

    // For each source file, determine which skills apply
    for (const [file, imports] of fileImports) {
        const primarySkills = new Set();
        const secondarySkills = new Set();

        // Direct match: file IS a key file of a skill
        const directSkills = keyFileToSkill.get(file);
        if (directSkills) {
            for (const s of directSkills) {
                primarySkills.add(s);
            }
        }

        // Transitive match: file IMPORTS a key file of a skill
        for (const importedFile of imports) {
            const importSkills = keyFileToSkill.get(importedFile);
            if (importSkills) {
                for (const s of importSkills) {
                    if (!primarySkills.has(s)) {
                        secondarySkills.add(s);
                    }
                }
            }
        }

        // Also check: does any key file import THIS file?
        // (reverse dependency — editing this file might break things in a skill)
        for (const [otherFile, otherImports] of fileImports) {
            if (otherImports.has(file)) {
                const otherSkills = keyFileToSkill.get(otherFile);
                if (otherSkills) {
                    for (const s of otherSkills) {
                        if (!primarySkills.has(s)) {
                            secondarySkills.add(s);
                        }
                    }
                }
            }
        }

        // Only add files that have at least one skill match
        if (primarySkills.size > 0 || secondarySkills.size > 0) {
            fileToSkills[file] = {
                primary: [...primarySkills].sort(),
                secondary: [...secondarySkills].sort(),
                conventions: ['learner-conventions'], // Always applies
            };

            // Track dependent files for each skill
            for (const skillName of secondarySkills) {
                if (skillToFiles[skillName] && !skillToFiles[skillName].keyFiles.includes(file)) {
                    skillToFiles[skillName].dependentFiles.push(file);
                }
            }
        }
    }

    // Infer skill-to-skill dependencies from import chains
    for (const skill of skills) {
        for (const keyFile of skill.keyFiles) {
            const imports = fileImports.get(keyFile);
            if (!imports) continue;

            for (const importedFile of imports) {
                const importSkills = keyFileToSkill.get(importedFile);
                if (importSkills) {
                    for (const s of importSkills) {
                        if (s !== skill.name) {
                            skillDependencies[skill.name].add(s);
                        }
                    }
                }
            }
        }
    }

    // Convert Sets to arrays
    const dependencyGraph = {};
    for (const [skill, deps] of Object.entries(skillDependencies)) {
        dependencyGraph[skill] = [...deps].sort();
    }

    return { fileToSkills, skillToFiles, dependencyGraph };
}

// ─── Mermaid Graph Generator ─────────────────────────────────

function generateMermaidGraph(dependencyGraph) {
    const shortNames = {
        'anti-overfitting-validation': 'AOV',
        'backtesting-simulation': 'BS',
        'binance-integration': 'BI',
        'dashboard-development': 'DD',
        'data-visualization': 'DV',
        'evolution-engine': 'EE',
        'hybrid-persistence': 'HP',
        'learner-conventions': 'LC',
        'meta-evolution': 'ME',
        'motion-design': 'MD',
        'multi-island-ui': 'MIU',
        'performance-analysis': 'PA',
        'regime-intelligence': 'RI',
        'risk-management': 'RM',
        'strategic-overmind': 'SO',
        'trade-forensics': 'TF',
    };

    const fullNames = {
        'AOV': 'Anti-Overfitting',
        'BS': 'Backtesting',
        'BI': 'Binance API',
        'DD': 'Dashboard',
        'DV': 'Data Viz',
        'EE': 'Evolution Engine',
        'HP': 'Hybrid Persistence',
        'LC': 'Learner Conventions',
        'ME': 'Meta-Evolution',
        'MD': 'Motion Design',
        'MIU': 'Multi-Island UI',
        'PA': 'Performance Analysis',
        'RI': 'Regime Intelligence',
        'RM': 'Risk Management',
        'SO': 'Strategic Overmind',
        'TF': 'Trade Forensics',
    };

    let mermaid = '```mermaid\ngraph TD\n';

    // Node definitions with styling
    const definedNodes = new Set();
    for (const [skill, deps] of Object.entries(dependencyGraph)) {
        const id = shortNames[skill] || skill;
        if (!definedNodes.has(id)) {
            mermaid += `    ${id}["${fullNames[id] || skill}"]\n`;
            definedNodes.add(id);
        }
        for (const dep of deps) {
            const depId = shortNames[dep] || dep;
            if (!definedNodes.has(depId)) {
                mermaid += `    ${depId}["${fullNames[depId] || dep}"]\n`;
                definedNodes.add(depId);
            }
        }
    }

    mermaid += '\n';

    // Edges (skip learner-conventions since it connects to everything)
    const edges = new Set();
    for (const [skill, deps] of Object.entries(dependencyGraph)) {
        if (skill === 'learner-conventions') continue;
        const id = shortNames[skill] || skill;
        for (const dep of deps) {
            if (dep === 'learner-conventions') continue;
            const depId = shortNames[dep] || dep;
            const edgeKey = `${id} --> ${depId}`;
            if (!edges.has(edgeKey)) {
                mermaid += `    ${edgeKey}\n`;
                edges.add(edgeKey);
            }
        }
    }

    // Style groups
    mermaid += '\n    %% Style groups\n';
    mermaid += '    classDef aiLayer fill:#7c3aed,stroke:#5b21b6,color:#fff\n';
    mermaid += '    classDef engineLayer fill:#0ea5e9,stroke:#0284c7,color:#fff\n';
    mermaid += '    classDef dataLayer fill:#10b981,stroke:#059669,color:#fff\n';
    mermaid += '    classDef uiLayer fill:#f59e0b,stroke:#d97706,color:#fff\n';
    mermaid += '    classDef foundationLayer fill:#6b7280,stroke:#4b5563,color:#fff\n';
    mermaid += '\n';
    mermaid += '    class SO,ME aiLayer\n';
    mermaid += '    class EE,BS,PA,AOV,RM,RI,TF engineLayer\n';
    mermaid += '    class HP,BI dataLayer\n';
    mermaid += '    class DD,DV,MD,MIU uiLayer\n';
    mermaid += '    class LC foundationLayer\n';
    mermaid += '```\n';

    return mermaid;
}

// ─── Output Generators ──────────────────────────────────────

function writeSkillMap(data) {
    const output = {
        version: 1,
        generated: new Date().toISOString(),
        totalFiles: Object.keys(data.fileToSkills).length,
        totalSkills: Object.keys(data.skillToFiles).length,
        fileToSkills: data.fileToSkills,
        skillToFiles: data.skillToFiles,
        dependencyGraph: data.dependencyGraph,
    };

    fs.writeFileSync(OUTPUT_MAP, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`  ✅ ${OUTPUT_MAP}`);
}

function writeSkillGraph(dependencyGraph) {
    const mermaid = generateMermaidGraph(dependencyGraph);

    const content = `# Skill Dependency Graph

> Auto-generated by \`scripts/generate-skill-map.js\`
> Last updated: ${new Date().toISOString()}

## How to Read This Graph

- **Purple nodes** (AI Layer): Strategic Overmind, Meta-Evolution
- **Blue nodes** (Engine Layer): Evolution Engine, Backtesting, Performance Analysis, etc.
- **Green nodes** (Data Layer): Hybrid Persistence, Binance Integration
- **Amber nodes** (UI Layer): Dashboard, Data Viz, Motion Design, Multi-Island UI
- **Gray nodes** (Foundation): Learner Conventions (connects to everything)

Arrows show dependency direction: if skill A → skill B, then code in A's domain depends on B's domain.

## Dependency DAG

${mermaid}

## Skill Activation Rules

When editing a file, consult \`.agent/skill-map.json\` to determine:

| Priority | Meaning | Action |
|----------|---------|--------|
| **primary** | File IS a key file of this skill | Read SKILL.md **immediately** |
| **secondary** | File IMPORTS from this skill's domain | Review SKILL.md for relevant rules |
| **conventions** | Always applies | Follow \`learner-conventions\` rules |
`;

    fs.writeFileSync(OUTPUT_GRAPH, content, 'utf-8');
    console.log(`  ✅ ${OUTPUT_GRAPH}`);
}

// ─── Main ────────────────────────────────────────────────────

function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  🧠 SKILL AUTO-ACTIVATION INTELLIGENCE — Map Generator       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // 1. Parse skills
    const skills = parseAllSkills();
    console.log(`📚 Skills parsed: ${skills.length}`);
    for (const s of skills) {
        console.log(`  • ${s.name} (${s.keyFiles.length} key files)`);
    }

    // 2. Analyze imports
    console.log('\n🔍 Analyzing source file imports...');
    const fileImports = collectSourceImports();
    console.log(`  Files scanned: ${fileImports.size}`);

    let totalImports = 0;
    for (const imports of fileImports.values()) {
        totalImports += imports.size;
    }
    console.log(`  Import edges found: ${totalImports}`);

    // 3. Build dependency graph
    console.log('\n🏗️  Building file-to-skill mapping...');
    const mapData = buildFileToSkillMap(skills, fileImports);
    console.log(`  Files with skill coverage: ${Object.keys(mapData.fileToSkills).length}`);
    console.log(`  Skill dependency edges: ${Object.values(mapData.dependencyGraph).reduce((a, b) => a + b.length, 0)}`);

    // 4. Write outputs
    console.log('\n📄 Writing output files...');
    writeSkillMap(mapData);
    writeSkillGraph(mapData.dependencyGraph);

    // 5. Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ SKILL MAP GENERATED SUCCESSFULLY');
    console.log(`   skill-map.json: ${Object.keys(mapData.fileToSkills).length} file mappings`);
    console.log(`   skill-graph.md: Mermaid DAG with ${Object.keys(mapData.dependencyGraph).length} skill nodes`);
    console.log('═══════════════════════════════════════════════════════════\n');
}

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SkillMapGen] Fatal error: ${message}`);
    process.exit(1);
}
