-- Reconcile additive schema changes historically introduced without migrations.
-- Preserve existing data, custom indexes and existing referential actions.

ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'declined';

ALTER TYPE "StatementStatus" ADD VALUE IF NOT EXISTS 'draft';

ALTER TYPE "StatementStatus" ADD VALUE IF NOT EXISTS 'issued';

ALTER TYPE "StatementStatus" ADD VALUE IF NOT EXISTS 'void';
