-- CreateTable
CREATE TABLE "ContentTeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "ContentTeamRole" NOT NULL,
    "status" "ContentTeamStatus" NOT NULL DEFAULT 'prospect',
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pauseReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentTeamMember_status_idx" ON "ContentTeamMember"("status");

-- CreateIndex
CREATE INDEX "ContentTeamMember_role_idx" ON "ContentTeamMember"("role");

-- CreateTable
CREATE TABLE "SocialCounter" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "feed" INTEGER NOT NULL DEFAULT 0,
    "stories" INTEGER NOT NULL DEFAULT 0,
    "reels" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialCounter_weekStart_key" ON "SocialCounter"("weekStart");

-- AddForeignKey
ALTER TABLE "SocialCounter" ADD CONSTRAINT "SocialCounter_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
