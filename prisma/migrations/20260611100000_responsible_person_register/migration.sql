-- CreateTable
CREATE TABLE "ResponsiblePersonEntry" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "personName" TEXT NOT NULL,
    "personRole" TEXT,
    "userId" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponsiblePersonEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResponsiblePersonEntry_serviceId_date_sessionType_key" ON "ResponsiblePersonEntry"("serviceId", "date", "sessionType");

-- CreateIndex
CREATE INDEX "ResponsiblePersonEntry_serviceId_idx" ON "ResponsiblePersonEntry"("serviceId");

-- CreateIndex
CREATE INDEX "ResponsiblePersonEntry_date_idx" ON "ResponsiblePersonEntry"("date");

-- CreateIndex
CREATE INDEX "ResponsiblePersonEntry_serviceId_date_idx" ON "ResponsiblePersonEntry"("serviceId", "date");

-- CreateIndex
CREATE INDEX "ResponsiblePersonEntry_userId_idx" ON "ResponsiblePersonEntry"("userId");

-- AddForeignKey
ALTER TABLE "ResponsiblePersonEntry" ADD CONSTRAINT "ResponsiblePersonEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsiblePersonEntry" ADD CONSTRAINT "ResponsiblePersonEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsiblePersonEntry" ADD CONSTRAINT "ResponsiblePersonEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
