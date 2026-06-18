-- One-time cleanup: an earlier attempt at 20260615120000_attendance_tz_shift
-- used `INTERVAL` arithmetic on a @db.Date column and failed. Prisma
-- recorded the failure in _prisma_migrations, which blocks every
-- subsequent `migrate deploy` (drift / rolled-back state).
--
-- DELETE the stale bookkeeping row so deploys can move forward.
-- Idempotent — once the row is gone, subsequent runs DELETE 0 rows
-- and exit cleanly. Safe to leave in the build pipeline.

DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260615120000_attendance_tz_shift';

DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260615130000_attendance_tz_shift_v2';

-- 2026-06-15: clear stale monthlyPurchaseBudget overrides so every
-- centre falls back to the attendance-based tier rule (100+ weekly
-- bookings → $300; otherwise $150). AIA Coburg was locked at $300
-- despite 43 weekly attendances because an old override was still in
-- place. The override mechanism has been removed from the codebase,
-- so this DELETE-equivalent UPDATE is one-off recovery — idempotent
-- (matches 0 rows on subsequent runs).
UPDATE "Service" SET "monthlyPurchaseBudget" = NULL
WHERE "monthlyPurchaseBudget" IS NOT NULL;

-- 2026-06-17: backfill Document.category for files uploaded before
-- the auto-categorisation rule was added. Idempotent — only touches
-- rows currently sitting in "other" so re-runs match 0.
UPDATE "Document" SET category = 'policy'
WHERE category = 'other'
  AND (LOWER(title) ~ '\mpolicy\M' OR LOWER(title) ~ '\mpolicies\M'
    OR LOWER("fileName") ~ '\mpolicy\M' OR LOWER("fileName") ~ '\mpolicies\M');

UPDATE "Document" SET category = 'procedure'
WHERE category = 'other'
  AND (LOWER(title) ~ '\mprocedure\M' OR LOWER(title) ~ '\mprocedures\M'
    OR LOWER("fileName") ~ '\mprocedure\M' OR LOWER("fileName") ~ '\mprocedures\M');

UPDATE "Document" SET category = 'guide'
WHERE category = 'other'
  AND (LOWER(title) ~ '\mguide\M' OR LOWER(title) ~ '\mhandbook\M' OR LOWER(title) ~ '\mmanual\M'
    OR LOWER("fileName") ~ '\mguide\M' OR LOWER("fileName") ~ '\mhandbook\M' OR LOWER("fileName") ~ '\mmanual\M');
