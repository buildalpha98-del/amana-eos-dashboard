-- Restores schema-only additions omitted from the original migration history.
-- Ordered before their first ALTERs; existing tables are intentionally untouched.
-- Do not edit already-applied migrations to repair replay.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'cash', 'card', 'direct_debit', 'other');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."AiTaskDraft"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing AiTaskDraft in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "AiTaskDraft" (
    "id" TEXT NOT NULL,
    "todoId" TEXT,
    "marketingTaskId" TEXT,
    "coworkTodoId" TEXT,
    "ticketId" TEXT,
    "issueId" TEXT,
    "taskType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT 'claude-haiku-3-5-20241022',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTaskDraft_pkey" PRIMARY KEY ("id")
);
    CREATE INDEX "AiTaskDraft_todoId_idx" ON "AiTaskDraft"("todoId");
    CREATE INDEX "AiTaskDraft_marketingTaskId_idx" ON "AiTaskDraft"("marketingTaskId");
    CREATE INDEX "AiTaskDraft_coworkTodoId_idx" ON "AiTaskDraft"("coworkTodoId");
    CREATE INDEX "AiTaskDraft_ticketId_idx" ON "AiTaskDraft"("ticketId");
    CREATE INDEX "AiTaskDraft_issueId_idx" ON "AiTaskDraft"("issueId");
    CREATE INDEX "AiTaskDraft_status_idx" ON "AiTaskDraft"("status");
    CREATE INDEX "AiTaskDraft_createdAt_idx" ON "AiTaskDraft"("createdAt");
    ALTER TABLE "AiTaskDraft" ADD CONSTRAINT "AiTaskDraft_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AiTaskDraft" ADD CONSTRAINT "AiTaskDraft_marketingTaskId_fkey" FOREIGN KEY ("marketingTaskId") REFERENCES "MarketingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AiTaskDraft" ADD CONSTRAINT "AiTaskDraft_coworkTodoId_fkey" FOREIGN KEY ("coworkTodoId") REFERENCES "CoworkTodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AiTaskDraft" ADD CONSTRAINT "AiTaskDraft_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AiTaskDraft" ADD CONSTRAINT "AiTaskDraft_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "AiTaskDraft" ADD CONSTRAINT "AiTaskDraft_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."ParentMagicLink"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing ParentMagicLink in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "ParentMagicLink" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentMagicLink_pkey" PRIMARY KEY ("id")
);
    CREATE UNIQUE INDEX "ParentMagicLink_tokenHash_key" ON "ParentMagicLink"("tokenHash");
    CREATE INDEX "ParentMagicLink_email_idx" ON "ParentMagicLink"("email");
    CREATE INDEX "ParentMagicLink_tokenHash_idx" ON "ParentMagicLink"("tokenHash");
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."StatementLineItem"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing StatementLineItem in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "StatementLineItem" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "description" TEXT NOT NULL,
    "grossFee" DOUBLE PRECISION NOT NULL,
    "ccsHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ccsRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ccsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gapAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementLineItem_pkey" PRIMARY KEY ("id")
);
    CREATE INDEX "StatementLineItem_statementId_idx" ON "StatementLineItem"("statementId");
    ALTER TABLE "StatementLineItem" ADD CONSTRAINT "StatementLineItem_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "StatementLineItem" ADD CONSTRAINT "StatementLineItem_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."Payment"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing Payment in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "statementId" TEXT,
    "contactId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
    CREATE INDEX "Payment_contactId_receivedAt_idx" ON "Payment"("contactId", "receivedAt");
    CREATE INDEX "Payment_statementId_idx" ON "Payment"("statementId");
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."Conversation"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing Conversation in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
    CREATE INDEX "Conversation_serviceId_status_lastMessageAt_idx" ON "Conversation"("serviceId", "status", "lastMessageAt");
    CREATE INDEX "Conversation_familyId_lastMessageAt_idx" ON "Conversation"("familyId", "lastMessageAt");
    ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CentreContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."Message"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing Message in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
    CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
    CREATE INDEX "Message_senderId_senderType_idx" ON "Message"("senderId", "senderType");
    ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."Broadcast"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing Broadcast in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);
    CREATE INDEX "Broadcast_serviceId_sentAt_idx" ON "Broadcast"("serviceId", "sentAt");
    ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."EnrolmentApplication"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing EnrolmentApplication in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "EnrolmentApplication" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "type" TEXT NOT NULL DEFAULT 'sibling',
    "childFirstName" TEXT NOT NULL,
    "childLastName" TEXT NOT NULL,
    "childDateOfBirth" DATE NOT NULL,
    "childGender" TEXT,
    "childSchool" TEXT,
    "childYear" TEXT,
    "sessionTypes" TEXT[],
    "startDate" DATE,
    "medicalConditions" TEXT[],
    "dietaryRequirements" TEXT[],
    "medicationDetails" TEXT,
    "anaphylaxisActionPlan" TEXT,
    "additionalNeeds" TEXT,
    "consentPhotography" BOOLEAN NOT NULL DEFAULT false,
    "consentSunscreen" BOOLEAN NOT NULL DEFAULT false,
    "consentFirstAid" BOOLEAN NOT NULL DEFAULT false,
    "consentExcursions" BOOLEAN NOT NULL DEFAULT false,
    "copyAuthorisedPickups" BOOLEAN NOT NULL DEFAULT true,
    "copyEmergencyContacts" BOOLEAN NOT NULL DEFAULT true,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "notes" TEXT,
    "createdChildId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrolmentApplication_pkey" PRIMARY KEY ("id")
);
    CREATE INDEX "EnrolmentApplication_serviceId_status_idx" ON "EnrolmentApplication"("serviceId", "status");
    CREATE INDEX "EnrolmentApplication_familyId_status_idx" ON "EnrolmentApplication"("familyId", "status");
    ALTER TABLE "EnrolmentApplication" ADD CONSTRAINT "EnrolmentApplication_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "EnrolmentApplication" ADD CONSTRAINT "EnrolmentApplication_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CentreContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "EnrolmentApplication" ADD CONSTRAINT "EnrolmentApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."NotificationLog"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing NotificationLog in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "errorMessage" TEXT,
    "relatedId" TEXT,
    "relatedType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);
    CREATE INDEX "NotificationLog_type_createdAt_idx" ON "NotificationLog"("type", "createdAt");
    CREATE INDEX "NotificationLog_recipientEmail_createdAt_idx" ON "NotificationLog"("recipientEmail", "createdAt");
    CREATE INDEX "NotificationLog_relatedId_relatedType_idx" ON "NotificationLog"("relatedId", "relatedType");
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public."ParentAuthToken"') IS NULL THEN
    IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name >= '20260422120000') THEN
      RAISE EXCEPTION 'Missing ParentAuthToken in an already-migrated database; investigate schema drift before deploying';
    END IF;
    END IF;
    CREATE TABLE "ParentAuthToken" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentAuthToken_pkey" PRIMARY KEY ("id")
);
    CREATE UNIQUE INDEX "ParentAuthToken_token_key" ON "ParentAuthToken"("token");
    CREATE INDEX "ParentAuthToken_token_idx" ON "ParentAuthToken"("token");
    ALTER TABLE "ParentAuthToken" ADD CONSTRAINT "ParentAuthToken_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CentreContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
