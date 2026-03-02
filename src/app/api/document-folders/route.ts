import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const folders = await prisma.documentFolder.findMany({
    include: {
      _count: { select: { documents: true, children: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(folders);
}

const createFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required"),
  parentId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createFolderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const folder = await prisma.documentFolder.create({
    data: {
      name: parsed.data.name,
      parentId: parsed.data.parentId || null,
    },
    include: {
      _count: { select: { documents: true, children: true } },
    },
  });

  return NextResponse.json(folder, { status: 201 });
}
