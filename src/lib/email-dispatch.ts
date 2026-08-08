import { sendTransactionalEmail } from "@/lib/brevo";

/**
 * Shared per-recipient Brevo dispatch — extracted from /api/email/campaign/send
 * so the partial-resend route reuses the exact same chunking/timeout machinery.
 * Behavior-identical to the original inline loop; both callers mock
 * `sendTransactionalEmail` from @/lib/brevo in tests, so this lib needs no
 * mocking of its own.
 */

/** Per-recipient dispatch: how many transactional sends run in parallel. */
export const SEND_CHUNK_SIZE = 5;
/** Per-call ceiling — keeps a hung Brevo call inside withApiAuth's 55s budget. */
export const SEND_TIMEOUT_MS = 10_000;

/**
 * Race a Brevo call against AbortSignal.timeout. sendTransactionalEmail
 * doesn't accept an abort signal, so a timed-out call is ABANDONED rather
 * than aborted — the underlying fetch may still complete on Brevo's side,
 * but the caller moves on and counts that recipient as failed. Acceptable:
 * the alternative is one hung call stranding the whole dispatch.
 */
export function raceSendTimeout<T>(
  promise: Promise<T>,
  ms = SEND_TIMEOUT_MS,
): Promise<T> {
  const signal = AbortSignal.timeout(ms);
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new Error(`Brevo send timed out after ${ms}ms`)),
        { once: true },
      );
    }),
  ]);
}

export interface DispatchResult {
  /**
   * Every FULFILLED send with its raw Brevo messageId — including the
   * wrapper's "unknown" fallback (Brevo omitted the id). Deliberately NOT
   * filtered here: callers building payload._sentMessageIds filter "unknown"
   * themselves (it's useless for cancellation), but the raw entry still
   * matters for success counting, so the lib keeps it.
   */
  sent: Array<{ email: string; messageId: string }>;
  /** Emails whose send rejected (Brevo error or the timeout race). */
  failed: string[];
  /** First rejection's message — callers fold it into errorMessage. */
  firstError: string | null;
}

/**
 * Dispatch ONE transactional send per recipient (recipients never see each
 * other in To:). Bounded concurrency: chunks of SEND_CHUNK_SIZE keep us well
 * inside Brevo's rate limits while a hung call can't strand the dispatch —
 * each send races a ~10s timeout inside withApiAuth's 55s budget.
 */
export async function dispatchPerRecipient(params: {
  recipients: Array<{ email: string; name?: string }>;
  subject: string;
  html: string;
  scheduledAt?: string;
  tags: string[];
}): Promise<DispatchResult> {
  const sent: Array<{ email: string; messageId: string }> = [];
  const failed: string[] = [];
  let firstError: string | null = null;

  for (let i = 0; i < params.recipients.length; i += SEND_CHUNK_SIZE) {
    const chunk = params.recipients.slice(i, i + SEND_CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map((recipient) =>
        raceSendTimeout(
          sendTransactionalEmail({
            to: [recipient],
            subject: params.subject,
            htmlContent: params.html,
            tags: params.tags,
            scheduledAt: params.scheduledAt,
          }),
        ),
      ),
    );
    results.forEach((result, j) => {
      if (result.status === "rejected") {
        failed.push(chunk[j].email);
        if (!firstError) {
          firstError =
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown send error";
        }
      } else {
        sent.push({
          email: chunk[j].email,
          messageId: result.value.messageId,
        });
      }
    });
  }

  return { sent, failed, firstError };
}
