---
description: End-of-session memory persistence — saves current state to the 5-layer memory hierarchy
---

# /memory-sync — Memory Persistence Workflow

> Execute this at the **end of every significant session** to persist the current state and prevent context drift.

// turbo-all

## Step 0: Memory Health Dashboard (Pre-Sync Diagnostic)\r\n\r\nRun the Memory Health Dashboard to see the current state before making updates:\r\n\r\n```\r\nnode scripts/memory-health.js\r\n```\r\n\r\nThis will show:\r\n- Memory Freshness (which docs are stale vs fresh)\r\n- File Map Coverage (undocumented source files)\r\n- ADR Coverage (missing architectural decisions)\r\n- Skill System Health (skill-map freshness, skill count)\r\n- Workflow Completeness (missing keywords)\r\n\r\nUse the output to prioritize which memory docs need the most urgent attention.\r\n\r\n---\r\n\r\n## Step 1: Session Change Analysis

Analyze all changes made during this session. Identify:
- New files created
- Files modified
- Architecture decisions made
- Bugs fixed
- Features implemented

```
git diff --stat HEAD 2>$null; git status --short 2>$null
```

If git is not initialized, manually review the changes discussed in this session.

---

## Step 2: Smart Sync Analysis

Run the Smart Sync Diff Engine to automatically detect which memory docs need updating:

```
node memory/scripts/context-fingerprint.js --smart-sync
```

The tool will:
1. Compare current source file hashes against the last fingerprint
2. Show which source files changed (with line count deltas)
3. Generate a **Memory Update Plan** listing exactly which docs need updating
4. Display an **Action Checklist** with specific instructions per change
5. Calculate a **Memory Health Score** (0-100%)

Follow the generated plan for Steps 3-6. If you prefer the manual checklist:

```
cat memory/_SYNC_CHECKLIST.md
```

**Pay special attention to**:
- **Type Layer**: `types/index.ts` and `types/trading-slot.ts`
- **Anti-Overfitting Layer**: `walk-forward.ts`, `monte-carlo.ts`, `regime-detector.ts`, `overfitting-detector.ts`
- **Island Model Layer**: `island.ts`, `cortex.ts`, `meta-evolution.ts`, `migration.ts`, `capital-allocator.ts`
- **Core Engine Layer**: `strategy-dna.ts`, `evaluator.ts`, `evolution.ts`, `brain.ts`, `signal-engine.ts`, `experience-replay.ts`
- **Advanced Gene Layer**: `microstructure-genes.ts`, `price-action-genes.ts`, `composite-functions.ts`, `directional-change.ts`
- **Dashboard Layer**: `page.tsx` (panels, components), `brain/page.tsx` (holographic neural cortex), `pipeline/page.tsx` (pipeline panels, archaeology), `globals.css` (design system, animations, holographic theme)
- **Live Engine Layer**: `cortex-live-engine.ts`, `evolution-scheduler.ts`, `adaptive-data-flow.ts` (ADFI), `regime-propagation.ts` (CIRPN)
- **Pipeline Live Layer**: `hooks/usePipelineLiveData.ts` (data bridge hook), `evolution-health.ts` (health analyzer)
- **Persistence Layer**: `persistence.ts` (IndexedDB), `supabase.ts` (cloud DB), `persistence-bridge.ts` (dual-write bridge)
- **Overmind Layer**: `overmind/strategic-overmind.ts`, `overmind/opus-client.ts`, `overmind/hypothesis-engine.ts`, `overmind/evolution-director.ts`, `overmind/adversarial-tester.ts`, `overmind/predictive-orchestrator.ts`, `overmind/episodic-memory.ts`, `overmind/counterfactual-engine.ts`, `overmind/meta-cognition.ts`, and 6 supporting modules
- **Binance Execution Layer**: `api/binance-rest.ts` (AdaptiveRateGovernor), `api/exchange-circuit-breaker.ts`, `api/user-data-stream.ts`, `api/account-sync.ts`, `api/order-lifecycle.ts` (AOLE), `api/execution-quality.ts`
- **Skill Layer**: All `.agent/skills/*/SKILL.md` files, `.agent/skill-map.json`, `.agent/skill-graph.md`
- **Test Layer**: `vitest.config.ts`, `risk/__tests__/manager.test.ts`, `engine/__tests__/cortex-risk.test.ts`, `hooks/__tests__/risk-derivation.test.ts`, `engine/__tests__/validation-pipeline.test.ts`, `engine/__tests__/migration-engine.test.ts`, `engine/__tests__/advanced-genes.test.ts`, `engine/__tests__/evaluator.test.ts`, `engine/__tests__/signal-engine.test.ts`, `engine/__tests__/confluence-genes.test.ts`, `engine/__tests__/property-fuzzer.test.ts`, `engine/__tests__/integration-e2e.test.ts`
- **Live Trade Layer**: `engine/live-trade-executor.ts`, `engine/stress-matrix.ts`, `app/api/trading/status/route.ts`

---

## Step 3: Update `active_context.md`

Update `memory/active_context.md` with:

1. **Date**: Set to current date
2. **Phase**: Update if development phase changed
3. **Build Status**: Run `npx next build` and record result
4. **AI Brain / Cortex Status**: Update if state, generation, fitness, islands, or validation changed
5. **Completed Tasks**: Add new items under a new session header with session date
6. **Incomplete Features**: Add any new technical debt discovered, remove resolved items
7. **Next Session Priorities**: Update based on what makes sense to do next

**Template for new completed tasks:**
```markdown
### Session: YYYY-MM-DD — [Session Title]
N. **[Task Name]**: [Brief description of what was done]
```

---

## Step 4: Update `changelog.md`

If significant changes were made, add a new version entry to `memory/changelog.md`:

```markdown
## [vX.Y.Z] — YYYY-MM-DD

### Added/Changed/Fixed
- **[Feature/Fix Name]**
  - Detail 1
  - Detail 2

### Build Status
✅ Passing / ❌ Failed
```

Only bump version for:
- **Major (X)**: Architecture redesign, breaking changes
- **Minor (Y)**: New features, new modules
- **Patch (Z)**: Bug fixes, small improvements

---

## Step 5: Update File Map (if new files created)

If any new source files were created during this session, add them to `memory/file_map.md` in the appropriate section with:
- File path
- Purpose description
- Importance level (🔴 Critical, 🟡 Important, 🟢 Standard)

**Layer Mapping**:
- `src/types/` → Type Layer
- `src/lib/engine/` → Core Engine / Anti-Overfitting / Island Model Layer
- `src/lib/risk/` → Risk Layer
- `src/lib/store/` → State & Persistence Layer
- `src/lib/db/` → Cloud Database Layer
- `src/app/` → Presentation Layer

---

## Step 6: Update Architecture Docs (if applicable)

If significant architectural changes were made:
- Update `memory/architecture/system_design.md` with new module relationships or data flows
- If a major design decision was made, create a new ADR in `memory/adr/` following the template:

```markdown
# ADR-NNN: [Decision Title]

**Status**: Accepted
**Date**: YYYY-MM-DD

## Context
[Why this decision needed to be made]

## Decision
[What was decided]

## Rationale
[Why this option was chosen over alternatives]

## Consequences
### Positive
### Negative
### Mitigation
```

**Existing ADRs** (check before creating duplicates):
- ADR-001: GA over RL
- ADR-002: Anti-Overfitting Pipeline
- ADR-003: Island Model Architecture
- ADR-004: Meta-Evolution (GA²)
- ADR-005: Strategy Archaeology (Explainable AI)
- ADR-006: Advanced Strategy Genome Architecture
- ADR-007: Hybrid Persistence Architecture (IndexedDB + Supabase)
- ADR-008: Strategic Overmind Architecture (Opus 4.6 AI Supervisor, PSPP, CCR)
- ADR-009: Neural Brain Visualization Architecture (Holographic 3D Cortex, Biological Refractory Period, Multi-Color HSLA Heatmap)
- ADR-010: Atomic Order Lifecycle Engine (13-state machine, mandatory SL invariant, Adaptive Rate Governor, Execution Quality Tracker)
- ADR-011: Pipeline Live Integration Architecture (data bridge hook, dual-mode, hidden engine intelligence exposure)
- ADR-012: Risk Manager Global Enforcement + Automated Test Infrastructure (5-layer integration, Vitest, Safety Rail Mutation Tests)

---

## Step 7: Update Agent Skills & Skill Map (if applicable)

If engine behavior changed in a way that affects skill documentation:
- Read the relevant `SKILL.md` file from `.agent/skills/`
- Update the skill with new patterns, constraints, or references
- Update any reference files in `references/` if formulas or schemas changed
- **Regenerate the Skill Map** to reflect structural changes:

```
node scripts/generate-skill-map.js
```

- **Validate Skill Integrity** to detect orphans, stale refs, and missing links:

```
node scripts/validate-skills.js
```

---

## Step 8: Context DNA Fingerprint Verification

Run the Context DNA Fingerprint to verify memory integrity:

```
node memory/scripts/context-fingerprint.js --verify
```

If the tool reports DRIFT:
- Review the affected memory files
- Verify the drift is expected (due to your current updates)
- Regenerate the fingerprint after all updates are complete:

```
node memory/scripts/context-fingerprint.js --generate
```

The fingerprint file `memory/_FINGERPRINT.json` must be committed as part of the sync.

---

## Step 8.5: Memory Coherence Validation (Semantic Cross-Reference)

Run the Memory Coherence Validator to detect documentation rot (deleted files still referenced, renamed types):

```
node scripts/memory-coherence.js
```

This goes BEYOND hash-based fingerprinting by performing 4-phase semantic validation:
1. **File references**: Verifies every file path mentioned in memory docs exists in the source tree
2. **ADR cross-references**: Validates file paths referenced in ADR documents
3. **Workflow commands**: Checks that every `node`/`cat` command in workflows targets existing files
4. **Critical types**: Spot-checks 15 core TypeScript types exist in `types/index.ts`

Target: **95%+ coherence score**. If below, fix the broken references before committing.

---

## Step 8.7: Memory Drift Auto-Patcher (Radical Innovation)

Run the Memory Drift Auto-Patcher to detect undocumented source files and generate copy-paste-ready patches:

```
node scripts/memory-autopatcher.js
```

This goes BEYOND detection by performing 5-phase self-healing analysis:
1. **File Discovery**: Scans all `src/` source files (.ts, .tsx, .js, .jsx)
2. **Coverage Check**: Cross-references every file against `file_map.md` entries
3. **Purpose Extraction**: Reads file headers to auto-extract description from comments/exports
4. **Layer Detection**: Maps each file to the correct `file_map.md` section via 16 pattern rules
5. **Patch Generation**: Outputs exact table rows to copy-paste into `file_map.md`

Also cross-checks `changelog.md` and `active_context.md` for documentation gaps.

Target: **0 undocumented files**. If any are found, copy-paste the generated patches into the appropriate memory docs.

---

## Step 8.9: Test↔Memory Cross-Validator (Radical Innovation — Phase 22)

Run the Test↔Memory Cross-Validator to verify bidirectional integrity between test files and memory documentation:

```
node scripts/test-memory-validator.js
```

This performs 5-phase semantic cross-validation:
1. **Test Documentation**: Every test file is documented in `file_map.md`
2. **Critical File Coverage**: Every 🔴 Critical source file has corresponding test coverage
3. **ADR Integrity**: Every ADR file is referenced in workflow commands
4. **Version Sync**: Changelog version matches active_context phase
5. **Test Count Accuracy**: Test counts in memory docs match actual `it()` count in source

Target: **85%+ composite integrity score** (Grade A). If below, fix the gaps in memory docs or add missing tests.

---

## Step 9: Test Coverage Guardian (Radical Innovation — Phase 25)

Run the Test Coverage Guardian to analyze function-level test coverage across all engine modules:

```
node scripts/test-coverage-guardian.js
```

This performs 5-phase automated analysis:
1. **Function Discovery**: Scans all engine/risk/hooks modules for exported functions, classes, and enums
2. **Test Mapping**: Cross-references each exported function with test file imports and call-site references
3. **Coverage Scoring**: Per-module function coverage % with visual bars
4. **Gap Detection**: Lists untested exported functions in 🔴 Critical modules
5. **Staleness Check**: Detects test files older than their corresponding source files

Produces a **Test Health Score** (0-100, Grade A-F) based on:
- Overall function coverage (40%)
- Critical module coverage (40%)
- Chaos Monkey presence (20%)
- Stale test penalty (-5 per stale file)

Target: **Grade B+ (75+)**. If below, prioritize the recommended gaps.

---

## Step 9.5: Memory Integrity Auto-Auditor (Radical Innovation — Phase 27)

Run the Memory Integrity Auto-Auditor for 7-phase deep cross-validation between memory docs and source code:

```
node scripts/memory-integrity-auditor.js
```

This performs 7-phase semantic cross-validation:
1. **Orphaned References**: Verifies every file path in memory docs exists in the source tree
2. **Phantom Files**: Detects source files not documented in `file_map.md`
3. **Test Count Desync**: Compares documented test counts against actual `it()` calls in source
4. **Version Chain Integrity**: Validates changelog versions are in descending order
5. **Phase Timeline Consistency**: Cross-checks phase numbers across active_context, overview, and changelog
6. **ADR Coverage**: Validates ADR count matches between workflow references and actual files
7. **Workflow Command Validity**: Checks all `node` scripts in workflow commands exist

Target: **Grade A+ (100%)**. If below, fix the identified documentation gaps before committing.

---

## Step 10: Build Verification

Run the tests and build to ensure nothing is broken:

```
npm test 2>&1
```

Record test result (pass/fail count).

```
npx next build 2>&1
```

Record the build result (pass/fail) in `active_context.md` build status.

---

## Step 11: Completion Report

After all updates are complete, provide the following confirmation:

```markdown
## 🔄 Memory Sync Complete — Learner

**Date**: YYYY-MM-DD HH:MM
**Session**: [Session Title]
**Version**: [New version from changelog]

### Updated Artifacts
| Artifact | Status |
|----------|--------|
| `active_context.md` | ✅ Updated |
| `changelog.md` | ✅ Updated / ⏭️ Skipped |
| `file_map.md` | ✅ Updated / ⏭️ Skipped |
| `architecture/system_design.md` | ✅ Updated / ⏭️ Skipped |
| `overview.md` | ✅ Updated / ⏭️ Skipped |
| New ADR created | ✅ Yes: ADR-NNN / ⏭️ No |
| Agent Skills updated | ✅ Yes / ⏭️ No |
| Context DNA Fingerprint | ✅ Valid / ⚠️ Regenerated |

### Build
✅ Passed / ❌ Failed

### Next Session Priorities
1. [Priority 1]
2. [Priority 2]
3. [Priority 3]

---
Memory sync complete! Context preserved for next session. 🧠
```
