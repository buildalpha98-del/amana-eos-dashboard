-- CreateEnum
CREATE TYPE "MeetingRecordingStatus" AS ENUM ('uploaded', 'transcribing', 'transcribed', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "MeetingRecordingSource" AS ENUM ('live_mic', 'upload');

-- CreateTable
CREATE TABLE "MeetingRecording" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "source" "MeetingRecordingSource" NOT NULL,
    "status" "MeetingRecordingStatus" NOT NULL DEFAULT 'uploaded',
    "audioBlobUrl" TEXT,
    "durationSeconds" INTEGER,
    "deepgramRequestId" TEXT,
    "transcript" JSONB,
    "transcriptText" TEXT,
    "aiReview" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingRecording_meetingId_idx" ON "MeetingRecording"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingRecording_status_createdAt_idx" ON "MeetingRecording"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingRecording_deepgramRequestId_idx" ON "MeetingRecording"("deepgramRequestId");

-- AddForeignKey
ALTER TABLE "MeetingRecording" ADD CONSTRAINT "MeetingRecording_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecording" ADD CONSTRAINT "MeetingRecording_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

