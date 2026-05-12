-- Scorecard overhaul Stage 1 — per-scorecard ownership + membership.
-- Foundation for Issue 4 of the 2026-05-12 user feedback (scorecards
-- become first-class entities, multiple coexist, owners control
-- membership).
--
-- Sequence:
--   1. Add Scorecard.ownerId nullable so we can backfill safely.
--   2. Backfill every existing scorecard to the first owner-role user
--      (ordered by createdAt so we always pick the same one — Jayden's
--      account in production).
--   3. Lock down: NOT NULL + FK constraint.
--   4. Create the ScorecardMember join table.
--
-- The backfill assumes at least one User with role='owner' exists.
-- That invariant is enforced by the dev seed and is guaranteed in
-- production (Jayden's hardcoded user id in onboarding-seed.ts).

-- Step 1
ALTER TABLE "Scorecard" ADD COLUMN "ownerId" TEXT;

-- Step 2 — backfill
UPDATE "Scorecard"
SET "ownerId" = (
  SELECT "id"
  FROM "User"
  WHERE "role" = 'owner'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "ownerId" IS NULL;

-- Step 3 — lock down. Fails loudly if any row still has NULL ownerId
-- (which would only happen on a brand-new DB with no owner users, in
-- which case there are no Scorecard rows either).
ALTER TABLE "Scorecard" ALTER COLUMN "ownerId" SET NOT NULL;

ALTER TABLE "Scorecard"
  ADD CONSTRAINT "Scorecard_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Scorecard_ownerId_idx" ON "Scorecard"("ownerId");

-- Step 4 — ScorecardMember join table
CREATE TABLE "ScorecardMember" (
  "id"          TEXT NOT NULL,
  "scorecardId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "addedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScorecardMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScorecardMember_scorecardId_userId_key"
  ON "ScorecardMember"("scorecardId", "userId");
CREATE INDEX "ScorecardMember_userId_idx" ON "ScorecardMember"("userId");
CREATE INDEX "ScorecardMember_scorecardId_idx" ON "ScorecardMember"("scorecardId");

ALTER TABLE "ScorecardMember"
  ADD CONSTRAINT "ScorecardMember_scorecardId_fkey"
  FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScorecardMember"
  ADD CONSTRAINT "ScorecardMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
