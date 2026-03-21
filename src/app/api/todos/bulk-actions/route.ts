import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

const bulkActionSchema = z.object({
  action: z.enum(["complete", "delete", "assign"]),
  ids: z.array(z.string().min(1)).min(1).max(200),
  assigneeId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
  const body = await req.json();
  const parsed = bulkActionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { action, ids, assigneeId } = parsed.data;

  // Validate the todos exist
  const todos = await prisma.todo.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const validIds = todos.map((t) => t.id);

  if (validIds.length === 0) {
    return NextResponse.json(
      { error: "No valid to-dos found" },
      { status: 404 },
    );
  }

  switch (action) {
    case "complete": {
      await prisma.todo.updateMany({
        where: { id: { in: validIds } },
        data: { status: "complete", completedAt: new Date() },
      });
      return NextResponse.json({ updated: validIds.length });
    }

    case "delete": {
      await prisma.todo.deleteMany({
        where: { id: { in: validIds } },
      });
      return NextResponse.json({ deleted: validIds.length });
    }

    case "assign": {
      if (!assigneeId) {
        return NextResponse.json(
          { error: "assigneeId is required for assign action" },
          { status: 400 },
        );
      }

      // Validate assignee exists
      const user = await prisma.user.findFirst({
        where: { id: assigneeId, active: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "Invalid assignee" },
          { status: 400 },
        );
      }

      await prisma.todo.updateMany({
        where: { id: { in: validIds } },
        data: { assigneeId },
      });
      return NextResponse.json({ updated: validIds.length });
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  } catch (err) {
    console.error("Bulk todo action error:", err);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 },
    );
  }
}
