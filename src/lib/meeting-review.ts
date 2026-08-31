/**
 * Meeting AI review (Phase 2, 2026-08-31).
 *
 * Turns a MeetingRecording's diarized transcript into a structured review:
 * summary, decisions, PROPOSED action items (never auto-created — humans
 * accept each one), and "things you may have missed" (issues discussed but
 * never captured, commitments with no owner, rocks mentioned but not
 * statused). Stored on MeetingRecording.aiReview and rendered by
 * MeetingAiReviewPanel.
 *
 * Conventions mirror l10-prep.ts: generateStructured with a Zod schema,
 * defensive post-validation that drops anything the model invented.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateStructured } from "@/lib/ai-provider";
import { logger } from "@/lib/logger";
import type { Utterance } from "@/lib/deepgram";

// ── Output schema ───────────────────────────────────────────────────────

const modelOutputSchema = z.object({
  summary: z.string(),
  decisions: z
    .array(z.object({ text: z.string(), quote: z.string() }))
    .max(20),
  actionItems: z
    .array(
      z.object({
        title: z.string(),
        suggestedAssigneeUserId: z.string().nullable(),
        suggestedAssigneeName: z.string().nullable(),
        suggestedDueDate: z.string().nullable(),
        quote: z.string(),
      }),
    )
    .max(40),
  missedItems: z
    .array(
      z.object({
        kind: z.enum(["uncaptured_issue", "unowned_commitment", "unstatused_rock"]),
        text: z.string(),
        quote: z.string(),
      }),
    )
    .max(20),
  speakerMap: z
    .array(
      z.object({
        speaker: z.number(),
        name: z.string().nullable(),
        confidence: z.enum(["high", "low"]),
      }),
    )
    .max(30),
});

export interface MeetingAiActionItem {
  id: string;
  title: string;
  suggestedAssigneeUserId: string | null;
  suggestedAssigneeName: string | null;
  suggestedDueDate: string | null;
  quote: string;
  status: "proposed" | "accepted" | "dismissed";
  todoId?: string;
}

export interface MeetingAiMissedItem {
  id: string;
  kind: "uncaptured_issue" | "unowned_commitment" | "unstatused_rock";
  text: string;
  quote: string;
  status: "proposed" | "actioned" | "dismissed";
  issueId?: string;
}

export interface MeetingAiReview {
  summary: string;
  decisions: { text: string; quote: string }[];
  actionItems: MeetingAiActionItem[];
  missedItems: MeetingAiMissedItem[];
  speakerMap: { speaker: number; name: string | null; confidence: "high" | "low" }[];
  generatedAt: string;
  modelId: string;
}

export class RecordingNotFoundError extends Error {}
export class TranscriptMissingError extends Error {}

// Keep the prompt inside a sane input budget: beyond this many characters
// of transcript we drop the oldest utterances (the tail of a meeting holds
// the conclude/cascade commitments) after coalescing.
const MAX_TRANSCRIPT_CHARS = 150_000;

export function coalesceForPrompt(utterances: Utterance[]): string {
  const lines: string[] = [];
  let speaker: number | null = null;
  let parts: string[] = [];
  const flush = () => {
    if (speaker !== null && parts.length) {
      lines.push(`Speaker ${speaker}: ${parts.join(" ")}`);
    }
    parts = [];
  };
  for (const u of utterances) {
    if (u.speaker !== speaker) {
      flush();
      speaker = u.speaker;
    }
    parts.push(u.text);
  }
  flush();

  let text = lines.join("\n");
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    text =
      "[…earlier discussion truncated…]\n" +
      text.slice(text.length - MAX_TRANSCRIPT_CHARS);
  }
  return text;
}

/**
 * Generate (or regenerate) the AI review for a recording from its stored
 * transcript. Pure computation + AI call — the CALLER owns status
 * transitions and persistence of the returned review.
 */
export async function generateMeetingReview(
  recordingId: string,
): Promise<MeetingAiReview> {
  const recording = await prisma.meetingRecording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      transcript: true,
      meeting: {
        select: {
          id: true,
          title: true,
          date: true,
          isLeadership: true,
          serviceIds: true,
          attendees: {
            select: {
              userId: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!recording) throw new RecordingNotFoundError("Recording not found");
  const utterances = (recording.transcript ?? null) as Utterance[] | null;
  if (!utterances || utterances.length === 0) {
    throw new TranscriptMissingError("Recording has no transcript");
  }

  const meeting = recording.meeting;
  const serviceScope =
    meeting.serviceIds.length > 0
      ? { serviceId: { in: meeting.serviceIds } }
      : {};
  const attendeeIds = meeting.attendees.map((a) => a.userId);

  const [openIssues, rocks, candidateTodos] = await Promise.all([
    prisma.issue.findMany({
      where: {
        deleted: false,
        status: { in: ["open", "in_discussion"] },
        category: "short_term",
        ...serviceScope,
      },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
      take: 30,
    }),
    prisma.rock.findMany({
      where: { deleted: false, status: { in: ["on_track", "off_track"] }, ...serviceScope },
      select: { id: true, title: true, status: true },
      take: 20,
    }),
    // Existing open todos for the people in the room — so the model can
    // avoid proposing action items that duplicate captured work.
    prisma.todo.findMany({
      where: {
        deleted: false,
        status: { in: ["pending", "in_progress"] },
        ...(attendeeIds.length > 0
          ? { assigneeId: { in: attendeeIds } }
          : serviceScope),
      },
      select: { title: true, assignee: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 40,
    }),
  ]);

  const context = {
    meeting: {
      title: meeting.title,
      date: meeting.date.toISOString().slice(0, 10),
      isLeadership: meeting.isLeadership,
    },
    attendees: meeting.attendees.map((a) => ({
      userId: a.userId,
      name: a.user.name,
    })),
    openIssues: openIssues.map((i) => ({ id: i.id, title: i.title })),
    rocks: rocks.map((r) => ({ title: r.title, status: r.status })),
    existingOpenTodos: candidateTodos.map(
      (t) => `${t.title} (${t.assignee?.name ?? "unassigned"})`,
    ),
  };

  const transcriptText = coalesceForPrompt(utterances);

  const result = await generateStructured({
    system:
      "You review recorded L10 (EOS Level 10) meetings for Amana OSHC leadership from a diarized transcript. " +
      "Respond as JSON matching: {summary, decisions:[{text,quote}], actionItems:[{title,suggestedAssigneeUserId,suggestedAssigneeName,suggestedDueDate,quote}], " +
      "missedItems:[{kind,text,quote}], speakerMap:[{speaker,name,confidence}]}. Rules: " +
      "summary is a 150-300 word narrative of what was discussed and decided. " +
      "decisions are explicit calls made in the room, each with a short supporting quote. " +
      "actionItems are commitments ACTUALLY SPOKEN in the meeting; suggestedAssigneeUserId must be one of the provided attendee userIds " +
      "(map speakers to attendees from introductions and how people address each other) or null when unsure; " +
      "suggestedAssigneeName is the name you heard; suggestedDueDate is an ISO date ONLY if a deadline was spoken, else null; " +
      "do NOT propose items that duplicate existingOpenTodos. " +
      "When a commitment has no clear owner, put it in missedItems as kind=unowned_commitment instead of guessing an assignee. " +
      "missedItems kind=uncaptured_issue: problems discussed at length that match NOTHING in openIssues. " +
      "kind=unstatused_rock: rocks from the provided list that were mentioned but never given an on/off-track status. " +
      "speakerMap maps each transcript speaker number to an attendee name (confidence=high only when the mapping is clear). " +
      "Every quote must be a short verbatim excerpt from the transcript.",
    prompt: `Meeting context:\n${JSON.stringify(context, null, 2)}\n\nTranscript:\n${transcriptText}`,
    schema: modelOutputSchema,
    maxTokens: 4096,
    temperature: 0.3,
  });

  // Defensive validation: drop anything the model invented.
  const attendeeIdSet = new Set(attendeeIds);
  const review: MeetingAiReview = {
    summary: result.data.summary,
    decisions: result.data.decisions.slice(0, 10),
    actionItems: result.data.actionItems.slice(0, 20).map((item) => ({
      id: randomUUID(),
      title: item.title,
      suggestedAssigneeUserId:
        item.suggestedAssigneeUserId && attendeeIdSet.has(item.suggestedAssigneeUserId)
          ? item.suggestedAssigneeUserId
          : null,
      suggestedAssigneeName: item.suggestedAssigneeName,
      suggestedDueDate: item.suggestedDueDate,
      quote: item.quote,
      status: "proposed",
    })),
    missedItems: result.data.missedItems.slice(0, 10).map((item) => ({
      id: randomUUID(),
      kind: item.kind,
      text: item.text,
      quote: item.quote,
      status: "proposed",
    })),
    speakerMap: result.data.speakerMap,
    generatedAt: new Date().toISOString(),
    modelId: result.modelId,
  };

  logger.info("Meeting AI review generated", {
    recordingId,
    meetingId: meeting.id,
    actionItems: review.actionItems.length,
    missedItems: review.missedItems.length,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  });

  return review;
}
