/**
 * 2026-09-14: every SERVICE-OPERATIONS alert cron must honour
 * `notifications.serviceAlertsPaused`. This file is the registry of which
 * crons are gated — adding a new service-alert cron means adding it here.
 *
 * Paused  → the route returns { skipped: true, reason } and sends NOTHING
 *           (no Resend, no Teams, no unsigned-in alert helper).
 * Unpaused → the route proceeds past the gate (checked on checklist-audit,
 *           whose happy path is deterministic with empty data).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

const guardComplete = vi.fn();
vi.mock("@/lib/cron-guard", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    acquireCronLock: vi.fn(async () => ({
      acquired: true,
      complete: guardComplete,
      fail: vi.fn(),
    })),
  };
});

const getOrgSettings = vi.fn();
vi.mock("@/lib/org-settings", () => ({
  getOrgSettings: () => getOrgSettings(),
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  getResend: () => ({}),
  FROM_EMAIL: "Amana OSHC <test@example.com>",
}));

const sendTeams = vi.fn();
vi.mock("@/lib/teams-notify", () => ({
  notifyLowOccupancy: (...args: unknown[]) => sendTeams(...args),
  notifyWeeklySummary: (...args: unknown[]) => sendTeams(...args),
}));

const sendUnsignedInAlert = vi.fn();
vi.mock("@/lib/notifications/cron", () => ({
  sendUnsignedInAlert: (...args: unknown[]) => sendUnsignedInAlert(...args),
}));

vi.mock("@/lib/staffing-analysis", () => ({
  getNetworkStaffingSummary: vi.fn(async () => ({
    date: "2026-09-15",
    services: [],
    overstaffedCount: 0,
    understaffedCount: 0,
    totalWaste: 0,
    totalRisk: 0,
  })),
}));

import { GET as attendanceAlerts } from "@/app/api/cron/attendance-alerts/route";
import { GET as ratioRiskForecast } from "@/app/api/cron/ratio-risk-forecast/route";
import { GET as shiftGapDetector } from "@/app/api/cron/shift-gap-detector/route";
import { GET as staffingAlerts } from "@/app/api/cron/staffing-alerts/route";
import { GET as checklistAudit } from "@/app/api/cron/checklist-audit/route";
import { GET as unactionedBookings } from "@/app/api/cron/unactioned-bookings/route";
import { GET as unsignedInAlert } from "@/app/api/cron/unsigned-in-alert/route";
import { GET as incidentDigest } from "@/app/api/cron/incident-digest/route";

const GATED_CRONS: Array<[string, (req: ReturnType<typeof createRequest>) => Promise<Response>]> = [
  ["attendance-alerts", attendanceAlerts],
  ["ratio-risk-forecast", ratioRiskForecast],
  ["shift-gap-detector", shiftGapDetector],
  ["staffing-alerts", staffingAlerts],
  ["checklist-audit", checklistAudit],
  ["unactioned-bookings", unactionedBookings],
  ["unsigned-in-alert", unsignedInAlert],
  ["incident-digest", incidentDigest],
];

const ORIGINAL_ENV = { ...process.env };

const authed = (path: string) =>
  createRequest("GET", `/api/cron/${path}`, {
    headers: { authorization: "Bearer test-cron-secret" },
  });

describe("service-alert crons honour notifications.serviceAlertsPaused", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    guardComplete.mockResolvedValue(undefined);
    // Any data query the crons make after the gate returns "nothing".
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.dailyAttendance.findMany.mockResolvedValue([]);
    prismaMock.dailyChecklist.findMany.mockResolvedValue([]);
    prismaMock.rosterShift.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
    prismaMock.incidentRecord.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe.each(GATED_CRONS)("%s", (name, GET) => {
    it("skips with the paused reason and sends nothing when paused", async () => {
      getOrgSettings.mockResolvedValue({ notifications: { serviceAlertsPaused: true } });

      const res = await GET(authed(name));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ skipped: true, reason: "service_alerts_paused" });

      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendTeams).not.toHaveBeenCalled();
      expect(sendUnsignedInAlert).not.toHaveBeenCalled();
      // The lock is completed with the marker so cron-health shows the run.
      expect(guardComplete).toHaveBeenCalledWith({
        skipped: true,
        reason: "service_alerts_paused",
      });
      // Nothing after the gate ran — no data was even queried.
      expect(prismaMock.service.findMany).not.toHaveBeenCalled();
    });

    it("still 401s without the cron secret", async () => {
      getOrgSettings.mockResolvedValue({ notifications: { serviceAlertsPaused: true } });
      const res = await GET(createRequest("GET", `/api/cron/${name}`));
      expect(res.status).toBe(401);
    });
  });

  it("proceeds past the gate when NOT paused (checklist-audit runs its audit)", async () => {
    getOrgSettings.mockResolvedValue({ notifications: { serviceAlertsPaused: false } });

    const res = await checklistAudit(authed("checklist-audit"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBeUndefined();
    expect(body.message).toBe("Checklist audit processed");
    expect(prismaMock.service.findMany).toHaveBeenCalled();
    expect(guardComplete).not.toHaveBeenCalledWith(
      expect.objectContaining({ reason: "service_alerts_paused" }),
    );
  });
});
