-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "parentContactId" TEXT,
ADD COLUMN     "source" TEXT;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_parentContactId_fkey" FOREIGN KEY ("parentContactId") REFERENCES "CentreContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
