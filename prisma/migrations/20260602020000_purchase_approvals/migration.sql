-- Service purchase approvals (2026-06-02)
--
-- Staff at a centre request approval BEFORE buying something with
-- personal funds. Admin reviews from Service → Finance → Approvals.
-- On approval staff is instructed to submit an expense claim through
-- My Portal (EH Payroll).

CREATE TYPE "PurchaseApprovalStatus" AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

CREATE TABLE "PurchaseApproval" (
  "id"            TEXT NOT NULL,
  "serviceId"     TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "vendor"        VARCHAR(200) NOT NULL,
  "product"       VARCHAR(500) NOT NULL,
  "costCents"     INTEGER NOT NULL,
  "reason"        TEXT,
  "status"        "PurchaseApprovalStatus" NOT NULL DEFAULT 'pending',
  "decidedById"   TEXT,
  "decidedAt"     TIMESTAMP(3),
  "decisionNote"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseApproval_serviceId_status_idx"
  ON "PurchaseApproval"("serviceId", "status");
CREATE INDEX "PurchaseApproval_requestedById_status_idx"
  ON "PurchaseApproval"("requestedById", "status");
CREATE INDEX "PurchaseApproval_status_createdAt_idx"
  ON "PurchaseApproval"("status", "createdAt");

ALTER TABLE "PurchaseApproval"
  ADD CONSTRAINT "PurchaseApproval_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseApproval"
  ADD CONSTRAINT "PurchaseApproval_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseApproval"
  ADD CONSTRAINT "PurchaseApproval_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
