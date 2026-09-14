-- AlterTable
ALTER TABLE "StaffReflection" ADD COLUMN     "aiTagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mtopOutcomes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "parentPostId" TEXT;

-- AlterTable
ALTER TABLE "LearningObservation" ADD COLUMN     "aiTagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceReflectionId" TEXT;

-- CreateTable
CREATE TABLE "QipSuggestion" (
    "id" TEXT NOT NULL,
    "qipId" TEXT NOT NULL,
    "qualityArea" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "currentText" TEXT,
    "proposedText" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "weekOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QipSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QipSuggestion_qipId_status_idx" ON "QipSuggestion"("qipId", "status");

-- CreateIndex
CREATE INDEX "QipSuggestion_weekOf_idx" ON "QipSuggestion"("weekOf");

-- AddForeignKey
ALTER TABLE "QipSuggestion" ADD CONSTRAINT "QipSuggestion_qipId_fkey" FOREIGN KEY ("qipId") REFERENCES "QualityImprovementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QipSuggestion" ADD CONSTRAINT "QipSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

