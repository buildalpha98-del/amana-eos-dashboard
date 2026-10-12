-- CreateEnum
CREATE TYPE "StaffUpdateType" AS ENUM ('policy_update', 'reminder', 'please_read', 'professional_development', 'wellbeing');

-- CreateEnum
CREATE TYPE "StaffUpdateStatus" AS ENUM ('draft', 'approved', 'sent', 'cancelled');

-- CreateTable
CREATE TABLE "StaffUpdate" (
    "id" TEXT NOT NULL,
    "type" "StaffUpdateType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "audienceRoles" "Role"[],
    "audienceServiceIds" TEXT[],
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "status" "StaffUpdateStatus" NOT NULL DEFAULT 'draft',
    "source" TEXT NOT NULL DEFAULT 'admin',
    "createdById" TEXT,
    "createdByName" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffUpdate_status_urgent_idx" ON "StaffUpdate"("status", "urgent");

-- CreateIndex
CREATE INDEX "StaffUpdate_createdAt_idx" ON "StaffUpdate"("createdAt");

