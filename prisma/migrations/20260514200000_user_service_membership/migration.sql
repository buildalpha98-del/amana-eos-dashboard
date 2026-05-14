-- 2026-05-14: UserServiceMembership v1.
--
-- Additive only. Existing User.serviceId remains the staff member's
-- primary/home service. These rows model ADDITIONAL service memberships
-- so a single staff member can be at multiple centres with a per-service
-- role + access level.
--
-- Soft delete: removing a member flips status=inactive and sets endDate.
-- The unique constraint on (userId, serviceId) means re-adding flips an
-- existing inactive row back rather than creating a duplicate.

-- CreateEnum ServiceAccessLevel
CREATE TYPE "ServiceAccessLevel" AS ENUM (
  'view_only',
  'contributor',
  'admin'
);

-- CreateEnum ServiceMembershipStatus
CREATE TYPE "ServiceMembershipStatus" AS ENUM (
  'active',
  'inactive'
);

-- CreateTable UserServiceMembership
CREATE TABLE "UserServiceMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "roleAtService" TEXT NOT NULL,
  "accessLevel" "ServiceAccessLevel" NOT NULL DEFAULT 'contributor',
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "status" "ServiceMembershipStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserServiceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserServiceMembership_userId_serviceId_key"
  ON "UserServiceMembership"("userId", "serviceId");

-- CreateIndex
CREATE INDEX "UserServiceMembership_serviceId_status_idx"
  ON "UserServiceMembership"("serviceId", "status");

-- CreateIndex
CREATE INDEX "UserServiceMembership_userId_status_idx"
  ON "UserServiceMembership"("userId", "status");

-- AddForeignKey
ALTER TABLE "UserServiceMembership"
  ADD CONSTRAINT "UserServiceMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserServiceMembership"
  ADD CONSTRAINT "UserServiceMembership_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
