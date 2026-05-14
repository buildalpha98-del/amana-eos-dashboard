-- Amana Way automation (stages 5 + 7)
--
-- 1. AttendanceRecord: add first-day photo SMS fields (stage 5)
-- 2. AllAboutMe: new model (stage 5)
-- 3. ParentFeedback: enhance for SMS-reply intake + reviewer (stage 7)
--    serviceCode goes from NOT NULL → nullable so inbound SMS replies
--    that don't carry a service code can land in the queue and be
--    resolved later.

-- ── AttendanceRecord: first-day photo SMS audit fields ────
ALTER TABLE "AttendanceRecord"
  ADD COLUMN "firstDayPhotoUrl"    TEXT,
  ADD COLUMN "firstDayPhotoSentAt" TIMESTAMP(3),
  ADD COLUMN "firstDayPhotoSentTo" TEXT;

-- ── AllAboutMe ────────────────────────────────────────────
CREATE TABLE "AllAboutMe" (
  "id"                TEXT NOT NULL,
  "childId"           TEXT NOT NULL,
  "nickname"          TEXT,
  "favouriteFood"     TEXT,
  "favouriteToys"     TEXT,
  "favouriteSubjects" TEXT,
  "hobbies"           TEXT,
  "fears"             TEXT,
  "calmingTechniques" TEXT,
  "additionalNotes"   TEXT,
  "submittedAt"       TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllAboutMe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllAboutMe_childId_key" ON "AllAboutMe"("childId");
CREATE INDEX "AllAboutMe_childId_idx" ON "AllAboutMe"("childId");

ALTER TABLE "AllAboutMe"
  ADD CONSTRAINT "AllAboutMe_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "Child"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ParentFeedback: SMS-reply intake + reviewer + relations ──
ALTER TABLE "ParentFeedback"
  ALTER COLUMN "serviceCode" DROP NOT NULL,
  ALTER COLUMN "surveyType"  DROP NOT NULL,
  ADD COLUMN "source"       TEXT,
  ADD COLUMN "channel"      TEXT,
  ADD COLUMN "fromNumber"   TEXT,
  ADD COLUMN "contactId"    TEXT,
  ADD COLUMN "childId"      TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt"   TIMESTAMP(3);

ALTER TABLE "ParentFeedback"
  ADD CONSTRAINT "ParentFeedback_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ParentFeedback"
  ADD CONSTRAINT "ParentFeedback_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "Child"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ParentFeedback"
  ADD CONSTRAINT "ParentFeedback_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ParentFeedback_serviceId_status_idx" ON "ParentFeedback"("serviceId", "status");
CREATE INDEX "ParentFeedback_source_idx"           ON "ParentFeedback"("source");
CREATE INDEX "ParentFeedback_contactId_idx"        ON "ParentFeedback"("contactId");
CREATE INDEX "ParentFeedback_childId_idx"          ON "ParentFeedback"("childId");
