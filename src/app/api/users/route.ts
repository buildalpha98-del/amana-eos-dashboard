import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";
import { passwordSchema } from "@/lib/schemas/auth";
import { checkPasswordBreach } from "@/lib/password-breach-check";
import { logAuditEvent } from "@/lib/audit-log";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { parseJsonBody } from "@/lib/api-error";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: passwordSchema,
  role: z.enum(["owner", "head_office", "admin", "marketing", "coordinator", "member", "staff"]).default("member"),
  serviceId: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
});

// GET /api/users — list all users (any authenticated user)
// Optional filters: ?serviceId=xxx&role=xxx&active=true
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const role = searchParams.get("role");
  const active = searchParams.get("active");

  const users = await prisma.user.findMany({
    where: {
      ...(serviceId ? { serviceId } : {}),
      ...(role ? { role: role as any } : {}),
      ...(active !== null && active !== undefined
        ? { active: active === "true" }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatar: true,
      serviceId: true,
      state: true,
      service: { select: { id: true, name: true, code: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
});

// POST /api/users — create a new user (owner + admin)
export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, email, password, role, serviceId, state } = parsed.data;

  // Guard: admins cannot create owner-level users
  if (session!.user.role !== "owner" && role === "owner") {
    return NextResponse.json(
      { error: "Only owners can create other owner accounts." },
      { status: 403 }
    );
  }

  // Validate: staff and member roles require a serviceId
  if ((role === "staff" || role === "member") && !serviceId) {
    return NextResponse.json(
      { error: "Staff and member users must be assigned to a service/centre" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  // Check if password has appeared in known data breaches
  const breachCount = await checkPasswordBreach(password);
  if (breachCount > 0) {
    return NextResponse.json(
      { error: `This password has appeared in ${breachCount.toLocaleString()} data breaches. Please choose a different password.` },
      { status: 400 },
    );
  }

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      serviceId: (role === "staff" || role === "member") ? (serviceId || null) : null,
      state: role === "admin" ? (state || null) : null,
      notificationPrefs: getDefaultNotificationPrefs(role),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      serviceId: true,
      state: true,
      service: { select: { id: true, name: true, code: true } },
      createdAt: true,
    },
  });

  // Log the activity
  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "User",
      entityId: user.id,
      details: { name: user.name, email: user.email, role: user.role, serviceId: user.serviceId },
    },
  });

  logAuditEvent({
    action: "user.created",
    actorId: session!.user.id,
    actorEmail: session!.user.email,
    targetId: user.id,
    targetType: "User",
    metadata: { role: user.role, email: user.email },
  }, req);

  // Seed onboarding todos + welcome announcement
  const { seedOnboardingPackage } = await import("@/lib/onboarding-seed");
  await seedOnboardingPackage(user.id, { serviceId: user.serviceId });

  // Send welcome email with temporary password
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const loginUrl = `${baseUrl}/login`;
  const { subject, html } = welcomeEmail(name.split(" ")[0], password, loginUrl);

  const resend = getResend();
  if (resend) {
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: email, subject, html });
    } catch (emailErr) {
      logger.error("Failed to send welcome email", { err: emailErr });
      // Don't fail user creation if email fails
    }
  } else {
    if (process.env.NODE_ENV !== "production") console.log(`[DEV] Welcome email for ${email} — temp password: ${password}`);
  }

  return NextResponse.json(user, { status: 201 });
}, { roles: ["owner", "admin"] });
