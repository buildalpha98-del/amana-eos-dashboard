-- 2026-05-17: EmailTemplateOverride — per-template subject + body
-- override for the transactional email templates in
-- src/lib/email-templates/. Each template function looks up its key in
-- this table (cached) and uses the override when present; otherwise
-- falls back to the hardcoded copy. Editable from /settings/email-templates.

CREATE TABLE "EmailTemplateOverride" (
  "key"          TEXT         NOT NULL,
  "subject"      TEXT         NOT NULL,
  "body"         TEXT         NOT NULL,
  "updatedById"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailTemplateOverride_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "EmailTemplateOverride"
  ADD CONSTRAINT "EmailTemplateOverride_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
