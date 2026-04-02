import crypto from "crypto";
import { logger } from "@/lib/logger";

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET!;

export async function sendTextMessage(to: string, body: string) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
    }
  );
  const responseText = await res.text();
  if (!res.ok) {
    let userMessage = "Failed to send WhatsApp message";
    try {
      const parsed = JSON.parse(responseText);
      const metaMsg = parsed?.error?.message || "";
      if (metaMsg.includes("does not exist") || metaMsg.includes("missing permissions")) {
        userMessage = "WhatsApp phone number is not configured correctly. Please update the Phone Number ID in your environment settings.";
      } else if (res.status === 401 || metaMsg.includes("access token")) {
        userMessage = "WhatsApp access token is invalid or expired. Please regenerate it in Meta Business Suite.";
      } else {
        userMessage = `WhatsApp error: ${metaMsg || responseText}`;
      }
    } catch {
      // Non-JSON response
    }
    logger.error("WhatsApp API error", { status: res.status, response: responseText });
    throw new Error(userMessage);
  }
  if (!responseText) {
    throw new Error("WhatsApp API returned empty response");
  }
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`WhatsApp API returned invalid JSON: ${responseText.substring(0, 200)}`);
  }
}

export function verifyWebhookSignature(signature: string, body: string): boolean {
  const expectedSig = crypto
    .createHmac("sha256", WHATSAPP_APP_SECRET)
    .update(body)
    .digest("hex");
  return signature === `sha256=${expectedSig}`;
}

export function isWithin24HourWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  const now = new Date();
  const diff = now.getTime() - lastInboundAt.getTime();
  return diff < 24 * 60 * 60 * 1000;
}
