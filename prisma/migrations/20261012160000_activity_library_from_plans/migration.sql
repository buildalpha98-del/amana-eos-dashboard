-- AlterTable
ALTER TABLE "ProgramPlanSync" ADD COLUMN     "libraryAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ActivityTemplate" ADD COLUMN     "mtopOutcomes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "source" TEXT,
ADD COLUMN     "sourceKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTemplate_sourceKey_key" ON "ActivityTemplate"("sourceKey");

