-- AlterTable
ALTER TABLE "Message" ADD COLUMN "attachmentUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
