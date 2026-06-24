-- 2026-06-24: doc-mode audit overhaul.
--
-- AuditTemplate.sourceHtml — caches the mammoth-converted HTML of
-- the uploaded .docx so the admin can preview + edit the master
-- template inline without re-converting on every load. Lazy-
-- populated on first preview when sourceFileUrl is set but
-- sourceHtml is null.
--
-- AuditInstance.aiFlags + aiSummary — populated when an audit is
-- completed (PATCH .../document with complete:true). aiFlags is a
-- JSON array of {title, severity, snippet} extracted from the
-- staff's filled-in completedHtml; aiSummary is a short narrative
-- of what the auditor flagged.

ALTER TABLE "AuditTemplate"
  ADD COLUMN IF NOT EXISTS "sourceHtml" TEXT;

ALTER TABLE "AuditInstance"
  ADD COLUMN IF NOT EXISTS "aiFlags"     JSONB,
  ADD COLUMN IF NOT EXISTS "aiSummary"   TEXT,
  ADD COLUMN IF NOT EXISTS "aiScannedAt" TIMESTAMP(3);
