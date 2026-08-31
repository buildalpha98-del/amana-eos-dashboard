-- 2026-07-30: track when staff last reminded a family to finish enrolling,
-- so the Families list can show it and avoid duplicate nudges.
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "enrolmentReminderSentAt" TIMESTAMP(3);
