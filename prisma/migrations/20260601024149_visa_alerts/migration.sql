-- HR — Visa expiry alert dedup (2026-06-01)
--
-- Mirrors ComplianceCertificateAlert but keyed on User because visa
-- fields live on the User row, not on a separate Certificate. Prevents
-- the daily cron from re-emailing the same staff member at the same
-- threshold twice.

CREATE TABLE "VisaAlert" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "threshold" INTEGER NOT NULL,
  "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisaAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisaAlert_userId_threshold_key"
  ON "VisaAlert"("userId", "threshold");
CREATE INDEX "VisaAlert_userId_idx"
  ON "VisaAlert"("userId");

ALTER TABLE "VisaAlert"
  ADD CONSTRAINT "VisaAlert_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
