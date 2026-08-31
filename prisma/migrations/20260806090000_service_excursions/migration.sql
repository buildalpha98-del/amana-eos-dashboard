-- Excursions and incursions as first-class records, holding the risk
-- assessment (Reg 101) and its review alongside the permission form.
-- Additive only: a new table plus nullable FKs, so deploying it changes
-- nothing until someone creates an excursion.
CREATE TABLE IF NOT EXISTS "ServiceExcursion" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'excursion',
  "title" TEXT NOT NULL,
  "destination" TEXT,
  "date" DATE NOT NULL,
  "sessionType" "SessionType",
  "departTime" TEXT,
  "returnTime" TEXT,
  "transport" TEXT,
  "notes" TEXT,
  "riskAssessmentUrl" TEXT,
  "riskAssessmentFileName" TEXT,
  "riskAssessmentReviewedAt" TIMESTAMP(3),
  "riskAssessmentReviewedById" TEXT,
  "formId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceExcursion_pkey" PRIMARY KEY ("id")
);

-- One excursion per permission form: the form is created for this outing
-- and reusing it for a second would merge two sets of signatures.
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceExcursion_formId_key"
  ON "ServiceExcursion"("formId");
CREATE INDEX IF NOT EXISTS "ServiceExcursion_serviceId_date_idx"
  ON "ServiceExcursion"("serviceId", "date");
CREATE INDEX IF NOT EXISTS "ServiceExcursion_serviceId_status_idx"
  ON "ServiceExcursion"("serviceId", "status");

DO $$ BEGIN
  ALTER TABLE "ServiceExcursion" ADD CONSTRAINT "ServiceExcursion_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SetNull, not Cascade: archiving or deleting the permission form must
-- never take the excursion record (and its risk assessment) with it.
DO $$ BEGIN
  ALTER TABLE "ServiceExcursion" ADD CONSTRAINT "ServiceExcursion_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "ParentForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ServiceExcursion" ADD CONSTRAINT "ServiceExcursion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ServiceExcursion" ADD CONSTRAINT "ServiceExcursion_riskAssessmentReviewedById_fkey"
    FOREIGN KEY ("riskAssessmentReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
