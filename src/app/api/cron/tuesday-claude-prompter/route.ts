import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { getFocusAvatarForWeek, getFocusAvatarSlimForWeek } from "@/lib/avatar-focus-rotation";
import { buildTuesdayPrompts, bundlePromptBody } from "@/lib/tuesday-prompts";

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
  return monday.toISOString().slice(0, 10);
}

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("tuesday-claude-prompter", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const weekKey = isoWeekKey(now);

    const focus = await getFocusAvatarForWeek(now);
    if (!focus) {
      const slim = await getFocusAvatarSlimForWeek(now);
      if (slim) {
        await guard.complete({ skipped: true, reason: "no avatar for focus service", weekKey, focus: slim });
        return NextResponse.json({ skipped: true, reason: "no avatar for focus service", focus: slim });
      }
      await guard.complete({ skipped: true, reason: "no active services" });
      return NextResponse.json({ skipped: true, reason: "no active services" });
    }

    const akram = await prisma.user.findFirst({
      where: { role: "marketing", active: true },
      select: { id: true },
    });
    if (!akram) {
      await guard.complete({ skipped: true, reason: "no marketing user" });
      return NextResponse.json({ skipped: true, reason: "no marketing user" });
    }

    // De-dupe per week (the weekly lock alone isn't enough if the run partially failed before)
    const existing = await prisma.aiTaskDraft.findFirst({
      where: {
        source: "tuesday-prompter",
        targetId: weekKey,
        status: "ready",
      },
      select: { id: true },
    });
    if (existing) {
      await guard.complete({ skipped: true, reason: "already drafted for week", weekKey });
      return NextResponse.json({ skipped: true, reason: "already drafted for week", weekKey });
    }

    const prompts = await buildTuesdayPrompts(focus, now);
    const body = bundlePromptBody(focus.serviceName, prompts);

    const draft = await prisma.aiTaskDraft.create({
      data: {
        source: "tuesday-prompter",
        targetId: weekKey,
        taskType: "research",
        title: `Tuesday ideation: 4 prompts for ${focus.serviceName}`,
        content: body,
        metadata: {
          kind: "tuesday_prompter",
          weekKey,
          serviceId: focus.serviceId,
          serviceName: focus.serviceName,
          avatarId: focus.avatarId,
        },
        status: "ready",
        model: "system",
      },
      select: { id: true },
    });

    await guard.complete({ draftId: draft.id, weekKey, focus: focus.serviceName });
    return NextResponse.json({
      message: "Tuesday prompts drafted",
      draftId: draft.id,
      weekKey,
      focus: { serviceId: focus.serviceId, serviceName: focus.serviceName },
    });
  } catch (err) {
    logger.error("tuesday-claude-prompter failed", { err });
    await guard.fail(err);
    throw err;
  }
});
