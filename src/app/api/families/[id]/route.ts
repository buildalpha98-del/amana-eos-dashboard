/**
 * GET    /api/families/:id — one family: contacts, children, billing.
 * PATCH  /api/families/:id — family name + billing arrangement.
 * DELETE /api/families/:id — remove a parent ACCOUNT.
 *
 * 2026-07-30, per Daniel: "for the test account that I made, I wanna be
 * able to delete it and then re-invite the account just so I can keep
 * testing it."
 *
 * SCOPE, deliberately narrow: this deletes the login account and its
 * in-progress draft (cascade). It does NOT touch EnrolmentSubmission or
 * Child records — those are the actual enrolment history and, for a real
 * family, deleting them would destroy records we're required to keep.
 * Removing the account frees the email so it can sign up again, which is
 * exactly the re-test loop.
 *
 * Owner-only, and logged before the delete so the audit trail survives.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getParentEnrolmentState } from "@/lib/parent-enrolment-state";
import { anchorDayValid, isBillingFrequency } from "@/lib/family-billing";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Enrolments are linked to an account by the parent's EMAIL inside a JSON
 * column, not a foreign key. Shared by GET and PATCH so the two can't
 * disagree about which submissions belong to a family.
 */
async function submissionsForEmail(email: string) {
  const all = await prisma.enrolmentSubmission.findMany({
    select: {
      id: true,
      status: true,
      createdAt: true,
      primaryParent: true,
      secondaryParent: true,
      emergencyContacts: true,
      paymentMethod: true,
      paymentDetails: true,
      childRecords: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          status: true,
          dob: true,
          schoolName: true,
          yearLevel: true,
          ccsStatus: true,
          service: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return all.filter((s) => {
    const p = s.primaryParent as Record<string, unknown> | null;
    return (
      p && typeof p.email === "string" && p.email.toLowerCase().trim() === email
    );
  });
}

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as Ctx).params;

    const account = await prisma.parentAccount.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        surname: true,
        familyName: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        billingFrequency: true,
        billingAnchorDay: true,
        billingLimitCents: true,
        billingNotes: true,
        billingStartDate: true,
        billingPeriodStart: true,
        nextBillingDate: true,
        billingWeeks: true,
        autoInvoice: true,
        pauseDebiting: true,
        billingReminderDate: true,
        billingReminderNotes: true,
        enrolmentDraft: {
          select: { currentStep: true, updatedAt: true, submittedAt: true },
        },
      },
    });
    if (!account) throw ApiError.notFound("Family not found");

    const subs = await submissionsForEmail(account.email);
    const latest = subs[0] ?? null;

    // Bank/card details are MASKED here. The full value is encrypted and
    // only ever released by POST /api/enrolments/[id]/payment, which is
    // owner/head_office-only — this endpoint is open to admin too, so it
    // must not become a side door around that.
    const masked = (latest?.paymentDetails ?? null) as Record<
      string,
      unknown
    > | null;
    const payment = masked
      ? {
          method: latest?.paymentMethod ?? null,
          lastFour: masked.lastFour ?? null,
          cardType: masked.cardType ?? null,
          bsbLastThree: masked.bsbLastThree ?? null,
          accountLastFour: masked.accountLastFour ?? null,
          hasEncryptedDetails: typeof masked.raw === "string",
          enrolmentId: latest?.id ?? null,
        }
      : null;

    return NextResponse.json({
      id: account.id,
      email: account.email,
      familyName: account.familyName || account.surname || null,
      contactName:
        [account.firstName, account.surname].filter(Boolean).join(" ") || null,
      emailVerified: Boolean(account.emailVerifiedAt),
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
      enrolmentState: getParentEnrolmentState(subs),
      draft: account.enrolmentDraft
        ? {
            currentStep: account.enrolmentDraft.currentStep,
            updatedAt: account.enrolmentDraft.updatedAt,
            submittedAt: account.enrolmentDraft.submittedAt,
          }
        : null,
      billing: {
        frequency: account.billingFrequency,
        anchorDay: account.billingAnchorDay,
        limitCents: account.billingLimitCents,
        notes: account.billingNotes,
        startDate: account.billingStartDate,
        periodStart: account.billingPeriodStart,
        nextBillingDate: account.nextBillingDate,
        weeks: account.billingWeeks,
        autoInvoice: account.autoInvoice,
        pauseDebiting: account.pauseDebiting,
        reminderDate: account.billingReminderDate,
        reminderNotes: account.billingReminderNotes,
      },
      payment,
      primaryParent: latest?.primaryParent ?? null,
      secondaryParent: latest?.secondaryParent ?? null,
      emergencyContacts: latest?.emergencyContacts ?? null,
      enrolments: subs.map((s) => ({
        id: s.id,
        status: s.status,
        createdAt: s.createdAt,
      })),
      children: subs.flatMap((s) =>
        s.childRecords.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.surname}`.trim(),
          status: c.status,
          dob: c.dob,
          schoolName: c.schoolName,
          classroom: c.yearLevel,
          ccsStatus: c.ccsStatus,
          serviceName: c.service?.name ?? null,
          serviceId: c.service?.id ?? null,
        })),
      ),
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

const patchSchema = z.object({
  familyName: z.string().trim().max(120).nullable().optional(),
  billingFrequency: z.string().nullable().optional(),
  billingAnchorDay: z.number().int().nullable().optional(),
  billingLimitCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
  billingNotes: z.string().max(2000).nullable().optional(),
  // Dates arrive as "YYYY-MM-DD" from a date input.
  billingStartDate: z.string().nullable().optional(),
  billingPeriodStart: z.string().nullable().optional(),
  nextBillingDate: z.string().nullable().optional(),
  billingWeeks: z.number().int().min(1).max(52).nullable().optional(),
  autoInvoice: z.boolean().optional(),
  pauseDebiting: z.boolean().optional(),
  billingReminderDate: z.string().nullable().optional(),
  billingReminderNotes: z.string().max(2000).nullable().optional(),
});

/**
 * "YYYY-MM-DD" → Date, or null.
 *
 * Parsed as UTC midnight on purpose: these are calendar dates, not
 * instants. `new Date("2026-04-13")` is already UTC, but building one from
 * local parts would shift the stored day for anyone east of Greenwich —
 * which is everyone here.
 */
function parseDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v.trim() === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const d = new Date(`${v.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    if (
      d.billingFrequency !== undefined &&
      d.billingFrequency !== null &&
      !isBillingFrequency(d.billingFrequency)
    ) {
      throw ApiError.badRequest(
        "Billing frequency must be weekly, fortnightly or monthly.",
      );
    }

    const existing = await prisma.parentAccount.findUnique({
      where: { id },
      select: { billingFrequency: true },
    });
    if (!existing) throw ApiError.notFound("Family not found");

    // Validate the day against the frequency being SAVED, not the stored
    // one — otherwise switching monthly→weekly leaves day 28 in place and
    // silently means "the 28th weekday".
    const effectiveFrequency =
      d.billingFrequency !== undefined
        ? d.billingFrequency
        : existing.billingFrequency;
    if (
      d.billingAnchorDay !== undefined &&
      !anchorDayValid(effectiveFrequency, d.billingAnchorDay)
    ) {
      throw ApiError.badRequest(
        effectiveFrequency === "monthly"
          ? "Billing day must be between 1 and 28 — later days don't exist in every month."
          : "Billing day must be a weekday (1 = Monday, 7 = Sunday).",
      );
    }

    // Reject a malformed date rather than storing null — silently
    // clearing a billing date staff meant to set is how an invoice run
    // quietly skips a family.
    const dateFields: Record<string, Date | null> = {};
    for (const key of [
      "billingStartDate",
      "billingPeriodStart",
      "nextBillingDate",
      "billingReminderDate",
    ] as const) {
      const parsedDate = parseDate(d[key]);
      if (parsedDate === undefined && d[key] !== undefined) {
        throw ApiError.badRequest(`${key} must be a date in YYYY-MM-DD format.`);
      }
      if (parsedDate !== undefined) dateFields[key] = parsedDate;
    }

    const updated = await prisma.parentAccount.update({
      where: { id },
      data: {
        ...(d.familyName !== undefined ? { familyName: d.familyName || null } : {}),
        ...(d.billingFrequency !== undefined
          ? { billingFrequency: d.billingFrequency || null }
          : {}),
        ...(d.billingAnchorDay !== undefined
          ? { billingAnchorDay: d.billingAnchorDay }
          : {}),
        ...(d.billingLimitCents !== undefined
          ? { billingLimitCents: d.billingLimitCents }
          : {}),
        ...(d.billingNotes !== undefined
          ? { billingNotes: d.billingNotes || null }
          : {}),
        ...dateFields,
        ...(d.billingWeeks !== undefined ? { billingWeeks: d.billingWeeks } : {}),
        ...(d.autoInvoice !== undefined ? { autoInvoice: d.autoInvoice } : {}),
        ...(d.pauseDebiting !== undefined
          ? { pauseDebiting: d.pauseDebiting }
          : {}),
        ...(d.billingReminderNotes !== undefined
          ? { billingReminderNotes: d.billingReminderNotes || null }
          : {}),
      },
      select: {
        familyName: true,
        billingFrequency: true,
        billingAnchorDay: true,
        billingLimitCents: true,
        billingNotes: true,
        billingStartDate: true,
        billingPeriodStart: true,
        nextBillingDate: true,
        billingWeeks: true,
        autoInvoice: true,
        pauseDebiting: true,
        billingReminderDate: true,
        billingReminderNotes: true,
      },
    });

    return NextResponse.json({ ok: true, ...updated });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;

    const account = await prisma.parentAccount.findUnique({
      where: { id },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!account) throw ApiError.notFound("Parent account not found");

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "delete",
        entityType: "ParentAccount",
        entityId: id,
        details: {
          email: account.email,
          wasVerified: Boolean(account.emailVerifiedAt),
          note: "Login account + draft removed. Enrolment submissions and child records retained.",
        },
      },
    });

    // Cascade removes ParentEmailVerification rows and the EnrolmentDraft.
    await prisma.parentAccount.delete({ where: { id } });

    return NextResponse.json({ ok: true, email: account.email });
  },
  { roles: ["owner"] },
);
