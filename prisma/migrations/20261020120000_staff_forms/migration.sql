-- Staff forms: Staff Record + Responsible Person offer & acceptance (20 Oct 2026).
CREATE TYPE "StaffFormType" AS ENUM ('staff_record', 'responsible_person');

CREATE TABLE "StaffForm" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "StaffFormType" NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "serviceId" TEXT,
    "staffSignatureDataUrl" TEXT,
    "submittedAt" TIMESTAMP(3),
    "supervisorSignatureDataUrl" TEXT,
    "supervisorSignedById" TEXT,
    "supervisorName" TEXT,
    "supervisorSignedAt" TIMESTAMP(3),
    "documentsViewed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffForm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffForm_userId_type_key" ON "StaffForm"("userId", "type");
CREATE INDEX "StaffForm_serviceId_idx" ON "StaffForm"("serviceId");

ALTER TABLE "StaffForm" ADD CONSTRAINT "StaffForm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffForm" ADD CONSTRAINT "StaffForm_supervisorSignedById_fkey" FOREIGN KEY ("supervisorSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
