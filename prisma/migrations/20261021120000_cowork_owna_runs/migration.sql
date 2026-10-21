-- Cowork OWNA data runs (Daniel, 21 Oct 2026).
ALTER TABLE "Service" ADD COLUMN "coworkFeedAt" TIMESTAMP(3);
ALTER TABLE "Child" ADD COLUMN "quietFollowUpAt" TIMESTAMP(3);

CREATE TABLE "OwnaDataRun" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'cowork',
    "runType" TEXT,
    "periodStart" DATE,
    "periodEnd" DATE,
    "children" INTEGER NOT NULL DEFAULT 0,
    "attendance" INTEGER NOT NULL DEFAULT 0,
    "signedIn" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnaDataRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnaDataRun_serviceId_createdAt_idx" ON "OwnaDataRun"("serviceId", "createdAt");

ALTER TABLE "OwnaDataRun" ADD CONSTRAINT "OwnaDataRun_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
