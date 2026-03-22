import { NextRequest, NextResponse } from "next/server";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const postSchema = z.object({
  serviceCode: z.string(),
  date: z.string().datetime(),
  attendees: z.string(),
  agenda: z.string().optional(),
  notes: z.string().optional(),
  actionItems: z
    .array(
      z.object({
        action: z.string(),
        owner: z.string().optional(),
        dueDate: z.string().optional(),
      })
    )
    .optional(),
});

export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { serviceCode, date, attendees, agenda, notes, actionItems } = parsed.data;

    const service = await prisma.service.findUnique({ where: { code: serviceCode } });
    if (!service) {
      return NextResponse.json(
        { success: false, error: `Service not found: ${serviceCode}` },
        { status: 404 }
      );
    }

    const schoolRelationship = await prisma.schoolRelationship.findUnique({
      where: { serviceId: service.id },
    });

    const meeting = await prisma.partnershipMeeting.create({
      data: {
        serviceId: service.id,
        schoolRelationshipId: schoolRelationship?.id ?? null,
        date: new Date(date),
        attendees,
        agenda: agenda ?? null,
        notes: notes ?? null,
        actionItems: actionItems ?? undefined,
      },
    });

    return NextResponse.json(
      {
        success: true,
        meeting: {
          id: meeting.id,
          date: meeting.date,
          attendees: meeting.attendees,
          serviceCode,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("POST /api/cowork/partnerships/meetings", { error });
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
});

export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const serviceCode = searchParams.get("serviceCode") ?? undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

    let serviceId: string | undefined;
    if (serviceCode) {
      const service = await prisma.service.findUnique({ where: { code: serviceCode } });
      if (!service) {
        return NextResponse.json(
          { success: false, error: `Service not found: ${serviceCode}` },
          { status: 404 }
        );
      }
      serviceId = service.id;
    }

    const meetings = await prisma.partnershipMeeting.findMany({
      where: {
        ...(serviceId ? { serviceId } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        service: {
          select: { name: true, code: true },
        },
      },
      orderBy: { date: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      meetings,
      count: meetings.length,
    });
  } catch (error) {
    logger.error("GET /api/cowork/partnerships/meetings", { error });
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
});
