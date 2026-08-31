-- Standing discounts on what a family pays. Additive: no row means no
-- discount, which is today's behaviour for everyone.
CREATE TABLE IF NOT EXISTS "FamilyDiscount" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "sessionType" "SessionType",
  "kind" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyDiscount_pkey" PRIMARY KEY ("id")
);

-- The read is always "this family's discounts around this date".
CREATE INDEX IF NOT EXISTS "FamilyDiscount_contactId_startDate_idx"
  ON "FamilyDiscount"("contactId", "startDate");
CREATE INDEX IF NOT EXISTS "FamilyDiscount_serviceId_idx"
  ON "FamilyDiscount"("serviceId");

DO $$ BEGIN
  ALTER TABLE "FamilyDiscount" ADD CONSTRAINT "FamilyDiscount_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FamilyDiscount" ADD CONSTRAINT "FamilyDiscount_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SetNull: a coordinator leaving must not erase the record of who
-- granted a discount.
DO $$ BEGIN
  ALTER TABLE "FamilyDiscount" ADD CONSTRAINT "FamilyDiscount_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
