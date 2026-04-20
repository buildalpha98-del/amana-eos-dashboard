import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const PatchSchema = z.object({
  status: z.enum(["accepted", "edited", "dismissed"]),
  editedContent: z.string().optional(),
});

/**
 * PATCH /api/ai-drafts/[id]
 *
 * Review an AI-generated draft — accept, edit, or dismiss it.
 * If accepted, also marks the source todo/task as complete.
 */
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const body = await parseJsonBody(req);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Validation failed", parsed.error.flatten());
    }

    const { status, editedContent } = parsed.data;

    // Fetch the draft
    const draft = await prisma.aiTaskDraft.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        todoId: true,
        marketingTaskId: true,
        coworkTodoId: true,
        ticketId: true,
        issueId: true,
      },
    });

    if (!draft) {
      throw ApiError.notFound("Draft not found");
    }

    // Update the draft
    const updateData: Record<string, unknown> = {
      status,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
    };

    if (status === "edited" && editedContent) {
      updateData.content = editedContent;
    }

    const updated = await prisma.aiTaskDraft.update({
      where: { id },
      data: updateData,
    });

    // If accepted, mark the source task as complete
    if (status === "accepted") {
      if (draft.todoId) {
        await prisma.todo.update({
          where: { id: draft.todoId },
          data: { status: "complete", completedAt: new Date() },
        }).catch((err) => logger.error("Failed to complete todo after AI draft accept", { err, draftId: id, todoId: draft.todoId }));
      }

      if (draft.marketingTaskId) {
        await prisma.marketingTask.update({
          where: { id: draft.marketingTaskId },
          data: { status: "done" },
        }).catch((err) => logger.error("Failed to complete marketingTask after AI draft accept", { err, draftId: id, marketingTaskId: draft.marketingTaskId }));
      }

      if (draft.coworkTodoId) {
        await prisma.coworkTodo.update({
          where: { id: draft.coworkTodoId },
          data: { completed: true, completedAt: new Date() },
        }).catch((err) => logger.error("Failed to complete coworkTodo after AI draft accept", { err, draftId: id, coworkTodoId: draft.coworkTodoId }));
      }

      if (draft.ticketId) {
        await prisma.supportTicket.update({
          where: { id: draft.ticketId },
          data: { status: "resolved", resolvedAt: new Date() },
        }).catch((err) => logger.error("Failed to resolve ticket after AI draft accept", { err, draftId: id, ticketId: draft.ticketId }));
      }

      if (draft.issueId) {
        await prisma.issue.update({
          where: { id: draft.issueId },
          data: { status: "solved", solvedAt: new Date() },
        }).catch((err) => logger.error("Failed to solve issue after AI draft accept", { err, draftId: id, issueId: draft.issueId }));
      }
    }

    return NextResponse.json(updated);
  },
);
