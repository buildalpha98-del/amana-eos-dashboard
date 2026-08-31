import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { getWeekStart } from "@/lib/utils";
import type { MeetingAiReview } from "@/lib/meeting-review";

/**
 * POST /api/meetings/[id]/recordings/[recordingId]/action-items/[itemId]
 *
 * Accept or dismiss ONE AI-proposed action item. Accepting creates a real
 * Todo (meeting-stamped). The aiReview Json is mutated via read-modify-
 * write INSIDE one interactive transaction with a status re-check, so a
 * double-accept race cannot create two todos.
 *
 * (Deliberate deviation from the spec's /accept endpoint shape: one route,
 * body `{ decision }` — fewer files, same semantics.)
 */

const decisionSchema = z.object({
  decision: z.enum(["accept", "dismiss"]),
  // Accept-time overrides for the editable inline row.
  title: z.string().min(1).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id, recordingId, itemId } = (await context!.params!) as {
      id: string;
      recordingId: string;
      itemId: string;
    };
    const parsed = decisionSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        // Row lock: two concurrent decisions (or a concurrent regenerate)
        // would otherwise BOTH read the item as "proposed" under READ
        // COMMITTED and the second aiReview write would clobber the first.
        await tx.$queryRaw`SELECT id FROM "MeetingRecording" WHERE id = ${recordingId} FOR UPDATE`;
        const recording = await tx.meetingRecording.findUnique({
          where: { id: recordingId },
          select: { id: true, meetingId: true, aiReview: true },
        });
        if (!recording || recording.meetingId !== id || !recording.aiReview) {
          throw new HttpishError(404, "Recording not found");
        }
        const review = recording.aiReview as unknown as MeetingAiReview;
        const item = review.actionItems?.find((a) => a.id === itemId);
        if (!item) throw new HttpishError(404, "Action item not found");
        if (item.status !== "proposed") {
          throw new HttpishError(409, "Action item already decided");
        }

        if (parsed.data.decision === "dismiss") {
          item.status = "dismissed";
        } else {
          const assigneeId =
            parsed.data.assigneeId ?? item.suggestedAssigneeUserId;
          if (!assigneeId) {
            throw new HttpishError(
              400,
              "An assignee is required — the AI couldn't match one, pick a person",
            );
          }
          const assignee = await tx.user.findFirst({
            where: { id: assigneeId, active: true },
            select: { id: true },
          });
          if (!assignee) {
            throw new HttpishError(400, "Invalid assignee");
          }
          // Todo.dueDate is required — default +7d when neither the
          // suggestion nor the override supplies a PARSEABLE date. An
          // explicit override that doesn't parse is the caller's bug → 400;
          // an unparseable AI suggestion silently falls back.
          const fallback = new Date(Date.now() + 7 * 86_400_000);
          let due = fallback;
          if (parsed.data.dueDate) {
            due = new Date(parsed.data.dueDate);
            if (Number.isNaN(due.getTime())) {
              throw new HttpishError(400, "Invalid due date");
            }
          } else if (item.suggestedDueDate) {
            const suggested = new Date(item.suggestedDueDate);
            due = Number.isNaN(suggested.getTime()) ? fallback : suggested;
          }

          const todo = await tx.todo.create({
            data: {
              title: parsed.data.title ?? item.title,
              description: item.quote ? `From the meeting: “${item.quote}”` : null,
              assigneeId,
              createdById: session!.user.id,
              meetingId: id,
              dueDate: due,
              weekOf: getWeekStart(),
            },
          });
          item.status = "accepted";
          item.todoId = todo.id;
        }

        return tx.meetingRecording.update({
          where: { id: recordingId },
          data: { aiReview: review as unknown as object },
        });
      });

      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof HttpishError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  },
  { roles: ["owner", "head_office", "admin", "marketing", "eos_implementer"] },
);

class HttpishError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
