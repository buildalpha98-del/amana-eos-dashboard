import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getSuppressedEmails } from "@/lib/email-suppression";

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

  // Mirror campaign/send's suppression filter — the count preview should
  // match what will actually go out, not the raw subscribed count.
  const suppressed = await getSuppressedEmails([...uniqueEmails]);
  const count = [...uniqueEmails].filter(
    (email) => !suppressed.has(email.toLowerCase()),
  ).length;

  return NextResponse.json({ count });
});
