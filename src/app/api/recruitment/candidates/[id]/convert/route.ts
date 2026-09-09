import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logAuditEvent } from "@/lib/audit-log";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";
import { generateTempPassword } from "@/lib/temp-password";
import { sendWelcomeInvite } from "@/lib/staff-invite";
import { assignOnboardingPack } from "@/lib/onboarding-assign";

const convertSchema = z.object({
  role: z
    .enum(["owner", "head_office", "admin", "marketing", "member", "staff", "eos_viewer", "eos_implementer", "eos"])
    .default("staff"),
  /** Defaults to the vacancy's service for centre roles when omitted. */
  serviceId: z.string().optional().nullable(),
  // Mirrors POST /api/users: when true the account starts locked in the
  // induction flow and can't be rostered / clock in until cleared.
  newStarter: z.boolean().optional(),
  startDate: z.string().datetime().optional().nullable(),
  /** Optional onboarding pack to assign on conversion. */
  onboardingPackId: z.string().optional().nullable(),
  /** Send the welcome email with a temp password (default true). */
  sendInvite: z.boolean().optional().default(true),
});

/**
 * POST /api/recruitment/candidates/[id]/convert — hire → employee.
 *
 * Creates a User account from a recruitment candidate (invite-mode: a temp
 * password is minted and, when `sendInvite`, emailed via the same welcome
 * path as POST /api/users), stamps the candidate `hired`, marks the vacancy
 * filled by the new user, flips a linked staff referral to `hired`, and
 * optionally assigns an onboarding pack.
 *
 * Role gate is aligned with POST /api/users (owner + admin, with the same
 * "only owners create owners" guard).
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const body = await parseJsonBody(req);
    const parsed = convertSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { role, newStarter, startDate, onboardingPackId, sendInvite } = parsed.data;

    // Guard: admins cannot create owner-level users (same as POST /api/users).
    if (session!.user.role !== "owner" && role === "owner") {
      throw ApiError.forbidden("Only owners can create other owner accounts.");
    }

    const candidate = await prisma.recruitmentCandidate.findUnique({
      where: { id },
      include: {
        vacancy: { select: { id: true, serviceId: true, status: true, filledAt: true } },
        staffReferral: { select: { id: true, status: true } },
        convertedUser: { select: { id: true } },
      },
    });
    if (!candidate) {
      throw ApiError.notFound("Candidate not found");
    }

    // One employee per candidate — the User.candidateId unique is the guard.
    if (candidate.convertedUser) {
      throw new ApiError(409, "This candidate has already been converted to an employee", {
        existingUserId: candidate.convertedUser.id,
      });
    }

    if (!candidate.email) {
      throw ApiError.badRequest(
        "This candidate has no email address — add one before converting.",
      );
    }
    const email = candidate.email.toLowerCase().trim();

    // Centre roles need a centre; default to the vacancy's service.
    const serviceId =
      role === "staff" || role === "member"
        ? (parsed.data.serviceId ?? candidate.vacancy.serviceId)
        : null;
    if ((role === "staff" || role === "member") && !serviceId) {
      throw ApiError.badRequest(
        "Staff and member users must be assigned to a service/centre",
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(409, "A user with this email already exists", {
        existingUserId: existing.id,
      });
    }

    // Invite mode: mint a strong random temp password (same as POST /api/users
    // without a password). No HIBP check needed — it's high-entropy.
    const tempPassword = generateTempPassword();
    const passwordHash = await hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        name: candidate.name,
        email,
        passwordHash,
        role,
        serviceId,
        candidateId: candidate.id,
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
        candidateId: true,
        service: { select: { id: true, name: true, code: true } },
        createdAt: true,
      },
    });

    // Stamp the hire on the pipeline: candidate stage + vacancy filled-by.
    await prisma.recruitmentCandidate.update({
      where: { id: candidate.id },
      data: { stage: "hired", stageChangedAt: new Date() },
    });
    await prisma.recruitmentVacancy.update({
      where: { id: candidate.vacancy.id },
      data: {
        filledByUserId: user.id,
        status: "filled",
        ...(candidate.vacancy.filledAt ? {} : { filledAt: new Date() }),
      },
    });

    // A pending staff referral for this candidate becomes `hired` (the
    // bonus-paid step stays a deliberate manual action on /recruitment).
    if (candidate.staffReferral && candidate.staffReferral.status === "pending") {
      await prisma.staffReferral.update({
        where: { id: candidate.staffReferral.id },
        data: { status: "hired" },
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "convert_candidate",
        entityType: "User",
        entityId: user.id,
        details: {
          name: user.name,
          email: user.email,
          role: user.role,
          serviceId: user.serviceId,
          candidateId: candidate.id,
          vacancyId: candidate.vacancy.id,
        },
      },
    });

    logAuditEvent(
      {
        action: "user.created",
        actorId: session!.user.id,
        actorEmail: session!.user.email,
        targetId: user.id,
        targetType: "User",
        metadata: { role: user.role, email: user.email, convertedFromCandidateId: candidate.id },
      },
      req,
    );

    // Seed onboarding todos + welcome announcement (parity with POST /api/users).
    const { seedOnboardingPackage } = await import("@/lib/onboarding-seed");
    await seedOnboardingPackage(user.id, { serviceId: user.serviceId });

    // Optional onboarding pack — shared helper with /api/onboarding/assign
    // (throws 409 on already-assigned / P2002, 404 on a missing pack; the
    // user, candidate and vacancy writes above stand either way).
    let onboarding: { id: string } | null = null;
    if (onboardingPackId) {
      onboarding = await assignOnboardingPack({
        userId: user.id,
        packId: onboardingPackId,
        dueDate: startDate,
        actorId: session!.user.id,
      });
    }

    if (sendInvite) {
      await sendWelcomeInvite({ email, name: candidate.name, tempPassword });
    }

    return NextResponse.json({ user, onboardingId: onboarding?.id ?? null }, { status: 201 });
  },
  { roles: ["owner", "admin"] },
);
