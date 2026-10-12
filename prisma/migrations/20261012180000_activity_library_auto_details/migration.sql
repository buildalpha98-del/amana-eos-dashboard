-- AlterTable
ALTER TABLE "ActivityTemplate" ADD COLUMN     "enrichedAt" TIMESTAMP(3);


-- Daniel, 2026-10-12: "maximise them all to one hour" — every activity in
-- the shared library runs at most an hour (the API now caps new values too).
UPDATE "ActivityTemplate" SET "durationMinutes" = 60
WHERE "durationMinutes" > 60;

-- Entries the program plan already filled in need no second pass.
UPDATE "ActivityTemplate" SET "enrichedAt" = CURRENT_TIMESTAMP
WHERE "source" = 'sharepoint' AND "howTo" IS NOT NULL;
