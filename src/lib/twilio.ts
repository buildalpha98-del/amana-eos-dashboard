/**
 * Twilio SMS helper — sends text messages via the Twilio REST API.
 * No SDK dependency; uses native fetch with basic auth.
 */

import { logger } from "@/lib/logger";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? "";

function isConfigured(): boolean {
  return !!(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
}

function normalisePhone(phone: string): string {
  let cleaned = phone.replace(/\s+/g, "");
  // Australian mobile: 04xx → +614xx
  if (cleaned.startsWith("04")) {
    cleaned = "+61" + cleaned.slice(1);
  }
  // Already E.164
  if (cleaned.startsWith("+")) return cleaned;
  // Fallback: prepend +61 for AU numbers without country code
  if (cleaned.startsWith("0")) return "+61" + cleaned.slice(1);
  return cleaned;
}

export async function sendSMS(to: string, body: string): Promise<boolean> {
  if (!isConfigured()) {
    logger.info("Twilio: not configured — skipping SMS", { to: to.slice(-4) });
    return false;
  }

  const e164 = normalisePhone(to);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: e164, From: FROM_NUMBER, Body: body }).toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error("Twilio: SMS send failed", { to: e164.slice(-4), status: res.status, error: err });
      return false;
    }

    logger.info("Twilio: SMS sent", { to: e164.slice(-4) });
    return true;
  } catch (err) {
    logger.error("Twilio: SMS send threw", { to: e164.slice(-4), error: err });
    return false;
  }
}
