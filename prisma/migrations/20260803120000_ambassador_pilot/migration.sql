-- CreateEnum
CREATE TYPE "AmbassadorPilotStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "AmbassadorAttributionSource" AS ENUM ('form_field', 'qr_ref', 'both', 'unknown');

-- CreateEnum
CREATE TYPE "AmbassadorRecordStatus" AS ENUM ('logged', 'director_verified', 'sm_approved', 'sent_to_payroll', 'paid', 'rejected');

-- CreateEnum
CREATE TYPE "AmbassadorNewChildStatus" AS ENUM ('new_child', 'existing_child', 'uncertain');

-- CreateEnum
CREATE TYPE "AmbassadorSessionSource" AS ENUM ('manual', 'csv_import', 'owna');

-- AlterTable
ALTER TABLE "EnrolmentSubmission" ADD COLUMN     "referralEducatorName" TEXT;

-- AlterTable
ALTER TABLE "ParentAccount" ADD COLUMN     "ambassadorRefCode" TEXT;

-- CreateTable
CREATE TABLE "AmbassadorPilot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "AmbassadorPilotStatus" NOT NULL DEFAULT 'draft',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbassadorPilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbassadorPilotCentre" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "targetQualifiedEnrolments" INTEGER NOT NULL,
    "teamBonusAmount" DOUBLE PRECISION NOT NULL DEFAULT 200,

    CONSTRAINT "AmbassadorPilotCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EducatorRefCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "qrCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EducatorRefCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbassadorEnrolment" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "childId" TEXT,
    "enrolmentSubmissionId" TEXT,
    "enrolmentApplicationId" TEXT,
    "childInitials" TEXT NOT NULL,
    "creditedEducatorId" TEXT,
    "namedEducatorText" TEXT,
    "refCode" TEXT,
    "attributionSource" "AmbassadorAttributionSource" NOT NULL DEFAULT 'unknown',
    "attributionConflict" BOOLEAN NOT NULL DEFAULT false,
    "newChildStatus" "AmbassadorNewChildStatus" NOT NULL DEFAULT 'uncertain',
    "newChildCheckedAt" TIMESTAMP(3),
    "newChildDetail" TEXT,
    "regularSessionsPerWeek" INTEGER,
    "firstAttendanceDate" DATE,
    "paidSessionsAttended" INTEGER NOT NULL DEFAULT 0,
    "tierAmount" DOUBLE PRECISION,
    "incentiveAmount" DOUBLE PRECISION,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "qualifiedAt" TIMESTAMP(3),
    "status" "AmbassadorRecordStatus" NOT NULL DEFAULT 'logged',
    "rejectionReason" TEXT,
    "sentToPayrollAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbassadorEnrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbassadorSession" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" TEXT NOT NULL DEFAULT 'unknown',
    "fee" DOUBLE PRECISION NOT NULL,
    "source" "AmbassadorSessionSource" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbassadorTransition" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fromStatus" "AmbassadorRecordStatus" NOT NULL,
    "toStatus" "AmbassadorRecordStatus" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbassadorAdjustment" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "educatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sentToPayrollAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmbassadorPilot_status_idx" ON "AmbassadorPilot"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorPilotCentre_pilotId_serviceId_key" ON "AmbassadorPilotCentre"("pilotId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "EducatorRefCode_userId_key" ON "EducatorRefCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EducatorRefCode_code_key" ON "EducatorRefCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EducatorRefCode_qrCodeId_key" ON "EducatorRefCode"("qrCodeId");

-- CreateIndex
CREATE INDEX "AmbassadorEnrolment_pilotId_serviceId_idx" ON "AmbassadorEnrolment"("pilotId", "serviceId");

-- CreateIndex
CREATE INDEX "AmbassadorEnrolment_creditedEducatorId_idx" ON "AmbassadorEnrolment"("creditedEducatorId");

-- CreateIndex
CREATE INDEX "AmbassadorEnrolment_status_idx" ON "AmbassadorEnrolment"("status");

-- CreateIndex
CREATE INDEX "AmbassadorEnrolment_childId_idx" ON "AmbassadorEnrolment"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorSession_recordId_date_sessionType_key" ON "AmbassadorSession"("recordId", "date", "sessionType");

-- CreateIndex
CREATE INDEX "AmbassadorTransition_recordId_idx" ON "AmbassadorTransition"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "AmbassadorAdjustment_pilotId_educatorId_type_key" ON "AmbassadorAdjustment"("pilotId", "educatorId", "type");

-- AddForeignKey
ALTER TABLE "AmbassadorPilot" ADD CONSTRAINT "AmbassadorPilot_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorPilotCentre" ADD CONSTRAINT "AmbassadorPilotCentre_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "AmbassadorPilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorPilotCentre" ADD CONSTRAINT "AmbassadorPilotCentre_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EducatorRefCode" ADD CONSTRAINT "EducatorRefCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EducatorRefCode" ADD CONSTRAINT "EducatorRefCode_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QrCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorEnrolment" ADD CONSTRAINT "AmbassadorEnrolment_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "AmbassadorPilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorEnrolment" ADD CONSTRAINT "AmbassadorEnrolment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorEnrolment" ADD CONSTRAINT "AmbassadorEnrolment_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorEnrolment" ADD CONSTRAINT "AmbassadorEnrolment_enrolmentSubmissionId_fkey" FOREIGN KEY ("enrolmentSubmissionId") REFERENCES "EnrolmentSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorEnrolment" ADD CONSTRAINT "AmbassadorEnrolment_enrolmentApplicationId_fkey" FOREIGN KEY ("enrolmentApplicationId") REFERENCES "EnrolmentApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorEnrolment" ADD CONSTRAINT "AmbassadorEnrolment_creditedEducatorId_fkey" FOREIGN KEY ("creditedEducatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorSession" ADD CONSTRAINT "AmbassadorSession_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AmbassadorEnrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorSession" ADD CONSTRAINT "AmbassadorSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorTransition" ADD CONSTRAINT "AmbassadorTransition_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AmbassadorEnrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorTransition" ADD CONSTRAINT "AmbassadorTransition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorAdjustment" ADD CONSTRAINT "AmbassadorAdjustment_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "AmbassadorPilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorAdjustment" ADD CONSTRAINT "AmbassadorAdjustment_educatorId_fkey" FOREIGN KEY ("educatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

