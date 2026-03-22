import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { z } from "zod";
import type { SessionType } from "@prisma/client";
import { propagateEnrolledCounts } from "./propagate/route";
import { ApiError, parseJsonBody } from "@/lib/api-error";

// ── GET: List attendance records ────────────────────────────

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const sessionType = searchParams.get("sessionType") as SessionType | null;

  const scope = getServiceScope(session);
  const stateScope = getStateScope(session);

  const where: Record<string, unknown> = {};

  if (scope) {
    where.serviceId = scope;
    if (serviceId && serviceId !== scope) {
      throw ApiError.forbidden();
    }
  } else if (serviceId) {
    where.serviceId = serviceId;
  }

  if (stateScope) where.service = { state: stateScope };

  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }

  if (sessionType) {
    where.sessionType = sessionType;
  }

  const records = await prisma.dailyAttendance.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
      recordedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "desc" }, { sessionType: "asc" }],
  });

  return NextResponse.json(records);
});

// ── POST: Create or upsert a single attendance record ───────

const createSchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().min(1),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  enrolled: z.number().int().min(0).default(0),
  attended: z.number().int().min(0).default(0),
  capacity: z.number().int().min(0).default(0),
  casual: z.number().int().min(0).default(0),
  absent: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  }

  const data = parsed.data;

  const scope = getServiceScope(session);
  if (scope && data.serviceId !== scope) {
    throw ApiError.forbidden();
  }

  const record = await prisma.dailyAttendance.upsert({
    where: {
      serviceId_date_sessionType: {
        serviceId: data.serviceId,
        date: new Date(data.date),
        sessionType: data.sessionType,
      },
    },
    update: {
      enrolled: data.enrolled,
      attended: data.attended,
      capacity: data.capacity,
      casual: data.casual,
      absent: data.absent,
      notes: data.notes,
      recordedById: session.user.id,
    },
    create: {
      serviceId: data.serviceId,
      date: new Date(data.date),
      sessionType: data.sessionType,
      enrolled: data.enrolled,
      attended: data.attended,
      capacity: data.capacity,
      casual: data.casual,
      absent: data.absent,
      notes: data.notes,
      recordedById: session.user.id,
    },
  });

  return NextResponse.json(record, { status: 201 });
});

// ── PUT: Batch upsert (weekly grid save) ────────────────────

const batchSchema = z.array(createSchema).min(1).max(50);

export const PUT = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  }

  const items = parsed.data;

  const scope = getServiceScope(session);
  if (scope) {
    const forbidden = items.some((i) => i.serviceId !== scope);
    if (forbidden) throw ApiError.forbidden();
  }

  const results = await prisma.$transaction(
    items.map((item) =>
      prisma.dailyAttendance.upsert({
        where: {
          serviceId_date_sessionType: {
            serviceId: item.serviceId,
            date: new Date(item.date),
            sessionType: item.sessionType,
          },
        },
        update: {
          enrolled: item.enrolled,
          attended: item.attended,
          capacity: item.capacity,
          casual: item.casual,
          absent: item.absent,
          notes: item.notes,
          recordedById: session.user.id,
        },
        create: {
          serviceId: item.serviceId,
          date: new Date(item.date),
          sessionType: item.sessionType,
          enrolled: item.enrolled,
          attended: item.attended,
          capacity: item.capacity,
          casual: item.casual,
          absent: item.absent,
          notes: item.notes,
          recordedById: session.user.id,
        },
      })
    )
  );

  const serviceId = items[0]?.serviceId;
  if (serviceId) {
    propagateEnrolledCounts(serviceId, 8).catch(() => {});
  }

  return NextResponse.json({ updated: results.length });
});
