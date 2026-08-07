import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isBrevoConfigured, sendTransactionalEmail } from "@/lib/brevo";
import {
  renderBlocksToHtml,
  interpolateVariables,
  marketingLayout,
  type EmailBlock,
} from "@/lib/email-marketing-layout";
import { withApiAuth } from "@/lib/server-auth";
import { getEmailBranding } from "@/lib/email-branding";
import { isEmailSuppressed } from "@/lib/email-suppression";
import { parseJsonBody } from "@/lib/api-error";

/**
 * POST /api/email/test-send — render the composed email and send it to the
 * session user's OWN address only. No `to` field is accepted: this route can
 * never email anyone but the caller, so suppression is deliberately NOT
 * enforced (we surface a warning instead) and MarketingPost is never touched.
 */
const bodySchema = z.object({
  subject: z.string().min(1).max(500),
  blocks: z.array(z.any()).optional().nullable(),
  htmlContent: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
});

export const POST = withApiAuth(async (req, session) => {
  if (!isBrevoConfigured()) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 503 },
    );
  }

  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const email = session.user.email;
  if (!email) {
    return NextResponse.json(
      { error: "Your account has no email address to send a test to" },
      { status: 400 },
    );
  }

  // ── Resolve HTML content ──────────────────────────────────────
  // Duplicated from /api/email/campaign/send (same resolution order:
  // templateId → blocks → htmlContent) — keep the two in sync.
  let html: string;
  const branding = await getEmailBranding();
  const layoutOpts = {
    headerText: branding.name,
    footerText: branding.name,
    headerColor: branding.primaryColor,
    footerUrl: branding.websiteUrl,
    footerUrlLabel: branding.websiteUrlLabel,
  };

  if (body.templateId) {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: body.templateId },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }
    if (template.blocks) {
      html = renderBlocksToHtml(template.blocks as unknown as EmailBlock[]);
    } else if (template.htmlContent) {
      html = interpolateVariables(
        marketingLayout(template.htmlContent, layoutOpts),
        {},
      );
    } else {
      return NextResponse.json(
        { error: "Template has no content" },
        { status: 400 },
      );
    }
  } else if (body.blocks && body.blocks.length > 0) {
    html = renderBlocksToHtml(body.blocks as unknown as EmailBlock[]);
  } else if (body.htmlContent) {
    html = interpolateVariables(marketingLayout(body.htmlContent, layoutOpts), {});
  } else {
    return NextResponse.json({ error: "No content provided" }, { status: 400 });
  }

  // Suppression is NOT enforced here (you're only emailing yourself), but if
  // the caller's own address is suppressed the mail will likely not arrive —
  // warn so a "test never showed up" isn't misdiagnosed as a send failure.
  const suppressed = await isEmailSuppressed(email);

  const subject = `[Test] ${body.subject}`;

  // ── Send via Brevo ────────────────────────────────────────────
  let externalId: string;
  try {
    const result = await sendTransactionalEmail({
      to: [{ email, name: session.user.name ?? undefined }],
      subject,
      htmlContent: html,
      tags: ["test-send"],
    });
    externalId = result.messageId;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown send error";
    const log = await prisma.deliveryLog.create({
      data: {
        channel: "email",
        messageType: "test",
        // No send happened — nothing to disambiguate.
        externalId: undefined,
        externalIdType: undefined,
        recipientCount: 1,
        status: "failed",
        errorMessage,
        subject,
        templateId: body.templateId ?? undefined,
        renderedHtml: html,
      },
    });
    return NextResponse.json(
      { success: false, deliveryLogId: log.id, email, error: errorMessage },
      { status: 502 },
    );
  }

  const deliveryLog = await prisma.deliveryLog.create({
    data: {
      channel: "email",
      messageType: "test",
      externalId,
      externalIdType: "brevo_message",
      recipientCount: 1,
      status: "sent",
      subject,
      templateId: body.templateId ?? undefined,
      renderedHtml: html,
    },
  });

  return NextResponse.json({
    success: true,
    deliveryLogId: deliveryLog.id,
    email,
    ...(suppressed
      ? {
          warning:
            "your address is on the suppression list — the mail may not arrive",
        }
      : {}),
  });
}, { rateLimit: { max: 5, windowMs: 60_000 } });
