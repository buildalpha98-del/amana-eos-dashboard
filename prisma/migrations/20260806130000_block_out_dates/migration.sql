-- Dates a room, or the whole centre, isn't running.
-- Additive: a new table only, inert until a date is blocked out.
CREATE TABLE IF NOT EXISTS "ServiceBlockOutDate" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "sessionType" "SessionType",
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceBlockOutDate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ServiceBlockOutDate_serviceId_date_idx"
  ON "ServiceBlockOutDate"("serviceId", "date");

-- Two partial uniques, for the same reason the form signatures needed
-- them: a plain composite unique treats NULL sessionType as distinct,
-- so a centre could accumulate a dozen identical whole-centre closures
-- for the same day and `skipDuplicates` would never catch them.
CREATE UNIQUE INDEX IF NOT EXISTS "sbod_whole_centre_unique"
  ON "ServiceBlockOutDate"("serviceId", "date")
  WHERE "sessionType" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "sbod_per_room_unique"
  ON "ServiceBlockOutDate"("serviceId", "date", "sessionType")
  WHERE "sessionType" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "ServiceBlockOutDate" ADD CONSTRAINT "ServiceBlockOutDate_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ServiceBlockOutDate" ADD CONSTRAINT "ServiceBlockOutDate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
