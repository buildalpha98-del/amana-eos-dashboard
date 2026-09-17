-- AlterTable
ALTER TABLE "RecruitmentCandidate" ADD COLUMN     "notHiredNote" TEXT,
ADD COLUMN     "notHiredReason" TEXT;

-- CreateTable
CREATE TABLE "CandidateInterview" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT,
    "conductedById" TEXT,
    "panel" TEXT,
    "notes" TEXT NOT NULL,
    "outcome" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateInterview_candidateId_heldAt_idx" ON "CandidateInterview"("candidateId", "heldAt");

-- CreateIndex
CREATE INDEX "RecruitmentCandidate_notHiredReason_idx" ON "RecruitmentCandidate"("notHiredReason");

-- AddForeignKey
ALTER TABLE "CandidateInterview" ADD CONSTRAINT "CandidateInterview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "RecruitmentCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInterview" ADD CONSTRAINT "CandidateInterview_conductedById_fkey" FOREIGN KEY ("conductedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInterview" ADD CONSTRAINT "CandidateInterview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

