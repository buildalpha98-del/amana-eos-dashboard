-- Nurture cutover: retire the legacy ParentNurtureStep sender in favour of the
-- DB-defined Sequence system, and add a retry cap to sequence executions.

-- 1. Retry tracking so permanently-failing sends stop being re-attempted forever.
ALTER TABLE "SequenceStepExecution" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- 2. Cancel any outstanding legacy steps. The scheduler no longer creates these
--    and the cron no longer sends them; cancelling prevents them lingering as
--    permanently-"pending" rows and guarantees no double-send during the
--    transition. Already-sent rows are left untouched for history.
UPDATE "ParentNurtureStep" SET "status" = 'cancelled' WHERE "status" IN ('pending', 'sending');
