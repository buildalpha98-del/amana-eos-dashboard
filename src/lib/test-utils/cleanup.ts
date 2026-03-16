import { prisma } from "@/lib/prisma";

/**
 * Remove all test records from the database.
 *
 * Order matters: delete child tables first to avoid FK constraint violations.
 * Only call this against the TEST database — never production.
 */
export async function cleanupTestData(): Promise<void> {
  // Safety check: refuse to run against production URLs
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (
    dbUrl.includes("production") ||
    dbUrl.includes("neon.tech") ||
    (!dbUrl.includes("test") && !dbUrl.includes("localhost"))
  ) {
    throw new Error(
      "cleanupTestData refused to run — DATABASE_URL does not appear to be a test database.",
    );
  }

  // Delete in dependency order (children first)
  await prisma.$transaction([
    prisma.parentEnquiryTouchpoint.deleteMany(),
    prisma.parentNurtureStep.deleteMany(),
    prisma.parentEnquiry.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.measurableEntry.deleteMany(),
    prisma.measurable.deleteMany(),
    prisma.todoAssignee.deleteMany(),
    prisma.todo.deleteMany(),
    prisma.issue.deleteMany(),
    prisma.rock.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.leaveBalance.deleteMany(),
    prisma.cronRun.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.service.deleteMany(),
  ]);
}
