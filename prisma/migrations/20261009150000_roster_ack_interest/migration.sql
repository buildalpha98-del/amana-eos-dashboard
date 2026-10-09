-- OWNA parity (2026-10-09): "I've seen my shifts" + "I'm interested" on open shifts.
ALTER TABLE "RosterShift" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);

CREATE TABLE "ShiftInterest" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftInterest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShiftInterest_shiftId_userId_key" ON "ShiftInterest"("shiftId", "userId");
CREATE INDEX "ShiftInterest_userId_idx" ON "ShiftInterest"("userId");
ALTER TABLE "ShiftInterest" ADD CONSTRAINT "ShiftInterest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "RosterShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftInterest" ADD CONSTRAINT "ShiftInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
