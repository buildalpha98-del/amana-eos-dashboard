-- CreateEnum
CREATE TYPE "ParentPostType" AS ENUM ('observation', 'announcement', 'reminder');

-- CreateTable
CREATE TABLE "ParentPost" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "ParentPostType" NOT NULL DEFAULT 'observation',
    "mediaUrls" TEXT[],
    "authorId" TEXT,
    "isCommunity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentPostChildTag" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,

    CONSTRAINT "ParentPostChildTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentNotification" (
    "id" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "signInTime" TIMESTAMP(3),
    "signOutTime" TIMESTAMP(3),
    "signedInById" TEXT,
    "signedOutById" TEXT,
    "absenceReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentPost_serviceId_idx" ON "ParentPost"("serviceId");
CREATE INDEX "ParentPost_createdAt_idx" ON "ParentPost"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParentPostChildTag_postId_childId_key" ON "ParentPostChildTag"("postId", "childId");
CREATE INDEX "ParentPostChildTag_childId_idx" ON "ParentPostChildTag"("childId");

-- CreateIndex
CREATE INDEX "ParentNotification_parentEmail_read_idx" ON "ParentNotification"("parentEmail", "read");
CREATE INDEX "ParentNotification_parentEmail_createdAt_idx" ON "ParentNotification"("parentEmail", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_childId_serviceId_date_sessionType_key" ON "AttendanceRecord"("childId", "serviceId", "date", "sessionType");
CREATE INDEX "AttendanceRecord_serviceId_date_sessionType_idx" ON "AttendanceRecord"("serviceId", "date", "sessionType");
CREATE INDEX "AttendanceRecord_childId_idx" ON "AttendanceRecord"("childId");

-- AddForeignKey
ALTER TABLE "ParentPost" ADD CONSTRAINT "ParentPost_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentPost" ADD CONSTRAINT "ParentPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentPostChildTag" ADD CONSTRAINT "ParentPostChildTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ParentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParentPostChildTag" ADD CONSTRAINT "ParentPostChildTag_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_signedInById_fkey" FOREIGN KEY ("signedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_signedOutById_fkey" FOREIGN KEY ("signedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
