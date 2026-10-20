-- First-day check + call (Daniel, 21 Oct 2026).
ALTER TABLE "EnrolmentSubmission" ADD COLUMN "firstDayAttendance" TEXT;
ALTER TABLE "EnrolmentSubmission" ADD COLUMN "firstDayAttendanceAt" TIMESTAMP(3);
ALTER TABLE "EnrolmentSubmission" ADD COLUMN "firstDayAttendanceById" TEXT;
ALTER TABLE "EnrolmentSubmission" ADD COLUMN "firstDayPromptedAt" TIMESTAMP(3);
ALTER TABLE "EnrolmentSubmission" ADD COLUMN "firstDayCalledAt" TIMESTAMP(3);
