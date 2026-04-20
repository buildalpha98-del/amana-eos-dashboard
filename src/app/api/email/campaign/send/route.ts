import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  isBrevoConfigured,
  sendTransactionalEmail,
  sendCampaignEmail,
} from "@/lib/brevo";
import {
  renderBlocksToHtml,
  interpolateVariables,
  marketingLayout,
  type EmailBlock,
} from "@/lib/email-marketing-layout";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  templateId: z.string().optional().nullable(),
  subject: z.string().min(1).max(500),
  htmlContent: z.string().optional().nullable(),
  blocks: z.array(z.any()).optional().nullable(),
  serviceIds: z.array(z.string()).optional(),
  allCentres: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  enquiryId: z.string().optional().nullable(),
  postId: z.string().optional().nullable(),
  variables: z.record(z.string(), z.string()).optional(),
});

export const POST = withApiAuth(async (req, session) => {
if (!isBrevoConfigured()) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 503 },
    );
  }

  // Read body ONCE upfront — req.json() can only be called once
  let raw: unknown;
  try {
    raw = await parseJsonBody(req);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;

  // Coordinators can only send enquiry emails
  if (session.user.role === "coordinator" && !body.enquiryId) {
    return NextResponse.json(
      { error: "Coordinators can only send enquiry emails" },
      { status: 403 },
    );
  }

  // Double-send protection
  if (body.postId) {
    const post = await prisma.marketingPost.findUnique({
      where: { id: body.postId },
      select: { deliveryLogId: true },
    });
    if (post?.deliveryLogId) {
      return NextResponse.json(
        { error: "This post has already been sent" },
        { status: 409 },
      );
    }
  }

  // ── Resolve HTML content ──────────────────────────────────────
  let html: string;
  const vars = body.variables ?? {};

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
      html = renderBlocksToHtml(template.blocks as unknown as EmailBlock[], vars);
    } else if (template.htmlContent) {
      html = interpolateVariables(marketingLayout(template.htmlContent), vars);
    } else {
      return NextResponse.json(
        { error: "Template has no content" },
        { status: 400 },
      );
    }
  } else if (body.blocks && body.blocks.length > 0) {
    html = renderBlocksToHtml(body.blocks as unknown as EmailBlock[], vars);
  } else if (body.htmlContent) {
    html = interpolateVariables(marketingLayout(body.htmlContent), vars);
  } else {
    return NextResponse.json(
      { error: "No content provided" },
      { status: 400 },
    );
  }

  // ── Resolve recipients ────────────────────────────────────────
  let recipients: Array<{ email: string; name?: string }>;
  let messageType = "newsletter";
  let entityType: string | undefined;
  let entityId: string | undefined;

  if (body.enquiryId) {
    const enquiry = await prisma.parentEnquiry.findUnique({
      where: { id: body.enquiryId },
      include: { service: { select: { name: true } } },
    });
    if (!enquiry) {
      return NextResponse.json(
        { error: "Enquiry not found" },
        { status: 404 },
      );
    }
    if (!enquiry.parentEmail) {
      return NextResponse.json(
        { error: "Enquiry has no parent email address" },
        { status: 400 },
      );
    }
    recipients = [{ email: enquiry.parentEmail, name: enquiry.parentName }];
    messageType = "enquiry";
    entityType = "ParentEnquiry";
    entityId = enquiry.id;
  } else {
    // Query subscribed contacts, optionally filtered by serviceIds
    const where: Record<string, unknown> = { subscribed: true };
    if (body.serviceIds && body.serviceIds.length > 0 && !body.allCentres) {
      where.serviceId = { in: body.serviceIds };
    }

    const contacts = await prisma.centreContact.findMany({
      where,
      select: { email: true, firstName: true, lastName: true },
    });

    // Deduplicate by email
    const seen = new Set<string>();
    recipients = [];
    for (const c of contacts) {
      const lower = c.email.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined;
        recipients.push({ email: c.email, name });
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No subscribed recipients found" },
        { status: 400 },
      );
    }

    if (body.postId) {
      entityType = "MarketingPost";
      entityId = body.postId;
    }
  }

  // ── Send via Brevo ────────────────────────────────────────────
  let externalId: string | undefined;
  let status = "sent";

  try {
    if (recipients.length < 50) {
      const result = await sendTransactionalEmail({
        to: recipients,
        subject: body.subject,
        htmlContent: html,
        scheduledAt: body.scheduledAt ?? undefined,
      });
      externalId = result.messageId;
    } else {
      const result = await sendCampaignEmail({
        recipients,
        subject: body.subject,
        htmlContent: html,
        scheduledAt: body.scheduledAt ?? undefined,
      });
      externalId = String(result.campaignId);
    }

    if (body.scheduledAt) {
      status = "scheduled";
    }
  } catch (err) {
    status = "failed";
    const errorMessage =
      err instanceof Error ? err.message : "Unknown send error";

    // Log the failed delivery
    const log = await prisma.deliveryLog.create({
      data: {
        channel: "email",
        messageType,
        externalId: undefined,
        recipientCount: recipients.length,
        status: "failed",
        errorMessage,
        subject: body.subject,
        templateId: body.templateId ?? undefined,
        entityType,
        entityId,
        renderedHtml: html,
        payload: raw as object,
      },
    });

    return NextResponse.json(
      {
        success: false,
        deliveryLogId: log.id,
        recipientCount: recipients.length,
        status: "failed",
        error: errorMessage,
      },
      { status: 502 },
    );
  }

  // ── Create DeliveryLog ────────────────────────────────────────
  const deliveryLog = await prisma.deliveryLog.create({
    data: {
      channel: "email",
      messageType,
      externalId,
      recipientCount: recipients.length,
      status,
      subject: body.subject,
      templateId: body.templateId ?? undefined,
      entityType,
      entityId,
      renderedHtml: html,
      payload: raw as object,
    },
  });

  // ── Update linked entities ────────────────────────────────────
  const updates: Promise<unknown>[] = [];

  if (body.enquiryId) {
    updates.push(
      prisma.parentEnquiry.update({
        where: { id: body.enquiryId },
        data: { lastEmailSentAt: new Date() },
      }),
    );
  }

  if (body.postId) {
    updates.push(
      prisma.marketingPost.update({
        where: { id: body.postId },
        data: { deliveryLogId: deliveryLog.id },
      }),
    );
  }

  // Activity log
  updates.push(
    prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "email_sent",
        entityType: entityType ?? "DeliveryLog",
        entityId: entityId ?? deliveryLog.id,
        details: {
          deliveryLogId: deliveryLog.id,
          subject: body.subject,
          recipientCount: recipients.length,
          status,
        },
      },
    }),
  );

  await Promise.all(updates);

  return NextResponse.json({
    success: true,
    deliveryLogId: deliveryLog.id,
    recipientCount: recipients.length,
    status,
  });
});
