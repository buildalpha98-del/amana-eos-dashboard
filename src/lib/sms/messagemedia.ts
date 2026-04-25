/**
 * MessageMedia SMS adapter.
 *
 * Auth: Basic auth with API_KEY:API_SECRET. Endpoint:
 *   POST https://api.messagemedia.com/v1/messages
 * Reference: https://docs.messagemedia.com/reference/sendmessages
 *
 * Env vars (loaded lazily so a missing key in dev/preview doesn't crash boot):
 *   - MESSAGEMEDIA_API_KEY
 *   - MESSAGEMEDIA_API_SECRET
 *
 * The lib at ./index.ts is the only public entry — call `sendSms()` there.
 */

import { logger } from "@/lib/logger";
import type { SendSmsResult } from "./index";

interface MessageMediaPayload {
  to: { number: string; contactId?: string }[];
  body: string;
  from: string;
}

interface MessageMediaResponse {
  messages?: Array<{
    message_id?: string;
    status?: string;
    destination_number?: string;
  }>;
}

export async function sendViaMessageMedia(
  payload: MessageMediaPayload,
): Promise<SendSmsResult> {
  const apiKey = process.env.MESSAGEMEDIA_API_KEY;
  const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;

  if (!apiKey || !apiSecret) {
    logger.warn(
      "sendViaMessageMedia: MESSAGEMEDIA_API_KEY/SECRET missing despite SMS_PROVIDER=messagemedia",
    );
    return { ok: false, reason: "not_configured" };
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const body = {
    messages: payload.to.map((r) => ({
      content: payload.body,
      destination_number: r.number,
      source_number: payload.from,
      // Allow long-message (>160 char) split on the provider side
      format: "SMS",
      delivery_report: false,
    })),
  };

  try {
    const res = await fetch("https://api.messagemedia.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
      // Hard timeout: SMS dispatch shouldn't block a request indefinitely
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      logger.error("sendViaMessageMedia: provider returned non-2xx", {
        status: res.status,
        body: errBody.slice(0, 500),
      });
      return {
        ok: false,
        reason: "provider_error",
        details: { status: res.status, body: errBody.slice(0, 500) },
      };
    }

    const json = (await res.json()) as MessageMediaResponse;
    const messageIds = (json.messages ?? [])
      .map((m) => m.message_id)
      .filter((id): id is string => Boolean(id));

    return { ok: true, provider: "messagemedia", messageIds };
  } catch (err) {
    logger.error("sendViaMessageMedia: dispatch threw", { error: err });
    return {
      ok: false,
      reason: "provider_error",
      details: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}
