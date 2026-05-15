-- 2026-05-16: Extend the existing OrgSettings singleton with admin-editable
-- runtime config (Brevo sender, federal default ratio, Health Score pillar
-- weights + thresholds) and audit columns. Additive only — empty `config`
-- + null `updatedById` reproduces pre-refactor behaviour.

ALTER TABLE "OrgSettings"
  ADD COLUMN IF NOT EXISTS "config"      JSONB,
  ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrgSettings_updatedById_fkey'
  ) THEN
    ALTER TABLE "OrgSettings"
      ADD CONSTRAINT "OrgSettings_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
