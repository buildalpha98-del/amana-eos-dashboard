-- 90-Day Ramp (2026-09-14): StaffRamp + weekly RampCheckIn + RampCheckpoint.
-- Supersedes NewStarterCheckIn (table kept; seeder/cron removed).

-- CreateEnum
CREATE TYPE "RampStatus" AS ENUM ('active', 'completed', 'extended', 'ended');

-- CreateEnum
CREATE TYPE "RampRecommendation" AS ENUM ('on_track', 'needs_support', 'at_risk', 'pass', 'extend', 'end');

-- CreateTable
CREATE TABLE "StaffRamp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "RampStatus" NOT NULL DEFAULT 'active',
    "completedAt" TIMESTAMP(3),
    "probationReviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRamp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RampCheckIn" (
    "id" TEXT NOT NULL,
    "rampId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "mood" INTEGER,
    "wentWell" TEXT,
    "struggling" TEXT,
    "needsHelp" BOOLEAN,
    "helpDetail" TEXT,
    "flaggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RampCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RampCheckpoint" (
    "id" TEXT NOT NULL,
    "rampId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "lastRemindedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewerUserId" TEXT,
    "ratings" JSONB NOT NULL DEFAULT '{}',
    "summary" TEXT,
    "recommendation" "RampRecommendation",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RampCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffRamp_userId_key" ON "StaffRamp"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffRamp_probationReviewId_key" ON "StaffRamp"("probationReviewId");

-- CreateIndex
CREATE INDEX "StaffRamp_status_endDate_idx" ON "StaffRamp"("status", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "RampCheckIn_token_key" ON "RampCheckIn"("token");

-- CreateIndex
CREATE INDEX "RampCheckIn_dueAt_sentAt_idx" ON "RampCheckIn"("dueAt", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "RampCheckIn_rampId_weekNumber_key" ON "RampCheckIn"("rampId", "weekNumber");

-- CreateIndex
CREATE INDEX "RampCheckpoint_dueAt_submittedAt_idx" ON "RampCheckpoint"("dueAt", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RampCheckpoint_rampId_day_key" ON "RampCheckpoint"("rampId", "day");

-- AddForeignKey
ALTER TABLE "StaffRamp" ADD CONSTRAINT "StaffRamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RampCheckIn" ADD CONSTRAINT "RampCheckIn_rampId_fkey" FOREIGN KEY ("rampId") REFERENCES "StaffRamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RampCheckpoint" ADD CONSTRAINT "RampCheckpoint_rampId_fkey" FOREIGN KEY ("rampId") REFERENCES "StaffRamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RampCheckpoint" ADD CONSTRAINT "RampCheckpoint_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

