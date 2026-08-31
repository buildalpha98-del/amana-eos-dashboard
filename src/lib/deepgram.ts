/**
 * Deepgram speech-to-text client (Phase 2, 2026-08-31).
 *
 * Async pre-recorded transcription only: we hand Deepgram a Blob URL and a
 * callback URL, it POSTs the finished transcript to
 * /api/webhooks/deepgram?secret=... — no long-running serverless work.
 * nova-3 + diarize gives per-speaker utterances, which is what the AI
 * review's "commitment with no owner" detection leans on.
 */

import { siteUrl } from "@/lib/site-url";

const DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen";

export interface Utterance {
  speaker: number;
  start: number;
  end: number;
  text: string;
}

export class DeepgramError extends Error {}

export function buildDeepgramCallbackUrl(): string {
  const secret = process.env.DEEPGRAM_WEBHOOK_SECRET;
  if (!secret) throw new DeepgramError("DEEPGRAM_WEBHOOK_SECRET not configured");
  return `${siteUrl()}/api/webhooks/deepgram?secret=${encodeURIComponent(secret)}`;
}

/**
 * Ask Deepgram to transcribe the audio at `audioUrl` and call back when
 * done. Returns the request id echoed later in the callback's metadata.
 */
export async function requestTranscription({
  audioUrl,
  callbackUrl,
}: {
  audioUrl: string;
  callbackUrl: string;
}): Promise<{ requestId: string }> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new DeepgramError("DEEPGRAM_API_KEY not configured");

  const params = new URLSearchParams({
    model: "nova-3",
    diarize: "true",
    smart_format: "true",
    utterances: "true",
    callback: callbackUrl,
    callback_method: "post",
  });

  const res = await fetch(`${DEEPGRAM_LISTEN_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: audioUrl }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DeepgramError(
      `Deepgram request failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { request_id?: string };
  if (!data.request_id) {
    throw new DeepgramError("Deepgram response carried no request_id");
  }
  return { requestId: data.request_id };
}

/** Shape of the (subset of the) callback payload we consume. */
export interface DeepgramCallbackPayload {
  metadata?: { request_id?: string; duration?: number };
  request_id?: string;
  results?: {
    utterances?: Array<{
      speaker?: number;
      start?: number;
      end?: number;
      transcript?: string;
    }>;
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
}

export function extractRequestId(payload: DeepgramCallbackPayload): string | null {
  return payload.metadata?.request_id ?? payload.request_id ?? null;
}

/**
 * Pull utterances out of a callback payload. NOTE: Deepgram puts the
 * utterance text in `transcript`, not `text`. When utterances are absent
 * but a channel transcript exists (diarization edge cases), fall back to
 * one speaker-0 utterance. Returns [] when the payload carries no speech
 * at all — the caller treats that as a failed transcription.
 */
export function extractUtterances(payload: DeepgramCallbackPayload): Utterance[] {
  const utterances = payload.results?.utterances;
  if (utterances && utterances.length > 0) {
    return utterances
      .filter((u) => (u.transcript ?? "").trim().length > 0)
      .map((u) => ({
        speaker: u.speaker ?? 0,
        start: u.start ?? 0,
        end: u.end ?? 0,
        text: (u.transcript ?? "").trim(),
      }));
  }
  const channelTranscript =
    payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
  if (channelTranscript) {
    return [{ speaker: 0, start: 0, end: 0, text: channelTranscript }];
  }
  return [];
}

/**
 * Flatten utterances into "Speaker N: ..." lines, coalescing consecutive
 * lines from the same speaker into one block.
 */
export function buildTranscriptText(utterances: Utterance[]): string {
  const lines: string[] = [];
  let currentSpeaker: number | null = null;
  let currentParts: string[] = [];

  const flush = () => {
    if (currentSpeaker !== null && currentParts.length > 0) {
      lines.push(`Speaker ${currentSpeaker}: ${currentParts.join(" ")}`);
    }
    currentParts = [];
  };

  for (const u of utterances) {
    if (u.speaker !== currentSpeaker) {
      flush();
      currentSpeaker = u.speaker;
    }
    currentParts.push(u.text);
  }
  flush();
  return lines.join("\n");
}
