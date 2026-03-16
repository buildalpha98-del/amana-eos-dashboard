import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";
import { resolveAssignee } from "../../_lib/resolve-assignee";
import { resolveServiceByCode } from "../../_lib/resolve-service";

/**
 * POST /api/cowork/reports/automation — Accept automation-generated reports
 *
 * Auth: API key with `reports:write` scope
 * Body: { seat, reportType?, title, content, assignee?, serviceCode?, metrics?, alerts? }
 */
export async function POST(req: NextRequest) {
  const { apiKey, error: authError } = await authenticateApiKey(
    req,
    "reports:write"
  );
  if (authError) return authError;

  const { limited } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const { seat, reportType, title, content, assignee, serviceCode, metrics, alerts } = body;

    if (!seat || !title || !content) {
      return NextResponse.json(
        { error: "seat, title, and content are required" },
        { status: 400 }
      );
    }

    // Resolve service
    let serviceId: string | undefined;
    if (serviceCode) {
      const service = await resolveServiceByCode(serviceCode);
      serviceId = service?.id;
    }

    // Resolve assignee
    const assignedUserIds = await resolveAssignee({
      assignee: assignee || "",
      seat,
      serviceCode,
    });

    // Create report(s) — one per assigned user, or one unassigned if no users resolved
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
      { status: 201 }
    );
  } catch (error) {
    console.error("Cowork report creation failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cowork/reports/automation — Fetch reports filtered by user, seat, or status
 *
 * Auth: API key with `reports:write` scope
 * Query: ?userId=...&seat=...&status=...&limit=50
 */
export async function GET(req: NextRequest) {
  const { apiKey, error: authError } = await authenticateApiKey(
    req,
    "reports:write"
  );
  if (authError) return authError;

  const { limited } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

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
}
