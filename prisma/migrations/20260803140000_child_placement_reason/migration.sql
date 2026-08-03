-- Why a child sits at a given service. A child attending two centres has
-- two Child rows; without this the second reads as a duplicate rather
-- than, say, a Holiday Quest placement.
-- Additive and idempotent: NULL means ordinary term care.
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "placementReason" TEXT;
