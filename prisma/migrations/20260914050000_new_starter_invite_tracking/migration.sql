-- New-starter onboarding, phase 3.
--
-- 1. Track whether the dashboard invite actually reached the new hire.
--    sendEmail() returns suppression and provider rejection as VALUES
--    rather than throwing, and the invite helper ignored the return
--    value — so a State Manager saw a successful onboarding while the
--    staff member got nothing. The outcome is recorded here so the
--    Onboarding panel can surface it and offer a resend.
--
-- 2. Award level becomes optional. It's been dropped from the intake
--    form: a State Manager doesn't know the award level at intake (it's
--    settled when the contract is drafted, where EmploymentContract
--    already carries the field). The column is kept, not dropped, so
--    historical rows retain what they were submitted with.

-- CreateEnum
CREATE TYPE "NewStarterInviteStatus" AS ENUM ('sent', 'suppressed', 'rejected', 'not_configured', 'error');

-- AlterTable
ALTER TABLE "NewStarterRequest" ADD COLUMN     "inviteStatus" "NewStarterInviteStatus",
ADD COLUMN     "inviteError" TEXT,
ADD COLUMN     "inviteSentAt" TIMESTAMP(3);

-- AlterTable: awardLevel required -> optional. Widening a NOT NULL to
-- NULL never rejects existing rows, so this is safe to run against a
-- populated table.
ALTER TABLE "NewStarterRequest" ALTER COLUMN "awardLevel" DROP NOT NULL;
