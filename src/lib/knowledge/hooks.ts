import { runAfter } from "@/lib/run-after";
import { logger } from "@/lib/logger";

/**
 * Run a knowledge adapter after the response is sent. Swallow-and-log:
 * a knowledge sync must never fail or slow the user's write. Delegates to
 * runAfter(), which uses Next 16's after() inside a request scope and
 * falls back to an inline start elsewhere (scripts, tests).
 */
export function syncAfterResponse(label: string, run: () => Promise<unknown>): void {
  runAfter(async () => {
    try {
      await run();
    } catch (err) {
      logger.warn("Knowledge: sync failed", { adapter: label, err });
    }
  });
}
