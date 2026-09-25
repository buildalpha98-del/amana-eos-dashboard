-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "completionNote" TEXT;

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "measurableId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "rockId" TEXT;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "seriesId" TEXT;

-- AlterTable
ALTER TABLE "MeetingRecording" ADD COLUMN     "digestSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MeetingSeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "minuteOfDay" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "isLeadership" BOOLEAN NOT NULL DEFAULT false,
    "serviceIds" TEXT[],
    "scorecardId" TEXT,
    "attendeeUserIds" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingSeries_active_idx" ON "MeetingSeries"("active");

-- CreateIndex
CREATE INDEX "Issue_measurableId_idx" ON "Issue"("measurableId");

-- CreateIndex
CREATE INDEX "Project_rockId_idx" ON "Project"("rockId");

-- CreateIndex
CREATE INDEX "Meeting_seriesId_idx" ON "Meeting"("seriesId");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_measurableId_fkey" FOREIGN KEY ("measurableId") REFERENCES "Measurable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_rockId_fkey" FOREIGN KEY ("rockId") REFERENCES "Rock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MeetingSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSeries" ADD CONSTRAINT "MeetingSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

