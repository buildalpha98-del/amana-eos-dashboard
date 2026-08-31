import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/activation-qr";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  name: z.string().min(1, "Your name is required").max(200),
  email: z.string().email("A valid email is required").max(320),
  phone: z.string().max(40).optional().nullable(),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(1, "Please describe how we can help").max(5000),
  /** Honeypot — bots fill anything; real users leave empty. */
  website: z.string().optional(),
});

/**
 * Public "submit a ticket" form on /support. Creates a SupportTicket
 * (source "portal") so the enquiry lands in the contact-centre queue with
 * the existing assignment/priority/SLA machinery — no parallel ticket
 * system. SupportTicket requires a WhatsAppContact, so we find-or-create
 * a stub keyed by email (same pattern as the NPS-detractor webhook).
 */
export const POST = withApiHandler(async (req) => {
  // IP-based rate limit to deter form spam — 5 submissions / 15 min per IP.
  const ip = clientIpFromRequest(req) ?? "anon";
  const rl = await checkRateLimit(`help-centre-ticket:${ip}`, 5, 15 * 60_000);
  if (rl.limited) {
    throw new ApiError(429, "Too many submissions — please try again in a few minutes");
  }

  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  const data = parsed.data;

  // Honeypot trip → silently 200 so bots don't learn.
  if (data.website && data.website.trim().length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const email = data.email.trim().toLowerCase();
  const waId = `help-${email}`;

  try {
    const contact =
      (await prisma.whatsAppContact.findUnique({ where: { waId }, select: { id: true } })) ??
      (await prisma.whatsAppContact.create({
        data: {
          waId,
          phoneNumber: data.phone?.trim() || "",
          name: email,
          parentName: data.name.trim(),
        },
        select: { id: true },
      }));

    const ticket = await prisma.supportTicket.create({
      data: {
        contactId: contact.id,
        source: "portal",
        subject: data.subject.trim(),
        tags: ["help-centre"],
        lastInboundAt: new Date(),
        messages: {
          create: {
            direction: "inbound",
            senderName: data.name.trim(),
            body: [
              data.message.trim(),
              "",
              `— Submitted via the Help Centre by ${data.name.trim()} <${email}>${data.phone?.trim() ? `, ${data.phone.trim()}` : ""}`,
            ].join("\n"),
          },
        },
      },
      select: { ticketNumber: true },
    });

    return NextResponse.json(
      { ok: true, ticketNumber: ticket.ticketNumber },
      { status: 201 },
    );
  } catch (err) {
    logger.error("help-centre ticket create failed", { err });
    throw err;
  }
});
