-- Scheduled fee changes, and the history of applied ones.
-- Additive: a new table only. Fees themselves stay in
-- Service.sessionTimes; this records intent and history.
CREATE TABLE IF NOT EXISTS "ServiceFeeChange" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "sessionType" "SessionType" NOT NULL,
  "feeTierId" TEXT NOT NULL,
  "feeName" TEXT NOT NULL,
  "fromAmountCents" INTEGER,
  "toAmountCents" INTEGER NOT NULL,
  "fromCasualCents" INTEGER,
  "toCasualCents" INTEGER,
  "fromStaffCents" INTEGER,
  "toStaffCents" INTEGER,
  "effectiveDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "appliedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "ServiceFeeChange_pkey" PRIMARY KEY ("id")
);

-- The cron's query: due, still scheduled, for a service.
CREATE INDEX IF NOT EXISTS "ServiceFeeChange_serviceId_status_effectiveDate_idx"
  ON "ServiceFeeChange"("serviceId", "status", "effectiveDate");
CREATE INDEX IF NOT EXISTS "ServiceFeeChange_serviceId_sessionType_idx"
  ON "ServiceFeeChange"("serviceId", "sessionType");

DO $$ BEGIN
  ALTER TABLE "ServiceFeeChange" ADD CONSTRAINT "ServiceFeeChange_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SetNull: a departing coordinator must not erase the record of a fee
-- rise they made.
DO $$ BEGIN
  ALTER TABLE "ServiceFeeChange" ADD CONSTRAINT "ServiceFeeChange_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
