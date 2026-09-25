-- RosterShift dedup key moves off the denormalised staffName onto userId.
-- Old key: (serviceId, date, staffName, shiftStart) — two open shifts
-- ("Open shift") at the same time collided, and renaming a user desynced
-- the constraint. New key: (serviceId, date, userId, shiftStart); Postgres
-- treats NULL userId as distinct, so multiple open slots at one time are
-- allowed by design while a real user can't be double-booked at a start.

-- Defensive dedupe: keep the newest row per (serviceId, date, userId,
-- shiftStart) group for assigned shifts, in case legacy renames created
-- same-user duplicates under different staffNames. No-op when clean.
DELETE FROM "RosterShift" a
USING "RosterShift" b
WHERE a."userId" IS NOT NULL
  AND a."serviceId" = b."serviceId"
  AND a.date = b.date
  AND a."userId" = b."userId"
  AND a."shiftStart" = b."shiftStart"
  AND a."syncedAt" < b."syncedAt";

-- DropIndex
DROP INDEX "RosterShift_serviceId_date_staffName_shiftStart_key";

-- CreateIndex
CREATE UNIQUE INDEX "RosterShift_serviceId_date_userId_shiftStart_key" ON "RosterShift"("serviceId", "date", "userId", "shiftStart");
