import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { acquireCronLock } from "@/lib/cron-guard";

const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

interface MissingChecklist {
  serviceName: string;
  serviceCode: string;
  sessionType: string;
  status: string; // "missing" | "pending" | "in_progress"
}

function buildManagerEmail(
  managerName: string,
  missing: MissingChecklist[],
  dateLabel: string,
): { subject: string; html: string } {
  const subject = `Checklist audit: ${missing.length} incomplete for ${dateLabel}`;

  const rows = missing
    .map((m) => {
      const statusColor =
        m.status === "missing"
          ? "#dc2626"
          : m.status === "pending"
          ? "#f59e0b"
          : "#3b82f6";
      const statusLabel =
        m.status === "missing"
          ? "Not Started"
          : m.status === "pending"
          ? "Pending"
          : "In Progress";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${m.serviceName} (${m.serviceCode})</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${m.sessionType.toUpperCase()}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="color:${statusColor};font-weight:600;">${statusLabel}</span>
          </td>
        </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${BRAND_COLOR};padding:24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:20px;">Amana OSHC</h1>
      </div>
      <div style="padding:24px;background:#ffffff;">
        <p style="margin:0 0 16px;">Hi ${managerName},</p>
        <p style="margin:0 0 16px;">The following checklists for <strong>${dateLabel}</strong> have not been completed:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:${BRAND_COLOR};color:#ffffff;">
              <th style="padding:8px 12px;text-align:left;">Service</th>
              <th style="padding:8px 12px;text-align:left;">Session</th>
              <th style="padding:8px 12px;text-align:left;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:16px 0;">Please ensure all daily checklists are completed before end of day.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${DASHBOARD_URL}/services" style="display:inline-block;padding:12px 24px;background:${ACCENT_COLOR};color:${BRAND_COLOR};font-weight:600;text-decoration:none;border-radius:6px;">View Services Dashboard</a>
        </div>
      </div>
      <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
        Amana OSHC &mdash; Daily Checklist Audit
      </div>
    </div>`;

  return { subject, html };
}

function buildAdminSummaryEmail(
  allMissing: MissingChecklist[],
  completedCount: number,
  totalExpected: number,
  dateLabel: string,
): { subject: string; html: string } {
  const completionRate =
    totalExpected > 0
      ? Math.round((completedCount / totalExpected) * 100)
      : 100;

  const subject = `[Admin] Checklist audit: ${completionRate}% completion for ${dateLabel}`;

  const byService = new Map<string, MissingChecklist[]>();
  for (const m of allMissing) {
    const key = `${m.serviceName} (${m.serviceCode})`;
    if (!byService.has(key)) byService.set(key, []);
    byService.get(key)!.push(m);
  }

  const serviceRows = Array.from(byService.entries())
    .map(
      ([name, items]) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${items.map((i) => i.sessionType.toUpperCase()).join(", ")}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">
          <span style="color:#dc2626;font-weight:600;">${items.length} missing</span>
        </td>
      </tr>`,
    )
    .join("");

  const rateColor =
    completionRate >= 90
      ? "#16a34a"
      : completionRate >= 70
      ? "#f59e0b"
      : "#dc2626";

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${BRAND_COLOR};padding:24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:20px;">Amana OSHC &mdash; Admin Summary</h1>
      </div>
      <div style="padding:24px;background:#ffffff;">
        <h2 style="margin:0 0 16px;font-size:18px;">Checklist Audit &mdash; ${dateLabel}</h2>
        <div style="display:flex;gap:12px;margin-bottom:20px;">
          <div style="flex:1;padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#16a34a;">${completedCount}</div>
            <div style="font-size:12px;color:#6b7280;">Completed</div>
          </div>
          <div style="flex:1;padding:12px;background:#fef2f2;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#dc2626;">${allMissing.length}</div>
            <div style="font-size:12px;color:#6b7280;">Incomplete</div>
          </div>
          <div style="flex:1;padding:12px;background:#f9fafb;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:${rateColor};">${completionRate}%</div>
            <div style="font-size:12px;color:#6b7280;">Rate</div>
          </div>
        </div>
        ${allMissing.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:${BRAND_COLOR};color:#ffffff;">
              <th style="padding:6px 10px;text-align:left;">Service</th>
              <th style="padding:6px 10px;text-align:left;">Sessions</th>
              <th style="padding:6px 10px;text-align:left;">Status</th>
            </tr>
          </thead>
          <tbody>${serviceRows}</tbody>
        </table>` : `<p style="color:#16a34a;font-weight:600;">All checklists completed!</p>`}
        <div style="text-align:center;margin:24px 0;">
          <a href="${DASHBOARD_URL}/services" style="display:inline-block;padding:12px 24px;background:${ACCENT_COLOR};color:${BRAND_COLOR};font-weight:600;text-decoration:none;border-radius:6px;">View Services Dashboard</a>
        </div>
      </div>
      <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
        Amana OSHC &mdash; Checklist Audit (Admin)
      </div>
    </div>`;

  return { subject, html };
}

/**
 * GET /api/cron/checklist-audit
 *
 * Daily cron (7 PM AEST / 09:00 UTC) — audits daily checklist
 * completion for BSC and ASC sessions across all active services.
 * Sends per-manager and admin summary emails.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("checklist-audit", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    // Today's date range
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const dateLabel = now.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Get all active services
    const services = await prisma.service.findMany({
      where: { status: "active" },
      include: {
        manager: { select: { id: true, name: true, email: true, active: true } },
      },
    });

    // Expected session types to check
    const expectedSessions = ["bsc", "asc"] as const;

    // Get all checklists for today
    const checklists = await prisma.dailyChecklist.findMany({
      where: {
        date: { gte: todayStart, lte: todayEnd },
      },
      select: {
        serviceId: true,
        sessionType: true,
        status: true,
      },
    });

    // Build lookup: serviceId-sessionType -> status
    const checklistMap = new Map<string, string>();
    for (const cl of checklists) {
      checklistMap.set(`${cl.serviceId}-${cl.sessionType}`, cl.status);
    }

    const allMissing: MissingChecklist[] = [];
    let completedCount = 0;
    const totalExpected = services.length * expectedSessions.length;

    for (const service of services) {
      for (const session of expectedSessions) {
        const key = `${service.id}-${session}`;
        const status = checklistMap.get(key);

        if (status === "completed") {
          completedCount++;
        } else {
          allMissing.push({
            serviceName: service.name,
            serviceCode: service.code,
            sessionType: session,
            status: status || "missing",
          });
        }
      }
    }

    let emailsSent = 0;
    const errors: string[] = [];

    if (allMissing.length > 0) {
      // Group by manager and send per-manager emails
      const byManager = new Map<
        string,
        { name: string; email: string; missing: MissingChecklist[] }
      >();

      for (const item of allMissing) {
        const service = services.find((s) => s.code === item.serviceCode);
        if (!service?.manager || !service.manager.active) continue;

        const mgr = service.manager;
        if (!byManager.has(mgr.id)) {
          byManager.set(mgr.id, {
            name: mgr.name,
            email: mgr.email,
            missing: [],
          });
        }
        byManager.get(mgr.id)!.missing.push(item);
      }

      for (const [, mgr] of byManager) {
        try {
          const { subject, html } = buildManagerEmail(
            mgr.name,
            mgr.missing,
            dateLabel,
          );
          await sendEmail({ to: mgr.email, subject, html });
          emailsSent++;
        } catch (err) {
          errors.push(
            `Failed to email manager ${mgr.email}: ${err instanceof Error ? err.message : "Unknown"}`,
          );
        }
      }
    }

    // Always send admin summary
    const admins = await prisma.user.findMany({
      where: { role: { in: ["owner", "admin"] }, active: true },
      select: { email: true },
    });

    const { subject: adminSubject, html: adminHtml } = buildAdminSummaryEmail(
      allMissing,
      completedCount,
      totalExpected,
      dateLabel,
    );

    for (const admin of admins) {
      try {
        await sendEmail({ to: admin.email, subject: adminSubject, html: adminHtml });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed admin email ${admin.email}: ${err instanceof Error ? err.message : "Unknown"}`,
        );
      }
    }

    await guard.complete({
      totalExpected,
      completed: completedCount,
      incomplete: allMissing.length,
      emailsSent,
    });

    return NextResponse.json({
      message: "Checklist audit processed",
      date: dateLabel,
      totalExpected,
      completed: completedCount,
      incomplete: allMissing.length,
      completionRate:
        totalExpected > 0
          ? `${Math.round((completedCount / totalExpected) * 100)}%`
          : "N/A",
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("Checklist audit cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
}
