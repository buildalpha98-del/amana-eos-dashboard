-- Make Issue.category a first-class EOS list discriminator (short_term | long_term).
-- Ordered to be Neon-safe: backfill BEFORE the type change and NOT NULL.

-- 1. Backfill existing rows to the default working list (short-term).
--    Covers historical NULLs (category was never set on create) and any stray text.
UPDATE "Issue"
SET "category" = 'short_term'
WHERE "category" IS NULL OR "category" NOT IN ('short_term', 'long_term');

-- 2. CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('short_term', 'long_term');

-- 3. AlterTable: convert free-text column to the enum, with default + NOT NULL.
ALTER TABLE "Issue" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Issue" ALTER COLUMN "category" TYPE "IssueCategory" USING "category"::"IssueCategory";
ALTER TABLE "Issue" ALTER COLUMN "category" SET DEFAULT 'short_term';
ALTER TABLE "Issue" ALTER COLUMN "category" SET NOT NULL;

-- 4. CreateIndex
CREATE INDEX "Issue_category_idx" ON "Issue"("category");
CREATE INDEX "Issue_category_status_idx" ON "Issue"("category", "status");
