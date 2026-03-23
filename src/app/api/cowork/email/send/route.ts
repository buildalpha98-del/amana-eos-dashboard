import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { logCoworkActivity } from "@/app/api/cowork/_lib/cowork-activity-log";
import { resolveServiceByCode } from "../../_lib/resolve-service";
import {
  isBrevoConfigured,
  sendTransactionalEmail,
  sendCampaignEmail,
} from "@/lib/brevo";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const emailSendSchema = z.object({
  serviceCode: z.string().min(1, "serviceCode is required"),
  subject: z.string().min(1).max(200, "Subject must be 1–200 characters"),
  htmlContent: z.string().min(1).optional(),
  textContent: z.string().optional(),
  templateId: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string()).max(5).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

/**
 * POST /api/cowork/email/send
 *
 * Send newsletters/emails to parent contact lists via Brevo.
 * Scope required: email:write
 */
export const POST = withApiHandler(async (req) => {
  // 1. Authenticate
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    // 3. Validate body
    const body = await req.json();
    const parsed = emailSendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const {
      serviceCode,
      subject,
      htmlContent,
      textContent,
      templateId,
      tags,
      scheduledAt,
    } = parsed.data;

    // htmlContent is required if no templateId
    if (!templateId && !htmlContent) {
      return NextResponse.json(
        {
          success: false,
          error: "htmlContent is required when templateId is not provided",
        },
        { status: 400 },
      );
    }

    // 4. Check Brevo is configured
    if (!isBrevoConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Email delivery is not configured (missing BREVO_API_KEY)",
        },
        { status: 503 },
      );
    }

    // 5. Resolve contacts
    let contacts: Array<{
      email: string;
      firstName: string | null;
      lastName: string | null;
    }>;

    if (serviceCode.toUpperCase() === "ALL") {
      // Broadcast: all subscribed contacts, deduplicated by email
      const allContacts = await prisma.centreContact.findMany({
        where: { subscribed: true },
        select: { email: true, firstName: true, lastName: true },
      });

      // Deduplicate by email (keep first occurrence)
      const seen = new Set<string>();
      contacts = [];
      for (const c of allContacts) {
        const lower = c.email.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          contacts.push(c);
        }
      }
    } else {
      // Centre-specific
      const service = await resolveServiceByCode(serviceCode);
      if (!service) {
        return NextResponse.json(
          {
            success: false,
            error: `Service with code "${serviceCode}" not found`,
          },
          { status: 404 },
        );
      }

      contacts = await prisma.centreContact.findMany({
        where: { serviceId: service.id, subscribed: true },
        select: { email: true, firstName: true, lastName: true },
      });
    }

    if (contacts.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No contacts found for service code ${serviceCode}`,
        },
        { status: 404 },
      );
    }

    // 6. Build recipient list
    const recipients = contacts.map((c) => ({
      email: c.email,
      name: [c.firstName, c.lastName].filter(Boolean).join(" ") || undefined,
    }));

    // 7. Send via Brevo (transactional < 50, campaign >= 50)
    let messageId: string;
    const status = scheduledAt ? "scheduled" : "sent";

    if (recipients.length < 50) {
      const result = await sendTransactionalEmail({
        to: recipients,
        subject,
        htmlContent: htmlContent || "",
        textContent: textContent || undefined,
        tags: tags || undefined,
        scheduledAt: scheduledAt || undefined,
      });
      messageId = result.messageId;
    } else {
      const result = await sendCampaignEmail({
        recipients,
        subject,
        htmlContent: htmlContent || "",
        tags: tags || undefined,
        scheduledAt: scheduledAt || undefined,
      });
      messageId = `campaign-${result.campaignId}`;
    }

    // 8. Create DeliveryLog
    await prisma.deliveryLog.create({
      data: {
        channel: "email",
        serviceCode: serviceCode.toUpperCase() === "ALL" ? null : serviceCode,
        messageType: tags?.[0] || "newsletter",
        externalId: messageId,
        recipientCount: recipients.length,
        status,
        payload: {
          subject,
          serviceCode,
          recipientCount: recipients.length,
          templateId: templateId || null,
          tags: tags || [],
        },
      },
    });

    // 9. Activity log
    logCoworkActivity({
      action: "api_import",
      entityType: "DeliveryLog",
      entityId: messageId,
      details: { channel: "email", subject, serviceCode, recipientCount: recipients.length, status, via: "api_key", keyName: "Cowork Automation" },
    });

    return NextResponse.json({
      success: true,
      messageId,
      recipientCount: recipients.length,
      serviceCode,
      status,
    });
  } catch (err) {
    logger.error("Cowork Email Send", { err });
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 },
    );
  }
});
