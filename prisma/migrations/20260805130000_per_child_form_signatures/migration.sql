-- Per-child signing (CWA / medical-consent shape). Both tables shipped
-- earlier today and are effectively empty, so reshaping the uniqueness
-- is safe. Partial indexes because a plain composite unique treats NULL
-- childIds as distinct and would allow double family-level signatures.
ALTER TABLE "ParentForm" ADD COLUMN IF NOT EXISTS "perChild" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ParentFormSignature" ADD COLUMN IF NOT EXISTS "childId" TEXT;

DROP INDEX IF EXISTS "ParentFormSignature_formId_parentEmail_key";
CREATE UNIQUE INDEX IF NOT EXISTS "pfs_family_level_unique"
  ON "ParentFormSignature"("formId", "parentEmail") WHERE "childId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "pfs_per_child_unique"
  ON "ParentFormSignature"("formId", "parentEmail", "childId") WHERE "childId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ParentFormSignature_formId_parentEmail_idx"
  ON "ParentFormSignature"("formId", "parentEmail");

DO $$ BEGIN
  ALTER TABLE "ParentFormSignature" ADD CONSTRAINT "ParentFormSignature_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
