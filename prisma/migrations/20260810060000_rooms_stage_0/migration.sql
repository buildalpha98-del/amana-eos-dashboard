-- Stage 0 of making rooms first-class records (docs/rooms-migration-plan.md).
--
-- Rooms are seven fixed slots in the `SessionType` enum with their
-- definitions living as JSON on `Service.sessionTimes`. A centre cannot
-- add an eighth without a schema change.
--
-- This table is a SHADOW and nothing reads it. It is populated from that
-- JSON and kept in step with it, so the backfill can be run and checked
-- against the source while the app carries on reading the JSON exactly
-- as before. Dropping this table today would change no behaviour — which
-- is the whole point of doing it as a separate stage.
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    -- The enum slot this room came from. Kept forever: it is how every
    -- later dual-write reconciles, and once the enum columns are dropped
    -- it is the only record of what a historical row meant.
    "legacyKey" "SessionType",
    -- Wall-clock times of day, "HH:MM". Not timestamps — these have no
    -- date, and storing them as one invites a timezone to be applied to
    -- something that doesn't have one.
    "startTime" TEXT,
    "endTime" TEXT,
    "capacity" INTEGER,
    "ratio" TEXT,
    "description" TEXT,
    "minAgeYears" INTEGER,
    "maxAgeYears" INTEGER,
    "photoUrl" TEXT,
    "staffOnly" BOOLEAN NOT NULL DEFAULT false,
    -- Retired, not deleted. A room with historical attendance can never
    -- be removed without orphaning it.
    "archivedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- One room per enum slot per service. This is what makes the backfill
-- idempotent and the future resolver unambiguous.
--
-- Postgres treats NULLs as distinct in a unique index, so rooms created
-- after the enum is retired — which carry no legacy key — are exempt.
-- That exemption is what lets a centre have an unlimited number of rooms
-- later without this constraint being in the way.
CREATE UNIQUE INDEX "Room_serviceId_legacyKey_key" ON "Room"("serviceId", "legacyKey");

-- "The rooms at this centre, excluding retired ones" is every read this
-- table will ever serve.
CREATE INDEX "Room_serviceId_archivedAt_idx" ON "Room"("serviceId", "archivedAt");

ALTER TABLE "Room" ADD CONSTRAINT "Room_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
