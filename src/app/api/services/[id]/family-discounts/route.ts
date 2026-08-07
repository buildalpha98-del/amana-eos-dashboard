/**
 * Standing discounts on what a family pays.
 *
 * GET    ?contactId= → one family's, or the whole centre's.
 * POST   → grant one.
 * DELETE ?discountId= → end it TODAY rather than erase it. A discount
 *         that was applied to real invoices is part of the record of
 *         what a family was charged; deleting the row would make those
 *         invoices unexplainable.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { programmeName } from "@/lib/programme-names";
import type { SessionType } from "@prisma/client";

const SESSION_TYPES = [
  "bsc",
  "asc",
  "vc",
  "extra1",
  "extra2",
  "extra3",
  "extra4",
] as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

const createSchema = z
  .object({
    contactId: z.string().min(1),
    sessionType: z.enum(SESSION_TYPES).optional(),
    kind: z.enum(["percent", "amount"]),
    /** Percent 1–100, or DOLLARS off — converted to cents below. */
    value: z.number().positive(),
    reason: z.string().trim().min(1).max(80),
    startDate: z.string().regex(YMD),
    endDate: z.string().regex(YMD).optional(),
  })
  .refine((v) => v.kind !== "percent" || v.value <= 100, {
    message: "A percentage discount can't be more than 100%",
    path: ["value"],
  });

export const GET = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const contactId = new URL(req.url).searchParams.get("contactId");

    const rows = await prisma.familyDiscount.findMany({
      where: { serviceId: id, ...(contactId ? { contactId } : {}) },
      orderBy: [{ startDate: "desc" }],
      take: 200,
      include: {
        createdBy: { select: { name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    return NextResponse.json({
      discounts: rows.map((r) => ({
        id: r.id,
        contactId: r.contactId,
        familyName:
          [r.contact?.firstName, r.contact?.lastName].filter(Boolean).join(" ") ||
          "Family",
        sessionType: r.sessionType,
        roomName: r.sessionType ? programmeName(r.sessionType) : "Every room",
        kind: r.kind,
        value: r.value,
        reason: r.reason,
        startDate: r.startDate,
        endDate: r.endDate,
        // Computed rather than stored: a stored flag would need a cron
        // to flip it and would be wrong between runs.
        active:
          r.startDate <= today && (r.endDate === null || r.endDate >= today),
        createdBy: r.createdBy?.name ?? null,
      })),
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
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

    // A discount granted against another centre's family would apply to
    // fees this service never charges.
    const contact = await prisma.centreContact.findUnique({
      where: { id: d.contactId },
      select: { serviceId: true },
    });
    if (!contact || contact.serviceId !== id) {
      throw ApiError.badRequest("That family isn't at this service");
    }

    const start = dateOnly(d.startDate);
    const end = d.endDate ? dateOnly(d.endDate) : null;
    if (end && end < start) {
      throw ApiError.badRequest("The end date is before the start date");
    }

    const created = await prisma.familyDiscount.create({
      data: {
        contactId: d.contactId,
        serviceId: id,
        sessionType: (d.sessionType as SessionType) ?? null,
        kind: d.kind,
        // Percent stays a percent; dollars become cents, because money
        // and floats don't mix.
        value: d.kind === "percent" ? Math.round(d.value) : Math.round(d.value * 100),
        reason: d.reason,
        startDate: start,
        endDate: end,
        createdById: session!.user.id,
      },
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const DELETE = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const discountId = new URL(req.url).searchParams.get("discountId");
    if (!discountId) throw ApiError.badRequest("discountId is required");

    const existing = await prisma.familyDiscount.findUnique({
      where: { id: discountId },
      select: { serviceId: true, startDate: true },
    });
    if (!existing || existing.serviceId !== id) {
      throw ApiError.notFound("Discount not found");
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // One that never started can go; one that has been applied to real
    // invoices is ended, not erased, or those invoices stop making
    // sense.
    if (existing.startDate > today) {
      await prisma.familyDiscount.delete({ where: { id: discountId } });
      return NextResponse.json({ ok: true, deleted: true });
    }

    await prisma.familyDiscount.update({
      where: { id: discountId },
      data: { endDate: today },
    });
    return NextResponse.json({ ok: true, ended: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
