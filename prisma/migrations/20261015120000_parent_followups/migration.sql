-- AlterTable
ALTER TABLE "EnrolmentSubmission" ADD COLUMN     "slaOverdueSentAt" TIMESTAMP(3),
ADD COLUMN     "slaReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ParentAccount" ADD COLUMN     "followUpCalledAt" TIMESTAMP(3);

