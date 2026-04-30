import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sessionTimesSchema } from "@/lib/service-settings";
import { getCentreScope } from "@/lib/centre-scope";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional(),
  address: z.string().optional(),
  suburb: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  status: z.string().optional(),
  managerId: z.string().optional(),
  capacity: z.number().optional(),
  operatingDays: z.array(z.string()).optional(),
  notes: z.string().optional(),
  bscDailyRate: z.number().optional(),
  ascDailyRate: z.number().optional(),
  vcDailyRate: z.number().optional(),
  bscCasualRate: z.number().optional(),
  ascCasualRate: z.number().optional(),
  bscGroceryRate: z.number().optional(),
  ascGroceryRate: z.number().optional(),
  vcGroceryRate: z.number().optional(),
  monthlyPurchaseBudget: z.number().optional(),
  contractStartDate: z.string().nullable().optional(),
  contractEndDate: z.string().nullable().optional(),
  licenceFeeAnnual: z.number().optional(),
  schoolPrincipalName: z.string().optional(),
  schoolPrincipalEmail: z.string().optional(),
  schoolBusinessManagerName: z.string().optional(),
  schoolBusinessManagerEmail: z.string().optional(),
  lastPrincipalVisit: z.string().nullable().optional(),
  buildAlphaKidsActive: z.boolean().optional(),
  // ── ACECQA approvals + per-session-type start/end times ─────────
  serviceApprovalNumber: z.string().nullish(),
  providerApprovalNumber: z.string().nullish(),
  sessionTimes: sessionTimesSchema.nullish(),
});

// GET /api/services/[id]
export const GET = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;

    // Centre-scope enforcement (added 2026-04-29 — was missing entirely;
    // every authenticated user could fetch any service detail). Owner /
    // head_office / admin see everything; coordinator/member/staff/
    // marketing get a 403 unless the requested service is in their scope.
    const { serviceIds: scopedServiceIds } = await getCentreScope(session);
    if (scopedServiceIds !== null && !scopedServiceIds.includes(id)) {
      throw ApiError.forbidden();
    }

    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, email: true, avatar: true } },
        todos: {
          where: { deleted: false },
          include: {
            assignee: { select: { id: true, name: true } },
          },
          orderBy: [{ status: "asc" }, { dueDate: "asc" }],
          take: 50,
        },
        issues: {
          where: { deleted: false },
          include: {
            owner: { select: { id: true, name: true } },
          },
          orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
          take: 20,
        },
        projects: {
          where: { deleted: false },
          include: {
            owner: { select: { id: true, name: true } },
            _count: { select: { todos: { where: { deleted: false } } } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        rocks: {
          where: { deleted: false },
          include: {
            owner: { select: { id: true, name: true } },
            _count: {
              select: {
                todos: { where: { deleted: false } },
                milestones: true,
              },
            },
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 50,
        },
        _count: {
          select: {
            todos: { where: { deleted: false } },
            issues: { where: { deleted: false } },
            projects: { where: { deleted: false } },
            rocks: { where: { deleted: false } },
            measurables: true,
          },
        },
      },
    });

    if (!service) throw ApiError.notFound("Service not found");

    return NextResponse.json(service);
  },
);

// PATCH /api/services/[id]
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    // Coordinators may only edit their own service. Admin/owner/head_office bypass.
    const role = session.user.role ?? "";
    if (role === "coordinator") {
      const coordinatorServiceId = (session.user as { serviceId?: string | null })
        .serviceId ?? null;
      if (!coordinatorServiceId || coordinatorServiceId !== id) {
        throw ApiError.forbidden();
      }
    }

    const body = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    const dateFields = new Set([
      "contractStartDate", "contractEndDate", "lastPrincipalVisit",
    ]);

    for (const [f, value] of Object.entries(parsed.data)) {
      if (value !== undefined) {
        if (dateFields.has(f)) {
          data[f] = value ? new Date(value as string) : null;
        } else {
          data[f] = value;
        }
      }
    }

    const existing = await prisma.service.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound("Service not found");

    const service = await prisma.service.update({
      where: { id },
      data,
      include: {
        manager: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "update",
        entityType: "Service",
        entityId: service.id,
        details: { changes: Object.keys(data) },
      },
    });

    return NextResponse.json(service);
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);

// DELETE /api/services/[id]
export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;

    const service = await prisma.service.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!service) throw ApiError.notFound("Service not found");

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "delete",
        entityType: "Service",
        entityId: service.id,
        details: { name: service.name },
      },
    });

    await prisma.service.delete({ where: { id } });

    return NextResponse.json({ success: true });
  },
  { roles: ["owner", "head_office", "admin"] },
);
