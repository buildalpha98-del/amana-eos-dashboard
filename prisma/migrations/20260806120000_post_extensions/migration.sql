-- The planning cycle: a post can extend an earlier one.
-- Additive and nullable, so every existing post is simply "not a
-- follow-up" and nothing changes until someone extends something.
ALTER TABLE "ParentPost" ADD COLUMN IF NOT EXISTS "extendsPostId" TEXT;

CREATE INDEX IF NOT EXISTS "ParentPost_extendsPostId_idx"
  ON "ParentPost"("extendsPostId");

-- SetNull, not Cascade: deleting an observation must not delete the
-- follow-ups that came out of it. The thread loses its head; the work
-- it led to survives.
DO $$ BEGIN
  ALTER TABLE "ParentPost" ADD CONSTRAINT "ParentPost_extendsPostId_fkey"
    FOREIGN KEY ("extendsPostId") REFERENCES "ParentPost"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
