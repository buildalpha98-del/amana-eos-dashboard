-- Invoicing schedule on ParentAccount. Additive + IF NOT EXISTS so a
-- re-run against an already-migrated database is a no-op.
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "billingStartDate" DATE;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "billingPeriodStart" DATE;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "nextBillingDate" DATE;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "billingWeeks" INTEGER;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "autoInvoice" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "pauseDebiting" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "billingReminderDate" DATE;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "billingReminderNotes" TEXT;
