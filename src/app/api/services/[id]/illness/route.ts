/**
 * Illness and infectious disease.
 *
 * Reg 88: when a child at the service has an infectious disease, the
 * service must notify families. This register keeps the case and the
 * notification together, because an outbreak where nobody can show WHEN
 * parents were told is the situation the regulation exists to prevent.
 *
 * GET surfaces `infectiousUnnotified` for exactly that reason, and
 * `currentlyExcluded` so staff know who shouldn't be at the door.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";

const createSchema = z.object({
  personName: z.string().trim().min(1).max(120),
  personType: z.enum(["child", "staff"]).default("child"),
  childId: z.string().optional(),
  illness: z.string().trim().min(1).max(200),
  infectious: z.boolean().default(false),
  onsetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  excludedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  symptoms: z.string().trim().max(4000).optional(),
  actionTaken: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(4000).optional(),
});

const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

export const GET = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const rows = await prisma.illnessRecord.findMany({
      where: { serviceId: id },
      orderBy: { onsetDate: "desc" },
      take: 100,
      include: {
        recordedBy: { select: { name: true } },
        notifiedBy: { select: { name: true } },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return NextResponse.json({
      records: rows.map((r) => ({
        id: r.id,
        personName: r.personName,
        personType: r.personType,
        childId: r.childId,
        illness: r.illness,
        infectious: r.infectious,
        onsetDate: r.onsetDate,
        excludedFrom: r.excludedFrom,
        returnDate: r.returnDate,
        symptoms: r.symptoms,
        actionTaken: r.actionTaken,
        familiesNotifiedAt: r.familiesNotifiedAt,
        notifiedBy: r.notifiedBy?.name ?? null,
        authorityNotifiedAt: r.authorityNotifiedAt,
        notes: r.notes,
        recordedBy: r.recordedBy?.name ?? null,
      })),
      // Infectious, and families still haven't been told.
      infectiousUnnotified: rows.filter(
        (r) => r.infectious && !r.familiesNotifiedAt,
      ).length,
      // Excluded and not yet due back — who shouldn't be here today.
      currentlyExcluded: rows.filter(
        (r) => r.returnDate && r.returnDate > today,
      ).length,
    });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    // A child recorded against another centre would file the case, and
    // any exclusion, in the wrong place.
    if (d.childId) {
      const child = await prisma.child.findUnique({
        where: { id: d.childId },
        select: { serviceId: true },
      });
      if (!child || child.serviceId !== id) {
        throw ApiError.badRequest("That child isn't at this service");
      }
    }

    const onset = dateOnly(d.onsetDate);
    const back = d.returnDate ? dateOnly(d.returnDate) : null;
    // Coming back before falling ill is a typo worth catching now.
    if (back && back < onset) {
      throw ApiError.badRequest("Return date can't be before onset");
    }

    const created = await prisma.illnessRecord.create({
      data: {
        serviceId: id,
        childId: d.childId ?? null,
        personName: d.personName,
        personType: d.personType,
        illness: d.illness,
        infectious: d.infectious,
        onsetDate: onset,
        excludedFrom: d.excludedFrom ? dateOnly(d.excludedFrom) : null,
        returnDate: back,
        symptoms: d.symptoms || null,
        actionTaken: d.actionTaken || null,
        notes: d.notes || null,
        recordedById: session!.user.id,
      },
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
