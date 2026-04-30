import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ContentTeamStatus } from "@prisma/client";
import { resolveAllMilestones } from "@/lib/content-team-milestones";

const DAY_MS = 24 * 60 * 60 * 1000;
const FOUR_WEEKS_MS = 28 * DAY_MS;

const HIRED_STATUSES: ContentTeamStatus[] = [
  ContentTeamStatus.hired,
  ContentTeamStatus.onboarding,
  ContentTeamStatus.active,
];

export const GET = withApiAuth(
  async () => {
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - FOUR_WEEKS_MS);
    const oneWeekAgo = new Date(now.getTime() - 7 * DAY_MS);

    const members = await prisma.user.findMany({
      where: { contentTeamRole: { not: null } },
      orderBy: [{ contentTeamStatus: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        contentTeamRole: true,
        contentTeamStatus: true,
        contentTeamStartedAt: true,
        contentTeamPausedAt: true,
        contentTeamPauseReason: true,
      },
    });

    const memberIds = members.map((m) => m.id);

    const [postsThisWeek, postsLast4Weeks, activeTasks] = await Promise.all([
      prisma.marketingPost.groupBy({
        by: ["assigneeId"],
        where: {
          deleted: false,
          assigneeId: { in: memberIds },
          createdAt: { gte: oneWeekAgo },
        },
        _count: { _all: true },
      }),
      prisma.marketingPost.groupBy({
        by: ["assigneeId"],
        where: {
          deleted: false,
          assigneeId: { in: memberIds },
          createdAt: { gte: fourWeeksAgo },
        },
        _count: { _all: true },
      }),
      prisma.marketingTask.groupBy({
        by: ["assigneeId"],
        where: {
          deleted: false,
          assigneeId: { in: memberIds },
          status: { in: ["todo", "in_progress", "in_review"] },
        },
        _count: { _all: true },
      }),
    ]);

    const countOf = (entry: { _count: { _all?: number } | unknown }): number => {
      const c = entry._count as { _all?: number };
      return typeof c?._all === "number" ? c._all : 0;
    };
    const thisWeekMap = new Map(postsThisWeek.map((p) => [p.assigneeId, countOf(p)]));
    const last4WeeksMap = new Map(postsLast4Weeks.map((p) => [p.assigneeId, countOf(p)]));
    const activeTaskMap = new Map(activeTasks.map((p) => [p.assigneeId, countOf(p)]));

    const serialised = members.map((m) => {
      const startedAt = m.contentTeamStartedAt;
      const weeksWithTeam = startedAt ? Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / (7 * DAY_MS))) : 0;
      const last4 = last4WeeksMap.get(m.id) ?? 0;
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        active: m.active,
        contentTeamRole: m.contentTeamRole,
        contentTeamStatus: m.contentTeamStatus,
        contentTeamStartedAt: startedAt?.toISOString() ?? null,
        contentTeamPausedAt: m.contentTeamPausedAt?.toISOString() ?? null,
        contentTeamPauseReason: m.contentTeamPauseReason,
        weeksWithTeam,
        outputThisWeek: thisWeekMap.get(m.id) ?? 0,
        outputLast4Weeks: last4,
        avgWeeklyOutput: Math.round((last4 / 4) * 10) / 10,
        activeTaskCount: activeTaskMap.get(m.id) ?? 0,
      };
    });

    const milestoneMembers = members.map((m) => ({
      contentTeamRole: m.contentTeamRole,
      contentTeamStatus: m.contentTeamStatus,
    }));
    const { resetStartDate, milestones } = resolveAllMilestones(milestoneMembers, now);

    return NextResponse.json({
      members: serialised,
      hiringMilestones: milestones,
      resetStartDate,
      hiredStatuses: HIRED_STATUSES,
      outputSignal: "marketing_post_assignee_created",
    });
  },
  { roles: ["marketing", "owner"] },
);
