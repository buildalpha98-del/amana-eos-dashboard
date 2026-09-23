# SAT Element-Level Restructure — Addendum to the Daily Reflections → SAT/QIP spec

**Date:** 2026-07-07 · **Trigger:** Jayden supplied the real NSW "Service Self-Assessment Form" export (ASR-00051099, 62pp). Our per-QA model was too shallow — the official form works at NQS **element** level.

## Decisions (with Jayden)
1. **Full form in v1**: philosophy + per-QA Law & Regs checklist + per-element evidence + Met/Not Met + Continuous Improvement Opportunities table.
2. **Element-level for everyone**: NSW (SAT) and VIC (QIP) share the structure — the NQS is national. Existing per-QA text is surfaced read-only as "Legacy notes" for manual migration; no automated content migration.

## The official structure (from the PDF)
- **Service philosophy** — one document-level text block.
- Per **Quality Area** (7):
  - **Law and Regulations** table: rows of (law/reg ref e.g. "R.73"/"S.168", NQS standard ref, question text, Assessment: Compliant / Non-compliant / Not Applicable) + one **Comments** box per QA.
  - Per **Standard** (15 total, e.g. 1.1 "The educational program enhances each child's learning and development."):
    - Per **Element** (40 total, e.g. 1.1.1): fixed **Concept** label ("Approved learning framework"), fixed element description, **exactly 5 evidence text boxes** ("Evidence and Key practices"), one **Assessment** (Met / Not Met).
  - **Continuous Improvement Opportunities** table: rows of (Standard/Element ref, Issues identified, Outcome/goal, Priority L/M/H, Steps, Success Measure, By when, Date created, Progress notes, Status).

## Schema
- `QualityImprovementPlan` += `servicePhilosophy String? @db.Text`, `legalComments Json?` (qa → comment).
- NEW `SatElementAssessment`: `qipId`, `elementCode` ("1.1.1"), `evidence String[]` (≤5 slots), `assessment String @default("not_assessed")` (met | not_met | not_assessed), `@@unique([qipId, elementCode])`.
- NEW `SatLegalCheck`: `qipId`, `checkKey` (taxonomy key), `assessment String @default("not_assessed")` (compliant | non_compliant | not_applicable | not_assessed), `@@unique([qipId, checkKey])`.
- NEW `SatImprovement`: `qipId`, `elementCode` (element or standard ref), `issue`, `outcomeGoal`, `priority` (low|medium|high), `steps`, `successMeasure`, `byWhen String?`, `progressNotes String?`, `status` (not_started|in_progress|completed), timestamps.
- `QipSuggestion` += `elementCode String?`. New suggestions target elements (field stays for legacy rows; new rows use field="evidence").
- `QIPQualityArea` kept (legacy read-only surface + VIC history); no new writes from the UI.

## Taxonomy (`src/lib/nqs-taxonomy.ts`)
Static constants — 7 QAs, 15 standards (code+title), 40 elements (code, standardCode, qa, concept, description) per ACECQA NQS (2018), verified against the PDF. Legal-check questions parsed from the NSW form (per QA: checkKey, lawRef, nqsRef, question). Element rows for a QIP are seeded on QIP create and lazily backfilled for existing QIPs (upsert on write; GET merges taxonomy with stored rows so missing rows render empty).

## API
- `GET /api/qip?serviceId=` now includes `elements`, `legalChecks`, `improvements` (merged with taxonomy server-side — client gets all 40 elements, empty or not).
- `PATCH /api/qip/[id]/elements/[elementCode]` `{ evidence?: string[] (≤5), assessment? }` — strict Zod, member+.
- `PATCH /api/qip/[id]/legal/[checkKey]` `{ assessment }`; QA comments + philosophy via extended `PATCH /api/qip/[id]` `{ servicePhilosophy?, legalComments? }`.
- `POST/PATCH/DELETE /api/qip/[id]/improvements[/[improvementId]]` — full CRUD, strict Zod.
- Suggestions: PATCH accept for `field="evidence"` writes `proposedText` into the element's **first empty evidence slot** (409 "element evidence is full" if all 5 taken; director frees a slot or uses Edit & accept after trimming).

## Friday cron rework
Per service, per **QA with new evidence** (still ≤7 Sonnet calls): prompt now includes that QA's element list (codes + concepts + descriptions), each element's current evidence + slot count, and the week's tagged content. The model returns element-targeted proposals `{"changes":[{"elementCode":"1.1.1","proposedText":"...","rationale":"..."}]}` — only for elements with a free slot, never inventing evidence. Suggestions store `elementCode`, `field: "evidence"`.

## UI (ServiceQIPTab rebuild)
- Philosophy card (inline edit).
- Per-QA accordion → Law & Regs checklist (assessment select per row + QA comments box) → per-standard groups → element cards: concept badge, description, 5 evidence textareas (edit-in-place), Met/Not Met toggle.
- "Legacy notes" collapsible per QA showing old QIPQualityArea text (read-only).
- Improvements section: table CRUD matching the form's columns.
- Suggestions panel groups by element; banner unchanged.
- **Copy for portal**: mirrors the form order — philosophy → per QA (law/regs + comments → standards → elements with their 5 evidence entries + Met/Not Met → improvement rows).

## Out of scope
- Auto-migrating old per-QA narrative into element slots (manual via Legacy notes).
- The AI proposing Met/Not Met or law-compliance answers (director-only judgements).
