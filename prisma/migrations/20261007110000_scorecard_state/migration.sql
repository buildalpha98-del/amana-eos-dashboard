-- Scorecards belong to a state (2026-10-07): a State Manager (head_office)
-- whose User.state matches sees that state's scorecard without an invite.
ALTER TABLE "Scorecard" ADD COLUMN "state" TEXT;
CREATE INDEX "Scorecard_state_idx" ON "Scorecard"("state");

-- Backfill from the title for scorecards Daniel already made per state
-- ("NSW Scorecard", "VIC Scorecard"). Whole-word, case-insensitive; a title
-- naming two states is left alone rather than guessed.
UPDATE "Scorecard" s SET "state" = m.code
FROM (
  SELECT id, (array_agg(code))[1] AS code, count(*) AS n
  FROM "Scorecard",
       unnest(ARRAY['NSW','VIC','QLD','SA','WA','TAS','NT','ACT']) AS code
  WHERE title ~* ('\m' || code || '\M')
  GROUP BY id
) m
WHERE s.id = m.id AND m.n = 1 AND s."state" IS NULL;
