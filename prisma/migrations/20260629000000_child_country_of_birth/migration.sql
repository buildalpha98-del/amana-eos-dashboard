-- 2026-06-29: enrolment form now collects the child's country of birth
-- (Australia / New Zealand / Other free-text). Stored on the Child
-- record so the dashboard can surface it on the services Children tab
-- without re-reading the EnrolmentSubmission JSON.
--
-- Nullable so existing children pre-migration don't need a backfill;
-- the field is required only on new enrolment submissions (enforced
-- in the form's validateStep + the Zod schema in /api/enrol).

ALTER TABLE "Child"
  ADD COLUMN IF NOT EXISTS "countryOfBirth" TEXT;
