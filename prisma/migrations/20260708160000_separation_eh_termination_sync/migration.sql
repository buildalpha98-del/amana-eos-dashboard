-- 2026-07-08: Employment Hero termination sync on SeparationRecord.
--
-- When a Separation is created / updated with a lastWorkingDay and
-- the user has an employmentHeroEmployeeId, the API pushes the
-- termination to EH so payroll doesn't keep the person active.
-- These two columns let the UI show sync status + a retry button.
--
-- Additive nullable columns, safe on populated tables.

ALTER TABLE "SeparationRecord"
  ADD COLUMN IF NOT EXISTS "ehTerminationSyncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ehTerminationError"    TEXT;
