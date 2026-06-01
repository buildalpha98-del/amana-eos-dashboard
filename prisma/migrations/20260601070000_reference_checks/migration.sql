-- HR — Reference checks on hire (2026-06-01)
--
-- Structured record of reference checks performed during hiring.
-- Defence against negligent-hiring claims; 7-year Fair Work retention.

CREATE TYPE "RefCheckMethod" AS ENUM (
  'phone',
  'video',
  'email',
  'written_response',
  'in_person'
);

CREATE TYPE "RefCheckStatus" AS ENUM (
  'pending',
  'contacted',
  'completed',
  'unable_to_reach',
  'declined'
);

CREATE TYPE "RefCheckRecommendation" AS ENUM (
  'strong_positive',
  'positive',
  'neutral',
  'reservations',
  'do_not_recommend'
);

CREATE TABLE "ReferenceCheck" (
  "id"                  TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "checkedById"         TEXT NOT NULL,
  "refereeName"         VARCHAR(200) NOT NULL,
  "refereeRelationship" VARCHAR(200) NOT NULL,
  "refereeOrganisation" VARCHAR(200),
  "refereePhone"        TEXT,
  "refereeEmail"        TEXT,
  "method"              "RefCheckMethod" NOT NULL,
  "contactedAt"         TIMESTAMP(3),
  "status"              "RefCheckStatus" NOT NULL DEFAULT 'pending',
  "recommendation"      "RefCheckRecommendation",
  "notes"               TEXT NOT NULL,
  "redFlags"            TEXT,
  "employmentVerified"  BOOLEAN,
  "wouldRehire"         BOOLEAN,
  "deleted"             BOOLEAN NOT NULL DEFAULT false,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferenceCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferenceCheck_userId_status_idx"
  ON "ReferenceCheck"("userId", "status");
CREATE INDEX "ReferenceCheck_checkedById_idx"
  ON "ReferenceCheck"("checkedById");

ALTER TABLE "ReferenceCheck"
  ADD CONSTRAINT "ReferenceCheck_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferenceCheck"
  ADD CONSTRAINT "ReferenceCheck_checkedById_fkey"
  FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
