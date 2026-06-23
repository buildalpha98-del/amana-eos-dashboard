-- 2026-06-23: new Role enum value for the write-capable EOS implementer
-- role. Sibling to eos_viewer (read-only). eos_implementer has full,
-- organisation-wide write access to the EOS surface (V/TO, Rocks,
-- Scorecard, To-dos, Issues, Meetings, Accountability Chart) and nothing
-- else — every EOS write endpoint adds this role to its allowlist; no
-- Operations / Growth / People / Financials / Admin access.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'eos_implementer';
