-- Scorecard entries typed into the grid were stored under the SUNDAY before
-- their week: the grid sends Monday 00:00 Sydney as an ISO instant (still
-- Sunday in UTC) and the entries API truncated it to UTC midnight. Since the
-- 9 Oct 2026 Sydney-date change the grid reads the MONDAY, so every typed
-- value "disappeared" (Daniel, 12 Oct 2026). The API now stores the Sydney
-- Monday; this moves the existing Sunday rows onto their Monday.
--
-- Weeks are Monday-start everywhere for measurables (grid, both crons), so a
-- Sunday weekOf can only be one of these rows.
--
-- If the same measurable already has a Monday row for that week (written by
-- the auto-measurables / marketing-measurables crons), the person's typed
-- value wins: it is what they entered and what the grid showed before
-- 9 Oct. The duplicate Monday row is removed first so the move can't collide
-- with the (measurableId, weekOf) unique key.

DELETE FROM "MeasurableEntry" AS monday
USING "MeasurableEntry" AS sunday
WHERE EXTRACT(DOW FROM sunday."weekOf") = 0
  AND date_trunc('day', sunday."weekOf") = sunday."weekOf"
  AND monday."measurableId" = sunday."measurableId"
  AND monday."weekOf" = sunday."weekOf" + INTERVAL '1 day';

UPDATE "MeasurableEntry"
SET "weekOf" = "weekOf" + INTERVAL '1 day'
WHERE EXTRACT(DOW FROM "weekOf") = 0
  AND date_trunc('day', "weekOf") = "weekOf";
