# 🔴 Memory Sync Checklist — Learner

> **Use at the end of every session.** Verify that code changes are reflected in memory artifacts before completing `/memory-sync`.

---

## 1. Code → Documentation Audit

Check each item if the corresponding change was made during this session:

### Type Layer
- [ ] `types/index.ts` changed? → Update `memory/overview.md` (Module Map) + `memory/file_map.md`
- [ ] `types/trading-slot.ts` changed? → Update `memory/file_map.md` + `memory/architecture/system_design.md`

### Core Engine Layer
- [ ] `strategy-dna.ts` changed? → Update `memory/architecture/system_design.md` (DNA flow) + `memory/overview.md` (Module Map) + `memory/file_map.md`
- [ ] `evaluator.ts` changed? → Update `memory/architecture/system_design.md` (Fitness scoring)
- [ ] `signal-engine.ts` changed? → Update `memory/architecture/system_design.md` (Signal flow) + `memory/file_map.md`
- [ ] `evolution.ts` changed? → Update `memory/architecture/system_design.md` (GA pipeline)
- [ ] `experience-replay.ts` changed? → Update `memory/architecture/system_design.md` (Pattern extraction) + `memory/file_map.md`
- [ ] `brain.ts` changed? → Update `memory/architecture/system_design.md` (Brain lifecycle) + `memory/active_context.md` (Brain status)

### Advanced Gene Layer
- [ ] `microstructure-genes.ts` changed? → Update `memory/file_map.md` (Advanced Gene Layer) + `memory/architecture/system_design.md` (Advanced Gene Signal Flow)
- [ ] `price-action-genes.ts` changed? → Update `memory/file_map.md` (Advanced Gene Layer) + `memory/architecture/system_design.md` (Advanced Gene Signal Flow)
- [ ] `composite-functions.ts` changed? → Update `memory/file_map.md` (Advanced Gene Layer) + `memory/architecture/system_design.md` (Advanced Gene Signal Flow)
- [ ] `directional-change.ts` changed? → Update `memory/file_map.md` (Advanced Gene Layer) + `memory/architecture/system_design.md` (Advanced Gene Signal Flow)

### Anti-Overfitting Layer
- [ ] `walk-forward.ts` changed? → Update `memory/architecture/system_design.md` (Validation pipeline)
- [ ] `monte-carlo.ts` changed? → Update `memory/architecture/system_design.md` (Validation pipeline)
- [ ] `regime-detector.ts` changed? → Update `memory/architecture/system_design.md` (Validation pipeline)
- [ ] `overfitting-detector.ts` changed? → Update `memory/architecture/system_design.md` (Validation pipeline)

### Island Model Layer
- [ ] `island.ts` changed? → Update `memory/architecture/system_design.md` (Island architecture)
- [ ] `cortex.ts` changed? → Update `memory/architecture/system_design.md` (Cortex orchestrator) + `memory/active_context.md` (Brain status)
- [ ] `meta-evolution.ts` changed? → Update `memory/architecture/system_design.md` (Meta-Evolution GA² flow) + `memory/overview.md` (Key Features)
- [ ] `migration.ts` changed? → Update `memory/architecture/system_design.md` (Migration topology)
- [ ] `capital-allocator.ts` changed? → Update `memory/architecture/system_design.md` (Capital allocation)

### Risk Layer
- [ ] `manager.ts` changed? → Update `memory/overview.md` (Critical Rules) + `memory/architecture/system_design.md` (Risk integration)

### State Layer
- [ ] `store/index.ts` changed? → Update `memory/architecture/system_design.md` (Store architecture)

### Dashboard Layer
- [ ] `page.tsx` changed? → Update `memory/overview.md` (Dashboard Panels) if new panels added
- [ ] `pipeline/page.tsx` changed? → Update `memory/overview.md` (Pipeline Dashboard section) + `memory/architecture/system_design.md` (Pipeline data flow)
- [ ] `globals.css` changed? → No doc update needed (styling only)
- [ ] New components added? → Update `memory/file_map.md` + `memory/overview.md`

### Configuration
- [ ] `package.json` changed? → Update `memory/overview.md` (Tech Stack) if new dependencies
- [ ] New files created? → **MUST** update `memory/file_map.md`

---

## 2. Architecture Decisions

- [ ] Were any significant design decisions made? → Create new ADR in `memory/adr/`
- [ ] Were existing patterns changed? → Update relevant ADR with amendment

---

## 3. Integrity Verification

- [ ] `active_context.md` updated with completed/pending tasks?
- [ ] `active_context.md` has accurate "Next Session Priorities"?
- [ ] `active_context.md` has correct AI Brain / Cortex status?
- [ ] Would a new agent understand the project state from `overview.md` + `active_context.md`?

---

## 4. Build Status

- [ ] `npx next build` exits with code 0?
- [ ] Build status recorded in `changelog.md`?

---

*This checklist is consumed by the `/memory-sync` workflow.*
