-- HR — Reasonable adjustment record (2026-06-01)
--
-- DDA 1992 + Fair Work anti-discrimination defence. The legal test
-- for refusing accommodation is "unjustifiable hardship" — the
-- evidence required to defend that is what this table captures.

CREATE TYPE "ReasonableAdjustmentStatus" AS ENUM (
  'under_assessment',
  'provided',
  'modified',
  'declined',
  'withdrawn',
  'no_longer_needed'
);

CREATE TABLE "ReasonableAdjustment" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "requestedAt"     DATE NOT NULL,
  "requestSummary"  TEXT NOT NULL,
  "contextNotes"    TEXT,
  "assessedAt"      DATE,
  "assessmentNotes" TEXT,
  "status"          "ReasonableAdjustmentStatus" NOT NULL DEFAULT 'under_assessment',
  "decisionAt"      DATE,
  "decisionDetail"  TEXT,
  "declineReasons"  TEXT,
  "reviewAt"        DATE,
  "fileUrl"         TEXT,
  "fileName"        TEXT,
  "recordedById"    TEXT NOT NULL,
  "deleted"         BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReasonableAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReasonableAdjustment_userId_status_idx"
  ON "ReasonableAdjustment"("userId", "status");
CREATE INDEX "ReasonableAdjustment_reviewAt_idx"
  ON "ReasonableAdjustment"("reviewAt");

ALTER TABLE "ReasonableAdjustment"
  ADD CONSTRAINT "ReasonableAdjustment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReasonableAdjustment"
  ADD CONSTRAINT "ReasonableAdjustment_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
