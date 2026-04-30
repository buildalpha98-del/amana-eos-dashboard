-- Sprint 3: Centre Avatars — full model + 5 living-log tables

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE "CentreAvatarInsightSource" AS ENUM (
  'coordinator_checkin',
  'parent_conversation',
  'parent_feedback',
  'complaint',
  'compliment',
  'social_comment_or_dm',
  'whatsapp_message',
  'enrolment_conversation',
  'exit_conversation',
  'other'
);

CREATE TYPE "CentreAvatarInsightStatus" AS ENUM (
  'pending_review',
  'approved',
  'dismissed'
);

CREATE TYPE "CentreAvatarInsightHarvestSource" AS ENUM (
  'nps_survey_response',
  'quick_feedback',
  'parent_feedback',
  'manual'
);

-- ============================================================
-- Evolve CentreAvatar: drop `content`, add typed fields
-- ============================================================
ALTER TABLE "CentreAvatar" DROP COLUMN IF EXISTS "content";

ALTER TABLE "CentreAvatar"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "parentAvatar" JSONB,
  ADD COLUMN "programmeMix" JSONB,
  ADD COLUMN "assetLibrary" JSONB,
  ADD COLUMN "lastFullReviewAt" TIMESTAMP(3),
  ADD COLUMN "lastOpenedAt" TIMESTAMP(3),
  ADD COLUMN "lastOpenedById" TEXT;

ALTER TABLE "CentreAvatar"
  ADD CONSTRAINT "CentreAvatar_lastOpenedById_fkey"
  FOREIGN KEY ("lastOpenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- CentreAvatarInsight
-- ============================================================
CREATE TABLE "CentreAvatarInsight" (
  "id" TEXT NOT NULL,
  "centreAvatarId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "source" "CentreAvatarInsightSource" NOT NULL,
  "insight" TEXT NOT NULL,
  "impactOnAvatar" TEXT,
  "status" "CentreAvatarInsightStatus" NOT NULL DEFAULT 'approved',
  "harvestedFrom" "CentreAvatarInsightHarvestSource",
  "sourceRecordId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CentreAvatarInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CentreAvatarInsight_harvestedFrom_sourceRecordId_key"
  ON "CentreAvatarInsight"("harvestedFrom", "sourceRecordId");
CREATE INDEX "CentreAvatarInsight_centreAvatarId_occurredAt_idx"
  ON "CentreAvatarInsight"("centreAvatarId", "occurredAt");
CREATE INDEX "CentreAvatarInsight_status_idx" ON "CentreAvatarInsight"("status");

ALTER TABLE "CentreAvatarInsight"
  ADD CONSTRAINT "CentreAvatarInsight_centreAvatarId_fkey"
  FOREIGN KEY ("centreAvatarId") REFERENCES "CentreAvatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CentreAvatarInsight"
  ADD CONSTRAINT "CentreAvatarInsight_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- CentreAvatarCampaignLog
-- ============================================================
CREATE TABLE "CentreAvatarCampaignLog" (
  "id" TEXT NOT NULL,
  "centreAvatarId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "campaignName" TEXT NOT NULL,
  "contentUsed" TEXT,
  "result" TEXT,
  "learnings" TEXT,
  "marketingCampaignId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CentreAvatarCampaignLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CentreAvatarCampaignLog_centreAvatarId_occurredAt_idx"
  ON "CentreAvatarCampaignLog"("centreAvatarId", "occurredAt");
CREATE INDEX "CentreAvatarCampaignLog_marketingCampaignId_idx"
  ON "CentreAvatarCampaignLog"("marketingCampaignId");

ALTER TABLE "CentreAvatarCampaignLog"
  ADD CONSTRAINT "CentreAvatarCampaignLog_centreAvatarId_fkey"
  FOREIGN KEY ("centreAvatarId") REFERENCES "CentreAvatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CentreAvatarCampaignLog"
  ADD CONSTRAINT "CentreAvatarCampaignLog_marketingCampaignId_fkey"
  FOREIGN KEY ("marketingCampaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CentreAvatarCampaignLog"
  ADD CONSTRAINT "CentreAvatarCampaignLog_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- CentreAvatarCoordinatorCheckIn
-- ============================================================
CREATE TABLE "CentreAvatarCoordinatorCheckIn" (
  "id" TEXT NOT NULL,
  "centreAvatarId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "topicsDiscussed" TEXT NOT NULL,
  "actionItems" TEXT,
  "followUpDate" TIMESTAMP(3),
  "coordinatorUserId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CentreAvatarCoordinatorCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CentreAvatarCoordinatorCheckIn_centreAvatarId_occurredAt_idx"
  ON "CentreAvatarCoordinatorCheckIn"("centreAvatarId", "occurredAt");
CREATE INDEX "CentreAvatarCoordinatorCheckIn_followUpDate_idx"
  ON "CentreAvatarCoordinatorCheckIn"("followUpDate");

ALTER TABLE "CentreAvatarCoordinatorCheckIn"
  ADD CONSTRAINT "CentreAvatarCoordinatorCheckIn_centreAvatarId_fkey"
  FOREIGN KEY ("centreAvatarId") REFERENCES "CentreAvatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CentreAvatarCoordinatorCheckIn"
  ADD CONSTRAINT "CentreAvatarCoordinatorCheckIn_coordinatorUserId_fkey"
  FOREIGN KEY ("coordinatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CentreAvatarCoordinatorCheckIn"
  ADD CONSTRAINT "CentreAvatarCoordinatorCheckIn_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- CentreAvatarSchoolLiaisonLog
-- ============================================================
CREATE TABLE "CentreAvatarSchoolLiaisonLog" (
  "id" TEXT NOT NULL,
  "centreAvatarId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "contactName" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "outcome" TEXT,
  "nextStep" TEXT,
  "schoolCommId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CentreAvatarSchoolLiaisonLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CentreAvatarSchoolLiaisonLog_centreAvatarId_occurredAt_idx"
  ON "CentreAvatarSchoolLiaisonLog"("centreAvatarId", "occurredAt");

ALTER TABLE "CentreAvatarSchoolLiaisonLog"
  ADD CONSTRAINT "CentreAvatarSchoolLiaisonLog_centreAvatarId_fkey"
  FOREIGN KEY ("centreAvatarId") REFERENCES "CentreAvatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CentreAvatarSchoolLiaisonLog"
  ADD CONSTRAINT "CentreAvatarSchoolLiaisonLog_schoolCommId_fkey"
  FOREIGN KEY ("schoolCommId") REFERENCES "SchoolComm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CentreAvatarSchoolLiaisonLog"
  ADD CONSTRAINT "CentreAvatarSchoolLiaisonLog_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- CentreAvatarUpdateLog
-- ============================================================
CREATE TABLE "CentreAvatarUpdateLog" (
  "id" TEXT NOT NULL,
  "centreAvatarId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sectionsChanged" TEXT[],
  "summary" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  CONSTRAINT "CentreAvatarUpdateLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CentreAvatarUpdateLog_centreAvatarId_occurredAt_idx"
  ON "CentreAvatarUpdateLog"("centreAvatarId", "occurredAt");

ALTER TABLE "CentreAvatarUpdateLog"
  ADD CONSTRAINT "CentreAvatarUpdateLog_centreAvatarId_fkey"
  FOREIGN KEY ("centreAvatarId") REFERENCES "CentreAvatar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CentreAvatarUpdateLog"
  ADD CONSTRAINT "CentreAvatarUpdateLog_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
