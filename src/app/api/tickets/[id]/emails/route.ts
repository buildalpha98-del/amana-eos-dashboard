import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

const linkEmailSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  subject: z.string().min(1),
  bodyPreview: z.string().min(1),
  receivedAt: z.string().datetime(),
  messageId: z.string().optional(),
});

// GET /api/tickets/[id]/emails — list emails linked to this ticket
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  const emails = await prisma.ticketEmail.findMany({
    where: { ticketId: id },
    orderBy: { receivedAt: "desc" },
  });

  return NextResponse.json(emails);
}

// POST /api/tickets/[id]/emails — manually link an email to a ticket
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const parsed = linkEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verify ticket exists
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Dedup check on messageId
  if (parsed.data.messageId) {
    const existing = await prisma.ticketEmail.findUnique({
      where: { messageId: parsed.data.messageId },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Email already linked", id: existing.id },
        { status: 409 }
      );
    }
  }

  const email = await prisma.ticketEmail.create({
    data: {
      ticketId: id,
      from: parsed.data.from,
      to: parsed.data.to,
      subject: parsed.data.subject,
      bodyPreview: parsed.data.bodyPreview,
      receivedAt: new Date(parsed.data.receivedAt),
      messageId: parsed.data.messageId ?? null,
      linkedBy: session!.user.id,
    },
  });

  return NextResponse.json(email, { status: 201 });
}
