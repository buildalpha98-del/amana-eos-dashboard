/**
 * POST /api/induction/backfill — one-time launcher (owner / State Manager).
 *
 * Enrols every active, currently-cleared staffer who has NOT completed the
 * published essential track into those courses, moves them to `in_training`,
 * and gives them a 5-week grace window (they keep working during grace). After
 * grace expires (induction-grace cron), the gate bites. Idempotent: users
 * already in the induction flow are skipped. No-op if no essential courses are
 * published yet.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const GRACE_DAYS = 35; // 5 weeks

export const POST = withApiAuth(
  async (_req, session) => {
    const essentials = await prisma.lMSCourse.findMany({
      where: { track: "essential", status: "published", deleted: false },
      select: { id: true },
    });
    if (essentials.length === 0) {
      return NextResponse.json({
        message: "No published essential courses — nothing to backfill.",
        movedToTraining: 0,
        enrolled: 0,
      });
    }
    const essentialIds = essentials.map((c) => c.id);

    // Candidate users: active + currently cleared (skip anyone already in flow).
    const candidates = await prisma.user.findMany({
      where: { active: true, inductionStatus: "cleared" },
      select: { id: true },
    });

    // Which candidates have already completed ALL published essentials?
    const completedEnrolments = await prisma.lMSEnrollment.findMany({
      where: {
        userId: { in: candidates.map((c) => c.id) },
        courseId: { in: essentialIds },
        status: "completed",
      },
      select: { userId: true, courseId: true },
    });
    const completedByUser = new Map<string, Set<string>>();
    for (const e of completedEnrolments) {
      if (!completedByUser.has(e.userId)) completedByUser.set(e.userId, new Set());
      completedByUser.get(e.userId)!.add(e.courseId);
    }
    const needsBackfill = candidates.filter((c) => {
      const done = completedByUser.get(c.id);
      return !done || essentialIds.some((id) => !done.has(id));
    });

    const graceUntil = new Date(Date.now() + GRACE_DAYS * 86400000);

    // Existing enrolments to dedupe against.
    const existing = await prisma.lMSEnrollment.findMany({
      where: {
        userId: { in: needsBackfill.map((u) => u.id) },
        courseId: { in: essentialIds },
      },
      select: { userId: true, courseId: true },
    });
    const existingSet = new Set(existing.map((e) => `${e.userId}:${e.courseId}`));

    let enrolled = 0;
    for (const user of needsBackfill) {
      await prisma.user.update({
        where: { id: user.id },
        data: { inductionStatus: "in_training", inductionGraceUntil: graceUntil },
      });
      for (const courseId of essentialIds) {
        if (existingSet.has(`${user.id}:${courseId}`)) continue;
        try {
          await prisma.lMSEnrollment.create({
            data: { userId: user.id, courseId, status: "enrolled", dueDate: graceUntil },
          });
          enrolled++;
        } catch {
          // Unique clash — already enrolled; ignore.
        }
      }
    }

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "induction.backfill",
        entityType: "User",
        entityId: session!.user.id,
        details: { movedToTraining: needsBackfill.length, enrolled, graceDays: GRACE_DAYS },
      },
    });

    return NextResponse.json({
      message: "Backfill complete.",
      movedToTraining: needsBackfill.length,
      enrolled,
      graceUntil,
    });
  },
  { roles: ["owner", "head_office"] },
);
