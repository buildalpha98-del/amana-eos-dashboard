-- Baseline migration for VapiCall.
--
-- The VapiCall table was originally created via `prisma db push` rather
-- than a tracked migration, which meant subsequent ALTER TABLE migrations
-- (20260419040000, 20260419050000, 20260419060000) referenced a table
-- that didn't exist in the shadow DB used by `prisma migrate dev`. This
-- caused a recurring P3006 failure (4 occurrences over 2026 H1, all
-- documented in the Neon migration recovery reference).
--
-- This migration backfills the original CREATE TABLE so the migration
-- chain is internally consistent. All statements use IF NOT EXISTS so
-- the migration is a no-op in environments where the table already
-- exists (production, dev DBs that were touched via `db push`).
--
-- Production deploy note: BEFORE the next `prisma migrate deploy` run,
-- mark this migration as applied:
--   npx prisma migrate resolve --applied 20260101000000_baseline_vapi_call
-- This prevents Prisma from attempting to re-create the table (which
-- the IF NOT EXISTS would silently no-op anyway, but resolving keeps
-- the _prisma_migrations table accurate).

CREATE TABLE IF NOT EXISTS "VapiCall" (
    "id" TEXT NOT NULL,
    "vapiCallId" TEXT,
    "callType" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'routine',
    "status" TEXT NOT NULL DEFAULT 'new',
    "assignedTo" TEXT,
    "parentName" TEXT,
    "parentPhone" TEXT,
    "parentEmail" TEXT,
    "childName" TEXT,
    "centreName" TEXT,
    "callDetails" JSONB,
    "transcript" TEXT,
    "recordingUrl" TEXT,
    "callDurationSeconds" INTEGER,
    "followUpEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "internalNotificationSent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "actionedAt" TIMESTAMP(3),
    "actionedBy" TEXT,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VapiCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VapiCall_vapiCallId_key" ON "VapiCall"("vapiCallId");
CREATE INDEX IF NOT EXISTS "VapiCall_status_callType_idx" ON "VapiCall"("status", "callType");
CREATE INDEX IF NOT EXISTS "VapiCall_centreName_calledAt_idx" ON "VapiCall"("centreName", "calledAt");
CREATE INDEX IF NOT EXISTS "VapiCall_urgency_status_idx" ON "VapiCall"("urgency", "status");
