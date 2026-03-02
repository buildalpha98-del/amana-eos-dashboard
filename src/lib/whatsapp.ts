import crypto from "crypto";

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
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`);
  }
  return res.json();
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
