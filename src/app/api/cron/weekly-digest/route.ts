import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { prisma } from "@/lib/prisma";
import { getResend, sendEmail } from "@/lib/email";

// ── Brand constants ─────────────────────────────────────────
const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

// ── Types ───────────────────────────────────────────────────
interface DigestData {
  userName: string;
  overdueTodos: number;
  rocksOnTrack: number;
  rocksOffTrack: number;
  rocksComplete: number;
  openIssues: number;
  pendingLeave: number;
  expiringCertificates: number;
  actionItems: string[];
}

// ── Email template ──────────────────────────────────────────

function buildDigestHtml(data: DigestData): string {
  const actionItemsHtml = data.actionItems.length > 0
    ? data.actionItems
        .map(
          (item) =>
            `<tr><td style="padding:6px 0;color:#374151;font-size:14px;line-height:1.5;">&#8226; ${item}</td></tr>`,
        )
        .join("")
    : `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-style:italic;">Nothing urgent this week — great work!</td></tr>`;

  const content = `
    <p style="margin:0 0 8px;color:#374151;font-size:16px;font-weight:600;">
      Hi ${data.userName},
    </p>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.5;">
      Here is your weekly EOS dashboard summary.
    </p>

    <!-- Quick Stats Grid -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="50%" style="padding:0 6px 12px 0;vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:8px;padding:16px;">
            <tr>
              <td style="padding:16px;">
                <p style="margin:0;color:#15803d;font-size:28px;font-weight:700;">${data.rocksOnTrack}</p>
                <p style="margin:4px 0 0;color:#166534;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Rocks On Track</p>
              </td>
            </tr>
          </table>
        </td>
        <td width="50%" style="padding:0 0 12px 6px;vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:8px;padding:16px;">
            <tr>
              <td style="padding:16px;">
                <p style="margin:0;color:#dc2626;font-size:28px;font-weight:700;">${data.rocksOffTrack}</p>
                <p style="margin:4px 0 0;color:#991b1b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Rocks Off Track</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td width="50%" style="padding:0 6px 0 0;vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-radius:8px;padding:16px;">
            <tr>
              <td style="padding:16px;">
                <p style="margin:0;color:#d97706;font-size:28px;font-weight:700;">${data.overdueTodos}</p>
                <p style="margin:4px 0 0;color:#92400e;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Overdue To-Dos</p>
              </td>
            </tr>
          </table>
        </td>
        <td width="50%" style="padding:0 0 0 6px;vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;padding:16px;">
            <tr>
              <td style="padding:16px;">
                <p style="margin:0;color:#2563eb;font-size:28px;font-weight:700;">${data.openIssues}</p>
                <p style="margin:4px 0 0;color:#1e40af;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Open Issues</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Action Items -->
    <p style="margin:0 0 12px;color:#111827;font-size:15px;font-weight:600;">Action Items</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${actionItemsHtml}
    </table>

    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td align="center">
          <a href="${DASHBOARD_URL}/dashboard" style="display:inline-block;padding:12px 32px;background-color:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
            Open Dashboard
          </a>
        </td>
      </tr>
    </table>
  `;

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
                Weekly Digest
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                Amana OSHC &mdash; EOS Dashboard<br/>
                You received this because weekly digests are enabled in your notification preferences.
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

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("weekly-digest", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  // Bail early if email is not configured
  if (!getResend()) {
    await guard.fail(new Error("Resend not configured"));
    return NextResponse.json(
      { error: "Email service unavailable. Set RESEND_API_KEY." },
      { status: 503 },
    );
  }

  try {
    const now = new Date();
    const fourteenDaysFromNow = new Date(now);
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

    // ── 1. Fetch eligible recipients ────────────────────────
    const recipients = await prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["owner", "head_office", "admin", "member", "coordinator"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        serviceId: true,
        notificationPrefs: true,
      },
    });

    let emailsSent = 0;
    let emailsSkipped = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      // Check notification preferences — default to true if not set
      const prefs = (recipient.notificationPrefs as Record<string, unknown>) ?? {};
      if (prefs.weeklyDigest === false) {
        emailsSkipped++;
        continue;
      }

      try {
        // ── 2. Gather metrics per user ────────────────────────

        // Overdue to-dos assigned to this user
        const overdueTodos = await prisma.todo.count({
          where: {
            deleted: false,
            status: "pending",
            dueDate: { lt: now },
            OR: [
              { assigneeId: recipient.id },
              { assignees: { some: { userId: recipient.id } } },
            ],
          },
        });

        // Rock status summary — rocks owned by this user
        const rocks = await prisma.rock.groupBy({
          by: ["status"],
          where: {
            deleted: false,
            ownerId: recipient.id,
          },
          _count: { id: true },
        });

        const rockCounts = { on_track: 0, off_track: 0, complete: 0 };
        for (const r of rocks) {
          if (r.status in rockCounts) {
            rockCounts[r.status as keyof typeof rockCounts] = r._count.id;
          }
        }

        // Open issues — scoped to user's service if they have one
        const issueWhere: Record<string, unknown> = {
          deleted: false,
          status: { notIn: ["closed", "solved"] },
        };
        if (recipient.serviceId) {
          issueWhere.serviceId = recipient.serviceId;
        }
        const openIssues = await prisma.issue.count({ where: issueWhere });

        // Pending leave — only for coordinator/admin/head_office/owner
        let pendingLeave = 0;
        const leaveRoles = ["coordinator", "admin", "head_office", "owner"];
        if (leaveRoles.includes(recipient.role)) {
          const leaveWhere: Record<string, unknown> = {
            status: "leave_pending",
          };
          if (recipient.serviceId) {
            leaveWhere.serviceId = recipient.serviceId;
          }
          pendingLeave = await prisma.leaveRequest.count({ where: leaveWhere });
        }

        // Compliance alerts — certificates expiring within 14 days
        let expiringCertificates = 0;
        try {
          const certWhere: Record<string, unknown> = {
            expiryDate: { gt: now, lte: fourteenDaysFromNow },
          };
          if (recipient.serviceId) {
            certWhere.serviceId = recipient.serviceId;
          }
          expiringCertificates = await prisma.complianceCertificate.count({
            where: certWhere,
          });
        } catch {
          // Certificate model may differ — skip gracefully
        }

        // ── 3. Build action items ─────────────────────────────
        const actionItems: string[] = [];

        if (overdueTodos > 0) {
          actionItems.push(
            `${overdueTodos} overdue to-do${overdueTodos !== 1 ? "s" : ""} need attention`,
          );
        }
        if (rockCounts.off_track > 0) {
          actionItems.push(
            `${rockCounts.off_track} rock${rockCounts.off_track !== 1 ? "s" : ""} off track`,
          );
        }
        if (pendingLeave > 0) {
          actionItems.push(
            `${pendingLeave} leave request${pendingLeave !== 1 ? "s" : ""} pending approval`,
          );
        }
        if (expiringCertificates > 0) {
          actionItems.push(
            `${expiringCertificates} certificate${expiringCertificates !== 1 ? "s" : ""} expiring in the next 14 days`,
          );
        }
        if (openIssues > 0) {
          actionItems.push(
            `${openIssues} open issue${openIssues !== 1 ? "s" : ""} to resolve`,
          );
        }

        // Cap at 5 action items
        const topActions = actionItems.slice(0, 5);

        // ── 4. Send email ─────────────────────────────────────
        const digestData: DigestData = {
          userName: recipient.name.split(" ")[0],
          overdueTodos,
          rocksOnTrack: rockCounts.on_track,
          rocksOffTrack: rockCounts.off_track,
          rocksComplete: rockCounts.complete,
          openIssues,
          pendingLeave,
          expiringCertificates,
          actionItems: topActions,
        };

        const html = buildDigestHtml(digestData);

        await sendEmail({
          to: recipient.email,
          subject: "Your Weekly EOS Dashboard Digest",
          html,
        });

        emailsSent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${recipient.email}: ${msg}`);
      }
    }

    const result = {
      message: "Weekly digest complete",
      emailsSent,
      emailsSkipped,
      totalRecipients: recipients.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    await guard.complete(result);

    return NextResponse.json(result);
  } catch (err) {
    await guard.fail(err);
    console.error("[Cron: weekly-digest]", err);
    return NextResponse.json(
      {
        error: "Weekly digest cron failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
