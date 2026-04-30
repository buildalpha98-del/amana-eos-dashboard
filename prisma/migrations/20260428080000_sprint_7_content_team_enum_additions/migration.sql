-- ALTER TYPE ADD VALUE must run outside a transaction block (PostgreSQL
-- restriction), so we isolate the new content-team enum values here.
-- Sprint 7+8: photographer role; paused status for temporary leave.

ALTER TYPE "ContentTeamRole" ADD VALUE IF NOT EXISTS 'photographer';

ALTER TYPE "ContentTeamStatus" ADD VALUE IF NOT EXISTS 'paused';
