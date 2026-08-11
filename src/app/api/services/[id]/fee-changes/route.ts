/**
 * Scheduled fee changes for a service, and the history of applied ones.
 *
 * GET  → upcoming (scheduled) and recent history, newest first.
 * POST → schedule a change. Effective today or in the past applies it
 *        immediately, which is the honest reading of "from today".
 * DELETE → cancel a change that hasn't happened yet. An APPLIED change
 *        can't be deleted: it's the answer to "who put the rate up",
 *        which is the question that arrives with a fee dispute.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { applyDueFeeChanges, todayUtc } from "@/lib/fee-changes";
import {
  sessionTimesSchema,
  roomLabel,
  type SessionTimes,
} from "@/lib/service-settings";
import type { SessionType } from "@prisma/client";
import { requireRoomId } from "@/lib/room-resolver";

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
  sessionType: z.enum(SESSION_TYPES),
  feeTierId: z.string().min(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Dollars in, cents stored — money and floats don't mix. */
  amount: z.number().nonnegative().max(1000),
  casualAmount: z.number().nonnegative().max(1000).optional(),
  staffAmount: z.number().nonnegative().max(1000).optional(),
  note: z.string().trim().max(300).optional(),
});

const toCents = (dollars: number) => Math.round(dollars * 100);

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const [service, rows] = await Promise.all([
    prisma.service.findUnique({
      where: { id },
      select: { sessionTimes: true },
    }),
    prisma.serviceFeeChange.findMany({
      where: { serviceId: id },
      orderBy: [{ effectiveDate: "desc" }],
      take: 100,
      include: { createdBy: { select: { name: true } } },
    }),
  ]);

  const times = (service?.sessionTimes ?? null) as SessionTimes | null;

  return NextResponse.json({
    changes: rows.map((r) => ({
      id: r.id,
      sessionType: r.sessionType,
      // Stage 2: callers filter by room rather than by slot.
      roomId: r.roomId,
      roomName: roomLabel(times, r.sessionType as never),
      feeTierId: r.feeTierId,
      feeName: r.feeName,
      fromAmountCents: r.fromAmountCents,
      toAmountCents: r.toAmountCents,
      toCasualCents: r.toCasualCents,
      toStaffCents: r.toStaffCents,
      effectiveDate: r.effectiveDate,
      status: r.status,
      appliedAt: r.appliedAt,
      note: r.note,
      createdBy: r.createdBy?.name ?? null,
      createdAt: r.createdAt,
    })),
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

    const service = await prisma.service.findUnique({
      where: { id },
      select: { sessionTimes: true },
    });
    if (!service) throw ApiError.notFound("Service not found");

    const times = sessionTimesSchema.safeParse(service.sessionTimes ?? {});
    const room = times.success
      ? times.data[d.sessionType as keyof SessionTimes]
      : undefined;
    const tier = room?.fees?.find((f) => f.id === d.feeTierId);
    if (!tier) {
      throw ApiError.badRequest("That fee doesn't exist on this room");
    }

    const effectiveDate = new Date(`${d.effectiveDate}T00:00:00.000Z`);

    const created = await prisma.serviceFeeChange.create({
      data: {
        serviceId: id,
        // Stage 1 dual key — see room-resolver.ts.
        roomId: await requireRoomId(id, d.sessionType),
        sessionType: d.sessionType as SessionType,
        feeTierId: d.feeTierId,
        // Denormalised: history has to stay readable after a rename.
        feeName: tier.name,
        fromAmountCents: tier.amountCents,
        toAmountCents: toCents(d.amount),
        fromCasualCents: tier.casualAmountCents ?? null,
        toCasualCents:
          d.casualAmount === undefined ? null : toCents(d.casualAmount),
        fromStaffCents: tier.staffAmountCents ?? null,
        toStaffCents:
          d.staffAmount === undefined ? null : toCents(d.staffAmount),
        effectiveDate,
        note: d.note || null,
        createdById: session!.user.id,
      },
    });

    // "From today" should mean today, not tomorrow when the cron runs.
    if (effectiveDate <= todayUtc()) {
      await applyDueFeeChanges(prisma, { serviceId: id });
    }

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const DELETE = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const changeId = new URL(req.url).searchParams.get("changeId");
    if (!changeId) throw ApiError.badRequest("changeId is required");

    const existing = await prisma.serviceFeeChange.findUnique({
      where: { id: changeId },
      select: { serviceId: true, status: true },
    });
    if (!existing || existing.serviceId !== id) {
      throw ApiError.notFound("Change not found");
    }
    if (existing.status === "applied") {
      throw ApiError.badRequest(
        "That change has already taken effect. Schedule a new one to change the rate back.",
      );
    }

    await prisma.serviceFeeChange.update({
      where: { id: changeId },
      data: { status: "cancelled" },
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
