-- Parent forms: permission slips and policy acknowledgements a family
-- signs in the portal with a typed name. Additive; IF NOT EXISTS makes
-- a re-run a no-op.
CREATE TABLE IF NOT EXISTS "ParentForm" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "dueDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ParentForm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ParentFormSignature" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "signedName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParentFormSignature_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ParentForm_serviceId_status_idx" ON "ParentForm"("serviceId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ParentFormSignature_formId_parentEmail_key" ON "ParentFormSignature"("formId", "parentEmail");
CREATE INDEX IF NOT EXISTS "ParentFormSignature_parentEmail_idx" ON "ParentFormSignature"("parentEmail");

DO $$ BEGIN
  ALTER TABLE "ParentForm" ADD CONSTRAINT "ParentForm_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ParentForm" ADD CONSTRAINT "ParentForm_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ParentFormSignature" ADD CONSTRAINT "ParentFormSignature_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "ParentForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
