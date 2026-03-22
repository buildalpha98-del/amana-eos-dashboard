import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * Central environment variable validation.
 *
 * Required vars throw in production if missing.
 * Feature vars log warnings — features degrade gracefully.
 * Existing `process.env.X` usage continues to work;
 * new code can import `env` from this module for type safety.
 */

const requiredSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  CRON_SECRET: z.string().min(1),
});

const featureSchema = z.object({
  // Azure AD (Microsoft Calendar)
  AZURE_AD_CLIENT_ID: z.string().optional(),
  AZURE_AD_CLIENT_SECRET: z.string().optional(),
  AZURE_AD_TENANT_ID: z.string().optional(),
  // Xero
  XERO_CLIENT_ID: z.string().optional(),
  XERO_CLIENT_SECRET: z.string().optional(),
  XERO_REDIRECT_URI: z.string().optional(),
  XERO_ENCRYPTION_KEY: z.string().optional(),
  // WhatsApp
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  // Meta Social
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_ENCRYPTION_KEY: z.string().optional(),
  META_REDIRECT_URI: z.string().optional(),
  // Email
  RESEND_API_KEY: z.string().optional(),
  // Teams
  TEAMS_WEBHOOK_URL: z.string().optional(),
  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

const optionalSchema = z.object({
  EMAIL_FROM: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

const envSchema = requiredSchema.merge(featureSchema).merge(optionalSchema);

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (result.success) return result.data;

  // Check if required vars are missing
  const reqResult = requiredSchema.safeParse(process.env);
  if (!reqResult.success) {
    const missing = reqResult.error.issues.map((i) => i.path[0]).join(", ");
    const isRuntime = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
    if (isRuntime) {
      throw new Error(`[ENV] Fatal: missing required env vars: ${missing}`);
    }
    logger.error("Missing required env vars", { missing });
  }

  // Warn about missing feature vars (non-fatal)
  const requiredKeys = ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL", "CRON_SECRET"];
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]);
    if (!requiredKeys.includes(key)) {
      logger.warn("Missing optional env var", { key });
    }
  }

  // Return partial env — callers should check presence before use
  return process.env as unknown as Env;
}

export const env = validateEnv();
