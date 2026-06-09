-- Make ComplianceCertificate.serviceId nullable (2026-06-05)
--
-- Personal certs (WWCC, First Aid, Child Safe Code of Conduct,
-- mandatory_reporter_training, etc.) belong to the individual staff
-- member — they aren't tied to a specific centre. Pre-2026-06 the
-- column was NOT NULL and the upload UI forced session.user.serviceId,
-- which 400'd "Service ID is required" for any staff member without a
-- service assigned (e.g. casuals during trial, recently-onboarded
-- staff, marketing/admin tier).
--
-- userId remains the canonical identity for personal certs. Service-
-- level certs (rare — building safety, etc.) keep their serviceId set.
-- No data is being migrated — existing rows all have a serviceId, the
-- column just becomes optional going forward.

ALTER TABLE "ComplianceCertificate"
  ALTER COLUMN "serviceId" DROP NOT NULL;

-- Existing FK behaviour stays (ON DELETE CASCADE when the service
-- exists; the row just survives the cascade differently now that
-- serviceId can be null). The FK itself is unchanged — Prisma
-- generates the same constraint with a nullable column.
