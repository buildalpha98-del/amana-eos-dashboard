-- AlterTable
ALTER TABLE "User" ADD COLUMN     "candidateId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_candidateId_key" ON "User"("candidateId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "RecruitmentCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

