import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  briefIncludeFor,
  toListItem,
} from "@/lib/vendor-brief/list-item";
import {
  createBriefWithNumberRetry,
  generateBriefNumber,
} from "@/lib/vendor-brief/brief-number";
import {
  TermReadinessCategory,
  VendorBriefStatus,
  VendorBriefType,
} from "@prisma/client";

const ROLES: ("marketing" | "owner")[] = ["marketing", "owner"];

const TERMINAL_STATUSES: VendorBriefStatus[] = [
  "delivered",
  "installed",
  "cancelled",
];

// ---------------------------------------------------------------------------
// GET — list briefs
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  status: z
    .union([z.nativeEnum(VendorBriefStatus), z.literal("in_flight"), z.literal("archived")])
    .optional(),
  serviceId: z.string().optional(),
  vendorContactId: z.string().optional(),
  termYear: z.coerce.number().int().optional(),
  termNumber: z.coerce.number().int().min(1).max(4).optional(),
  termReadinessCategory: z.nativeEnum(TermReadinessCategory).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid query", parsed.error.flatten());
    }
    const q = parsed.data;

    const where: Record<string, unknown> = {};
    if (q.status === "in_flight") {
      where.status = { notIn: TERMINAL_STATUSES };
    } else if (q.status === "archived") {
      where.status = { in: TERMINAL_STATUSES };
    } else if (q.status) {
      where.status = q.status;
    }
    if (q.serviceId) where.serviceId = q.serviceId;
    if (q.vendorContactId) where.vendorContactId = q.vendorContactId;
    if (q.termYear) where.termYear = q.termYear;
    if (q.termNumber) where.termNumber = q.termNumber;
    if (q.termReadinessCategory) where.termReadinessCategory = q.termReadinessCategory;
    if (q.search) {
      where.OR = [
        { briefNumber: { contains: q.search, mode: "insensitive" } },
        { title: { contains: q.search, mode: "insensitive" } },
      ];
    }

    const briefs = await prisma.vendorBrief.findMany({
      where,
      include: briefIncludeFor,
      orderBy: [
        // Overdue/escalated first via createdAt desc; SLA computed client-side
        { escalatedAt: { sort: "desc", nulls: "last" } },
        { briefSentAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = briefs.length > q.limit;
    const page = hasMore ? briefs.slice(0, q.limit) : briefs;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const now = new Date();
    return NextResponse.json({
      briefs: page.map((b) => toListItem(b, now)),
      nextCursor,
    });
  },
  { roles: ROLES },
);

// ---------------------------------------------------------------------------
// POST — create a brief
// ---------------------------------------------------------------------------

const createBodySchema = z
  .object({
    title: z.string().min(1).max(300),
    type: z.nativeEnum(VendorBriefType),
    serviceId: z.string().optional().nullable(),
    vendorContactId: z.string().optional().nullable(),
    briefBody: z.string().max(20000).optional(),
    specifications: z.string().max(5000).optional(),
    quantity: z.number().int().min(0).optional(),
    deliveryAddress: z.string().max(2000).optional(),
    deliveryDeadline: z.coerce.date().optional(),
    targetTermStart: z.coerce.date().optional(),
    termYear: z.number().int().min(2025).max(2100).optional(),
    termNumber: z.number().int().min(1).max(4).optional(),
    termReadinessCategory: z.nativeEnum(TermReadinessCategory).optional(),
  })
  .refine(
    (d) => {
      // Term-readiness fields validate together — all set, or none.
      const set = [d.termYear, d.termNumber, d.termReadinessCategory].filter(
        (v) => v !== undefined,
      );
      return set.length === 0 || set.length === 3;
    },
    {
      message:
        "Term-readiness requires termYear, termNumber, and termReadinessCategory together (or none).",
    },
  );

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid brief payload", parsed.error.flatten());
    }
    const data = parsed.data;
    const year = data.targetTermStart?.getFullYear() ?? new Date().getFullYear();

    const brief = await createBriefWithNumberRetry(
      (briefNumber) =>
        prisma.vendorBrief.create({
          data: {
            briefNumber,
            title: data.title,
            type: data.type,
            status: "draft",
            ownerId: session.user.id,
            serviceId: data.serviceId ?? null,
            vendorContactId: data.vendorContactId ?? null,
            briefBody: data.briefBody ?? null,
            specifications: data.specifications ?? null,
            quantity: data.quantity ?? null,
            deliveryAddress: data.deliveryAddress ?? null,
            deliveryDeadline: data.deliveryDeadline ?? null,
            targetTermStart: data.targetTermStart ?? null,
            termYear: data.termYear ?? null,
            termNumber: data.termNumber ?? null,
            termReadinessCategory: data.termReadinessCategory ?? null,
          },
          include: briefIncludeFor,
        }),
      () => generateBriefNumber(prisma, year),
    );

    return NextResponse.json({ brief: toListItem(brief) }, { status: 201 });
  },
  { roles: ROLES },
);
