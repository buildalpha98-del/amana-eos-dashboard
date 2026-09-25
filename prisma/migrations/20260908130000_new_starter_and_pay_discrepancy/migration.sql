-- Team tab "Onboarding" sub-tab (leadership-only) + My Portal "Pay
-- discrepancy" reports. Two independent, unrelated tables landing in one
-- migration since they shipped together.

-- CreateEnum
CREATE TYPE "NewStarterRequestStatus" AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "PayDiscrepancyStatus" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "NewStarterRequest" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "targetPosition" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "awardLevel" "AwardLevel" NOT NULL,
    "awardLevelCustom" TEXT,
    "qualification" "QualificationType",
    "serviceId" TEXT NOT NULL,
    "expectedStartDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "NewStarterRequestStatus" NOT NULL DEFAULT 'pending',
    "requestedById" TEXT NOT NULL,
    "assignedAdminId" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewStarterRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayDiscrepancyReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "serviceId" TEXT,
    "discrepancyDate" TIMESTAMP(3) NOT NULL,
    "hoursShort" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "status" "PayDiscrepancyStatus" NOT NULL DEFAULT 'open',
    "reviewedById" TEXT,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayDiscrepancyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewStarterRequest_completedUserId_key" ON "NewStarterRequest"("completedUserId");

-- CreateIndex
CREATE INDEX "NewStarterRequest_status_idx" ON "NewStarterRequest"("status");

-- CreateIndex
CREATE INDEX "NewStarterRequest_serviceId_idx" ON "NewStarterRequest"("serviceId");

-- CreateIndex
CREATE INDEX "NewStarterRequest_requestedById_idx" ON "NewStarterRequest"("requestedById");

-- CreateIndex
CREATE INDEX "PayDiscrepancyReport_status_idx" ON "PayDiscrepancyReport"("status");

-- CreateIndex
CREATE INDEX "PayDiscrepancyReport_reporterId_idx" ON "PayDiscrepancyReport"("reporterId");

-- CreateIndex
CREATE INDEX "PayDiscrepancyReport_serviceId_idx" ON "PayDiscrepancyReport"("serviceId");

-- AddForeignKey
ALTER TABLE "NewStarterRequest" ADD CONSTRAINT "NewStarterRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewStarterRequest" ADD CONSTRAINT "NewStarterRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewStarterRequest" ADD CONSTRAINT "NewStarterRequest_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewStarterRequest" ADD CONSTRAINT "NewStarterRequest_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewStarterRequest" ADD CONSTRAINT "NewStarterRequest_completedUserId_fkey" FOREIGN KEY ("completedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayDiscrepancyReport" ADD CONSTRAINT "PayDiscrepancyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayDiscrepancyReport" ADD CONSTRAINT "PayDiscrepancyReport_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayDiscrepancyReport" ADD CONSTRAINT "PayDiscrepancyReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

