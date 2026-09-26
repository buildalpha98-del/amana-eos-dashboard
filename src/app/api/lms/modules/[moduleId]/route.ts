import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { syncAfterResponse } from "@/lib/knowledge/hooks";
import { syncLmsModule, syncLmsCourse } from "@/lib/knowledge/adapters/lms-module";
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
  const body = await parseJsonBody(req);
  const parsed = updateModuleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const updatedModule = await prisma.lMSModule.update({
    where: { id: moduleId },
    data: parsed.data,
  });

  syncAfterResponse("lms_module", () => syncLmsModule(moduleId));

  return NextResponse.json(updatedModule);
}, { roles: [...ADMIN_ROLES] });

// DELETE /api/lms/modules/[moduleId] — delete a module
export const DELETE = withApiAuth(async (req, session, context) => {
  const { moduleId } = await context!.params!;

  const m = await prisma.lMSModule.findUnique({
    where: { id: moduleId },
    select: { courseId: true },
  });

  await prisma.lMSModule.delete({
    where: { id: moduleId },
  });

  if (m) syncAfterResponse("lms_module", () => syncLmsCourse(m.courseId));

  return NextResponse.json({ success: true });
}, { roles: [...ADMIN_ROLES] });
