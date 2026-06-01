-- Maps User to the Employment Hero Payroll employee record. Nullable —
-- not every dashboard user has a payroll record (e.g. parents, casuals
-- pre-onboarding). Populated by `/api/cron/eh-payroll-sync-employees`.
-- Unique because a single payroll employee should never be claimed by
-- two dashboard users.

ALTER TABLE "User"
  ADD COLUMN "employmentHeroEmployeeId" INTEGER;

CREATE UNIQUE INDEX "User_employmentHeroEmployeeId_key"
  ON "User"("employmentHeroEmployeeId");
