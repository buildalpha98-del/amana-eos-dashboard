-- HR — Separation finalisation (2026-06-01)
--
-- Adds the columns needed to track when a separation was finalised,
-- by whom, and who (if anyone) inherited the leaver's open
-- Rocks/Issues/Todos. The actual orchestration happens in the
-- finalise endpoint inside a transaction.

ALTER TABLE "SeparationRecord"
  ADD COLUMN "finalisedAt"     TIMESTAMP(3),
  ADD COLUMN "finalisedById"   TEXT,
  ADD COLUMN "successorUserId" TEXT;

CREATE INDEX "SeparationRecord_finalisedAt_idx"
  ON "SeparationRecord"("finalisedAt");

ALTER TABLE "SeparationRecord"
  ADD CONSTRAINT "SeparationRecord_finalisedById_fkey"
  FOREIGN KEY ("finalisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
