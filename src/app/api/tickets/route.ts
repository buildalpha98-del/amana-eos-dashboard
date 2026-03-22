import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";

const createTicketSchema = z.object({
  contactId: z.string().min(1, "Contact is required"),
  subject: z.string().min(1, "Subject is required"),
  priority: z.enum(["urgent", "high", "normal", "low"]).default("normal"),
  serviceId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

// GET /api/tickets — list tickets with optional filters
export const GET = withApiAuth(async (req, session) => {
const stateScope = getStateScope(session);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const assignedToId = searchParams.get("assignedToId");
  const serviceId = searchParams.get("serviceId");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { deleted: false };

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (assignedToId) where.assignedToId = assignedToId;
  if (serviceId) where.serviceId = serviceId;
  // State Manager: only see tickets for services in their assigned state
  if (stateScope) where.service = { state: stateScope };

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { contact: { name: { contains: search, mode: "insensitive" } } },
      { contact: { parentName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const tickets = await prisma.supportTicket.findMany({
    where,
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
      _count: {
        select: { messages: true },
      },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(tickets);
}, { roles: ["owner", "head_office", "admin"] });

// POST /api/tickets — create a manual ticket
export const POST = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = createTicketSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      contactId: parsed.data.contactId,
      subject: parsed.data.subject,
      priority: parsed.data.priority,
      serviceId: parsed.data.serviceId || null,
      assignedToId: parsed.data.assignedToId || null,
    },
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
      _count: {
        select: { messages: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "SupportTicket",
      entityId: ticket.id,
      details: { subject: ticket.subject, priority: ticket.priority },
    },
  });

  return NextResponse.json(ticket, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
