import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonField, gettingStartedProgressSchema } from "@/lib/schemas/json-fields";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const putSchema = z.object({
  key: z.string().min(1, "key is required"),
  completed: z.boolean(),
});

// GET /api/getting-started — return the user's checklist progress
export const GET = withApiAuth(async (req, session) => {
const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { gettingStartedProgress: true },
  });

  return NextResponse.json({
    progress: parseJsonField(user?.gettingStartedProgress, gettingStartedProgressSchema, {}),
  });
});

// PUT /api/getting-started — toggle a checklist item
export const PUT = withApiAuth(async (req, session) => {
const raw = await req.json();
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { key, completed } = parsed.data;

  // Fetch current progress and merge the update
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { gettingStartedProgress: true },
  });

  const current = parseJsonField(user?.gettingStartedProgress, gettingStartedProgressSchema, {});
  const updated = { ...current, [key]: completed };

  await prisma.user.update({
    where: { id: session!.user.id },
    data: { gettingStartedProgress: updated },
  });

  return NextResponse.json({ progress: updated });
});
