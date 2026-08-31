-- Who actually signed a child in or out.
--
-- signedInById references User (staff only); Reg 158 wants a record of
-- the person who delivered or collected the child. Stored as name +
-- method + signature rather than an FK, because that person is usually an
-- authorised pickup or a grandparent with no login.
--
-- Additive + IF NOT EXISTS so a re-run is a no-op.
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "signedInByName" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "signedOutByName" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "signedInMethod" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "signedOutMethod" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "signedInSignature" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "signedOutSignature" TEXT;
