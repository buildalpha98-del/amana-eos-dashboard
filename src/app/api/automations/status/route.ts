import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

// ---------------------------------------------------------------------------
// Seat label mapping
// ---------------------------------------------------------------------------

const SEAT_LABELS: Record<string, string> = {
  marketing: "Marketing & Enrolments",
  hr: "People & Compliance",
  ops: "Operations",
  finance: "Finance & Admin",
  programming: "Programming & Quality",
  px: "Parent Experience",
  partnerships: "Partnerships",
};

function seatLabel(seat: string): string {
  return SEAT_LABELS[seat] ?? "Centre-Specific";
}

// ---------------------------------------------------------------------------
// Health calculation
// ---------------------------------------------------------------------------

function calculateHealth(
  lastRunAt: Date | null,
  expectedIntervalHours: number,
): string {
  if (!lastRunAt) return "never_run";
  const hoursSinceRun =
    (Date.now() - lastRunAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceRun <= expectedIntervalHours * 1.5) return "green";
  if (hoursSinceRun <= expectedIntervalHours * 3) return "amber";
  return "red";
}

/**
 * Given an array of timestamps sorted ascending, compute the median interval in hours.
 * Falls back to 168 (weekly) if fewer than 2 data points.
 */
function medianIntervalHours(timestamps: Date[]): number {
  if (timestamps.length < 2) return 168; // default weekly
  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(
      (timestamps[i].getTime() - timestamps[i - 1].getTime()) / (1000 * 60 * 60),
    );
  }
  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  return intervals.length % 2 === 0
    ? (intervals[mid - 1] + intervals[mid]) / 2
    : intervals[mid];
}

// ---------------------------------------------------------------------------
// Time range parsing
// ---------------------------------------------------------------------------

function parseTimeRange(range: string | null): Date {
  const now = new Date();
  switch (range) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "7d":
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskInfo {
  taskKey: string;
  seat: string;
  reportType: string;
  lastRunAt: string | null;
  lastStatus: "success" | "failed";
  runCount: number;
  health: string;
  expectedIntervalHours: number;
  lastTitle: string | null;
  lastMetrics: unknown;
}

interface SeatInfo {
  seat: string;
  label: string;
  taskCount: number;
  green: number;
  amber: number;
  red: number;
  neverRun: number;
  tasks: TaskInfo[];
}

// ---------------------------------------------------------------------------
// GET /api/automations/status
// ---------------------------------------------------------------------------

export const GET = withApiAuth(
  async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const seatFilter = searchParams.get("seat");
    const timeRange = searchParams.get("timeRange");
    const since = parseTimeRange(timeRange);

    // Build where clause
    const where: Record<string, unknown> = {
      createdAt: { gte: since },
    };
    if (seatFilter) where.seat = seatFilter;

    // Fetch all reports in the time range
    const reports = await prisma.coworkReport.findMany({
      where,
      select: {
        seat: true,
        reportType: true,
        title: true,
        content: true,
        metrics: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Group by compound key: seat + reportType
    const taskMap = new Map<
      string,
      {
        seat: string;
        reportType: string;
        runs: Date[];
        lastTitle: string | null;
        lastContent: string | null;
        lastMetrics: unknown;
      }
    >();

    for (const r of reports) {
      const key = `${r.seat}::${r.reportType}`;
      let entry = taskMap.get(key);
      if (!entry) {
        entry = {
          seat: r.seat,
          reportType: r.reportType,
          runs: [],
          lastTitle: null,
          lastContent: null,
          lastMetrics: null,
        };
        taskMap.set(key, entry);
      }
      entry.runs.push(r.createdAt);
      // Always update to latest (runs are sorted asc)
      entry.lastTitle = r.title;
      entry.lastContent = r.content;
      entry.lastMetrics = r.metrics;
    }

    // Build task list with health
    const allTasks: TaskInfo[] = [];
    for (const [key, entry] of taskMap) {
      const lastRunAt = entry.runs[entry.runs.length - 1];
      const expectedInterval = medianIntervalHours(entry.runs);
      const health = calculateHealth(lastRunAt, expectedInterval);
      const lastStatus =
        entry.lastContent && entry.lastContent.length > 0
          ? "success"
          : "failed";

      allTasks.push({
        taskKey: key,
        seat: entry.seat,
        reportType: entry.reportType,
        lastRunAt: lastRunAt.toISOString(),
        lastStatus,
        runCount: entry.runs.length,
        health,
        expectedIntervalHours: Math.round(expectedInterval * 10) / 10,
        lastTitle: entry.lastTitle,
        lastMetrics: entry.lastMetrics,
      });
    }

    // Group by seat
    const seatMap = new Map<string, TaskInfo[]>();
    for (const task of allTasks) {
      const existing = seatMap.get(task.seat) ?? [];
      existing.push(task);
      seatMap.set(task.seat, existing);
    }

    const seats: SeatInfo[] = [];
    let totalGreen = 0;
    let totalAmber = 0;
    let totalRed = 0;
    let totalNeverRun = 0;

    for (const [seat, tasks] of seatMap) {
      const green = tasks.filter((t) => t.health === "green").length;
      const amber = tasks.filter((t) => t.health === "amber").length;
      const red = tasks.filter((t) => t.health === "red").length;
      const neverRun = tasks.filter((t) => t.health === "never_run").length;

      totalGreen += green;
      totalAmber += amber;
      totalRed += red;
      totalNeverRun += neverRun;

      // Sort: red first, then amber, then never_run, then green
      const healthOrder: Record<string, number> = {
        red: 0,
        amber: 1,
        never_run: 2,
        green: 3,
      };
      tasks.sort(
        (a, b) => (healthOrder[a.health] ?? 4) - (healthOrder[b.health] ?? 4),
      );

      seats.push({
        seat,
        label: seatLabel(seat),
        taskCount: tasks.length,
        green,
        amber,
        red,
        neverRun,
        tasks,
      });
    }

    // Sort seats: most critical first
    seats.sort((a, b) => b.red - a.red || b.amber - a.amber);

    return NextResponse.json({
      summary: {
        total: allTasks.length,
        green: totalGreen,
        amber: totalAmber,
        red: totalRed,
        neverRun: totalNeverRun,
      },
      seats,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
