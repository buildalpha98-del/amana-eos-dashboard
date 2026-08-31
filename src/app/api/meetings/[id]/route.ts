import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { getCurrentQuarter } from "@/lib/utils";
import { notifyCascadePublished } from "@/lib/cascade-notify";

const updateMeetingSchema = z.object({
  // 2026-08-31: "start" flips a scheduled meeting to in_progress via a
  // status-guarded updateMany (409 on a lost race / double click).
  action: z.literal("start").optional(),
  title: z.string().min(1).optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  currentSection: z.number().min(0).max(6).optional(),
  rating: z.number().min(1).max(10).optional().nullable(),
  notes: z.string().optional().nullable(),
  headlines: z.string().optional().nullable(),
  segueNotes: z.string().optional().nullable(),
  concludeNotes: z.string().optional().nullable(),
  cascadeMessages: z.string().optional().nullable(),
  serviceIds: z.array(z.string()).optional(),
  rockIds: z.array(z.string()).optional(),
  attendeeUpdates: z.array(z.object({
    userId: z.string(),
    status: z.enum(["present", "absent"]).optional(),
    rating: z.number().min(1).max(10).optional(),
  })).optional(),
});

// GET /api/meetings/:id — get a single meeting
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatar: true } },
      cascades: {
        where: { deleted: false },
        orderBy: { createdAt: "desc" },
      },
      attendees: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" as const },
      },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  return NextResponse.json(meeting);
});

// PATCH /api/meetings/:id — update a meeting
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateMeetingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Start a scheduled meeting. Handled first and returned early — the
  // guarded updateMany is the race protection (two devices, double click).
  if (parsed.data.action === "start") {
    const claimed = await prisma.meeting.updateMany({
      where: { id, status: "scheduled" },
      data: { status: "in_progress", startedAt: new Date() },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "Meeting already started or not scheduled" },
        { status: 409 },
      );
    }
    const started = await prisma.meeting.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatar: true } },
        cascades: { where: { deleted: false }, orderBy: { createdAt: "desc" } },
        attendees: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" as const },
        },
      },
    });
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "start",
        entityType: "Meeting",
        entityId: id,
      },
    });
    return NextResponse.json(started);
  }

  const existing = await prisma.meeting.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Auto-set completedAt when status changes to completed
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { attendeeUpdates: _attendeeUpdates, action: _action, ...restData } = parsed.data;
  const updateData: Record<string, unknown> = { ...restData };
  if (parsed.data.status === "completed" && !existing.completedAt) {
    updateData.completedAt = new Date();
  }

  // Process attendee updates before computing rating
  if (parsed.data.attendeeUpdates?.length) {
    for (const au of parsed.data.attendeeUpdates) {
      await prisma.meetingAttendee.upsert({
        where: { meetingId_userId: { meetingId: id, userId: au.userId } },
        update: {
          ...(au.status !== undefined ? { status: au.status as any } : {}),
          ...(au.rating !== undefined ? { rating: au.rating } : {}),
        },
        create: {
          meetingId: id,
          userId: au.userId,
          status: (au.status || "present") as any,
          rating: au.rating,
        },
      });
    }
  }

  // When completing, compute average rating from attendees
  if (parsed.data.status === "completed" && existing.status !== "completed") {
    const attendeeRatings = await prisma.meetingAttendee.findMany({
      where: { meetingId: id, rating: { not: null } },
    });
    if (attendeeRatings.length > 0) {
      const avg = attendeeRatings.reduce((sum, a) => sum + (a.rating || 0), 0) / attendeeRatings.length;
      updateData.rating = Math.round(avg * 10) / 10;
    }

    // 2026-08-31: write-once outcome snapshot, so past meetings stop
    // recomputing "issues solved" etc. from live data. Guarded on
    // !existing.outcomes — the status transition alone isn't write-once
    // (a meeting PATCHed back to in_progress and re-completed would
    // otherwise overwrite the original snapshot).
    if (!existing.outcomes) {
      const windowStart = existing.startedAt ?? existing.createdAt;
      const windowEnd = new Date();
      const scope =
        existing.serviceIds.length > 0
          ? { serviceId: { in: existing.serviceIds } }
          : {};
      // Candidate todos deliberately mirror the in-meeting To-Do Review
      // list: attendee filter when attendees exist, service scope as the
      // fallback (see ActiveMeetingView's todos memo).
      const attendeeRows = await prisma.meetingAttendee.findMany({
        where: { meetingId: id },
        select: { userId: true },
      });
      const attendeeIds = attendeeRows.map((a) => a.userId);
      const todoWhere =
        attendeeIds.length > 0
          ? { deleted: false, assigneeId: { in: attendeeIds } }
          : { deleted: false, ...scope };
      const [todosCompleted, todosOpen, solvedIssues, rocks] = await Promise.all([
        prisma.todo.count({
          where: {
            ...todoWhere,
            status: "complete",
            completedAt: { gte: windowStart, lte: windowEnd },
          },
        }),
        prisma.todo.count({
          where: { ...todoWhere, status: { in: ["pending", "in_progress"] } },
        }),
        prisma.issue.findMany({
          where: {
            deleted: false,
            status: "solved",
            solvedAt: { gte: windowStart, lte: windowEnd },
            ...scope,
          },
          select: { id: true },
        }),
        prisma.rock.findMany({
          where: { deleted: false, quarter: getCurrentQuarter(), ...scope },
          select: { status: true },
        }),
      ]);
      const todosTotal = todosCompleted + todosOpen;
      updateData.outcomes = {
        todosCompleted,
        todosTotal,
        completionPct:
          todosTotal > 0 ? Math.round((todosCompleted / todosTotal) * 100) : 0,
        issuesSolvedIds: solvedIssues.map((i) => i.id),
        rocksOnTrack: rocks.filter(
          (r) => r.status === "on_track" || r.status === "complete",
        ).length,
        rocksTotal: rocks.length,
        avgRating:
          (updateData.rating as number | undefined) ?? existing.rating ?? null,
        capturedAt: windowEnd.toISOString(),
      };
    }
  }

  const meeting = await prisma.meeting.update({
    where: { id },
    data: updateData,
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatar: true } },
      cascades: {
        where: { deleted: false },
        orderBy: { createdAt: "desc" },
      },
      attendees: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" as const },
      },
    },
  });

  // When meeting is completed, create CascadeMessage records from the text
  if (
    parsed.data.status === "completed" &&
    existing.status !== "completed" &&
    parsed.data.cascadeMessages
  ) {
    const lines = parsed.data.cascadeMessages
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    if (lines.length > 0) {
      await prisma.cascadeMessage.createMany({
        data: lines.map((line: string) => ({
          meetingId: id,
          message: line.replace(/^[-•*]\s*/, ""), // Strip bullet markers
        })),
      });
      // One notification per publish batch, not per line.
      await notifyCascadePublished(prisma, {
        meetingTitle: meeting.title,
        count: lines.length,
        excludeUserId: session!.user.id,
      });
    }
  }

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Meeting",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(meeting);
  // 2026-08-31: marketing added — POST has allowed marketing since
  // 2026-06-03 (the marketing pod runs its own L10), but PATCH never did,
  // so they could create a meeting they couldn't save progress on, and
  // with scheduling they'd create meetings they could never start.
}, { roles: ["owner", "head_office", "admin", "marketing", "eos_implementer"] });

// DELETE /api/meetings/:id — remove a meeting outright.
//
// 2026-07-28, per Daniel: "should we also be able to delete meetings in
// case I started an incorrect meeting?" Scoped to owner/admin because this
// is destructive and unrecoverable: attendees and cascade messages are
// removed with it via onDelete: Cascade, taking their ratings and notes.
// Todos, rocks and issues are NOT touched — they're only referenced by a
// meeting, never owned by one, so deleting a mis-started meeting can't
// destroy real work.
export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id } = await (context!.params as Promise<{ id: string }>);

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      date: true,
      status: true,
      _count: { select: { attendees: true, cascades: true } },
    },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Log BEFORE the delete so the audit trail survives it — the row (and
  // everything cascading off it) is gone immediately after.
  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Meeting",
      entityId: id,
      details: {
        title: meeting.title,
        date: meeting.date.toISOString(),
        status: meeting.status,
        attendeeCount: meeting._count.attendees,
        cascadeCount: meeting._count.cascades,
      },
    },
  });

  await prisma.meeting.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}, { roles: ["owner", "admin"] });
