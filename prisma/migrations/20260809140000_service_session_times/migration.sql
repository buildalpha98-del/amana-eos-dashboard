-- The centre's session-of-care catalogue: the windows of care it sells.
-- Every fee in every room names one of these, so the window reported to
-- CCS is identical across rooms instead of retyped per fee.
--
-- Times are "HH:mm" wall-clock strings in the centre's local time, not
-- timestamps — these are opening hours and must survive daylight saving
-- in both directions.
CREATE TABLE "ServiceSessionTime" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceSessionTime_pkey" PRIMARY KEY ("id")
);

-- The same window twice is always a mistake, and two identical rows in
-- the Session of Care dropdown is the kind of thing nobody reports.
CREATE UNIQUE INDEX "ServiceSessionTime_serviceId_start_end_key"
    ON "ServiceSessionTime"("serviceId", "start", "end");

CREATE INDEX "ServiceSessionTime_serviceId_active_idx"
    ON "ServiceSessionTime"("serviceId", "active");

ALTER TABLE "ServiceSessionTime" ADD CONSTRAINT "ServiceSessionTime_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE: a session time must outlive the account
-- of whoever added it.
ALTER TABLE "ServiceSessionTime" ADD CONSTRAINT "ServiceSessionTime_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
