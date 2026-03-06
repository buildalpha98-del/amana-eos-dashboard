/**
 * Brevo (formerly Sendinblue) API client for transactional + campaign emails.
 *
 * - Transactional: POST /v3/smtp/email (< 50 recipients)
 * - Campaign: POST /v3/emailCampaigns → sendNow (50+ recipients, uses contact list)
 */

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL =
  process.env.BREVO_SENDER_EMAIL || "admin@amanaoshc.com.au";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Amana OSHC";
const BREVO_API = "https://api.brevo.com/v3";

export function isBrevoConfigured(): boolean {
  return !!BREVO_API_KEY;
}

// ── Helpers ───────────────────────────────────────────────────

async function brevoFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${BREVO_API}${path}`, {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ── Transactional Email (< 50 recipients) ────────────────────

interface TransactionalParams {
  to: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent: string;
  textContent?: string;
  tags?: string[];
  scheduledAt?: string; // ISO 8601
}

/**
 * Send a transactional email via Brevo SMTP API.
 * Best for < 50 recipients (Brevo limit for transactional).
 */
export async function sendTransactionalEmail(
  params: TransactionalParams,
): Promise<{ messageId: string }> {
  const payload: Record<string, unknown> = {
    sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
    to: params.to,
    subject: params.subject,
    htmlContent: params.htmlContent,
  };

  if (params.textContent) payload.textContent = params.textContent;
  if (params.tags && params.tags.length > 0) payload.tags = params.tags;
  if (params.scheduledAt) payload.scheduledAt = params.scheduledAt;

  const res = await brevoFetch("/smtp/email", payload);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo transactional send failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as { messageId?: string };
  return { messageId: data.messageId || "unknown" };
}

// ── Campaign Email (50+ recipients) ──────────────────────────

interface CampaignParams {
  recipients: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent: string;
  tags?: string[];
  scheduledAt?: string; // ISO 8601
}

/**
 * Create a Brevo campaign for bulk sending (50+ recipients).
 *
 * Flow:
 * 1. Create a temporary contact list
 * 2. Add recipients to the list
 * 3. Create the campaign targeting that list
 * 4. Send (or schedule) the campaign
 */
export async function sendCampaignEmail(
  params: CampaignParams,
): Promise<{ campaignId: number }> {
  // 1. Create a temporary contact list
  const listName = `delivery-${Date.now()}`;
  const listRes = await brevoFetch("/contacts/lists", {
    name: listName,
    folderId: 1, // default folder
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Brevo create list failed (${listRes.status}): ${err}`);
  }

  const { id: listId } = (await listRes.json()) as { id: number };

  // 2. Import contacts into the list
  const importRes = await brevoFetch("/contacts/import", {
    listIds: [listId],
    jsonBody: params.recipients.map((r) => ({
      email: r.email,
      attributes: {
        FIRSTNAME: r.name?.split(" ")[0] || "",
        LASTNAME: r.name?.split(" ").slice(1).join(" ") || "",
      },
    })),
  });

  if (!importRes.ok) {
    const err = await importRes.text();
    throw new Error(
      `Brevo import contacts failed (${importRes.status}): ${err}`,
    );
  }

  // 3. Create the campaign
  const campaignPayload: Record<string, unknown> = {
    name: `Newsletter ${new Date().toISOString().split("T")[0]}`,
    subject: params.subject,
    sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
    htmlContent: params.htmlContent,
    recipients: { listIds: [listId] },
  };

  if (params.tags && params.tags.length > 0) campaignPayload.tag = params.tags[0]; // Brevo campaigns support single tag

  const campaignRes = await brevoFetch("/emailCampaigns", campaignPayload);

  if (!campaignRes.ok) {
    const err = await campaignRes.text();
    throw new Error(
      `Brevo create campaign failed (${campaignRes.status}): ${err}`,
    );
  }

  const { id: campaignId } = (await campaignRes.json()) as { id: number };

  // 4. Send or schedule the campaign
  if (params.scheduledAt) {
    // Schedule the campaign
    const schedRes = await fetch(
      `${BREVO_API}/emailCampaigns/${campaignId}/status`,
      {
        method: "PUT",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scheduledAt: params.scheduledAt }),
      },
    );

    if (!schedRes.ok) {
      const err = await schedRes.text();
      throw new Error(
        `Brevo schedule campaign failed (${schedRes.status}): ${err}`,
      );
    }
  } else {
    // Send immediately
    const sendRes = await fetch(
      `${BREVO_API}/emailCampaigns/${campaignId}/sendNow`,
      {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    if (!sendRes.ok) {
      const err = await sendRes.text();
      throw new Error(
        `Brevo send campaign failed (${sendRes.status}): ${err}`,
      );
    }
  }

  return { campaignId };
}
