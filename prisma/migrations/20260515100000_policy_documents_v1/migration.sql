-- 2026-05-15: Policies & Procedures overhaul v1.
--
-- Replaces the URL-based Policy / PolicyAcknowledgement models with three
-- new tables backing a versioned, PDF-file Policies & Procedures library.
-- All new tables are company-wide (no centreId / serviceId).
--
-- Old tables are dropped — they stored URLs to off-platform documents that
-- aren't portable to file-backed storage. Any compliance history under the
-- old model is intentionally not preserved (admins re-upload as PDFs).

-- CreateEnum PolicyDocumentCategory
CREATE TYPE "PolicyDocumentCategory" AS ENUM (
  'policy',
  'procedure',
  'other'
);

-- CreateTable PolicyDocument
CREATE TABLE "PolicyDocument" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" "PolicyDocumentCategory" NOT NULL DEFAULT 'policy',
  "currentVersionId" TEXT,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_title_key" ON "PolicyDocument"("title");
CREATE UNIQUE INDEX "PolicyDocument_currentVersionId_key" ON "PolicyDocument"("currentVersionId");
CREATE INDEX "PolicyDocument_category_idx" ON "PolicyDocument"("category");
CREATE INDEX "PolicyDocument_isArchived_idx" ON "PolicyDocument"("isArchived");

-- CreateTable PolicyDocumentVersion
CREATE TABLE "PolicyDocumentVersion" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "uploadedById" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PolicyDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocumentVersion_documentId_versionNumber_key"
  ON "PolicyDocumentVersion"("documentId", "versionNumber");
CREATE INDEX "PolicyDocumentVersion_documentId_idx" ON "PolicyDocumentVersion"("documentId");

-- CreateTable PolicyDocumentAcknowledgement
CREATE TABLE "PolicyDocumentAcknowledgement" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PolicyDocumentAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocumentAcknowledgement_versionId_userId_key"
  ON "PolicyDocumentAcknowledgement"("versionId", "userId");
CREATE INDEX "PolicyDocumentAcknowledgement_versionId_idx" ON "PolicyDocumentAcknowledgement"("versionId");
CREATE INDEX "PolicyDocumentAcknowledgement_userId_idx" ON "PolicyDocumentAcknowledgement"("userId");

-- AddForeignKey: PolicyDocument.currentVersionId -> PolicyDocumentVersion.id (nullable)
ALTER TABLE "PolicyDocument"
  ADD CONSTRAINT "PolicyDocument_currentVersionId_fkey"
  FOREIGN KEY ("currentVersionId") REFERENCES "PolicyDocumentVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: PolicyDocumentVersion.documentId -> PolicyDocument.id (cascade)
ALTER TABLE "PolicyDocumentVersion"
  ADD CONSTRAINT "PolicyDocumentVersion_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "PolicyDocument"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: PolicyDocumentVersion.uploadedById -> User.id (set null)
ALTER TABLE "PolicyDocumentVersion"
  ADD CONSTRAINT "PolicyDocumentVersion_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: PolicyDocumentAcknowledgement.versionId -> PolicyDocumentVersion.id (cascade)
ALTER TABLE "PolicyDocumentAcknowledgement"
  ADD CONSTRAINT "PolicyDocumentAcknowledgement_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "PolicyDocumentVersion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: PolicyDocumentAcknowledgement.userId -> User.id (cascade)
ALTER TABLE "PolicyDocumentAcknowledgement"
  ADD CONSTRAINT "PolicyDocumentAcknowledgement_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- DropTable + DropEnum for old URL-based policies.
DROP TABLE IF EXISTS "PolicyAcknowledgement";
DROP TABLE IF EXISTS "Policy";
DROP TYPE IF EXISTS "PolicyStatus";
