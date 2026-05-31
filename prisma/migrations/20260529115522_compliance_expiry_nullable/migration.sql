-- Make ComplianceCertificate.expiryDate nullable so certs that don't expire
-- (annual policy ack, induction confirmations, etc.) can be represented as
-- NULL instead of a sentinel far-future date. Additive change — existing
-- rows keep their expiryDate values; no backfill required.
ALTER TABLE "ComplianceCertificate"
  ALTER COLUMN "expiryDate" DROP NOT NULL;
