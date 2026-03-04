/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the server starts. Used to initialise the
 * internal cron scheduler on Railway (persistent server).
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronJobs } = await import("./lib/cron-scheduler");
    startCronJobs();
  }
}
