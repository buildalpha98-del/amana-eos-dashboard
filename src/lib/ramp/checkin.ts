/**
 * Weekly check-in submission (public, token-addressed) and the low-mood /
 * needs-help alert fan-out to the ramp watchers.
 */
import type { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { notifyUsers } from "@/lib/notify-user";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { RAMP_MOOD_ALERT_THRESHOLD } from "./constants";
import { sendRampFlagEmail } from "./emails";
import { resolveRampWatchers } from "./recipients";

export interface CheckInAnswers {
  mood: number;
  wentWell: string | null;
  struggling: string | null;
  needsHelp: boolean;
  helpDetail: string | null;
}

export function shouldFlagCheckIn(a: Pick<CheckInAnswers, "mood" | "needsHelp">): boolean {
  return a.needsHelp || a.mood <= RAMP_MOOD_ALERT_THRESHOLD;
}

export async function submitRampCheckIn(
  db: PrismaClient,
  token: string,
  answers: CheckInAnswers,
): Promise<{ alreadySubmitted: boolean; flagged: boolean }> {
  const checkIn = await db.rampCheckIn.findUnique({
    where: { token },
    include: { ramp: { include: { user: { select: { id: true, name: true } } } } },
  });
  if (!checkIn) return Promise.reject(new Error("not_found"));
  if (checkIn.submittedAt) return { alreadySubmitted: true, flagged: false };

  const now = new Date();
  const flag = shouldFlagCheckIn(answers);

  await db.rampCheckIn.update({
    where: { id: checkIn.id },
    data: {
      submittedAt: now,
      mood: answers.mood,
      wentWell: answers.wentWell,
      struggling: answers.struggling,
      needsHelp: answers.needsHelp,
      helpDetail: answers.helpDetail,
      flaggedAt: flag ? now : null,
    },
  });

  if (flag) {
    try {
      const starter = checkIn.ramp.user;
      const watchers = await resolveRampWatchers(db, starter.id);
      await notifyUsers(db, watchers.map((w) => w.id), {
        type: NOTIFICATION_TYPES.RAMP_CHECKIN_FLAGGED,
        title: `${starter.name} flagged their week ${checkIn.weekNumber} check-in`,
        body: answers.needsHelp
          ? `They asked for help${answers.helpDetail ? `: ${answers.helpDetail.slice(0, 120)}` : ""}`
          : `Mood ${answers.mood}/5 — please reach out today`,
        link: `/staff/${starter.id}#section-ramp`,
      });
      for (const w of watchers) {
        await sendRampFlagEmail({
          to: w,
          starterName: starter.name,
          starterUserId: starter.id,
          weekNumber: checkIn.weekNumber,
          mood: answers.mood,
          needsHelp: answers.needsHelp,
          helpDetail: answers.helpDetail,
          struggling: answers.struggling,
        });
      }
    } catch (err) {
      logger.error("ramp check-in flag fan-out failed", { err, checkInId: checkIn.id });
    }
  }

  return { alreadySubmitted: false, flagged: flag };
}
