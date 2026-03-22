import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import {
  isWhatsAppConfigured,
  sendWhatsAppMessage,
  TEMPLATE_MAP,
  GROUP_TYPES,
  MESSAGE_TYPES,
} from "@/lib/whatsapp-360";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const whatsappSendSchema = z.object({
  group: z.enum([...GROUP_TYPES]),
  serviceCode: z.string().optional().nullable(),
  messageType: z.enum([...MESSAGE_TYPES]),
  content: z.object({
    body: z.string().min(1, "Message body is required"),
    header: z.string().optional(),
    footer: z.string().optional(),
  }),
  media: z
    .object({
      type: z.literal("image"),
      url: z.string().url("Media URL must be a valid URL"),
    })
    .optional()
    .nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

/**
 * POST /api/cowork/whatsapp/send
 *
 * Send WhatsApp messages to parent groups via 360dialog.
 * Scope required: whatsapp:write
 */
export const POST = withApiHandler(async (req) => {
  // 1. Authenticate
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    // 3. Validate body
    const body = await req.json();
    const parsed = whatsappSendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { group, serviceCode, messageType, content, media, scheduledAt } =
      parsed.data;

    // centre_parents group requires a serviceCode
    if (group === "centre_parents" && !serviceCode) {
      return NextResponse.json(
        {
          success: false,
          error:
            'serviceCode is required for "centre_parents" group to target a specific centre',
        },
        { status: 400 },
      );
    }

    // 4. Check WhatsApp is configured
    if (!isWhatsAppConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "WhatsApp delivery is not configured (missing WHATSAPP_API_KEY)",
        },
        { status: 503 },
      );
    }

    // 5. Look up WhatsApp groups
    const groups = await prisma.whatsAppGroup.findMany({
      where: {
        groupType: group,
        active: true,
        ...(serviceCode ? { serviceCode } : {}),
      },
    });

    if (groups.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No active WhatsApp group found for type "${group}"${serviceCode ? ` and serviceCode "${serviceCode}"` : ""}`,
        },
        { status: 404 },
      );
    }

    // 6. Map messageType to template name
    const templateName = TEMPLATE_MAP[messageType];
    if (!templateName) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown messageType "${messageType}"`,
        },
        { status: 400 },
      );
    }

    // 7. Send to each matching group
    const results: Array<{ groupId: string; messageId: string }> = [];
    const errors: string[] = [];
    let totalRecipients = 0;

    for (const waGroup of groups) {
      try {
        const result = await sendWhatsAppMessage({
          to: waGroup.whatsappGroupJid,
          templateName,
          body: content.body,
          header: content.header,
          footer: content.footer,
          media: media || undefined,
        });

        results.push({ groupId: waGroup.id, messageId: result.messageId });
        totalRecipients += waGroup.memberCount;
      } catch (err) {
        errors.push(
          `Group "${waGroup.name}": ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "All message sends failed",
          details: errors,
        },
        { status: 500 },
      );
    }

    const messageId = results[0].messageId;
    const status = scheduledAt ? "scheduled" : "sent";

    // 8. Create DeliveryLog
    await prisma.deliveryLog.create({
      data: {
        channel: "whatsapp",
        serviceCode: serviceCode || null,
        messageType,
        externalId: messageId,
        recipientCount: totalRecipients,
        status,
        payload: {
          group,
          serviceCode: serviceCode || null,
          messageType,
          templateName,
          groupsSent: results.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      },
    });

    // 9. Activity log
    await prisma.activityLog.create({
      data: {
        userId: "cowork",
        action: "api_import",
        entityType: "DeliveryLog",
        entityId: messageId,
        details: {
          channel: "whatsapp",
          group,
          messageType,
          serviceCode: serviceCode || null,
          recipientCount: totalRecipients,
          status,
          via: "api_key",
          keyName: "Cowork Automation",
        },
      },
    });

    return NextResponse.json({
      success: true,
      messageId,
      group,
      recipientCount: totalRecipients,
      status,
      ...(errors.length > 0 ? { warnings: errors } : {}),
    });
  } catch (err) {
    logger.error("Cowork WhatsApp Send", { err });
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 },
    );
  }
});
