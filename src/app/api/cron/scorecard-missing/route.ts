import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { acquireCronLock } from "@/lib/cron-guard";

const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

/**
 * GET /api/cron/scorecard-missing
 *
 * Weekly cron (Monday) — checks for weekly measurables that were not
 * filled in for last week and notifies owners + admins.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("scorecard-missing", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    // ── 1. Calculate Monday of LAST week ────────────────────
    const now = new Date();
    const day = now.getDay();
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - day - 6);
    lastMonday.setHours(0, 0, 0, 0);

    const weekLabel = lastMonday.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    // ── 2. Find all weekly measurables with entries status ──
    const measurables = await prisma.measurable.findMany({
      where: { frequency: "weekly" },
      include: {
        owner: {
          select: { id: true, name: true, email: true, active: true },
        },
        entries: {
          where: { weekOf: lastMonday },
        },
      },
    });

    // ── 3. Filter to measurables with no entry for last week
    const missing = measurables.filter((m) => m.entries.length === 0);

    if (missing.length === 0) {
      await guard.complete({
        totalMeasurables: measurables.length,
        missing: 0,
        emailsSent: 0,
      });
      return NextResponse.json({
        message: "All scorecard data filled in for last week",
        totalMeasurables: measurables.length,
        missing: 0,
        emailsSent: 0,
      });
    }

    // ── 4. Group by owner ───────────────────────────────────
    const byOwner = new Map<
      string,
      {
        name: string;
        email: string;
        measurables: { id: string; title: string }[];
      }
    >();

    for (const m of missing) {
      if (!m.owner || !m.owner.active) continue;

      if (!byOwner.has(m.owner.id)) {
        byOwner.set(m.owner.id, {
          name: m.owner.name,
          email: m.owner.email,
          measurables: [],
        });
      }
      byOwner.get(m.owner.id)!.measurables.push({
        id: m.id,
        title: m.title,
      });
    }

    // ── 5. Send per-owner reminder emails ───────────────────
    let emailsSent = 0;
    const errors: string[] = [];

    for (const [, owner] of byOwner) {
      try {
        const firstName = owner.name.split(" ")[0];
        const listItems = owner.measurables
          .map(
            (m) =>
              `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#dc2626;margin-right:8px;"></span>
                ${m.title}
              </td></tr>`,
          )
          .join("");

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f4f5;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Amana OSHC</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Scorecard Reminder</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Hi ${firstName},</p>
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">The following measurable(s) are missing data for the week of <strong>${weekLabel}</strong>. Please update them as soon as possible.</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:10px 12px;background:#fef2f2;font-size:13px;font-weight:600;color:#dc2626;">
            ${owner.measurables.length} Missing Measurable${owner.measurables.length === 1 ? "" : "s"}
          </td></tr>
          ${listItems}
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
          <tr><td align="center">
            <a href="${DASHBOARD_URL}/scorecard" style="display:inline-block;padding:12px 32px;background:${BRAND_COLOR};color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">Update Scorecard</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Automated reminder from Amana OSHC Dashboard</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

        await sendEmail({
          to: owner.email,
          subject: `Scorecard Missing Data: ${owner.measurables.length} measurable${owner.measurables.length === 1 ? "" : "s"} for week of ${weekLabel}`,
          html,
        });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed ${owner.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── 6. Send admin summary ───────────────────────────────
    const completionRate = Math.round(
      ((measurables.length - missing.length) / measurables.length) * 100,
    );

    const admins = await prisma.user.findMany({
      where: {
        role: { in: ["owner", "admin", "head_office"] },
        active: true,
      },
      select: { name: true, email: true },
    });

    const ownerSummaryRows = Array.from(byOwner.values())
      .sort((a, b) => b.measurables.length - a.measurables.length)
      .map(
        (o) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${o.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#dc2626;text-align:right;">${o.measurables.length}</td>
        </tr>`,
      )
      .join("");

    const completionColor =
      completionRate >= 90
        ? "#16a34a"
        : completionRate >= 70
          ? "#f59e0b"
          : "#dc2626";

    for (const admin of admins) {
      try {
        const firstName = admin.name.split(" ")[0];
        const adminHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f4f5;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <tr><td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Amana OSHC</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Scorecard Completion Summary</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Hi ${firstName}, here is the scorecard completion summary for the week of <strong>${weekLabel}</strong>.</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
          <tr>
            <td style="padding:16px;background:${BRAND_COLOR};border-radius:8px 0 0 8px;text-align:center;width:50%;">
              <div style="font-size:32px;font-weight:700;color:${ACCENT_COLOR};">${completionRate}%</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">Completion Rate</div>
            </td>
            <td style="padding:16px;background:#374151;border-radius:0 8px 8px 0;text-align:center;width:50%;">
              <div style="font-size:32px;font-weight:700;color:${completionColor};">${missing.length}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">Missing Entries</div>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 8px;color:#374151;font-size:14px;font-weight:600;">${measurables.length - missing.length} of ${measurables.length} measurables filled in</p>

        ${byOwner.size > 0 ? `<h3 style="margin:20px 0 8px;font-size:15px;color:${BRAND_COLOR};">Missing by Owner</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Owner</td>
            <td style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;text-align:right;">Missing</td>
          </tr>
          ${ownerSummaryRows}
        </table>` : ""}

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
          <tr><td align="center">
            <a href="${DASHBOARD_URL}/scorecard" style="display:inline-block;padding:12px 32px;background:${BRAND_COLOR};color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">View Scorecard</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Automated summary from Amana OSHC Dashboard</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

        await sendEmail({
          to: admin.email,
          subject: `Scorecard Summary: ${completionRate}% complete — ${missing.length} missing for week of ${weekLabel}`,
          html: adminHtml,
        });
        emailsSent++;
      } catch (err) {
        errors.push(
          `Failed admin ${admin.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await guard.complete({
      totalMeasurables: measurables.length,
      missing: missing.length,
      completionRate,
      ownersMissing: byOwner.size,
      emailsSent,
    });

    return NextResponse.json({
      message: "Scorecard missing data alerts sent",
      totalMeasurables: measurables.length,
      missing: missing.length,
      completionRate,
      ownersMissing: byOwner.size,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("[Cron: scorecard-missing]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 },
    );
  }
}
