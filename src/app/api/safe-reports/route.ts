/**
 * POST /api/safe-reports — submit an anonymous safe-report
 * GET  /api/safe-reports — list reports (owner / head_office only)
 *
 * The POST is INTENTIONALLY UNAUTHENTICATED. Anyone — including
 * logged-out staff using a personal device — can submit. The intake
 * deliberately ignores the session even when present.
 *
 * No reporter identifier of any kind is stored:
 *   - no session userId
 *   - no IP address (Vercel/Next can see it, we never persist it)
 *   - no user-agent
 *   - no referrer
 *
 * Rate-limiting is per-IP just for spam control (not for attribution).
 * The rate-limit key is held in memory / Upstash only; it does not
 * land in any persistent log linked to the report id.
 *
 * GET is owner / head_office only — these are sensitive records
 * (harassment allegations, retaliation claims, child-safety reports).
 * `admin` is intentionally excluded by default so a misconfigured
 * admin role can't read reports — the owner explicitly delegates.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";

const CATEGORIES = [
  "harassment",
  "discrimination",
  "bullying",
  "safety",
  "conduct",
  "retaliation",
  "child_safety",
  "other",
] as const;

const submitSchema = z.object({
  category: z.enum(CATEGORIES),
  // Up to ~20k chars — long enough to describe a chronic pattern with
  // dates, but short enough that abuse-by-volume is limited.
  content: z.string().min(20).max(20_000),
  serviceId: z.string().min(1).nullable().optional(),
});

// ─── POST: anonymous intake ──────────────────────────────────────────

export const POST = withApiHandler(async (req) => {
  // Per-IP rate limit ONLY for spam control. The IP doesn't get
  // persisted with the report. Five submissions per hour is generous
  // for a real reporter but harsh for a spambot.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // 5 submissions per hour per IP. Positional args: (key, max, windowMs).
  const limit = await checkRateLimit(`safe-report:${ip}`, 5, 60 * 60_000);
  if (limit.limited) {
    // Generic 429 — don't disclose what the limit is to avoid helping
    // someone calibrate an automated attack.
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 },
    );
  }

  const raw = await parseJsonBody(req);
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }

  // Defensive: if the service id was supplied but is bogus, drop it
  // rather than fail (a real reporter shouldn't get tripped by a UI
  // bug). Empty string also normalises to null.
  let serviceId: string | null =
    parsed.data.serviceId && parsed.data.serviceId.trim() !== ""
      ? parsed.data.serviceId
      : null;
  if (serviceId) {
    const exists = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true },
    });
    if (!exists) serviceId = null;
  }

  const created = await prisma.safeReport.create({
    data: {
      category: parsed.data.category,
      content: parsed.data.content,
      serviceId,
    },
    select: { id: true, createdAt: true, category: true },
  });

  // Notify the owner(s) by email. The email is INTENTIONALLY thin —
  // category, timestamp, a snippet. No identifying detail beyond
  // what was in the report itself (which the reporter chose to share).
  try {
    const owners = await prisma.user.findMany({
      where: { active: true, role: { in: ["owner", "head_office"] } },
      select: { email: true, name: true },
    });
    const snippet = parsed.data.content.slice(0, 300);
    const moreLink = `${process.env.NEXTAUTH_URL ?? ""}/safe-reports/${created.id}`;
    for (const o of owners) {
      // Best-effort — if email fails, we still want the record saved.
      // The record itself is the durable artifact.
      try {
        await sendEmail({
          to: o.email,
          subject: `[Safe report] New ${parsed.data.category.replace(/_/g, " ")} report`,
          html: `<p>A new anonymous safe report has been submitted.</p>
                 <p><strong>Category:</strong> ${parsed.data.category.replace(/_/g, " ")}</p>
                 <p><strong>Received:</strong> ${created.createdAt.toISOString()}</p>
                 <p><strong>First 300 characters:</strong></p>
                 <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#444;white-space:pre-wrap;">${escapeHtml(snippet)}${
                   parsed.data.content.length > 300 ? "…" : ""
                 }</blockquote>
                 <p><a href="${moreLink}">View full report in dashboard</a></p>
                 <p style="color:#888;font-size:12px;">This report is anonymous. The system does not record the reporter's identity, IP address, or user-agent.</p>`,
        });
      } catch (err) {
        logger.warn("Safe-report owner email failed", {
          ownerEmail: o.email,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    // Listing owners failed — the report is still saved. Log loudly.
    logger.error("Safe-report owner notification: lookup failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Log JUST enough to monitor volume + spam. Crucially: no IP, no
  // session, no user-agent in this log entry. Just category + id +
  // length.
  logger.info("Safe report received", {
    reportId: created.id,
    category: created.category,
    length: parsed.data.content.length,
  });

  // Return the bare minimum — id + ack timestamp. Reporter can quote
  // the id to follow up if they later identify themselves voluntarily.
  return NextResponse.json(
    { id: created.id, receivedAt: created.createdAt.toISOString() },
    { status: 201 },
  );
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── GET: owner/head_office triage list ──────────────────────────────

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");

    const where: Record<string, unknown> = { deleted: false };
    if (status) where.status = status;
    if (category) where.category = category;

    const reports = await prisma.safeReport.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ reports });
  },
  { roles: ["owner", "head_office"] },
);
