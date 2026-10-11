-- CreateTable
CREATE TABLE "AttendanceMutation" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "action" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceMutation_serviceId_date_sessionType_idx" ON "AttendanceMutation"("serviceId", "date", "sessionType");

-- CreateIndex
CREATE INDEX "AttendanceMutation_childId_idx" ON "AttendanceMutation"("childId");

-- AddForeignKey
ALTER TABLE "AttendanceMutation" ADD CONSTRAINT "AttendanceMutation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMutation" ADD CONSTRAINT "AttendanceMutation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

