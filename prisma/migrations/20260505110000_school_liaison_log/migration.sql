-- CreateTable
CREATE TABLE "SchoolLiaisonLog" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "summary" VARCHAR(1000) NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolLiaisonLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolLiaisonLog_serviceId_idx" ON "SchoolLiaisonLog"("serviceId");

-- CreateIndex
CREATE INDEX "SchoolLiaisonLog_loggedAt_idx" ON "SchoolLiaisonLog"("loggedAt");

-- AddForeignKey
ALTER TABLE "SchoolLiaisonLog" ADD CONSTRAINT "SchoolLiaisonLog_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
