import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createModuleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.enum(["document", "video", "quiz", "checklist", "external_link"]).optional(),
  content: z.string().optional(),
  resourceUrl: z.string().optional(),
  documentId: z.string().optional(),
  duration: z.number().optional(),
  isRequired: z.boolean().optional(),
});

const reorderSchema = z.object({
  moduleIds: z.array(z.string()),
});

// POST /api/lms/courses/[id]/modules — add a module
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id: courseId } = await params;
  const body = await req.json();

  // Handle reorder
  if (body.moduleIds) {
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const updates = parsed.data.moduleIds.map((moduleId, index) =>
      prisma.lMSModule.update({
        where: { id: moduleId },
        data: { sortOrder: index },
      })
    );
    await prisma.$transaction(updates);
    return NextResponse.json({ success: true });
  }

  const parsed = createModuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Get max sortOrder
  const maxOrder = await prisma.lMSModule.aggregate({
    where: { courseId },
    _max: { sortOrder: true },
  });

  const module = await prisma.lMSModule.create({
    data: {
      courseId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      type: parsed.data.type || "document",
      content: parsed.data.content || null,
      resourceUrl: parsed.data.resourceUrl || null,
      documentId: parsed.data.documentId || null,
      duration: parsed.data.duration || null,
      isRequired: parsed.data.isRequired ?? true,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "LMSModule",
      entityId: module.id,
      details: { title: module.title, courseId },
    },
  });

  return NextResponse.json(module, { status: 201 });
}
