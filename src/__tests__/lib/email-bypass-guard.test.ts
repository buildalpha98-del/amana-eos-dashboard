import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Guard: every email must go through sendEmail() in src/lib/email.ts so the
 * EmailSuppression list (bounces, complaints, manual mutes) is honoured.
 *
 * Direct `resend.emails.send(...)` / `new Resend(...)` calls bypass the
 * suppression check — that's how muted users kept receiving email. The ONLY
 * allowed bypasses are:
 *   - src/lib/email.ts               (the wrapper itself)
 *   - src/app/api/auth/forgot-password/route.ts
 *     (deliberate: a muted/suppressed user must still be able to recover
 *      access to their account)
 *   - src/app/api/parent/auth/send-link/route.ts
 *     (same reason, for families. The magic link IS the parent's
 *      forgot-password path — there is no other. Honouring suppression
 *      here would mean a parent who once bounced, or who unsubscribed
 *      from a newsletter, is permanently locked out of their own
 *      child's enrolment while being told a link is on its way.)
 *
 * The rule these two share: suppression protects sender reputation on
 * mail people can live without. It must never gate account recovery.
 */
const SRC_ROOT = join(__dirname, "..", "..");

const ALLOWED = new Set([
  "lib/email.ts",
  "app/api/auth/forgot-password/route.ts",
  "app/api/parent/auth/send-link/route.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("email suppression bypass guard", () => {
  const files = walk(SRC_ROOT);

  it("no direct resend .emails.send() calls outside the allowlist", () => {
    const offenders = files.filter((f) => {
      const rel = relative(SRC_ROOT, f);
      if (ALLOWED.has(rel)) return false;
      return /\.emails\s*\.\s*send\s*\(/.test(readFileSync(f, "utf8"));
    });
    expect(
      offenders.map((f) => relative(SRC_ROOT, f)),
      "These files send email directly, bypassing the EmailSuppression check. Use sendEmail() from @/lib/email instead."
    ).toEqual([]);
  });

  it("no direct `new Resend(...)` construction outside the allowlist", () => {
    const offenders = files.filter((f) => {
      const rel = relative(SRC_ROOT, f);
      if (ALLOWED.has(rel)) return false;
      return /new\s+Resend\s*\(/.test(readFileSync(f, "utf8"));
    });
    expect(
      offenders.map((f) => relative(SRC_ROOT, f)),
      "These files construct their own Resend client. Use sendEmail()/getResend() from @/lib/email instead."
    ).toEqual([]);
  });
});
