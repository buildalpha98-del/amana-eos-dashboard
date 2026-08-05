-- CreateEnum
CREATE TYPE "ProofDecision" AS ENUM ('approved', 'approved_with_changes', 'changes_requested');

-- AlterTable
ALTER TABLE "CreativeRequest" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedMs" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreativeRequestProof" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "note" TEXT,
    "uploadedById" TEXT,
    "decision" "ProofDecision",
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeRequestProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreativeRequestProof_requestId_idx" ON "CreativeRequestProof"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeRequestProof_requestId_version_key" ON "CreativeRequestProof"("requestId", "version");

-- AddForeignKey
ALTER TABLE "CreativeRequestProof" ADD CONSTRAINT "CreativeRequestProof_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CreativeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequestProof" ADD CONSTRAINT "CreativeRequestProof_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequestProof" ADD CONSTRAINT "CreativeRequestProof_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

