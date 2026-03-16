import { prisma } from "@/lib/prisma";
import type { Rock } from "@prisma/client";

/**
 * Create a test rock with optional milestones.
 */
export async function createTestRock(
  userId: string,
  quarter: string,
  overrides?: Partial<Pick<Rock, "title" | "status" | "percentComplete" | "priority" | "serviceId">>,
): Promise<Rock & { milestones: { id: string; title: string }[] }> {
  return prisma.rock.create({
    data: {
      title: overrides?.title ?? "Test Rock",
      ownerId: userId,
      quarter,
      status: overrides?.status ?? "on_track",
      percentComplete: overrides?.percentComplete ?? 0,
      priority: overrides?.priority ?? "medium",
      serviceId: overrides?.serviceId ?? null,
      milestones: {
        create: [
          { title: "Milestone 1", dueDate: new Date("2026-02-15") },
          { title: "Milestone 2", dueDate: new Date("2026-03-15") },
        ],
      },
    },
    include: { milestones: { select: { id: true, title: true } } },
  });
}
