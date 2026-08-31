-- Family identity + billing arrangement on ParentAccount.
--
-- Purely additive and IF NOT EXISTS, so re-running against a database that
-- already has these columns is a no-op rather than a failed deploy.
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "familyName" TEXT;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "billingFrequency" TEXT;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "billingAnchorDay" INTEGER;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "billingLimitCents" INTEGER;
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "billingNotes" TEXT;

-- Backfill the family name from the surname we captured at sign-up, so
-- existing families aren't blank in the list on day one. Enrolment submit
-- overwrites this with the primary carer's surname, which is the more
-- reliable source.
UPDATE "ParentAccount"
   SET "familyName" = "surname"
 WHERE "familyName" IS NULL
   AND "surname" IS NOT NULL
   AND btrim("surname") <> '';
