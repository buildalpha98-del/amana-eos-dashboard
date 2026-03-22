import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHmac } from "crypto";
import { withApiHandler } from "@/lib/api-handler";
import { z } from "zod";

const patchSchema = z.object({
  subscribed: z.boolean(),
});

/**
 * Validate the HMAC token to prevent enumeration of contact IDs.
 * Links sent to parents include ?token=HMAC(contactId, secret).
 */
function validateToken(contactId: string, token: string | null): boolean {
  if (!token) return false;
  const secret = process.env.NOTIFICATION_PREF_SECRET || process.env.NEXTAUTH_SECRET || "";
  const expected = createHmac("sha256", secret).update(contactId).digest("hex");
  // Constant-time comparison
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

export const GET = withApiHandler(async (req, context) => {
  const { contactId } = await context!.params!;
  const token = req.nextUrl.searchParams.get("token");

  if (!validateToken(contactId, token)) {
    return NextResponse.json({ error: "Invalid or missing token" }, { status: 403 });
  }

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
});

export const PATCH = withApiHandler(async (req, context) => {
  const { contactId } = await context!.params!;
  const token = req.nextUrl.searchParams.get("token");

  if (!validateToken(contactId, token)) {
    return NextResponse.json({ error: "Invalid or missing token" }, { status: 403 });
  }

  try {
    const raw = await req.json();
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { subscribed } = parsed.data;

    const contact = await prisma.centreContact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });

    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.centreContact.update({
      where: { id: contactId },
      data: { subscribed },
    });

    return NextResponse.json({ success: true, subscribed });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
});
