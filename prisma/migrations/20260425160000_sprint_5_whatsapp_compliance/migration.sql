-- CreateEnum
CREATE TYPE "WhatsAppNonPostReason" AS ENUM ('coordinator_on_leave', 'coordinator_sick', 'school_closure', 'public_holiday', 'technical_issue', 'forgot_or_missed', 'unknown', 'other');

-- CreateEnum
CREATE TYPE "WhatsAppNetworkGroup" AS ENUM ('engagement', 'announcements');

-- AlterTable WhatsAppCoordinatorPost
ALTER TABLE "WhatsAppCoordinatorPost" ADD COLUMN "notPostingReason" "WhatsAppNonPostReason";

-- CreateTable WhatsAppNetworkPost
CREATE TABLE "WhatsAppNetworkPost" (
    "id" TEXT NOT NULL,
    "group" "WhatsAppNetworkGroup" NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "topic" TEXT,
    "notes" TEXT,
    "marketingPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppNetworkPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppNetworkPost_group_postedAt_idx" ON "WhatsAppNetworkPost"("group", "postedAt");

-- CreateIndex
CREATE INDEX "WhatsAppNetworkPost_recordedById_postedAt_idx" ON "WhatsAppNetworkPost"("recordedById", "postedAt");

-- AddForeignKey
ALTER TABLE "WhatsAppNetworkPost" ADD CONSTRAINT "WhatsAppNetworkPost_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppNetworkPost" ADD CONSTRAINT "WhatsAppNetworkPost_marketingPostId_fkey" FOREIGN KEY ("marketingPostId") REFERENCES "MarketingPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
