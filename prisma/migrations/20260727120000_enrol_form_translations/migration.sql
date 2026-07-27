-- 2026-07-27: DB-backed translations for the public parent enrolment form.
-- English is the source of truth (src/lib/enrol-i18n.ts); rows here override
-- for other locales. Missing rows fall back to the English default.
CREATE TABLE IF NOT EXISTS "EnrolFormTranslation" (
  "id"        TEXT PRIMARY KEY,
  "key"       TEXT NOT NULL,
  "locale"    TEXT NOT NULL,
  "text"      TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "EnrolFormTranslation_key_locale_key"
  ON "EnrolFormTranslation" ("key", "locale");
CREATE INDEX IF NOT EXISTS "EnrolFormTranslation_locale_idx"
  ON "EnrolFormTranslation" ("locale");
