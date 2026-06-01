-- Add new cert types per HR audit (2026-06-01):
--   - `mandatory_reporter_training` — annual refresher for OSHC
--     educators (Children and Young Persons Care & Protection Act).
--   - `child_safe_code_of_conduct` — annual acknowledgement under the
--     National Principles for Child Safe Organisations.
--
-- Postgres enum ALTERs cannot happen inside a transaction by default,
-- so we add both values explicitly. Both ALTERs are idempotent via
-- IF NOT EXISTS so re-running the migration locally is safe.

ALTER TYPE "CertificateType" ADD VALUE IF NOT EXISTS 'mandatory_reporter_training';
ALTER TYPE "CertificateType" ADD VALUE IF NOT EXISTS 'child_safe_code_of_conduct';
