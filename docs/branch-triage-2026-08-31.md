# Remote branch triage — pre-#214 seed hazard (2026-08-31)

## Why

PR #214 (merged 2026-08-07, commit `35e74242`) made the staff upsert in
`prisma/seed.ts` create-only. Every remote branch created before it still
carries `update: { role, state }` — and because the seed runs on every Vercel
deploy, including branch previews that share the prod DB, a preview deploy
from any of those branches demotes real users (Tracie/Mirna
head_office → member; happened three times, last restored 2026-08-31).

All 198 remote branches were classified on full (unshallowed) history:
does the branch contain the #214 fix, is it fully merged into main, and does
its own `prisma/seed.ts` carry the dangerous upsert as live code.

## Result

| Class | Count | Action |
|---|---|---|
| Merged into main, dangerous seed | 165 | Delete — `scripts/cleanup-pre-214-branches.sh` |
| Merged into main, safe seed (post-#214) | 24 | Harmless; optional hygiene deletion |
| Unmerged, still wanted, dangerous seed | 3 | **Done: main merged in** (now safe) |
| Unmerged, superseded by main | 5 | Jayden to confirm, then delete (below) |
| Unmerged, real work, already safe | 1 | `claude/amana-dashboard-audit-3s8wvo` (PR #254) — main merged in |

## Already done in this session

Main was merged into these branches, so their previews now run the
create-only seed:

- `feat/daily-reflections-qip-engine` (PR #166) — 19 unmerged commits, the
  element-level SAT/QIP engine; not on main. One conflict in
  `ServiceQIPTab.tsx` resolved in favour of the branch's `SatDocument`
  rewrite; main's parallel tweaks to the old inline UI (~110 lines) should be
  re-checked at PR review.
- `feat/centre-avatar-pdf-export` — centre-avatar PDF export
  (`src/lib/centre-avatar-pdf.ts` + route), not on main. Clean merge.
- `monthly-rescan/muslim-schools-2026-08-01` (PR #205) — adds 5 schools to
  `scripts/import-muslim-schools.ts`, not on main. Clean merge.
- `claude/amana-dashboard-audit-3s8wvo` (PR #254) — booking-grid fix +
  parent-enrolment submit test; seed was already safe, merged main to keep it
  current. Clean merge.

## Needs Jayden's call — superseded branches (unmerged by ancestry, but content is in main)

Deleting these loses nothing we could find, but they are technically
unmerged, so they were not touched. Their seeds are still dangerous until
deleted — do not push to or redeploy them.

- `ops/db-backups-and-guards` (PR #183): every file it touches
  (`db-backup.yml`, `assert-not-prod.mjs`, `reset.ts`, `upload-backup.mjs`)
  is byte-identical on main — the work landed via `feature/induction-training-lms`'s
  history or equivalent commits. Close PR #183 and delete.
- `feature/induction-training-lms`: the LMS shipped to main; its residual
  diffs (`middleware.ts`, `role-permissions.ts`, `MyTrainingContent.tsx`,
  `package.json`) are main having moved on, not unshipped work (`/learn`
  locked-path access and the seed-modules guard are both on main). Delete.
- `feature/lms-authoring-ui`: authoring UI, training-compliance engine,
  transcript/certificate PDFs all on main (`training-compliance.ts` differs
  only by main's newer `siteUrl()` refactor). Delete.
- `claude/nav-curated-core`: zero unique patch commits (tip is a stale merge
  commit); the curated sidebar shipped 2026-07-12. Delete.
- `claude/rooms-migration-stage-0`: its single commit is patch-equivalent
  (`git cherry`) to a commit on main; seed already safe. Delete.

Delete with: `git push origin --delete <branch>` (or the GitHub branches UI).

## The 24 safe merged branches

Post-#214 feature branches (marketing-hub phases 5–7, discounts family,
eos-meetings, e2e fixes, etc.) — fully merged, seed already create-only.
No hazard; delete whenever convenient.
