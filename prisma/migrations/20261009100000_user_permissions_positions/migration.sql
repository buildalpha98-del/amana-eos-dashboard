-- Per-person permission ticks, registered positions and ratio exclusion
-- (OWNA-style staff access). Defaults change nothing for anyone.
ALTER TABLE "User" ADD COLUMN "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "positions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "excludeFromRatio" BOOLEAN NOT NULL DEFAULT false;
