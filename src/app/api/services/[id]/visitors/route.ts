/**
 * The visitors register — who is on the premises.
 *
 * GET  → today by default, plus everyone still signed in regardless of
 *        when they arrived. That second list is the one that matters at
 *        close: a visitor who never signed out is either still in the
 *        building or forgot, and both need chasing.
 * POST → sign someone in.
 * PATCH lives in [visitorId] and only ever signs them OUT.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  organisation: z.string().trim().max(120).optional(),
  purpose: z.string().trim().max(200).optional(),
  visitingWhom: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  wwccSighted: z.boolean().default(false),
  wwccNumber: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const day = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [visitors, stillOnSite] = await Promise.all([
    prisma.serviceVisitor.findMany({
      where: { serviceId: id, signedInAt: { gte: start, lt: end } },
      orderBy: { signedInAt: "desc" },
      include: { recordedBy: { select: { name: true } } },
    }),
    prisma.serviceVisitor.findMany({
      where: { serviceId: id, signedOutAt: null },
      orderBy: { signedInAt: "asc" },
      take: 50,
      select: { id: true, name: true, organisation: true, signedInAt: true },
    }),
  ]);

  return NextResponse.json({
    visitors: visitors.map((v) => ({
      id: v.id,
      name: v.name,
      organisation: v.organisation,
      purpose: v.purpose,
      visitingWhom: v.visitingWhom,
      phone: v.phone,
      signedInAt: v.signedInAt,
      signedOutAt: v.signedOutAt,
      wwccSighted: v.wwccSighted,
      wwccNumber: v.wwccNumber,
      notes: v.notes,
      recordedBy: v.recordedBy?.name ?? null,
    })),
    stillOnSite,
  });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    const created = await prisma.serviceVisitor.create({
      data: {
        serviceId: id,
        name: d.name,
        organisation: d.organisation || null,
        purpose: d.purpose || null,
        visitingWhom: d.visitingWhom || null,
        phone: d.phone || null,
        wwccSighted: d.wwccSighted,
        wwccNumber: d.wwccNumber || null,
        notes: d.notes || null,
        recordedById: session!.user.id,
      },
    });

    return NextResponse.json(created, { status: 201 });
  },
  // Whoever is at the door signs them in — that's usually an educator.
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
