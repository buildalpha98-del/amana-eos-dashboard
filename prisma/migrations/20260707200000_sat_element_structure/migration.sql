-- AlterTable
ALTER TABLE "QualityImprovementPlan" ADD COLUMN     "legalComments" JSONB,
ADD COLUMN     "servicePhilosophy" TEXT;

-- AlterTable
ALTER TABLE "QipSuggestion" ADD COLUMN     "elementCode" TEXT;

-- CreateTable
CREATE TABLE "SatElementAssessment" (
    "id" TEXT NOT NULL,
    "qipId" TEXT NOT NULL,
    "elementCode" TEXT NOT NULL,
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assessment" TEXT NOT NULL DEFAULT 'not_assessed',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SatElementAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatLegalCheck" (
    "id" TEXT NOT NULL,
    "qipId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "assessment" TEXT NOT NULL DEFAULT 'not_assessed',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SatLegalCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatImprovement" (
    "id" TEXT NOT NULL,
    "qipId" TEXT NOT NULL,
    "elementCode" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "outcomeGoal" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "steps" TEXT NOT NULL,
    "successMeasure" TEXT NOT NULL,
    "byWhen" TEXT,
    "progressNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SatImprovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SatElementAssessment_qipId_elementCode_key" ON "SatElementAssessment"("qipId", "elementCode");

-- CreateIndex
CREATE UNIQUE INDEX "SatLegalCheck_qipId_checkKey_key" ON "SatLegalCheck"("qipId", "checkKey");

-- CreateIndex
CREATE INDEX "SatImprovement_qipId_status_idx" ON "SatImprovement"("qipId", "status");

-- AddForeignKey
ALTER TABLE "SatElementAssessment" ADD CONSTRAINT "SatElementAssessment_qipId_fkey" FOREIGN KEY ("qipId") REFERENCES "QualityImprovementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatLegalCheck" ADD CONSTRAINT "SatLegalCheck_qipId_fkey" FOREIGN KEY ("qipId") REFERENCES "QualityImprovementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatImprovement" ADD CONSTRAINT "SatImprovement_qipId_fkey" FOREIGN KEY ("qipId") REFERENCES "QualityImprovementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

