-- Every Meeting was structurally an L10; this adds a `type` discriminator
-- so a Quarterly Pulse meeting can follow its own run sheet. Defaults to
-- 'l10' so every existing row (and every write path that doesn't pass it)
-- keeps behaving exactly as before.

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('l10', 'quarterly_pulse');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "type" "MeetingType" NOT NULL DEFAULT 'l10';
