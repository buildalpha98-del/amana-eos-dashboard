import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// DELETE /api/response-templates/:id
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const template = await prisma.responseTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  await prisma.responseTemplate.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "ResponseTemplate",
      entityId: id,
      details: { title: template.title },
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
