import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/audits/[id] — full audit instance detail with responses
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const instance = await prisma.auditInstance.findUnique({
    where: { id },
    include: {
      template: {
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      service: { select: { id: true, name: true, code: true } },
      auditor: { select: { id: true, name: true } },
      responses: {
        include: {
          templateItem: {
            select: { id: true, section: true, question: true, guidance: true, responseFormat: true, sortOrder: true, isRequired: true },
          },
        },
        orderBy: { templateItem: { sortOrder: "asc" } },
      },
    },
  });

  if (!instance) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  return NextResponse.json(instance);
}

/**
 * PATCH /api/audits/[id] — update audit (start, complete, save summary)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin", "member"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const {
    action,
    strengths,
    areasForImprovement,
    actionPlan,
    comments,
  } = body as {
    action?: "start" | "complete" | "skip";
    strengths?: string;
    areasForImprovement?: string;
    actionPlan?: string;
    comments?: string;
  };

  const instance = await prisma.auditInstance.findUnique({
    where: { id },
    include: { responses: true, template: { select: { responseFormat: true } } },
  });

  if (!instance) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (action === "start") {
    data.status = "in_progress";
    data.startedAt = new Date();
    data.auditorId = session!.user.id;
    data.auditorName = session!.user.name;
  } else if (action === "skip") {
    data.status = "skipped";
  } else if (action === "complete") {
    // Calculate compliance score based on response format
    const responses = instance.responses;
    const totalItems = responses.length;
    const answered = responses.filter((r) => r.result !== "not_answered");

    let yesCount = 0;
    let noCount = 0;
    let naCount = 0;
    let score = 0;

    const format = instance.template.responseFormat;

    if (format === "rating_1_5") {
      const rated = responses.filter((r) => r.ratingValue != null);
      const avg = rated.length > 0 ? rated.reduce((s, r) => s + (r.ratingValue || 0), 0) / rated.length : 0;
      score = (avg / 5) * 100;
      yesCount = rated.filter((r) => (r.ratingValue || 0) >= 4).length;
      noCount = rated.filter((r) => (r.ratingValue || 0) <= 3).length;
    } else if (format === "reverse_yes_no") {
      // NO = compliant for reverse format
      yesCount = responses.filter((r) => r.result === "yes").length; // hazard found
      noCount = responses.filter((r) => r.result === "no").length; // compliant
      naCount = responses.filter((r) => r.result === "na").length;
      const scorable = totalItems - naCount;
      score = scorable > 0 ? (noCount / scorable) * 100 : 100;
    } else {
      // yes_no, compliant, review_date, inventory
      yesCount = responses.filter((r) => r.result === "yes").length;
      noCount = responses.filter((r) => r.result === "no").length;
      naCount = responses.filter((r) => r.result === "na").length;
      const scorable = totalItems - naCount;
      score = scorable > 0 ? (yesCount / scorable) * 100 : 100;
    }

    data.status = "completed";
    data.completedAt = new Date();
    data.totalItems = totalItems;
    data.yesCount = yesCount;
    data.noCount = noCount;
    data.naCount = naCount;
    data.complianceScore = Math.round(score * 10) / 10;
  }

  if (strengths !== undefined) data.strengths = strengths;
  if (areasForImprovement !== undefined) data.areasForImprovement = areasForImprovement;
  if (actionPlan !== undefined) data.actionPlan = actionPlan;
  if (comments !== undefined) data.comments = comments;

  const updated = await prisma.auditInstance.update({
    where: { id },
    data,
    include: {
      template: { select: { id: true, name: true, qualityArea: true, nqsReference: true, responseFormat: true } },
      service: { select: { id: true, name: true, code: true } },
      auditor: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: action || "update",
      entityType: "AuditInstance",
      entityId: updated.id,
      details: { status: updated.status, templateName: updated.template.name },
    },
  });

  return NextResponse.json(updated);
}
