import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const bulkSchema = z.object({
  action: z.enum(["resolve", "delete", "assign", "move"]),
  ids: z.array(z.string()).min(1),
  assigneeId: z.string().optional(),
  category: z.string().optional(),
});

// POST /api/issues/bulk
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { action, ids, assigneeId, category } = parsed.data;

  try {
    let result: { count: number } = { count: 0 };

    switch (action) {
      case "resolve": {
        result = await prisma.issue.updateMany({
          where: { id: { in: ids }, deleted: false },
          data: { status: "solved", solvedAt: new Date() },
        });
        break;
      }

      case "delete": {
        result = await prisma.issue.updateMany({
          where: { id: { in: ids } },
          data: { deleted: true },
        });
        break;
      }

      case "assign": {
        if (!assigneeId) {
          return NextResponse.json(
            { error: "assigneeId is required for assign action" },
            { status: 400 }
          );
        }
        result = await prisma.issue.updateMany({
          where: { id: { in: ids }, deleted: false },
          data: { ownerId: assigneeId },
        });
        break;
      }

      case "move": {
        if (!category || !["short_term", "long_term"].includes(category)) {
          return NextResponse.json(
            { error: "category must be 'short_term' or 'long_term'" },
            { status: 400 }
          );
        }
        result = await prisma.issue.updateMany({
          where: { id: { in: ids }, deleted: false },
          data: { category },
        });
        break;
      }
    }

    // Log bulk action
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: `bulk_${action}`,
        entityType: "Issue",
        entityId: ids[0],
        details: { ids, action, assigneeId, category },
      },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (err) {
    console.error("Bulk issue action error:", err);
    return NextResponse.json(
      { error: "Failed to perform bulk action" },
      { status: 500 }
    );
  }
}
