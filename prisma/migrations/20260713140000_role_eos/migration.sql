-- 2026-07-13: new Role enum value for the broad "EOS Member" tier.
-- Effectively admin-level org-wide access — full EOS surface plus
-- Services / Operations / Growth / People. Distinct from eos_viewer
-- (read-only EOS) and eos_implementer (write EOS, EOS-only surface).
--
-- Additive change: safe to deploy. No data backfill needed — no
-- existing users hold this role.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'eos';
