-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('requested', 'confirmed', 'waitlisted', 'cancelled', 'absent_notified');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('permanent', 'casual', 'vacation_care');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('paid', 'unpaid', 'overdue');

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'requested',
    "type" "BookingType" NOT NULL DEFAULT 'casual',
    "fee" DOUBLE PRECISION,
    "ccsApplied" DOUBLE PRECISION,
    "gapFee" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "isIllness" BOOLEAN NOT NULL DEFAULT false,
    "medicalCertificateUrl" TEXT,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "totalFees" DOUBLE PRECISION NOT NULL,
    "totalCcs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gapFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "StatementStatus" NOT NULL DEFAULT 'unpaid',
    "pdfUrl" TEXT,
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentDocument" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" DATE,
    "notes" TEXT,

    CONSTRAINT "ParentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorisedPickup" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "photoUrl" TEXT,
    "hasPassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorisedPickup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_childId_idx" ON "Booking"("childId");

-- CreateIndex
CREATE INDEX "Booking_serviceId_idx" ON "Booking"("serviceId");

-- CreateIndex
CREATE INDEX "Booking_date_idx" ON "Booking"("date");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_serviceId_date_idx" ON "Booking"("serviceId", "date");

-- CreateIndex
CREATE INDEX "Booking_childId_status_idx" ON "Booking"("childId", "status");

-- CreateIndex
CREATE INDEX "Booking_date_status_idx" ON "Booking"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_childId_serviceId_date_sessionType_key" ON "Booking"("childId", "serviceId", "date", "sessionType");

-- CreateIndex
CREATE INDEX "Absence_childId_date_idx" ON "Absence"("childId", "date");

-- CreateIndex
CREATE INDEX "Absence_serviceId_date_idx" ON "Absence"("serviceId", "date");

-- CreateIndex
CREATE INDEX "Absence_childId_idx" ON "Absence"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "Absence_childId_serviceId_date_sessionType_key" ON "Absence"("childId", "serviceId", "date", "sessionType");

-- CreateIndex
CREATE INDEX "Statement_contactId_idx" ON "Statement"("contactId");

-- CreateIndex
CREATE INDEX "Statement_serviceId_periodStart_idx" ON "Statement"("serviceId", "periodStart");

-- CreateIndex
CREATE INDEX "Statement_status_idx" ON "Statement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_contactId_periodStart_periodEnd_key" ON "Statement"("contactId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ParentDocument_childId_idx" ON "ParentDocument"("childId");

-- CreateIndex
CREATE INDEX "ParentDocument_contactId_idx" ON "ParentDocument"("contactId");

-- CreateIndex
CREATE INDEX "AuthorisedPickup_childId_idx" ON "AuthorisedPickup"("childId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentDocument" ADD CONSTRAINT "ParentDocument_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentDocument" ADD CONSTRAINT "ParentDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorisedPickup" ADD CONSTRAINT "AuthorisedPickup_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

