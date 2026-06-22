-- 2026-06-22: Replace the single freeform marketingStrategy text with
-- four EOS-canonical "Go to Market Strategy" sub-fields. The old
-- marketingStrategy column stays in place so existing text isn't
-- lost — the UI exposes it read-only as a legacy block under the new
-- card until the owner clears it manually.

ALTER TABLE "VisionTractionOrganiser"
  ADD COLUMN IF NOT EXISTS "gtmTargetMarket"  TEXT,
  ADD COLUMN IF NOT EXISTS "gtmThreeUniques"  TEXT,
  ADD COLUMN IF NOT EXISTS "gtmProvenProcess" TEXT,
  ADD COLUMN IF NOT EXISTS "gtmGuarantee"     TEXT;
