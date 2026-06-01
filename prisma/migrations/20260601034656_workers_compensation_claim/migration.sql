-- HR — Workers Compensation claim record (2026-06-01)
--
-- Tracks WC claims lodged → decided → RTW → closed. Linked
-- optionally to IncidentRecord (some claims arise from
-- gradual-onset injuries with no single incident).

CREATE TYPE "WCClaimStatus" AS ENUM (
  'lodged',
  'under_review',
  'accepted',
  'declined',
  'on_hold',
  'closed',
  'reopened'
);

CREATE TABLE "WorkersCompensationClaim" (
  "id"                  TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "incidentId"          TEXT,
  "claimNumber"         TEXT,
  "insurerName"         TEXT,
  "insurerContact"      TEXT,
  "status"              "WCClaimStatus" NOT NULL DEFAULT 'lodged',
  "dateOfInjury"        DATE NOT NULL,
  "dateLodged"          DATE NOT NULL,
  "dateOfDecision"      DATE,
  "injuryDescription"   TEXT,
  "bodyPart"            TEXT,
  "mechanismOfInjury"   TEXT,
  "rtwPlanCreated"      BOOLEAN NOT NULL DEFAULT false,
  "rtwPlanUrl"          TEXT,
  "rtwStartDate"        DATE,
  "rtwFullCapacityDate" DATE,
  "currentRestrictions" TEXT,
  "weeklyPaymentActive" BOOLEAN NOT NULL DEFAULT false,
  "weeklyPaymentRate"   DOUBLE PRECISION,
  "medicalExpensesPaid" DOUBLE PRECISION,
  "notes"               TEXT,
  "closedAt"            TIMESTAMP(3),
  "closedById"          TEXT,
  "createdById"         TEXT NOT NULL,
  "deleted"             BOOLEAN NOT NULL DEFAULT false,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkersCompensationClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkersCompensationClaim_userId_status_idx"
  ON "WorkersCompensationClaim"("userId", "status");
CREATE INDEX "WorkersCompensationClaim_incidentId_idx"
  ON "WorkersCompensationClaim"("incidentId");
CREATE INDEX "WorkersCompensationClaim_status_dateLodged_idx"
  ON "WorkersCompensationClaim"("status", "dateLodged");

ALTER TABLE "WorkersCompensationClaim"
  ADD CONSTRAINT "WorkersCompensationClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkersCompensationClaim"
  ADD CONSTRAINT "WorkersCompensationClaim_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "IncidentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkersCompensationClaim"
  ADD CONSTRAINT "WorkersCompensationClaim_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkersCompensationClaim"
  ADD CONSTRAINT "WorkersCompensationClaim_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
