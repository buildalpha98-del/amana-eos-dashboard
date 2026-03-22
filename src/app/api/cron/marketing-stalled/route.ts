import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { prisma } from "@/lib/prisma";
import { getResend, sendEmail } from "@/lib/email";
import { withApiHandler } from "@/lib/api-handler";

const BRAND_COLOR = "#004E64";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

function wrapLayout(bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
${bodyHtml}
</div>
<p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px">Amana OSHC Dashboard</p>
</div></body></html>`;
}

function ctaButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">${label}</a>`;
}

// Stalled = in_review for 3+ days
const STALE_DAYS = 3;

interface StalledPost {
  id: string;
  title: string;
  updatedAt: Date;
  serviceName: string | null;
}

interface OverdueTask {
  id: string;
  title: string;
  dueDate: Date;
  serviceName: string | null;
}

interface CentreGroup {
  centreName: string;
  stalledPosts: StalledPost[];
  overdueTasks: OverdueTask[];
}

function buildAlertHtml(groups: CentreGroup[]): string {
  const totalPosts = groups.reduce((s, g) => s + g.stalledPosts.length, 0);
  const totalTasks = groups.reduce((s, g) => s + g.overdueTasks.length, 0);

  const sectionsHtml = groups
    .map((g) => {
      const postRows = g.stalledPosts
        .map(
          (p) =>
            `<tr>
              <td style="padding:6px 12px;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6">${p.title}</td>
              <td style="padding:6px 12px;font-size:12px;color:#9ca3af;border-bottom:1px solid #f3f4f6;white-space:nowrap">In review since ${p.updatedAt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
            </tr>`
        )
        .join("");

      const taskRows = g.overdueTasks
        .map(
          (t) =>
            `<tr>
              <td style="padding:6px 12px;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6">${t.title}</td>
              <td style="padding:6px 12px;font-size:12px;color:#dc2626;border-bottom:1px solid #f3f4f6;white-space:nowrap">Due ${t.dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
            </tr>`
        )
        .join("");

      return `
        <div style="margin-bottom:24px">
          <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;color:${BRAND_COLOR}">${g.centreName}</h3>
          ${
            postRows
              ? `<p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Stalled Posts</p>
                 <table style="width:100%;border-collapse:collapse;margin-bottom:12px">${postRows}</table>`
              : ""
          }
          ${
            taskRows
              ? `<p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Overdue Tasks</p>
                 <table style="width:100%;border-collapse:collapse">${taskRows}</table>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  const body = `
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:${BRAND_COLOR}">Marketing Review Alert</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280">
      ${totalPosts} post${totalPosts !== 1 ? "s" : ""} stalled in review &bull;
      ${totalTasks} overdue task${totalTasks !== 1 ? "s" : ""}
    </p>
    ${sectionsHtml}
    <div style="text-align:center;margin-top:24px">
      ${ctaButton(`${DASHBOARD_URL}/marketing`, "Open Marketing Dashboard")}
    </div>
  `;

  return wrapLayout(body);
}

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("marketing-stalled", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  if (!getResend()) {
    await guard.fail(new Error("Resend not configured"));
    return NextResponse.json(
      { error: "Email service unavailable. Set RESEND_API_KEY." },
      { status: 503 }
    );
  }

  try {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - STALE_DAYS);
    const now = new Date();

    // Posts in_review for 3+ days
    const stalledPosts = await prisma.marketingPost.findMany({
      where: {
        deleted: false,
        status: "in_review",
        updatedAt: { lte: staleDate },
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        services: {
          select: {
            service: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Overdue tasks (not done, dueDate in the past)
    const overdueTasks = await prisma.marketingTask.findMany({
      where: {
        deleted: false,
        status: { not: "done" },
        dueDate: { lt: now },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        service: { select: { id: true, name: true } },
      },
    });

    if (stalledPosts.length === 0 && overdueTasks.length === 0) {
      await guard.complete({ stalledPosts: 0, overdueTasks: 0 });
      return NextResponse.json({ message: "No stalled items", skipped: true });
    }

    // Group by centre
    const groupMap = new Map<string, CentreGroup>();

    for (const post of stalledPosts) {
      const centreName =
        post.services[0]?.service.name || "Unassigned";
      if (!groupMap.has(centreName)) {
        groupMap.set(centreName, {
          centreName,
          stalledPosts: [],
          overdueTasks: [],
        });
      }
      groupMap.get(centreName)!.stalledPosts.push({
        id: post.id,
        title: post.title,
        updatedAt: post.updatedAt,
        serviceName: centreName,
      });
    }

    for (const task of overdueTasks) {
      const centreName = task.service?.name || "Unassigned";
      if (!groupMap.has(centreName)) {
        groupMap.set(centreName, {
          centreName,
          stalledPosts: [],
          overdueTasks: [],
        });
      }
      groupMap.get(centreName)!.overdueTasks.push({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate!,
        serviceName: centreName,
      });
    }

    const groups = Array.from(groupMap.values()).sort((a, b) =>
      a.centreName.localeCompare(b.centreName)
    );

    // Send to all admin/head_office/owner users
    const recipients = await prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["owner", "head_office", "admin"] },
        email: { not: "" },
      },
      select: { email: true },
    });

    const emails = recipients
      .map((u) => u.email)
      .filter((e): e is string => !!e);

    if (emails.length > 0) {
      const html = buildAlertHtml(groups);
      await sendEmail({
        to: emails,
        subject: `Marketing Alert: ${stalledPosts.length} stalled, ${overdueTasks.length} overdue`,
        html,
      });
    }

    await guard.complete({
      stalledPosts: stalledPosts.length,
      overdueTasks: overdueTasks.length,
      emailsSent: emails.length,
    });

    return NextResponse.json({
      success: true,
      stalledPosts: stalledPosts.length,
      overdueTasks: overdueTasks.length,
      emailsSent: emails.length,
    });
  } catch (err) {
    await guard.fail(err as Error);
    return NextResponse.json(
      { error: "Cron failed", details: (err as Error).message },
      { status: 500 }
    );
  }
});
