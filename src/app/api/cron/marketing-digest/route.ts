import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { getResend, sendEmail } from "@/lib/email";
import { marketingDigestEmail } from "@/lib/email-templates";

// ── Thresholds ──────────────────────────────────────────────
const WEEKLY_TARGET = 3;
const STALE_LEAD_DAYS = 7;

/**
 * Format a Date as DD/MM/YYYY (Australian).
 */
function formatAU(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/**
 * GET /api/cron/marketing-digest
 *
 * Weekly Friday email digest that compiles marketing performance data
 * and sends it to leadership.
 */
export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("marketing-digest", "weekly");
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
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weekEnding = formatAU(now);

    // ── 1. Fetch active services ──────────────────────────────
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });

    // ── 2a. Coverage: posts per service in last 7 days ────────
    const centreData: Array<{
      name: string;
      posts: number;
      status: string;
      bookingDelta: number;
    }> = [];

    // Batch-query post counts per service
    const postCounts = await Promise.all(
      services.map((svc) =>
        prisma.marketingPostService.count({
          where: {
            serviceId: svc.id,
            post: { deleted: false, createdAt: { gte: sevenDaysAgo } },
          },
        }),
      ),
    );

    // ── 2f. Utilisation delta: this week vs last week bookings ─
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const bookingForecasts = await prisma.bookingForecast.findMany({
      where: {
        serviceId: { in: services.map((s) => s.id) },
        date: { gte: fourteenDaysAgo },
      },
      select: { serviceId: true, date: true, total: true },
    });

    // Sum totals per service per week
    const bookingsByService = new Map<
      string,
      { thisWeek: number; lastWeek: number }
    >();
    for (const svc of services) {
      bookingsByService.set(svc.id, { thisWeek: 0, lastWeek: 0 });
    }
    for (const bf of bookingForecasts) {
      const entry = bookingsByService.get(bf.serviceId);
      if (!entry) continue;
      if (bf.date >= sevenDaysAgo) {
        entry.thisWeek += bf.total;
      } else {
        entry.lastWeek += bf.total;
      }
    }

    // Build per-centre data
    let activeCentres = 0;
    let moderateCentres = 0;
    let neglectedCentres = 0;

    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      const posts = postCounts[i];
      const status =
        posts >= WEEKLY_TARGET
          ? "active"
          : posts > 0
            ? "moderate"
            : "neglected";

      if (status === "active") activeCentres++;
      else if (status === "moderate") moderateCentres++;
      else neglectedCentres++;

      const bookings = bookingsByService.get(svc.id)!;
      const bookingDelta = bookings.thisWeek - bookings.lastWeek;

      centreData.push({
        name: svc.name,
        posts,
        status,
        bookingDelta,
      });
    }

    // ── 2b. Content output ────────────────────────────────────
    const [postsCreated, postsPublished, postsDraft] = await Promise.all([
      prisma.marketingPost.count({
        where: { deleted: false, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.marketingPost.count({
        where: {
          deleted: false,
          status: "published",
          updatedAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.marketingPost.count({
        where: { deleted: false, status: "draft" },
      }),
    ]);

    // ── 2c. Task completion ───────────────────────────────────
    const [tasksCompleted, tasksOpen, tasksOverdue] = await Promise.all([
      prisma.marketingTask.count({
        where: {
          deleted: false,
          status: "done",
          updatedAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.marketingTask.count({
        where: { deleted: false, status: { not: "done" } },
      }),
      prisma.marketingTask.count({
        where: {
          deleted: false,
          status: { not: "done" },
          dueDate: { lt: now },
        },
      }),
    ]);

    // ── 2d. CRM pipeline ─────────────────────────────────────
    const staleCutoff = new Date(now);
    staleCutoff.setDate(staleCutoff.getDate() - STALE_LEAD_DAYS);

    const [newLeads, stageChanges, staleLeads] = await Promise.all([
      prisma.lead.count({
        where: { deleted: false, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.lead.count({
        where: {
          deleted: false,
          stageChangedAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.lead.count({
        where: {
          deleted: false,
          pipelineStage: { notIn: ["won", "lost"] },
          touchpoints: { none: { sentAt: { gte: staleCutoff } } },
        },
      }),
    ]);

    // ── 2e. Conversion pipeline ──────────────────────────────
    const conversions = await prisma.conversionOpportunity.count({
      where: {
        status: "converted",
        updatedAt: { gte: sevenDaysAgo },
      },
    });

    // ── 3. Auto-generate action items ────────────────────────
    const actionItems: string[] = [];

    // Worst-performing centres
    const neglected = centreData.filter((c) => c.status === "neglected");
    if (neglected.length > 0) {
      const names = neglected
        .slice(0, 3)
        .map((c) => c.name)
        .join(", ");
      actionItems.push(
        `${neglected.length} centre(s) with zero posts this week — prioritise content for ${names}`,
      );
    }

    // Overdue tasks
    if (tasksOverdue > 0) {
      actionItems.push(
        `${tasksOverdue} overdue marketing task(s) — review and reassign or close`,
      );
    }

    // Stale leads
    if (staleLeads > 0) {
      actionItems.push(
        `${staleLeads} lead(s) with no touchpoint in 7+ days — schedule follow-ups`,
      );
    }

    // Ensure at least one item
    if (actionItems.length === 0) {
      actionItems.push(
        "All centres on track — maintain momentum and plan next week's content calendar",
      );
    }

    // Cap at 3 items
    const topActions = actionItems.slice(0, 3);

    // ── 4. Build & send email ────────────────────────────────
    const summary = {
      activeCentres,
      moderateCentres,
      neglectedCentres,
      postsPublished,
      tasksCompleted,
      tasksOverdue,
      newLeads,
      conversions,
    };

    const { subject, html } = marketingDigestEmail({
      weekEnding,
      centres: centreData,
      summary,
      actionItems: topActions,
    });

    // Determine recipient: first owner user as fallback
    const owner = await prisma.user.findFirst({
      where: { role: "owner", active: true },
      select: { email: true },
      orderBy: { createdAt: "asc" },
    });

    const recipientEmail = owner?.email;
    if (!recipientEmail) {
      await guard.fail(new Error("No owner user found to send digest to"));
      return NextResponse.json(
        { error: "No recipient found for marketing digest" },
        { status: 500 },
      );
    }

    const emailResult = await sendEmail({
      to: recipientEmail,
      subject,
      html,
    });

    // ── 5. Log to DeliveryLog ────────────────────────────────
    await prisma.deliveryLog.create({
      data: {
        channel: "email",
        messageType: "marketing_digest",
        externalId: emailResult.messageId || null,
        recipientCount: emailResult.sent.length,
        status: emailResult.sent.length > 0 ? "sent" : "failed",
        payload: { weekEnding, summary } as any,
      },
    });

    const result = {
      message: "Marketing digest sent",
      recipient: recipientEmail,
      summary: {
        activeCentres,
        moderateCentres,
        neglectedCentres,
        postsPublished,
        postsCreated,
        postsDraft,
        tasksCompleted,
        tasksOpen,
        tasksOverdue,
        newLeads,
        stageChanges,
        staleLeads,
        conversions,
      },
    };

    await guard.complete(result);

    return NextResponse.json(result);
  } catch (err) {
    await guard.fail(err);
    console.error("[Cron: marketing-digest]", err);
    return NextResponse.json(
      {
        error: "Marketing digest cron failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
