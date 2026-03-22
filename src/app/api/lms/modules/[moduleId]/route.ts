import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const updateModuleSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  type: z.enum(["document", "video", "quiz", "checklist", "external_link"]).optional(),
  content: z.string().nullable().optional(),
  resourceUrl: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

// PATCH /api/lms/modules/[moduleId] — update a module
export const PATCH = withApiAuth(async (req, session, context) => {
  const { moduleId } = await context!.params!;
  const body = await req.json();
  const parsed = updateModuleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const module = await prisma.lMSModule.update({
    where: { id: moduleId },
    data: parsed.data,
  });

  return NextResponse.json(module);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/lms/modules/[moduleId] — delete a module
export const DELETE = withApiAuth(async (req, session, context) => {
  const { moduleId } = await context!.params!;

  await prisma.lMSModule.delete({
    where: { id: moduleId },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
