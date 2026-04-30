-- Add parent profile fields to CentreContact (populated from EnrolmentSubmission on approval)
ALTER TABLE "CentreContact"
  ADD COLUMN "dob"               DATE,
  ADD COLUMN "mobile"             TEXT,
  ADD COLUMN "crn"                TEXT,
  ADD COLUMN "address"            JSONB,
  ADD COLUMN "relationship"       TEXT,
  ADD COLUMN "occupation"         TEXT,
  ADD COLUMN "workplace"          TEXT,
  ADD COLUMN "workPhone"          TEXT,
  ADD COLUMN "parentRole"         TEXT,
  ADD COLUMN "sourceEnrolmentId"  TEXT;
