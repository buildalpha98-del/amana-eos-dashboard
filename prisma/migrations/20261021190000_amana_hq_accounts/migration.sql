-- Amana HQ — master accounts tracker in the dashboard (Daniel, 21 Oct 2026).
ALTER TABLE "BudgetItem" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "BudgetItem_externalRef_key" ON "BudgetItem"("externalRef");
CREATE TABLE "ServiceWeeklyAccounts" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "termWeek" TEXT,
    "bscBookings" INTEGER NOT NULL DEFAULT 0,
    "ascBookings" INTEGER NOT NULL DEFAULT 0,
    "bscRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ascRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "staffCost" DOUBLE PRECISION,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceWeeklyAccounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceWeeklyAccounts_serviceId_weekStart_key" ON "ServiceWeeklyAccounts"("serviceId", "weekStart");
CREATE INDEX "ServiceWeeklyAccounts_weekStart_idx" ON "ServiceWeeklyAccounts"("weekStart");
ALTER TABLE "ServiceWeeklyAccounts" ADD CONSTRAINT "ServiceWeeklyAccounts_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GroceryOrder" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "retailer" TEXT NOT NULL DEFAULT 'Woolworths',
    "orderNo" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "deliveryWindow" TEXT,
    "weekStart" DATE NOT NULL,
    "weeksCovered" INTEGER NOT NULL DEFAULT 1,
    "budget" DOUBLE PRECISION,
    "foodSpend" DOUBLE PRECISION NOT NULL,
    "totalPaid" DOUBLE PRECISION,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GroceryOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroceryOrder_serviceId_orderNo_key" ON "GroceryOrder"("serviceId", "orderNo");
CREATE INDEX "GroceryOrder_serviceId_weekStart_idx" ON "GroceryOrder"("serviceId", "weekStart");
ALTER TABLE "GroceryOrder" ADD CONSTRAINT "GroceryOrder_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "category" TEXT,
    "item" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'consumable',
    "qtyOnHand" DOUBLE PRECISION,
    "unit" TEXT,
    "reorderAt" DOUBLE PRECISION,
    "lastCounted" DATE,
    "lastReplaced" DATE,
    "timesReplacedThisYear" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockItem_serviceId_item_key" ON "StockItem"("serviceId", "item");
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProgramFeedbackWeek" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "termWeek" TEXT,
    "feedbackReceived" BOOLEAN NOT NULL DEFAULT false,
    "reflections" TEXT NOT NULL DEFAULT 'none',
    "kidsEnjoyed" TEXT,
    "didntWork" TEXT,
    "childrensIdeas" TEXT,
    "resourcesRequested" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgramFeedbackWeek_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgramFeedbackWeek_serviceId_weekStart_key" ON "ProgramFeedbackWeek"("serviceId", "weekStart");
ALTER TABLE "ProgramFeedbackWeek" ADD CONSTRAINT "ProgramFeedbackWeek_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
