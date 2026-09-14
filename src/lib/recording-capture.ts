// src/lib/recording-capture.ts
/**
 * Browser-capture helpers shared by the meeting recorder provider
 * (Recorder v2, 2026-09-14). Pure functions — no React, no state.
 */

export const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4", // Safari
] as const;

/** First MIME the current browser can record, or null when it can't record. */
export function pickRecordingMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function extensionForMime(mime: string): string {
  return mime.includes("mp4") ? "m4a" : "webm";
}

/**
 * Name the ACTUAL getUserMedia failure. Lumping everything into "blocked"
 * once sent people hunting site permissions when the real problem was the
 * macOS-level browser mic toggle or a busy device (2026-09-01).
 */
export function describeMicError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission was denied. Check BOTH: the site permission (icon next to the address bar → Microphone → Allow), and on a Mac, System Settings → Privacy & Security → Microphone → allow your browser, then fully quit and reopen it.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Plug one in (or check the input device in your browser's microphone settings) and try again.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The microphone is busy — another app (Teams/Zoom/etc.) is probably using it. Close it and try again.";
  }
  return `Couldn't access the microphone${name ? ` (${name})` : ""}. Check browser and system mic permissions, then try again.`;
}
