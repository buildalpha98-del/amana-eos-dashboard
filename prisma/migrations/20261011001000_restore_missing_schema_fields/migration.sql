-- Additive historical field and index reconciliation.
BEGIN;

ALTER TABLE "Absence" ADD COLUMN IF NOT EXISTS     "notifiedById" TEXT,
ADD COLUMN IF NOT EXISTS     "reason" TEXT;

ALTER TABLE "AuthorisedPickup" ADD COLUMN IF NOT EXISTS     "notes" TEXT;

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS     "declineReason" TEXT,
ADD COLUMN IF NOT EXISTS     "requestedById" TEXT,
ADD COLUMN IF NOT EXISTS     "reviewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "reviewedById" TEXT;

ALTER TABLE "ChildDocument" ADD COLUMN IF NOT EXISTS     "expiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS     "notes" TEXT,
ADD COLUMN IF NOT EXISTS     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS     "uploaderType" TEXT,
ADD COLUMN IF NOT EXISTS     "verifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "verifiedById" TEXT;

ALTER TABLE "Measurable" ADD COLUMN IF NOT EXISTS     "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ParentEnquiry" ADD COLUMN IF NOT EXISTS     "waitlistExpiresAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "waitlistJoinedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "waitlistOfferedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "waitlistPosition" INTEGER,
ADD COLUMN IF NOT EXISTS     "waitlistServiceId" TEXT;

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS     "capacityAsc" INTEGER,
ADD COLUMN IF NOT EXISTS     "capacityBsc" INTEGER,
ADD COLUMN IF NOT EXISTS     "capacityVc" INTEGER;

ALTER TABLE "Statement" ADD COLUMN IF NOT EXISTS     "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS     "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS     "issuedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS     "notes" TEXT,
ALTER COLUMN "status" SET DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS "Booking_status_serviceId_idx" ON "Booking"("status", "serviceId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmEmailTemplate_name_key" ON "CrmEmailTemplate"("name");

CREATE INDEX IF NOT EXISTS "DeliveryLog_status_idx" ON "DeliveryLog"("status");

CREATE INDEX IF NOT EXISTS "DeliveryLog_channel_status_idx" ON "DeliveryLog"("channel", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_name_category_key" ON "EmailTemplate"("name", "category");

CREATE INDEX IF NOT EXISTS "EnrolmentDraft_accountId_idx" ON "EnrolmentDraft"("accountId");

CREATE INDEX IF NOT EXISTS "ParentEnquiry_waitlistServiceId_waitlistPosition_idx" ON "ParentEnquiry"("waitlistServiceId", "waitlistPosition");

CREATE UNIQUE INDEX IF NOT EXISTS "Scenario_name_createdById_key" ON "Scenario"("name", "createdById");

CREATE UNIQUE INDEX IF NOT EXISTS "Sequence_name_type_key" ON "Sequence"("name", "type");

CREATE INDEX IF NOT EXISTS "Statement_status_dueDate_idx" ON "Statement"("status", "dueDate");

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppGroup_whatsappGroupJid_key" ON "WhatsAppGroup"("whatsappGroupJid");

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Booking_requestedById_fkey' AND conrelid = '"Booking"'::regclass) THEN
 ALTER TABLE "Booking" ADD CONSTRAINT "Booking_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "CentreContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Booking_reviewedById_fkey' AND conrelid = '"Booking"'::regclass) THEN
 ALTER TABLE "Booking" ADD CONSTRAINT "Booking_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
 END IF;
END $$;

-- The old replay retained this obsolete uniqueness restriction; production
-- already permits multiple statements for a period. No rows are changed.
DROP INDEX IF EXISTS "Statement_contactId_periodStart_periodEnd_key";

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PerformanceCase_raisedById_fkey' AND conrelid = '"PerformanceCase"'::regclass AND (confupdtype <> 'c' OR confdeltype <> 'r')) THEN
    ALTER TABLE "PerformanceCase" DROP CONSTRAINT "PerformanceCase_raisedById_fkey";
    ALTER TABLE "PerformanceCase" ADD CONSTRAINT "PerformanceCase_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PerformanceCase_closedById_fkey' AND conrelid = '"PerformanceCase"'::regclass AND (confupdtype <> 'c' OR confdeltype <> 'n')) THEN
    ALTER TABLE "PerformanceCase" DROP CONSTRAINT "PerformanceCase_closedById_fkey";
    ALTER TABLE "PerformanceCase" ADD CONSTRAINT "PerformanceCase_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PerformanceReview_createdById_fkey' AND conrelid = '"PerformanceReview"'::regclass AND (confupdtype <> 'c' OR confdeltype <> 'r')) THEN
    ALTER TABLE "PerformanceReview" DROP CONSTRAINT "PerformanceReview_createdById_fkey";
    ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PositionDescription_createdById_fkey' AND conrelid = '"PositionDescription"'::regclass AND (confupdtype <> 'c' OR confdeltype <> 'r')) THEN
    ALTER TABLE "PositionDescription" DROP CONSTRAINT "PositionDescription_createdById_fkey";
    ALTER TABLE "PositionDescription" ADD CONSTRAINT "PositionDescription_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferenceCheck_checkedById_fkey' AND conrelid = '"ReferenceCheck"'::regclass AND (confupdtype <> 'c' OR confdeltype <> 'r')) THEN
    ALTER TABLE "ReferenceCheck" DROP CONSTRAINT "ReferenceCheck_checkedById_fkey";
    ALTER TABLE "ReferenceCheck" ADD CONSTRAINT "ReferenceCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SeparationRecord_recordedById_fkey' AND conrelid = '"SeparationRecord"'::regclass AND (confupdtype <> 'c' OR confdeltype <> 'r')) THEN
    ALTER TABLE "SeparationRecord" DROP CONSTRAINT "SeparationRecord_recordedById_fkey";
    ALTER TABLE "SeparationRecord" ADD CONSTRAINT "SeparationRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkersCompensationClaim_createdById_fkey' AND conrelid = '"WorkersCompensationClaim"'::regclass AND (confupdtype <> 'c' OR confdeltype <> 'r')) THEN
    ALTER TABLE "WorkersCompensationClaim" DROP CONSTRAINT "WorkersCompensationClaim_createdById_fkey";
    ALTER TABLE "WorkersCompensationClaim" ADD CONSTRAINT "WorkersCompensationClaim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReasonableAdjustment_recordedById_fkey' AND conrelid = '"ReasonableAdjustment"'::regclass AND (confupdtype <> 'c' OR confdeltype <> 'r')) THEN
    ALTER TABLE "ReasonableAdjustment" DROP CONSTRAINT "ReasonableAdjustment_recordedById_fkey";
    ALTER TABLE "ReasonableAdjustment" ADD CONSTRAINT "ReasonableAdjustment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
