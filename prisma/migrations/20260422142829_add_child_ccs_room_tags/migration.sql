-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "ccsStatus" TEXT,
ADD COLUMN     "room" TEXT,
ADD COLUMN     "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Child_serviceId_ccsStatus_idx" ON "Child"("serviceId", "ccsStatus");

-- CreateIndex
CREATE INDEX "Child_serviceId_room_idx" ON "Child"("serviceId", "room");

