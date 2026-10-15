-- AlterTable
ALTER TABLE "EnrolmentSubmission" ADD COLUMN     "extraDayOfferSentAt" TIMESTAMP(3),
ADD COLUMN     "noShowReason" TEXT,
ADD COLUMN     "noShowReasonAt" TIMESTAMP(3),
ADD COLUMN     "noShowSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "firstAttendedAt" TIMESTAMP(3),
ADD COLUMN     "lastAttendedAt" TIMESTAMP(3);

