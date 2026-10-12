-- AlterEnum
-- Breakfast goes BEFORE morning tea: Postgres orders enum values by
-- position, and menus are listed ORDER BY slot — appended, breakfast would
-- sort after afternoon tea. Late snack belongs at the end. (PG 12+ allows
-- ADD VALUE in a transaction; the new values aren't used in this migration.)
ALTER TYPE "MealSlot" ADD VALUE 'breakfast' BEFORE 'morning_tea';
ALTER TYPE "MealSlot" ADD VALUE 'late_snack';

-- AlterTable
ALTER TABLE "ProgramActivity" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "ProgramPlanSync" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "webUrl" TEXT,
    "eTag" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "weeks" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramPlanSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramPlanSync_serviceId_syncedAt_idx" ON "ProgramPlanSync"("serviceId", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramPlanSync_serviceId_itemId_key" ON "ProgramPlanSync"("serviceId", "itemId");

-- AddForeignKey
ALTER TABLE "ProgramPlanSync" ADD CONSTRAINT "ProgramPlanSync_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

