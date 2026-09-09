-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "meetingId" TEXT;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "outcomes" JSONB;

-- CreateIndex
CREATE INDEX "Todo_meetingId_idx" ON "Todo"("meetingId");

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

