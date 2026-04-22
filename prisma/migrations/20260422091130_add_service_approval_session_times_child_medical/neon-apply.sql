-- Run this in the Neon SQL editor. Replace <MIGRATION_FOLDER_NAME> with the actual folder.
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "serviceApprovalNumber" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "providerApprovalNumber" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "sessionTimes" JSONB;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "casualBookingSettings" JSONB;

ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "medicareNumber" TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "medicareExpiry" TIMESTAMP(3);
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "medicareRef" TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "vaccinationStatus" TEXT;

INSERT INTO "_prisma_migrations"
  (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, 'manual', '20260422091130_add_service_approval_session_times_child_medical', now(), now(), 1)
ON CONFLICT DO NOTHING;
