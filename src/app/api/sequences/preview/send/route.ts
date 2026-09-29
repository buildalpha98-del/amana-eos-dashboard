import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getResend, sendEmail } from "@/lib/email";
import { marketingLayout } from "@/lib/email-marketing-layout";
import { escapeHtml } from "@/lib/email-templates/base";
import { getSequenceLayoutOptions } from "@/lib/sequence-email-render";
import { describeDelay, describeTrigger } from "@/lib/sequence-flow-labels";
import {
  buildFlowPreviews,
  SAMPLE_PARENT_NAME,
  SAMPLE_LEAD_NAME,
  type FlowPreview,
} from "@/lib/sequence-preview";

/**
 * POST /api/sequences/preview/send — email a review pack of every flow step
 * to a COLLEAGUE: one overview email, then each step as its own email with a
 * "[Preview]" subject and a banner saying where it sits in the flow.
 *
 * The recipient must be an active staff account — this route can never be
 * used to mail a family, a school or anyone outside the organisation, which
 * is why the frequency-cap ledger is deliberately not written (same stance
 * as /api/email/test-send). Suppression still applies via `sendEmail`.
 */
const bodySchema = z.object({
  to: z.string().trim().email().max(320),
  sequenceIds: z.array(z.string().min(1)).max(50).optional(),
});

/** Resend's default limit is 2 requests/second — stay under it. */
const SEND_GAP_MS = 600;

export const POST = withApiAuth(
  async (req) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Validation error", parsed.error.flatten());
    }
    const { to, sequenceIds } = parsed.data;

    if (!getResend()) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
    }

    const recipient = await prisma.user.findFirst({
      where: { email: { equals: to, mode: "insensitive" }, active: true },
      select: { email: true, name: true },
    });
    if (!recipient) {
      throw ApiError.badRequest("Previews can only be sent to an active staff account");
    }

    const [{ flows, sampleCentre }, layoutOpts] = await Promise.all([
      buildFlowPreviews({ sequenceIds }),
      getSequenceLayoutOptions(),
    ]);
    if (flows.length === 0) throw ApiError.notFound("No email flows found");

    const outbound: { label: string; subject: string; html: string }[] = [
      {
        label: "Overview",
        subject: `[Preview] Email flows overview — ${flows.length} flow${flows.length === 1 ? "" : "s"}`,
        html: marketingLayout(overviewHtml(flows, sampleCentre), layoutOpts),
      },
    ];
    for (const flow of flows) {
      flow.steps.forEach((step, i) => {
        const position = `${i + 1}/${flow.steps.length}`;
        outbound.push({
          label: `${flow.name} ${position}`,
          subject: `[Preview] ${flow.name} · ${position} · ${step.subject}`,
          html: withBanner(
            step.html,
            `<strong>${escapeHtml(flow.name)}</strong> · email ${position} (${escapeHtml(step.name)}) · ` +
              `sent ${escapeHtml(describeDelay(step.delayHours).toLowerCase())} · trigger: ` +
              `${escapeHtml(describeTrigger(flow.triggerStage))}` +
              (step.source === "missing"
                ? ` · <strong style="color:#b45309">NOT CONFIGURED — recipients currently receive nothing for this step</strong>`
                : ""),
          ),
        });
      });
    }

    let sent = 0;
    const failed: { label: string; error: string }[] = [];
    let suppressed = false;
    for (let i = 0; i < outbound.length; i++) {
      if (i > 0) await sleep(SEND_GAP_MS);
      const email = outbound[i];
      try {
        const result = await sendEmail({ to: recipient.email, subject: email.subject, html: email.html });
        if (result.suppressed.length > 0) {
          suppressed = true;
          break; // every further send would be suppressed too
        }
        if (result.failed) failed.push({ label: email.label, error: result.failed.message });
        else sent++;
      } catch (err) {
        failed.push({ label: email.label, error: err instanceof Error ? err.message : "Send failed" });
      }
    }

    return NextResponse.json({ to: recipient.email, total: outbound.length, sent, failed, suppressed });
  },
  {
    roles: ["owner", "head_office", "admin", "marketing"],
    rateLimit: { max: 3, windowMs: 10 * 60_000 },
  },
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Put a reviewer banner at the top of the email body. */
function withBanner(html: string, bannerInner: string): string {
  const banner =
    `<div style="background:#FEF3C7;border-bottom:1px solid #F59E0B;color:#78350F;` +
    `font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:10px 16px;">` +
    `Preview · ${bannerInner}</div>`;
  const bodyTag = html.match(/<body[^>]*>/i);
  if (!bodyTag || bodyTag.index === undefined) return banner + html;
  const at = bodyTag.index + bodyTag[0].length;
  return html.slice(0, at) + banner + html.slice(at);
}

function overviewHtml(flows: FlowPreview[], sampleCentre: string): string {
  const cell = "padding:6px 8px;border-bottom:1px solid #E5E7EB;font-size:13px;vertical-align:top;";
  const sections = flows
    .map((flow) => {
      const audience = flow.type === "parent_nurture" ? "Families" : "Schools (CRM)";
      const rows = flow.steps
        .map(
          (s, i) =>
            `<tr><td style="${cell}color:#6B7280;">${i + 1}</td>` +
            `<td style="${cell}">${escapeHtml(describeDelay(s.delayHours))}</td>` +
            `<td style="${cell}">${escapeHtml(s.subject)}${
              s.source === "missing"
                ? ` <span style="color:#B45309;font-weight:600;">(not configured)</span>`
                : s.source === "custom"
                  ? ` <span style="color:#6B7280;">(custom)</span>`
                  : ""
            }</td></tr>`,
        )
        .join("");
      return (
        `<h3 style="margin:24px 0 4px;font-size:16px;color:#111827;">${escapeHtml(flow.name)}` +
        `${flow.isActive ? "" : ` <span style="color:#6B7280;font-weight:400;">(paused)</span>`}</h3>` +
        `<p style="margin:0 0 8px;font-size:13px;color:#6B7280;">${audience} · starts at: ${escapeHtml(
          describeTrigger(flow.triggerStage),
        )} · ${flow.activeEnrolments} active</p>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
        `<tr><th align="left" style="${cell}color:#6B7280;">#</th><th align="left" style="${cell}color:#6B7280;">When</th>` +
        `<th align="left" style="${cell}color:#6B7280;">Subject</th></tr>${rows}</table>`
      );
    })
    .join("");
  return (
    `<p style="margin:0 0 8px;font-size:15px;color:#111827;">These are the automated emails the dashboard sends, ` +
    `in order. Each one follows as its own email marked <strong>[Preview]</strong>.</p>` +
    `<p style="margin:0 0 8px;font-size:13px;color:#6B7280;">Sample data: parents are "${SAMPLE_PARENT_NAME}" at ` +
    `${escapeHtml(sampleCentre)}; school contacts are "${SAMPLE_LEAD_NAME}". Links point at the live site.</p>` +
    sections
  );
}
