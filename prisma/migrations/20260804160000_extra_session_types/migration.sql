-- Four spare session slots a centre can name and enable itself.
-- Additive only: no existing row changes, and IF NOT EXISTS makes a
-- re-run a no-op. Postgres cannot remove enum values, which is why this
-- adds a fixed small set rather than growing on demand.
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'extra1';
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'extra2';
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'extra3';
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'extra4';
