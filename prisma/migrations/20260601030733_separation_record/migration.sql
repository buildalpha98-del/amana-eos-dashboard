-- HR — Separation record (2026-06-01)
--
-- Complements the existing StaffOffboarding checklist with a formal
-- legal-fact record of the departure. Closes the #6 HR audit finding.

CREATE TYPE "SeparationReason" AS ENUM (
  'resignation',
  'dismissal_capacity',
  'dismissal_misconduct',
  'redundancy',
  'end_of_contract',
  'mutual_separation',
  'retirement',
  'abandonment',
  'deceased',
  'other'
);

CREATE TABLE "SeparationRecord" (
  "id"                     TEXT NOT NULL,
  "userId"                 TEXT NOT NULL,
  "reason"                 "SeparationReason" NOT NULL,
  "reasonDetail"           TEXT,
  "noticeStartDate"        DATE,
  "lastWorkingDay"         DATE NOT NULL,
  "noticePeriodWeeks"      DOUBLE PRECISION,
  "finalPayProcessed"      BOOLEAN NOT NULL DEFAULT false,
  "finalPayProcessedAt"    TIMESTAMP(3),
  "finalPayNotes"          TEXT,
  "referenceLetterIssued"  BOOLEAN NOT NULL DEFAULT false,
  "referenceLetterUrl"     TEXT,
  "referenceNotes"         TEXT,
  "eligibleForRehire"      BOOLEAN NOT NULL DEFAULT true,
  "rehireNotes"            TEXT,
  "exitInterviewCompleted" BOOLEAN NOT NULL DEFAULT false,
  "exitInterviewNotes"     TEXT,
  "exitInterviewAt"        TIMESTAMP(3),
  "performanceCaseId"      TEXT,
  "recordedById"           TEXT NOT NULL,
  "deleted"                BOOLEAN NOT NULL DEFAULT false,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeparationRecord_pkey" PRIMARY KEY ("id")
);

-- One separation per user; re-hires get a new User row.
CREATE UNIQUE INDEX "SeparationRecord_userId_key"
  ON "SeparationRecord"("userId");
CREATE INDEX "SeparationRecord_reason_idx"
  ON "SeparationRecord"("reason");
CREATE INDEX "SeparationRecord_lastWorkingDay_idx"
  ON "SeparationRecord"("lastWorkingDay");

ALTER TABLE "SeparationRecord"
  ADD CONSTRAINT "SeparationRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeparationRecord"
  ADD CONSTRAINT "SeparationRecord_performanceCaseId_fkey"
  FOREIGN KEY ("performanceCaseId") REFERENCES "PerformanceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SeparationRecord"
  ADD CONSTRAINT "SeparationRecord_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
