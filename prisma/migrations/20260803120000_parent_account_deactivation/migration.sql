-- Switch a family's portal access off without deleting them.
-- Deleting loses the enrolment history and billing arrangement; a family
-- who leaves, or who is in dispute, needs access gone but the record kept.
-- Additive and idempotent: NULL means active, so existing rows are unchanged.
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "deactivatedById" TEXT;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "deactivatedReason" TEXT;
