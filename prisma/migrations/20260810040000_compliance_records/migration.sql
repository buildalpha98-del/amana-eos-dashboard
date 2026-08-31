-- Three regulatory records the dashboard could not hold.
--
-- 1. Regulation 87 — the incident, injury, trauma and illness record.
--    IncidentRecord was a trend-analysis table: enough to count injuries by
--    location, nowhere near the entries Reg 87(2) prescribes by name. The
--    columns below close it, including WHO was notified and WHEN, because
--    Reg 86 gives 24 hours from becoming aware and a bare boolean can't
--    prove that was met.
-- 2. Regulation 90 — the three plans a child with a medical condition must
--    have. Previously a string in an array and a boolean.
-- 3. Reg 168(2)(o) / s.174(2)(b) — the complaints register, and the
--    24-hour clock to notify the Regulatory Authority.
--
-- Entirely additive: new nullable columns and two new tables. Nothing
-- existing changes behaviour until a service starts using them.

-- ── Reg 87/86: IncidentRecord ─────────────────────────────────────────
ALTER TABLE "IncidentRecord"
  ADD COLUMN "childId" TEXT,
  ADD COLUMN "childAge" INTEGER,
  ADD COLUMN "circumstances" TEXT,
  ADD COLUMN "firstAidGiven" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "firstAidBy" TEXT,
  ADD COLUMN "firstAidDetails" TEXT,
  ADD COLUMN "medicalPersonnelContacted" TEXT,
  ADD COLUMN "ambulanceCalled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "witnesses" TEXT,
  ADD COLUMN "parentNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "parentNotifiedName" TEXT,
  ADD COLUMN "parentNotifiedMethod" TEXT,
  ADD COLUMN "parentNotifiedById" TEXT,
  ADD COLUMN "sharedWithParentAt" TIMESTAMP(3),
  ADD COLUMN "sharedById" TEXT,
  ADD COLUMN "parentAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "parentAcknowledgedName" TEXT,
  ADD COLUMN "parentAcknowledgedEmail" TEXT,
  ADD COLUMN "seriousIncidentCategory" TEXT,
  ADD COLUMN "becameAwareAt" TIMESTAMP(3),
  ADD COLUMN "authorityReference" TEXT,
  ADD COLUMN "recordedSignature" TEXT;

-- The parent portal's only query: this child's shared records, newest first.
CREATE INDEX "IncidentRecord_childId_sharedWithParentAt_idx"
  ON "IncidentRecord"("childId", "sharedWithParentAt");
-- Drives the outstanding-Reg-176-lodgement surface.
CREATE INDEX "IncidentRecord_serviceId_reportable_reported_idx"
  ON "IncidentRecord"("serviceId", "reportableToAuthority", "reportedToAuthorityAt");

-- SET NULL throughout: a record must outlive the child leaving and the
-- account of whoever wrote it.
ALTER TABLE "IncidentRecord" ADD CONSTRAINT "IncidentRecord_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentRecord" ADD CONSTRAINT "IncidentRecord_parentNotifiedById_fkey"
  FOREIGN KEY ("parentNotifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentRecord" ADD CONSTRAINT "IncidentRecord_sharedById_fkey"
  FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Reg 90: ChildMedicalPlan ──────────────────────────────────────────
-- One row per CONDITION, not per child: a child with asthma and a nut
-- allergy has two management plans from two practitioners and two very
-- different emergency responses.
CREATE TABLE "ChildMedicalPlan" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "serviceId" TEXT,
    "conditionType" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'moderate',
    "managementPlanUrl" TEXT,
    "managementPlanFileName" TEXT,
    "practitionerName" TEXT,
    "planIssuedDate" DATE,
    "planExpiryDate" DATE,
    "riskMinimisationPlan" TEXT NOT NULL,
    "developedWithParentAt" TIMESTAMP(3),
    "communicationPlan" TEXT NOT NULL,
    "emergencyResponse" TEXT,
    "medicationRequired" BOOLEAN NOT NULL DEFAULT false,
    "medicationDetails" TEXT,
    "medicationLocation" TEXT,
    "parentAcknowledgedAt" TIMESTAMP(3),
    "parentAcknowledgedName" TEXT,
    "parentAcknowledgedEmail" TEXT,
    "reviewDueAt" DATE,
    "lastReviewedAt" TIMESTAMP(3),
    "lastReviewedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildMedicalPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChildMedicalPlan_childId_status_idx" ON "ChildMedicalPlan"("childId", "status");
CREATE INDEX "ChildMedicalPlan_serviceId_status_idx" ON "ChildMedicalPlan"("serviceId", "status");
-- The two expiry sweeps: past the practitioner's review date, and past ours.
CREATE INDEX "ChildMedicalPlan_serviceId_planExpiryDate_idx" ON "ChildMedicalPlan"("serviceId", "planExpiryDate");
CREATE INDEX "ChildMedicalPlan_serviceId_reviewDueAt_idx" ON "ChildMedicalPlan"("serviceId", "reviewDueAt");

ALTER TABLE "ChildMedicalPlan" ADD CONSTRAINT "ChildMedicalPlan_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildMedicalPlan" ADD CONSTRAINT "ChildMedicalPlan_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChildMedicalPlan" ADD CONSTRAINT "ChildMedicalPlan_lastReviewedById_fkey"
  FOREIGN KEY ("lastReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChildMedicalPlan" ADD CONSTRAINT "ChildMedicalPlan_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Reg 168(2)(o) / s.174(2)(b): ComplaintRecord ──────────────────────
-- notificationDueAt is stamped from becameAwareAt at write time rather than
-- computed on read, so an overdue notification stays overdue in the
-- register even if someone later edits the awareness date.
CREATE TABLE "ComplaintRecord" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'in_person',
    "complainantName" TEXT,
    "complainantEmail" TEXT,
    "complainantPhone" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "childId" TEXT,
    "childName" TEXT,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "notifiable" BOOLEAN NOT NULL DEFAULT false,
    "notifiableReason" TEXT,
    "becameAwareAt" TIMESTAMP(3),
    "notificationDueAt" TIMESTAMP(3),
    "regulatorNotifiedAt" TIMESTAMP(3),
    "regulatorReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "assignedToId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "investigationNotes" TEXT,
    "outcome" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "parentVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComplaintRecord_reference_key" ON "ComplaintRecord"("reference");
CREATE INDEX "ComplaintRecord_serviceId_status_idx" ON "ComplaintRecord"("serviceId", "status");
CREATE INDEX "ComplaintRecord_serviceId_receivedAt_idx" ON "ComplaintRecord"("serviceId", "receivedAt");
-- The overdue-notification sweep.
CREATE INDEX "ComplaintRecord_notifiable_regulatorNotifiedAt_idx" ON "ComplaintRecord"("notifiable", "regulatorNotifiedAt");
CREATE INDEX "ComplaintRecord_complainantEmail_parentVisible_idx" ON "ComplaintRecord"("complainantEmail", "parentVisible");

ALTER TABLE "ComplaintRecord" ADD CONSTRAINT "ComplaintRecord_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplaintRecord" ADD CONSTRAINT "ComplaintRecord_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplaintRecord" ADD CONSTRAINT "ComplaintRecord_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplaintRecord" ADD CONSTRAINT "ComplaintRecord_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplaintRecord" ADD CONSTRAINT "ComplaintRecord_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
