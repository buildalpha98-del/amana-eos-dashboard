-- 2026-10-20: Volunteer role — unpaid centre volunteers. Profile,
-- compliance (WWCC + Staff Record form), policies, handbook, training.
-- No pay, leave, roster or clock-in. Additive; no existing users hold it.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'volunteer';
