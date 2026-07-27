-- 2026-07-28: flag Leadership (L10) meetings so the To-Do Review can
-- restrict itself to leadership-role attendees. Default false keeps every
-- existing meeting behaving exactly as before.
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "isLeadership" BOOLEAN NOT NULL DEFAULT false;
