import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sessionTimesSchema, type SessionTimes } from "@/lib/service-settings";
import { syncRoomsQuietly } from "@/lib/rooms";
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
  // Nullable, not just optional: the editor sends `capacity: null` when
  // the box is left blank, which is the normal state for a centre that
  // hasn't set one. `z.number().optional()` rejected that outright, so
  // saving contact details on any such service failed validation with
  // nothing on screen to explain why.
  capacity: z.number().int().min(0).max(10_000).nullable().optional(),
  operatingDays: z.array(z.string()).optional(),
  notes: z.string().optional(),
  bscDailyRate: z.number().nullable().optional(),
  ascDailyRate: z.number().nullable().optional(),
  vcDailyRate: z.number().nullable().optional(),
  bscCasualRate: z.number().nullable().optional(),
  ascCasualRate: z.number().nullable().optional(),
  bscGroceryRate: z.number().nullable().optional(),
  ascGroceryRate: z.number().nullable().optional(),
  vcGroceryRate: z.number().nullable().optional(),
  monthlyPurchaseBudget: z.number().nullable().optional(),
  contractStartDate: z.string().nullable().optional(),
  contractEndDate: z.string().nullable().optional(),
  licenceFeeAnnual: z.number().nullable().optional(),
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
    if (role === "member") {
      const coordinatorServiceId = (session.user as { serviceId?: string | null })
        .serviceId ?? null;
      if (!coordinatorServiceId || coordinatorServiceId !== id) {
        throw ApiError.forbidden();
      }
    }

    const body = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      // Name the field. A bare "Validation failed" toast leaves someone
      // staring at a form with eight inputs and no idea which one it
      // objected to.
      const issue = parsed.error.issues[0];
      const field = issue?.path.join(".") || "A field";
      return NextResponse.json(
        {
          error: `${field}: ${issue?.message ?? "is invalid"}`,
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    const dateFields = new Set([
      "contractStartDate", "contractEndDate", "lastPrincipalVisit",
    ]);
    // Columns that are NOT NULL in the schema. A cleared field means
    // "leave it alone" here, not "write null" — the write would fail at
    // the database with an error nobody can act on.
    const notNullable = new Set([
      "bscCasualRate", "ascCasualRate",
      "bscGroceryRate", "ascGroceryRate", "vcGroceryRate",
    ]);

    for (const [f, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      if (value === null && notNullable.has(f)) continue;
      if (dateFields.has(f)) {
        data[f] = value ? new Date(value as string) : null;
      } else {
        data[f] = value;
      }
    }

    if (Object.keys(data).length === 0) {
      throw ApiError.badRequest("Nothing to update.");
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

    /**
     * Keep the shadow `Room` rows in step with the JSON that still owns
     * them (Stage 0, docs/rooms-migration-plan.md). A shadow that only
     * gets written by a backfill drifts the moment anyone edits a room,
     * and a drifted shadow is worse than an empty one — it looks
     * populated.
     *
     * After the update, not inside a transaction with it: the JSON write
     * is the truth, and a shadow-sync failure must not roll back a
     * settings save. `syncRoomsQuietly` logs and swallows for the same
     * reason. That changes at Stage 2, when reads move.
     */
    if ("sessionTimes" in data) {
      await syncRoomsQuietly(
        service.id,
        service.sessionTimes as SessionTimes | null,
      );
    }

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
  { roles: ["owner", "head_office", "admin", "member"] },
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
