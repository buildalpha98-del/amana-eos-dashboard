import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const updateTrendSchema = z.object({
  dismissed: z.boolean(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = updateTrendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const trend = await prisma.trendInsight.update({
    where: { id },
    data: { dismissed: parsed.data.dismissed },
  });

  return NextResponse.json(trend);
});
