-- 2026-06-22: new Role enum value for the view-only EOS coach/advisor
-- role. Members on this role can see the EOS surface (V/TO, Rocks,
-- Scorecard, To-dos, Issues, Meetings, Accountability Chart) but
-- cannot write to any of them — every write endpoint in those areas
-- is already gated to specific roles and intentionally excludes
-- eos_viewer.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'eos_viewer';
