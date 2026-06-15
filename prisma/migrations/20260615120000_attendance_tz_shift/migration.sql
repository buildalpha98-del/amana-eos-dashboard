-- Recover from the ServiceAttendanceTab.formatDate UTC bug. The grid
-- formatted local-midnight Dates via toISOString().split("T")[0],
-- which for AEST/AEDT users shifted every weekday's stored date one
-- day earlier in UTC (Monday entries landed on the Sunday UTC date,
-- Tuesday on Monday, etc.).
--
-- The forward fix in ServiceAttendanceTab uses local calendar
-- components, so new rows are written at the correct Sydney calendar
-- date. This migration realigns existing rows by shifting every
-- DailyAttendance.date forward by exactly one day.
--
-- Safe to apply uniformly because all DailyAttendance writes prior
-- to this migration came from the buggy grid path. The roll-call
-- routes (which write correctly via Date.UTC) have not been used in
-- production.
--
-- Two-step shift via a 100-day buffer offset is required to avoid
-- mid-update unique constraint violations on
-- (serviceId, date, sessionType): if we shifted +1 directly, rows
-- whose new date collides with another row's current date would
-- fail. Bouncing through +100 days puts every row safely outside
-- the original range first, then -99 lands them at original+1.

-- DailyAttendance.date is a Postgres `date` (not timestamp), so add
-- integer day offsets directly — `date + interval` would yield a
-- timestamp and break the column-type assignment.
UPDATE "DailyAttendance" SET "date" = "date" + 100;
UPDATE "DailyAttendance" SET "date" = "date" - 99;
