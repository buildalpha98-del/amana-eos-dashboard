import { Resend } from "resend";

// Lazy singleton — Resend only initialises when actually called,
// preventing build-time errors when RESEND_API_KEY isn't set.
let _resend: Resend | null = null;

export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export const FROM_EMAIL =
  process.env.EMAIL_FROM || "Amana OSHC <noreply@amanaoshc.com.au>";
