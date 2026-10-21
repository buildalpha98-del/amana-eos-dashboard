-- Budget bank (Daniel, 21 Oct 2026).
ALTER TABLE "BudgetItem" ADD COLUMN "fundedFromBank" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "BudgetBankEntry" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "budget" TEXT NOT NULL DEFAULT 'purchases',
    "month" DATE,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "budgetItemId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetBankEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BudgetBankEntry_budgetItemId_key" ON "BudgetBankEntry"("budgetItemId");
CREATE UNIQUE INDEX "BudgetBankEntry_serviceId_kind_budget_month_key" ON "BudgetBankEntry"("serviceId", "kind", "budget", "month");
CREATE INDEX "BudgetBankEntry_serviceId_createdAt_idx" ON "BudgetBankEntry"("serviceId", "createdAt");
ALTER TABLE "BudgetBankEntry" ADD CONSTRAINT "BudgetBankEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
