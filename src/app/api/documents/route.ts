import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.enum(["policy", "procedure", "template", "guide", "compliance", "financial", "marketing", "hr", "other"]).default("other"),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  centreId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const centreId = searchParams.get("centreId");
  const search = searchParams.get("search");

  const documents = await prisma.document.findMany({
    where: {
      deleted: false,
      ...(category ? { category: category as any } : {}),
      ...(centreId ? { centreId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { tags: { hasSome: [search] } },
            ],
          }
        : {}),
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      centre: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(documents);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

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
    },
  });

  return NextResponse.json(document, { status: 201 });
}
