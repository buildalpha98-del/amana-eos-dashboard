import { after } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Run a knowledge adapter after the response is sent. Swallow-and-log:
 * a knowledge sync must never fail or slow the user's write. `after()`
 * (Next 16) keeps the serverless function alive for the work — a bare
 * `void promise` can be frozen once the response streams out on Vercel.
 */
export function syncAfterResponse(label: string, run: () => Promise<unknown>): void {
  after(async () => {
    try {
      await run();
    } catch (err) {
      logger.warn("Knowledge: sync failed", { adapter: label, err });
    }
  });
}
