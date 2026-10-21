-- OWNA fees + staff hours via Cowork (Daniel, 21 Oct 2026).
ALTER TABLE "DailyAttendance" ADD COLUMN "feesCharged" DOUBLE PRECISION;

CREATE TABLE "OwnaStaffHours" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "staffName" TEXT NOT NULL,
    "userId" TEXT,
    "signIn" TEXT,
    "signOut" TEXT,
    "hours" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OwnaStaffHours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OwnaStaffHours_serviceId_date_staffName_key" ON "OwnaStaffHours"("serviceId", "date", "staffName");
CREATE INDEX "OwnaStaffHours_serviceId_date_idx" ON "OwnaStaffHours"("serviceId", "date");
ALTER TABLE "OwnaStaffHours" ADD CONSTRAINT "OwnaStaffHours_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
