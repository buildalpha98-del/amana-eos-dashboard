/**
 * Excursions and incursions for a service.
 *
 * GET  → each outing with the two numbers that matter on one line:
 *        how many children are attending, and how many have been signed
 *        for. Attending is DERIVED from that day's bookings rather than
 *        kept as a second list — a separate attendee list drifts from
 *        the roll the moment someone books or cancels.
 * POST → create the outing and, unless told not to, mint its permission
 *        form in the same transaction. The form is per-child, because
 *        consent for one child says nothing about their sibling.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { isTrustedBlobUrl } from "@/lib/trusted-urls";
import { programmeName } from "@/lib/programme-names";
import type { SessionType } from "@prisma/client";

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin", "eos"]);

const SESSION_TYPES = [
  "bsc",
  "asc",
  "vc",
  "extra1",
  "extra2",
  "extra3",
  "extra4",
] as const;

const createSchema = z.object({
  kind: z.enum(["excursion", "incursion"]).default("excursion"),
  title: z.string().trim().min(1).max(200),
  destination: z.string().trim().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessionType: z.enum(SESSION_TYPES).optional(),
  departTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  returnTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  transport: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
  riskAssessmentUrl: z
    .string()
    .url()
    .refine(isTrustedBlobUrl, { message: "Risk assessment must be uploaded here" })
    .optional(),
  riskAssessmentFileName: z.string().max(200).optional(),
  /** Off for an incursion that genuinely needs no permission slip. */
  createPermissionForm: z.boolean().default(true),
});

function assertAccess(
  session: { user: { role: string; serviceId?: string | null } },
  serviceId: string,
) {
  if (
    !ORG_WIDE_ROLES.has(session.user.role) &&
    session.user.serviceId !== serviceId
  ) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  assertAccess(session as never, id);

  const excursions = await prisma.serviceExcursion.findMany({
    where: { serviceId: id },
    orderBy: { date: "desc" },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          status: true,
          _count: { select: { signatures: true } },
        },
      },
      riskAssessmentReviewedBy: { select: { name: true } },
    },
  });

  // Attending = children booked into that programme on that day. One
  // grouped query rather than one per excursion.
  const dated = excursions.filter((e) => e.sessionType);
  const counts = dated.length
    ? await prisma.booking.groupBy({
        by: ["date", "sessionType"],
        where: {
          serviceId: id,
          status: { in: ["confirmed", "requested"] },
          date: { in: dated.map((e) => e.date) },
        },
        _count: { _all: true },
      })
    : [];
  const key = (d: Date, s: string) => `${d.toISOString().slice(0, 10)}::${s}`;
  const attendingBy = new Map(
    counts.map((c) => [
      key(c.date as Date, c.sessionType as string),
      c._count._all,
    ]),
  );

  return NextResponse.json({
    excursions: excursions.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      destination: e.destination,
      date: e.date,
      sessionType: e.sessionType,
      programmeName: e.sessionType ? programmeName(e.sessionType) : null,
      departTime: e.departTime,
      returnTime: e.returnTime,
      transport: e.transport,
      notes: e.notes,
      status: e.status,
      riskAssessmentUrl: e.riskAssessmentUrl,
      riskAssessmentFileName: e.riskAssessmentFileName,
      riskAssessmentReviewedAt: e.riskAssessmentReviewedAt,
      riskAssessmentReviewedBy: e.riskAssessmentReviewedBy?.name ?? null,
      formId: e.formId,
      signedCount: e.form?._count.signatures ?? 0,
      attendingCount: e.sessionType
        ? (attendingBy.get(key(e.date, e.sessionType)) ?? 0)
        : null,
    })),
  });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertAccess(session as never, id);

    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;
    const when = dateOnly(d.date);

    // The excursion and its permission form are one act. If the form
    // fails to write, an excursion with no way to collect consent is
    // worse than no excursion — so both or neither.
    const excursion = await prisma.$transaction(async (tx) => {
      let formId: string | null = null;
      if (d.createPermissionForm) {
        const form = await tx.parentForm.create({
          data: {
            serviceId: id,
            title: `Permission — ${d.title}`,
            description: [
              d.destination ? `Where: ${d.destination}` : null,
              d.departTime && d.returnTime
                ? `Leaving ${d.departTime}, back by ${d.returnTime}`
                : null,
              d.transport ? `Getting there: ${d.transport}` : null,
              d.notes || null,
            ]
              .filter(Boolean)
              .join("\n"),
            // Signatures are wanted before they leave, not after.
            dueDate: when,
            perChild: true,
            createdById: session!.user.id,
          },
        });
        formId = form.id;
      }

      return tx.serviceExcursion.create({
        data: {
          serviceId: id,
          kind: d.kind,
          title: d.title,
          destination: d.destination || null,
          date: when,
          sessionType: (d.sessionType as SessionType) ?? null,
          departTime: d.departTime || null,
          returnTime: d.returnTime || null,
          transport: d.transport || null,
          notes: d.notes || null,
          riskAssessmentUrl: d.riskAssessmentUrl || null,
          riskAssessmentFileName: d.riskAssessmentFileName || null,
          formId,
          createdById: session!.user.id,
        },
      });
    });

    // Tell the families there's something to sign. Bell, not push — the
    // same call the rest of the forms system makes.
    if (excursion.formId) {
      void (async () => {
        try {
          const contacts = await prisma.centreContact.findMany({
            where: { serviceId: id, status: "active" },
            select: { email: true },
          });
          if (contacts.length > 0) {
            await prisma.parentNotification.createMany({
              data: contacts.map((c) => ({
                parentEmail: c.email.toLowerCase().trim(),
                type: "form",
                title: "Permission needed",
                body: d.title,
                link: "/parent/forms",
              })),
            });
          }
        } catch (err) {
          logger.error("excursion form fan-out failed", {
            excursionId: excursion.id,
            err,
          });
        }
      })();
    }

    logger.info("Excursion created", {
      excursionId: excursion.id,
      serviceId: id,
      userId: session!.user.id,
    });

    return NextResponse.json(excursion, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
