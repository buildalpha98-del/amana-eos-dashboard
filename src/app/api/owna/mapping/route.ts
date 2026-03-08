import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

const updateSchema = z.object({
  serviceId: z.string().min(1),
  ownaServiceId: z.string().nullable(),
  ownaLocationId: z.string().nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  // Only owner/admin can update mappings
  if (!["owner", "admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { serviceId, ownaServiceId, ownaLocationId } = parsed.data;

  const service = await prisma.service.update({
    where: { id: serviceId },
    data: {
      ownaServiceId: ownaServiceId || null,
      ownaLocationId: ownaLocationId || null,
    },
    select: {
      id: true,
      name: true,
      code: true,
      ownaServiceId: true,
      ownaLocationId: true,
      ownaSyncedAt: true,
    },
  });

  return NextResponse.json(service);
}
