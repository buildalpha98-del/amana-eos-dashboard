-- AlterTable CampaignActivationAssignment — QR fields
ALTER TABLE "CampaignActivationAssignment"
  ADD COLUMN "qrShortCode" TEXT,
  ADD COLUMN "qrDestinationUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CampaignActivationAssignment_qrShortCode_key" ON "CampaignActivationAssignment"("qrShortCode");

-- CreateTable ActivationScan
CREATE TABLE "ActivationScan" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,

    CONSTRAINT "ActivationScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivationScan_activationId_scannedAt_idx" ON "ActivationScan"("activationId", "scannedAt");

-- AddForeignKey
ALTER TABLE "ActivationScan" ADD CONSTRAINT "ActivationScan_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "CampaignActivationAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable ParentEnquiry — QR attribution
ALTER TABLE "ParentEnquiry" ADD COLUMN "sourceActivationId" TEXT;

-- AddForeignKey
ALTER TABLE "ParentEnquiry" ADD CONSTRAINT "ParentEnquiry_sourceActivationId_fkey" FOREIGN KEY ("sourceActivationId") REFERENCES "CampaignActivationAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ParentEnquiry_sourceActivationId_idx" ON "ParentEnquiry"("sourceActivationId");
