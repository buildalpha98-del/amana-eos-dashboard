/**
 * Post-review meeting digest (execution layer, 2026-08-31).
 *
 * When a recording's AI review completes, attendees get (1) a branded
 * email — summary, decisions, action-item counts, cascade messages — and
 * (2) an in-app notification. Idempotent via a guarded claim on
 * MeetingRecording.digestSentAt, so the webhook / regenerate / janitor
 * callers can all fire-and-forget without double-sending. Regenerating a
 * review does NOT re-send (the claim survives).
 *
 * Recipient gates:
 * - Email: active attendees with notificationsMuted=false (mute = "no
 *   external pings"); suppression enforced inside sendEmail as always.
 *   The receivesNudges gate deliberately does NOT apply — this is work
 *   output for people who were in the room.
 * - In-app: ALL active attendees, muted included — mute keeps in-app
 *   rows by design (see notification-mute.ts).
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { baseLayout, buttonHtml, escapeHtml } from "@/lib/email-templates";
import { siteUrl } from "@/lib/site-url";
import { logger } from "@/lib/logger";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import type { MeetingAiReview } from "@/lib/meeting-review";

export async function sendMeetingDigest(recordingId: string): Promise<{
  sent: boolean;
  emailed: number;
  notified: number;
}> {
  // Guarded claim FIRST — one digest per recording, ever.
  const claimed = await prisma.meetingRecording.updateMany({
    where: { id: recordingId, digestSentAt: null },
    data: { digestSentAt: new Date() },
  });
  if (claimed.count === 0) {
    return { sent: false, emailed: 0, notified: 0 };
  }

  const recording = await prisma.meetingRecording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      aiReview: true,
      meeting: {
        select: {
          id: true,
          title: true,
          date: true,
          cascades: {
            where: { deleted: false },
            select: { message: true },
            orderBy: { createdAt: "asc" },
          },
          attendees: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  active: true,
                  notificationsMuted: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!recording?.aiReview) {
    return { sent: false, emailed: 0, notified: 0 };
  }

  const review = recording.aiReview as unknown as MeetingAiReview;
  const meeting = recording.meeting;
  const attendees = meeting.attendees.map((a) => a.user).filter((u) => u.active);

  const proposed = review.actionItems.filter((a) => a.status === "proposed").length;
  const accepted = review.actionItems.filter((a) => a.status === "accepted").length;

  // ── In-app: all active attendees (muted included) ─────────────────
  let notified = 0;
  try {
    const rows = attendees.map((u) => ({
      userId: u.id,
      type: NOTIFICATION_TYPES.MEETING_REVIEW_READY,
      title: `AI review ready — ${meeting.title}`,
      body:
        proposed > 0
          ? `${proposed} proposed action item${proposed === 1 ? "" : "s"} waiting for review.`
          : "Summary and decisions are ready.",
      link: "/meetings",
    }));
    if (rows.length > 0) {
      const res = await prisma.userNotification.createMany({ data: rows });
      notified = res.count;
    }
  } catch (err) {
    logger.error("meeting-digest: in-app fan-out failed", { recordingId, err });
  }

  // ── Email: active + not muted ─────────────────────────────────────
  const emailRecipients = attendees
    .filter((u) => !u.notificationsMuted && u.email)
    .map((u) => u.email);

  let emailed = 0;
  if (emailRecipients.length > 0) {
    const dateLabel = meeting.date.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Australia/Sydney",
    });

    const decisionsHtml = review.decisions.length
      ? `<p style="margin:16px 0 4px;font-weight:600;">Decisions</p><ul style="margin:4px 0 0;padding-left:20px;">${review.decisions
          .map((d) => `<li style="margin-bottom:4px;">${escapeHtml(d.text)}</li>`)
          .join("")}</ul>`
      : "";

    const cascadesHtml = meeting.cascades.length
      ? `<p style="margin:16px 0 4px;font-weight:600;">Cascading messages</p><ul style="margin:4px 0 0;padding-left:20px;">${meeting.cascades
          .map((c) => `<li style="margin-bottom:4px;">${escapeHtml(c.message)}</li>`)
          .join("")}</ul>`
      : "";

    const actionsLine =
      proposed > 0
        ? `<p style="margin:16px 0 0;"><strong>${proposed}</strong> proposed action item${proposed === 1 ? "" : "s"} ${proposed === 1 ? "is" : "are"} waiting for review${accepted > 0 ? ` (${accepted} already accepted as to-dos)` : ""}.</p>`
        : "";

    const html = baseLayout(`
      <h2 style="margin:0 0 4px;">${escapeHtml(meeting.title)}</h2>
      <p style="margin:0 0 16px;color:#6b7280;">${escapeHtml(dateLabel)} · AI meeting review</p>
      <p style="margin:0;white-space:pre-wrap;">${escapeHtml(review.summary)}</p>
      ${decisionsHtml}
      ${actionsLine}
      ${cascadesHtml}
      <p style="margin:24px 0 0;">${buttonHtml("Open the meeting", `${siteUrl()}/meetings`)}</p>
    `);

    try {
      const result = await sendEmail({
        to: emailRecipients,
        subject: `AI review — ${meeting.title}`,
        html,
      });
      emailed = result.sent.length;
    } catch (err) {
      logger.error("meeting-digest: email send failed", { recordingId, err });
    }
  }

  logger.info("meeting-digest sent", { recordingId, emailed, notified });
  return { sent: true, emailed, notified };
}

/** Fire-and-forget wrapper for pipeline callers — never throws. */
export function sendMeetingDigestSafe(recordingId: string): void {
  sendMeetingDigest(recordingId).catch((err) =>
    logger.error("meeting-digest failed", { recordingId, err }),
  );
}
