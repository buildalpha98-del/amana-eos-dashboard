-- CreateEnum
CREATE TYPE "InductionStatus" AS ENUM ('new_starter', 'in_training', 'awaiting_signoff', 'cleared');

-- CreateEnum
CREATE TYPE "LMSCourseTrack" AS ENUM ('essential', 'monthly', 'library');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inductionClearedAt" TIMESTAMP(3),
ADD COLUMN     "inductionClearedById" TEXT,
ADD COLUMN     "inductionDueDate" TIMESTAMP(3),
ADD COLUMN     "inductionGraceUntil" TIMESTAMP(3),
ADD COLUMN     "inductionOverrideUntil" TIMESTAMP(3),
ADD COLUMN     "inductionStatus" "InductionStatus" NOT NULL DEFAULT 'cleared';

-- AlterTable
ALTER TABLE "LMSCourse" ADD COLUMN     "track" "LMSCourseTrack" NOT NULL DEFAULT 'library';

-- CreateTable
CREATE TABLE "LMSQuizQuestion" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LMSQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LMSQuizAttempt" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "attemptNumber" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LMSQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticalChecklistItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticalChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticalSignoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "signedById" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "PracticalSignoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCalendarSlot" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "courseId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TrainingCalendarSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LMSQuizQuestion_moduleId_idx" ON "LMSQuizQuestion"("moduleId");

-- CreateIndex
CREATE INDEX "LMSQuizAttempt_enrollmentId_moduleId_idx" ON "LMSQuizAttempt"("enrollmentId", "moduleId");

-- CreateIndex
CREATE INDEX "PracticalSignoff_userId_idx" ON "PracticalSignoff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticalSignoff_userId_itemId_key" ON "PracticalSignoff"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCalendarSlot_month_courseId_key" ON "TrainingCalendarSlot"("month", "courseId");

-- CreateIndex
CREATE INDEX "LMSCourse_track_idx" ON "LMSCourse"("track");

-- AddForeignKey
ALTER TABLE "LMSQuizQuestion" ADD CONSTRAINT "LMSQuizQuestion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LMSModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LMSQuizAttempt" ADD CONSTRAINT "LMSQuizAttempt_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "LMSEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LMSQuizAttempt" ADD CONSTRAINT "LMSQuizAttempt_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LMSModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalSignoff" ADD CONSTRAINT "PracticalSignoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalSignoff" ADD CONSTRAINT "PracticalSignoff_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PracticalChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalSignoff" ADD CONSTRAINT "PracticalSignoff_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCalendarSlot" ADD CONSTRAINT "TrainingCalendarSlot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LMSCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

