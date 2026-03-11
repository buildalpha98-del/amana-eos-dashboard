import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createEnquirySchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  parentName: z.string().min(1, "Parent name is required"),
  parentEmail: z.string().email().optional().nullable(),
  parentPhone: z.string().optional().nullable(),
  childName: z.string().optional().nullable(),
  childAge: z.number().int().optional().nullable(),
  channel: z.enum(["phone", "email", "whatsapp", "walkin", "referral", "website"]),
  parentDriver: z
    .enum(["homework", "quran", "enrichment", "working_parent", "traffic", "sports"])
    .optional()
    .nullable(),
  assigneeId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/enquiries — list enquiries with filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const stage = searchParams.get("stage");
  const assigneeId = searchParams.get("assigneeId");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const skip = (page - 1) * limit;

  const where: any = { deleted: false };
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

  try {
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
  } catch (err) {
    console.error("[Enquiries GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch enquiries" },
      { status: 500 },
    );
  }
}

// POST /api/enquiries — create a new enquiry
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  try {
    const body = await req.json();
    const data = createEnquirySchema.parse(body);

    const enquiry = await prisma.parentEnquiry.create({
      data: {
        serviceId: data.serviceId,
        parentName: data.parentName,
        parentEmail: data.parentEmail || null,
        parentPhone: data.parentPhone || null,
        childName: data.childName || null,
        childAge: data.childAge || null,
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

    return NextResponse.json(enquiry, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 },
      );
    }
    console.error("[Enquiries POST]", err);
    return NextResponse.json(
      { error: "Failed to create enquiry" },
      { status: 500 },
    );
  }
}
