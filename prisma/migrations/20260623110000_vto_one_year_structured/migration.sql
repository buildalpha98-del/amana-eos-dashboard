-- 2026-06-23: structure the 1-Year Plan section to match the EOS
-- canonical layout (Future Date / Revenue / Profit / Measurables) +
-- a SMART checkbox per Goal so the leader can mark which goals meet
-- the S.M.A.R.T. criteria.

ALTER TABLE "VisionTractionOrganiser"
  ADD COLUMN IF NOT EXISTS "oneYearFutureDate"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "oneYearRevenue"     TEXT,
  ADD COLUMN IF NOT EXISTS "oneYearProfit"      TEXT,
  ADD COLUMN IF NOT EXISTS "oneYearMeasurables" TEXT;

ALTER TABLE "OneYearGoal"
  ADD COLUMN IF NOT EXISTS "smart" BOOLEAN NOT NULL DEFAULT false;
