-- 2026-06-19: extend AuditFrequency to cover daily, weekly, and
-- quarterly audits. Daniel's audit folder structure includes daily
-- checklists (playground temperature, indoor/outdoor risk) and
-- quarterly fire/evacuation drills that didn't fit the existing
-- monthly/half_yearly/yearly options.
--
-- Postgres 12+ allows multiple ADD VALUE statements in the same
-- transaction; Neon runs PG 15/16 so this is fine.

ALTER TYPE "AuditFrequency" ADD VALUE IF NOT EXISTS 'daily';
ALTER TYPE "AuditFrequency" ADD VALUE IF NOT EXISTS 'weekly';
ALTER TYPE "AuditFrequency" ADD VALUE IF NOT EXISTS 'quarterly';
