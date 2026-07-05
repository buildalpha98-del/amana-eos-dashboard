-- 2026-07-05: AI morning briefing v1 + draft-first L10

-- Meeting: AI-prepared agenda draft
ALTER TABLE "Meeting" ADD COLUMN "aiAgendaDraft" JSONB;
ALTER TABLE "Meeting" ADD COLUMN "aiAgendaDraftAt" TIMESTAMP(3);

-- DailyBriefing
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "signals" JSONB,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyBriefing_userId_date_key" ON "DailyBriefing"("userId", "date");
CREATE INDEX "DailyBriefing_userId_date_idx" ON "DailyBriefing"("userId", "date");
CREATE INDEX "DailyBriefing_date_idx" ON "DailyBriefing"("date");

ALTER TABLE "DailyBriefing" ADD CONSTRAINT "DailyBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
