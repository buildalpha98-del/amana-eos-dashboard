import { after } from "next/server";

/**
 * Run work after the response is sent. A bare fire-and-forget promise dies
 * when the serverless response returns, so post-response work (nurture
 * scheduling, stage events) must go through next/server's after().
 *
 * Outside a Next.js request scope (unit tests, scripts) after() throws
 * synchronously — fall back to starting the task inline.
 */
export function runAfter(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
