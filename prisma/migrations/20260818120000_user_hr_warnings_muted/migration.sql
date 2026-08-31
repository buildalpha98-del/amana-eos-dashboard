-- Lets an admin mute the /team red "needs payroll link" and yellow "no
-- contract" badges per user — for accounts that are deliberately not
-- real employees (shared service-admin logins, system accounts) rather
-- than a real onboarding gap. Defaults false so no existing account is
-- silently muted.
ALTER TABLE "User" ADD COLUMN "hrWarningsMuted" BOOLEAN NOT NULL DEFAULT false;
