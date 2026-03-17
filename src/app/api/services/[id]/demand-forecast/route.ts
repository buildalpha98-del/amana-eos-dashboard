import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { Prisma } from "@prisma/client";

/**
 * GET /api/services/[id]/demand-forecast
 *
 * Generates an AI-powered enrolment demand forecast for a specific service.
 * Gathers 13 weeks of attendance data + 90 days of enquiry data,
 * sends to AI for analysis, and returns the forecast.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id: serviceId } = await params;

  // ── Load service ────────────────────────────────────────────
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true, code: true, capacity: true },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // ── Load AI ─────────────────────────────────────────────────
  const ai = getAI();
  if (!ai) {
    return NextResponse.json(
      { error: "AI is not configured. Set ANTHROPIC_API_KEY environment variable." },
      { status: 503 },
    );
  }

  // ── Load prompt template ────────────────────────────────────
  const template = await prisma.aiPromptTemplate.findUnique({
    where: { slug: "services/demand-forecast" },
  });

  if (!template || !template.active) {
    return NextResponse.json(
      { error: "Demand forecast template not found or disabled" },
      { status: 404 },
    );
  }

  // ── Gather 13 weeks of attendance data ──────────────────────
  const thirteenWeeksAgo = new Date();
  thirteenWeeksAgo.setDate(thirteenWeeksAgo.getDate() - 91);

  const attendanceRecords = await prisma.dailyAttendance.findMany({
    where: {
      serviceId,
      date: { gte: thirteenWeeksAgo },
    },
    orderBy: { date: "asc" },
  });

  // Group attendance by ISO week
  const weeklyAttendance: Record<
    string,
    { bscEnrolled: number[]; bscAttended: number[]; ascEnrolled: number[]; ascAttended: number[] }
  > = {};

  for (const rec of attendanceRecords) {
    const d = new Date(rec.date);
    const weekStart = getWeekStart(d);
    const weekKey = weekStart.toISOString().split("T")[0];

    if (!weeklyAttendance[weekKey]) {
      weeklyAttendance[weekKey] = {
        bscEnrolled: [],
        bscAttended: [],
        ascEnrolled: [],
        ascAttended: [],
      };
    }

    const week = weeklyAttendance[weekKey];
    if (rec.sessionType === "bsc") {
      week.bscEnrolled.push(rec.enrolled);
      week.bscAttended.push(rec.attended);
    } else if (rec.sessionType === "asc") {
      week.ascEnrolled.push(rec.enrolled);
      week.ascAttended.push(rec.attended);
    }
  }

  const attendanceTrend = Object.entries(weeklyAttendance)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => {
      const avg = (arr: number[]) =>
        arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
      return `${week}: BSC avg enrolled=${avg(data.bscEnrolled)}, attended=${avg(data.bscAttended)} | ASC avg enrolled=${avg(data.ascEnrolled)}, attended=${avg(data.ascAttended)}`;
    })
    .join("\n") || "No attendance data available";

  // ── Gather 90 days of enquiry data ──────────────────────────
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const enquiries = await prisma.parentEnquiry.findMany({
    where: {
      serviceId,
      createdAt: { gte: ninetyDaysAgo },
    },
    select: { createdAt: true, stage: true },
    orderBy: { createdAt: "asc" },
  });

  // Group enquiries by week
  const weeklyEnquiries: Record<string, number> = {};
  for (const enq of enquiries) {
    const weekStart = getWeekStart(new Date(enq.createdAt));
    const weekKey = weekStart.toISOString().split("T")[0];
    weeklyEnquiries[weekKey] = (weeklyEnquiries[weekKey] || 0) + 1;
  }

  const enquiryTrend = Object.entries(weeklyEnquiries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => `${week}: ${count} enquiries`)
    .join("\n") || "No enquiries in the last 90 days";

  // ── Current enrolment snapshot ──────────────────────────────
  const today = new Date();
  const thisWeekStart = getWeekStart(today);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 5);

  const currentWeekRecords = await prisma.dailyAttendance.findMany({
    where: {
      serviceId,
      date: { gte: thisWeekStart, lte: thisWeekEnd },
    },
  });

  const bscEnrolled = currentWeekRecords
    .filter((r) => r.sessionType === "bsc")
    .map((r) => r.enrolled);
  const ascEnrolled = currentWeekRecords
    .filter((r) => r.sessionType === "asc")
    .map((r) => r.enrolled);

  const avgBsc = bscEnrolled.length
    ? Math.round(bscEnrolled.reduce((s, v) => s + v, 0) / bscEnrolled.length)
    : 0;
  const avgAsc = ascEnrolled.length
    ? Math.round(ascEnrolled.reduce((s, v) => s + v, 0) / ascEnrolled.length)
    : 0;

  const totalActiveEnquiries = await prisma.parentEnquiry.count({
    where: {
      serviceId,
      stage: { in: ["new_enquiry", "info_sent", "nurturing", "form_started"] },
    },
  });

  const enrolmentSnapshot = [
    `Average BSC permanent this week: ${avgBsc}`,
    `Average ASC permanent this week: ${avgAsc}`,
    `Active enquiries in pipeline: ${totalActiveEnquiries}`,
    `Capacity: ${service.capacity ?? "Not set"}`,
  ].join("\n");

  // ── Build prompt ────────────────────────────────────────────
  let prompt = template.promptTemplate;
  const variables: Record<string, string> = {
    centreName: `${service.name} (${service.code})`,
    capacity: String(service.capacity ?? "Not set"),
    attendanceTrend,
    enquiryTrend,
    enrolmentSnapshot,
  };

  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value);
  }

  // ── Call AI ─────────────────────────────────────────────────
  const startTime = Date.now();

  try {
    const response = await ai.messages.create({
      model: template.model,
      max_tokens: template.maxTokens,
      system: AMANA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected AI response format" },
        { status: 500 },
      );
    }

    const durationMs = Date.now() - startTime;

    // Log usage
    await prisma.aiUsage.create({
      data: {
        userId: session!.user.id,
        templateSlug: "services/demand-forecast",
        model: template.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs,
        section: "services",
        metadata: { serviceId, serviceName: service.name } as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      forecast: block.text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs,
        model: template.model,
      },
      context: {
        weeksOfData: Object.keys(weeklyAttendance).length,
        enquiriesAnalyzed: enquiries.length,
        activeEnquiries: totalActiveEnquiries,
      },
    });
  } catch (err) {
    console.error("Demand forecast generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Forecast generation failed" },
      { status: 500 },
    );
  }
}

/** Get the Monday of the week for a given date */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
