import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const { contactId } = await params;

  const contact = await prisma.centreContact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      firstName: true,
      email: true,
      subscribed: true,
      service: { select: { name: true } },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: contact.id,
    firstName: contact.firstName,
    email: contact.email,
    subscribed: contact.subscribed,
    serviceName: contact.service.name,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const { contactId } = await params;
  const { subscribed } = await req.json();

  const contact = await prisma.centreContact.findUnique({
    where: { id: contactId },
    select: { id: true },
  });

  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.centreContact.update({
    where: { id: contactId },
    data: { subscribed: Boolean(subscribed) },
  });

  return NextResponse.json({ success: true, subscribed: Boolean(subscribed) });
}
