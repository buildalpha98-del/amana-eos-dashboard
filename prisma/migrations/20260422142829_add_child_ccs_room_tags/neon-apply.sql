-- Run this in the Neon SQL editor. Replace <MIGRATION_FOLDER_NAME> with the generated folder name.
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "ccsStatus" TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "room"      TEXT;
ALTER TABLE "Child" ADD COLUMN IF NOT EXISTS "tags"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "Child_serviceId_ccsStatus_idx" ON "Child"("serviceId", "ccsStatus");
CREATE INDEX IF NOT EXISTS "Child_serviceId_room_idx"      ON "Child"("serviceId", "room");

-- Tell Prisma this migration is applied (use the exact folder name under prisma/migrations/)
INSERT INTO "_prisma_migrations"
  (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, 'manual', '20260422142829_add_child_ccs_room_tags', now(), now(), 1)
ON CONFLICT DO NOTHING;
