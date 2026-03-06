---
description: End-of-session memory persistence — saves current state to the 5-layer memory hierarchy
---

# /memory-sync — Memory Persistence Workflow

> Execute this at the **end of every significant session** to persist the current state and prevent context drift.

// turbo-all

## Step 1: Session Change Analysis

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

## Step 2: Sync Checklist Audit

Read the sync checklist and verify which documentation needs updating:

```
cat memory/_SYNC_CHECKLIST.md
```

Go through each checkbox in the checklist:
- If the corresponding code was changed this session → update the referenced documentation
- If not changed → skip that item

**Pay special attention to**:
- **Type Layer**: `types/index.ts` and `types/trading-slot.ts`
- **Anti-Overfitting Layer**: `walk-forward.ts`, `monte-carlo.ts`, `regime-detector.ts`, `overfitting-detector.ts`
- **Island Model Layer**: `island.ts`, `cortex.ts`, `meta-evolution.ts`, `migration.ts`, `capital-allocator.ts`
- **Core Engine Layer**: `strategy-dna.ts`, `evaluator.ts`, `evolution.ts`, `brain.ts`
- **Dashboard Layer**: `page.tsx` (panels, components), `globals.css` (design system, animations)

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
- `src/lib/store/` → State Layer
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

---

## Step 7: Update Agent Skills (if applicable)

If engine behavior changed in a way that affects skill documentation:
- Read the relevant `SKILL.md` file from `.agent/skills/`
- Update the skill with new patterns, constraints, or references
- Update any reference files in `references/` if formulas or schemas changed

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

## Step 9: Build Verification

Run the build to ensure nothing is broken:

```
npx next build 2>&1
```

Record the result (pass/fail) in `active_context.md` build status.

---

## Step 10: Completion Report

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
