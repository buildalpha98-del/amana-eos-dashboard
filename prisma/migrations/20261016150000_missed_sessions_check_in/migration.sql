-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "missedCheckInReason" TEXT,
ADD COLUMN     "missedCheckInReasonAt" TIMESTAMP(3),
ADD COLUMN     "missedCheckInSentAt" TIMESTAMP(3),
ADD COLUMN     "ownaMatchChildId" TEXT;

