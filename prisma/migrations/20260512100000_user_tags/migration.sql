-- Adds User.tags for /team filtering and admin-managed grouping
-- (e.g. "nsw", "lead-trainer", "weekend-only"). Always lowercased +
-- trimmed at the API layer so case variants don't dupe. Default empty
-- array so existing rows don't need a backfill.
--
-- A GIN index makes the array-contains query (`tags && '{nsw}'`) cheap
-- enough to drive the /team Tag filter and the cross-org distinct-tag
-- lookup without a sequential scan.

ALTER TABLE "User" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "User_tags_idx" ON "User" USING GIN ("tags");
