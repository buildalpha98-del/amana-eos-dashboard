import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { acquireCronLock } from "@/lib/cron-guard";

/**
 * GET /api/cron/attendance-anomaly
 *
 * Daily cron — compares recent attendance against 13-week rolling averages
 * per service/session type, flags anomalies via AI analysis.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("attendance-anomaly", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const ai = getAI();
    if (!ai) {
      await guard.fail("AI not configured");
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const thirteenWeeksAgo = new Date(now.getTime() - 91 * 86400000);

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, capacity: true },
    });

    const template = await prisma.aiPromptTemplate.findUnique({
      where: { slug: "attendance/anomaly-detection" },
    });

    if (!template) {
      await guard.fail("Template not found");
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    let totalAnomalies = 0;
    const highSeverityAlerts: string[] = [];

    for (const service of services) {
      // Get this week's attendance
      const weekRecords = await prisma.dailyAttendance.findMany({
        where: { serviceId: service.id, date: { gte: weekAgo } },
        orderBy: { date: "asc" },
      });

      if (weekRecords.length === 0) continue;

      // Get 13-week historical data for averages
      const historicalRecords = await prisma.dailyAttendance.findMany({
        where: {
          serviceId: service.id,
          date: { gte: thirteenWeeksAgo, lt: weekAgo },
        },
      });

      // Build week data text
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const weekData = weekRecords
        .map((r) => {
          const day = dayNames[new Date(r.date).getDay()];
          return `${day} | ${r.sessionType} | ${r.enrolled} | ${r.attended} | ${r.capacity}`;
        })
        .join("\n");

      // Calculate historical averages by session type
      const avgBySession: Record<string, { enrolled: number; attended: number; count: number }> = {};
      for (const r of historicalRecords) {
        if (!avgBySession[r.sessionType]) {
          avgBySession[r.sessionType] = { enrolled: 0, attended: 0, count: 0 };
        }
        avgBySession[r.sessionType].enrolled += r.enrolled;
        avgBySession[r.sessionType].attended += r.attended;
        avgBySession[r.sessionType].count++;
      }

      const historicalAverage =
        Object.entries(avgBySession)
          .map(
            ([session, data]) =>
              `${session} | ${(data.enrolled / data.count).toFixed(1)} | ${(data.attended / data.count).toFixed(1)}`,
          )
          .join("\n") || "No historical data.";

      let prompt = template.promptTemplate;
      prompt = prompt.replaceAll("{{serviceName}}", service.name);
      prompt = prompt.replaceAll("{{weekData}}", weekData);
      prompt = prompt.replaceAll("{{historicalAverage}}", historicalAverage);
      prompt = prompt.replaceAll("{{capacity}}", String(service.capacity ?? "Unknown"));

      const response = await ai.messages.create({
        model: template.model,
        max_tokens: template.maxTokens,
        system: AMANA_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "";

      let parsed: {
        anomalies?: Array<{
          day: string;
          sessionType: string;
          type: string;
          severity: string;
          message: string;
          expected?: number;
          actual?: number;
        }>;
        summary?: string;
      } = { anomalies: [] };
      try {
        parsed = JSON.parse(text);
      } catch {
        continue; // Skip if AI returns invalid JSON
      }

      // Save anomalies
      if (parsed.anomalies && parsed.anomalies.length > 0) {
        for (const a of parsed.anomalies) {
          await prisma.attendanceAnomaly.create({
            data: {
              serviceId: service.id,
              date: now,
              sessionType: a.sessionType || "unknown",
              anomalyType: a.type,
              severity: a.severity,
              message: a.message,
              expected: a.expected ?? null,
              actual: a.actual ?? null,
            },
          });
          totalAnomalies++;
          if (a.severity === "high") {
            highSeverityAlerts.push(`${service.name}: ${a.message}`);
          }
        }
      }
    }

    // Create CoworkReport if anomalies found
    if (totalAnomalies > 0) {
      const adminUser = await prisma.user.findFirst({
        where: { role: { in: ["owner", "admin"] }, active: true },
        select: { id: true },
      });

      const reportContent =
        highSeverityAlerts.length > 0
          ? `## High Severity Anomalies\n\n${highSeverityAlerts.map((a) => `- **${a}**`).join("\n")}\n\n---\n\n${totalAnomalies} total anomalies detected across ${services.length} centres. Review individual centre attendance tabs for details.`
          : `${totalAnomalies} attendance anomalies detected across ${services.length} centres. No high-severity issues — review at your convenience.`;

      await prisma.coworkReport.create({
        data: {
          seat: "operations",
          reportType: "attendance-anomaly",
          title: `Attendance Anomaly Report — ${now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
          content: reportContent,
          metrics: {
            totalAnomalies,
            highSeverity: highSeverityAlerts.length,
            centresScanned: services.length,
          },
          alerts:
            highSeverityAlerts.length > 0
              ? [{ level: "warning", message: `${highSeverityAlerts.length} high-severity attendance anomaly(ies)` }]
              : undefined,
          assignedToId: adminUser?.id,
        },
      });
    }

    await guard.complete({ totalAnomalies, centresScanned: services.length });

    return NextResponse.json({ success: true, totalAnomalies, centresScanned: services.length });
  } catch (err) {
    await guard.fail(err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json({ error: "Failed to run attendance anomaly detection" }, { status: 500 });
  }
}
