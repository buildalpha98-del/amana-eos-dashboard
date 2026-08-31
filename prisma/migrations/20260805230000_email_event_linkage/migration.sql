-- AlterTable
ALTER TABLE "EmailEvent" ADD COLUMN     "deliveryLogId" TEXT;

-- AlterTable
ALTER TABLE "DeliveryLog" ADD COLUMN     "externalIdType" TEXT;

-- CreateIndex
CREATE INDEX "EmailEvent_deliveryLogId_idx" ON "EmailEvent"("deliveryLogId");

-- CreateIndex
CREATE INDEX "DeliveryLog_externalId_idx" ON "DeliveryLog"("externalId");
