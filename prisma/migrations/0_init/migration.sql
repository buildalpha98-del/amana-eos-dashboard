-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'head_office', 'admin', 'marketing', 'coordinator', 'member', 'staff');

-- CreateEnum
CREATE TYPE "RockStatus" AS ENUM ('on_track', 'off_track', 'complete', 'dropped');

-- CreateEnum
CREATE TYPE "RockPriority" AS ENUM ('critical', 'high', 'medium');

-- CreateEnum
CREATE TYPE "RockType" AS ENUM ('company', 'personal');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('pending', 'in_progress', 'complete', 'cancelled');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('open', 'in_discussion', 'solved', 'closed');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('on_track', 'at_risk', 'off_track', 'complete');

-- CreateEnum
CREATE TYPE "GoalDirection" AS ENUM ('above', 'below', 'exact');

-- CreateEnum
CREATE TYPE "MeasurableFrequency" AS ENUM ('weekly', 'monthly');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('active', 'onboarding', 'pipeline', 'closing', 'closed');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('bsc', 'asc', 'vc');

-- CreateEnum
CREATE TYPE "WeekDay" AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday');

-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('morning_tea', 'lunch', 'afternoon_tea');

-- CreateEnum
CREATE TYPE "ActivityCategory" AS ENUM ('physical_play', 'creative_arts', 'music_movement', 'literacy', 'numeracy', 'nature_outdoors', 'cooking_nutrition', 'social_emotional', 'quiet_time', 'free_play', 'quran_iqra', 'homework_help', 'stem_science', 'other');

-- CreateEnum
CREATE TYPE "BudgetItemCategory" AS ENUM ('groceries', 'kitchen', 'sports', 'art_craft', 'furniture', 'technology', 'cleaning', 'safety', 'other');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('not_started', 'in_progress', 'complete', 'on_hold', 'cancelled');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "MarketingPlatform" AS ENUM ('facebook', 'instagram', 'linkedin', 'tiktok', 'email', 'newsletter', 'website', 'flyer');

-- CreateEnum
CREATE TYPE "SocialConnectionStatus" AS ENUM ('connected', 'disconnected', 'expired', 'error');

-- CreateEnum
CREATE TYPE "MarketingPostStatus" AS ENUM ('draft', 'in_review', 'approved', 'scheduled', 'published');

-- CreateEnum
CREATE TYPE "MarketingCampaignType" AS ENUM ('campaign', 'event', 'launch', 'promotion', 'awareness', 'partnership', 'activation');

-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('draft', 'scheduled', 'active', 'completed', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "MarketingRecurrence" AS ENUM ('none', 'weekly', 'fortnightly', 'monthly');

-- CreateEnum
CREATE TYPE "MarketingKPIPeriod" AS ENUM ('weekly', 'monthly', 'quarterly', 'yearly');

-- CreateEnum
CREATE TYPE "MarketingAssetType" AS ENUM ('image', 'video', 'document', 'template', 'graphic');

-- CreateEnum
CREATE TYPE "MarketingHashtagCategory" AS ENUM ('brand', 'campaign', 'platform', 'trending');

-- CreateEnum
CREATE TYPE "MarketingKPICategory" AS ENUM ('engagement', 'growth', 'content', 'conversion', 'retention');

-- CreateEnum
CREATE TYPE "MarketingTaskStatus" AS ENUM ('todo', 'in_progress', 'in_review', 'done');

-- CreateEnum
CREATE TYPE "MarketingTaskPriority" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('casual', 'part_time', 'permanent', 'fixed_term');

-- CreateEnum
CREATE TYPE "VisaStatus" AS ENUM ('citizen', 'permanent_resident', 'work_visa', 'student_visa', 'bridging_visa', 'other');

-- CreateEnum
CREATE TYPE "QualificationType" AS ENUM ('cert_iii', 'diploma', 'bachelor', 'masters', 'first_aid', 'wwcc', 'other');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('contract_draft', 'active', 'superseded', 'terminated');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('ct_casual', 'ct_part_time', 'ct_permanent', 'ct_fixed_term');

-- CreateEnum
CREATE TYPE "AwardLevel" AS ENUM ('es1', 'es2', 'es3', 'es4', 'cs1', 'cs2', 'cs3', 'cs4', 'director', 'coordinator', 'custom');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('annual', 'sick', 'personal', 'unpaid', 'long_service', 'parental', 'compassionate');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('leave_pending', 'leave_approved', 'leave_rejected', 'leave_cancelled');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('ts_draft', 'submitted', 'approved', 'exported_to_xero', 'rejected');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('shift_bsc', 'shift_asc', 'shift_vac', 'pd', 'shift_admin', 'shift_other');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('tender', 'direct', 'build_alpha_kids', 'referral', 'community_connection');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('new_lead', 'reviewing', 'contact_made', 'follow_up_1', 'follow_up_2', 'meeting_booked', 'proposal_sent', 'submitted', 'negotiating', 'won', 'lost', 'on_hold');

-- CreateEnum
CREATE TYPE "TouchpointType" AS ENUM ('email_sent', 'call', 'meeting', 'note', 'stage_change', 'auto_email');

-- CreateEnum
CREATE TYPE "BoardReportStatus" AS ENUM ('draft', 'final', 'sent');

-- CreateEnum
CREATE TYPE "AttendeeStatus" AS ENUM ('present', 'absent');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('program', 'policy', 'procedure', 'template', 'guide', 'compliance', 'financial', 'marketing', 'hr', 'other');

-- CreateEnum
CREATE TYPE "FinancialPeriodType" AS ENUM ('weekly', 'monthly', 'quarterly');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('new', 'open', 'pending_parent', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('urgent', 'high', 'normal', 'low');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('all', 'owners_admins', 'managers', 'custom');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('normal', 'important', 'urgent');

-- CreateEnum
CREATE TYPE "XeroConnectionStatus" AS ENUM ('connected', 'disconnected', 'error');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('not_started', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "LMSCourseStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "LMSModuleType" AS ENUM ('document', 'video', 'quiz', 'checklist', 'external_link');

-- CreateEnum
CREATE TYPE "LMSEnrollmentStatus" AS ENUM ('enrolled', 'in_progress', 'completed', 'expired');

-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('wwcc', 'first_aid', 'anaphylaxis', 'asthma', 'cpr', 'police_check', 'annual_review', 'child_protection', 'geccko', 'food_safety', 'food_handler', 'other');

-- CreateEnum
CREATE TYPE "RecurrenceRule" AS ENUM ('daily', 'weekly', 'fortnightly', 'monthly', 'quarterly');

-- CreateEnum
CREATE TYPE "AuditFrequency" AS ENUM ('monthly', 'half_yearly', 'yearly');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'overdue', 'skipped');

-- CreateEnum
CREATE TYPE "AuditItemResult" AS ENUM ('yes', 'no', 'na', 'not_answered');

-- CreateEnum
CREATE TYPE "AuditResponseFormat" AS ENUM ('yes_no', 'rating_1_5', 'compliant', 'reverse_yes_no', 'review_date', 'inventory');

-- CreateEnum
CREATE TYPE "ReflectionType" AS ENUM ('daily_reflection', 'friday_review', 'child_observation', 'iqra_feedback');

-- CreateEnum
CREATE TYPE "EmailTemplateCategory" AS ENUM ('welcome', 'newsletter', 'event', 'announcement', 'enrolment', 'nurture', 'custom');

-- CreateEnum
CREATE TYPE "SequenceType" AS ENUM ('parent_nurture', 'crm_outreach');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "avatar" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "serviceId" TEXT,
    "state" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "mfaSecret" TEXT,
    "mfaBackupCodes" TEXT[],
    "mfaEnabledAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT,
    "dateOfBirth" DATE,
    "addressStreet" TEXT,
    "addressSuburb" TEXT,
    "addressState" TEXT,
    "addressPostcode" TEXT,
    "taxFileNumber" TEXT,
    "superFundName" TEXT,
    "superMemberNumber" TEXT,
    "superUSI" TEXT,
    "visaStatus" "VisaStatus",
    "visaExpiry" DATE,
    "employmentType" "EmploymentType",
    "startDate" DATE,
    "probationEndDate" DATE,
    "bankDetailsNote" TEXT,
    "bankAccountName" TEXT,
    "bankBSB" TEXT,
    "bankAccountNumber" TEXT,
    "xeroEmployeeId" TEXT,
    "gettingStartedProgress" JSONB,
    "notificationPrefs" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'microsoft',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionTractionOrganiser" (
    "id" TEXT NOT NULL,
    "coreValues" TEXT[],
    "corePurpose" TEXT,
    "coreNiche" TEXT,
    "tenYearTarget" TEXT,
    "threeYearPicture" TEXT,
    "marketingStrategy" TEXT,
    "sectionLabels" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "VisionTractionOrganiser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneYearGoal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" TIMESTAMP(3),
    "status" "GoalStatus" NOT NULL DEFAULT 'on_track',
    "vtoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneYearGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rock" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "quarter" TEXT NOT NULL,
    "status" "RockStatus" NOT NULL DEFAULT 'on_track',
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "priority" "RockPriority" NOT NULL DEFAULT 'medium',
    "rockType" "RockType" NOT NULL DEFAULT 'personal',
    "oneYearGoalId" TEXT,
    "serviceId" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "rockId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "rockId" TEXT,
    "issueId" TEXT,
    "serviceId" TEXT,
    "projectId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "TodoStatus" NOT NULL DEFAULT 'pending',
    "weekOf" TIMESTAMP(3) NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoAssignee" (
    "id" TEXT NOT NULL,
    "todoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TodoAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "raisedById" TEXT,
    "ownerId" TEXT,
    "rockId" TEXT,
    "serviceId" TEXT,
    "priority" "IssuePriority" NOT NULL DEFAULT 'medium',
    "status" "IssueStatus" NOT NULL DEFAULT 'open',
    "category" TEXT,
    "identifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discussedAt" TIMESTAMP(3),
    "solvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scorecard" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurable" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "goalValue" DOUBLE PRECISION NOT NULL,
    "goalDirection" "GoalDirection" NOT NULL DEFAULT 'above',
    "unit" TEXT,
    "frequency" "MeasurableFrequency" NOT NULL DEFAULT 'weekly',
    "rockId" TEXT,
    "scorecardId" TEXT NOT NULL,
    "serviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Measurable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurableEntry" (
    "id" TEXT NOT NULL,
    "measurableId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "onTrack" BOOLEAN NOT NULL,
    "notes" TEXT,
    "enteredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasurableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "cronName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "details" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardReport" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "BoardReportStatus" NOT NULL DEFAULT 'draft',
    "data" JSONB NOT NULL,
    "executiveSummary" TEXT,
    "financialNarrative" TEXT,
    "operationsNarrative" TEXT,
    "complianceNarrative" TEXT,
    "growthNarrative" TEXT,
    "peopleNarrative" TEXT,
    "rocksNarrative" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MarketingCampaignType" NOT NULL DEFAULT 'campaign',
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "platforms" "MarketingPlatform"[],
    "goal" TEXT,
    "notes" TEXT,
    "designLink" TEXT,
    "budget" DOUBLE PRECISION,
    "location" TEXT,
    "deliverables" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platform" "MarketingPlatform" NOT NULL,
    "status" "MarketingPostStatus" NOT NULL DEFAULT 'draft',
    "scheduledDate" TIMESTAMP(3),
    "content" TEXT,
    "notes" TEXT,
    "designLink" TEXT,
    "canvaDesignId" TEXT,
    "canvaDesignUrl" TEXT,
    "canvaExportUrl" TEXT,
    "pillar" TEXT,
    "assigneeId" TEXT,
    "campaignId" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "recurring" "MarketingRecurrence" NOT NULL DEFAULT 'none',
    "recurringParentId" TEXT,
    "clonedFromId" TEXT,
    "externalPostId" TEXT,
    "externalUrl" TEXT,
    "engagementSyncedAt" TIMESTAMP(3),
    "deliveryLogId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingPostRevision" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingPostRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingComment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingKPI" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "period" "MarketingKPIPeriod" NOT NULL DEFAULT 'monthly',
    "category" "MarketingKPICategory" NOT NULL DEFAULT 'engagement',
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingKPI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MarketingAssetType" NOT NULL DEFAULT 'image',
    "url" TEXT NOT NULL,
    "tags" TEXT[],
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "MarketingPlatform" NOT NULL,
    "pillar" TEXT,
    "content" TEXT NOT NULL,
    "notes" TEXT,
    "hashtags" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingHashtagSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MarketingHashtagCategory" NOT NULL,
    "tags" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingHashtagSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolComm" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "schoolName" TEXT,
    "contactEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "termWeek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolComm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoComplianceLog" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoComplianceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolRelationship" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "principalName" TEXT,
    "principalEmail" TEXT,
    "lastContactDate" DATE,
    "contactMethod" TEXT,
    "contactNotes" TEXT,
    "relationshipScore" INTEGER,
    "contractStart" DATE,
    "contractEnd" DATE,
    "renewalStatus" TEXT NOT NULL DEFAULT 'active',
    "riskFlags" TEXT[],
    "nextAction" TEXT,
    "nextActionDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partnership" (
    "id" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "principalName" TEXT,
    "principalEmail" TEXT,
    "relationshipScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "facilityAccess" JSONB,
    "lastPrincipalMeeting" TIMESTAMP(3),
    "lastSchoolEvent" TIMESTAMP(3),
    "newsletterInclusion" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "actionPlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpsSurveyResponse" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "category" TEXT NOT NULL,
    "followUpStatus" TEXT NOT NULL DEFAULT 'pending',
    "followUpNote" TEXT,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpsSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermCalendarEntry" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "serviceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "assigneeId" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MarketingTaskStatus" NOT NULL DEFAULT 'todo',
    "priority" "MarketingTaskPriority" NOT NULL DEFAULT 'medium',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "campaignId" TEXT,
    "postId" TEXT,
    "serviceId" TEXT,
    "subtasks" JSONB,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTaskTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingTaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTaskTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "MarketingTaskPriority" NOT NULL DEFAULT 'medium',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "daysOffset" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MarketingTaskTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignActivationAssignment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "assigned" BOOLEAN NOT NULL DEFAULT true,
    "coordinatorId" TEXT,
    "budget" DOUBLE PRECISION,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignActivationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "suburb" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'active',
    "managerId" TEXT,
    "capacity" INTEGER,
    "operatingDays" TEXT,
    "notes" TEXT,
    "bscDailyRate" DOUBLE PRECISION,
    "ascDailyRate" DOUBLE PRECISION,
    "vcDailyRate" DOUBLE PRECISION,
    "bscCasualRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ascCasualRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bscGroceryRate" DOUBLE PRECISION NOT NULL DEFAULT 0.80,
    "ascGroceryRate" DOUBLE PRECISION NOT NULL DEFAULT 1.20,
    "vcGroceryRate" DOUBLE PRECISION NOT NULL DEFAULT 4.50,
    "monthlyPurchaseBudget" DOUBLE PRECISION,
    "xeroTrackingOptionId" TEXT,
    "ownaServiceId" TEXT,
    "ownaLocationId" TEXT,
    "ownaSyncedAt" TIMESTAMP(3),
    "schoolPopulation" INTEGER,
    "ascTarget" INTEGER,
    "bscTarget" INTEGER,
    "weeklyAttendanceTarget" INTEGER,
    "parentSegment" TEXT,
    "parentDriver" TEXT,
    "launchDate" TIMESTAMP(3),
    "launchPhase" TEXT,
    "orientationVideoUrl" TEXT,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "licenceFeeAnnual" DOUBLE PRECISION,
    "schoolPrincipalName" TEXT,
    "schoolPrincipalEmail" TEXT,
    "schoolBusinessManagerName" TEXT,
    "schoolBusinessManagerEmail" TEXT,
    "lastPrincipalVisit" TIMESTAMP(3),
    "buildAlphaKidsActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplateTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "defaultDays" INTEGER,

    CONSTRAINT "ProjectTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceId" TEXT,
    "templateId" TEXT,
    "ownerId" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'not_started',
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'scheduled',
    "currentSection" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "notes" TEXT,
    "headlines" TEXT,
    "segueNotes" TEXT,
    "concludeNotes" TEXT,
    "cascadeMessages" TEXT,
    "serviceIds" TEXT[],
    "rockIds" TEXT[],
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AttendeeStatus" NOT NULL DEFAULT 'present',
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DocumentCategory" NOT NULL DEFAULT 'other',
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "centreId" TEXT,
    "uploadedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[],
    "folderId" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "rockId" TEXT,
    "issueId" TEXT,
    "projectId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPeriod" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "periodType" "FinancialPeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "bscRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ascRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vcRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "staffCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foodCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suppliesCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rentCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adminCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "margin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "budgetRevenue" DOUBLE PRECISION,
    "budgetCosts" DOUBLE PRECISION,
    "bscEnrolments" INTEGER NOT NULL DEFAULT 0,
    "ascEnrolments" INTEGER NOT NULL DEFAULT 0,
    "bscAttendance" INTEGER NOT NULL DEFAULT 0,
    "ascAttendance" INTEGER NOT NULL DEFAULT 0,
    "vcAttendance" INTEGER NOT NULL DEFAULT 0,
    "dataSource" TEXT NOT NULL DEFAULT 'manual',
    "xeroSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inputs" JSONB NOT NULL,
    "outputs" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentreMetrics" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bscCapacity" INTEGER NOT NULL DEFAULT 0,
    "ascCapacity" INTEGER NOT NULL DEFAULT 0,
    "bscOccupancy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ascOccupancy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEducators" INTEGER NOT NULL DEFAULT 0,
    "educatorsTurnover" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratioCompliance" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "parentNps" DOUBLE PRECISION,
    "incidentCount" INTEGER NOT NULL DEFAULT 0,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "wwccCompliance" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "firstAidCompliance" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "overallCompliance" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "nqsRating" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentreMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppContact" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT,
    "parentName" TEXT,
    "childName" TEXT,
    "serviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" SERIAL NOT NULL,
    "contactId" TEXT NOT NULL,
    "subject" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'new',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "assignedToId" TEXT,
    "serviceId" TEXT,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "tags" TEXT[],
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEmail" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyPreview" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "linkedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "waMessageId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "senderName" TEXT,
    "agentId" TEXT,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "deliveryStatus" "MessageDeliveryStatus" NOT NULL DEFAULT 'sent',
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "shortcut" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'all',
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'normal',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "serviceId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CascadeMessage" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CascadeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CascadeAcknowledgment" (
    "id" TEXT NOT NULL,
    "cascadeMessageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CascadeAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPulse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "wins" TEXT,
    "priorities" TEXT,
    "blockers" TEXT,
    "mood" INTEGER,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyPulse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "name" TEXT NOT NULL DEFAULT 'Amana OSHC',
    "primaryColor" TEXT NOT NULL DEFAULT '#004E64',
    "accentColor" TEXT NOT NULL DEFAULT '#FECE00',
    "purchaseBudgetTiers" JSONB,
    "roleVideos" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XeroConnection" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "status" "XeroConnectionStatus" NOT NULL DEFAULT 'disconnected',
    "tenantId" TEXT,
    "tenantName" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "trackingCategoryId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "connectedById" TEXT,
    "syncedFinancialPeriods" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthScore" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'monthly',
    "overallScore" DOUBLE PRECISION NOT NULL,
    "trend" TEXT NOT NULL DEFAULT 'stable',
    "financialScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "operationalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complianceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "satisfactionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "teamCultureScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "financialBreakdown" JSONB,
    "operationalBreakdown" JSONB,
    "complianceBreakdown" JSONB,
    "satisfactionBreakdown" JSONB,
    "teamCultureBreakdown" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XeroAccountMapping" (
    "id" TEXT NOT NULL,
    "xeroConnectionId" TEXT NOT NULL,
    "xeroAccountCode" TEXT NOT NULL,
    "xeroAccountName" TEXT NOT NULL,
    "xeroAccountType" TEXT NOT NULL,
    "localCategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffOnboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'not_started',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffOnboardingProgress" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffOnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LMSCourse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "thumbnail" TEXT,
    "status" "LMSCourseStatus" NOT NULL DEFAULT 'draft',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "serviceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LMSCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LMSModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "LMSModuleType" NOT NULL DEFAULT 'document',
    "content" TEXT,
    "resourceUrl" TEXT,
    "documentId" TEXT,
    "duration" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LMSModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LMSEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "LMSEnrollmentStatus" NOT NULL DEFAULT 'enrolled',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LMSEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LMSModuleProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "timeSpent" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LMSModuleProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCertificate" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "CertificateType" NOT NULL,
    "label" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "alertDays" INTEGER NOT NULL DEFAULT 30,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAttendance" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "enrolled" INTEGER NOT NULL DEFAULT 0,
    "attended" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "casual" INTEGER NOT NULL DEFAULT 0,
    "absent" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" "BudgetItemCategory" NOT NULL DEFAULT 'other',
    "date" DATE NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramActivity" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "day" "WeekDay" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "staffName" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "templateId" TEXT,
    "mtopOutcomes" INTEGER[],
    "programmeBrand" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuWeek" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "notes" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "menuWeekId" TEXT NOT NULL,
    "day" "WeekDay" NOT NULL,
    "slot" "MealSlot" NOT NULL,
    "description" TEXT NOT NULL,
    "allergens" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "howTo" TEXT,
    "resourcesNeeded" TEXT,
    "category" "ActivityCategory" NOT NULL DEFAULT 'other',
    "ageGroup" TEXT,
    "durationMinutes" INTEGER,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityTemplateFile" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityTemplateFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "serviceId" TEXT,
    "recurrence" "RecurrenceRule" NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TodoTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountabilitySeat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "responsibilities" TEXT[],
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountabilitySeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountabilitySeatAssignment" (
    "id" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AccountabilitySeatAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingPostService" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingPostService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaignService" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingCampaignService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "platform" "MarketingPlatform" NOT NULL,
    "status" "SocialConnectionStatus" NOT NULL DEFAULT 'disconnected',
    "accountId" TEXT,
    "accountName" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "pageAccessToken" TEXT,
    "scopes" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "serviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffQualification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "QualificationType" NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "completedDate" DATE,
    "expiryDate" DATE,
    "certificateUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PolicyStatus" NOT NULL DEFAULT 'draft',
    "category" TEXT,
    "documentUrl" TEXT,
    "documentId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "requiresReack" BOOLEAN NOT NULL DEFAULT true,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAcknowledgement" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentContract" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "awardLevel" "AwardLevel",
    "awardLevelCustom" TEXT,
    "payRate" DOUBLE PRECISION NOT NULL,
    "hoursPerWeek" DOUBLE PRECISION,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "ContractStatus" NOT NULL DEFAULT 'contract_draft',
    "documentUrl" TEXT,
    "documentId" TEXT,
    "signedAt" TIMESTAMP(3),
    "acknowledgedByStaff" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "notes" TEXT,
    "previousContractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalDays" DOUBLE PRECISION NOT NULL,
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'leave_pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "serviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taken" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pending" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "asOfDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "xeroSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "weekEnding" DATE NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'ts_draft',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "exportedAt" TIMESTAMP(3),
    "xeroPayRunId" TEXT,
    "importSource" TEXT DEFAULT 'manual',
    "importFileName" TEXT,
    "notes" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetEntry" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftStart" TIMESTAMP(3) NOT NULL,
    "shiftEnd" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalHours" DOUBLE PRECISION NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "notes" TEXT,
    "isOvertime" BOOLEAN NOT NULL DEFAULT false,
    "payRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffboardingPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffboardingPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffboardingTask" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "assignedTo" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffOffboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'not_started',
    "initiatedById" TEXT,
    "lastDay" DATE,
    "reason" TEXT,
    "exitInterviewNotes" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deactivateOnComplete" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffOffboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffOffboardingProgress" (
    "id" TEXT NOT NULL,
    "offboardingId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffOffboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "allowedIps" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoworkProgram" (
    "id" TEXT NOT NULL,
    "weekCommencing" TIMESTAMP(3) NOT NULL,
    "theme" TEXT NOT NULL,
    "category" TEXT,
    "summary" TEXT,
    "programFileUrl" TEXT,
    "resourceFileUrl" TEXT,
    "displayFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoworkProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoworkTodo" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "dueTime" TEXT,
    "assignedRole" TEXT,
    "assignedToId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoworkTodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoworkAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetCentres" TEXT[],
    "attachments" TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoworkAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "centreId" TEXT,
    "type" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "suburb" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'direct',
    "pipelineStage" "PipelineStage" NOT NULL DEFAULT 'new_lead',
    "tenderRef" TEXT,
    "tenderCloseDate" TIMESTAMP(3),
    "tenderUrl" TEXT,
    "estimatedCapacity" INTEGER,
    "notes" TEXT,
    "buildAlphaKidsStatus" TEXT,
    "communityConnections" TEXT,
    "assignedToId" TEXT,
    "serviceId" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextTouchpointAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "aiScore" INTEGER,
    "aiScoreSummary" TEXT,
    "aiScoredAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TouchpointLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "TouchpointType" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,

    CONSTRAINT "TouchpointLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "triggerStage" "PipelineStage",
    "pipeline" "LeadSource",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmEmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderScrapeRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "leadsFound" INTEGER NOT NULL DEFAULT 0,
    "leadsCreated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "details" JSONB,

    CONSTRAINT "TenderScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentreContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "serviceId" TEXT NOT NULL,
    "subscribed" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "withdrawalDate" TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentreContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickFeedback" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "parentName" TEXT,
    "parentEmail" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExitSurvey" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "contactId" TEXT,
    "childName" TEXT NOT NULL,
    "withdrawalDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "satisfactionScore" INTEGER NOT NULL,
    "enjoyedMost" TEXT,
    "couldImprove" TEXT,
    "wouldReturn" TEXT NOT NULL,
    "surveyToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExitSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppGroup" (
    "id" TEXT NOT NULL,
    "groupType" TEXT NOT NULL,
    "serviceCode" TEXT,
    "whatsappGroupJid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "facebookPageId" TEXT,
    "instagramAccountId" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryLog" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "serviceCode" TEXT,
    "messageType" TEXT,
    "externalId" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "payload" JSONB,
    "entityType" TEXT,
    "entityId" TEXT,
    "subject" TEXT,
    "templateId" TEXT,
    "renderedHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentNurtureStep" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "templateKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "enquiryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentNurtureStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayQuestDay" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "theme" TEXT NOT NULL,
    "morningActivity" TEXT NOT NULL,
    "afternoonActivity" TEXT NOT NULL,
    "isExcursion" BOOLEAN NOT NULL DEFAULT false,
    "excursionVenue" TEXT,
    "excursionCost" DOUBLE PRECISION,
    "materialsNeeded" TEXT,
    "dietaryNotes" TEXT,
    "maxCapacity" INTEGER NOT NULL DEFAULT 40,
    "currentBookings" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HolidayQuestDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingForecast" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "regular" INTEGER NOT NULL DEFAULT 0,
    "casual" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterShift" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "staffName" TEXT NOT NULL,
    "shiftStart" TEXT NOT NULL,
    "shiftEnd" TEXT NOT NULL,
    "role" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionOpportunity" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "familyRef" TEXT NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "casualCount" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'identified',
    "contactedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversionOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "qualityArea" INTEGER NOT NULL,
    "nqsReference" TEXT NOT NULL,
    "frequency" "AuditFrequency" NOT NULL,
    "scheduledMonths" INTEGER[],
    "responseFormat" "AuditResponseFormat" NOT NULL DEFAULT 'yes_no',
    "estimatedMinutes" INTEGER,
    "sourceFileName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "section" TEXT,
    "question" TEXT NOT NULL,
    "guidance" TEXT,
    "responseFormat" "AuditResponseFormat",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditInstance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "scheduledMonth" INTEGER NOT NULL,
    "scheduledYear" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'scheduled',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "auditorId" TEXT,
    "auditorName" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "yesCount" INTEGER NOT NULL DEFAULT 0,
    "noCount" INTEGER NOT NULL DEFAULT 0,
    "naCount" INTEGER NOT NULL DEFAULT 0,
    "complianceScore" DOUBLE PRECISION,
    "strengths" TEXT,
    "areasForImprovement" TEXT,
    "actionPlan" TEXT,
    "comments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditItemResponse" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "result" "AuditItemResult" NOT NULL DEFAULT 'not_answered',
    "ratingValue" INTEGER,
    "actionRequired" TEXT,
    "evidenceSighted" TEXT,
    "notes" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditItemResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentEnquiry" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "parentEmail" TEXT,
    "parentPhone" TEXT,
    "childName" TEXT,
    "childAge" INTEGER,
    "childrenDetails" JSONB,
    "channel" TEXT NOT NULL,
    "parentDriver" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'new_enquiry',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextActionDue" TIMESTAMP(3),
    "ccsEducated" BOOLEAN NOT NULL DEFAULT false,
    "formStarted" BOOLEAN NOT NULL DEFAULT false,
    "formCompleted" BOOLEAN NOT NULL DEFAULT false,
    "firstSessionDate" TIMESTAMP(3),
    "referralId" TEXT,
    "assigneeId" TEXT,
    "notes" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "ownaEnquiryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastEmailSentAt" TIMESTAMP(3),

    CONSTRAINT "ParentEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentEnquiryTouchpoint" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generatedByCowork" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentEnquiryTouchpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "referrerName" TEXT NOT NULL,
    "referrerContactId" TEXT,
    "referredName" TEXT NOT NULL,
    "referredEmail" TEXT,
    "referredPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rewardAmount" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "rewardIssuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentVacancy" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "qualificationRequired" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "postedChannels" TEXT[],
    "postedAt" TIMESTAMP(3),
    "targetFillDate" TIMESTAMP(3),
    "filledAt" TIMESTAMP(3),
    "filledByUserId" TEXT,
    "assignedToId" TEXT,
    "notes" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentVacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentCandidate" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'applied',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interviewNotes" TEXT,
    "referredByUserId" TEXT,
    "notes" TEXT,
    "resumeText" TEXT,
    "resumeFileUrl" TEXT,
    "aiScreenScore" INTEGER,
    "aiScreenSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffReferral" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredName" TEXT NOT NULL,
    "referredEmail" TEXT,
    "candidateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "bonusAmount" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "bonusPaidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPulseSurvey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "q1Happy" INTEGER,
    "q2Supported" INTEGER,
    "q3Schedule" INTEGER,
    "q4Recommend" INTEGER,
    "q5Feedback" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPulseSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverdueFeeRecord" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "parentEmail" TEXT,
    "parentPhone" TEXT,
    "childName" TEXT,
    "invoiceRef" TEXT,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountDue" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL,
    "daysOverdue" INTEGER NOT NULL DEFAULT 0,
    "agingBucket" TEXT NOT NULL DEFAULT 'current',
    "reminderStatus" TEXT NOT NULL DEFAULT 'none',
    "firstReminderSentAt" TIMESTAMP(3),
    "secondReminderSentAt" TIMESTAMP(3),
    "formalNoticeSentAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "notes" TEXT,
    "assigneeId" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverdueFeeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EBITDAAdjustment" (
    "id" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "verifiedByAccountant" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EBITDAAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowPeriod" (
    "id" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "openingBalance" DOUBLE PRECISION NOT NULL,
    "parentFeeReceipts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ccsReceipts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherReceipts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReceipts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payrollPayments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierPayments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rentPayments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overheadPayments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debtRepayments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "investmentOutflows" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPayments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netMovement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashFlowPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityImprovementPlan" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'qip',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lastReviewDate" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityImprovementPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QIPQualityArea" (
    "id" TEXT NOT NULL,
    "qipId" TEXT NOT NULL,
    "qualityArea" INTEGER NOT NULL,
    "qualityAreaName" TEXT NOT NULL,
    "strengths" TEXT,
    "areasForImprovement" TEXT,
    "improvementGoal" TEXT,
    "strategies" TEXT,
    "timeline" TEXT,
    "responsiblePerson" TEXT,
    "evidenceIndicators" TEXT,
    "evidenceCollected" TEXT,
    "progressNotes" TEXT,
    "progressStatus" TEXT NOT NULL DEFAULT 'not_started',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QIPQualityArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentRecord" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "childName" TEXT,
    "incidentType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "location" TEXT,
    "timeOfDay" TEXT,
    "description" TEXT NOT NULL,
    "actionTaken" TEXT,
    "parentNotified" BOOLEAN NOT NULL DEFAULT false,
    "reportableToAuthority" BOOLEAN NOT NULL DEFAULT false,
    "reportedToAuthorityAt" TIMESTAMP(3),
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpCompleted" BOOLEAN NOT NULL DEFAULT false,
    "ownaIncidentId" TEXT,
    "createdById" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildInterest" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "capturedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "childName" TEXT,
    "interestTopic" TEXT NOT NULL,
    "interestCategory" TEXT,
    "source" TEXT NOT NULL,
    "capturedById" TEXT,
    "linkedToActivityId" TEXT,
    "actioned" BOOLEAN NOT NULL DEFAULT false,
    "actionedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditReview" (
    "id" TEXT NOT NULL,
    "auditInstanceId" TEXT,
    "centreId" TEXT NOT NULL,
    "qualityArea" INTEGER NOT NULL,
    "elements" JSONB NOT NULL,
    "overallRating" TEXT NOT NULL,
    "reviewerNotes" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EducatorReflection" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "educatorName" TEXT NOT NULL,
    "reflectionType" "ReflectionType" NOT NULL,
    "date" DATE NOT NULL,
    "content" JSONB NOT NULL,
    "tags" TEXT[],
    "linkedActivityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EducatorReflection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "targetId" TEXT,
    "targetType" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemBanner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemBannerDismissal" (
    "id" TEXT NOT NULL,
    "bannerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemBannerDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalFeedback" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "page" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "resolvedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "videoUrl" TEXT,
    "audienceRoles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBaseArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoworkReport" (
    "id" TEXT NOT NULL,
    "seat" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metrics" JSONB,
    "alerts" JSONB,
    "serviceCode" TEXT,
    "serviceId" TEXT,
    "assignedToId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "checklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoworkReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChecklist" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" "SessionType" NOT NULL DEFAULT 'asc',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "checkedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPromptTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-5-20250514',
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "promptTemplate" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateSlug" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "metadata" JSONB,
    "monthBudget" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentimentScore" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "serviceId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL,
    "keywords" TEXT[],
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceAnomaly" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" TEXT NOT NULL,
    "anomalyType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expected" DOUBLE PRECISION,
    "actual" DOUBLE PRECISION,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateMatch" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityAId" TEXT NOT NULL,
    "entityBId" TEXT NOT NULL,
    "similarity" INTEGER NOT NULL,
    "matchFields" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendInsight" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "category" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "dataPoints" JSONB,
    "changePercent" DOUBLE PRECISION,
    "periodWeeks" INTEGER NOT NULL DEFAULT 4,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EmailTemplateCategory" NOT NULL DEFAULT 'custom',
    "subject" TEXT NOT NULL,
    "htmlContent" TEXT,
    "blocks" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReport" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceCode" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metrics" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentFeedback" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceCode" TEXT NOT NULL,
    "surveyType" TEXT NOT NULL,
    "parentName" TEXT,
    "parentEmail" TEXT,
    "childName" TEXT,
    "overallRating" INTEGER,
    "npsScore" INTEGER,
    "responses" JSONB,
    "comments" TEXT,
    "sentiment" TEXT,
    "category" TEXT,
    "actionRequired" BOOLEAN NOT NULL DEFAULT false,
    "actionTaken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipMeeting" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "schoolRelationshipId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "attendees" TEXT NOT NULL,
    "agenda" TEXT,
    "notes" TEXT,
    "actionItems" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnershipMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentExperience" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceCode" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "status" TEXT,
    "details" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfoSnippet" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfoSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnippetAck" (
    "id" TEXT NOT NULL,
    "snippetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnippetAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrolmentSubmission" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "enquiryId" TEXT,
    "serviceId" TEXT,
    "primaryParent" JSONB NOT NULL,
    "secondaryParent" JSONB,
    "children" JSONB NOT NULL,
    "emergencyContacts" JSONB NOT NULL,
    "authorisedPickup" JSONB,
    "consents" JSONB NOT NULL,
    "paymentMethod" TEXT,
    "paymentDetails" JSONB,
    "referralSource" TEXT,
    "signature" TEXT,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "privacyAccepted" BOOLEAN NOT NULL DEFAULT false,
    "debitAgreement" BOOLEAN NOT NULL DEFAULT false,
    "courtOrders" BOOLEAN NOT NULL DEFAULT false,
    "courtOrderFiles" JSONB,
    "medicalFiles" JSONB,
    "documentUploads" JSONB,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrolmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT,
    "serviceId" TEXT,
    "firstName" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "gender" TEXT,
    "address" JSONB,
    "culturalBackground" TEXT[],
    "schoolName" TEXT,
    "yearLevel" TEXT,
    "crn" TEXT,
    "medical" JSONB,
    "dietary" JSONB,
    "bookingPrefs" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ownaChildId" TEXT,
    "ownaRoomId" TEXT,
    "ownaRoomName" TEXT,
    "ownaSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SequenceType" NOT NULL,
    "triggerStage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "delayHours" INTEGER NOT NULL,
    "templateKey" TEXT NOT NULL,
    "emailTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceEnrolment" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "enquiryId" TEXT,
    "serviceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentStepNumber" INTEGER NOT NULL DEFAULT 1,
    "anchorDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),

    CONSTRAINT "SequenceEnrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStepExecution" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SequenceStepExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_serviceId_idx" ON "User"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarIntegration_userId_key" ON "CalendarIntegration"("userId");

-- CreateIndex
CREATE INDEX "CalendarIntegration_userId_idx" ON "CalendarIntegration"("userId");

-- CreateIndex
CREATE INDEX "Rock_quarter_idx" ON "Rock"("quarter");

-- CreateIndex
CREATE INDEX "Rock_ownerId_idx" ON "Rock"("ownerId");

-- CreateIndex
CREATE INDEX "Rock_status_idx" ON "Rock"("status");

-- CreateIndex
CREATE INDEX "Rock_serviceId_idx" ON "Rock"("serviceId");

-- CreateIndex
CREATE INDEX "Rock_quarter_serviceId_idx" ON "Rock"("quarter", "serviceId");

-- CreateIndex
CREATE INDEX "Rock_quarter_ownerId_idx" ON "Rock"("quarter", "ownerId");

-- CreateIndex
CREATE INDEX "Rock_quarter_status_idx" ON "Rock"("quarter", "status");

-- CreateIndex
CREATE INDEX "Todo_assigneeId_idx" ON "Todo"("assigneeId");

-- CreateIndex
CREATE INDEX "Todo_rockId_idx" ON "Todo"("rockId");

-- CreateIndex
CREATE INDEX "Todo_weekOf_idx" ON "Todo"("weekOf");

-- CreateIndex
CREATE INDEX "Todo_status_idx" ON "Todo"("status");

-- CreateIndex
CREATE INDEX "Todo_serviceId_idx" ON "Todo"("serviceId");

-- CreateIndex
CREATE INDEX "Todo_projectId_idx" ON "Todo"("projectId");

-- CreateIndex
CREATE INDEX "Todo_createdById_idx" ON "Todo"("createdById");

-- CreateIndex
CREATE INDEX "Todo_weekOf_serviceId_idx" ON "Todo"("weekOf", "serviceId");

-- CreateIndex
CREATE INDEX "Todo_assigneeId_status_idx" ON "Todo"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "Todo_dueDate_status_idx" ON "Todo"("dueDate", "status");

-- CreateIndex
CREATE INDEX "TodoAssignee_todoId_idx" ON "TodoAssignee"("todoId");

-- CreateIndex
CREATE INDEX "TodoAssignee_userId_idx" ON "TodoAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TodoAssignee_todoId_userId_key" ON "TodoAssignee"("todoId", "userId");

-- CreateIndex
CREATE INDEX "Issue_priority_idx" ON "Issue"("priority");

-- CreateIndex
CREATE INDEX "Issue_status_idx" ON "Issue"("status");

-- CreateIndex
CREATE INDEX "Issue_ownerId_idx" ON "Issue"("ownerId");

-- CreateIndex
CREATE INDEX "Issue_serviceId_idx" ON "Issue"("serviceId");

-- CreateIndex
CREATE INDEX "Issue_raisedById_idx" ON "Issue"("raisedById");

-- CreateIndex
CREATE INDEX "Issue_status_serviceId_idx" ON "Issue"("status", "serviceId");

-- CreateIndex
CREATE INDEX "Issue_status_priority_idx" ON "Issue"("status", "priority");

-- CreateIndex
CREATE INDEX "Issue_ownerId_status_idx" ON "Issue"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Measurable_ownerId_idx" ON "Measurable"("ownerId");

-- CreateIndex
CREATE INDEX "Measurable_scorecardId_idx" ON "Measurable"("scorecardId");

-- CreateIndex
CREATE INDEX "Measurable_serviceId_idx" ON "Measurable"("serviceId");

-- CreateIndex
CREATE INDEX "MeasurableEntry_weekOf_idx" ON "MeasurableEntry"("weekOf");

-- CreateIndex
CREATE INDEX "MeasurableEntry_enteredById_idx" ON "MeasurableEntry"("enteredById");

-- CreateIndex
CREATE UNIQUE INDEX "MeasurableEntry_measurableId_weekOf_key" ON "MeasurableEntry"("measurableId", "weekOf");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CronRun_cronName_idx" ON "CronRun"("cronName");

-- CreateIndex
CREATE INDEX "CronRun_startedAt_idx" ON "CronRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CronRun_cronName_period_key" ON "CronRun"("cronName", "period");

-- CreateIndex
CREATE INDEX "BoardReport_year_idx" ON "BoardReport"("year");

-- CreateIndex
CREATE INDEX "BoardReport_status_idx" ON "BoardReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BoardReport_month_year_key" ON "BoardReport"("month", "year");

-- CreateIndex
CREATE INDEX "EmailEvent_messageId_idx" ON "EmailEvent"("messageId");

-- CreateIndex
CREATE INDEX "EmailEvent_email_type_idx" ON "EmailEvent"("email", "type");

-- CreateIndex
CREATE INDEX "EmailEvent_createdAt_idx" ON "EmailEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");

-- CreateIndex
CREATE INDEX "EmailSuppression_email_idx" ON "EmailSuppression"("email");

-- CreateIndex
CREATE INDEX "MarketingCampaign_status_idx" ON "MarketingCampaign"("status");

-- CreateIndex
CREATE INDEX "MarketingCampaign_startDate_idx" ON "MarketingCampaign"("startDate");

-- CreateIndex
CREATE INDEX "MarketingPost_platform_idx" ON "MarketingPost"("platform");

-- CreateIndex
CREATE INDEX "MarketingPost_status_idx" ON "MarketingPost"("status");

-- CreateIndex
CREATE INDEX "MarketingPost_assigneeId_idx" ON "MarketingPost"("assigneeId");

-- CreateIndex
CREATE INDEX "MarketingPost_campaignId_idx" ON "MarketingPost"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingPost_scheduledDate_idx" ON "MarketingPost"("scheduledDate");

-- CreateIndex
CREATE INDEX "MarketingPost_externalPostId_idx" ON "MarketingPost"("externalPostId");

-- CreateIndex
CREATE INDEX "MarketingPostRevision_postId_idx" ON "MarketingPostRevision"("postId");

-- CreateIndex
CREATE INDEX "MarketingPostRevision_createdAt_idx" ON "MarketingPostRevision"("createdAt");

-- CreateIndex
CREATE INDEX "MarketingComment_campaignId_idx" ON "MarketingComment"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingComment_authorId_idx" ON "MarketingComment"("authorId");

-- CreateIndex
CREATE INDEX "MarketingKPI_category_idx" ON "MarketingKPI"("category");

-- CreateIndex
CREATE INDEX "MarketingKPI_period_idx" ON "MarketingKPI"("period");

-- CreateIndex
CREATE INDEX "MarketingAsset_type_idx" ON "MarketingAsset"("type");

-- CreateIndex
CREATE INDEX "MarketingTemplate_platform_idx" ON "MarketingTemplate"("platform");

-- CreateIndex
CREATE INDEX "MarketingHashtagSet_category_idx" ON "MarketingHashtagSet"("category");

-- CreateIndex
CREATE INDEX "SchoolComm_serviceId_idx" ON "SchoolComm"("serviceId");

-- CreateIndex
CREATE INDEX "SchoolComm_status_idx" ON "SchoolComm"("status");

-- CreateIndex
CREATE INDEX "SchoolComm_type_idx" ON "SchoolComm"("type");

-- CreateIndex
CREATE INDEX "PhotoComplianceLog_serviceId_idx" ON "PhotoComplianceLog"("serviceId");

-- CreateIndex
CREATE INDEX "PhotoComplianceLog_date_idx" ON "PhotoComplianceLog"("date");

-- CreateIndex
CREATE INDEX "PhotoComplianceLog_confirmed_idx" ON "PhotoComplianceLog"("confirmed");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoComplianceLog_serviceId_date_key" ON "PhotoComplianceLog"("serviceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolRelationship_serviceId_key" ON "SchoolRelationship"("serviceId");

-- CreateIndex
CREATE INDEX "SchoolRelationship_renewalStatus_idx" ON "SchoolRelationship"("renewalStatus");

-- CreateIndex
CREATE INDEX "SchoolRelationship_nextActionDate_idx" ON "SchoolRelationship"("nextActionDate");

-- CreateIndex
CREATE UNIQUE INDEX "Partnership_serviceCode_key" ON "Partnership"("serviceCode");

-- CreateIndex
CREATE INDEX "Partnership_status_idx" ON "Partnership"("status");

-- CreateIndex
CREATE INDEX "NpsSurveyResponse_serviceId_idx" ON "NpsSurveyResponse"("serviceId");

-- CreateIndex
CREATE INDEX "NpsSurveyResponse_contactId_idx" ON "NpsSurveyResponse"("contactId");

-- CreateIndex
CREATE INDEX "NpsSurveyResponse_category_idx" ON "NpsSurveyResponse"("category");

-- CreateIndex
CREATE INDEX "NpsSurveyResponse_respondedAt_idx" ON "NpsSurveyResponse"("respondedAt");

-- CreateIndex
CREATE INDEX "TermCalendarEntry_year_term_week_idx" ON "TermCalendarEntry"("year", "term", "week");

-- CreateIndex
CREATE INDEX "TermCalendarEntry_channel_idx" ON "TermCalendarEntry"("channel");

-- CreateIndex
CREATE INDEX "TermCalendarEntry_serviceId_idx" ON "TermCalendarEntry"("serviceId");

-- CreateIndex
CREATE INDEX "TermCalendarEntry_status_idx" ON "TermCalendarEntry"("status");

-- CreateIndex
CREATE INDEX "MarketingTask_status_idx" ON "MarketingTask"("status");

-- CreateIndex
CREATE INDEX "MarketingTask_assigneeId_idx" ON "MarketingTask"("assigneeId");

-- CreateIndex
CREATE INDEX "MarketingTask_campaignId_idx" ON "MarketingTask"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingTask_dueDate_idx" ON "MarketingTask"("dueDate");

-- CreateIndex
CREATE INDEX "MarketingTaskTemplateItem_templateId_idx" ON "MarketingTaskTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "CampaignActivationAssignment_campaignId_idx" ON "CampaignActivationAssignment"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignActivationAssignment_serviceId_idx" ON "CampaignActivationAssignment"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignActivationAssignment_campaignId_serviceId_key" ON "CampaignActivationAssignment"("campaignId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");

-- CreateIndex
CREATE INDEX "Service_status_idx" ON "Service"("status");

-- CreateIndex
CREATE INDEX "Service_managerId_idx" ON "Service"("managerId");

-- CreateIndex
CREATE INDEX "ProjectTemplateTask_templateId_idx" ON "ProjectTemplateTask"("templateId");

-- CreateIndex
CREATE INDEX "Project_serviceId_idx" ON "Project"("serviceId");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Meeting_date_idx" ON "Meeting"("date");

-- CreateIndex
CREATE INDEX "Meeting_status_idx" ON "Meeting"("status");

-- CreateIndex
CREATE INDEX "Meeting_createdById_idx" ON "Meeting"("createdById");

-- CreateIndex
CREATE INDEX "MeetingAttendee_meetingId_idx" ON "MeetingAttendee"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAttendee_userId_idx" ON "MeetingAttendee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_meetingId_userId_key" ON "MeetingAttendee"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE INDEX "Document_centreId_idx" ON "Document"("centreId");

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

-- CreateIndex
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");

-- CreateIndex
CREATE INDEX "DocumentFolder_parentId_idx" ON "DocumentFolder"("parentId");

-- CreateIndex
CREATE INDEX "Attachment_rockId_idx" ON "Attachment"("rockId");

-- CreateIndex
CREATE INDEX "Attachment_issueId_idx" ON "Attachment"("issueId");

-- CreateIndex
CREATE INDEX "Attachment_projectId_idx" ON "Attachment"("projectId");

-- CreateIndex
CREATE INDEX "FinancialPeriod_serviceId_idx" ON "FinancialPeriod"("serviceId");

-- CreateIndex
CREATE INDEX "FinancialPeriod_periodStart_idx" ON "FinancialPeriod"("periodStart");

-- CreateIndex
CREATE INDEX "FinancialPeriod_periodType_idx" ON "FinancialPeriod"("periodType");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPeriod_serviceId_periodType_periodStart_key" ON "FinancialPeriod"("serviceId", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "Scenario_createdById_idx" ON "Scenario"("createdById");

-- CreateIndex
CREATE INDEX "CentreMetrics_serviceId_idx" ON "CentreMetrics"("serviceId");

-- CreateIndex
CREATE INDEX "CentreMetrics_recordedAt_idx" ON "CentreMetrics"("recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContact_waId_key" ON "WhatsAppContact"("waId");

-- CreateIndex
CREATE INDEX "WhatsAppContact_waId_idx" ON "WhatsAppContact"("waId");

-- CreateIndex
CREATE INDEX "WhatsAppContact_serviceId_idx" ON "WhatsAppContact"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_priority_idx" ON "SupportTicket"("priority");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_idx" ON "SupportTicket"("assignedToId");

-- CreateIndex
CREATE INDEX "SupportTicket_contactId_idx" ON "SupportTicket"("contactId");

-- CreateIndex
CREATE INDEX "SupportTicket_serviceId_idx" ON "SupportTicket"("serviceId");

-- CreateIndex
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex
CREATE INDEX "TicketEmail_ticketId_idx" ON "TicketEmail"("ticketId");

-- CreateIndex
CREATE INDEX "TicketEmail_receivedAt_idx" ON "TicketEmail"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketEmail_messageId_key" ON "TicketEmail"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketMessage_waMessageId_key" ON "TicketMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX "TicketMessage_waMessageId_idx" ON "TicketMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "Announcement_audience_idx" ON "Announcement"("audience");

-- CreateIndex
CREATE INDEX "Announcement_pinned_idx" ON "Announcement"("pinned");

-- CreateIndex
CREATE INDEX "Announcement_publishedAt_idx" ON "Announcement"("publishedAt");

-- CreateIndex
CREATE INDEX "Announcement_serviceId_idx" ON "Announcement"("serviceId");

-- CreateIndex
CREATE INDEX "AnnouncementRead_announcementId_idx" ON "AnnouncementRead"("announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "CascadeMessage_meetingId_idx" ON "CascadeMessage"("meetingId");

-- CreateIndex
CREATE INDEX "CascadeMessage_publishedAt_idx" ON "CascadeMessage"("publishedAt");

-- CreateIndex
CREATE INDEX "CascadeAcknowledgment_cascadeMessageId_idx" ON "CascadeAcknowledgment"("cascadeMessageId");

-- CreateIndex
CREATE INDEX "CascadeAcknowledgment_userId_idx" ON "CascadeAcknowledgment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CascadeAcknowledgment_cascadeMessageId_userId_key" ON "CascadeAcknowledgment"("cascadeMessageId", "userId");

-- CreateIndex
CREATE INDEX "WeeklyPulse_userId_idx" ON "WeeklyPulse"("userId");

-- CreateIndex
CREATE INDEX "WeeklyPulse_weekOf_idx" ON "WeeklyPulse"("weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPulse_userId_weekOf_key" ON "WeeklyPulse"("userId", "weekOf");

-- CreateIndex
CREATE INDEX "NotificationDismissal_userId_idx" ON "NotificationDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDismissal_userId_notificationId_key" ON "NotificationDismissal"("userId", "notificationId");

-- CreateIndex
CREATE INDEX "HealthScore_serviceId_idx" ON "HealthScore"("serviceId");

-- CreateIndex
CREATE INDEX "HealthScore_periodStart_idx" ON "HealthScore"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "HealthScore_serviceId_periodType_periodStart_key" ON "HealthScore"("serviceId", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "XeroAccountMapping_xeroConnectionId_idx" ON "XeroAccountMapping"("xeroConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "XeroAccountMapping_xeroConnectionId_xeroAccountCode_key" ON "XeroAccountMapping"("xeroConnectionId", "xeroAccountCode");

-- CreateIndex
CREATE INDEX "OnboardingPack_serviceId_idx" ON "OnboardingPack"("serviceId");

-- CreateIndex
CREATE INDEX "OnboardingTask_packId_idx" ON "OnboardingTask"("packId");

-- CreateIndex
CREATE INDEX "StaffOnboarding_userId_idx" ON "StaffOnboarding"("userId");

-- CreateIndex
CREATE INDEX "StaffOnboarding_packId_idx" ON "StaffOnboarding"("packId");

-- CreateIndex
CREATE INDEX "StaffOnboarding_status_idx" ON "StaffOnboarding"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffOnboarding_userId_packId_key" ON "StaffOnboarding"("userId", "packId");

-- CreateIndex
CREATE INDEX "StaffOnboardingProgress_onboardingId_idx" ON "StaffOnboardingProgress"("onboardingId");

-- CreateIndex
CREATE INDEX "StaffOnboardingProgress_taskId_idx" ON "StaffOnboardingProgress"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffOnboardingProgress_onboardingId_taskId_key" ON "StaffOnboardingProgress"("onboardingId", "taskId");

-- CreateIndex
CREATE INDEX "LMSCourse_status_idx" ON "LMSCourse"("status");

-- CreateIndex
CREATE INDEX "LMSCourse_serviceId_idx" ON "LMSCourse"("serviceId");

-- CreateIndex
CREATE INDEX "LMSModule_courseId_idx" ON "LMSModule"("courseId");

-- CreateIndex
CREATE INDEX "LMSEnrollment_userId_idx" ON "LMSEnrollment"("userId");

-- CreateIndex
CREATE INDEX "LMSEnrollment_courseId_idx" ON "LMSEnrollment"("courseId");

-- CreateIndex
CREATE INDEX "LMSEnrollment_status_idx" ON "LMSEnrollment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LMSEnrollment_userId_courseId_key" ON "LMSEnrollment"("userId", "courseId");

-- CreateIndex
CREATE INDEX "LMSModuleProgress_enrollmentId_idx" ON "LMSModuleProgress"("enrollmentId");

-- CreateIndex
CREATE INDEX "LMSModuleProgress_moduleId_idx" ON "LMSModuleProgress"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "LMSModuleProgress_enrollmentId_moduleId_key" ON "LMSModuleProgress"("enrollmentId", "moduleId");

-- CreateIndex
CREATE INDEX "ComplianceCertificate_serviceId_idx" ON "ComplianceCertificate"("serviceId");

-- CreateIndex
CREATE INDEX "ComplianceCertificate_userId_idx" ON "ComplianceCertificate"("userId");

-- CreateIndex
CREATE INDEX "ComplianceCertificate_expiryDate_idx" ON "ComplianceCertificate"("expiryDate");

-- CreateIndex
CREATE INDEX "DailyAttendance_serviceId_idx" ON "DailyAttendance"("serviceId");

-- CreateIndex
CREATE INDEX "DailyAttendance_date_idx" ON "DailyAttendance"("date");

-- CreateIndex
CREATE INDEX "DailyAttendance_serviceId_date_idx" ON "DailyAttendance"("serviceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAttendance_serviceId_date_sessionType_key" ON "DailyAttendance"("serviceId", "date", "sessionType");

-- CreateIndex
CREATE INDEX "BudgetItem_serviceId_idx" ON "BudgetItem"("serviceId");

-- CreateIndex
CREATE INDEX "BudgetItem_serviceId_date_idx" ON "BudgetItem"("serviceId", "date");

-- CreateIndex
CREATE INDEX "BudgetItem_category_idx" ON "BudgetItem"("category");

-- CreateIndex
CREATE INDEX "ProgramActivity_serviceId_idx" ON "ProgramActivity"("serviceId");

-- CreateIndex
CREATE INDEX "ProgramActivity_serviceId_weekStart_idx" ON "ProgramActivity"("serviceId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramActivity_serviceId_weekStart_day_startTime_key" ON "ProgramActivity"("serviceId", "weekStart", "day", "startTime");

-- CreateIndex
CREATE INDEX "MenuWeek_serviceId_idx" ON "MenuWeek"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuWeek_serviceId_weekStart_key" ON "MenuWeek"("serviceId", "weekStart");

-- CreateIndex
CREATE INDEX "MenuItem_menuWeekId_idx" ON "MenuItem"("menuWeekId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_menuWeekId_day_slot_key" ON "MenuItem"("menuWeekId", "day", "slot");

-- CreateIndex
CREATE INDEX "ActivityTemplate_category_idx" ON "ActivityTemplate"("category");

-- CreateIndex
CREATE INDEX "ActivityTemplate_deleted_idx" ON "ActivityTemplate"("deleted");

-- CreateIndex
CREATE INDEX "ActivityTemplateFile_templateId_idx" ON "ActivityTemplateFile"("templateId");

-- CreateIndex
CREATE INDEX "TodoTemplate_isActive_nextRunAt_idx" ON "TodoTemplate"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "TodoTemplate_assigneeId_idx" ON "TodoTemplate"("assigneeId");

-- CreateIndex
CREATE INDEX "TodoTemplate_serviceId_idx" ON "TodoTemplate"("serviceId");

-- CreateIndex
CREATE INDEX "TodoTemplate_createdById_idx" ON "TodoTemplate"("createdById");

-- CreateIndex
CREATE INDEX "AccountabilitySeat_parentId_idx" ON "AccountabilitySeat"("parentId");

-- CreateIndex
CREATE INDEX "AccountabilitySeatAssignment_userId_idx" ON "AccountabilitySeatAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountabilitySeatAssignment_seatId_userId_key" ON "AccountabilitySeatAssignment"("seatId", "userId");

-- CreateIndex
CREATE INDEX "MarketingPostService_postId_idx" ON "MarketingPostService"("postId");

-- CreateIndex
CREATE INDEX "MarketingPostService_serviceId_idx" ON "MarketingPostService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingPostService_postId_serviceId_key" ON "MarketingPostService"("postId", "serviceId");

-- CreateIndex
CREATE INDEX "MarketingCampaignService_campaignId_idx" ON "MarketingCampaignService"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingCampaignService_serviceId_idx" ON "MarketingCampaignService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCampaignService_campaignId_serviceId_key" ON "MarketingCampaignService"("campaignId", "serviceId");

-- CreateIndex
CREATE INDEX "SocialConnection_platform_idx" ON "SocialConnection"("platform");

-- CreateIndex
CREATE INDEX "SocialConnection_serviceId_idx" ON "SocialConnection"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_platform_accountId_key" ON "SocialConnection"("platform", "accountId");

-- CreateIndex
CREATE INDEX "EmergencyContact_userId_idx" ON "EmergencyContact"("userId");

-- CreateIndex
CREATE INDEX "StaffQualification_userId_idx" ON "StaffQualification"("userId");

-- CreateIndex
CREATE INDEX "StaffQualification_type_idx" ON "StaffQualification"("type");

-- CreateIndex
CREATE INDEX "Policy_status_idx" ON "Policy"("status");

-- CreateIndex
CREATE INDEX "Policy_category_idx" ON "Policy"("category");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgement_policyId_idx" ON "PolicyAcknowledgement"("policyId");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgement_userId_idx" ON "PolicyAcknowledgement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcknowledgement_policyId_userId_policyVersion_key" ON "PolicyAcknowledgement"("policyId", "userId", "policyVersion");

-- CreateIndex
CREATE INDEX "EmploymentContract_userId_idx" ON "EmploymentContract"("userId");

-- CreateIndex
CREATE INDEX "EmploymentContract_status_idx" ON "EmploymentContract"("status");

-- CreateIndex
CREATE INDEX "EmploymentContract_contractType_idx" ON "EmploymentContract"("contractType");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_idx" ON "LeaveRequest"("userId");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_startDate_idx" ON "LeaveRequest"("startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_serviceId_idx" ON "LeaveRequest"("serviceId");

-- CreateIndex
CREATE INDEX "LeaveRequest_leaveType_idx" ON "LeaveRequest"("leaveType");

-- CreateIndex
CREATE INDEX "LeaveRequest_reviewedById_idx" ON "LeaveRequest"("reviewedById");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_status_idx" ON "LeaveRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_serviceId_status_idx" ON "LeaveRequest"("serviceId", "status");

-- CreateIndex
CREATE INDEX "LeaveBalance_userId_idx" ON "LeaveBalance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_userId_leaveType_key" ON "LeaveBalance"("userId", "leaveType");

-- CreateIndex
CREATE INDEX "Timesheet_serviceId_idx" ON "Timesheet"("serviceId");

-- CreateIndex
CREATE INDEX "Timesheet_status_idx" ON "Timesheet"("status");

-- CreateIndex
CREATE INDEX "Timesheet_weekEnding_idx" ON "Timesheet"("weekEnding");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_serviceId_weekEnding_key" ON "Timesheet"("serviceId", "weekEnding");

-- CreateIndex
CREATE INDEX "TimesheetEntry_timesheetId_idx" ON "TimesheetEntry"("timesheetId");

-- CreateIndex
CREATE INDEX "TimesheetEntry_userId_idx" ON "TimesheetEntry"("userId");

-- CreateIndex
CREATE INDEX "TimesheetEntry_date_idx" ON "TimesheetEntry"("date");

-- CreateIndex
CREATE INDEX "OffboardingPack_serviceId_idx" ON "OffboardingPack"("serviceId");

-- CreateIndex
CREATE INDEX "OffboardingTask_packId_idx" ON "OffboardingTask"("packId");

-- CreateIndex
CREATE INDEX "StaffOffboarding_userId_idx" ON "StaffOffboarding"("userId");

-- CreateIndex
CREATE INDEX "StaffOffboarding_packId_idx" ON "StaffOffboarding"("packId");

-- CreateIndex
CREATE INDEX "StaffOffboarding_status_idx" ON "StaffOffboarding"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffOffboarding_userId_packId_key" ON "StaffOffboarding"("userId", "packId");

-- CreateIndex
CREATE INDEX "StaffOffboardingProgress_offboardingId_idx" ON "StaffOffboardingProgress"("offboardingId");

-- CreateIndex
CREATE INDEX "StaffOffboardingProgress_taskId_idx" ON "StaffOffboardingProgress"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffOffboardingProgress_offboardingId_taskId_key" ON "StaffOffboardingProgress"("offboardingId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_createdById_idx" ON "ApiKey"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CoworkProgram_weekCommencing_key" ON "CoworkProgram"("weekCommencing");

-- CreateIndex
CREATE INDEX "CoworkTodo_centreId_date_idx" ON "CoworkTodo"("centreId", "date");

-- CreateIndex
CREATE INDEX "CoworkTodo_assignedToId_idx" ON "CoworkTodo"("assignedToId");

-- CreateIndex
CREATE INDEX "CalendarEvent_centreId_date_idx" ON "CalendarEvent"("centreId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_tenderRef_key" ON "Lead"("tenderRef");

-- CreateIndex
CREATE INDEX "Lead_pipelineStage_idx" ON "Lead"("pipelineStage");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_state_idx" ON "Lead"("state");

-- CreateIndex
CREATE INDEX "Lead_nextTouchpointAt_idx" ON "Lead"("nextTouchpointAt");

-- CreateIndex
CREATE INDEX "Lead_pipelineStage_serviceId_idx" ON "Lead"("pipelineStage", "serviceId");

-- CreateIndex
CREATE INDEX "Lead_deleted_stageChangedAt_idx" ON "Lead"("deleted", "stageChangedAt");

-- CreateIndex
CREATE INDEX "TouchpointLog_leadId_idx" ON "TouchpointLog"("leadId");

-- CreateIndex
CREATE INDEX "TouchpointLog_sentAt_idx" ON "TouchpointLog"("sentAt");

-- CreateIndex
CREATE INDEX "CentreContact_serviceId_idx" ON "CentreContact"("serviceId");

-- CreateIndex
CREATE INDEX "CentreContact_serviceId_status_idx" ON "CentreContact"("serviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CentreContact_email_serviceId_key" ON "CentreContact"("email", "serviceId");

-- CreateIndex
CREATE INDEX "QuickFeedback_serviceId_weekStart_idx" ON "QuickFeedback"("serviceId", "weekStart");

-- CreateIndex
CREATE INDEX "QuickFeedback_score_idx" ON "QuickFeedback"("score");

-- CreateIndex
CREATE INDEX "QuickFeedback_createdAt_idx" ON "QuickFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExitSurvey_surveyToken_key" ON "ExitSurvey"("surveyToken");

-- CreateIndex
CREATE INDEX "ExitSurvey_serviceId_idx" ON "ExitSurvey"("serviceId");

-- CreateIndex
CREATE INDEX "ExitSurvey_reason_idx" ON "ExitSurvey"("reason");

-- CreateIndex
CREATE INDEX "ExitSurvey_surveyToken_idx" ON "ExitSurvey"("surveyToken");

-- CreateIndex
CREATE INDEX "WhatsAppGroup_groupType_idx" ON "WhatsAppGroup"("groupType");

-- CreateIndex
CREATE INDEX "WhatsAppGroup_serviceCode_idx" ON "WhatsAppGroup"("serviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_serviceCode_key" ON "SocialAccount"("serviceCode");

-- CreateIndex
CREATE INDEX "DeliveryLog_channel_idx" ON "DeliveryLog"("channel");

-- CreateIndex
CREATE INDEX "DeliveryLog_serviceCode_idx" ON "DeliveryLog"("serviceCode");

-- CreateIndex
CREATE INDEX "DeliveryLog_createdAt_idx" ON "DeliveryLog"("createdAt");

-- CreateIndex
CREATE INDEX "DeliveryLog_entityType_entityId_idx" ON "DeliveryLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "DeliveryLog_serviceCode_createdAt_idx" ON "DeliveryLog"("serviceCode", "createdAt");

-- CreateIndex
CREATE INDEX "ParentNurtureStep_serviceId_idx" ON "ParentNurtureStep"("serviceId");

-- CreateIndex
CREATE INDEX "ParentNurtureStep_scheduledFor_idx" ON "ParentNurtureStep"("scheduledFor");

-- CreateIndex
CREATE INDEX "ParentNurtureStep_status_idx" ON "ParentNurtureStep"("status");

-- CreateIndex
CREATE INDEX "ParentNurtureStep_enquiryId_idx" ON "ParentNurtureStep"("enquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentNurtureStep_contactId_templateKey_key" ON "ParentNurtureStep"("contactId", "templateKey");

-- CreateIndex
CREATE INDEX "HolidayQuestDay_serviceId_idx" ON "HolidayQuestDay"("serviceId");

-- CreateIndex
CREATE INDEX "HolidayQuestDay_date_idx" ON "HolidayQuestDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayQuestDay_serviceId_date_key" ON "HolidayQuestDay"("serviceId", "date");

-- CreateIndex
CREATE INDEX "BookingForecast_serviceId_idx" ON "BookingForecast"("serviceId");

-- CreateIndex
CREATE INDEX "BookingForecast_date_idx" ON "BookingForecast"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BookingForecast_serviceId_date_sessionType_key" ON "BookingForecast"("serviceId", "date", "sessionType");

-- CreateIndex
CREATE INDEX "RosterShift_serviceId_idx" ON "RosterShift"("serviceId");

-- CreateIndex
CREATE INDEX "RosterShift_date_idx" ON "RosterShift"("date");

-- CreateIndex
CREATE INDEX "RosterShift_serviceId_date_idx" ON "RosterShift"("serviceId", "date");

-- CreateIndex
CREATE INDEX "RosterShift_date_staffName_idx" ON "RosterShift"("date", "staffName");

-- CreateIndex
CREATE UNIQUE INDEX "RosterShift_serviceId_date_staffName_shiftStart_key" ON "RosterShift"("serviceId", "date", "staffName", "shiftStart");

-- CreateIndex
CREATE INDEX "ConversionOpportunity_serviceId_idx" ON "ConversionOpportunity"("serviceId");

-- CreateIndex
CREATE INDEX "ConversionOpportunity_status_idx" ON "ConversionOpportunity"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionOpportunity_serviceId_familyRef_sessionType_perio_key" ON "ConversionOpportunity"("serviceId", "familyRef", "sessionType", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AuditTemplate_name_key" ON "AuditTemplate"("name");

-- CreateIndex
CREATE INDEX "AuditTemplate_qualityArea_idx" ON "AuditTemplate"("qualityArea");

-- CreateIndex
CREATE INDEX "AuditTemplate_frequency_idx" ON "AuditTemplate"("frequency");

-- CreateIndex
CREATE INDEX "AuditTemplateItem_templateId_idx" ON "AuditTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "AuditTemplateItem_templateId_sortOrder_idx" ON "AuditTemplateItem"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "AuditInstance_serviceId_idx" ON "AuditInstance"("serviceId");

-- CreateIndex
CREATE INDEX "AuditInstance_templateId_idx" ON "AuditInstance"("templateId");

-- CreateIndex
CREATE INDEX "AuditInstance_status_idx" ON "AuditInstance"("status");

-- CreateIndex
CREATE INDEX "AuditInstance_dueDate_idx" ON "AuditInstance"("dueDate");

-- CreateIndex
CREATE INDEX "AuditInstance_serviceId_status_idx" ON "AuditInstance"("serviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditInstance_templateId_serviceId_scheduledMonth_scheduled_key" ON "AuditInstance"("templateId", "serviceId", "scheduledMonth", "scheduledYear");

-- CreateIndex
CREATE INDEX "AuditItemResponse_instanceId_idx" ON "AuditItemResponse"("instanceId");

-- CreateIndex
CREATE INDEX "AuditItemResponse_result_idx" ON "AuditItemResponse"("result");

-- CreateIndex
CREATE UNIQUE INDEX "AuditItemResponse_instanceId_templateItemId_key" ON "AuditItemResponse"("instanceId", "templateItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentEnquiry_ownaEnquiryId_key" ON "ParentEnquiry"("ownaEnquiryId");

-- CreateIndex
CREATE INDEX "ParentEnquiry_serviceId_idx" ON "ParentEnquiry"("serviceId");

-- CreateIndex
CREATE INDEX "ParentEnquiry_stage_idx" ON "ParentEnquiry"("stage");

-- CreateIndex
CREATE INDEX "ParentEnquiry_assigneeId_idx" ON "ParentEnquiry"("assigneeId");

-- CreateIndex
CREATE INDEX "ParentEnquiry_nextActionDue_idx" ON "ParentEnquiry"("nextActionDue");

-- CreateIndex
CREATE INDEX "ParentEnquiry_stageChangedAt_idx" ON "ParentEnquiry"("stageChangedAt");

-- CreateIndex
CREATE INDEX "ParentEnquiry_stage_createdAt_idx" ON "ParentEnquiry"("stage", "createdAt");

-- CreateIndex
CREATE INDEX "ParentEnquiry_serviceId_stage_idx" ON "ParentEnquiry"("serviceId", "stage");

-- CreateIndex
CREATE INDEX "ParentEnquiryTouchpoint_enquiryId_idx" ON "ParentEnquiryTouchpoint"("enquiryId");

-- CreateIndex
CREATE INDEX "ParentEnquiryTouchpoint_status_idx" ON "ParentEnquiryTouchpoint"("status");

-- CreateIndex
CREATE INDEX "Referral_serviceId_idx" ON "Referral"("serviceId");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE INDEX "RecruitmentVacancy_serviceId_idx" ON "RecruitmentVacancy"("serviceId");

-- CreateIndex
CREATE INDEX "RecruitmentVacancy_status_idx" ON "RecruitmentVacancy"("status");

-- CreateIndex
CREATE INDEX "RecruitmentVacancy_assignedToId_idx" ON "RecruitmentVacancy"("assignedToId");

-- CreateIndex
CREATE INDEX "RecruitmentCandidate_vacancyId_idx" ON "RecruitmentCandidate"("vacancyId");

-- CreateIndex
CREATE INDEX "RecruitmentCandidate_stage_idx" ON "RecruitmentCandidate"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "StaffReferral_candidateId_key" ON "StaffReferral"("candidateId");

-- CreateIndex
CREATE INDEX "StaffReferral_referrerUserId_idx" ON "StaffReferral"("referrerUserId");

-- CreateIndex
CREATE INDEX "StaffReferral_status_idx" ON "StaffReferral"("status");

-- CreateIndex
CREATE INDEX "StaffPulseSurvey_serviceId_idx" ON "StaffPulseSurvey"("serviceId");

-- CreateIndex
CREATE INDEX "StaffPulseSurvey_periodMonth_idx" ON "StaffPulseSurvey"("periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPulseSurvey_userId_periodMonth_key" ON "StaffPulseSurvey"("userId", "periodMonth");

-- CreateIndex
CREATE INDEX "OverdueFeeRecord_serviceId_idx" ON "OverdueFeeRecord"("serviceId");

-- CreateIndex
CREATE INDEX "OverdueFeeRecord_agingBucket_idx" ON "OverdueFeeRecord"("agingBucket");

-- CreateIndex
CREATE INDEX "OverdueFeeRecord_reminderStatus_idx" ON "OverdueFeeRecord"("reminderStatus");

-- CreateIndex
CREATE INDEX "OverdueFeeRecord_dueDate_idx" ON "OverdueFeeRecord"("dueDate");

-- CreateIndex
CREATE INDEX "EBITDAAdjustment_periodMonth_idx" ON "EBITDAAdjustment"("periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowPeriod_periodMonth_key" ON "CashFlowPeriod"("periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "QualityImprovementPlan_serviceId_key" ON "QualityImprovementPlan"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "QIPQualityArea_qipId_qualityArea_key" ON "QIPQualityArea"("qipId", "qualityArea");

-- CreateIndex
CREATE INDEX "IncidentRecord_serviceId_idx" ON "IncidentRecord"("serviceId");

-- CreateIndex
CREATE INDEX "IncidentRecord_incidentDate_idx" ON "IncidentRecord"("incidentDate");

-- CreateIndex
CREATE INDEX "IncidentRecord_incidentType_idx" ON "IncidentRecord"("incidentType");

-- CreateIndex
CREATE INDEX "IncidentRecord_severity_idx" ON "IncidentRecord"("severity");

-- CreateIndex
CREATE INDEX "ChildInterest_serviceId_actioned_idx" ON "ChildInterest"("serviceId", "actioned");

-- CreateIndex
CREATE INDEX "ChildInterest_serviceId_capturedDate_idx" ON "ChildInterest"("serviceId", "capturedDate");

-- CreateIndex
CREATE INDEX "AuditReview_centreId_idx" ON "AuditReview"("centreId");

-- CreateIndex
CREATE INDEX "AuditReview_qualityArea_idx" ON "AuditReview"("qualityArea");

-- CreateIndex
CREATE INDEX "AuditReview_centreId_qualityArea_idx" ON "AuditReview"("centreId", "qualityArea");

-- CreateIndex
CREATE INDEX "EducatorReflection_centreId_idx" ON "EducatorReflection"("centreId");

-- CreateIndex
CREATE INDEX "EducatorReflection_reflectionType_idx" ON "EducatorReflection"("reflectionType");

-- CreateIndex
CREATE INDEX "EducatorReflection_centreId_date_idx" ON "EducatorReflection"("centreId", "date");

-- CreateIndex
CREATE INDEX "EducatorReflection_date_idx" ON "EducatorReflection"("date");

-- CreateIndex
CREATE INDEX "SecurityAuditLog_action_idx" ON "SecurityAuditLog"("action");

-- CreateIndex
CREATE INDEX "SecurityAuditLog_actorId_idx" ON "SecurityAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "SecurityAuditLog_targetId_idx" ON "SecurityAuditLog"("targetId");

-- CreateIndex
CREATE INDEX "SecurityAuditLog_createdAt_idx" ON "SecurityAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "SystemBanner_active_idx" ON "SystemBanner"("active");

-- CreateIndex
CREATE INDEX "SystemBanner_createdAt_idx" ON "SystemBanner"("createdAt");

-- CreateIndex
CREATE INDEX "SystemBannerDismissal_userId_idx" ON "SystemBannerDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemBannerDismissal_bannerId_userId_key" ON "SystemBannerDismissal"("bannerId", "userId");

-- CreateIndex
CREATE INDEX "InternalFeedback_authorId_idx" ON "InternalFeedback"("authorId");

-- CreateIndex
CREATE INDEX "InternalFeedback_status_idx" ON "InternalFeedback"("status");

-- CreateIndex
CREATE INDEX "InternalFeedback_category_idx" ON "InternalFeedback"("category");

-- CreateIndex
CREATE INDEX "InternalFeedback_createdAt_idx" ON "InternalFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBaseArticle_slug_key" ON "KnowledgeBaseArticle"("slug");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_category_idx" ON "KnowledgeBaseArticle"("category");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_published_idx" ON "KnowledgeBaseArticle"("published");

-- CreateIndex
CREATE INDEX "CoworkReport_seat_idx" ON "CoworkReport"("seat");

-- CreateIndex
CREATE INDEX "CoworkReport_reportType_idx" ON "CoworkReport"("reportType");

-- CreateIndex
CREATE INDEX "CoworkReport_assignedToId_idx" ON "CoworkReport"("assignedToId");

-- CreateIndex
CREATE INDEX "CoworkReport_serviceCode_idx" ON "CoworkReport"("serviceCode");

-- CreateIndex
CREATE INDEX "CoworkReport_status_idx" ON "CoworkReport"("status");

-- CreateIndex
CREATE INDEX "CoworkReport_createdAt_idx" ON "CoworkReport"("createdAt");

-- CreateIndex
CREATE INDEX "CoworkReport_seat_assignedToId_idx" ON "CoworkReport"("seat", "assignedToId");

-- CreateIndex
CREATE INDEX "DailyChecklist_serviceId_idx" ON "DailyChecklist"("serviceId");

-- CreateIndex
CREATE INDEX "DailyChecklist_date_idx" ON "DailyChecklist"("date");

-- CreateIndex
CREATE INDEX "DailyChecklist_status_idx" ON "DailyChecklist"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChecklist_serviceId_date_sessionType_key" ON "DailyChecklist"("serviceId", "date", "sessionType");

-- CreateIndex
CREATE INDEX "DailyChecklistItem_checklistId_idx" ON "DailyChecklistItem"("checklistId");

-- CreateIndex
CREATE UNIQUE INDEX "AiPromptTemplate_slug_key" ON "AiPromptTemplate"("slug");

-- CreateIndex
CREATE INDEX "AiUsage_userId_idx" ON "AiUsage"("userId");

-- CreateIndex
CREATE INDEX "AiUsage_templateSlug_idx" ON "AiUsage"("templateSlug");

-- CreateIndex
CREATE INDEX "AiUsage_section_idx" ON "AiUsage"("section");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "SentimentScore_serviceId_idx" ON "SentimentScore"("serviceId");

-- CreateIndex
CREATE INDEX "SentimentScore_label_idx" ON "SentimentScore"("label");

-- CreateIndex
CREATE INDEX "SentimentScore_createdAt_idx" ON "SentimentScore"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SentimentScore_sourceType_sourceId_key" ON "SentimentScore"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AttendanceAnomaly_serviceId_idx" ON "AttendanceAnomaly"("serviceId");

-- CreateIndex
CREATE INDEX "AttendanceAnomaly_date_idx" ON "AttendanceAnomaly"("date");

-- CreateIndex
CREATE INDEX "AttendanceAnomaly_severity_idx" ON "AttendanceAnomaly"("severity");

-- CreateIndex
CREATE INDEX "AttendanceAnomaly_dismissed_idx" ON "AttendanceAnomaly"("dismissed");

-- CreateIndex
CREATE INDEX "AttendanceAnomaly_createdAt_idx" ON "AttendanceAnomaly"("createdAt");

-- CreateIndex
CREATE INDEX "DuplicateMatch_entityType_idx" ON "DuplicateMatch"("entityType");

-- CreateIndex
CREATE INDEX "DuplicateMatch_status_idx" ON "DuplicateMatch"("status");

-- CreateIndex
CREATE INDEX "DuplicateMatch_createdAt_idx" ON "DuplicateMatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateMatch_entityType_entityAId_entityBId_key" ON "DuplicateMatch"("entityType", "entityAId", "entityBId");

-- CreateIndex
CREATE INDEX "TrendInsight_serviceId_idx" ON "TrendInsight"("serviceId");

-- CreateIndex
CREATE INDEX "TrendInsight_category_idx" ON "TrendInsight"("category");

-- CreateIndex
CREATE INDEX "TrendInsight_severity_idx" ON "TrendInsight"("severity");

-- CreateIndex
CREATE INDEX "TrendInsight_dismissed_idx" ON "TrendInsight"("dismissed");

-- CreateIndex
CREATE INDEX "TrendInsight_createdAt_idx" ON "TrendInsight"("createdAt");

-- CreateIndex
CREATE INDEX "FinanceReport_serviceCode_idx" ON "FinanceReport"("serviceCode");

-- CreateIndex
CREATE INDEX "FinanceReport_reportType_idx" ON "FinanceReport"("reportType");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReport_serviceCode_reportType_period_key" ON "FinanceReport"("serviceCode", "reportType", "period");

-- CreateIndex
CREATE INDEX "ParentFeedback_serviceCode_idx" ON "ParentFeedback"("serviceCode");

-- CreateIndex
CREATE INDEX "ParentFeedback_surveyType_idx" ON "ParentFeedback"("surveyType");

-- CreateIndex
CREATE INDEX "ParentFeedback_status_idx" ON "ParentFeedback"("status");

-- CreateIndex
CREATE INDEX "PartnershipMeeting_serviceId_idx" ON "PartnershipMeeting"("serviceId");

-- CreateIndex
CREATE INDEX "PartnershipMeeting_date_idx" ON "PartnershipMeeting"("date");

-- CreateIndex
CREATE INDEX "ParentExperience_serviceCode_idx" ON "ParentExperience"("serviceCode");

-- CreateIndex
CREATE INDEX "ParentExperience_metricType_idx" ON "ParentExperience"("metricType");

-- CreateIndex
CREATE UNIQUE INDEX "ParentExperience_serviceCode_metricType_period_key" ON "ParentExperience"("serviceCode", "metricType", "period");

-- CreateIndex
CREATE INDEX "InfoSnippet_active_idx" ON "InfoSnippet"("active");

-- CreateIndex
CREATE INDEX "InfoSnippet_createdById_idx" ON "InfoSnippet"("createdById");

-- CreateIndex
CREATE INDEX "SnippetAck_snippetId_idx" ON "SnippetAck"("snippetId");

-- CreateIndex
CREATE INDEX "SnippetAck_userId_idx" ON "SnippetAck"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SnippetAck_snippetId_userId_key" ON "SnippetAck"("snippetId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrolmentSubmission_token_key" ON "EnrolmentSubmission"("token");

-- CreateIndex
CREATE INDEX "EnrolmentSubmission_status_idx" ON "EnrolmentSubmission"("status");

-- CreateIndex
CREATE INDEX "EnrolmentSubmission_enquiryId_idx" ON "EnrolmentSubmission"("enquiryId");

-- CreateIndex
CREATE INDEX "EnrolmentSubmission_token_idx" ON "EnrolmentSubmission"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Child_ownaChildId_key" ON "Child"("ownaChildId");

-- CreateIndex
CREATE INDEX "Child_enrolmentId_idx" ON "Child"("enrolmentId");

-- CreateIndex
CREATE INDEX "Child_serviceId_idx" ON "Child"("serviceId");

-- CreateIndex
CREATE INDEX "Child_status_idx" ON "Child"("status");

-- CreateIndex
CREATE INDEX "Child_ownaChildId_idx" ON "Child"("ownaChildId");

-- CreateIndex
CREATE INDEX "Sequence_type_idx" ON "Sequence"("type");

-- CreateIndex
CREATE INDEX "Sequence_triggerStage_idx" ON "Sequence"("triggerStage");

-- CreateIndex
CREATE INDEX "SequenceStep_sequenceId_idx" ON "SequenceStep"("sequenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceStep_sequenceId_stepNumber_key" ON "SequenceStep"("sequenceId", "stepNumber");

-- CreateIndex
CREATE INDEX "SequenceEnrolment_sequenceId_idx" ON "SequenceEnrolment"("sequenceId");

-- CreateIndex
CREATE INDEX "SequenceEnrolment_status_idx" ON "SequenceEnrolment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceEnrolment_sequenceId_contactId_key" ON "SequenceEnrolment"("sequenceId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceEnrolment_sequenceId_leadId_key" ON "SequenceEnrolment"("sequenceId", "leadId");

-- CreateIndex
CREATE INDEX "SequenceStepExecution_status_scheduledFor_idx" ON "SequenceStepExecution"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "SequenceStepExecution_enrolmentId_idx" ON "SequenceStepExecution"("enrolmentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarIntegration" ADD CONSTRAINT "CalendarIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionTractionOrganiser" ADD CONSTRAINT "VisionTractionOrganiser_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneYearGoal" ADD CONSTRAINT "OneYearGoal_vtoId_fkey" FOREIGN KEY ("vtoId") REFERENCES "VisionTractionOrganiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rock" ADD CONSTRAINT "Rock_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rock" ADD CONSTRAINT "Rock_oneYearGoalId_fkey" FOREIGN KEY ("oneYearGoalId") REFERENCES "OneYearGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rock" ADD CONSTRAINT "Rock_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_rockId_fkey" FOREIGN KEY ("rockId") REFERENCES "Rock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_rockId_fkey" FOREIGN KEY ("rockId") REFERENCES "Rock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoAssignee" ADD CONSTRAINT "TodoAssignee_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoAssignee" ADD CONSTRAINT "TodoAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_rockId_fkey" FOREIGN KEY ("rockId") REFERENCES "Rock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurable" ADD CONSTRAINT "Measurable_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurable" ADD CONSTRAINT "Measurable_rockId_fkey" FOREIGN KEY ("rockId") REFERENCES "Rock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurable" ADD CONSTRAINT "Measurable_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurable" ADD CONSTRAINT "Measurable_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurableEntry" ADD CONSTRAINT "MeasurableEntry_measurableId_fkey" FOREIGN KEY ("measurableId") REFERENCES "Measurable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurableEntry" ADD CONSTRAINT "MeasurableEntry_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPost" ADD CONSTRAINT "MarketingPost_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPost" ADD CONSTRAINT "MarketingPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPost" ADD CONSTRAINT "MarketingPost_recurringParentId_fkey" FOREIGN KEY ("recurringParentId") REFERENCES "MarketingPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPost" ADD CONSTRAINT "MarketingPost_clonedFromId_fkey" FOREIGN KEY ("clonedFromId") REFERENCES "MarketingPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPost" ADD CONSTRAINT "MarketingPost_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPostRevision" ADD CONSTRAINT "MarketingPostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MarketingPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPostRevision" ADD CONSTRAINT "MarketingPostRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingComment" ADD CONSTRAINT "MarketingComment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingComment" ADD CONSTRAINT "MarketingComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolComm" ADD CONSTRAINT "SchoolComm_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolComm" ADD CONSTRAINT "SchoolComm_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoComplianceLog" ADD CONSTRAINT "PhotoComplianceLog_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoComplianceLog" ADD CONSTRAINT "PhotoComplianceLog_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolRelationship" ADD CONSTRAINT "SchoolRelationship_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsSurveyResponse" ADD CONSTRAINT "NpsSurveyResponse_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsSurveyResponse" ADD CONSTRAINT "NpsSurveyResponse_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermCalendarEntry" ADD CONSTRAINT "TermCalendarEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermCalendarEntry" ADD CONSTRAINT "TermCalendarEntry_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermCalendarEntry" ADD CONSTRAINT "TermCalendarEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MarketingPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingTaskTemplateItem" ADD CONSTRAINT "MarketingTaskTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketingTaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivationAssignment" ADD CONSTRAINT "CampaignActivationAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivationAssignment" ADD CONSTRAINT "CampaignActivationAssignment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivationAssignment" ADD CONSTRAINT "CampaignActivationAssignment_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTemplateTask" ADD CONSTRAINT "ProjectTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_rockId_fkey" FOREIGN KEY ("rockId") REFERENCES "Rock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPeriod" ADD CONSTRAINT "FinancialPeriod_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentreMetrics" ADD CONSTRAINT "CentreMetrics_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppContact" ADD CONSTRAINT "WhatsAppContact_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WhatsAppContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEmail" ADD CONSTRAINT "TicketEmail_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CascadeMessage" ADD CONSTRAINT "CascadeMessage_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CascadeAcknowledgment" ADD CONSTRAINT "CascadeAcknowledgment_cascadeMessageId_fkey" FOREIGN KEY ("cascadeMessageId") REFERENCES "CascadeMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CascadeAcknowledgment" ADD CONSTRAINT "CascadeAcknowledgment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPulse" ADD CONSTRAINT "WeeklyPulse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDismissal" ADD CONSTRAINT "NotificationDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthScore" ADD CONSTRAINT "HealthScore_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XeroAccountMapping" ADD CONSTRAINT "XeroAccountMapping_xeroConnectionId_fkey" FOREIGN KEY ("xeroConnectionId") REFERENCES "XeroConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPack" ADD CONSTRAINT "OnboardingPack_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_packId_fkey" FOREIGN KEY ("packId") REFERENCES "OnboardingPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOnboarding" ADD CONSTRAINT "StaffOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOnboarding" ADD CONSTRAINT "StaffOnboarding_packId_fkey" FOREIGN KEY ("packId") REFERENCES "OnboardingPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOnboardingProgress" ADD CONSTRAINT "StaffOnboardingProgress_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "StaffOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOnboardingProgress" ADD CONSTRAINT "StaffOnboardingProgress_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OnboardingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LMSCourse" ADD CONSTRAINT "LMSCourse_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LMSModule" ADD CONSTRAINT "LMSModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LMSCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LMSEnrollment" ADD CONSTRAINT "LMSEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LMSEnrollment" ADD CONSTRAINT "LMSEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LMSCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LMSModuleProgress" ADD CONSTRAINT "LMSModuleProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "LMSEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LMSModuleProgress" ADD CONSTRAINT "LMSModuleProgress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "LMSModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCertificate" ADD CONSTRAINT "ComplianceCertificate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCertificate" ADD CONSTRAINT "ComplianceCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramActivity" ADD CONSTRAINT "ProgramActivity_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramActivity" ADD CONSTRAINT "ProgramActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuWeek" ADD CONSTRAINT "MenuWeek_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuWeek" ADD CONSTRAINT "MenuWeek_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuWeekId_fkey" FOREIGN KEY ("menuWeekId") REFERENCES "MenuWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTemplate" ADD CONSTRAINT "ActivityTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTemplateFile" ADD CONSTRAINT "ActivityTemplateFile_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ActivityTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTemplateFile" ADD CONSTRAINT "ActivityTemplateFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoTemplate" ADD CONSTRAINT "TodoTemplate_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoTemplate" ADD CONSTRAINT "TodoTemplate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoTemplate" ADD CONSTRAINT "TodoTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountabilitySeat" ADD CONSTRAINT "AccountabilitySeat_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountabilitySeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountabilitySeatAssignment" ADD CONSTRAINT "AccountabilitySeatAssignment_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "AccountabilitySeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountabilitySeatAssignment" ADD CONSTRAINT "AccountabilitySeatAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPostService" ADD CONSTRAINT "MarketingPostService_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MarketingPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPostService" ADD CONSTRAINT "MarketingPostService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaignService" ADD CONSTRAINT "MarketingCampaignService_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaignService" ADD CONSTRAINT "MarketingCampaignService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffQualification" ADD CONSTRAINT "StaffQualification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_previousContractId_fkey" FOREIGN KEY ("previousContractId") REFERENCES "EmploymentContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffboardingPack" ADD CONSTRAINT "OffboardingPack_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffboardingTask" ADD CONSTRAINT "OffboardingTask_packId_fkey" FOREIGN KEY ("packId") REFERENCES "OffboardingPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOffboarding" ADD CONSTRAINT "StaffOffboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOffboarding" ADD CONSTRAINT "StaffOffboarding_packId_fkey" FOREIGN KEY ("packId") REFERENCES "OffboardingPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOffboardingProgress" ADD CONSTRAINT "StaffOffboardingProgress_offboardingId_fkey" FOREIGN KEY ("offboardingId") REFERENCES "StaffOffboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOffboardingProgress" ADD CONSTRAINT "StaffOffboardingProgress_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OffboardingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoworkTodo" ADD CONSTRAINT "CoworkTodo_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TouchpointLog" ADD CONSTRAINT "TouchpointLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TouchpointLog" ADD CONSTRAINT "TouchpointLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentreContact" ADD CONSTRAINT "CentreContact_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickFeedback" ADD CONSTRAINT "QuickFeedback_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitSurvey" ADD CONSTRAINT "ExitSurvey_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitSurvey" ADD CONSTRAINT "ExitSurvey_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentNurtureStep" ADD CONSTRAINT "ParentNurtureStep_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentNurtureStep" ADD CONSTRAINT "ParentNurtureStep_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentNurtureStep" ADD CONSTRAINT "ParentNurtureStep_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "ParentEnquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayQuestDay" ADD CONSTRAINT "HolidayQuestDay_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingForecast" ADD CONSTRAINT "BookingForecast_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterShift" ADD CONSTRAINT "RosterShift_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionOpportunity" ADD CONSTRAINT "ConversionOpportunity_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTemplateItem" ADD CONSTRAINT "AuditTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AuditTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditInstance" ADD CONSTRAINT "AuditInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AuditTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditInstance" ADD CONSTRAINT "AuditInstance_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditInstance" ADD CONSTRAINT "AuditInstance_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditItemResponse" ADD CONSTRAINT "AuditItemResponse_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "AuditInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditItemResponse" ADD CONSTRAINT "AuditItemResponse_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "AuditTemplateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentEnquiry" ADD CONSTRAINT "ParentEnquiry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentEnquiry" ADD CONSTRAINT "ParentEnquiry_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentEnquiry" ADD CONSTRAINT "ParentEnquiry_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentEnquiryTouchpoint" ADD CONSTRAINT "ParentEnquiryTouchpoint_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "ParentEnquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerContactId_fkey" FOREIGN KEY ("referrerContactId") REFERENCES "CentreContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentVacancy" ADD CONSTRAINT "RecruitmentVacancy_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentVacancy" ADD CONSTRAINT "RecruitmentVacancy_filledByUserId_fkey" FOREIGN KEY ("filledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentVacancy" ADD CONSTRAINT "RecruitmentVacancy_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCandidate" ADD CONSTRAINT "RecruitmentCandidate_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "RecruitmentVacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentCandidate" ADD CONSTRAINT "RecruitmentCandidate_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffReferral" ADD CONSTRAINT "StaffReferral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffReferral" ADD CONSTRAINT "StaffReferral_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "RecruitmentCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPulseSurvey" ADD CONSTRAINT "StaffPulseSurvey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPulseSurvey" ADD CONSTRAINT "StaffPulseSurvey_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverdueFeeRecord" ADD CONSTRAINT "OverdueFeeRecord_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverdueFeeRecord" ADD CONSTRAINT "OverdueFeeRecord_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EBITDAAdjustment" ADD CONSTRAINT "EBITDAAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityImprovementPlan" ADD CONSTRAINT "QualityImprovementPlan_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityImprovementPlan" ADD CONSTRAINT "QualityImprovementPlan_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QIPQualityArea" ADD CONSTRAINT "QIPQualityArea_qipId_fkey" FOREIGN KEY ("qipId") REFERENCES "QualityImprovementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentRecord" ADD CONSTRAINT "IncidentRecord_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentRecord" ADD CONSTRAINT "IncidentRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildInterest" ADD CONSTRAINT "ChildInterest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildInterest" ADD CONSTRAINT "ChildInterest_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildInterest" ADD CONSTRAINT "ChildInterest_linkedToActivityId_fkey" FOREIGN KEY ("linkedToActivityId") REFERENCES "ProgramActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditReview" ADD CONSTRAINT "AuditReview_auditInstanceId_fkey" FOREIGN KEY ("auditInstanceId") REFERENCES "AuditInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemBannerDismissal" ADD CONSTRAINT "SystemBannerDismissal_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "SystemBanner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemBannerDismissal" ADD CONSTRAINT "SystemBannerDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalFeedback" ADD CONSTRAINT "InternalFeedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoworkReport" ADD CONSTRAINT "CoworkReport_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoworkReport" ADD CONSTRAINT "CoworkReport_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoworkReport" ADD CONSTRAINT "CoworkReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChecklist" ADD CONSTRAINT "DailyChecklist_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChecklist" ADD CONSTRAINT "DailyChecklist_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChecklistItem" ADD CONSTRAINT "DailyChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "DailyChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChecklistItem" ADD CONSTRAINT "DailyChecklistItem_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentimentScore" ADD CONSTRAINT "SentimentScore_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAnomaly" ADD CONSTRAINT "AttendanceAnomaly_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendInsight" ADD CONSTRAINT "TrendInsight_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReport" ADD CONSTRAINT "FinanceReport_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentFeedback" ADD CONSTRAINT "ParentFeedback_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipMeeting" ADD CONSTRAINT "PartnershipMeeting_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipMeeting" ADD CONSTRAINT "PartnershipMeeting_schoolRelationshipId_fkey" FOREIGN KEY ("schoolRelationshipId") REFERENCES "SchoolRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentExperience" ADD CONSTRAINT "ParentExperience_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfoSnippet" ADD CONSTRAINT "InfoSnippet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnippetAck" ADD CONSTRAINT "SnippetAck_snippetId_fkey" FOREIGN KEY ("snippetId") REFERENCES "InfoSnippet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnippetAck" ADD CONSTRAINT "SnippetAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "EnrolmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrolment" ADD CONSTRAINT "SequenceEnrolment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrolment" ADD CONSTRAINT "SequenceEnrolment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CentreContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrolment" ADD CONSTRAINT "SequenceEnrolment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStepExecution" ADD CONSTRAINT "SequenceStepExecution_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "SequenceEnrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStepExecution" ADD CONSTRAINT "SequenceStepExecution_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "SequenceStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

