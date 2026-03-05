import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createPackSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  serviceId: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        sortOrder: z.number().optional(),
        isRequired: z.boolean().optional(),
        assignedTo: z.string().optional(),
        documentId: z.string().optional(),
      })
    )
    .optional(),
});

// GET /api/offboarding/packs — list all offboarding packs
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  const where: Record<string, unknown> = { deleted: false };
  if (serviceId) where.serviceId = serviceId;

  // Staff only see packs for their service + default packs
  if (session!.user.role === "staff" && session!.user.serviceId) {
    where.OR = [
      { serviceId: session!.user.serviceId },
      { serviceId: null },
      { isDefault: true },
    ];
    delete where.serviceId;
  }

  const packs = await prisma.offboardingPack.findMany({
    where: where as any,
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { tasks: true, assignments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(packs);
}

// POST /api/offboarding/packs — create a new pack (owner/admin only)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createPackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { tasks, ...packData } = parsed.data;

  const pack = await prisma.offboardingPack.create({
    data: {
      ...packData,
      tasks: tasks
        ? {
            create: tasks.map((t, i) => ({
              ...t,
              sortOrder: t.sortOrder ?? i,
            })),
          }
        : undefined,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      tasks: { orderBy: { sortOrder: "asc" } },
      _count: { select: { tasks: true, assignments: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "OffboardingPack",
      entityId: pack.id,
      details: { name: pack.name },
    },
  });

  return NextResponse.json(pack, { status: 201 });
}
