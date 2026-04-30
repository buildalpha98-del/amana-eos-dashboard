-- OWNA Gap Close — Phase F (qualification renewal workflow)
--
-- Adds a renewal-chain link to ComplianceCertificate so that when a cert is
-- renewed (e.g., a 3-year WWCC expiring → new 3-year WWCC), the new cert
-- points back at its predecessor and the old cert gets a supersededAt
-- timestamp. Preserves the audit trail; an NQS auditor can walk back through
-- "show me the WWCC history for this educator" without losing any rows.
--
-- Additive only.

ALTER TABLE "ComplianceCertificate"
  ADD COLUMN "previousCertificateId" TEXT,
  ADD COLUMN "supersededAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ComplianceCertificate_previousCertificateId_key"
  ON "ComplianceCertificate"("previousCertificateId");

ALTER TABLE "ComplianceCertificate"
  ADD CONSTRAINT "ComplianceCertificate_previousCertificateId_fkey"
  FOREIGN KEY ("previousCertificateId") REFERENCES "ComplianceCertificate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
