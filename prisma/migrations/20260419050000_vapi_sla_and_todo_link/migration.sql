-- Add SLA tracking + linked-todo fields to VapiCall
ALTER TABLE "VapiCall" ADD COLUMN "slaAlertedAt" TIMESTAMP(3);
ALTER TABLE "VapiCall" ADD COLUMN "linkedTodoId" TEXT;

CREATE UNIQUE INDEX "VapiCall_linkedTodoId_key" ON "VapiCall"("linkedTodoId");

ALTER TABLE "VapiCall" ADD CONSTRAINT "VapiCall_linkedTodoId_fkey"
  FOREIGN KEY ("linkedTodoId") REFERENCES "Todo"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
