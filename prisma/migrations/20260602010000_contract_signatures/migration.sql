-- Two-party contract signatures (2026-06-02)
--
-- Admin signs at issue time; staff signs on acknowledgement.
-- Signatures are captured as transparent PNG data URLs from an HTML5
-- canvas signature pad and stored on the EmploymentContract row.
-- The PDF document at documentUrl is re-rendered with both signatures
-- embedded after the staff member signs.

ALTER TABLE "EmploymentContract"
  ADD COLUMN "adminSignatureDataUrl"  TEXT,
  ADD COLUMN "adminSignedById"        TEXT,
  ADD COLUMN "adminSignedAt"          TIMESTAMP(3),
  ADD COLUMN "staffSignatureDataUrl"  TEXT;

ALTER TABLE "EmploymentContract"
  ADD CONSTRAINT "EmploymentContract_adminSignedById_fkey"
  FOREIGN KEY ("adminSignedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EmploymentContract_adminSignedById_idx"
  ON "EmploymentContract"("adminSignedById");
