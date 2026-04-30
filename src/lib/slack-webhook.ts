import { logger } from "@/lib/logger";

export interface SlackFeedbackPayload {
  id: string;
  authorName: string;
  role: string;
  category: string;
  message: string;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function buildDashboardUrl(id: string): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
  return `${base}/admin/feedback?id=${id}`;
}

async function attempt(url: string, body: string): Promise<void> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Slack webhook returned ${res.status}`);
    }
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fire-and-forget Slack notification for new internal feedback.
 * No-op when `SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL` is unset.
 * 3s timeout per attempt + one retry → log and swallow.
 */
export async function sendSlackFeedback(payload: SlackFeedbackPayload): Promise<void> {
  const url = process.env.SLACK_INTERNAL_FEEDBACK_WEBHOOK_URL;
  if (!url) return;

  const body = JSON.stringify({
    text: `🐛 New ${payload.category} from ${payload.authorName} (${payload.role}): "${truncate(payload.message, 100)}" — ${buildDashboardUrl(payload.id)}`,
  });

  try {
    await attempt(url, body);
  } catch (firstErr) {
    try {
      await attempt(url, body);
    } catch (retryErr) {
      logger.warn("Slack feedback webhook failed", {
        feedbackId: payload.id,
        firstError: firstErr instanceof Error ? firstErr.message : String(firstErr),
        retryError: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
    }
  }
}
