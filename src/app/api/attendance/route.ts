import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";
import { z } from "zod";
import type { SessionType } from "@prisma/client";

// ── GET: List attendance records ────────────────────────────

export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const sessionType = searchParams.get("sessionType") as SessionType | null;

  // Scope to user's service if staff/member
  const scope = getServiceScope(session);

  const where: Record<string, unknown> = {};

  if (scope) {
    // Staff/member can only see their own service
    where.serviceId = scope;
    if (serviceId && serviceId !== scope) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (serviceId) {
    where.serviceId = serviceId;
  }

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
}

// ── POST: Create or upsert a single attendance record ───────

const createSchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().min(1), // ISO date string
  sessionType: z.enum(["bsc", "asc", "vc"]),
  enrolled: z.number().int().min(0).default(0),
  attended: z.number().int().min(0).default(0),
  capacity: z.number().int().min(0).default(0),
  casual: z.number().int().min(0).default(0),
  absent: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Scope check
  const scope = getServiceScope(session);
  if (scope && data.serviceId !== scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      recordedById: session!.user.id,
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
      recordedById: session!.user.id,
    },
  });

  return NextResponse.json(record, { status: 201 });
}

// ── PUT: Batch upsert (weekly grid save) ────────────────────

const batchSchema = z.array(createSchema).min(1).max(50);

export async function PUT(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const items = parsed.data;

  // Scope check
  const scope = getServiceScope(session);
  if (scope) {
    const forbidden = items.some((i) => i.serviceId !== scope);
    if (forbidden) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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
          recordedById: session!.user.id,
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
          recordedById: session!.user.id,
        },
      })
    )
  );

  return NextResponse.json({ updated: results.length });
}
