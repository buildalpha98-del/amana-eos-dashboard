-- OWNA Gap Close — Phase F (qualification: PD log)
--
-- Closes audit finding: "no training/PD log (only certificates)".
-- ProfessionalDevelopmentRecord sits alongside StaffQualification (initial
-- credentials) and ComplianceCertificate (renewable cards). One row per
-- attended training/course/conference. Hours sum for state-regulator CPD
-- requirements.
--
-- Additive only.

CREATE TABLE "ProfessionalDevelopmentRecord" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "hours"         DECIMAL(5,2) NOT NULL,
  "completedAt"   DATE NOT NULL,
  "provider"      TEXT,
  "attachmentUrl" TEXT,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProfessionalDevelopmentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfessionalDevelopmentRecord_userId_completedAt_idx"
  ON "ProfessionalDevelopmentRecord"("userId", "completedAt");

ALTER TABLE "ProfessionalDevelopmentRecord"
  ADD CONSTRAINT "ProfessionalDevelopmentRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
