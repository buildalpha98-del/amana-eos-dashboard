import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";

const MILESTONES = [1, 3, 6, 12] as const;

const CHECKIN_QUESTIONS = [
  "How are they settling in?",
  "Any concerns or challenges?",
  "Is their schedule working well?",
  "Are they engaged with professional development?",
  "Would they recommend Amana as an employer?",
];

/**
 * GET /api/cron/retention-checkins
 *
 * Weekly cron (Sunday 8pm AEST) — scans active staff with a startDate
 * and creates check-in Todo items at 1, 3, 6, and 12 month milestones.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("retention-checkins", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();

    // Get all active staff with a start date and service
    const staff = await prisma.user.findMany({
      where: {
        active: true,
        startDate: { not: null },
        serviceId: { not: null },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        serviceId: true,
        // 2026-09-14: the 90-day ramp owns the first three months, so the
        // 1- and 3-month todos are skipped for anyone who has one.
        ramp: { select: { id: true } },
        service: {
          select: {
            id: true,
            name: true,
            managerId: true,
          },
        },
      },
    });

    let created = 0;
    let skipped = 0;

    for (const member of staff) {
      if (!member.startDate || !member.service) continue;

      const startDate = new Date(member.startDate);

      for (const months of MILESTONES) {
        if (member.ramp && months <= 3) {
          skipped++;
          continue;
        }
        // Calculate milestone date
        const milestoneDate = new Date(startDate);
        milestoneDate.setMonth(milestoneDate.getMonth() + months);

        // Check if we're within a 7-day window of the milestone
        const diffMs = milestoneDate.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        // Only create if milestone is within next 7 days (not in the past)
        if (diffDays < -7 || diffDays > 7) continue;

        const titlePattern = `${months}-Month Check-In: ${member.name}`;

        // Deduplication: check if a todo with this title pattern already exists
        const existing = await prisma.todo.findFirst({
          where: {
            title: { contains: titlePattern },
            deleted: false,
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        const dueDate = new Date(milestoneDate);
        dueDate.setDate(dueDate.getDate() + 7);

        const description = [
          `Retention check-in for ${member.name} at ${member.service.name}.`,
          `${months}-month milestone since start date (${startDate.toLocaleDateString("en-AU")}).`,
          "",
          "Check-in questions:",
          ...CHECKIN_QUESTIONS.map((q) => `- ${q}`),
        ].join("\n");

        // Calculate weekOf (Monday of the due week)
        const weekOf = new Date(dueDate);
        weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1);
        if (weekOf > dueDate) weekOf.setDate(weekOf.getDate() - 7);

        await prisma.todo.create({
          data: {
            title: `${titlePattern} at ${member.service.name}`,
            description,
            assigneeId: member.service.managerId || null,
            serviceId: member.service.id,
            dueDate,
            weekOf,
            status: "pending",
          },
        });

        created++;
      }
    }

    await guard.complete({ staffChecked: staff.length, created, skipped });

    return NextResponse.json({
      success: true,
      staffChecked: staff.length,
      todosCreated: created,
      todosSkipped: skipped,
    });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
