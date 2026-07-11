import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getEmailBranding, type EmailBranding } from "@/lib/email-branding";
import { escapeHtml } from "@/lib/email-templates/base";

/**
 * Training compliance — the "who's behind on required training" engine.
 *
 * Essential-track courses are hard-gated (a new starter can't clock in until
 * they're done), but monthly-track refreshers have NO gate and, until now, no
 * nudge — so completion quietly slipped. This module powers two surfaces:
 *
 *   - `getTrainingComplianceReport()` — the admin "who's behind" view + CSV.
 *   - `sendTrainingReminders()` — the weekly cron that emails each staffer
 *     their outstanding required training and sends admins a summary.
 *
 * "Required training" = a published, non-deleted course on the essential or
 * monthly track (or explicitly `isRequired`), with an enrolment that isn't
 * completed, for an active user. Mirrors the policy-compliance pattern.
 */

const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

// Days-out threshold under which an outstanding (not-yet-overdue) course is
// flagged "due soon" in reminders + the admin view.
const DUE_SOON_DAYS = 7;

// ── Types ───────────────────────────────────────────────────

export interface ComplianceCourseRow {
  courseId: string;
  courseTitle: string;
  track: string;
  status: string;
  dueDate: string | null;
  /** dueDate is set and in the past. */
  overdue: boolean;
  /** dueDate is set, not yet passed, and within DUE_SOON_DAYS. */
  dueSoon: boolean;
  progressPct: number;
}

export interface ComplianceUserRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  outstanding: ComplianceCourseRow[];
  overdueCount: number;
  dueSoonCount: number;
}

export interface TrainingComplianceReport {
  generatedAt: string;
  totals: {
    staffBehind: number;
    outstandingCourses: number;
    overdueCourses: number;
  };
  rows: ComplianceUserRow[];
}

export interface ReminderResult {
  staffReminded: number;
  overdueCourses: number;
  emailsSent: number;
  emailsSuppressed: number;
  errors?: string[];
}

// ── Report builder (shared by admin view + cron) ────────────

/**
 * Build the org-wide outstanding-required-training report, grouped by staff
 * member. Staff with nothing outstanding are omitted. Rows are sorted with the
 * most-overdue staff first so the worst cases surface at the top.
 */
export async function getTrainingComplianceReport(): Promise<TrainingComplianceReport> {
  const now = Date.now();

  const enrollments = await prisma.lMSEnrollment.findMany({
    where: {
      // Anything not completed is outstanding — including the (currently
      // unset) `expired` status, so a lapsed enrolment can never silently
      // drop out of the report.
      status: { not: "completed" },
      user: { active: true },
      course: {
        deleted: false,
        status: "published",
        OR: [{ track: { in: ["essential", "monthly"] } }, { isRequired: true }],
      },
    },
    select: {
      dueDate: true,
      status: true,
      user: { select: { id: true, name: true, email: true, role: true } },
      course: {
        select: {
          id: true,
          title: true,
          track: true,
          status: true,
          _count: { select: { modules: true } },
        },
      },
      // Count completed modules in-DB rather than hydrating the rows.
      _count: {
        select: { moduleProgress: { where: { completed: true } } },
      },
    },
  });

  const byUser = new Map<string, ComplianceUserRow>();

  const DAY_MS = 24 * 60 * 60 * 1000;

  for (const e of enrollments) {
    const dueMs = e.dueDate ? e.dueDate.getTime() : null;
    // dueDate is stored at MIDNIGHT of the due day (both the monthly cron
    // and the enrol modal write date-only values), so the real deadline is
    // the END of that day. Only flag overdue once the due day has fully
    // passed; a course due today reads as "due soon", not "overdue".
    const overdue = dueMs !== null && dueMs + DAY_MS <= now;
    const dueSoon =
      dueMs !== null && !overdue && dueMs <= now + DUE_SOON_DAYS * DAY_MS;

    const totalModules = e.course._count.modules;
    const completedModules = e._count.moduleProgress;
    const progressPct =
      totalModules > 0
        ? Math.round((completedModules / totalModules) * 100)
        : 0;

    const courseRow: ComplianceCourseRow = {
      courseId: e.course.id,
      courseTitle: e.course.title,
      track: e.course.track,
      status: e.status,
      dueDate: e.dueDate ? e.dueDate.toISOString() : null,
      overdue,
      dueSoon,
      progressPct,
    };

    let row = byUser.get(e.user.id);
    if (!row) {
      row = {
        userId: e.user.id,
        name: e.user.name,
        email: e.user.email,
        role: e.user.role,
        outstanding: [],
        overdueCount: 0,
        dueSoonCount: 0,
      };
      byUser.set(e.user.id, row);
    }
    row.outstanding.push(courseRow);
    if (overdue) row.overdueCount++;
    else if (dueSoon) row.dueSoonCount++;
  }

  const rows = [...byUser.values()].sort(
    (a, b) =>
      b.overdueCount - a.overdueCount ||
      b.outstanding.length - a.outstanding.length ||
      a.name.localeCompare(b.name),
  );
  // Overdue-first inside each staffer's list, too.
  for (const row of rows) {
    row.outstanding.sort(
      (a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.dueSoon) - Number(a.dueSoon),
    );
  }

  const totals = {
    staffBehind: rows.length,
    outstandingCourses: rows.reduce((n, r) => n + r.outstanding.length, 0),
    overdueCourses: rows.reduce((n, r) => n + r.overdueCount, 0),
  };

  return { generatedAt: new Date().toISOString(), totals, rows };
}

// ── Email templates ─────────────────────────────────────────
//
// One shared shell; the two builders below supply only their inner
// content. All DB-sourced strings (course titles, user names, brand
// name) are escaped — real course titles already contain "&".

function emailShell(opts: {
  subtitle: string;
  greeting: string;
  bodyHtml: string;
  ctaHref: string;
  ctaLabel: string;
  footerNote: string;
  branding: EmailBranding;
}): string {
  const { primaryColor } = opts.branding;
  const brandName = escapeHtml(opts.branding.name);
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:${primaryColor};padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${brandName}</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">${opts.subtitle}</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;color:#374151;font-size:16px;font-weight:600;">Hi ${escapeHtml(opts.greeting)},</p>
          ${opts.bodyHtml}
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${opts.ctaHref}" style="display:inline-block;padding:12px 32px;background-color:${primaryColor};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${opts.ctaLabel}</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">${brandName} &mdash; EOS Dashboard<br/>${opts.footerNote}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function courseListRows(courses: ComplianceCourseRow[]): string {
  return courses
    .map((c) => {
      const due = c.dueDate
        ? new Date(c.dueDate).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "—";
      const badge = c.overdue
        ? `<span style="color:#dc2626;font-weight:600;">Overdue</span>`
        : c.dueSoon
          ? `<span style="color:#d97706;font-weight:600;">Due soon</span>`
          : `<span style="color:#6b7280;">Outstanding</span>`;
      return `<tr>
        <td style="padding:10px 12px;color:#374151;font-size:14px;line-height:1.4;border-bottom:1px solid #f3f4f6;">${escapeHtml(c.courseTitle)}</td>
        <td style="padding:10px 12px;color:#6b7280;font-size:13px;white-space:nowrap;border-bottom:1px solid #f3f4f6;">${due}</td>
        <td style="padding:10px 12px;font-size:13px;white-space:nowrap;border-bottom:1px solid #f3f4f6;">${badge}</td>
      </tr>`;
    })
    .join("");
}

function buildUserReminderHtml(
  userName: string,
  courses: ComplianceCourseRow[],
  branding: EmailBranding,
): string {
  const overdueCount = courses.filter((c) => c.overdue).length;
  const lead =
    overdueCount > 0
      ? `You have <strong>${overdueCount}</strong> overdue training ${overdueCount === 1 ? "course" : "courses"} and ${courses.length - overdueCount} other outstanding. Please complete ${overdueCount === 1 ? "it" : "them"} as soon as you can.`
      : `You have <strong>${courses.length}</strong> outstanding training ${courses.length === 1 ? "course" : "courses"}. Please set aside time to complete ${courses.length === 1 ? "it" : "them"}.`;

  return emailShell({
    subtitle: "Training Reminder",
    greeting: userName,
    bodyHtml: `
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.5;">${lead}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#f9fafb;">
              <td style="padding:8px 12px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Course</td>
              <td style="padding:8px 12px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Due</td>
              <td style="padding:8px 12px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Status</td>
            </tr>
            ${courseListRows(courses)}
          </table>`,
    ctaHref: `${DASHBOARD_URL}/my-training`,
    ctaLabel: "Go to My Training",
    footerNote: "Sent weekly to help you stay on top of your required training.",
    branding,
  });
}

function buildAdminSummaryHtml(
  adminName: string,
  report: TrainingComplianceReport,
  branding: EmailBranding,
): string {
  const topOffenders = report.rows.slice(0, 5);
  const offenderRows =
    topOffenders.length > 0
      ? topOffenders
          .map(
            (o) =>
              `<tr>
                <td style="padding:6px 12px;color:#374151;font-size:14px;border-bottom:1px solid #f3f4f6;">${escapeHtml(o.name)}</td>
                <td style="padding:6px 12px;color:${o.overdueCount > 0 ? "#dc2626" : "#d97706"};font-size:14px;font-weight:600;border-bottom:1px solid #f3f4f6;white-space:nowrap;">${o.overdueCount} overdue · ${o.outstanding.length} outstanding</td>
              </tr>`,
          )
          .join("")
      : `<tr><td style="padding:6px 12px;color:#15803d;font-size:14px;" colspan="2">All staff are up to date on required training! 🎉</td></tr>`;

  return emailShell({
    subtitle: "Training Compliance Summary",
    greeting: adminName,
    bodyHtml: `
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.5;">This week's required-training compliance across the organisation.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td width="33%" style="padding:0 4px 0 0;vertical-align:top;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:8px;"><tr><td style="padding:16px;text-align:center;">
                <p style="margin:0;color:#dc2626;font-size:28px;font-weight:700;">${report.totals.overdueCourses}</p>
                <p style="margin:4px 0 0;color:#991b1b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Overdue</p>
              </td></tr></table></td>
              <td width="33%" style="padding:0 2px;vertical-align:top;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-radius:8px;"><tr><td style="padding:16px;text-align:center;">
                <p style="margin:0;color:#d97706;font-size:28px;font-weight:700;">${report.totals.outstandingCourses}</p>
                <p style="margin:4px 0 0;color:#92400e;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Outstanding</p>
              </td></tr></table></td>
              <td width="33%" style="padding:0 0 0 4px;vertical-align:top;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;"><tr><td style="padding:16px;text-align:center;">
                <p style="margin:0;color:#2563eb;font-size:28px;font-weight:700;">${report.totals.staffBehind}</p>
                <p style="margin:4px 0 0;color:#1e40af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Staff Behind</p>
              </td></tr></table></td>
            </tr>
          </table>
          <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">Staff Most Behind</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${offenderRows}</table>`,
    ctaHref: `${DASHBOARD_URL}/onboarding?tab=compliance`,
    ctaLabel: "View Compliance",
    footerNote: "Admin training-compliance summary, sent weekly.",
    branding,
  });
}

// ── Cron entry: send reminders ──────────────────────────────

/**
 * Email each staffer with outstanding required training, then email admins a
 * summary. `sendEmail` already skips suppressed addresses, so unsubscribed
 * staff are counted but not contacted.
 */
export async function sendTrainingReminders(): Promise<ReminderResult> {
  const report = await getTrainingComplianceReport();

  if (report.rows.length === 0) {
    return {
      staffReminded: 0,
      overdueCourses: 0,
      emailsSent: 0,
      emailsSuppressed: 0,
    };
  }

  const branding = await getEmailBranding();
  let emailsSent = 0;
  let emailsSuppressed = 0;
  const errors: string[] = [];

  for (const row of report.rows) {
    try {
      const html = buildUserReminderHtml(
        row.name.split(" ")[0],
        row.outstanding,
        branding,
      );
      const res = await sendEmail({
        to: row.email,
        subject:
          row.overdueCount > 0
            ? `Action needed — ${row.overdueCount} overdue training ${row.overdueCount === 1 ? "course" : "courses"}`
            : `Reminder — ${row.outstanding.length} outstanding training ${row.outstanding.length === 1 ? "course" : "courses"}`,
        html,
      });
      if (res.suppressed.length > 0) emailsSuppressed++;
      else emailsSent++;
    } catch (err) {
      errors.push(
        `${row.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Admin summary
  const admins = await prisma.user.findMany({
    where: { active: true, role: { in: ["owner", "admin", "head_office"] } },
    select: { name: true, email: true },
  });
  for (const admin of admins) {
    try {
      const html = buildAdminSummaryHtml(
        admin.name.split(" ")[0],
        report,
        branding,
      );
      const res = await sendEmail({
        to: admin.email,
        subject: `Training Compliance — ${report.totals.overdueCourses} overdue across ${report.totals.staffBehind} staff`,
        html,
      });
      if (res.suppressed.length > 0) emailsSuppressed++;
      else emailsSent++;
    } catch (err) {
      errors.push(
        `Admin ${admin.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    staffReminded: report.rows.length,
    overdueCourses: report.totals.overdueCourses,
    emailsSent,
    emailsSuppressed,
    errors: errors.length > 0 ? errors : undefined,
  };
}
