-- End of Stage 1: roomId becomes required (docs/rooms-migration-plan.md).
--
-- The gate passed — every row carrying a session slot resolved to a
-- room — so the nullable window can close. This is what keeps it closed:
-- from here a write that fails to resolve a room FAILS, loudly, instead
-- of leaving a null that nothing notices until Stage 2 moves a read and
-- the record goes invisible.
--
-- Only the models where `sessionType` is itself required. On
-- FamilyDiscount, ServiceBlockOutDate, ServiceExcursion and
-- ServiceHeadcount a null slot means "applies to the whole service", so
-- a null room is the correct answer there and must stay legal.
--
-- The foreign key changes with it. ON DELETE SET NULL is meaningless
-- against a NOT NULL column; RESTRICT is also the honest rule — a room
-- with attendance behind it must not be deletable, only retired.

-- ── Absence ──
ALTER TABLE "Absence" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "Absence" DROP CONSTRAINT "Absence_roomId_fkey";
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── AttendanceRecord ──
ALTER TABLE "AttendanceRecord" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "AttendanceRecord" DROP CONSTRAINT "AttendanceRecord_roomId_fkey";
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Booking ──
ALTER TABLE "Booking" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_roomId_fkey";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── BookingForecast ──
ALTER TABLE "BookingForecast" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "BookingForecast" DROP CONSTRAINT "BookingForecast_roomId_fkey";
ALTER TABLE "BookingForecast" ADD CONSTRAINT "BookingForecast_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── CasualDayConfig ──
ALTER TABLE "CasualDayConfig" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "CasualDayConfig" DROP CONSTRAINT "CasualDayConfig_roomId_fkey";
ALTER TABLE "CasualDayConfig" ADD CONSTRAINT "CasualDayConfig_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ChildFeeAssignment ──
ALTER TABLE "ChildFeeAssignment" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "ChildFeeAssignment" DROP CONSTRAINT "ChildFeeAssignment_roomId_fkey";
ALTER TABLE "ChildFeeAssignment" ADD CONSTRAINT "ChildFeeAssignment_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ConversionOpportunity ──
ALTER TABLE "ConversionOpportunity" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "ConversionOpportunity" DROP CONSTRAINT "ConversionOpportunity_roomId_fkey";
ALTER TABLE "ConversionOpportunity" ADD CONSTRAINT "ConversionOpportunity_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── DailyAttendance ──
ALTER TABLE "DailyAttendance" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "DailyAttendance" DROP CONSTRAINT "DailyAttendance_roomId_fkey";
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── DailyChecklist ──
ALTER TABLE "DailyChecklist" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "DailyChecklist" DROP CONSTRAINT "DailyChecklist_roomId_fkey";
ALTER TABLE "DailyChecklist" ADD CONSTRAINT "DailyChecklist_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ResponsiblePersonEntry ──
ALTER TABLE "ResponsiblePersonEntry" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "ResponsiblePersonEntry" DROP CONSTRAINT "ResponsiblePersonEntry_roomId_fkey";
ALTER TABLE "ResponsiblePersonEntry" ADD CONSTRAINT "ResponsiblePersonEntry_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RosterShift ──
ALTER TABLE "RosterShift" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "RosterShift" DROP CONSTRAINT "RosterShift_roomId_fkey";
ALTER TABLE "RosterShift" ADD CONSTRAINT "RosterShift_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ServiceFeeChange ──
ALTER TABLE "ServiceFeeChange" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "ServiceFeeChange" DROP CONSTRAINT "ServiceFeeChange_roomId_fkey";
ALTER TABLE "ServiceFeeChange" ADD CONSTRAINT "ServiceFeeChange_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ShiftTemplate ──
ALTER TABLE "ShiftTemplate" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "ShiftTemplate" DROP CONSTRAINT "ShiftTemplate_roomId_fkey";
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── StatementLineItem ──
ALTER TABLE "StatementLineItem" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "StatementLineItem" DROP CONSTRAINT "StatementLineItem_roomId_fkey";
ALTER TABLE "StatementLineItem" ADD CONSTRAINT "StatementLineItem_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
