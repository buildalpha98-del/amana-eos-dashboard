-- AlterTable
ALTER TABLE "RecruitmentVacancy" ADD COLUMN     "closesAt" TIMESTAMP(3),
ADD COLUMN     "payRate" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "workPeriod" TEXT;

-- AlterTable
ALTER TABLE "RecruitmentCandidate" ADD COLUMN     "fitLabel" TEXT,
ADD COLUMN     "fitReasons" TEXT[],
ADD COLUMN     "fitScore" INTEGER,
ADD COLUMN     "holidayWeeks" INTEGER,
ADD COLUMN     "qualificationName" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "vicDiplomaLevel" BOOLEAN;

