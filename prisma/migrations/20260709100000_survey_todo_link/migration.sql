-- 2026-07-08: link a Todo back to the Survey that spawned it so the
-- response-submit endpoint can auto-complete the todo. Populated only
-- for survey-generated todos; every other todo has NULL here.

ALTER TABLE "Todo" ADD COLUMN IF NOT EXISTS "surveyId" TEXT;

ALTER TABLE "Todo"
  ADD CONSTRAINT "Todo_surveyId_fkey"
  FOREIGN KEY ("surveyId") REFERENCES "Survey"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Todo_surveyId_idx" ON "Todo"("surveyId");
