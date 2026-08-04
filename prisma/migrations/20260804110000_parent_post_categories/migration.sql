-- Family-facing post categories, added alongside the originals. Existing
-- posts keep their current value; nothing is renamed or backfilled.
-- IF NOT EXISTS so a re-run is a no-op.
ALTER TYPE "ParentPostType" ADD VALUE IF NOT EXISTS 'programme';
ALTER TYPE "ParentPostType" ADD VALUE IF NOT EXISTS 'food';
ALTER TYPE "ParentPostType" ADD VALUE IF NOT EXISTS 'celebration';
