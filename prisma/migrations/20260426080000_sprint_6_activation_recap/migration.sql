-- AlterTable CampaignActivationAssignment
ALTER TABLE "CampaignActivationAssignment" ADD COLUMN "activationDeliveredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CampaignActivationAssignment_activationDeliveredAt_idx" ON "CampaignActivationAssignment"("activationDeliveredAt");

-- AlterTable MarketingPost
ALTER TABLE "MarketingPost" ADD COLUMN "recapForActivationId" TEXT;

-- CreateIndex
CREATE INDEX "MarketingPost_recapForActivationId_idx" ON "MarketingPost"("recapForActivationId");

-- AddForeignKey
ALTER TABLE "MarketingPost" ADD CONSTRAINT "MarketingPost_recapForActivationId_fkey" FOREIGN KEY ("recapForActivationId") REFERENCES "CampaignActivationAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
