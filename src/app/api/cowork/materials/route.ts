/**
 * POST /api/cowork/materials — Cowork pushes a program materials order
 * round (src/lib/materials-orders.ts): the round, each centre's reply
 * status, every order line, and the per-centre carts. Everything upserts
 * on stable keys, so Cowork can send the whole round again after each
 * update. A cart pushed as checked_out records its spend. Staff work the
 * round at /materials. Bearer COWORK_API_KEY.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork, setVersionHeaders } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { CART_STATUSES, HAS_IT, REPLY_STATUSES, ROUTES, recordCartSpend, routeLine } from "@/lib/materials-orders";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const when = z.string().datetime({ offset: true }).or(isoDate);
const toDate = (v?: string | null) => (v ? new Date(v.length === 10 ? `${v}T00:00:00Z` : v) : null);

const bodySchema = z.object({
  round: z.object({
    key: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(200),
    term: z.string().trim().max(40).optional(),
    programStart: isoDate.optional(),
    programEnd: isoDate.optional(),
    repliesDueAt: when.optional(),
    status: z.enum(["open", "closed"]).optional(),
    notes: z.string().max(5000).optional(),
  }),
  centres: z
    .array(
      z.object({
        serviceCode: z.string().trim().min(1),
        replyStatus: z.enum(REPLY_STATUSES).optional(),
        replyAt: when.nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      }),
    )
    .default([]),
  lines: z
    .array(
      z.object({
        serviceCode: z.string().trim().min(1),
        ref: z.string().trim().min(1).max(120),
        week: z.number().int().min(0).max(20).nullable().optional(),
        item: z.string().trim().min(1).max(300),
        qty: z.number().nonnegative().nullable().optional(),
        unit: z.string().max(60).nullable().optional(),
        purpose: z.string().max(2000).nullable().optional(),
        ifMissing: z.enum(ROUTES).default("hq_order"),
        centreHasIt: z.enum(HAS_IT).nullable().optional(),
        unitCost: z.number().nonnegative().nullable().optional(),
        orderedAt: when.nullable().optional(),
        receivedAt: when.nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      }),
    )
    .max(5000)
    .default([]),
  carts: z
    .array(
      z.object({
        serviceCode: z.string().trim().min(1),
        retailer: z.string().trim().min(1).max(60).default("Kmart"),
        status: z.enum(CART_STATUSES).default("draft"),
        lineCount: z.number().int().nonnegative().default(0),
        total: z.number().nonnegative().default(0),
        buyLocally: z.string().max(5000).nullable().optional(),
        otherOrder: z.string().max(5000).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
        checkedOutAt: when.nullable().optional(),
      }),
    )
    .default([]),
});

export const POST = withApiHandler(
  async (req) => {
    const authError = await authenticateCowork(req);
    if (authError) return authError;
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());
    const { round, centres, lines, carts } = parsed.data;

    const codes = [...new Set([...centres, ...lines, ...carts].map((x) => x.serviceCode))];
    const services = await prisma.service.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    const byCode = new Map(services.map((s) => [s.code, s.id]));
    const unknown = codes.filter((c) => !byCode.has(c));

    const roundData = {
      title: round.title,
      term: round.term ?? null,
      programStart: toDate(round.programStart),
      programEnd: toDate(round.programEnd),
      repliesDueAt: toDate(round.repliesDueAt),
      ...(round.status ? { status: round.status } : {}),
      notes: round.notes ?? null,
    };
    const r = await prisma.materialsOrderRound.upsert({
      where: { key: round.key },
      create: { key: round.key, ...roundData },
      update: roundData,
    });

    // Every centre that appears anywhere gets a row.
    const centreCodes = new Set([...codes.filter((c) => byCode.has(c))]);
    for (const code of centreCodes) {
      const c = centres.find((x) => x.serviceCode === code);
      const data = {
        ...(c?.replyStatus ? { replyStatus: c.replyStatus } : {}),
        ...(c && c.replyAt !== undefined ? { replyAt: toDate(c.replyAt) } : {}),
        ...(c && c.notes !== undefined ? { notes: c.notes } : {}),
      };
      await prisma.materialsOrderCentre.upsert({
        where: { roundId_serviceId: { roundId: r.id, serviceId: byCode.get(code)! } },
        create: { roundId: r.id, serviceId: byCode.get(code)!, ...data },
        update: data,
      });
    }

    let lineCount = 0;
    for (const l of lines) {
      const serviceId = byCode.get(l.serviceCode);
      if (!serviceId) continue;
      const data = {
        week: l.week ?? null,
        item: l.item,
        qty: l.qty ?? null,
        unit: l.unit ?? null,
        purpose: l.purpose ?? null,
        ifMissing: l.ifMissing,
        ...(l.centreHasIt !== undefined ? { centreHasIt: l.centreHasIt, action: routeLine(l.centreHasIt, l.ifMissing) } : {}),
        unitCost: l.unitCost ?? null,
        ...(l.orderedAt !== undefined ? { orderedAt: toDate(l.orderedAt) } : {}),
        ...(l.receivedAt !== undefined ? { receivedAt: toDate(l.receivedAt) } : {}),
        ...(l.notes !== undefined ? { notes: l.notes } : {}),
      };
      await prisma.materialsOrderLine.upsert({
        where: { roundId_serviceId_ref: { roundId: r.id, serviceId, ref: l.ref } },
        create: { roundId: r.id, serviceId, ref: l.ref, action: routeLine(l.centreHasIt, l.ifMissing), ...data },
        update: data,
      });
      lineCount++;
    }

    let cartCount = 0;
    for (const k of carts) {
      const serviceId = byCode.get(k.serviceCode);
      if (!serviceId) continue;
      const data = {
        status: k.status,
        lineCount: k.lineCount,
        total: k.total,
        buyLocally: k.buyLocally ?? null,
        otherOrder: k.otherOrder ?? null,
        notes: k.notes ?? null,
        ...(k.checkedOutAt !== undefined ? { checkedOutAt: toDate(k.checkedOutAt) } : {}),
      };
      const cart = await prisma.materialsCart.upsert({
        where: { roundId_serviceId_retailer: { roundId: r.id, serviceId, retailer: k.retailer } },
        create: { roundId: r.id, serviceId, retailer: k.retailer, ...data },
        update: data,
      });
      if (["checked_out", "received"].includes(cart.status)) await recordCartSpend(cart.id, null);
      cartCount++;
    }

    return setVersionHeaders(
      NextResponse.json({ roundId: r.id, centres: centreCodes.size, lines: lineCount, carts: cartCount, unknownServiceCodes: unknown }),
    );
  },
  { timeoutMs: 110_000 },
);
