import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { acquireCronLock } from "@/lib/cron-guard";

// ── Brand constants ─────────────────────────────────────────
const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

// ── Email templates ─────────────────────────────────────────

function buildUserReminderHtml(
  userName: string,
  pendingPolicies: { title: string; version: number }[],
): string {
  const policyRows = pendingPolicies
    .map(
      (p) =>
        `<tr>
          <td style="padding:10px 12px;color:#374151;font-size:14px;line-height:1.4;border-bottom:1px solid #f3f4f6;">
            ${p.title}
          </td>
          <td style="padding:10px 12px;color:#6b7280;font-size:13px;white-space:nowrap;border-bottom:1px solid #f3f4f6;vertical-align:top;">
            v${p.version}
          </td>
        </tr>`,
    )
    .join("");

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
                Policy Compliance Reminder
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:#374151;font-size:16px;font-weight:600;">
                Hi ${userName},
              </p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.5;">
                You have <strong>${pendingPolicies.length}</strong> ${pendingPolicies.length === 1 ? "policy" : "policies"} that ${pendingPolicies.length === 1 ? "requires" : "require"} your acknowledgement. Please review and acknowledge ${pendingPolicies.length === 1 ? "it" : "them"} at your earliest convenience.
              </p>

              <!-- Policy table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr style="background-color:#f9fafb;">
                  <td style="padding:8px 12px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Policy</td>
                  <td style="padding:8px 12px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Version</td>
                </tr>
                ${policyRows}
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${DASHBOARD_URL}/policies" style="display:inline-block;padding:12px 32px;background-color:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                      View Policies
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
                Sent weekly on Mondays to ensure policy compliance across the organisation.
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

function buildAdminSummaryHtml(
  adminName: string,
  totalPolicies: number,
  totalUsers: number,
  complianceRate: number,
  topOffenders: { name: string; pending: number }[],
): string {
  const offenderRows =
    topOffenders.length > 0
      ? topOffenders
          .map(
            (o) =>
              `<tr>
                <td style="padding:6px 12px;color:#374151;font-size:14px;border-bottom:1px solid #f3f4f6;">${o.name}</td>
                <td style="padding:6px 12px;color:#dc2626;font-size:14px;font-weight:600;border-bottom:1px solid #f3f4f6;">${o.pending} pending</td>
              </tr>`,
          )
          .join("")
      : `<tr><td style="padding:6px 12px;color:#15803d;font-size:14px;" colspan="2">All staff are fully compliant!</td></tr>`;

  const rateColor =
    complianceRate >= 90
      ? "#15803d"
      : complianceRate >= 70
        ? "#d97706"
        : "#dc2626";

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
                Policy Compliance Summary
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:#374151;font-size:16px;font-weight:600;">
                Hi ${adminName},
              </p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.5;">
                Here is this week's policy compliance summary across the organisation.
              </p>

              <!-- Stats Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="33%" style="padding:0 4px 0 0;vertical-align:top;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;">
                      <tr>
                        <td style="padding:16px;text-align:center;">
                          <p style="margin:0;color:#2563eb;font-size:28px;font-weight:700;">${totalPolicies}</p>
                          <p style="margin:4px 0 0;color:#1e40af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Policies</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td width="33%" style="padding:0 2px;vertical-align:top;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:8px;">
                      <tr>
                        <td style="padding:16px;text-align:center;">
                          <p style="margin:0;color:${rateColor};font-size:28px;font-weight:700;">${complianceRate}%</p>
                          <p style="margin:4px 0 0;color:#166534;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Compliance</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td width="33%" style="padding:0 0 0 4px;vertical-align:top;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fefce8;border-radius:8px;">
                      <tr>
                        <td style="padding:16px;text-align:center;">
                          <p style="margin:0;color:#a16207;font-size:28px;font-weight:700;">${totalUsers}</p>
                          <p style="margin:4px 0 0;color:#92400e;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Staff</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Top offenders -->
              <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">
                Staff With Most Pending Policies
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                ${offenderRows}
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${DASHBOARD_URL}/policies" style="display:inline-block;padding:12px 32px;background-color:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                      View Policies
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
                Admin compliance summary sent weekly on Mondays.
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
 * GET /api/cron/policy-compliance
 *
 * Weekly cron (Monday) — checks for unacknowledged published policies and
 * sends reminder emails to users. Also sends an admin summary with overall
 * compliance rates.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("policy-compliance", "weekly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    // 1. Get all published policies
    const policies = await prisma.policy.findMany({
      where: { status: "published", deleted: false },
      select: { id: true, title: true, version: true },
    });

    if (policies.length === 0) {
      await guard.complete({ policies: 0, emailsSent: 0 });
      return NextResponse.json({
        message: "No published policies found",
        policies: 0,
        emailsSent: 0,
      });
    }

    // 2. Get all active users
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true },
    });

    // 3. Batch-fetch all acknowledgements for published policies
    const acknowledgements = await prisma.policyAcknowledgement.findMany({
      where: {
        policyId: { in: policies.map((p) => p.id) },
        userId: { in: users.map((u) => u.id) },
      },
      select: { policyId: true, userId: true, policyVersion: true },
    });

    // Build a set of "policyId:userId:version" for fast lookup
    const ackSet = new Set(
      acknowledgements.map((a) => `${a.policyId}:${a.userId}:${a.policyVersion}`),
    );

    // 4. Build map of users -> unacknowledged policies
    const userPendingMap = new Map<
      string,
      { name: string; email: string; role: string; pending: { title: string; version: number }[] }
    >();

    let totalAcknowledged = 0;
    const totalRequired = policies.length * users.length;

    for (const user of users) {
      const pending: { title: string; version: number }[] = [];

      for (const policy of policies) {
        const key = `${policy.id}:${user.id}:${policy.version}`;
        if (ackSet.has(key)) {
          totalAcknowledged++;
        } else {
          pending.push({ title: policy.title, version: policy.version });
        }
      }

      if (pending.length > 0) {
        userPendingMap.set(user.id, {
          name: user.name,
          email: user.email,
          role: user.role,
          pending,
        });
      }
    }

    const complianceRate =
      totalRequired > 0 ? Math.round((totalAcknowledged / totalRequired) * 100) : 100;

    // 5. Send reminder emails to users with pending policies
    let emailsSent = 0;
    const errors: string[] = [];

    for (const [, userData] of userPendingMap) {
      try {
        const html = buildUserReminderHtml(
          userData.name.split(" ")[0],
          userData.pending,
        );

        await sendEmail({
          to: userData.email,
          subject: `Policy Acknowledgement Required — ${userData.pending.length} ${userData.pending.length === 1 ? "policy" : "policies"} pending`,
          html,
        });

        emailsSent++;
      } catch (err) {
        errors.push(
          `${userData.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 6. Send admin summary
    const admins = users.filter((u) =>
      ["owner", "admin", "head_office"].includes(u.role),
    );

    // Top offenders — users with most pending policies
    const topOffenders = [...userPendingMap.values()]
      .sort((a, b) => b.pending.length - a.pending.length)
      .slice(0, 5)
      .map((u) => ({ name: u.name, pending: u.pending.length }));

    for (const admin of admins) {
      try {
        const html = buildAdminSummaryHtml(
          admin.name.split(" ")[0],
          policies.length,
          users.length,
          complianceRate,
          topOffenders,
        );

        await sendEmail({
          to: admin.email,
          subject: `Policy Compliance Report — ${complianceRate}% compliance`,
          html,
        });

        emailsSent++;
      } catch (err) {
        errors.push(
          `Admin ${admin.email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await guard.complete({
      policies: policies.length,
      users: users.length,
      complianceRate,
      usersWithPending: userPendingMap.size,
      emailsSent,
    });

    return NextResponse.json({
      message: "Policy compliance check processed",
      policies: policies.length,
      users: users.length,
      complianceRate,
      usersWithPending: userPendingMap.size,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("[Cron: policy-compliance]", err);
    return NextResponse.json(
      {
        error: "Policy compliance cron failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
