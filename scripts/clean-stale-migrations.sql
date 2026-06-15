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
