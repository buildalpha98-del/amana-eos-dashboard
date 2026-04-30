-- CreateTable
CREATE TABLE "ComplianceCertificateAlert" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channels" TEXT[],

    CONSTRAINT "ComplianceCertificateAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceCertificateAlert_certificateId_idx" ON "ComplianceCertificateAlert"("certificateId");

-- CreateIndex
CREATE INDEX "ComplianceCertificateAlert_sentAt_idx" ON "ComplianceCertificateAlert"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCertificateAlert_certificateId_threshold_key" ON "ComplianceCertificateAlert"("certificateId", "threshold");

-- CreateIndex
CREATE INDEX "UserNotification_userId_read_createdAt_idx" ON "UserNotification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "UserNotification_userId_createdAt_idx" ON "UserNotification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ComplianceCertificateAlert" ADD CONSTRAINT "ComplianceCertificateAlert_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "ComplianceCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

