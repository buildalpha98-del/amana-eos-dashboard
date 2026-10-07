-- Force a password change on first sign-in (2026-10-07). Defaults false so
-- existing accounts are untouched; every account-creation path sets it true.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
