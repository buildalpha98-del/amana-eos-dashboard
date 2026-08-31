-- CreateTable
CREATE TABLE "CreativeRequestSatisfaction" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "positive" BOOLEAN NOT NULL,
    "comment" TEXT,
    "ratedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeRequestSatisfaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSendRecipient" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "deliveryLogId" TEXT,
    "contactId" TEXT,
    "source" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingSendRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreativeRequestSatisfaction_requestId_key" ON "CreativeRequestSatisfaction"("requestId");

-- CreateIndex
CREATE INDEX "CreativeRequestSatisfaction_createdAt_idx" ON "CreativeRequestSatisfaction"("createdAt");

-- CreateIndex
CREATE INDEX "MarketingSendRecipient_email_sentAt_idx" ON "MarketingSendRecipient"("email", "sentAt");

-- CreateIndex
CREATE INDEX "MarketingSendRecipient_deliveryLogId_idx" ON "MarketingSendRecipient"("deliveryLogId");

-- CreateIndex
CREATE INDEX "MarketingSendRecipient_sentAt_idx" ON "MarketingSendRecipient"("sentAt");

-- AddForeignKey
ALTER TABLE "CreativeRequestSatisfaction" ADD CONSTRAINT "CreativeRequestSatisfaction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CreativeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequestSatisfaction" ADD CONSTRAINT "CreativeRequestSatisfaction_ratedById_fkey" FOREIGN KEY ("ratedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

