-- ALTER TYPE ADD VALUE must run outside a transaction block (PostgreSQL
-- restriction), so we isolate it in its own migration file. Prisma's
-- `migrate deploy` submits each .sql file as a separate transaction, so
-- splitting this out lets the other DDL in 20260424160000 stay batched.

ALTER TYPE "ParentPostType" ADD VALUE 'newsletter';
