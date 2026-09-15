-- DropForeignKey
ALTER TABLE "RecruitmentVacancy" DROP CONSTRAINT "RecruitmentVacancy_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "RecruitmentCandidate" DROP CONSTRAINT "RecruitmentCandidate_vacancyId_fkey";

-- AlterTable
ALTER TABLE "RecruitmentVacancy" ADD COLUMN     "region" TEXT,
ALTER COLUMN "serviceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RecruitmentCandidate" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "availableDays" TEXT[],
ADD COLUMN     "availableSessions" TEXT[],
ADD COLUMN     "earliestStart" DATE,
ADD COLUMN     "hasFirstAid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasTransport" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "preferredRegion" TEXT,
ADD COLUMN     "previousEmployer" TEXT,
ADD COLUMN     "previousRole" TEXT,
ADD COLUMN     "qualification" "QualificationType",
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "rightToWork" TEXT,
ADD COLUMN     "studying" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suburb" TEXT,
ADD COLUMN     "wwccExpiry" DATE,
ADD COLUMN     "wwccNumber" TEXT,
ADD COLUMN     "yearsExperience" INTEGER,
ALTER COLUMN "vacancyId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CandidateNote" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateNote_candidateId_createdAt_idx" ON "CandidateNote"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "RecruitmentCandidate_preferredRegion_idx" ON "RecruitmentCandidate"("preferredRegion");

-- CreateIndex
CREATE INDEX "RecruitmentCandidate_archivedAt_idx" ON "RecruitmentCandidate"("archivedAt");

-- AddForeignKey
ALTER TABLE "RecruitmentVacancy" ADD CONSTRAINT "RecruitmentVacancy_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCandidate" ADD CONSTRAINT "RecruitmentCandidate_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "RecruitmentVacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateNote" ADD CONSTRAINT "CandidateNote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "RecruitmentCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateNote" ADD CONSTRAINT "CandidateNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

