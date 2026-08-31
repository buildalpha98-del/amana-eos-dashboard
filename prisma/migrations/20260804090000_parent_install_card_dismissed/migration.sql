-- "Add Amana to your phone" dismissal, stored against the account rather
-- than localStorage so it doesn't reappear on the family's other devices.
-- Additive and idempotent: NULL means "not dismissed yet".
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "appInstallCardDismissedAt" TIMESTAMP(3);
