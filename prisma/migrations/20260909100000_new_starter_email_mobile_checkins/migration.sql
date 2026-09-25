-- New-starter onboarding, phase 2: the request now creates the real
-- account immediately (email/mobile become required inputs), plus the
-- day-1/week-1/month-1 check-in touchpoints.

-- CreateEnum
CREATE TYPE "NewStarterCheckInMilestone" AS ENUM ('day_1', 'week_1', 'month_1');

-- AlterTable
ALTER TABLE "NewStarterRequest" ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "mobile" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "NewStarterCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "milestone" "NewStarterCheckInMilestone" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "mood" INTEGER,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewStarterCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewStarterCheckIn_token_key" ON "NewStarterCheckIn"("token");

-- CreateIndex
CREATE INDEX "NewStarterCheckIn_dueAt_sentAt_idx" ON "NewStarterCheckIn"("dueAt", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewStarterCheckIn_userId_milestone_key" ON "NewStarterCheckIn"("userId", "milestone");

-- AddForeignKey
ALTER TABLE "NewStarterCheckIn" ADD CONSTRAINT "NewStarterCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

