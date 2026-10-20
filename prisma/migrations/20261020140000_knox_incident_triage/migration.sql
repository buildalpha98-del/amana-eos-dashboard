-- CreateEnum
CREATE TYPE "TriageSubjectType" AS ENUM ('incident', 'complaint', 'staff_incident');

-- CreateEnum
CREATE TYPE "TriageJobStatus" AS ENUM ('pending', 'running', 'done', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "TriageTier" AS ENUM ('minor', 'moderate', 'serious');

-- AlterTable
ALTER TABLE "AiUsage" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TriageJob" (
    "id" TEXT NOT NULL,
    "subjectType" "TriageSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TriageJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriageJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriageAssessment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "subjectType" "TriageSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tier" "TriageTier" NOT NULL,
    "ruleHits" TEXT[],
    "clocks" JSONB NOT NULL,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "modelId" TEXT,
    "severityOpinion" TEXT,
    "rationale" TEXT,
    "missingFields" TEXT[],
    "suggestedSeverity" TEXT,
    "suggestedCategory" TEXT,
    "parentNoticeDraft" TEXT,
    "regulatorPackDraft" TEXT,
    "aiUsageId" TEXT,
    "modelError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriageAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriageAlert" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "tier" "TriageTier" NOT NULL,
    "recipientUserId" TEXT,
    "channel" TEXT NOT NULL,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,

    CONSTRAINT "TriageAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingAction" (
    "id" TEXT NOT NULL,
    "proposedBy" TEXT NOT NULL,
    "userId" TEXT,
    "serviceId" TEXT,
    "kind" TEXT NOT NULL,
    "subjectType" "TriageSubjectType",
    "subjectId" TEXT,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "rationale" TEXT,
    "turnId" TEXT,
    "assessmentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "committedById" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,
    "dismissReason" TEXT,
    "resultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TriageJob_status_scheduledFor_idx" ON "TriageJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "TriageJob_subjectType_subjectId_idx" ON "TriageJob"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "TriageAssessment_jobId_key" ON "TriageAssessment"("jobId");

-- CreateIndex
CREATE INDEX "TriageAssessment_subjectType_subjectId_createdAt_idx" ON "TriageAssessment"("subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "TriageAssessment_serviceId_createdAt_idx" ON "TriageAssessment"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "TriageAssessment_tier_createdAt_idx" ON "TriageAssessment"("tier", "createdAt");

-- CreateIndex
CREATE INDEX "TriageAlert_assessmentId_idx" ON "TriageAlert"("assessmentId");

-- CreateIndex
CREATE INDEX "TriageAlert_acknowledgedAt_tier_sentAt_idx" ON "TriageAlert"("acknowledgedAt", "tier", "sentAt");

-- CreateIndex
CREATE INDEX "TriageAlert_recipientUserId_acknowledgedAt_idx" ON "TriageAlert"("recipientUserId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "PendingAction_serviceId_createdAt_idx" ON "PendingAction"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "PendingAction_subjectType_subjectId_idx" ON "PendingAction"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "PendingAction_expiresAt_idx" ON "PendingAction"("expiresAt");

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TriageJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAlert" ADD CONSTRAINT "TriageAlert_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "TriageAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAlert" ADD CONSTRAINT "TriageAlert_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAlert" ADD CONSTRAINT "TriageAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "TriageAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_committedById_fkey" FOREIGN KEY ("committedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

