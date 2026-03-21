import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { parsePagination } from "@/lib/pagination";

const createContactSchema = z.object({
  waId: z.string().min(1, "WhatsApp ID is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  name: z.string().optional().nullable(),
  parentName: z.string().optional().nullable(),
  childName: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
});

// GET /api/contacts — list all WhatsApp contacts
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const include = {
    service: { select: { id: true, name: true, code: true } },
    _count: {
      select: { tickets: true },
    },
  };
  const orderBy = { createdAt: "desc" as const };

  const pagination = parsePagination(searchParams);

  if (pagination) {
    const [items, total] = await Promise.all([
      prisma.whatsAppContact.findMany({ include, orderBy, skip: pagination.skip, take: pagination.limit }),
      prisma.whatsAppContact.count(),
    ]);
    return NextResponse.json({
      items,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    });
  }

  // Backward-compatible: no pagination params → return flat array (capped at 500 for safety)
  const contacts = await prisma.whatsAppContact.findMany({ include, orderBy, take: 500 });
  return NextResponse.json(contacts);
}

// POST /api/contacts — create a new WhatsApp contact
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = createContactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const contact = await prisma.whatsAppContact.create({
    data: {
      waId: parsed.data.waId,
      phoneNumber: parsed.data.phoneNumber,
      name: parsed.data.name || null,
      parentName: parsed.data.parentName || null,
      childName: parsed.data.childName || null,
      serviceId: parsed.data.serviceId || null,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: {
        select: { tickets: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "WhatsAppContact",
      entityId: contact.id,
      details: { waId: contact.waId, name: contact.name },
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
