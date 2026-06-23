-- 2026-06-23: structure the 3-Year Picture section to match the EOS
-- canonical layout (Future Date / Revenue / Profit / Measurables /
-- What Does It Look Like?). The old `threeYearPicture` freeform text
-- column stays — rendered read-only as a legacy block under the new
-- card until the owner clears it manually, same pattern as the GTM
-- migration on 2026-06-22.

ALTER TABLE "VisionTractionOrganiser"
  ADD COLUMN IF NOT EXISTS "threeYearFutureDate"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "threeYearRevenue"     TEXT,
  ADD COLUMN IF NOT EXISTS "threeYearProfit"      TEXT,
  ADD COLUMN IF NOT EXISTS "threeYearMeasurables" TEXT,
  ADD COLUMN IF NOT EXISTS "threeYearLooksLike"   TEXT;
