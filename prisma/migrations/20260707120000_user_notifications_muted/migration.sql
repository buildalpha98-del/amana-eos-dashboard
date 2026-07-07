-- Master notification mute. When true the user gets no external pings
-- (email is suppressed via EmailSuppression, push subscriptions cleared);
-- in-app notifications are unaffected. Additive + safe — existing rows default false.
ALTER TABLE "User" ADD COLUMN "notificationsMuted" BOOLEAN NOT NULL DEFAULT false;

-- Sync the flag for anyone already manually muted before this column existed
-- (e.g. muted via the earlier mute-user-notifications CLI), so the admin UI
-- and self-serve switch reflect their real state. Emails are stored lower-cased.
UPDATE "User" SET "notificationsMuted" = true
WHERE lower("email") IN (
  SELECT "email" FROM "EmailSuppression" WHERE "reason" = 'manual_mute'
);
