-- Per-day casual capacity overrides. A row exists only when a day
-- differs from the room's standing configuration, so most days have
-- none. Additive: no row means today's behaviour, unchanged.
CREATE TABLE IF NOT EXISTS "CasualDayConfig" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "sessionType" "SessionType" NOT NULL,
  "spots" INTEGER,
  "closed" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasualDayConfig_pkey" PRIMARY KEY ("id")
);

-- One config per room per day; the bulk writer upserts against this.
CREATE UNIQUE INDEX IF NOT EXISTS "CasualDayConfig_serviceId_date_sessionType_key"
  ON "CasualDayConfig"("serviceId", "date", "sessionType");
CREATE INDEX IF NOT EXISTS "CasualDayConfig_serviceId_date_idx"
  ON "CasualDayConfig"("serviceId", "date");

DO $$ BEGIN
  ALTER TABLE "CasualDayConfig" ADD CONSTRAINT "CasualDayConfig_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CasualDayConfig" ADD CONSTRAINT "CasualDayConfig_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
