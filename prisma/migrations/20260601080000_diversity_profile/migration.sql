-- HR — Diversity & inclusion register (2026-06-01)
--
-- Opt-in self-disclosed profile. WGEA prep + positive-step toward
-- inclusive workforce planning. Hard-delete on withdrawal (no soft
-- delete — "no" means no for trust).

CREATE TYPE "DiversityGender" AS ENUM (
  'woman',
  'man',
  'non_binary',
  'prefer_to_self_describe',
  'prefer_not_to_say'
);

CREATE TYPE "DiversityIndigenous" AS ENUM (
  'none',
  'aboriginal',
  'torres_strait_islander',
  'both',
  'prefer_not_to_say'
);

CREATE TYPE "DiversityDisability" AS ENUM (
  'none',
  'with_disability',
  'prefer_not_to_say'
);

CREATE TYPE "DiversityCarer" AS ENUM (
  'none',
  'parent_carer',
  'family_carer',
  'both',
  'prefer_not_to_say'
);

CREATE TABLE "DiversityProfile" (
  "id"                     TEXT NOT NULL,
  "userId"                 TEXT NOT NULL,
  "genderIdentity"         "DiversityGender",
  "genderSelfDescribed"    VARCHAR(200),
  "culturalIdentity"       VARCHAR(200),
  "bornInAustralia"        BOOLEAN,
  "yearArrivedInAustralia" INTEGER,
  "languageAtHome"         VARCHAR(200),
  "indigenousIdentity"     "DiversityIndigenous",
  "disabilityStatus"       "DiversityDisability",
  "disabilityType"         VARCHAR(200),
  "carerStatus"            "DiversityCarer",
  "veteranStatus"          BOOLEAN,
  "consentGivenAt"         TIMESTAMP(3) NOT NULL,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiversityProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiversityProfile_userId_key"
  ON "DiversityProfile"("userId");

ALTER TABLE "DiversityProfile"
  ADD CONSTRAINT "DiversityProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
