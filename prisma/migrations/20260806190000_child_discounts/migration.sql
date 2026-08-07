-- A discount can be for one child rather than the whole family: a staff
-- member's own child gets the staff rate, their siblings might not.
-- Nullable, so every existing discount stays family-wide.
ALTER TABLE "FamilyDiscount" ADD COLUMN IF NOT EXISTS "childId" TEXT;

CREATE INDEX IF NOT EXISTS "FamilyDiscount_childId_idx"
  ON "FamilyDiscount"("childId");

DO $$ BEGIN
  ALTER TABLE "FamilyDiscount" ADD CONSTRAINT "FamilyDiscount_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
