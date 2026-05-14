import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * POST /api/sms/inbound — Twilio inbound SMS webhook.
 *
 * Twilio POSTs application/x-www-form-urlencoded data here whenever a parent
 * replies to one of our SMS messages. We turn each reply into a
 * `ParentFeedback` row with `source: "sms_reply"` so it lands in the staff
 * triage queue at /feedback.
 *
 * Signature verification follows Twilio's HMAC-SHA1 scheme described at
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security — when
 * TWILIO_AUTH_TOKEN is set we compare the X-Twilio-Signature header against
 * a recomputed signature; mismatches are rejected with 403. In dev (no
 * auth token), the check is skipped with a warn-level log so localhost
 * curl tests still work.
 *
 * The endpoint always returns 200 with empty `<Response/>` TwiML so Twilio
 * doesn't retry on parse errors — failures are logged but never block the
 * 2xx so a misformatted reply doesn't trigger Twilio's retry storm.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const fromNumber = params.get("From") ?? "";
  const body = (params.get("Body") ?? "").trim();
  const messageSid = params.get("MessageSid") ?? "";
  const toNumber = params.get("To") ?? "";

  if (!verifyTwilioSignature(req, raw)) {
    logger.warn("sms/inbound: signature mismatch — rejecting", {
      messageSid,
      fromHint: fromNumber.slice(-4),
    });
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!fromNumber || !body) {
    logger.warn("sms/inbound: missing From or Body", { messageSid });
    return twimlOk();
  }

  // Try to resolve the contact + service by the From number.
  // CentreContact.mobile is the most authoritative source for active parents.
  let contact: { id: string; serviceId: string; firstName: string | null; lastName: string | null } | null = null;
  try {
    contact = await prisma.centreContact.findFirst({
      where: { mobile: fromNumber, status: "active" },
      select: { id: true, serviceId: true, firstName: true, lastName: true },
    });
  } catch (err) {
    logger.error("sms/inbound: contact lookup failed", { err, fromHint: fromNumber.slice(-4) });
  }

  try {
    await prisma.parentFeedback.create({
      data: {
        source: "sms_reply",
        channel: "sms",
        surveyType: "sms_reply",
        fromNumber,
        contactId: contact?.id ?? null,
        serviceId: contact?.serviceId ?? null,
        parentName: contact
          ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null
          : null,
        comments: body,
        status: "new",
        actionRequired: false,
        responses: { messageSid, to: toNumber },
      },
    });
  } catch (err) {
    logger.error("sms/inbound: failed to write ParentFeedback row", {
      err,
      messageSid,
    });
  }

  return twimlOk();
});

function twimlOk(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Verify Twilio's HMAC-SHA1 signature. If TWILIO_AUTH_TOKEN is not set,
 * we skip with a warning — typical of dev environments.
 */
function verifyTwilioSignature(req: NextRequest, rawBody: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.warn("sms/inbound: TWILIO_AUTH_TOKEN not set; skipping signature check");
    return true;
  }
  const signature = req.headers.get("x-twilio-signature");
  if (!signature) return false;

  // Twilio signs: concat(url, alphaSortedParams.join(key+value))
  const url = req.url;
  const params = new URLSearchParams(rawBody);
  const sorted = Array.from(params.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const data = url + sorted.map(([k, v]) => k + v).join("");
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(data)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}
