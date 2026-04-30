-- CreateEnum
CREATE TYPE "MarketingPostFormat" AS ENUM ('feed', 'carousel', 'story', 'reel');

-- CreateEnum
CREATE TYPE "VendorBriefType" AS ENUM ('signage', 'uniform', 'print_collateral', 'merchandise', 'event_supplies', 'other');

-- CreateEnum
CREATE TYPE "VendorBriefStatus" AS ENUM ('draft', 'brief_sent', 'awaiting_ack', 'awaiting_quote', 'quote_received', 'approved', 'ordered', 'delivered', 'installed', 'cancelled');

-- CreateEnum
CREATE TYPE "WeeklyReportStatus" AS ENUM ('draft', 'reviewed', 'sent');

-- CreateEnum
CREATE TYPE "ContentTeamRole" AS ENUM ('content_creator', 'video_editor', 'designer', 'copywriter', 'community_manager');

-- CreateEnum
CREATE TYPE "ContentTeamStatus" AS ENUM ('prospect', 'interview', 'hired', 'onboarding', 'active', 'departed');

-- AlterTable MarketingPost
ALTER TABLE "MarketingPost" ADD COLUMN "format" "MarketingPostFormat";

-- AlterTable SchoolComm
ALTER TABLE "SchoolComm" ADD COLUMN "year" INTEGER;
ALTER TABLE "SchoolComm" ADD COLUMN "term" INTEGER;

-- CreateIndex
CREATE INDEX "SchoolComm_year_term_idx" ON "SchoolComm"("year", "term");

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "contentTeamRole" "ContentTeamRole";
ALTER TABLE "User" ADD COLUMN "contentTeamStatus" "ContentTeamStatus";

-- CreateTable CentreAvatar
CREATE TABLE "CentreAvatar" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "content" JSONB,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedById" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "lastReviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentreAvatar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentreAvatar_serviceId_key" ON "CentreAvatar"("serviceId");

-- CreateIndex
CREATE INDEX "CentreAvatar_lastUpdatedAt_idx" ON "CentreAvatar"("lastUpdatedAt");

-- CreateTable VendorBrief
CREATE TABLE "VendorBrief" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "VendorBriefType" NOT NULL,
    "status" "VendorBriefStatus" NOT NULL DEFAULT 'draft',
    "serviceId" TEXT,
    "ownerId" TEXT,
    "vendorName" TEXT,
    "notes" TEXT,
    "targetTermStart" TIMESTAMP(3),
    "briefSentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "quoteReceivedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "orderedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalatedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorBrief_status_idx" ON "VendorBrief"("status");

-- CreateIndex
CREATE INDEX "VendorBrief_serviceId_idx" ON "VendorBrief"("serviceId");

-- CreateIndex
CREATE INDEX "VendorBrief_targetTermStart_idx" ON "VendorBrief"("targetTermStart");

-- CreateIndex
CREATE INDEX "VendorBrief_briefSentAt_idx" ON "VendorBrief"("briefSentAt");

-- CreateIndex
CREATE INDEX "VendorBrief_escalatedAt_idx" ON "VendorBrief"("escalatedAt");

-- CreateTable WhatsAppCoordinatorPost
CREATE TABLE "WhatsAppCoordinatorPost" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "postedDate" DATE NOT NULL,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "coordinatorId" TEXT,
    "recordedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppCoordinatorPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppCoordinatorPost_serviceId_postedDate_key" ON "WhatsAppCoordinatorPost"("serviceId", "postedDate");

-- CreateIndex
CREATE INDEX "WhatsAppCoordinatorPost_postedDate_idx" ON "WhatsAppCoordinatorPost"("postedDate");

-- CreateTable WeeklyMarketingReport
CREATE TABLE "WeeklyMarketingReport" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "status" "WeeklyReportStatus" NOT NULL DEFAULT 'draft',
    "kpiSnapshot" JSONB NOT NULL,
    "draftBody" TEXT,
    "wins" TEXT,
    "blockers" TEXT,
    "nextWeekTop3" TEXT,
    "draftedAt" TIMESTAMP(3),
    "draftedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyMarketingReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyMarketingReport_weekStart_key" ON "WeeklyMarketingReport"("weekStart");

-- CreateIndex
CREATE INDEX "WeeklyMarketingReport_status_idx" ON "WeeklyMarketingReport"("status");

-- CreateIndex
CREATE INDEX "WeeklyMarketingReport_weekStart_idx" ON "WeeklyMarketingReport"("weekStart");

-- AddForeignKey CentreAvatar
ALTER TABLE "CentreAvatar" ADD CONSTRAINT "CentreAvatar_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CentreAvatar" ADD CONSTRAINT "CentreAvatar_lastUpdatedById_fkey" FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CentreAvatar" ADD CONSTRAINT "CentreAvatar_lastReviewedById_fkey" FOREIGN KEY ("lastReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey VendorBrief
ALTER TABLE "VendorBrief" ADD CONSTRAINT "VendorBrief_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorBrief" ADD CONSTRAINT "VendorBrief_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorBrief" ADD CONSTRAINT "VendorBrief_escalatedToUserId_fkey" FOREIGN KEY ("escalatedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey WhatsAppCoordinatorPost
ALTER TABLE "WhatsAppCoordinatorPost" ADD CONSTRAINT "WhatsAppCoordinatorPost_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppCoordinatorPost" ADD CONSTRAINT "WhatsAppCoordinatorPost_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppCoordinatorPost" ADD CONSTRAINT "WhatsAppCoordinatorPost_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey WeeklyMarketingReport
ALTER TABLE "WeeklyMarketingReport" ADD CONSTRAINT "WeeklyMarketingReport_draftedById_fkey" FOREIGN KEY ("draftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyMarketingReport" ADD CONSTRAINT "WeeklyMarketingReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyMarketingReport" ADD CONSTRAINT "WeeklyMarketingReport_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
