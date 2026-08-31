-- 2026-07-08: staff surveys (Microsoft Forms-style builder).
--
-- Sits under /onboarding as a new "Surveys" tab. Not tied to any
-- lifecycle event — the existing Exit Surveys dashboard covers that.
-- Anonymous mode nulls the respondent link on submit so results can
-- still be aggregated but individuals aren't identifiable.

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('draft', 'published', 'closed');

-- CreateEnum
CREATE TYPE "SurveyQuestionType" AS ENUM ('yes_no', 'single_choice', 'multi_choice', 'short_text', 'long_text', 'rating');

-- CreateEnum
CREATE TYPE "SurveyAudience" AS ENUM ('all_staff', 'by_role', 'by_service', 'by_employment_type');

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "SurveyStatus" NOT NULL DEFAULT 'draft',
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "audience" "SurveyAudience" NOT NULL DEFAULT 'all_staff',
    "audienceRoles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "audienceServiceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audienceEmploymentTypes" "EmploymentType"[] DEFAULT ARRAY[]::"EmploymentType"[],
    "closesAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "type" "SurveyQuestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "respondentId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "yesNo" BOOLEAN,
    "choiceIndexes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "textValue" TEXT,
    "ratingValue" INTEGER,

    CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Survey_status_idx" ON "Survey"("status");
CREATE INDEX "Survey_createdById_idx" ON "Survey"("createdById");
CREATE INDEX "SurveyQuestion_surveyId_idx" ON "SurveyQuestion"("surveyId");
CREATE UNIQUE INDEX "SurveyResponse_surveyId_respondentId_key" ON "SurveyResponse"("surveyId", "respondentId");
CREATE INDEX "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");
CREATE INDEX "SurveyResponse_respondentId_idx" ON "SurveyResponse"("respondentId");
CREATE UNIQUE INDEX "SurveyAnswer_responseId_questionId_key" ON "SurveyAnswer"("responseId", "questionId");
CREATE INDEX "SurveyAnswer_responseId_idx" ON "SurveyAnswer"("responseId");
CREATE INDEX "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
