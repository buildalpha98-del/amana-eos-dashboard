-- HR — Performance reviews (2026-06-01)
--
-- Adds `PerformanceReview` + `PerformanceReviewGoal` tables for the
-- formal review cycle workflow (probation, mid-year, annual, ad-hoc).
-- Distinct from PerformanceCase, which is the disciplinary record.
--
-- Phase 1 ships schema + admin shell. Self-assessment + acknowledgement
-- columns are present from the start so phase 2 is API/UI only — no
-- second migration. Soft delete (`deleted`) for 7-year Fair Work
-- record-keeping retention.

-- Enums
CREATE TYPE "ReviewType" AS ENUM (
  'probation',
  'mid_year',
  'annual',
  'ad_hoc'
);

CREATE TYPE "ReviewStatus" AS ENUM (
  'scheduled',
  'self_assessment',
  'manager_review',
  'awaiting_acknowledgement',
  'completed',
  'cancelled'
);

CREATE TYPE "ReviewRating" AS ENUM (
  'below_expectations',
  'partially_meeting',
  'meeting_expectations',
  'exceeding_expectations',
  'exceptional'
);

CREATE TYPE "ReviewGoalStatus" AS ENUM (
  'not_started',
  'in_progress',
  'achieved',
  'not_achieved',
  'deferred'
);

-- PerformanceReview
CREATE TABLE "PerformanceReview" (
  "id"                   TEXT NOT NULL,
  "userId"               TEXT NOT NULL,
  "reviewerUserId"       TEXT,
  "createdById"          TEXT NOT NULL,
  "type"                 "ReviewType" NOT NULL,
  "status"               "ReviewStatus" NOT NULL DEFAULT 'scheduled',
  "periodStart"          DATE NOT NULL,
  "periodEnd"            DATE NOT NULL,
  "dueDate"              DATE NOT NULL,
  "selfAssessment"       TEXT,
  "selfStrengths"        TEXT,
  "selfImprovements"     TEXT,
  "selfSubmittedAt"      TIMESTAMP(3),
  "managerAssessment"    TEXT,
  "managerStrengths"     TEXT,
  "managerImprovements"  TEXT,
  "managerSubmittedAt"   TIMESTAMP(3),
  "overallRating"        "ReviewRating",
  "acknowledgedAt"       TIMESTAMP(3),
  "acknowledgementNotes" TEXT,
  "privateNotes"         TEXT,
  "completedAt"          TIMESTAMP(3),
  "deleted"              BOOLEAN NOT NULL DEFAULT false,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PerformanceReview_userId_status_idx"
  ON "PerformanceReview"("userId", "status");
CREATE INDEX "PerformanceReview_reviewerUserId_status_idx"
  ON "PerformanceReview"("reviewerUserId", "status");
CREATE INDEX "PerformanceReview_dueDate_idx"
  ON "PerformanceReview"("dueDate");
CREATE INDEX "PerformanceReview_type_periodEnd_idx"
  ON "PerformanceReview"("type", "periodEnd");

ALTER TABLE "PerformanceReview"
  ADD CONSTRAINT "PerformanceReview_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PerformanceReview"
  ADD CONSTRAINT "PerformanceReview_reviewerUserId_fkey"
  FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PerformanceReview"
  ADD CONSTRAINT "PerformanceReview_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- PerformanceReviewGoal
CREATE TABLE "PerformanceReviewGoal" (
  "id"            TEXT NOT NULL,
  "reviewId"      TEXT NOT NULL,
  "title"         VARCHAR(200) NOT NULL,
  "description"   TEXT,
  "dueDate"       DATE,
  "status"        "ReviewGoalStatus" NOT NULL DEFAULT 'not_started',
  "progressNotes" TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PerformanceReviewGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PerformanceReviewGoal_reviewId_sortOrder_idx"
  ON "PerformanceReviewGoal"("reviewId", "sortOrder");

ALTER TABLE "PerformanceReviewGoal"
  ADD CONSTRAINT "PerformanceReviewGoal_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
