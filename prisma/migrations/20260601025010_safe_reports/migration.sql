-- HR — Anonymous safe-reporting channel (2026-06-01)
--
-- Closes the positive-duty obligation under the Sex Discrimination
-- and Fair Work (Respect at Work) Amendment Act 2022. Reports are
-- intentionally anonymous: no reporterId column exists. The intake
-- endpoint ignores the session even when present.

CREATE TYPE "SafeReportCategory" AS ENUM (
  'harassment',
  'discrimination',
  'bullying',
  'safety',
  'conduct',
  'retaliation',
  'child_safety',
  'other'
);

CREATE TYPE "SafeReportStatus" AS ENUM (
  'received',
  'under_review',
  'resolved',
  'closed_no_action'
);

CREATE TABLE "SafeReport" (
  "id"           TEXT NOT NULL,
  "category"     "SafeReportCategory" NOT NULL,
  "serviceId"    TEXT,
  "content"      TEXT NOT NULL,
  "status"       "SafeReportStatus" NOT NULL DEFAULT 'received',
  "reviewNotes"  TEXT,
  "reviewedById" TEXT,
  "resolvedAt"   TIMESTAMP(3),
  "deleted"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SafeReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SafeReport_status_createdAt_idx"
  ON "SafeReport"("status", "createdAt");
CREATE INDEX "SafeReport_category_createdAt_idx"
  ON "SafeReport"("category", "createdAt");

ALTER TABLE "SafeReport"
  ADD CONSTRAINT "SafeReport_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SafeReport"
  ADD CONSTRAINT "SafeReport_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
