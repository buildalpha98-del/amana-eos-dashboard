import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const updateFolderSchema = z.object({
  name: z.string().min(1).optional(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateFolderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const folder = await prisma.documentFolder.update({
    where: { id },
    data: parsed.data,
    include: {
      _count: { select: { documents: true, children: true } },
    },
  });

  return NextResponse.json(folder);
}, { roles: ["owner", "head_office", "admin"] });

export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  // Check if folder has documents or children
  const folder = await prisma.documentFolder.findUnique({
    where: { id },
    include: {
      _count: { select: { documents: true, children: true } },
    },
  });

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  if (folder._count.documents > 0 || folder._count.children > 0) {
    return NextResponse.json(
      { error: "Folder must be empty before deleting. Move or remove all documents and subfolders first." },
      { status: 400 }
    );
  }

  await prisma.documentFolder.delete({ where: { id } });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
