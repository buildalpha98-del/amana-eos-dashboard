-- HR — Performance & disciplinary cases (2026-06-01)
--
-- Adds the `PerformanceCase` table for tracking warnings, PIPs,
-- grievances, allegations, commendations, and informal conversations
-- tied to a staff member. Closes the unfair-dismissal records gap
-- flagged in the HR compliance audit.
--
-- Retention is intentional via the `deleted` column (soft delete) —
-- Fair Work Act record-keeping requires 7 years for employee records.

-- Enums
CREATE TYPE "PerformanceCaseType" AS ENUM (
  'verbal_warning',
  'written_warning',
  'final_warning',
  'pip',
  'grievance',
  'allegation',
  'commendation',
  'conversation'
);

CREATE TYPE "PerformanceCaseStatus" AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'escalated',
  'closed'
);

-- Table
CREATE TABLE "PerformanceCase" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "raisedById"   TEXT NOT NULL,
  "closedById"   TEXT,
  "type"         "PerformanceCaseType" NOT NULL,
  "status"       "PerformanceCaseStatus" NOT NULL DEFAULT 'open',
  "title"        VARCHAR(200) NOT NULL,
  "summary"      TEXT NOT NULL,
  "occurredAt"   DATE NOT NULL,
  "followUpAt"   DATE,
  "outcome"      TEXT,
  "closedAt"     TIMESTAMP(3),
  "fileUrl"      TEXT,
  "fileName"     TEXT,
  "confidential" BOOLEAN NOT NULL DEFAULT false,
  "deleted"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PerformanceCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PerformanceCase_userId_status_idx"
  ON "PerformanceCase"("userId", "status");
CREATE INDEX "PerformanceCase_type_occurredAt_idx"
  ON "PerformanceCase"("type", "occurredAt");

ALTER TABLE "PerformanceCase"
  ADD CONSTRAINT "PerformanceCase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PerformanceCase"
  ADD CONSTRAINT "PerformanceCase_raisedById_fkey"
  FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "PerformanceCase"
  ADD CONSTRAINT "PerformanceCase_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
