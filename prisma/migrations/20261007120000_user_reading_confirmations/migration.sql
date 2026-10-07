-- "I've read it" confirmations for the Staff Handbook and The Amana Way
-- (2026-10-07) — a step on the My Portal get-ready checklist.
ALTER TABLE "User" ADD COLUMN "handbookReadAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "amanaWayReadAt" TIMESTAMP(3);
