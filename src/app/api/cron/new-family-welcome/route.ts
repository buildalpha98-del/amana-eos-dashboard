import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { acquireCronLock } from "@/lib/cron-guard";

// ── Brand constants ─────────────────────────────────────────
const BRAND_COLOR = "#004E64";
const ACCENT_COLOR = "#FECE00";
const DASHBOARD_URL =
  process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

// ── Types ───────────────────────────────────────────────────

interface FamilyInfo {
  childName: string;
  parentFirstName: string;
  parentEmail: string;
  parentMobile: string;
  enrolledDaysAgo: number;
}

interface ServiceGroup {
  serviceId: string;
  serviceName: string;
  managerEmail: string;
  managerName: string;
  families: FamilyInfo[];
}

// ── Email template ──────────────────────────────────────────

function buildWelcomeCheckHtml(
  managerName: string,
  serviceName: string,
  families: FamilyInfo[],
): string {
  const familyRows = families
    .map(
      (f) =>
        `<tr>
          <td style="padding:10px 12px;color:#374151;font-size:14px;line-height:1.4;border-bottom:1px solid #f3f4f6;">
            <strong>${f.childName}</strong><br/>
            <span style="color:#6b7280;font-size:13px;">
              Parent: ${f.parentFirstName} &mdash;
              <a href="mailto:${f.parentEmail}" style="color:${BRAND_COLOR};text-decoration:none;">${f.parentEmail}</a>
              ${f.parentMobile ? ` &middot; ${f.parentMobile}` : ""}
            </span>
          </td>
          <td style="padding:10px 12px;color:#6b7280;font-size:13px;white-space:nowrap;border-bottom:1px solid #f3f4f6;vertical-align:top;">
            ${f.enrolledDaysAgo} day${f.enrolledDaysAgo !== 1 ? "s" : ""} ago
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
                New Family Follow-Up
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:#374151;font-size:16px;font-weight:600;">
                Hi ${managerName},
              </p>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.5;">
                The following ${families.length === 1 ? "family has" : "families have"} been enrolled at <strong>${serviceName}</strong> for 7+ days. Consider reaching out with a welcome call to check in on their experience.
              </p>

              <!-- Family table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr style="background-color:#f9fafb;">
                  <td style="padding:8px 12px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Family</td>
                  <td style="padding:8px 12px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Enrolled</td>
                </tr>
                ${familyRows}
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${DASHBOARD_URL}/children" style="display:inline-block;padding:12px 32px;background-color:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                      View Children Directory
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
                Sent daily to help you follow up with new families in their first weeks.
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
 * GET /api/cron/new-family-welcome
 *
 * Daily cron — finds children from recently processed enrolments who have
 * been active for 7+ days, and emails the service manager with a list of
 * new families that may need a welcome call.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("new-family-welcome", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    // 1. Find enrolments processed in the last 14 days
    const submissions = await prisma.enrolmentSubmission.findMany({
      where: {
        status: "processed",
        processedAt: { gte: fourteenDaysAgo },
      },
      select: {
        id: true,
        primaryParent: true,
      },
    });

    if (submissions.length === 0) {
      await guard.complete({ submissions: 0, familiesFound: 0, emailsSent: 0 });
      return NextResponse.json({
        message: "No recent processed enrolments",
        familiesFound: 0,
        emailsSent: 0,
      });
    }

    // 2. Find active children from those enrolments, created 7+ days ago
    const children = await prisma.child.findMany({
      where: {
        enrolmentId: { in: submissions.map((s) => s.id) },
        status: "active",
        serviceId: { not: null },
        createdAt: { lte: sevenDaysAgo },
      },
      select: {
        id: true,
        firstName: true,
        surname: true,
        serviceId: true,
        enrolmentId: true,
        createdAt: true,
      },
    });

    if (children.length === 0) {
      await guard.complete({ submissions: submissions.length, familiesFound: 0, emailsSent: 0 });
      return NextResponse.json({
        message: "No new families needing follow-up",
        familiesFound: 0,
        emailsSent: 0,
      });
    }

    // 3. Group by service
    const submissionMap = new Map(submissions.map((s) => [s.id, s]));
    const serviceGroups = new Map<string, { families: FamilyInfo[]; enrolmentIds: Set<string> }>();

    for (const child of children) {
      const submission = submissionMap.get(child.enrolmentId);
      if (!submission) continue;

      const parent = submission.primaryParent as {
        firstName?: string;
        surname?: string;
        email?: string;
        mobile?: string;
      } | null;

      if (!parent?.email) continue;

      const serviceId = child.serviceId!;
      if (!serviceGroups.has(serviceId)) {
        serviceGroups.set(serviceId, { families: [], enrolmentIds: new Set() });
      }

      const group = serviceGroups.get(serviceId)!;

      // Deduplicate by enrolment — one entry per family, not per child
      if (group.enrolmentIds.has(child.enrolmentId)) continue;
      group.enrolmentIds.add(child.enrolmentId);

      const daysAgo = Math.floor(
        (now.getTime() - child.createdAt.getTime()) / 86400000,
      );

      group.families.push({
        childName: `${child.firstName} ${child.surname}`,
        parentFirstName: parent.firstName ?? "Parent",
        parentEmail: parent.email,
        parentMobile: parent.mobile ?? "",
        enrolledDaysAgo: daysAgo,
      });
    }

    // 4. Fetch service managers
    const serviceIds = [...serviceGroups.keys()];
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: {
        id: true,
        name: true,
        managerId: true,
        manager: { select: { name: true, email: true } },
      },
    });

    let emailsSent = 0;
    let familiesFound = 0;
    const errors: string[] = [];

    for (const service of services) {
      const group = serviceGroups.get(service.id);
      if (!group || group.families.length === 0) continue;

      familiesFound += group.families.length;

      // Skip if no manager assigned
      if (!service.manager) continue;

      try {
        const html = buildWelcomeCheckHtml(
          service.manager.name.split(" ")[0],
          service.name,
          group.families,
        );

        await sendEmail({
          to: service.manager.email,
          subject: `New Family Follow-Up — ${group.families.length} ${group.families.length === 1 ? "family" : "families"} at ${service.name}`,
          html,
        });

        emailsSent++;
      } catch (err) {
        errors.push(
          `${service.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await guard.complete({
      submissions: submissions.length,
      familiesFound,
      emailsSent,
    });

    return NextResponse.json({
      message: "New family welcome check processed",
      submissions: submissions.length,
      familiesFound,
      emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("[Cron: new-family-welcome]", err);
    return NextResponse.json(
      {
        error: "New family welcome cron failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
