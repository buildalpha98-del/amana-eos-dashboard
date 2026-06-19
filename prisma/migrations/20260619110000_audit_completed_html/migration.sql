-- 2026-06-19: per-instance completed HTML for document-mode audits.
-- Stores the edited HTML directly so we can render it back without
-- a round-trip through Vercel Blob. completedFileUrl stays as an
-- optional pointer to a downloadable DOCX export (added later).
ALTER TABLE "AuditInstance" ADD COLUMN IF NOT EXISTS "completedHtml" TEXT;
