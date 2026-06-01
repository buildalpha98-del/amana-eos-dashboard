-- HR — Casual conversion (Closing Loopholes No. 2 Act 2024) (2026-06-01)
--
-- Employee-choice model. Casual elects → 21-day employer response
-- window → either new permanent contract issued or decline with
-- specific Fair Work Act s66B-compliant grounds.

CREATE TYPE "ConversionRequestType" AS ENUM ('part_time', 'full_time');
CREATE TYPE "ConversionResponse"    AS ENUM ('accepted', 'declined');

CREATE TABLE "CasualConversionElection" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "requestedType"   "ConversionRequestType" NOT NULL,
  "electedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "electionNotes"   TEXT,
  "respondedAt"     TIMESTAMP(3),
  "respondedById"   TEXT,
  "response"        "ConversionResponse",
  "declineReasons"  TEXT,
  "newContractId"   TEXT,
  "deleted"         BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CasualConversionElection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasualConversionElection_newContractId_key"
  ON "CasualConversionElection"("newContractId");
CREATE INDEX "CasualConversionElection_userId_electedAt_idx"
  ON "CasualConversionElection"("userId", "electedAt");
CREATE INDEX "CasualConversionElection_response_idx"
  ON "CasualConversionElection"("response");

ALTER TABLE "CasualConversionElection"
  ADD CONSTRAINT "CasualConversionElection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CasualConversionElection"
  ADD CONSTRAINT "CasualConversionElection_respondedById_fkey"
  FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CasualConversionElection"
  ADD CONSTRAINT "CasualConversionElection_newContractId_fkey"
  FOREIGN KEY ("newContractId") REFERENCES "EmploymentContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
