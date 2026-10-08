-- Assessment & Rating on the centre (OWNA's A&R tab). All nullable.
ALTER TABLE "Service" ADD COLUMN "nqsRating" TEXT;
ALTER TABLE "Service" ADD COLUMN "nqsLastAssessedAt" DATE;
ALTER TABLE "Service" ADD COLUMN "nqsNextAssessmentAt" DATE;
ALTER TABLE "Service" ADD COLUMN "nqsQaRatings" JSONB;
