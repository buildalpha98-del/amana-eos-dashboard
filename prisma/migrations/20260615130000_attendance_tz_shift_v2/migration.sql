-- Recover from the ServiceAttendanceTab.formatDate UTC bug. The grid
-- formatted local-midnight Dates via toISOString().split("T")[0],
-- which for AEST/AEDT users shifted every weekday's stored date one
-- day earlier in UTC.
--
-- A first attempt at this migration (20260615120000_attendance_tz_shift)
-- used `INTERVAL '100 days'` which yields a timestamp incompatible
-- with the `@db.Date` column type — the migration failed and got
-- recorded in `_prisma_migrations` with `rolled_back_at` set, which
-- blocks all subsequent `prisma migrate deploy` runs.
--
-- Clean up that failed bookkeeping row first, then run the actual
-- shift using integer day arithmetic (which keeps the result a
-- date).
--
-- Two-step shift via a 100-day buffer offset avoids unique
-- constraint violations on (serviceId, date, sessionType) — the
-- buffer puts every row safely outside its original range before
-- landing at original+1.

DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260615120000_attendance_tz_shift';

UPDATE "DailyAttendance" SET "date" = "date" + 100;
UPDATE "DailyAttendance" SET "date" = "date" - 99;
