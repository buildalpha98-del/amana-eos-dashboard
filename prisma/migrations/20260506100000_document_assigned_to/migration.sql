-- Adds Document.assignedToId so admin-uploaded HR documents can be
-- linked to the staff member they're about, distinct from the
-- uploader. Backfill is unnecessary (all existing rows stay null —
-- the staff profile query falls back to uploadedById for self-uploads).

ALTER TABLE "Document" ADD COLUMN "assignedToId" TEXT;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Document_assignedToId_idx" ON "Document"("assignedToId");
