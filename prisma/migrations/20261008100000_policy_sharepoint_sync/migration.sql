-- Policies & Procedures synced from the SharePoint master folder
-- (2026-10-08). All nullable — hand-uploaded documents are untouched.
ALTER TABLE "PolicyDocument" ADD COLUMN "sharepointItemId" TEXT;
ALTER TABLE "PolicyDocument" ADD COLUMN "sharepointETag" TEXT;
ALTER TABLE "PolicyDocument" ADD COLUMN "sharepointWebUrl" TEXT;
ALTER TABLE "PolicyDocument" ADD COLUMN "sharepointSyncedAt" TIMESTAMP(3);
ALTER TABLE "PolicyDocument" ADD COLUMN "state" TEXT;
CREATE UNIQUE INDEX "PolicyDocument_sharepointItemId_key" ON "PolicyDocument"("sharepointItemId");
-- Staff must sign it. Existing documents keep their current behaviour (true).
ALTER TABLE "PolicyDocument" ADD COLUMN "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT true;
