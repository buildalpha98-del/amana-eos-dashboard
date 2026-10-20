import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const updateSchema = z.object({
  serviceId: z.string().min(1),
  ownaServiceId: z.string().nullable(),
  ownaLocationId: z.string().nullable().optional(),
});

export const PUT = withApiAuth(async (req, session) => {
// Only owner/admin can update mappings
  if (!["owner", "admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await parseJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { serviceId, ownaServiceId, ownaLocationId } = parsed.data;

  // One OWNA centre ↔ one Amana centre — a double link would sync the same
  // children and attendance into two centres (21 Oct 2026).
  if (ownaServiceId) {
    const taken = await prisma.service.findFirst({
      where: { ownaServiceId, id: { not: serviceId } },
      select: { name: true },
    });
    if (taken) {
      return NextResponse.json(
        { error: `That OWNA centre is already linked to ${taken.name}.` },
        { status: 409 },
      );
    }
  }

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
});
