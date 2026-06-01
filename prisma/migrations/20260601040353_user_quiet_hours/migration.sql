-- HR — Right to disconnect (Fair Work Act s333M) (2026-06-01)
--
-- Captures each staff member's quiet-hours preference as plain
-- "HH:MM" strings. Documented preference is the legally relevant
-- piece even without messaging-system enforcement.

ALTER TABLE "User"
  ADD COLUMN "quietHoursStart" TEXT,
  ADD COLUMN "quietHoursEnd"   TEXT,
  ADD COLUMN "quietHoursNotes" TEXT;
