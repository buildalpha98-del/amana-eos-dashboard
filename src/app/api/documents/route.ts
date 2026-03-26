import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { indexDocument } from "@/lib/document-indexer";
const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.enum(["program", "policy", "procedure", "template", "guide", "compliance", "financial", "marketing", "hr", "other"]).default("other"),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  centreId: z.string().optional().nullable(),
  folderId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const centreId = searchParams.get("centreId");
  const folderId = searchParams.get("folderId");
  const search = searchParams.get("search");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

  // Staff/member users can only see documents for their assigned service + company-wide docs
  const isServiceScoped = ["staff", "member"].includes(session!.user.role);
  const staffServiceId = session!.user.serviceId;

  const where: Record<string, unknown> = {
    deleted: false,
    ...(category ? { category: category as any } : {}),
    ...(folderId === "root" ? { folderId: null } : folderId ? { folderId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { tags: { hasSome: [search] } },
          ],
        }
      : {}),
  };

  // Staff/member service scoping: show their service docs + company-wide (centreId = null)
  if (isServiceScoped && staffServiceId) {
    where.OR = [
      { centreId: staffServiceId },
      { centreId: null },
      ...(search
        ? [
            { title: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { tags: { hasSome: [search] } },
          ]
        : []),
    ];
    // If staff also filters by centre, only allow their own service
    if (centreId && centreId !== staffServiceId) {
      // Staff trying to view another centre — show nothing
      return NextResponse.json({ documents: [], total: 0, page, totalPages: 0 });
    }
    if (centreId) {
      where.centreId = centreId;
      delete where.OR;
    }
  } else if (centreId) {
    where.centreId = centreId;
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where: where as any,
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        centre: { select: { id: true, name: true, code: true } },
        folder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.document.count({ where: where as any }),
  ]);

  return NextResponse.json({
    documents,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

export const POST = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = createDocumentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const document = await prisma.document.create({
    data: {
      ...parsed.data,
      tags: parsed.data.tags || [],
      uploadedById: session!.user.id,
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      centre: { select: { id: true, name: true, code: true } },
      folder: { select: { id: true, name: true } },
    },
  });

  indexDocument(document.id).catch((err) => {
    logger.warn("Auto-index failed", { documentId: document.id, error: err });
  });

  return NextResponse.json(document, { status: 201 });
});
