-- Sub-project 6: Contracts + Recruitment Rebuild
-- Apply against Neon before merging PR.
-- Single additive field: StaffReferral.lastReminderAt

ALTER TABLE "StaffReferral" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
