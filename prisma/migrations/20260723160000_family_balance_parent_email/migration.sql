-- 2026-07-23: parent email address on family balance contact log,
-- so email-method chases have a recorded address and it's clickable
-- (mailto:) in the table. Nullable — historical rows have no value.

ALTER TABLE "FamilyBalanceContact"
  ADD COLUMN IF NOT EXISTS "parentEmail" TEXT;
