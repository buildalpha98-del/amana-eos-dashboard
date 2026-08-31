-- A record that someone chased a family about money. Additive: a new
-- table only, inert until the first contact is logged.
CREATE TABLE IF NOT EXISTS "FamilyDebtContact" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" TEXT NOT NULL,
  "outcome" TEXT,
  "note" TEXT,
  "byId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FamilyDebtContact_pkey" PRIMARY KEY ("id")
);

-- The read is always "latest contact for this family".
CREATE INDEX IF NOT EXISTS "FamilyDebtContact_contactId_contactedAt_idx"
  ON "FamilyDebtContact"("contactId", "contactedAt");

DO $$ BEGIN
  ALTER TABLE "FamilyDebtContact" ADD CONSTRAINT "FamilyDebtContact_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SetNull: a staff member leaving must not erase the record that the
-- family was chased.
DO $$ BEGIN
  ALTER TABLE "FamilyDebtContact" ADD CONSTRAINT "FamilyDebtContact_byId_fkey"
    FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
