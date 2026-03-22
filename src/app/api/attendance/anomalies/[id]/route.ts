import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const patchSchema = z.object({
  dismissed: z.boolean().optional().default(true),
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { dismissed } = parsed.data;

  const anomaly = await prisma.attendanceAnomaly.update({
    where: { id },
    data: { dismissed },
  });

  return NextResponse.json(anomaly);
});
