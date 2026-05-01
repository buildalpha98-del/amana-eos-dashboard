import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { ApiError, parseJsonBody } from "@/lib/api-error";
// 2026-05-01: helper moved to ../_lib/scope so POST /api/audits can reuse it.
import { ensureCoordCanTouchAudit } from "../_lib/scope";

const patchSchema = z.object({
  action: z.enum(["start", "complete", "skip"]).optional(),
  strengths: z.string().optional(),
  areasForImprovement: z.string().optional(),
  actionPlan: z.string().optional(),
  comments: z.string().optional(),
  // Reschedule / inline-edit fields
  scheduledMonth: z.number().int().min(1).max(12).optional(),
  scheduledYear: z.number().int().min(2020).max(2100).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  templateId: z.string().optional(),
  serviceId: z.string().optional(),
  auditorId: z.string().nullable().optional(),
});
/**
 * GET /api/audits/[id] — full audit instance detail with responses
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

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
});

/**
 * PATCH /api/audits/[id] — update audit (start, complete, save summary)
 */
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const {
    action,
    strengths,
    areasForImprovement,
    actionPlan,
    comments,
  } = parsed.data;

  const instance = await prisma.auditInstance.findUnique({
    where: { id },
    include: { responses: true, template: { select: { responseFormat: true } } },
  });

  if (!instance) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Coordinators must be on the audit's own service.
  ensureCoordCanTouchAudit(
    session!.user.role ?? "",
    (session!.user as { serviceId?: string | null }).serviceId,
    instance.serviceId,
  );

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

  if (parsed.data.scheduledMonth !== undefined) data.scheduledMonth = parsed.data.scheduledMonth;
  if (parsed.data.scheduledYear !== undefined) data.scheduledYear = parsed.data.scheduledYear;
  if (parsed.data.dueDate !== undefined) {
    data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  }
  if (parsed.data.templateId !== undefined) data.templateId = parsed.data.templateId;
  if (parsed.data.serviceId !== undefined) data.serviceId = parsed.data.serviceId;
  if (parsed.data.auditorId !== undefined) data.auditorId = parsed.data.auditorId;

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
}, {
  // Coordinators can complete audits assigned to their service. Member
  // ("Centre Director") + admin tier always allowed. The
  // `ensureCoordCanTouchAudit` check inside the handler enforces the
  // own-service constraint for coordinators.
  roles: ["owner", "head_office", "admin", "member"],
});
