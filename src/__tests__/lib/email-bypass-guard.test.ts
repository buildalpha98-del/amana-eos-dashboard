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
 */
const SRC_ROOT = join(__dirname, "..", "..");

const ALLOWED = new Set([
  "lib/email.ts",
  "app/api/auth/forgot-password/route.ts",
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
