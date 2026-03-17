import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const serviceIds = req.nextUrl.searchParams.getAll("serviceId");

  const contacts = await prisma.centreContact.findMany({
    where: {
      subscribed: true,
      ...(serviceIds.length > 0 && { serviceId: { in: serviceIds } }),
    },
    select: { email: true },
  });

  const uniqueEmails = new Set(
    contacts.map((c) => c.email.toLowerCase()),
  );

  return NextResponse.json({ count: uniqueEmails.size });
}
