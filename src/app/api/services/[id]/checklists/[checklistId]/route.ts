import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { assertServiceAccess } from "@/lib/authz-scope";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";

const patchSchema = z.object({
  itemId: z.string().min(1).optional(),
  checked: z.boolean().optional(),
  notes: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]).optional(),
});

/** Keep item changes and completion consistent, including concurrent edits. */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, checklistId } = await context!.params!;
  assertServiceAccess(session, id);
  const parsed = patchSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success)
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  const { itemId, checked, notes, status } = parsed.data;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const updated = await prisma.$transaction(
        async (tx) => {
          const checklist = await tx.dailyChecklist.findFirst({
            where: { id: checklistId, serviceId: id },
            include: { items: true },
          });
          if (!checklist) throw ApiError.notFound("Checklist not found");

          if (itemId) {
            const item = checklist.items.find((i) => i.id === itemId);
            if (!item) throw ApiError.notFound("Checklist item not found");
            const nextChecked = checked ?? !item.checked;
            await tx.dailyChecklistItem.update({
              where: { id: itemId },
              data: {
                checked: nextChecked,
                checkedAt: nextChecked ? new Date() : null,
                checkedById: nextChecked ? session.user.id : null,
                ...(notes !== undefined ? { notes } : {}),
              },
            });
          }

          const current = await tx.dailyChecklist.findUnique({
            where: { id: checklistId },
            include: { items: true },
          });
          if (!current) throw ApiError.notFound("Checklist not found");
          const required = current.items.filter((i) => i.isRequired);
          const completionItems = required.length ? required : current.items;
          const allChecked =
            completionItems.length > 0 &&
            completionItems.every((i) => i.checked);
          if (status === "completed" && !allChecked) {
            throw ApiError.badRequest(
              "Complete the required checklist items before signing off.",
            );
          }
          let nextStatus = status ?? current.status;
          if (itemId && !status && allChecked) nextStatus = "completed";
          if (!allChecked && nextStatus === "completed") nextStatus = "pending";
          const newlyCompleted =
            nextStatus === "completed" && current.status !== "completed";
          await tx.dailyChecklist.update({
            where: { id: checklistId },
            data: {
              status: nextStatus,
              ...(notes !== undefined && !itemId ? { notes } : {}),
              ...(nextStatus !== "completed"
                ? { completedAt: null, completedById: null }
                : newlyCompleted
                  ? { completedAt: new Date(), completedById: session.user.id }
                  : {}),
            },
          });
          return tx.dailyChecklist.findUnique({
            where: { id: checklistId },
            include: {
              items: { orderBy: { sortOrder: "asc" } },
              completedBy: { select: { id: true, name: true } },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return NextResponse.json({ checklist: updated });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        if (attempt < 2) continue;
        throw ApiError.conflict(
          "This checklist changed while you were saving. Reload and try again.",
        );
      }
      throw error;
    }
  }
  throw ApiError.conflict("Reload the checklist and try again.");
});

export const GET = withApiAuth(async (_req, session, context) => {
  const { id, checklistId } = await context!.params!;
  assertServiceAccess(session, id);
  const checklist = await prisma.dailyChecklist.findFirst({
    where: { id: checklistId, serviceId: id },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { checkedBy: { select: { id: true, name: true } } },
      },
      completedBy: { select: { id: true, name: true } },
    },
  });
  if (!checklist) throw ApiError.notFound("Checklist not found");
  return NextResponse.json({ checklist });
});
