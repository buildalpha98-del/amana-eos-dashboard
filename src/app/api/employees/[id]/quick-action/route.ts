import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { seedOnboardingPackage } from "@/lib/onboarding-seed";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

const ACTIONS = [
  "reset_password",
  "trigger_onboarding",
  "toggle_admin",
  "toggle_active",
] as const;

const bodySchema = z.object({
  action: z.enum(ACTIONS),
});

export type QuickActionType = (typeof ACTIONS)[number];

export const POST = withApiAuth(async (req: NextRequest, session, context) => {
  const { id } = await context!.params!;
  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid action");
  }
  const { action } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
    },
  });
  if (!target) {
    throw ApiError.notFound("Employee not found");
  }

  const viewerRole = session!.user.role;
  const viewerId = session!.user.id;
  const isOwner = viewerRole === "owner";
  const isAdmin = isAdminRole(viewerRole);

  switch (action) {
    case "reset_password":
      if (!isAdmin) throw ApiError.forbidden("Admin required");
      return await handleResetPassword(target, viewerId);

    case "trigger_onboarding":
      if (!isAdmin) throw ApiError.forbidden("Admin required");
      return await handleTriggerOnboarding(target, viewerId);

    case "toggle_admin":
      if (!isOwner) throw ApiError.forbidden("Owner required");
      if (target.id === viewerId) {
        throw ApiError.badRequest("Cannot change own admin status");
      }
      return await handleToggleAdmin(target, viewerId);

    case "toggle_active":
      if (!isAdmin) throw ApiError.forbidden("Admin required");
      if (target.id === viewerId) {
        throw ApiError.badRequest("Cannot deactivate yourself");
      }
      // Only owners can deactivate other admins / head_office / owners
      if (
        !isOwner &&
        (target.role === "owner" ||
          target.role === "head_office" ||
          target.role === "admin")
      ) {
        throw ApiError.forbidden(
          "Only owners can deactivate admin or owner accounts",
        );
      }
      return await handleToggleActive(target, viewerId);
  }
});

async function handleResetPassword(
  target: { id: string; email: string; name: string },
  viewerId: string,
) {
  // Invalidate any existing unused tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: target.id, used: false },
    data: { used: true },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { token, userId: target.id, expiresAt },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const { subject, html } = passwordResetEmail(
    target.name.split(" ")[0],
    resetUrl,
  );
  const resend = getResend();
  if (resend) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: target.email,
      subject,
      html,
    });
  } else if (process.env.NODE_ENV !== "production") {
    logger.info("Quick-action reset link (dev)", { resetUrl });
  }

  await prisma.activityLog.create({
    data: {
      userId: viewerId,
      action: "quick_action.reset_password",
      entityType: "User",
      entityId: target.id,
    },
  });

  return NextResponse.json({
    ok: true,
    message: `Password reset email sent to ${target.email}`,
  });
}

async function handleTriggerOnboarding(
  target: { id: string; name: string },
  viewerId: string,
) {
  // seedOnboardingPackage is idempotent — checks for existing first todo by
  // title before inserting; safe to re-fire.
  await seedOnboardingPackage(target.id);

  await prisma.activityLog.create({
    data: {
      userId: viewerId,
      action: "quick_action.trigger_onboarding",
      entityType: "User",
      entityId: target.id,
    },
  });

  return NextResponse.json({
    ok: true,
    message: `Onboarding checklist triggered for ${target.name}`,
  });
}

async function handleToggleAdmin(
  target: { id: string; name: string; role: string },
  viewerId: string,
) {
  const newRole = target.role === "admin" ? "member" : "admin";
  await prisma.user.update({
    where: { id: target.id },
    data: { role: newRole },
  });

  await prisma.activityLog.create({
    data: {
      userId: viewerId,
      action: "quick_action.toggle_admin",
      entityType: "User",
      entityId: target.id,
      details: { from: target.role, to: newRole },
    },
  });

  return NextResponse.json({
    ok: true,
    message:
      newRole === "admin"
        ? `${target.name} is now an admin`
        : `${target.name} admin role removed`,
    newRole,
  });
}

async function handleToggleActive(
  target: { id: string; name: string; active: boolean },
  viewerId: string,
) {
  const newActive = !target.active;
  await prisma.user.update({
    where: { id: target.id },
    data: { active: newActive },
  });

  await prisma.activityLog.create({
    data: {
      userId: viewerId,
      action: newActive
        ? "quick_action.reactivate"
        : "quick_action.deactivate",
      entityType: "User",
      entityId: target.id,
    },
  });

  return NextResponse.json({
    ok: true,
    message: newActive
      ? `${target.name} reactivated`
      : `${target.name} deactivated`,
    newActive,
  });
}
