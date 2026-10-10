-- CreateEnum
CREATE TYPE "StatementDeliveryStatus" AS ENUM ('pending', 'processing', 'failed', 'sent', 'blocked', 'needs_review', 'cancelled');

-- CreateTable
CREATE TABLE "StatementDelivery" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "status" "StatementDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "emailPayload" TEXT,
    "firstSendStartedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastErrorCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatementDelivery_statementId_key" ON "StatementDelivery"("statementId");

-- CreateIndex
CREATE INDEX "StatementDelivery_status_nextAttemptAt_idx" ON "StatementDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StatementDelivery_status_leaseExpiresAt_idx" ON "StatementDelivery"("status", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "StatementDelivery" ADD CONSTRAINT "StatementDelivery_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

