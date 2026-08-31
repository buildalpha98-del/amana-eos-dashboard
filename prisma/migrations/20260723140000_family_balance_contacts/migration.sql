-- 2026-07-23: Family balance contact log — tracks parent contact
-- attempts (call/email/SMS) for outstanding balances. Auto-generates
-- a follow-up Todo when outcome=no_answer.

CREATE TYPE "FamilyContactMethod" AS ENUM ('email', 'phone', 'sms', 'in_person');

CREATE TYPE "FamilyContactOutcome" AS ENUM (
  'answered',
  'no_answer',
  'promised_payment',
  'disputed',
  'payment_plan',
  'other'
);

CREATE TABLE "FamilyBalanceContact" (
  "id"             TEXT NOT NULL,
  "accountName"    TEXT NOT NULL,
  "parentName"     TEXT NOT NULL,
  "mobileNumber"   TEXT,
  "amountOwing"    DECIMAL(10,2) NOT NULL,
  "contactedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contactMethod"  "FamilyContactMethod" NOT NULL,
  "outcome"        "FamilyContactOutcome" NOT NULL,
  "outcomeNotes"   TEXT,
  "followUpDate"   TIMESTAMP(3),
  "followUpTodoId" TEXT,
  "serviceId"      TEXT,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FamilyBalanceContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FamilyBalanceContact_followUpTodoId_key"
  ON "FamilyBalanceContact"("followUpTodoId");
CREATE INDEX "FamilyBalanceContact_serviceId_idx"
  ON "FamilyBalanceContact"("serviceId");
CREATE INDEX "FamilyBalanceContact_contactedAt_idx"
  ON "FamilyBalanceContact"("contactedAt");
CREATE INDEX "FamilyBalanceContact_outcome_idx"
  ON "FamilyBalanceContact"("outcome");
CREATE INDEX "FamilyBalanceContact_createdById_idx"
  ON "FamilyBalanceContact"("createdById");

ALTER TABLE "FamilyBalanceContact"
  ADD CONSTRAINT "FamilyBalanceContact_followUpTodoId_fkey"
  FOREIGN KEY ("followUpTodoId") REFERENCES "Todo"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FamilyBalanceContact"
  ADD CONSTRAINT "FamilyBalanceContact_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FamilyBalanceContact"
  ADD CONSTRAINT "FamilyBalanceContact_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
