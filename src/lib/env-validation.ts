/**
 * Environment variable validation — fail fast on startup if critical vars are missing.
 *
 * Import this in instrumentation.ts so it runs once on server start.
 */

import { logger } from "@/lib/logger";

const REQUIRED_SERVER_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
] as const;

const SENSITIVE_SERVER_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "RESEND_API_KEY",
  "BREVO_API_KEY",
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "XERO_CLIENT_SECRET",
  "AZURE_AD_CLIENT_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "META_APP_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
  "COWORK_API_KEY",
  "XERO_ENCRYPTION_KEY",
  "MFA_ENCRYPTION_KEY",
  "FIELD_ENCRYPTION_KEY",
] as const;

export function validateEnv() {
  const missing: string[] = [];

  for (const key of REQUIRED_SERVER_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(", ")}. ` +
        `Server cannot start without these. Check your .env or Vercel environment settings.`,
    );
  }

  // Warn about NEXT_PUBLIC_ vars that should NOT be public
  for (const key of SENSITIVE_SERVER_VARS) {
    const publicKey = `NEXT_PUBLIC_${key}`;
    if (process.env[publicKey]) {
      logger.warn("Sensitive env var exposed as NEXT_PUBLIC_", {
        publicKey,
        hint: `Remove the NEXT_PUBLIC_ prefix and use the server-only ${key} instead`,
      });
    }
  }
}
