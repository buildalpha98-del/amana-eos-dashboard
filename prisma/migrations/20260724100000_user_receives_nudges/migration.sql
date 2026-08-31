-- 2026-07-24: opt-in flag for cron/system nudges (overdue-todo, compliance,
-- meeting reminders, etc.). Default OFF for everyone; the recipient
-- resolver still auto-includes leadership roles + service inboxes.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "receivesNudges" BOOLEAN NOT NULL DEFAULT false;
