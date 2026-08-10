/**
 * GET/POST /api/compliance/complaints
 *
 * The complaints and feedback register — Reg 168(2)(o), and the sharp
 * end, s.174(2)(b) of the National Law.
 *
 * The dashboard had `incidentType: "complaint"` on the incident table and
 * a staff-performance case file, and neither is the register. A complaint
 * about fees and a complaint alleging a child was left unsupervised share
 * an intake form and are completely different legal objects: the second
 * starts a 24-HOUR clock to notify the Regulatory Authority, and missing
 * it is an offence regardless of whether the allegation turns out to be
 * true.
 *
 * So `notifiable` is asked at INTAKE, not derived at review. The person
 * taking the phone call knows what was alleged; by the time a manager
 * triages it next morning a third of the window is gone. And the
 * deadline is stamped at write time rather than computed on read, so it
 * cannot silently move when someone corrects the awareness date.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  NOTIFIABLE_REASONS,
  createWithReferenceRetry,
  generateComplaintReference,
} from "@/lib/complaint-reference";
import { clockStatus, notificationDueAt } from "@/lib/compliance-clocks";

const categories = COMPLAINT_CATEGORIES.map((c) => c.value) as [
  string,
  ...string[],
];
const reasons = NOTIFIABLE_REASONS.map((r) => r.value) as [string, ...string[]];

const createSchema = z.object({
  serviceId: z.string().min(1),
  receivedAt: z.string().optional(),
  source: z
    .enum(["parent_portal", "phone", "email", "in_person", "letter", "staff", "anonymous"])
    .default("in_person"),
  complainantName: z.string().trim().max(120).optional(),
  complainantEmail: z.string().trim().email().optional().or(z.literal("")),
  complainantPhone: z.string().trim().max(40).optional(),
  anonymous: z.boolean().optional(),
  childId: z.string().optional(),
  childName: z.string().trim().max(120).optional(),
  category: z.enum(categories),
  summary: z.string().trim().min(1).max(2000),
  details: z.string().trim().max(10000).optional(),
  notifiable: z.boolean().optional(),
  notifiableReason: z.enum(reasons).optional(),
  /** When the service became aware. The clock runs from here. */
  becameAwareAt: z.string().optional(),
});

export const GET = withApiAuth(
  async (req, session) => {
    const params = new URL(req.url).searchParams;
    const serviceId = params.get("serviceId");
    const status = params.get("status");
    const outstandingOnly = params.get("outstanding") === "1";

    if (status && !(COMPLAINT_STATUSES as readonly string[]).includes(status)) {
      throw ApiError.badRequest(`Unknown status "${status}"`);
    }

    // Centre scoping: a Director sees their own centre's register, not
    // every centre's. Complaints name staff and families.
    const { serviceIds } = await getCentreScope(session);
    if (serviceId && serviceIds !== null && !serviceIds.includes(serviceId)) {
      throw ApiError.forbidden();
    }

    const rows = await prisma.complaintRecord.findMany({
      where: {
        ...(serviceId
          ? { serviceId }
          : serviceIds !== null
            ? { serviceId: { in: serviceIds } }
            : {}),
        ...(status ? { status } : {}),
        // The sweep that matters: notifiable, and not yet lodged.
        ...(outstandingOnly
          ? { notifiable: true, regulatorNotifiedAt: null }
          : {}),
      },
      select: {
        id: true,
        reference: true,
        receivedAt: true,
        source: true,
        complainantName: true,
        anonymous: true,
        childName: true,
        category: true,
        summary: true,
        notifiable: true,
        notifiableReason: true,
        becameAwareAt: true,
        notificationDueAt: true,
        regulatorNotifiedAt: true,
        regulatorReference: true,
        status: true,
        acknowledgedAt: true,
        outcome: true,
        resolvedAt: true,
        service: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: [{ receivedAt: "desc" }],
      take: 500,
    });

    const now = new Date();
    return NextResponse.json({
      complaints: rows.map((r) => ({
        ...r,
        // Computed for display only — the stored dueAt is the record.
        clock: clockStatus(r.notificationDueAt, r.regulatorNotifiedAt, now),
      })),
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid complaint", parsed.error.flatten());
    }
    const d = parsed.data;

    const { serviceIds } = await getCentreScope(session);
    if (serviceIds !== null && !serviceIds.includes(d.serviceId)) {
      throw ApiError.forbidden();
    }

    /**
     * A notifiable complaint has to say WHICH limb of s.174(2)(b) it
     * falls under. Without it the register can't answer the question the
     * regulator actually asks, and "notifiable: true" alone is not a
     * record of anything.
     */
    if (d.notifiable && !d.notifiableReason) {
      throw ApiError.badRequest(
        "A notifiable complaint needs a reason — does it allege a serious incident, or a breach of the Law?",
      );
    }

    /**
     * The clock starts when the service became aware. Defaulting to now
     * is right for intake taken live; a complaint logged days later
     * should carry the real awareness date, which the caller can send.
     */
    const becameAware = d.becameAwareAt
      ? new Date(d.becameAwareAt)
      : new Date();
    if (Number.isNaN(becameAware.getTime())) {
      throw ApiError.badRequest("That awareness date isn't a real date");
    }

    const year = becameAware.getUTCFullYear();

    const created = await createWithReferenceRetry(
      (reference) =>
        prisma.complaintRecord.create({
          data: {
            reference,
            serviceId: d.serviceId,
            receivedAt: d.receivedAt ? new Date(d.receivedAt) : new Date(),
            source: d.source,
            complainantName: d.anonymous ? null : d.complainantName || null,
            complainantEmail: d.anonymous ? null : d.complainantEmail || null,
            complainantPhone: d.anonymous ? null : d.complainantPhone || null,
            anonymous: Boolean(d.anonymous),
            childId: d.childId || null,
            childName: d.childName || null,
            category: d.category,
            summary: d.summary,
            details: d.details || null,
            notifiable: Boolean(d.notifiable),
            notifiableReason: d.notifiable ? d.notifiableReason : null,
            becameAwareAt: becameAware,
            // Stamped, not computed. See compliance-clocks.ts.
            notificationDueAt: d.notifiable
              ? notificationDueAt(becameAware)
              : null,
            createdById: session!.user.id,
          },
          select: { id: true, reference: true, notificationDueAt: true },
        }),
      () => generateComplaintReference(prisma, year),
    );

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "log_complaint",
        entityType: "ComplaintRecord",
        entityId: created.id,
        details: {
          reference: created.reference,
          notifiable: Boolean(d.notifiable),
          category: d.category,
        },
      },
    });

    return NextResponse.json({ complaint: created }, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
