-- AlterTable
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "indexed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "indexedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "indexError" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "heading" TEXT,
    "pageNumber" INTEGER,
    "tokenCount" INTEGER NOT NULL,
    "searchVector" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentChunk_documentId_chunkIndex_key" ON "DocumentChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- CreateIndex (GIN for full-text search)
CREATE INDEX IF NOT EXISTS "DocumentChunk_searchVector_idx" ON "DocumentChunk" USING GIN ("searchVector");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
