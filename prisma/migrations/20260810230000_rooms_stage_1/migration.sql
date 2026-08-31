-- Stage 1 of making rooms first-class records (docs/rooms-migration-plan.md).
--
-- Adds `roomId` beside `sessionType` on every model that carries a room,
-- backfills it, and puts the parallel unique constraints in force.
--
-- BOTH KEYS ARE WRITTEN AND BOTH SETS OF UNIQUES HOLD from here on. That
-- is the point: a bug in the resolver surfaces immediately as a
-- constraint violation on write, not as silent divergence discovered
-- weeks later in a billing run.
--
-- `roomId` stays NULLABLE through this stage. Making it NOT NULL is the
-- gate at the END of Stage 1, once the reconciliation reports zero nulls
-- on every table — applied any earlier it would fail the migration on
-- the first row the backfill couldn't resolve, with no way to see which.

-- ── Columns ──
ALTER TABLE "Absence" ADD COLUMN "roomId" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN "roomId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "roomId" TEXT;
ALTER TABLE "BookingForecast" ADD COLUMN "roomId" TEXT;
ALTER TABLE "CasualDayConfig" ADD COLUMN "roomId" TEXT;
ALTER TABLE "ChildFeeAssignment" ADD COLUMN "roomId" TEXT;
ALTER TABLE "ConversionOpportunity" ADD COLUMN "roomId" TEXT;
ALTER TABLE "DailyAttendance" ADD COLUMN "roomId" TEXT;
ALTER TABLE "DailyChecklist" ADD COLUMN "roomId" TEXT;
ALTER TABLE "FamilyDiscount" ADD COLUMN "roomId" TEXT;
ALTER TABLE "ResponsiblePersonEntry" ADD COLUMN "roomId" TEXT;
ALTER TABLE "RosterShift" ADD COLUMN "roomId" TEXT;
ALTER TABLE "ServiceBlockOutDate" ADD COLUMN "roomId" TEXT;
ALTER TABLE "ServiceExcursion" ADD COLUMN "roomId" TEXT;
ALTER TABLE "ServiceFeeChange" ADD COLUMN "roomId" TEXT;
ALTER TABLE "ServiceHeadcount" ADD COLUMN "roomId" TEXT;
ALTER TABLE "ShiftTemplate" ADD COLUMN "roomId" TEXT;
ALTER TABLE "StatementLineItem" ADD COLUMN "roomId" TEXT;

-- ── Backfill from the Stage 0 shadow table ──
--
-- `roomId` is a pure function of (serviceId, sessionType) — Room holds
-- exactly one row per slot per service — so this is re-runnable and
-- self-healing. Any write path that misses the dual write leaves a null
-- that re-running this same statement fills in. That is the safety net
-- for 54 hand-edited call sites.

UPDATE "Absence" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "AttendanceRecord" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "Booking" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "BookingForecast" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "CasualDayConfig" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "ChildFeeAssignment" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "ConversionOpportunity" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "DailyAttendance" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "DailyChecklist" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "FamilyDiscount" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "ResponsiblePersonEntry" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "RosterShift" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "ServiceBlockOutDate" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "ServiceExcursion" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "ServiceFeeChange" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "ServiceHeadcount" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

UPDATE "ShiftTemplate" t SET "roomId" = r."id"
  FROM "Room" r
  WHERE r."serviceId" = t."serviceId"
    AND r."legacyKey" = t."sessionType"
    AND t."roomId" IS NULL;

-- StatementLineItem has no serviceId of its own; it reaches one through
-- the statement it belongs to.
UPDATE "StatementLineItem" li SET "roomId" = r."id"
  FROM "Room" r, "Statement" s
  WHERE li."statementId" = s."id"
    AND r."serviceId" = s."serviceId"
    AND r."legacyKey" = li."sessionType"
    AND li."roomId" IS NULL;

-- ── Foreign keys and lookup indexes ──
CREATE INDEX "Absence_roomId_idx" ON "Absence"("roomId");
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AttendanceRecord_roomId_idx" ON "AttendanceRecord"("roomId");
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Booking_roomId_idx" ON "Booking"("roomId");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "BookingForecast_roomId_idx" ON "BookingForecast"("roomId");
ALTER TABLE "BookingForecast" ADD CONSTRAINT "BookingForecast_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CasualDayConfig_roomId_idx" ON "CasualDayConfig"("roomId");
ALTER TABLE "CasualDayConfig" ADD CONSTRAINT "CasualDayConfig_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ChildFeeAssignment_roomId_idx" ON "ChildFeeAssignment"("roomId");
ALTER TABLE "ChildFeeAssignment" ADD CONSTRAINT "ChildFeeAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ConversionOpportunity_roomId_idx" ON "ConversionOpportunity"("roomId");
ALTER TABLE "ConversionOpportunity" ADD CONSTRAINT "ConversionOpportunity_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DailyAttendance_roomId_idx" ON "DailyAttendance"("roomId");
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DailyChecklist_roomId_idx" ON "DailyChecklist"("roomId");
ALTER TABLE "DailyChecklist" ADD CONSTRAINT "DailyChecklist_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FamilyDiscount_roomId_idx" ON "FamilyDiscount"("roomId");
ALTER TABLE "FamilyDiscount" ADD CONSTRAINT "FamilyDiscount_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ResponsiblePersonEntry_roomId_idx" ON "ResponsiblePersonEntry"("roomId");
ALTER TABLE "ResponsiblePersonEntry" ADD CONSTRAINT "ResponsiblePersonEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "RosterShift_roomId_idx" ON "RosterShift"("roomId");
ALTER TABLE "RosterShift" ADD CONSTRAINT "RosterShift_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ServiceBlockOutDate_roomId_idx" ON "ServiceBlockOutDate"("roomId");
ALTER TABLE "ServiceBlockOutDate" ADD CONSTRAINT "ServiceBlockOutDate_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ServiceExcursion_roomId_idx" ON "ServiceExcursion"("roomId");
ALTER TABLE "ServiceExcursion" ADD CONSTRAINT "ServiceExcursion_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ServiceFeeChange_roomId_idx" ON "ServiceFeeChange"("roomId");
ALTER TABLE "ServiceFeeChange" ADD CONSTRAINT "ServiceFeeChange_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ServiceHeadcount_roomId_idx" ON "ServiceHeadcount"("roomId");
ALTER TABLE "ServiceHeadcount" ADD CONSTRAINT "ServiceHeadcount_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ShiftTemplate_roomId_idx" ON "ShiftTemplate"("roomId");
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "StatementLineItem_roomId_idx" ON "StatementLineItem"("roomId");
ALTER TABLE "StatementLineItem" ADD CONSTRAINT "StatementLineItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── The parallel uniques ──
--
-- The existing sessionType uniques stay in force; both hold at once,
-- which is what makes a resolver bug loud rather than silent. Postgres
-- treats NULLs as distinct, so rows the backfill could not resolve do
-- not collide with each other — they surface in the reconciliation
-- instead, which is where an unresolved row should be visible.
CREATE UNIQUE INDEX "Booking_roomId_unique_idx" ON "Booking"("childId", "roomId", "date");
CREATE UNIQUE INDEX "AttendanceRecord_roomId_unique_idx" ON "AttendanceRecord"("childId", "roomId", "date");
CREATE UNIQUE INDEX "Absence_roomId_unique_idx" ON "Absence"("childId", "roomId", "date");
CREATE UNIQUE INDEX "DailyAttendance_roomId_unique_idx" ON "DailyAttendance"("roomId", "date");
CREATE UNIQUE INDEX "BookingForecast_roomId_unique_idx" ON "BookingForecast"("roomId", "date");
CREATE UNIQUE INDEX "ResponsiblePersonEntry_roomId_unique_idx" ON "ResponsiblePersonEntry"("roomId", "date");
CREATE UNIQUE INDEX "DailyChecklist_roomId_unique_idx" ON "DailyChecklist"("roomId", "date");
CREATE UNIQUE INDEX "CasualDayConfig_roomId_unique_idx" ON "CasualDayConfig"("roomId", "date");
CREATE UNIQUE INDEX "ChildFeeAssignment_roomId_unique_idx" ON "ChildFeeAssignment"("childId", "roomId");
