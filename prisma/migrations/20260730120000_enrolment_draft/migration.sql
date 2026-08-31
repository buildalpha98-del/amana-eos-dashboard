-- 2026-07-30: per-account enrolment draft (Phase 2).
-- Additive. Kept separate from EnrolmentSubmission so half-filled forms
-- never surface in the staff enrolment queue.
CREATE TABLE IF NOT EXISTS "EnrolmentDraft" (
  "id"          TEXT PRIMARY KEY,
  "accountId"   TEXT NOT NULL,
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "data"        JSONB NOT NULL DEFAULT '{}',
  "submittedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrolmentDraft_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "ParentAccount"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EnrolmentDraft_accountId_key" ON "EnrolmentDraft"("accountId");
