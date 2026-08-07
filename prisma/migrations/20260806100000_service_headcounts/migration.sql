-- Headcounts and evacuation drills. Additive: a new table only, inert
-- until the first count is recorded.
CREATE TABLE IF NOT EXISTS "ServiceHeadcount" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'head_count',
  "conductedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sessionType" "SessionType",
  "excursionId" TEXT,
  "childrenCount" INTEGER NOT NULL,
  "staffCount" INTEGER NOT NULL DEFAULT 0,
  "visitorsCount" INTEGER NOT NULL DEFAULT 0,
  "childIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "evacuationSeconds" INTEGER,
  "issuesIdentified" TEXT,
  "notes" TEXT,
  "conductedById" TEXT,
  "signedOffAt" TIMESTAMP(3),
  "signedOffById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceHeadcount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ServiceHeadcount_serviceId_conductedAt_idx"
  ON "ServiceHeadcount"("serviceId", "conductedAt");
CREATE INDEX IF NOT EXISTS "ServiceHeadcount_serviceId_kind_idx"
  ON "ServiceHeadcount"("serviceId", "kind");
CREATE INDEX IF NOT EXISTS "ServiceHeadcount_excursionId_idx"
  ON "ServiceHeadcount"("excursionId");

DO $$ BEGIN
  ALTER TABLE "ServiceHeadcount" ADD CONSTRAINT "ServiceHeadcount_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SetNull everywhere else: removing an excursion or deactivating a user
-- must never delete the evidence that a count happened.
DO $$ BEGIN
  ALTER TABLE "ServiceHeadcount" ADD CONSTRAINT "ServiceHeadcount_excursionId_fkey"
    FOREIGN KEY ("excursionId") REFERENCES "ServiceExcursion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ServiceHeadcount" ADD CONSTRAINT "ServiceHeadcount_conductedById_fkey"
    FOREIGN KEY ("conductedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ServiceHeadcount" ADD CONSTRAINT "ServiceHeadcount_signedOffById_fkey"
    FOREIGN KEY ("signedOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
