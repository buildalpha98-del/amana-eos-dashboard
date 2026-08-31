import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import type { MeetingAiReview } from "@/lib/meeting-review";

/**
 * POST /api/meetings/[id]/recordings/[recordingId]/missed-items/[itemId]
 *
 * Action or dismiss ONE "things you may have missed" item. `action` is
 * only valid for kind=uncaptured_issue — it raises a real (short-term)
 * Issue. Other kinds are informational and can only be dismissed.
 * Same transactional double-decision guard as action items.
 */

const decisionSchema = z.object({
  decision: z.enum(["action", "dismiss"]),
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
        const recording = await tx.meetingRecording.findUnique({
          where: { id: recordingId },
          select: {
            id: true,
            meetingId: true,
            aiReview: true,
            meeting: { select: { serviceIds: true } },
          },
        });
        if (!recording || recording.meetingId !== id || !recording.aiReview) {
          throw new HttpishError(404, "Recording not found");
        }
        const review = recording.aiReview as unknown as MeetingAiReview;
        const item = review.missedItems?.find((m) => m.id === itemId);
        if (!item) throw new HttpishError(404, "Missed item not found");
        if (item.status !== "proposed") {
          throw new HttpishError(409, "Item already decided");
        }

        if (parsed.data.decision === "dismiss") {
          item.status = "dismissed";
        } else {
          if (item.kind !== "uncaptured_issue") {
            throw new HttpishError(
              400,
              "Only uncaptured issues can be raised as Issues",
            );
          }
          const serviceIds = recording.meeting.serviceIds;
          const issue = await tx.issue.create({
            data: {
              title: item.text,
              description: item.quote
                ? `Raised from the meeting recording: “${item.quote}”`
                : null,
              priority: "medium",
              category: "short_term",
              raisedById: session!.user.id,
              serviceId: serviceIds.length === 1 ? serviceIds[0] : null,
            },
          });
          item.status = "actioned";
          item.issueId = issue.id;
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
