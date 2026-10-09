-- CreateTable
CREATE TABLE "HazardReport" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "location" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "photoUrl" TEXT,
    "reportedById" TEXT,
    "reportedByName" TEXT NOT NULL,
    "assignedTo" TEXT,
    "dueDate" DATE,
    "fixedAt" TIMESTAMP(3),
    "fixedByName" TEXT,
    "fixNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HazardReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HazardReport_serviceId_status_idx" ON "HazardReport"("serviceId", "status");

-- AddForeignKey
ALTER TABLE "HazardReport" ADD CONSTRAINT "HazardReport_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HazardReport" ADD CONSTRAINT "HazardReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

