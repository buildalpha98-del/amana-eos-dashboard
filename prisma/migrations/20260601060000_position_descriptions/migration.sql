-- HR — Position descriptions library (2026-06-01)
--
-- Adds the PositionDescription model — the formal "what this job is"
-- document. Reusable across staff; assigned via a nullable FK on User.
-- Distinct from Contract (legal terms) and Role enum (auth bucket).

-- Enum
CREATE TYPE "PDStatus" AS ENUM ('draft', 'published', 'archived');

-- Table
CREATE TABLE "PositionDescription" (
  "id"                TEXT NOT NULL,
  "title"             VARCHAR(200) NOT NULL,
  "summary"           TEXT NOT NULL,
  "responsibilities"  TEXT NOT NULL,
  "selectionCriteria" TEXT NOT NULL,
  "qualifications"    TEXT NOT NULL,
  "targetRole"        "Role",
  "status"            "PDStatus" NOT NULL DEFAULT 'draft',
  "publishedAt"       TIMESTAMP(3),
  "archivedAt"        TIMESTAMP(3),
  "createdById"       TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PositionDescription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PositionDescription_status_targetRole_idx"
  ON "PositionDescription"("status", "targetRole");
CREATE INDEX "PositionDescription_targetRole_idx"
  ON "PositionDescription"("targetRole");

ALTER TABLE "PositionDescription"
  ADD CONSTRAINT "PositionDescription_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- User FK
ALTER TABLE "User"
  ADD COLUMN "positionDescriptionId" TEXT,
  ADD COLUMN "positionDescriptionAssignedAt" TIMESTAMP(3);

CREATE INDEX "User_positionDescriptionId_idx"
  ON "User"("positionDescriptionId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_positionDescriptionId_fkey"
  FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
