import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// DELETE /api/activity-templates/[id]/files/[fileId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id, fileId } = await params;

  const file = await prisma.activityTemplateFile.findFirst({
    where: { id: fileId, templateId: id },
    select: { id: true, fileName: true },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await prisma.activityTemplateFile.delete({ where: { id: fileId } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "ActivityTemplateFile",
      entityId: fileId,
      details: { templateId: id, fileName: file.fileName },
    },
  });

  return NextResponse.json({ success: true });
}
