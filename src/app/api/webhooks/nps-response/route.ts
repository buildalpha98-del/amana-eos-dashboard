import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const npsSchema = z.object({
  email: z.string().email(),
  score: z.number().int().min(0).max(10),
  comment: z.string().optional(),
  serviceCode: z.string().optional(),
});

function categorise(score: number): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

/**
 * POST /api/webhooks/nps-response
 *
 * Receives NPS survey responses from Typeform, Google Forms, or a custom survey page.
 * Stores the score, categorises the parent, and triggers automated follow-up actions.
 *
 * Auth: shared secret via query param or header.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  // ── Auth ─────────────────────────────────────────────────────
  const secret = process.env.WEBHOOK_NPS_SECRET;
  if (!secret) {
    logger.error("WEBHOOK_NPS_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = req.headers.get("x-webhook-secret");

  const queryMatch = querySecret !== null && constantTimeEqual(querySecret, secret);
  const headerMatch = headerSecret !== null && constantTimeEqual(headerSecret, secret);

  if (!queryMatch && !headerMatch) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────
  const body = await parseJsonBody(req);
  const parsed = npsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { email, score, comment, serviceCode } = parsed.data;
  const category = categorise(score);

  // ── 1. Look up CentreContact by email ────────────────────────
  const contactWhere = serviceCode
    ? { email, service: { code: serviceCode } }
    : { email };

  const contact = await prisma.centreContact.findFirst({
    where: contactWhere,
    select: {
      id: true,
      firstName: true,
      serviceId: true,
      service: { select: { id: true, name: true, code: true, managerId: true } },
    },
  });

  if (!contact) {
    return NextResponse.json(
      { error: "Contact not found for this email" },
      { status: 404 },
    );
  }

  const serviceId = contact.serviceId;
  const serviceName = contact.service.name;
  const firstName = contact.firstName || "Parent";
  const managerId = contact.service.managerId || null;

  // ── 2. Upsert NpsSurveyResponse (idempotent) ────────────────
  const existingResponse = await prisma.npsSurveyResponse.findFirst({
    where: { contactId: contact.id, serviceId },
    select: { id: true },
  });

  let npsResponse;
  if (existingResponse) {
    npsResponse = await prisma.npsSurveyResponse.update({
      where: { id: existingResponse.id },
      data: {
        score,
        comment: comment || null,
        category,
        followUpStatus: "pending",
        respondedAt: new Date(),
      },
    });
  } else {
    npsResponse = await prisma.npsSurveyResponse.create({
      data: {
        serviceId,
        contactId: contact.id,
        score,
        comment: comment || null,
        category,
      },
    });
  }

  // ── 3. Trigger follow-up actions ─────────────────────────────
  const actionsTriggered: string[] = [];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow

  if (category === "promoter") {
    // 3a. Schedule a review_request nurture step for tomorrow
    const existingStep = await prisma.parentNurtureStep.findUnique({
      where: { contactId_templateKey: { contactId: contact.id, templateKey: "review_request" } },
      select: { id: true },
    });

    if (!existingStep) {
      await prisma.parentNurtureStep.create({
        data: {
          serviceId,
          contactId: contact.id,
          stepNumber: 7,
          templateKey: "review_request",
          scheduledFor: tomorrow,
          status: "pending",
        },
      });
    }
    actionsTriggered.push("review_request_scheduled");

    // 3b. Create testimonial capture task
    await prisma.marketingTask.create({
      data: {
        title: `Capture testimonial from ${firstName} at ${serviceName}`,
        description: `${firstName} scored ${score}/10 on the NPS survey — a promoter! Reach out to capture a testimonial for marketing use.${comment ? `\n\nComment: "${comment}"` : ""}`,
        status: "todo",
        priority: "low",
        dueDate: tomorrow,
        serviceId,
        assigneeId: managerId,
      },
    });
    actionsTriggered.push("testimonial_task_created");
  } else if (category === "passive") {
    // Create follow-up task assigned to service manager
    await prisma.marketingTask.create({
      data: {
        title: `Follow up with ${firstName} at ${serviceName} — understand their experience`,
        description: `${firstName} scored ${score}/10 on the NPS survey (passive). Follow up to understand what could be improved.${comment ? `\n\nComment: "${comment}"` : ""}`,
        status: "todo",
        priority: "medium",
        dueDate: tomorrow,
        serviceId,
        assigneeId: managerId,
      },
    });
    actionsTriggered.push("passive_followup_task_created");
  } else {
    // Detractor (0-6)
    // 3a. Create urgent follow-up task
    await prisma.marketingTask.create({
      data: {
        title: `⚠️ Urgent: unhappy parent ${firstName} at ${serviceName} — call within 24 hours`,
        description: `${firstName} scored ${score}/10 on the NPS survey (detractor). Immediate follow-up required.${comment ? `\n\nComment: "${comment}"` : ""}`,
        status: "todo",
        priority: "high",
        dueDate: tomorrow,
        serviceId,
        assigneeId: managerId,
      },
    });
    actionsTriggered.push("detractor_urgent_task_created");

    // 3b. Create SupportTicket via WhatsAppContact lookup/creation
    // SupportTicket requires a WhatsAppContact — find or create a stub
    let waContact = await prisma.whatsAppContact.findFirst({
      where: { name: email, serviceId },
      select: { id: true },
    });

    if (!waContact) {
      waContact = await prisma.whatsAppContact.create({
        data: {
          waId: `nps-${contact.id}`,
          phoneNumber: "",
          name: email,
          parentName: firstName,
          serviceId,
        },
      });
    }

    await prisma.supportTicket.create({
      data: {
        contactId: waContact.id,
        subject: `NPS Detractor Alert — ${firstName} at ${serviceName}`,
        priority: "high",
        serviceId,
        assignedToId: managerId,
        tags: ["nps-detractor", "auto-created"],
      },
    });

    // If there's a comment, add it as a ticket message
    if (comment) {
      const ticket = await prisma.supportTicket.findFirst({
        where: { contactId: waContact.id, subject: { contains: "NPS Detractor Alert" } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (ticket) {
        await prisma.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            direction: "inbound",
            body: `NPS Survey Comment (score: ${score}/10):\n\n"${comment}"`,
          },
        });
      }
    }

    actionsTriggered.push("detractor_ticket_created");
  }

  // ── 4. Log to ActivityLog ────────────────────────────────────
  await prisma.activityLog.create({
    data: {
      userId: managerId || "system",
      action: "create",
      entityType: "NpsSurveyResponse",
      entityId: npsResponse.id,
      details: {
        email,
        score,
        category,
        serviceName,
        actionsTriggered,
      },
    },
  });

  return NextResponse.json({
    success: true,
    score,
    category,
    actionsTriggered,
  });
});
