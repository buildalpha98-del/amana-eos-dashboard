-- CreateEnum
CREATE TYPE "EmailTemplateAudience" AS ENUM ('parents', 'staff', 'both');

-- AlterTable
ALTER TABLE "EmailTemplate" ADD COLUMN     "audience" "EmailTemplateAudience" NOT NULL DEFAULT 'parents';

-- AlterTable
ALTER TABLE "StaffUpdate" ADD COLUMN     "blocks" JSONB;

