-- 2026-07-28: let a meeting target a specific Scorecard.
-- Nullable with no default: existing meetings stay NULL and fall back to
-- the legacy single scorecard, so this is a no-op for anything already
-- recorded. Intentionally NOT a foreign key — deleting a scorecard should
-- not cascade into deleting meeting history; the reader treats a dangling
-- id the same as NULL.
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "scorecardId" TEXT;
