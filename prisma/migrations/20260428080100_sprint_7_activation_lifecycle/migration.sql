-- ============================================================
-- Sprint 7+8 — Activation lifecycle + Content Team (DDL)
-- (Enum additions for ContentTeamRole/Status live in the sibling
--  20260428080000 migration since ALTER TYPE can't be batched.)
-- ============================================================

-- CreateEnum ActivationType
CREATE TYPE "ActivationType" AS ENUM (
  'free_breakfast',
  'parent_info_session',
  'expert_talk',
  'programme_taster',
  'holiday_quest_preview',
  'open_day',
  'community_event',
  'other'
);

-- CreateEnum ActivationLifecycleStage
CREATE TYPE "ActivationLifecycleStage" AS ENUM (
  'concept',
  'approved',
  'logistics',
  'final_push',
  'delivered',
  'recap_published',
  'cancelled'
);

-- AlterTable CampaignActivationAssignment — add new lifecycle/type/term fields
ALTER TABLE "CampaignActivationAssignment"
  ADD COLUMN "lifecycleStage" "ActivationLifecycleStage" NOT NULL DEFAULT 'concept',
  ADD COLUMN "activationType" "ActivationType",
  ADD COLUMN "conceptApprovedAt" TIMESTAMP(3),
  ADD COLUMN "logisticsStartedAt" TIMESTAMP(3),
  ADD COLUMN "finalPushStartedAt" TIMESTAMP(3),
  ADD COLUMN "recapPublishedAt" TIMESTAMP(3),
  ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD COLUMN "expectedAttendance" INTEGER,
  ADD COLUMN "actualAttendance" INTEGER,
  ADD COLUMN "enquiriesGenerated" INTEGER,
  ADD COLUMN "termYear" INTEGER,
  ADD COLUMN "termNumber" INTEGER,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;

-- Backfill: map existing loose status string → lifecycleStage enum.
-- Defensive — any unrecognised status falls back to 'concept'.
UPDATE "CampaignActivationAssignment"
SET "lifecycleStage" = CASE LOWER(TRIM("status"))
  WHEN 'pending' THEN 'concept'::"ActivationLifecycleStage"
  WHEN 'concept' THEN 'concept'::"ActivationLifecycleStage"
  WHEN 'approved' THEN 'approved'::"ActivationLifecycleStage"
  WHEN 'in_progress' THEN 'logistics'::"ActivationLifecycleStage"
  WHEN 'logistics' THEN 'logistics'::"ActivationLifecycleStage"
  WHEN 'final_push' THEN 'final_push'::"ActivationLifecycleStage"
  WHEN 'completed' THEN 'delivered'::"ActivationLifecycleStage"
  WHEN 'delivered' THEN 'delivered'::"ActivationLifecycleStage"
  WHEN 'recap' THEN 'recap_published'::"ActivationLifecycleStage"
  WHEN 'recap_published' THEN 'recap_published'::"ActivationLifecycleStage"
  WHEN 'cancelled' THEN 'cancelled'::"ActivationLifecycleStage"
  WHEN 'canceled' THEN 'cancelled'::"ActivationLifecycleStage"
  ELSE 'concept'::"ActivationLifecycleStage"
END;

-- For rows already delivered (Sprint 6 set activationDeliveredAt), force the
-- stage to at least 'delivered'.
UPDATE "CampaignActivationAssignment"
SET "lifecycleStage" = 'delivered'
WHERE "activationDeliveredAt" IS NOT NULL
  AND "lifecycleStage" NOT IN ('cancelled', 'recap_published');

-- Drop the loose status string column.
ALTER TABLE "CampaignActivationAssignment" DROP COLUMN "status";

-- CreateIndex
CREATE INDEX "CampaignActivationAssignment_lifecycleStage_idx" ON "CampaignActivationAssignment"("lifecycleStage");
CREATE INDEX "CampaignActivationAssignment_termYear_termNumber_idx" ON "CampaignActivationAssignment"("termYear", "termNumber");
CREATE INDEX "CampaignActivationAssignment_scheduledFor_idx" ON "CampaignActivationAssignment"("scheduledFor");

-- AlterTable User — add team start/pause tracking
ALTER TABLE "User"
  ADD COLUMN "contentTeamStartedAt" TIMESTAMP(3),
  ADD COLUMN "contentTeamPausedAt" TIMESTAMP(3),
  ADD COLUMN "contentTeamPauseReason" TEXT;

-- CreateIndex
CREATE INDEX "User_contentTeamRole_contentTeamStatus_idx" ON "User"("contentTeamRole", "contentTeamStatus");
