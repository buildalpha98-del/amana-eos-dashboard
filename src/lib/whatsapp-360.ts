/**
 * 360dialog WhatsApp Business API client.
 *
 * Sends template-based WhatsApp messages to groups or individual contacts
 * via the 360dialog Cloud API.
 *
 * API docs: https://docs.360dialog.io/
 */

const WA_API_KEY = process.env.WHATSAPP_API_KEY || "";
const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WA_API_URL =
  process.env.WHATSAPP_API_URL || "https://waba.360dialog.io/v1";

/**
 * Mapping from application messageType identifiers to
 * Meta-approved WhatsApp template names.
 */
export const TEMPLATE_MAP: Record<string, string> = {
  week_ahead: "amana_week_ahead",
  week_wrapup: "amana_week_wrapup",
  midweek_checkin: "amana_midweek_checkin",
  lunchbox_monday: "amana_lunchbox_inspiration",
  lunchbox_thursday: "amana_fuelup_friday",
  ccs_tip: "amana_ccs_quick_tip",
  your_voice: "amana_your_voice_matters",
};

/** Valid group type identifiers */
export const GROUP_TYPES = [
  "announcements",
  "centre_parents",
  "lunchbox",
  "ccs_help",
  "ideas",
] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

/** Valid message type identifiers */
export const MESSAGE_TYPES = [
  "week_ahead",
  "week_wrapup",
  "midweek_checkin",
  "lunchbox_monday",
  "lunchbox_thursday",
  "ccs_tip",
  "your_voice",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export function isWhatsAppConfigured(): boolean {
  return !!(WA_API_KEY && WA_PHONE_NUMBER_ID);
}

// ── Send Message ─────────────────────────────────────────────

interface SendMessageParams {
  to: string; // group JID or phone number (e.g. "61412345678")
  templateName: string; // Meta-approved template name
  body: string;
  header?: string;
  footer?: string;
  media?: { type: "image"; url: string } | null;
}

interface SendMessageResult {
  messageId: string;
}

/**
 * Send a template-based WhatsApp message via 360dialog API.
 */
export async function sendWhatsAppMessage(
  params: SendMessageParams,
): Promise<SendMessageResult> {
  // Build template components
  const components: Array<Record<string, unknown>> = [];

  // Header component (text or image)
  if (params.media?.url) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: params.media.url },
        },
      ],
    });
  } else if (params.header) {
    components.push({
      type: "header",
      parameters: [{ type: "text", text: params.header }],
    });
  }

  // Body component
  if (params.body) {
    components.push({
      type: "body",
      parameters: [{ type: "text", text: params.body }],
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: "en" },
      components,
    },
  };

  const res = await fetch(`${WA_API_URL}/messages`, {
    method: "POST",
    headers: {
      "D360-API-KEY": WA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`360dialog send failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    messages?: Array<{ id: string }>;
  };

  return {
    messageId: data.messages?.[0]?.id || "unknown",
  };
}
