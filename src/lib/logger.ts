/**
 * Structured logger for API routes with request ID correlation.
 *
 * Outputs JSON lines in production for easy parsing in Vercel/Sentry.
 * Outputs human-readable format in development.
 *
 * Use `withRequestId(reqId)` to create a scoped logger that includes
 * the request ID in every log entry — useful for tracing a single
 * request through auth → handler → DB → email.
 *
 * @example
 * ```ts
 * import { logger } from "@/lib/logger";
 *
 * logger.error("Failed to send email", { userId, err });
 * logger.warn("Rate limit approaching", { ip, remaining });
 * logger.info("Cron completed", { processed: 42, skipped: 3 });
 *
 * // Scoped to a request
 * const log = logger.withRequestId("abc-123");
 * log.info("Processing enrolment"); // includes reqId: "abc-123"
 * ```
 */

import { randomUUID } from "crypto";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL = process.env.NODE_ENV === "production" ? "info" : "debug";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    };
  }
  return { value: String(err) };
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error || (
    typeof value === "object" && value !== null && "stack" in value && "message" in value
  );
}

function formatContext(ctx: LogContext): LogContext {
  const result: LogContext = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (key === "err" || key === "error" || isErrorLike(value)) {
      result[key === "err" ? "error" : key] = serializeError(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const entry = {
    level,
    msg: message,
    ts: new Date().toISOString(),
    ...(context ? formatContext(context) : {}),
  };

  if (process.env.NODE_ENV === "production") {
    // JSON line output for structured log ingestion
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    console[method](JSON.stringify(entry));
  } else {
    // Human-readable for local dev
    const prefix = `[${level.toUpperCase()}]`;
    const ctx = context ? ` ${JSON.stringify(formatContext(context), null, 0)}` : "";
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    console[method](`${prefix} ${message}${ctx}`);
  }
}

interface Logger {
  debug: (msg: string, ctx?: LogContext) => void;
  info: (msg: string, ctx?: LogContext) => void;
  warn: (msg: string, ctx?: LogContext) => void;
  error: (msg: string, ctx?: LogContext) => void;
  /** Create a scoped logger that includes `reqId` in every log entry */
  withRequestId: (reqId: string) => Omit<Logger, "withRequestId">;
}

/**
 * Generate a short request ID (first 8 chars of UUID).
 * Short enough to not bloat logs, long enough for practical uniqueness.
 */
export function generateRequestId(): string {
  return randomUUID().slice(0, 8);
}

export const logger: Logger = {
  debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
  withRequestId: (reqId: string) => ({
    debug: (msg: string, ctx?: LogContext) => log("debug", msg, { reqId, ...ctx }),
    info: (msg: string, ctx?: LogContext) => log("info", msg, { reqId, ...ctx }),
    warn: (msg: string, ctx?: LogContext) => log("warn", msg, { reqId, ...ctx }),
    error: (msg: string, ctx?: LogContext) => log("error", msg, { reqId, ...ctx }),
  }),
};
