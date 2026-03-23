import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkPasswordBreach } from "@/lib/password-breach-check";
import { logAuditEvent } from "@/lib/audit-log";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { parseJsonBody } from "@/lib/api-error";

const updateUserSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  role: z.enum(["owner", "head_office", "admin", "marketing", "coordinator", "member", "staff"], {
    error: "Invalid role. Must be one of: owner, head_office, admin, marketing, coordinator, member, staff",
  }).optional(),
  active: z.boolean().optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
  state: z.string().optional().nullable(),
});

// PATCH /api/users/:id — update a user (owner + admin)
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Guard: only owners can promote to owner or head_office
  if (session!.user.role !== "owner" && (parsed.data.role === "owner" || parsed.data.role === "head_office")) {
    return NextResponse.json(
      { error: "Only owners can assign the owner or head office role." },
      { status: 403 }
    );
  }

  // Guard: only owners can modify other admins, head_office, or owners
  if (
    session!.user.role !== "owner" &&
    (user.role === "owner" || user.role === "head_office" || user.role === "admin") &&
    user.id !== session!.user.id
  ) {
    return NextResponse.json(
      { error: "Only owners can modify admin or owner accounts." },
      { status: 403 }
    );
  }

  // Build update payload — handle password separately
  const { newPassword, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (newPassword) {
    const breachCount = await checkPasswordBreach(newPassword);
    if (breachCount > 0) {
      return NextResponse.json(
        { error: `This password has appeared in ${breachCount.toLocaleString()} data breaches. Please choose a different password.` },
        { status: 400 },
      );
    }
    updateData.passwordHash = await hash(newPassword, 12);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      state: true,
      createdAt: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: newPassword ? "reset_password" : "update",
      entityType: "User",
      entityId: id,
      details: { ...rest, passwordReset: !!newPassword },
    },
  });

  // Security audit: log role changes and password resets
  if (rest.role && rest.role !== user.role) {
    logAuditEvent({
      action: "user.role_change",
      actorId: session!.user.id,
      actorEmail: session!.user.email,
      targetId: id,
      targetType: "User",
      metadata: { oldRole: user.role, newRole: rest.role },
    }, req);
  }
  if (newPassword) {
    logAuditEvent({
      action: "user.password_change",
      actorId: session!.user.id,
      actorEmail: session!.user.email,
      targetId: id,
      targetType: "User",
    }, req);
  }

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/users/:id — hard delete a user (owner only)
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  // Prevent self-delete
  if (id === session!.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent deleting the last owner
  if (user.role === "owner") {
    const ownerCount = await prisma.user.count({ where: { role: "owner" } });
    if (ownerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last owner account." },
        { status: 400 }
      );
    }
  }

  // Run in a transaction: nullify FK references, then delete owned cascadeable records, then delete user.
  // No .catch() handlers — if any operation fails, the entire transaction rolls back atomically.
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Nullify optional foreign-key references pointing to this user
      await tx.rock.updateMany({ where: { ownerId: id }, data: { ownerId: null } });
      await tx.todo.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.todo.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.issue.updateMany({ where: { raisedById: id }, data: { raisedById: null } });
      await tx.issue.updateMany({ where: { ownerId: id }, data: { ownerId: null } });
      await tx.marketingPost.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.marketingPost.updateMany({ where: { approvedById: id }, data: { approvedById: null } });
      await tx.marketingTask.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.supportTicket.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });
      await tx.service.updateMany({ where: { managerId: id }, data: { managerId: null } });
      await tx.leaveRequest.updateMany({ where: { reviewedById: id }, data: { reviewedById: null } });
      await tx.lead.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });
      await tx.measurable.updateMany({ where: { ownerId: id }, data: { ownerId: null } });
      await tx.measurableEntry.updateMany({ where: { enteredById: id }, data: { enteredById: null } });
      await tx.project.updateMany({ where: { ownerId: id }, data: { ownerId: null } });
      await tx.meeting.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.document.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } });
      await tx.attachment.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } });
      await tx.announcement.updateMany({ where: { authorId: id }, data: { authorId: null } });
      await tx.todoTemplate.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });

      // Meeting attendees & multi-assign todos
      await tx.meetingAttendee.deleteMany({ where: { userId: id } });
      await tx.todoAssignee.deleteMany({ where: { userId: id } });

      // Delete owned cascadeable records
      await tx.activityLog.deleteMany({ where: { userId: id } });
      await tx.notificationDismissal.deleteMany({ where: { userId: id } });
      await tx.announcementRead.deleteMany({ where: { userId: id } });
      await tx.cascadeAcknowledgment.deleteMany({ where: { userId: id } });
      await tx.weeklyPulse.deleteMany({ where: { userId: id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: id } });
      await tx.marketingComment.deleteMany({ where: { authorId: id } });
      await tx.accountabilitySeatAssignment.deleteMany({ where: { userId: id } });

      // HR records
      await tx.emergencyContact.deleteMany({ where: { userId: id } });
      await tx.staffQualification.deleteMany({ where: { userId: id } });
      await tx.leaveBalance.deleteMany({ where: { userId: id } });
      await tx.timesheetEntry.deleteMany({ where: { userId: id } });
      await tx.policyAcknowledgement.deleteMany({ where: { userId: id } });

      // Onboarding / LMS
      await tx.staffOnboarding.deleteMany({ where: { userId: id } });
      await tx.lMSEnrollment.deleteMany({ where: { userId: id } });

      // Compliance
      await tx.complianceCertificate.deleteMany({ where: { userId: id } });

      // API keys
      await tx.apiKey.deleteMany({ where: { createdById: id } });

      // Models added after initial delete handler
      await tx.aiUsage.deleteMany({ where: { userId: id } });
      await tx.calendarIntegration.deleteMany({ where: { userId: id } });
      await tx.employmentContract.deleteMany({ where: { userId: id } });
      await tx.staffOffboarding.deleteMany({ where: { userId: id } });
      await tx.staffPulseSurvey.deleteMany({ where: { userId: id } });
      await tx.systemBannerDismissal.deleteMany({ where: { userId: id } });
      await tx.snippetAck.deleteMany({ where: { userId: id } });
      await tx.staffReferral.deleteMany({ where: { referrerUserId: id } });

      // Nullify additional FK references
      await tx.coworkReport.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });
      await tx.coworkReport.updateMany({ where: { reviewedById: id }, data: { reviewedById: null } });
      await tx.enrolmentSubmission.updateMany({ where: { processedById: id }, data: { processedById: null } });
      await tx.visionTractionOrganiser.updateMany({ where: { updatedById: id }, data: { updatedById: null } });
      await tx.timesheet.updateMany({ where: { approvedById: id }, data: { approvedById: null } });
      await tx.budgetItem.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.programActivity.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.menuWeek.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.activityTemplate.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.activityTemplateFile.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } });
      await tx.todoTemplate.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.termCalendarEntry.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.coworkTodo.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });
      await tx.parentEnquiry.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.recruitmentVacancy.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });
      await tx.overdueFeeRecord.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.eBITDAAdjustment.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.qualityImprovementPlan.updateMany({ where: { reviewedById: id }, data: { reviewedById: null } });
      await tx.incidentRecord.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.emailTemplate.updateMany({ where: { createdById: id }, data: { createdById: null } });
      await tx.infoSnippet.updateMany({ where: { createdById: id }, data: { createdById: null } });

      // Delete owned records with required FK (no onDelete cascade)
      await tx.internalFeedback.deleteMany({ where: { authorId: id } });
      await tx.marketingPostRevision.deleteMany({ where: { userId: id } });
      await tx.scenario.deleteMany({ where: { createdById: id } });

      // Finally delete the user
      await tx.user.delete({ where: { id } });
    });
  } catch (err) {
    logger.error("Failed to delete user", { id, err });
    return NextResponse.json(
      { error: "Failed to delete user. Some related records could not be cleaned up. Please try again or contact support." },
      { status: 500 }
    );
  }

  // Log deletion (outside transaction since user no longer exists)
  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "User",
      entityId: id,
      details: { name: user.name, email: user.email, role: user.role },
    },
  });

  return NextResponse.json({ success: true, message: `User "${user.name}" has been permanently deleted.` });
}, { roles: ["owner"] });
