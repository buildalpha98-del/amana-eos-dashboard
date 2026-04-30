-- Drop the `coordinator` value from the Role enum.
--
-- Background: per the 2026-04-30 training-session decision, Service
-- Coordinators and Centre Directors are operationally indistinguishable —
-- both are service-level leads with identical surfaces and workflows.
-- The role list is collapsed to 6: owner, head_office (State Manager),
-- admin, marketing, member (Director of Service), staff (Educator).
--
-- Postgres can't drop an in-use enum value with a single ALTER TYPE in any
-- supported version, so we use the rename-recreate-cast pattern:
--   1. Convert any rows still using 'coordinator' to 'member' (data migration)
--   2. Rename the existing enum out of the way
--   3. Create the new enum with the reduced value set
--   4. Re-type the column, casting through text (safe because step 1
--      ensured no row holds the dropped value)
--   5. Drop the old enum

-- 1. Migrate users
UPDATE "User" SET "role" = 'member' WHERE "role" = 'coordinator';

-- 2. Rename the in-use enum out of the way
ALTER TYPE "Role" RENAME TO "Role_old";

-- 3. Create the new, smaller enum
CREATE TYPE "Role" AS ENUM (
  'owner',
  'head_office',
  'admin',
  'marketing',
  'member',
  'staff'
);

-- 4. Drop the column default temporarily so the type change is allowed,
--    re-cast the column through text, then restore the default. (Postgres
--    refuses to alter the type if a default is set against the old type.)
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::text::"Role";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'member'::"Role";

-- 5. Drop the old enum
DROP TYPE "Role_old";
