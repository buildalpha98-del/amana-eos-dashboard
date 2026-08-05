-- CreateEnum
CREATE TYPE "CreativeRequestType" AS ENUM ('flyer', 'poster', 'social_tile', 'table_cover', 'banner_signage', 'email_header', 'merch', 'other');

-- CreateEnum
CREATE TYPE "CreativeRequestStatus" AS ENUM ('new', 'briefed', 'in_progress', 'in_review', 'changes_requested', 'approved', 'delivered', 'cancelled');

-- CreateTable
CREATE TABLE "CreativeRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CreativeRequestType" NOT NULL,
    "status" "CreativeRequestStatus" NOT NULL DEFAULT 'new',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "serviceId" TEXT,
    "requestedById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "purpose" TEXT NOT NULL,
    "exactCopy" TEXT,
    "sizeSpec" TEXT,
    "outputFormat" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "briefedAt" TIMESTAMP(3),
    "inProgressAt" TIMESTAMP(3),
    "inReviewAt" TIMESTAMP(3),
    "changesRequestedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeRequestMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeRequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeRequestAttachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "messageId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeRequestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreativeRequest_requestNumber_key" ON "CreativeRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "CreativeRequest_status_idx" ON "CreativeRequest"("status");

-- CreateIndex
CREATE INDEX "CreativeRequest_assigneeId_idx" ON "CreativeRequest"("assigneeId");

-- CreateIndex
CREATE INDEX "CreativeRequest_requestedById_idx" ON "CreativeRequest"("requestedById");

-- CreateIndex
CREATE INDEX "CreativeRequest_serviceId_idx" ON "CreativeRequest"("serviceId");

-- CreateIndex
CREATE INDEX "CreativeRequest_dueDate_idx" ON "CreativeRequest"("dueDate");

-- CreateIndex
CREATE INDEX "CreativeRequest_createdAt_idx" ON "CreativeRequest"("createdAt");

-- CreateIndex
CREATE INDEX "CreativeRequestMessage_requestId_idx" ON "CreativeRequestMessage"("requestId");

-- CreateIndex
CREATE INDEX "CreativeRequestAttachment_requestId_idx" ON "CreativeRequestAttachment"("requestId");

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequestMessage" ADD CONSTRAINT "CreativeRequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CreativeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequestMessage" ADD CONSTRAINT "CreativeRequestMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequestAttachment" ADD CONSTRAINT "CreativeRequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CreativeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequestAttachment" ADD CONSTRAINT "CreativeRequestAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CreativeRequestMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequestAttachment" ADD CONSTRAINT "CreativeRequestAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

