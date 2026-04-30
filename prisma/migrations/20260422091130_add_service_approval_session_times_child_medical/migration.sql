-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "medicareExpiry" TIMESTAMP(3),
ADD COLUMN     "medicareNumber" TEXT,
ADD COLUMN     "medicareRef" TEXT,
ADD COLUMN     "vaccinationStatus" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "casualBookingSettings" JSONB,
ADD COLUMN     "providerApprovalNumber" TEXT,
ADD COLUMN     "serviceApprovalNumber" TEXT,
ADD COLUMN     "sessionTimes" JSONB;

