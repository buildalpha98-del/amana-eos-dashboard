-- Phase 2 schema additions (commit 7b):
--   * Service.ratioSettings Json column
--   * AiTaskDraft.source String (default "todo") + AiTaskDraft.targetId String?
--   * ParentPostType enum += "newsletter"
--   * clientMutationId String? @unique on StaffReflection + LearningObservation

-- Service.ratioSettings
ALTER TABLE "Service" ADD COLUMN "ratioSettings" JSONB;

-- AiTaskDraft new columns (default "todo" for source so existing rows stay consistent)
ALTER TABLE "AiTaskDraft" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'todo';
ALTER TABLE "AiTaskDraft" ADD COLUMN "targetId" TEXT;

-- ParentPostType += newsletter
ALTER TYPE "ParentPostType" ADD VALUE 'newsletter';

-- clientMutationId on StaffReflection
ALTER TABLE "StaffReflection" ADD COLUMN "clientMutationId" TEXT;
CREATE UNIQUE INDEX "StaffReflection_clientMutationId_key" ON "StaffReflection"("clientMutationId");

-- clientMutationId on LearningObservation
ALTER TABLE "LearningObservation" ADD COLUMN "clientMutationId" TEXT;
CREATE UNIQUE INDEX "LearningObservation_clientMutationId_key" ON "LearningObservation"("clientMutationId");
