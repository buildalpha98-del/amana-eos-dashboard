import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { scheduleNurtureFromStageChange } from "@/lib/nurture-scheduler";
import { logger } from "@/lib/logger";
const childSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(3).max(16).optional().nullable(),
});

const createEnquirySchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  parentName: z.string().min(1, "Parent name is required"),
  parentEmail: z.string().email().optional().nullable(),
  parentPhone: z.string().optional().nullable(),
  childName: z.string().optional().nullable(),
  childAge: z.number().int().optional().nullable(),
  childrenDetails: z.array(childSchema).optional().nullable(),
  channel: z.enum(["phone", "email", "whatsapp", "walkin", "referral", "website"]),
  parentDriver: z
    .enum(["homework", "quran", "enrichment", "working_parent", "traffic", "sports"])
    .optional()
    .nullable(),
  assigneeId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/enquiries — list enquiries with filters
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const stage = searchParams.get("stage");
  const assigneeId = searchParams.get("assigneeId");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { deleted: false };
  if (serviceId) where.serviceId = serviceId;
  if (stage) where.stage = stage;
  if (assigneeId) where.assigneeId = assigneeId;
  if (search) {
    where.OR = [
      { parentName: { contains: search, mode: "insensitive" } },
      { childName: { contains: search, mode: "insensitive" } },
      { parentEmail: { contains: search, mode: "insensitive" } },
      { parentPhone: { contains: search, mode: "insensitive" } },
    ];
  }

  const [enquiries, total] = await Promise.all([
    prisma.parentEnquiry.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { stageChangedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.parentEnquiry.count({ where }),
  ]);

  return NextResponse.json({
    enquiries,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}, { roles: ["owner", "head_office", "admin"] });

// POST /api/enquiries — create a new enquiry
export const POST = withApiAuth(async (req) => {
  const body = await parseJsonBody(req);
  const parsed = createEnquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Build childName summary from childrenDetails if provided
  const children = data.childrenDetails?.filter((c) => c.name.trim());
  let childName = data.childName || null;
  let childAge = data.childAge || null;

  if (children && children.length > 0) {
    childName = children.map((c) => c.name).join(", ");
    childAge = children[0].age || null; // Store first child's age for backward compat
  }

  const enquiry = await prisma.parentEnquiry.create({
    data: {
      serviceId: data.serviceId,
      parentName: data.parentName,
      parentEmail: data.parentEmail || null,
      parentPhone: data.parentPhone || null,
      childName,
      childAge,
      childrenDetails: children && children.length > 0 ? children : undefined,
      channel: data.channel,
      parentDriver: data.parentDriver || null,
      assigneeId: data.assigneeId || null,
      notes: data.notes || null,
      stageChangedAt: new Date(),
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  // Trigger welcome nurture email for new enquiries
  scheduleNurtureFromStageChange(enquiry.id, "new").catch((err) =>
    logger.error("Failed to schedule welcome nurture", { enquiryId: enquiry.id, err }),
  );

  return NextResponse.json(enquiry, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
