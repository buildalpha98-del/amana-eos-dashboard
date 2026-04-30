# Verification Bundle — 2026-04-22

Post-merge QA bundle for PRs #21–#25 (Services rebuild 4a/4b, Contracts + Recruitment 6, Report Issue inbox 8a).

## What's in this folder

- `README.md` — this file.
- `manual-smoke-checklist.md` — paste-ready checklist (~55 checks across 8 modules) to walk through on a deployed preview or local dev server after running the seed.
- `../../../prisma/seeds/verification-seed.ts` — reusable Prisma seed that builds realistic test data (3 services, 15 users, 40 children, 30 days of attendance, 50 bookings, 12 contracts, 4 vacancies, 10 candidates, 3 referrals, 5 feedback, 2 AI drafts, onboarding packs).

## Running the seed

The seed refuses to run against a production database (hard guard on Neon / Railway / prod hostnames). Always point `DATABASE_URL` at a local or test database.

```bash
# Basic run (idempotent — can run twice without duplicates)
DATABASE_URL=postgresql://localhost:5432/amana_test \
  npx tsx prisma/seeds/verification-seed.ts

# Reset the tables this seed owns before reseeding
DATABASE_URL=postgresql://localhost:5432/amana_test \
  npx tsx prisma/seeds/verification-seed.ts --reset

# Before running, regenerate the Prisma client so recent schema fields
# (e.g. Child.room, Child.ccsStatus, Child.tags) are in the typed client:
DATABASE_URL=postgresql://localhost:5432/amana_test npx prisma generate
```

All seeded accounts use the password `TestPass2026!`. Log in with any of:

- `jayden@amanaoshc.com.au` (owner)
- `daniel@amanaoshc.com.au` (head_office)
- `tracie@amanaoshc.com.au`, `mirna@amanaoshc.com.au` (admin)
- `akram@amanaoshc.com.au` (marketing)
- `coord.riv@`, `coord.mpk@`, `coord.sch@amanaoshc.com.au` (coordinators)
- `member.riv@`, `member.mpk@`, `member.sch@amanaoshc.com.au` (members)
- `staff.amira@`, `staff.bilal@`, `staff.hana@`, `staff.omar@amanaoshc.com.au` (staff)

## Where manual-smoke walkthrough lives

`manual-smoke-checklist.md` — walk this end-to-end against the preview deploy or `npm run dev`.

## Where E2E + issue audit results go

When running Playwright E2E or producing an audit report from this verification pass, drop the artifacts alongside this file:

- `e2e-results/` — Playwright HTML report or `.json` output.
- `issue-audit.md` — written summary of regressions found (link GH issues / feedback IDs).

## Note

These files were generated on 2026-04-22 after PRs #21–#25 merged; re-run or regenerate before major roadmaps so the seed and checklist stay aligned with the schema and surfaces that exist on `main`.
