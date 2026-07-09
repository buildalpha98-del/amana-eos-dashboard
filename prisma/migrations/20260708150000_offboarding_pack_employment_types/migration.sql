-- 2026-07-08: employment-type-aware offboarding packs.
--
-- Casual staff and permanent (FT/PT) staff need very different
-- offboarding processes under MA000120 + NES — casuals have no
-- notice period and no annual-leave payout, permanents have both
-- plus statement-of-service, letters, and regulatory obligations.
--
-- Adding this array lets each pack declare which employment
-- types it covers. Assign endpoint auto-picks the matching pack.
-- Additive column, safe on populated tables (default = empty array).

ALTER TABLE "OffboardingPack"
  ADD COLUMN IF NOT EXISTS "applicableEmploymentTypes" "EmploymentType"[] DEFAULT ARRAY[]::"EmploymentType"[];
