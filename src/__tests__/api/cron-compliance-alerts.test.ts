import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

// ── mocks ────────────────────────────────────────────────────

// Fake sendEmail — records each send so we can assert call shape.
type SendEmailArgs = { to: string[]; subject: string; html: string };
const resendSend = vi.fn(async (args: SendEmailArgs) => {
  void args; // referenced so the type survives into mock.calls[0][0]
  return { messageId: "mail-1", suppressed: [], sent: args.to };
});
vi.mock("@/lib/email", () => ({
  getResend: vi.fn(() => ({})),
  sendEmail: (args: SendEmailArgs) => resendSend(args),
  FROM_EMAIL: "Amana OSHC <noreply@test.com>",
}));

vi.mock("@/lib/email-templates", () => ({
  complianceAlertEmail: vi.fn((_name: string, certs: unknown[]) => ({
    subject: `${(certs as unknown[]).length} cert expiring`,
    html: "<p>alert</p>",
  })),
  complianceAdminSummaryEmail: vi.fn(() => ({
    subject: "summary",
    html: "<p>summary</p>",
  })),
}));

// Nudge recipient resolution (2026-07-24 policy: cert owner gets NO direct
// email — recipients are service inbox + leadership + opted-in users). The
// real resolver hits prisma; mock it so tests control the recipient list.
const NUDGE_EMAILS = ["centre-inbox@test.com", "leadership@test.com"];
const resolveNudgeRecipients = vi.fn();
vi.mock("@/lib/notification-recipients", () => ({
  resolveNudgeRecipients: (...args: unknown[]) => resolveNudgeRecipients(...args),
}));

function nudgeRecipients(emails: string[]) {
  return {
    emails,
    serviceEmail: emails[0] ?? null,
    missingServiceInbox: emails.length === 0,
    users: [],
  };
}

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

// Lock guard — every test gets a fresh successfully-acquired lock.
const guardComplete = vi.fn(async () => {});
const guardFail = vi.fn(async () => {});
vi.mock("@/lib/cron-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-guard")>("@/lib/cron-guard");
  return {
    ...actual,
    acquireCronLock: vi.fn(async () => ({
      acquired: true,
      complete: guardComplete,
      fail: guardFail,
    })),
  };
});

import { GET } from "@/app/api/cron/compliance-alerts/route";

// ── fixtures ─────────────────────────────────────────────────

const NOW = new Date("2026-04-21T00:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86400000);
}

function makeCert(overrides: {
  id?: string;
  expiryDate: Date;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userActive?: boolean;
  serviceId?: string;
  serviceName?: string;
  type?: string;
  label?: string | null;
  fileUrl?: string | null;
}) {
  return {
    id: overrides.id ?? `cert-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? "first_aid",
    label: overrides.label ?? null,
    expiryDate: overrides.expiryDate,
    fileUrl: overrides.fileUrl ?? null,
    serviceId: overrides.serviceId ?? "svc-1",
    user: {
      id: overrides.userId ?? "user-1",
      name: overrides.userName ?? "Staff Member",
      email: overrides.userEmail ?? "staff@test.com",
      active: overrides.userActive ?? true,
    },
    service: {
      id: overrides.serviceId ?? "svc-1",
      name: overrides.serviceName ?? "Centre Alpha",
      code: "CA",
    },
  };
}

function authed() {
  return createRequest("GET", "/api/cron/compliance-alerts", {
    headers: { authorization: "Bearer test-secret" },
  });
}

// ── harness ──────────────────────────────────────────────────

function setup(certs: ReturnType<typeof makeCert>[], opts?: { existingAlertKeys?: Set<string> }) {
  const existingAlerts = opts?.existingAlertKeys ?? new Set<string>();

  prismaMock.complianceCertificate.findMany.mockResolvedValue(certs);
  prismaMock.user.findMany.mockResolvedValue([]); // visa pass: no expiring visas
  resolveNudgeRecipients.mockResolvedValue(nudgeRecipients(NUDGE_EMAILS));
  prismaMock.complianceCertificateAlert.findUnique.mockImplementation((args: {
    where: { certificateId_threshold: { certificateId: string; threshold: number } };
  }) => {
    const key = `${args.where.certificateId_threshold.certificateId}:${args.where.certificateId_threshold.threshold}`;
    return Promise.resolve(existingAlerts.has(key) ? { id: "existing" } : null);
  });
  prismaMock.complianceCertificateAlert.create.mockImplementation((args: {
    data: { certificateId: string; threshold: number; channels: string[] };
  }) => {
    const key = `${args.data.certificateId}:${args.data.threshold}`;
    existingAlerts.add(key);
    return Promise.resolve({ id: `alert-${key}`, ...args.data, sentAt: new Date() });
  });
  prismaMock.userNotification.createMany.mockResolvedValue({ count: 1 });
  prismaMock.auditInstance.findMany.mockResolvedValue([]); // no audit escalation

  return existingAlerts;
}

// ── tests ────────────────────────────────────────────────────

describe("GET /api/cron/compliance-alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
    process.env.CRON_SECRET = "test-secret";
    resendSend.mockClear();
    resendSend.mockResolvedValue({ messageId: "mail-1", suppressed: [], sent: [] });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns 401 when CRON_SECRET is missing or wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/compliance-alerts", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("happy path: cert expiring in 29 days → 30-day alert + notification + dedup row", async () => {
    const cert = makeCert({ id: "c1", expiryDate: daysFromNow(29) });
    setup([cert]);

    const res = await GET(authed());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.emailsSent).toBe(1);
    expect(body.notificationsCreated).toBe(1);
    expect(body.alertsRecorded).toBe(1);
    expect(body.skippedDuplicates).toBe(0);

    // email goes to the resolved nudge recipients — NOT the cert owner
    // directly (2026-07-24 policy; the owner still gets the bell notif).
    expect(resendSend).toHaveBeenCalledTimes(1);
    const emailCall = resendSend.mock.calls[0][0] as { to: string[] };
    expect(emailCall.to).toEqual(NUDGE_EMAILS);
    expect(emailCall.to).not.toContain("staff@test.com");
    expect(resolveNudgeRecipients).toHaveBeenCalledWith("svc-1");

    // in-app notif (via notifyUser → createMany)
    const notifCall = prismaMock.userNotification.createMany.mock.calls[0][0] as {
      data: { userId: string; type: string; link: string }[];
    };
    expect(notifCall.data[0].type).toBe("cert_expiring_30d");
    expect(notifCall.data[0].userId).toBe("user-1");
    expect(notifCall.data[0].link).toBe("/staff/user-1?tab=compliance");

    // dedup row
    const alertCall = prismaMock.complianceCertificateAlert.create.mock.calls[0][0] as {
      data: { certificateId: string; threshold: number; channels: string[] };
    };
    expect(alertCall.data).toEqual({
      certificateId: "c1",
      threshold: 30,
      channels: ["email", "in_app"],
    });
  });

  it("dedup: second run same day produces 0 new emails/notifications/alerts", async () => {
    const cert = makeCert({ id: "c1", expiryDate: daysFromNow(29) });
    const existing = setup([cert]);

    // First run
    await GET(authed());
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(prismaMock.userNotification.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.complianceCertificateAlert.create).toHaveBeenCalledTimes(1);

    // Second run — the dedup marker we just created means findUnique returns it
    resendSend.mockClear();
    prismaMock.userNotification.createMany.mockClear();
    prismaMock.complianceCertificateAlert.create.mockClear();

    const res2 = await GET(authed());
    const body2 = await res2.json();

    expect(body2.emailsSent).toBe(0);
    expect(body2.notificationsCreated).toBe(0);
    expect(body2.alertsRecorded).toBe(0);
    expect(body2.skippedDuplicates).toBe(1);
    expect(resendSend).not.toHaveBeenCalled();
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
    expect(prismaMock.complianceCertificateAlert.create).not.toHaveBeenCalled();
    // existing set still has the marker from run 1
    expect(existing.has("c1:30")).toBe(true);
  });

  it("threshold transitions: 29→30, 13→14, 6→7, -1→0 each fire one dedup row", async () => {
    const cases: Array<{ days: number; threshold: number; notifType: string }> = [
      { days: 29, threshold: 30, notifType: "cert_expiring_30d" },
      { days: 13, threshold: 14, notifType: "cert_expiring_14d" },
      { days: 6, threshold: 7, notifType: "cert_expiring_7d" },
      { days: -1, threshold: 0, notifType: "cert_expired" },
    ];

    for (const c of cases) {
      vi.clearAllMocks();
      const cert = makeCert({
        id: `cert-${c.threshold}`,
        expiryDate: daysFromNow(c.days),
      });
      setup([cert]);

      const res = await GET(authed());
      const body = await res.json();

      expect(body.alertsRecorded).toBe(1);
      expect(body.notificationsCreated).toBe(1);
      expect(body.emailsSent).toBe(1);

      const alertCall = prismaMock.complianceCertificateAlert.create.mock.calls[0][0] as {
        data: { threshold: number };
      };
      expect(alertCall.data.threshold).toBe(c.threshold);

      const notifCall = prismaMock.userNotification.createMany.mock.calls[0][0] as {
        data: { type: string }[];
      };
      expect(notifCall.data[0].type).toBe(c.notifType);
    }
  });

  it("ignores certs further than 30 days out", async () => {
    const cert = makeCert({ id: "far", expiryDate: daysFromNow(45) });
    // findMany already filters by expiryDate <= in30d in real prisma,
    // but we also guard with pickThreshold — simulate by passing it
    // through anyway and asserting it gets skipped.
    setup([cert]);

    const res = await GET(authed());
    const body = await res.json();

    expect(body.alertsRecorded).toBe(0);
    expect(body.emailsSent).toBe(0);
    expect(prismaMock.complianceCertificateAlert.create).not.toHaveBeenCalled();
  });

  it("sends alert even when the cert has no fileUrl", async () => {
    const cert = makeCert({
      id: "cnof",
      expiryDate: daysFromNow(5),
      fileUrl: null,
    });
    setup([cert]);

    const res = await GET(authed());
    const body = await res.json();

    expect(body.emailsSent).toBe(1);
    expect(body.notificationsCreated).toBe(1);
    expect(body.alertsRecorded).toBe(1);
  });

  it("emails the nudge recipients resolved for the cert's service", async () => {
    const cert = makeCert({
      id: "cc1",
      expiryDate: daysFromNow(5),
      serviceId: "svc-9",
      userEmail: "staff@test.com",
    });
    setup([cert]);
    resolveNudgeRecipients.mockImplementation((serviceId: string | null) =>
      Promise.resolve(
        nudgeRecipients(
          serviceId === "svc-9"
            ? ["svc9-inbox@test.com", "leader@test.com"]
            : [],
        ),
      ),
    );

    await GET(authed());

    expect(resolveNudgeRecipients).toHaveBeenCalledWith("svc-9");
    expect(resendSend).toHaveBeenCalledTimes(1);
    const to = (resendSend.mock.calls[0][0] as { to: string[] }).to;
    expect(to).toEqual(["svc9-inbox@test.com", "leader@test.com"]);
    // the owner is bell-only under the nudge policy
    expect(to).not.toContain("staff@test.com");
  });

  it("no resolvable recipients → in-app notification only, no email, no dedup", async () => {
    const cert = makeCert({ id: "norecip", expiryDate: daysFromNow(5) });
    setup([cert]);
    resolveNudgeRecipients.mockResolvedValue(nudgeRecipients([]));

    const res = await GET(authed());
    const body = await res.json();

    expect(body.emailsSent).toBe(0);
    expect(body.notificationsCreated).toBe(1); // bell still surfaces it
    expect(body.alertsRecorded).toBe(0); // no dedup row — retried next run
    expect(resendSend).not.toHaveBeenCalled();
    expect(prismaMock.complianceCertificateAlert.create).not.toHaveBeenCalled();
  });

  it("skips certs without an active user (no one to notify)", async () => {
    const cert = makeCert({
      id: "noactive",
      expiryDate: daysFromNow(5),
      userActive: false,
    });
    setup([cert]);

    const res = await GET(authed());
    const body = await res.json();

    expect(body.emailsSent).toBe(0);
    expect(body.notificationsCreated).toBe(0);
    expect(body.alertsRecorded).toBe(0);
  });

  it("email failure does NOT record dedup — cert retries next run", async () => {
    const cert = makeCert({ id: "emailfail", expiryDate: daysFromNow(5) });
    setup([cert]);
    resendSend.mockRejectedValueOnce(new Error("SMTP 503"));

    const res = await GET(authed());
    const body = await res.json();

    expect(body.emailsSent).toBe(0);
    expect(body.notificationsCreated).toBe(0);
    expect(body.alertsRecorded).toBe(0);
    expect(prismaMock.complianceCertificateAlert.create).not.toHaveBeenCalled();
    expect(body.errors).toBeDefined();
    expect(body.errors[0]).toContain("SMTP 503");
  });
});
