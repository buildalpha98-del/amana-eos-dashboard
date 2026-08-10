-- Which fee a child is charged at, in one room.
--
-- The link the fees matrix was missing: a Booking records child, date and
-- ROOM, never which of that room's fees applies. Without this there is no
-- way to answer "how many children are on this rate", and no way to charge
-- two children in the same room differently.
CREATE TABLE "ChildFeeAssignment" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "feeTierId" TEXT NOT NULL,
    -- Denormalised so the assignment still reads after a tier is renamed
    -- or archived. A row saying "fee-3" answers nothing when a parent
    -- rings about their invoice.
    "feeName" TEXT NOT NULL,
    "effectiveFrom" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildFeeAssignment_pkey" PRIMARY KEY ("id")
);

-- One fee per child per room. A child in both before- and after-school
-- care has two rows; they cannot be on two fees for the SAME room.
CREATE UNIQUE INDEX "ChildFeeAssignment_childId_sessionType_key"
    ON "ChildFeeAssignment"("childId", "sessionType");

-- The "Applied To" count.
CREATE INDEX "ChildFeeAssignment_serviceId_sessionType_feeTierId_idx"
    ON "ChildFeeAssignment"("serviceId", "sessionType", "feeTierId");
CREATE INDEX "ChildFeeAssignment_feeTierId_idx"
    ON "ChildFeeAssignment"("feeTierId");

ALTER TABLE "ChildFeeAssignment" ADD CONSTRAINT "ChildFeeAssignment_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildFeeAssignment" ADD CONSTRAINT "ChildFeeAssignment_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL: an assignment must outlive the account of whoever made it.
ALTER TABLE "ChildFeeAssignment" ADD CONSTRAINT "ChildFeeAssignment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
