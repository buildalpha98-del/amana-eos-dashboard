import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/getting-started — return the user's checklist progress
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { gettingStartedProgress: true },
  });

  return NextResponse.json({
    progress: (user?.gettingStartedProgress as Record<string, boolean>) ?? {},
  });
}

// PUT /api/getting-started — toggle a checklist item
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { key, completed } = body as { key: string; completed: boolean };

  if (!key || typeof completed !== "boolean") {
    return NextResponse.json(
      { error: "key (string) and completed (boolean) are required" },
      { status: 400 },
    );
  }

  // Fetch current progress and merge the update
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { gettingStartedProgress: true },
  });

  const current =
    (user?.gettingStartedProgress as Record<string, boolean>) ?? {};
  const updated = { ...current, [key]: completed };

  await prisma.user.update({
    where: { id: session!.user.id },
    data: { gettingStartedProgress: updated },
  });

  return NextResponse.json({ progress: updated });
}
