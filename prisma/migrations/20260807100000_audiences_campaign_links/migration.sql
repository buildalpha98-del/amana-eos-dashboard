-- AlterTable
ALTER TABLE "CreativeRequest" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "EmailAudience" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAudience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailAudience_archived_idx" ON "EmailAudience"("archived");

-- CreateIndex
CREATE INDEX "CreativeRequest_campaignId_idx" ON "CreativeRequest"("campaignId");

-- CreateIndex
CREATE INDEX "CentreContact_createdAt_idx" ON "CentreContact"("createdAt");

-- AddForeignKey
ALTER TABLE "EmailAudience" ADD CONSTRAINT "EmailAudience_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

