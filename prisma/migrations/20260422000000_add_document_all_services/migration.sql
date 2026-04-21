-- AlterTable
ALTER TABLE "Document" ADD COLUMN "allServices" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Document_allServices_idx" ON "Document"("allServices");
