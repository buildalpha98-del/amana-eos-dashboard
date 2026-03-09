import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import type { PrismaClient } from "@prisma/client";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["owner", "head_office", "admin", "member", "staff"]).optional(),
  active: z.boolean().optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
  state: z.string().optional().nullable(),
});

// PATCH /api/users/:id — update a user (owner + admin)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
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

  return NextResponse.json(updated);
}

// DELETE /api/users/:id — hard delete a user (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner"]);
  if (error) return error;

  const { id } = await params;

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

  // Run in a transaction: nullify FK references, then delete owned cascadeable records, then delete user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.$transaction(async (tx: any) => {
    // Nullify optional foreign-key references pointing to this user
    await tx.rock.updateMany({ where: { ownerId: id }, data: { ownerId: null } }).catch(() => {});
    await tx.todo.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }).catch(() => {});
    await tx.todo.updateMany({ where: { createdById: id }, data: { createdById: null } }).catch(() => {});
    await tx.issue.updateMany({ where: { raisedById: id }, data: { raisedById: null } }).catch(() => {});
    await tx.issue.updateMany({ where: { ownerId: id }, data: { ownerId: null } }).catch(() => {});
    await tx.marketingPost.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }).catch(() => {});
    await tx.marketingPost.updateMany({ where: { approvedById: id }, data: { approvedById: null } }).catch(() => {});
    await tx.marketingTask.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }).catch(() => {});
    await tx.supportTicket.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }).catch(() => {});
    await tx.service.updateMany({ where: { managerId: id }, data: { managerId: null } }).catch(() => {});
    await tx.leaveRequest.updateMany({ where: { approverId: id }, data: { approverId: null } }).catch(() => {});
    await tx.lead.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }).catch(() => {});
    await tx.measurable.updateMany({ where: { ownerId: id }, data: { ownerId: null } }).catch(() => {});
    await tx.measurableEntry.updateMany({ where: { enteredById: id }, data: { enteredById: null } }).catch(() => {});
    await tx.project.updateMany({ where: { ownerId: id }, data: { ownerId: null } }).catch(() => {});
    await tx.meeting.updateMany({ where: { createdById: id }, data: { createdById: null } }).catch(() => {});
    await tx.document.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } }).catch(() => {});
    await tx.attachment.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } }).catch(() => {});
    await tx.announcement.updateMany({ where: { authorId: id }, data: { authorId: null } }).catch(() => {});
    await tx.todoTemplate.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }).catch(() => {});

    // Delete owned cascadeable records
    await tx.activityLog.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.notificationDismissal.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.announcementRead.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.cascadeAcknowledgment.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.weeklyPulse.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.passwordResetToken.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.marketingComment.deleteMany({ where: { authorId: id } }).catch(() => {});
    await tx.accountabilitySeatAssignment.deleteMany({ where: { userId: id } }).catch(() => {});

    // HR records
    await tx.emergencyContact.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.staffQualification.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.leaveBalance.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.timesheetEntry.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.policyAcknowledgement.deleteMany({ where: { userId: id } }).catch(() => {});

    // Onboarding / LMS
    await tx.staffOnboarding.deleteMany({ where: { userId: id } }).catch(() => {});
    await tx.lMSEnrollment.deleteMany({ where: { userId: id } }).catch(() => {});

    // Compliance
    await tx.complianceCertificate.deleteMany({ where: { userId: id } }).catch(() => {});

    // API keys
    await tx.apiKey.deleteMany({ where: { createdById: id } }).catch(() => {});

    // Finally delete the user
    await tx.user.delete({ where: { id } });
  });

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
}
