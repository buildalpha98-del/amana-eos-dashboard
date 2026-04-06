-- CreateEnum
CREATE TYPE "ChildDocumentType" AS ENUM ('ANAPHYLAXIS_PLAN', 'ASTHMA_PLAN', 'MEDICAL_CERTIFICATE', 'IMMUNISATION_RECORD', 'COURT_ORDER', 'OTHER');

-- AlterTable
ALTER TABLE "AuthorisedPickup" ADD COLUMN     "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photoId" TEXT;

-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "additionalNeeds" TEXT,
ADD COLUMN     "anaphylaxisActionPlan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dietaryRequirements" TEXT[],
ADD COLUMN     "medicalConditions" TEXT[],
ADD COLUMN     "medicationDetails" TEXT,
ADD COLUMN     "photo" TEXT;

-- CreateTable
CREATE TABLE "ChildDocument" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "documentType" "ChildDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChildDocument_childId_idx" ON "ChildDocument"("childId");

-- CreateIndex
CREATE INDEX "ChildDocument_uploadedById_idx" ON "ChildDocument"("uploadedById");

-- AddForeignKey
ALTER TABLE "ChildDocument" ADD CONSTRAINT "ChildDocument_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildDocument" ADD CONSTRAINT "ChildDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
