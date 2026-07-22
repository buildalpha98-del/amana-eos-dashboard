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
import { parseRoleParam, EOS_ASSIGNEE_ROLES } from "@/lib/role-enum";
import { resolveServiceIdFilter } from "@/lib/authz-scope";
import { generateTempPassword } from "@/lib/temp-password";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required").transform((e) => e.toLowerCase().trim()),
  // Optional — "invite mode". When omitted the API mints a strong random
  // temp password and emails it (welcome email below). When supplied, the
  // admin's password is breach-checked as before.
  password: passwordSchema.optional(),
  role: z
    .enum(["owner", "head_office", "admin", "marketing", "member", "staff", "eos_viewer", "eos_implementer", "eos"])
    .default("member"),
  serviceId: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  // When true, the account starts locked in the induction flow (new_starter)
  // and cannot be rostered / clock in until it clears. Omit for admin accounts
  // and corrections — those default to `cleared` (unchanged behaviour).
  newStarter: z.boolean().optional(),
  startDate: z.string().datetime().optional().nullable(),
});

// GET /api/users — list all users (any authenticated user)
// Optional filters: ?serviceId=xxx&role=xxx&active=true
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const role = searchParams.get("role");
  const active = searchParams.get("active");
  // 2026-07-13: `?scope=eos_assignees` narrows the list to the roles
  // eligible to own/be-assigned on EOS surfaces (todos, rocks,
  // scorecard, issues, meetings). Excludes staff (Educator) and member
  // (OSHC Coordinator) so those dropdowns aren't cluttered with a full
  // staff roster. Unknown scope values are silently ignored.
  const scope = searchParams.get("scope");

  // 2026-05-01: validate `?role=` against the actual Role enum before
  // letting it reach Prisma's where clause. Previously `role as any`
  // forwarded any string and Prisma 500'd when the value wasn't in the
  // enum. parseRoleParam returns null for unknown values so the filter
  // is silently dropped — matches the /api/team route's contract.
  const validatedRole = parseRoleParam(role);

  // Centre-scope: a `member` can't enumerate other centres' users by passing
  // any ?serviceId= — non-admins always resolve to their own service.
  const scopedServiceId = resolveServiceIdFilter(session, serviceId);

  const users = await prisma.user.findMany({
    where: {
      ...(scopedServiceId ? { serviceId: scopedServiceId } : {}),
      ...(validatedRole ? { role: validatedRole } : {}),
      ...(active !== null && active !== undefined
        ? { active: active === "true" }
        : {}),
      ...(scope === "eos_assignees"
        ? { role: { in: [...EOS_ASSIGNEE_ROLES] } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      notificationsMuted: true,
      avatar: true,
      serviceId: true,
      state: true,
      service: { select: { id: true, name: true, code: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}, { minRole: "member" });

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

  const { name, email, role, serviceId, state, newStarter, startDate } = parsed.data;
  // Invite mode: no password supplied → mint a strong random one to email.
  const providedPassword = parsed.data.password;
  const password = providedPassword ?? generateTempPassword();

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

  // Breach-check only an admin-supplied password. A freshly minted random
  // temp password needs no HIBP lookup (it's high-entropy and unguessable).
  if (providedPassword) {
    const breachCount = await checkPasswordBreach(providedPassword);
    if (breachCount > 0) {
      return NextResponse.json(
        { error: `This password has appeared in ${breachCount.toLocaleString()} data breaches. Please choose a different password.` },
        { status: 400 },
      );
    }
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
      // New starters begin locked in induction; everyone else stays `cleared`.
      ...(newStarter
        ? {
            inductionStatus: "new_starter" as const,
            inductionDueDate: startDate ? new Date(startDate) : null,
            ...(startDate ? { startDate: new Date(startDate) } : {}),
          }
        : {}),
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
  const { subject, html } = await welcomeEmail(name.split(" ")[0], password, loginUrl);

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
