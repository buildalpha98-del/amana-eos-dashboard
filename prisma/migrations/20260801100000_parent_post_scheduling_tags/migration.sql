-- Scheduling + curriculum tagging on ParentPost.
--
-- Additive and IF NOT EXISTS so a re-run is a no-op. `status` defaults to
-- 'published' on purpose: every post that already exists is live, and any
-- other default would hide them all the moment this deploys.
ALTER TABLE "ParentPost" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'published';
ALTER TABLE "ParentPost" ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMP(3);
ALTER TABLE "ParentPost" ADD COLUMN IF NOT EXISTS "mtopOutcomes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ParentPost" ADD COLUMN IF NOT EXISTS "nqsAreas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ParentPost" ADD COLUMN IF NOT EXISTS "programActivityIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Scheduled posts are read by "publishAt <= now", so that predicate needs
-- an index once there are more than a handful.
CREATE INDEX IF NOT EXISTS "ParentPost_status_publishAt_idx" ON "ParentPost"("status", "publishAt");
