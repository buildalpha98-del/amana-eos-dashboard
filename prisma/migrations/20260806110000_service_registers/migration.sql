-- Three registers an OSHC service is asked for and had nowhere to keep:
-- visitors on the premises, staff injuries, and illness / infectious
-- disease with the family notification attached.
-- Additive: new tables only, inert until first use.

CREATE TABLE IF NOT EXISTS "ServiceVisitor" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "organisation" TEXT,
  "purpose" TEXT,
  "visitingWhom" TEXT,
  "phone" TEXT,
  "signedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signedOutAt" TIMESTAMP(3),
  "wwccSighted" BOOLEAN NOT NULL DEFAULT false,
  "wwccNumber" TEXT,
  "notes" TEXT,
  "recordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceVisitor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceVisitor_serviceId_signedInAt_idx" ON "ServiceVisitor"("serviceId", "signedInAt");
CREATE INDEX IF NOT EXISTS "ServiceVisitor_serviceId_signedOutAt_idx" ON "ServiceVisitor"("serviceId", "signedOutAt");

CREATE TABLE IF NOT EXISTS "StaffIncidentReport" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "userId" TEXT,
  "staffName" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "incidentType" TEXT NOT NULL DEFAULT 'injury',
  "severity" TEXT NOT NULL DEFAULT 'minor',
  "location" TEXT,
  "description" TEXT NOT NULL,
  "bodyPart" TEXT,
  "treatment" TEXT,
  "witnessNames" TEXT,
  "reportableToAuthority" BOOLEAN NOT NULL DEFAULT false,
  "reportedToAuthorityAt" TIMESTAMP(3),
  "workersCompClaim" BOOLEAN NOT NULL DEFAULT false,
  "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
  "followUpCompleted" BOOLEAN NOT NULL DEFAULT false,
  "followUpNotes" TEXT,
  "reportedById" TEXT,
  "signedOffAt" TIMESTAMP(3),
  "signedOffById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffIncidentReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StaffIncidentReport_serviceId_occurredAt_idx" ON "StaffIncidentReport"("serviceId", "occurredAt");
CREATE INDEX IF NOT EXISTS "StaffIncidentReport_serviceId_severity_idx" ON "StaffIncidentReport"("serviceId", "severity");

CREATE TABLE IF NOT EXISTS "IllnessRecord" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "childId" TEXT,
  "personName" TEXT NOT NULL,
  "personType" TEXT NOT NULL DEFAULT 'child',
  "illness" TEXT NOT NULL,
  "infectious" BOOLEAN NOT NULL DEFAULT false,
  "onsetDate" DATE NOT NULL,
  "excludedFrom" DATE,
  "returnDate" DATE,
  "symptoms" TEXT,
  "actionTaken" TEXT,
  "familiesNotifiedAt" TIMESTAMP(3),
  "notifiedById" TEXT,
  "authorityNotifiedAt" TIMESTAMP(3),
  "notes" TEXT,
  "recordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IllnessRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IllnessRecord_serviceId_onsetDate_idx" ON "IllnessRecord"("serviceId", "onsetDate");
CREATE INDEX IF NOT EXISTS "IllnessRecord_serviceId_infectious_idx" ON "IllnessRecord"("serviceId", "infectious");

-- Service cascades (the register belongs to the service); every person
-- reference is SetNull so a departing staff member or child never
-- deletes the record of what happened.
DO $$ BEGIN
  ALTER TABLE "ServiceVisitor" ADD CONSTRAINT "ServiceVisitor_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ServiceVisitor" ADD CONSTRAINT "ServiceVisitor_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StaffIncidentReport" ADD CONSTRAINT "StaffIncidentReport_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StaffIncidentReport" ADD CONSTRAINT "StaffIncidentReport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StaffIncidentReport" ADD CONSTRAINT "StaffIncidentReport_reportedById_fkey"
    FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StaffIncidentReport" ADD CONSTRAINT "StaffIncidentReport_signedOffById_fkey"
    FOREIGN KEY ("signedOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "IllnessRecord" ADD CONSTRAINT "IllnessRecord_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "IllnessRecord" ADD CONSTRAINT "IllnessRecord_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "IllnessRecord" ADD CONSTRAINT "IllnessRecord_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "IllnessRecord" ADD CONSTRAINT "IllnessRecord_notifiedById_fkey"
    FOREIGN KEY ("notifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
