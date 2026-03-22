import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
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
});
