-- Key policies: read a short version + sign before your first shift
-- (2026-10-08). Code of Conduct and Privacy by default — flag any existing
-- document with those titles (same normalisation as the app: lowercase,
-- letters and digits only), and make sure they ask for a signature.
ALTER TABLE "PolicyDocument" ADD COLUMN "keyPolicy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PolicyDocument" ADD COLUMN "summary" TEXT;

UPDATE "PolicyDocument"
SET "keyPolicy" = true, "requiresAcknowledgement" = true
WHERE regexp_replace(lower("title"), '[^a-z0-9]', '', 'g') IN (
  'codeofconductpolicy', 'childsafecodeofconduct',
  'privacyandconfidentialitypolicy', 'privacypolicy'
);
