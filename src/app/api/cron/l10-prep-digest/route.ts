import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { acquireCronLock } from "@/lib/cron-guard";

// ── Brand constants ─────────────────────────────────────────
const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

// ── Helpers ─────────────────────────────────────────────────

function getCurrentQuarter(): string {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();
  const q = month < 3 ? 1 : month < 6 ? 2 : month < 9 ? 3 : 4;
  return `Q${q} ${year}`;
}

function getMondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// ── Email template ──────────────────────────────────────────

interface PrepDigestData {
  userName: string;
  overdueTodos: { title: string; dueDate: Date }[];
  offTrackRocks: { title: string; status: string }[];
  openIssues: { title: string; priority: string | null }[];
  missingMeasurables: { title: string }[];
}

function buildPrepDigestHtml(data: PrepDigestData): string {
  const sections: string[] = [];

  // Overdue Todos
  if (data.overdueTodos.length > 0) {
    const rows = data.overdueTodos
      .map(
        (t) =>
          `<tr>
            <td style="padding:6px 12px;color:#374151;font-size:14px;line-height:1.5;border-bottom:1px solid #f3f4f6;">
              ${t.title}
            </td>
            <td style="padding:6px 12px;color:#dc2626;font-size:13px;white-space:nowrap;border-bottom:1px solid #f3f4f6;">
              Due ${t.dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </td>
          </tr>`,
      )
      .join("");

    sections.push(`
      <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">
        ⚠️ Overdue To-Dos (${data.overdueTodos.length})
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${rows}
      </table>
    `);
  }

  // Off-Track Rocks
  if (data.offTrackRocks.length > 0) {
    const rows = data.offTrackRocks
      .map(
        (r) =>
          `<tr>
            <td style="padding:6px 12px;color:#374151;font-size:14px;line-height:1.5;border-bottom:1px solid #f3f4f6;">
              ${r.title}
            </td>
            <td style="padding:6px 12px;font-size:13px;border-bottom:1px solid #f3f4f6;">
              <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;${
                r.status === "off_track"
                  ? "background-color:#fef2f2;color:#dc2626;"
                  : "background-color:#fffbeb;color:#d97706;"
              }">
                ${r.status.replace(/_/g, " ")}
              </span>
            </td>
          </tr>`,
      )
      .join("");

    sections.push(`
      <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">
        🪨 Off-Track Rocks (${data.offTrackRocks.length})
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${rows}
      </table>
    `);
  }

  // Open Issues
  if (data.openIssues.length > 0) {
    const rows = data.openIssues
      .map(
        (i) =>
          `<tr>
            <td style="padding:6px 12px;color:#374151;font-size:14px;line-height:1.5;border-bottom:1px solid #f3f4f6;">
              ${i.title}
            </td>
            <td style="padding:6px 12px;color:#6b7280;font-size:13px;white-space:nowrap;border-bottom:1px solid #f3f4f6;">
              ${i.priority ?? "—"}
            </td>
          </tr>`,
      )
      .join("");

    sections.push(`
      <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">
        🔥 Open Issues (${data.openIssues.length})
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${rows}
      </table>
    `);
  }

  // Missing Measurables
  if (data.missingMeasurables.length > 0) {
    const items = data.missingMeasurables
      .map(
        (m) =>
          `<tr><td style="padding:4px 0;color:#374151;font-size:14px;line-height:1.5;">&#8226; ${m.title}</td></tr>`,
      )
      .join("");

    sections.push(`
      <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">
        📊 Missing Scorecard Entries
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        ${items}
      </table>
    `);
  }

  const allClear =
    data.overdueTodos.length === 0 &&
    data.offTrackRocks.length === 0 &&
    data.openIssues.length === 0 &&
    data.missingMeasurables.length === 0;

  const contentHtml = allClear
    ? `<p style="margin:0 0 24px;color:#15803d;font-size:14px;line-height:1.5;">
        ✅ You're all caught up — nothing to prep for tomorrow's L10!
      </p>`
    : sections.join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                Amana OSHC
              </h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">
                L10 Prep Digest
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:#374151;font-size:16px;font-weight:600;">
                Hi ${data.userName},
              </p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.5;">
                Here is your prep summary for tomorrow's Level 10 meeting. Review these items so you're ready to contribute.
              </p>

              ${contentHtml}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
                <tr>
                  <td align="center">
                    <a href="${DASHBOARD_URL}/meetings" style="display:inline-block;padding:12px 32px;background-color:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Open Meetings
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Amana OSHC &mdash; EOS Dashboard<br/>
                Sent every Wednesday to help you prepare for your L10 meeting.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Cron handler ────────────────────────────────────────────

/**
 * GET /api/cron/l10-prep-digest
 *
 * Weekly cron (Wednesday) — sends a personalised L10 prep digest to each
 * active user with their overdue todos, off-track rocks, open issues, and
 * missing scorecard entries for the current week.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("l10-prep-digest", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const currentQuarter = getCurrentQuarter();
    const weekOf = getMondayOfCurrentWeek();

    // Get eligible users
    const users = await prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["owner", "admin", "coordinator", "member"] },
      },
      select: { id: true, name: true, email: true },
    });

    let emailsSent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // a. Overdue todos
        const overdueTodos = await prisma.todo.findMany({
          where: {
            assigneeId: user.id,
            dueDate: { lt: now },
            status: "pending",
            deleted: false,
          },
          select: { title: true, dueDate: true },
          orderBy: { dueDate: "asc" },
          take: 10,
        });

        // b. Off-track rocks
        const offTrackRocks = await prisma.rock.findMany({
          where: {
            ownerId: user.id,
            quarter: currentQuarter,
            status: "off_track",
            deleted: false,
          },
          select: { title: true, status: true },
        });

        // c. Open issues assigned to them
        const openIssues = await prisma.issue.findMany({
          where: {
            ownerId: user.id,
            status: "open",
            deleted: false,
          },
          select: { title: true, priority: true },
          take: 10,
        });

        // d. Missing measurable entries for this week
        const weeklyMeasurables = await prisma.measurable.findMany({
          where: {
            ownerId: user.id,
            frequency: "weekly",
          },
          select: {
            id: true,
            title: true,
            entries: {
              where: { weekOf },
              select: { id: true },
              take: 1,
            },
          },
        });

        const missingMeasurables = weeklyMeasurables
          .filter((m) => m.entries.length === 0)
          .map((m) => ({ title: m.title }));

        // Skip if nothing to report
        const totalItems =
          overdueTodos.length +
          offTrackRocks.length +
          openIssues.length +
          missingMeasurables.length;

        if (totalItems === 0) {
          skipped++;
          continue;
        }

        const html = buildPrepDigestHtml({
          userName: user.name.split(" ")[0],
          overdueTodos: overdueTodos.map((t) => ({
            title: t.title,
            dueDate: t.dueDate!,
          })),
          offTrackRocks,
          openIssues,
          missingMeasurables,
        });

        await sendEmail({
          to: user.email,
          subject: "L10 Prep Digest — Review Before Tomorrow's Meeting",
          html,
        });

        emailsSent++;
      } catch (err) {
        errors.push(
          `${user.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await guard.complete({
      totalUsers: users.length,
      emailsSent,
      skipped,
      quarter: currentQuarter,
    });

    return NextResponse.json({
      message: "L10 prep digest processed",
      totalUsers: users.length,
      emailsSent,
      skipped,
      quarter: currentQuarter,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("[Cron: l10-prep-digest]", err);
    return NextResponse.json(
      {
        error: "L10 prep digest cron failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
