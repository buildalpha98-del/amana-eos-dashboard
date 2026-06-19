-- 2026-06-19: Foundation for document-mode audits. Templates that
-- carry a source DOCX URL instead of (or alongside) structured items;
-- coordinators complete an instance by editing the doc inline and
-- the saved-edited version is stored per-instance.
--
-- Purely additive: nullable columns + default boolean. Existing
-- structured templates are unaffected (documentMode = false).

ALTER TABLE "AuditTemplate" ADD COLUMN IF NOT EXISTS "sourceFileUrl" TEXT;
ALTER TABLE "AuditTemplate" ADD COLUMN IF NOT EXISTS "documentMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AuditInstance" ADD COLUMN IF NOT EXISTS "completedFileUrl" TEXT;
