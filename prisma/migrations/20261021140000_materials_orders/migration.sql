-- Program materials orders (Daniel, 21 Oct 2026).
CREATE TABLE "MaterialsOrderRound" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "term" TEXT,
    "programStart" DATE,
    "programEnd" DATE,
    "repliesDueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialsOrderRound_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MaterialsOrderRound_key_key" ON "MaterialsOrderRound"("key");

CREATE TABLE "MaterialsOrderCentre" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "replyStatus" TEXT NOT NULL DEFAULT 'awaiting',
    "replyAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialsOrderCentre_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MaterialsOrderCentre_roundId_serviceId_key" ON "MaterialsOrderCentre"("roundId", "serviceId");

CREATE TABLE "MaterialsOrderLine" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "week" INTEGER,
    "item" TEXT NOT NULL,
    "qty" DOUBLE PRECISION,
    "unit" TEXT,
    "purpose" TEXT,
    "ifMissing" TEXT NOT NULL DEFAULT 'hq_order',
    "centreHasIt" TEXT,
    "action" TEXT NOT NULL DEFAULT 'awaiting_reply',
    "unitCost" DOUBLE PRECISION,
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialsOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MaterialsOrderLine_roundId_serviceId_ref_key" ON "MaterialsOrderLine"("roundId", "serviceId", "ref");
CREATE INDEX "MaterialsOrderLine_serviceId_idx" ON "MaterialsOrderLine"("serviceId");

CREATE TABLE "MaterialsCart" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "retailer" TEXT NOT NULL DEFAULT 'Kmart',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buyLocally" TEXT,
    "otherOrder" TEXT,
    "notes" TEXT,
    "checkedOutAt" TIMESTAMP(3),
    "budgetItemId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialsCart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MaterialsCart_roundId_serviceId_retailer_key" ON "MaterialsCart"("roundId", "serviceId", "retailer");
CREATE UNIQUE INDEX "MaterialsCart_budgetItemId_key" ON "MaterialsCart"("budgetItemId");

ALTER TABLE "MaterialsOrderCentre" ADD CONSTRAINT "MaterialsOrderCentre_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "MaterialsOrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialsOrderCentre" ADD CONSTRAINT "MaterialsOrderCentre_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialsOrderLine" ADD CONSTRAINT "MaterialsOrderLine_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "MaterialsOrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialsOrderLine" ADD CONSTRAINT "MaterialsOrderLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialsCart" ADD CONSTRAINT "MaterialsCart_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "MaterialsOrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialsCart" ADD CONSTRAINT "MaterialsCart_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
