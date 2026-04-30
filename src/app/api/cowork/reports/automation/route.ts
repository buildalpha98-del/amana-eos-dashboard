import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { resolveAssignee } from "../../_lib/resolve-assignee";
import { resolveServiceByCode } from "../../_lib/resolve-service";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const reportBodySchema = z.object({
  seat: z.string().min(1, "seat is required"),
  reportType: z.string().default("general"),
  title: z.string().min(1, "title is required"),
  content: z.string().min(1, "content is required"),
  assignee: z.string().default(""),
  serviceCode: z.string().optional(),
  metrics: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  alerts: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).optional(),
});

// POST /api/cowork/reports/automation — Accept automation-generated reports
export const POST = withApiHandler(async (req: NextRequest) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const body = await parseJsonBody(req);
  const parsed = reportBodySchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }

  const { seat, reportType, title, content, assignee, serviceCode, metrics, alerts } = parsed.data;

  let serviceId: string | undefined;
  if (serviceCode) {
    const service = await resolveServiceByCode(serviceCode);
    serviceId = service?.id;
  }

  const assignedUserIds = await resolveAssignee({
    assignee: assignee || "",
    seat,
    serviceCode,
  });

  if (assignedUserIds.length === 0) {
    const report = await prisma.coworkReport.create({
      data: {
        seat,
        reportType: reportType || "general",
        title,
        content,
        metrics: metrics || undefined,
        alerts: alerts || undefined,
        serviceCode,
        serviceId,
      },
    });
    return NextResponse.json({ report, assignedTo: null }, { status: 201 });
  }

  const reports = await prisma.$transaction(
    assignedUserIds.map((userId) =>
      prisma.coworkReport.create({
        data: {
          seat,
          reportType: reportType || "general",
          title,
          content,
          metrics: metrics || undefined,
          alerts: alerts || undefined,
          serviceCode,
          serviceId,
          assignedToId: userId,
        },
      })
    )
  );

  return NextResponse.json(
    { reports, assignedTo: assignedUserIds },
    { status: 201 },
  );
});

// GET /api/cowork/reports/automation — Fetch reports
export const GET = withApiHandler(async (req: NextRequest) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const seat = searchParams.get("seat");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  const where: Record<string, unknown> = {};
  if (userId) where.assignedToId = userId;
  if (seat) where.seat = seat;
  if (status) where.status = status;

  const reports = await prisma.coworkReport.findMany({
    where,
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ reports });
});
