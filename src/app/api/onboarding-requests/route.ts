import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { EmploymentType, AwardLevel, QualificationType, NewStarterRequestStatus } from "@prisma/client";
import { notifyNewStarterRequestSubmitted } from "@/lib/new-starter-request/notify";
import { generateTempPassword } from "@/lib/temp-password";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";
import { seedOnboardingPackage } from "@/lib/onboarding-seed";
import { assignOnboardingPack } from "@/lib/onboarding-assign";
import { sendWelcomeInvite } from "@/lib/staff-invite";
import { sendFirstShiftChecklistEmail } from "@/lib/new-starter-request/first-shift-email";
import { seedNewStarterCheckIns } from "@/lib/new-starter-request/check-ins";
import { logger } from "@/lib/logger";

/**
 * Onboarding requests — the Team tab's leadership-only "Onboarding"
 * sub-tab. A state manager (head_office), admin, or owner submits a known
 * new hire's details, which immediately:
 *   1. creates the real User account (staff, new_starter induction status)
 *   2. seeds the standard onboarding todos + assigns a default pack if one
 *      exists for the centre
 *   3. emails the new hire their dashboard invite AND a first-shift
 *      checklist
 *   4. seeds the day-1/week-1/month-1 check-in touchpoints
 *   5. notifies every admin-tier user (in-app + email) to do the
 *      Employment Hero + contract paperwork
 * The NewStarterRequest row itself is created already "completed" — it's
 * the audit record, not a pending ticket someone else has to action.
 */

const requestInclude = {
  requestedBy: { select: { id: true, name: true, email: true, avatar: true } },
  assignedAdmin: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  completedUser: { select: { id: true, name: true, email: true } },
  service: { select: { id: true, name: true } },
} as const;

// ---------------------------------------------------------------------------
// GET — list. Admin-tier only.
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  status: z.nativeEnum(NewStarterRequestStatus).optional(),
});

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid query", parsed.error.flatten());
    }
    const where: Record<string, unknown> = {};
    if (parsed.data.status) where.status = parsed.data.status;

    const requests = await prisma.newStarterRequest.findMany({
      where,
      include: requestInclude,
      orderBy: [{ createdAt: "desc" }],
    });
    return NextResponse.json({ requests });
  },
  { roles: ["owner", "head_office", "admin"] },
);

// ---------------------------------------------------------------------------
// POST — create. Admin-tier only (state manager / admin / owner).
// ---------------------------------------------------------------------------

const createBodySchema = z.object({
  fullName: z.string().min(1).max(200),
  dateOfBirth: z.coerce.date(),
  address: z.string().min(1).max(500),
  mobile: z.string().min(1).max(40),
  email: z.string().email().max(200),
  targetPosition: z.string().min(1).max(200),
  employmentType: z.nativeEnum(EmploymentType),
  awardLevel: z.nativeEnum(AwardLevel),
  awardLevelCustom: z.string().max(100).optional(),
  qualification: z.nativeEnum(QualificationType).optional().nullable(),
  serviceId: z.string().min(1),
  expectedStartDate: z.coerce.date(),
  notes: z.string().max(5000).optional(),
});

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid request payload", parsed.error.flatten());
    }
    const data = parsed.data;
    const email = data.email.trim().toLowerCase();

    if (data.awardLevel === "custom" && !data.awardLevelCustom?.trim()) {
      throw ApiError.badRequest("A custom award level label is required when award level is Custom");
    }

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
      select: { id: true },
    });
    if (!service) throw ApiError.badRequest("Service not found");

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw ApiError.conflict(`${email} already has a dashboard account.`);
    }

    // A default onboarding pack for this centre, falling back to an
    // org-wide default — same "most specific wins" precedence as the
    // rest of the per-service content system.
    const defaultPack = await prisma.onboardingPack.findFirst({
      where: {
        deleted: false,
        isDefault: true,
        OR: [{ serviceId: data.serviceId }, { serviceId: null }],
      },
      orderBy: { serviceId: "desc" }, // service-specific (non-null) sorts before org-wide
      select: { id: true, tasks: { select: { title: true }, orderBy: { sortOrder: "asc" } } },
    });

    const tempPassword = generateTempPassword();
    const passwordHash = await hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        name: data.fullName,
        email,
        phone: data.mobile,
        passwordHash,
        role: "staff",
        serviceId: data.serviceId,
        notificationPrefs: getDefaultNotificationPrefs("staff"),
        inductionStatus: "new_starter",
        inductionDueDate: data.expectedStartDate,
        startDate: data.expectedStartDate,
      },
      select: { id: true, name: true, email: true, serviceId: true },
    });

    const created = await prisma.newStarterRequest.create({
      data: {
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        address: data.address,
        mobile: data.mobile,
        email,
        targetPosition: data.targetPosition,
        employmentType: data.employmentType,
        awardLevel: data.awardLevel,
        awardLevelCustom: data.awardLevel === "custom" ? data.awardLevelCustom ?? null : null,
        qualification: data.qualification ?? null,
        serviceId: data.serviceId,
        expectedStartDate: data.expectedStartDate,
        notes: data.notes ?? null,
        requestedById: session.user.id,
        status: "completed",
        completedById: session.user.id,
        completedAt: new Date(),
        completedUserId: user.id,
      },
      include: requestInclude,
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "create",
        entityType: "NewStarterRequest",
        entityId: created.id,
        details: { fullName: created.fullName, serviceId: created.serviceId, createdUserId: user.id },
      },
    });

    // Standard onboarding todos + welcome announcement — same seed every
    // new hire gets, regardless of how the account was created.
    await seedOnboardingPackage(user.id, { serviceId: user.serviceId });

    if (defaultPack) {
      try {
        await assignOnboardingPack({
          userId: user.id,
          packId: defaultPack.id,
          dueDate: data.expectedStartDate.toISOString(),
          actorId: session.user.id,
        });
      } catch (err) {
        // Never let a pack-assignment hiccup block the rest of onboarding —
        // admin can assign one manually from the Induction tab if this fails.
        logger.error("Onboarding request: default pack assignment failed", {
          userId: user.id,
          packId: defaultPack.id,
          err,
        });
      }
    }

    // Two emails to the new hire: the standard "here's your login" invite,
    // then the onboarding-specific "what to do before your first shift"
    // checklist (pulled from the pack just assigned, if any).
    await sendWelcomeInvite({ email, name: data.fullName, tempPassword });
    await sendFirstShiftChecklistEmail({
      email,
      name: data.fullName,
      startDate: data.expectedStartDate,
      checklistItems: defaultPack?.tasks.map((t) => t.title) ?? [],
    });

    await seedNewStarterCheckIns(prisma, user.id, data.expectedStartDate);

    await notifyNewStarterRequestSubmitted(prisma, {
      id: created.id,
      fullName: created.fullName,
      requestedById: created.requestedById,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
