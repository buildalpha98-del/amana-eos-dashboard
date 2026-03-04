/**
 * Internal cron scheduler for Railway deployment.
 *
 * Railway runs a persistent Node.js process (unlike Vercel serverless),
 * so we use `node-cron` to schedule internal HTTP calls to our cron API
 * routes. Each route already has CRON_SECRET bearer auth.
 *
 * All times in AEST (UTC+10). node-cron runs in UTC.
 * AEST → UTC: subtract 10 hours (no DST for simplicity).
 */
import cron from "node-cron";

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

async function triggerCron(path: string, method = "GET") {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json().catch(() => ({}));
    const ms = Date.now() - start;
    console.log(`[CRON] ${method} ${path} → ${res.status} (${ms}ms)`, JSON.stringify(data).slice(0, 200));
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`[CRON] ${method} ${path} FAILED (${ms}ms):`, err instanceof Error ? err.message : err);
  }
}

export function startCronJobs() {
  if (!CRON_SECRET) {
    console.log("[CRON] No CRON_SECRET set — cron scheduler disabled");
    return;
  }

  // ── Daily jobs ─────────────────────────────────────────────

  // 6:00 AM AEST (20:00 UTC prev day) — Attendance alerts (low occupancy / missing data)
  cron.schedule("0 20 * * *", () => triggerCron("/api/cron/attendance-alerts"));

  // 7:00 AM AEST (21:00 UTC prev day) — Compliance certificate expiry alerts
  cron.schedule("0 21 * * *", () => triggerCron("/api/cron/compliance-alerts"));

  // 7:30 AM AEST (21:30 UTC prev day) — Auto-onboarding packs + LMS enrollment
  cron.schedule("30 21 * * *", () => triggerCron("/api/cron/auto-onboarding"));

  // 8:00 AM AEST (22:00 UTC prev day) — Daily digest emails
  cron.schedule("0 22 * * *", () => triggerCron("/api/cron/daily-digest"));

  // 8:30 AM AEST (22:30 UTC prev day) — Smart rock/todo escalation
  cron.schedule("30 22 * * *", () => triggerCron("/api/cron/auto-escalation"));

  // 9:00 PM AEST (11:00 UTC) — Xero financial data sync
  cron.schedule("0 11 * * *", () => triggerCron("/api/xero/sync/cron"));

  // ── Weekly jobs (Monday) ───────────────────────────────────

  // Monday 6:00 AM AEST (Sun 20:00 UTC) — Auto carry-forward incomplete todos
  cron.schedule("0 20 * * 0", () => triggerCron("/api/cron/auto-carry-forward"));

  // Monday 6:30 AM AEST (Sun 20:30 UTC) — Auto-populate measurables from attendance
  cron.schedule("30 20 * * 0", () => triggerCron("/api/cron/auto-measurables"));

  // Monday 7:00 AM AEST (Sun 21:00 UTC) — Weekly leadership report
  cron.schedule("0 21 * * 0", () => triggerCron("/api/cron/weekly-report"));

  // ── Weekly jobs (Sunday) ───────────────────────────────────

  // Sunday 11:00 PM AEST (Sun 13:00 UTC) — Attendance → Financial pipeline
  cron.schedule("0 13 * * 0", () => triggerCron("/api/cron/attendance-to-financials"));

  // ── Monthly jobs ───────────────────────────────────────────

  // 1st of month 6:00 AM AEST (prev day 20:00 UTC) — Health score computation
  cron.schedule("0 20 1 * *", () => triggerCron("/api/health-scores/compute", "POST"));

  console.log("[CRON] All cron jobs scheduled ✓ (11 jobs)");
}
