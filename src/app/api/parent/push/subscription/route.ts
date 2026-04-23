/**
 * Parent push subscription endpoints.
 *
 * The browser calls `POST` after `PushManager.subscribe()` resolves, and
 * `DELETE` when it calls `unsubscribe()` or when the user disables pushes
 * from the Account page. Both are idempotent.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

// ---------------------------------------------------------------------------
// POST — subscribe (upsert by endpoint, idempotent)
// ---------------------------------------------------------------------------

export const POST = withParentAuth(async (req, { parent }) => {
  const raw = await parseJsonBody(req);
  const parsed = subscribeSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid push subscription payload",
      parsed.error.flatten().fieldErrors,
    );
  }

  // Attach the subscription to one of the parent's contact records. Parents
  // with multiple centre contacts are handled at send-time by the helper
  // that fans out across siblings sharing the same email.
  const contact = await prisma.centreContact.findFirst({
    where: { email: parent.email.toLowerCase() },
    select: { id: true },
  });
  if (!contact) {
    throw ApiError.forbidden("No parent contact record found");
  }

  const { endpoint, keys, userAgent } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      familyId: contact.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    },
    update: {
      familyId: contact.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    },
  });

  return NextResponse.json({ subscribed: true });
});

// ---------------------------------------------------------------------------
// DELETE — unsubscribe (scoped to this parent's contacts to prevent cross-
//         parent deletes if endpoint URLs were ever guessable).
// ---------------------------------------------------------------------------

export const DELETE = withParentAuth(async (req, { parent }) => {
  const raw = await parseJsonBody(req);
  const parsed = unsubscribeSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid unsubscribe payload",
      parsed.error.flatten().fieldErrors,
    );
  }

  const contacts = await prisma.centreContact.findMany({
    where: { email: parent.email.toLowerCase() },
    select: { id: true },
  });

  await prisma.pushSubscription.deleteMany({
    where: {
      endpoint: parsed.data.endpoint,
      familyId: { in: contacts.map((c) => c.id) },
    },
  });

  return NextResponse.json({ subscribed: false });
});
