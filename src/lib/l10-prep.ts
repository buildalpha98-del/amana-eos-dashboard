/**
 * Draft-first L10 (2026-07-05).
 *
 * Prepares an AI agenda draft for a scheduled L10 meeting so the
 * facilitator walks in to a proposed plan instead of a blank segue:
 *  - IDS: open short-term issues ranked with a one-line reason each
 *  - Scorecard: commentary on measurables whose latest entry is off track
 *  - Rocks: a status-conversation suggestion per linked rock
 *
 * The draft is stored on Meeting.aiAgendaDraft and rendered read-only
 * inside ActiveMeetingView — the humans still run the meeting. Invoked
 * from POST /api/meetings/[id]/prepare (facilitator button) and the
 * morning-briefing cron for same-day meetings.
 */

import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { generateStructured } from "@/lib/ai-provider";
import { logger } from "@/lib/logger";

export const agendaDraftSchema = z.object({
  summary: z.string(),
  idsOrder: z.array(
    z.object({
      issueId: z.string(),
      title: z.string(),
      reason: z.string(),
    }),
  ),
  scorecardCommentary: z.string(),
  rockSuggestions: z.array(
    z.object({
      rockId: z.string(),
      title: z.string(),
      suggestion: z.string(),
    }),
  ),
});

export type AgendaDraft = z.infer<typeof agendaDraftSchema>;

export class MeetingNotFoundError extends Error {}
export class MeetingNotPreparableError extends Error {}

/**
 * Gather live EOS data for the meeting scope and draft the agenda.
 * Throws MeetingNotFoundError / MeetingNotPreparableError for the API
 * layer to map; AI failures propagate (the caller decides whether a
 * fallback matters — the facilitator button surfaces the error, the
 * cron logs and moves on).
 */
export async function prepareMeetingAgenda(meetingId: string): Promise<AgendaDraft> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      status: true,
      serviceIds: true,
      rockIds: true,
    },
  });
  if (!meeting) throw new MeetingNotFoundError("Meeting not found");
  if (meeting.status === "completed") {
    throw new MeetingNotPreparableError("Meeting is already completed");
  }

  const serviceScope =
    meeting.serviceIds.length > 0 ? { serviceId: { in: meeting.serviceIds } } : {};

  const [issues, rocks, offTrackMeasurables] = await Promise.all([
    prisma.issue.findMany({
      where: {
        status: { in: ["open", "in_discussion"] },
        category: "short_term",
        ...serviceScope,
      },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        createdAt: true,
        owner: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 15,
    }),
    prisma.rock.findMany({
      where:
        meeting.rockIds.length > 0
          ? { id: { in: meeting.rockIds } }
          : { status: { in: ["on_track", "off_track"] }, ...serviceScope },
      select: {
        id: true,
        title: true,
        status: true,
        percentComplete: true,
        owner: { select: { name: true } },
      },
      take: 10,
    }),
    prisma.measurable.findMany({
      where: { ...serviceScope },
      select: {
        id: true,
        title: true,
        goalValue: true,
        goalDirection: true,
        owner: { select: { name: true } },
        entries: {
          orderBy: { weekOf: "desc" },
          take: 1,
          select: { value: true, onTrack: true, weekOf: true },
        },
      },
      take: 40,
    }).then((ms) =>
      ms.filter((m) => m.entries.length > 0 && m.entries[0].onTrack === false),
    ),
  ]);

  const context = {
    meetingTitle: meeting.title,
    issues: issues.map((i) => ({
      issueId: i.id,
      title: i.title,
      description: i.description?.slice(0, 200) ?? null,
      priority: i.priority,
      ageDays: Math.round((Date.now() - i.createdAt.getTime()) / 86_400_000),
      owner: i.owner?.name ?? "Unassigned",
    })),
    rocks: rocks.map((r) => ({
      rockId: r.id,
      title: r.title,
      status: r.status,
      percentComplete: r.percentComplete,
      owner: r.owner?.name ?? "Unassigned",
    })),
    offTrackMeasurables: offTrackMeasurables.map((m) => ({
      name: m.title,
      owner: m.owner?.name ?? "Unassigned",
      goal: `${m.goalDirection} ${m.goalValue}`,
      lastValue: m.entries[0].value,
      weekOf: m.entries[0].weekOf.toISOString().slice(0, 10),
    })),
  };

  const result = await generateStructured({
    system:
      "You prepare L10 (EOS Level 10) meeting agendas for Amana OSHC leadership. " +
      "Respond as JSON matching: {summary, idsOrder:[{issueId,title,reason}], scorecardCommentary, rockSuggestions:[{rockId,title,suggestion}]}. " +
      "Rules: idsOrder ranks the given issues by impact (cluster duplicates — mention when issues look like the same root cause), " +
      "each reason under 20 words; scorecardCommentary under 80 words covering the off-track measurables (empty string if none); " +
      "one practical suggestion per rock under 25 words; summary is 2 sentences for the facilitator. " +
      "Use ONLY the provided issueIds/rockIds — never invent items.",
    prompt: `Meeting context:\n${JSON.stringify(context, null, 2)}`,
    schema: agendaDraftSchema,
    maxTokens: 2048,
    temperature: 0.3,
  });

  // Persist — drop any hallucinated ids defensively even though the
  // prompt forbids them.
  const validIssueIds = new Set(issues.map((i) => i.id));
  const validRockIds = new Set(rocks.map((r) => r.id));
  const draft: AgendaDraft = {
    summary: result.data.summary,
    idsOrder: result.data.idsOrder.filter((x) => validIssueIds.has(x.issueId)),
    scorecardCommentary: result.data.scorecardCommentary,
    rockSuggestions: result.data.rockSuggestions.filter((x) =>
      validRockIds.has(x.rockId),
    ),
  };

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { aiAgendaDraft: draft, aiAgendaDraftAt: new Date() },
  });

  logger.info("L10 agenda draft prepared", {
    meetingId: meeting.id,
    issues: draft.idsOrder.length,
    rocks: draft.rockSuggestions.length,
  });

  return draft;
}
