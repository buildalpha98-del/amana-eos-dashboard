import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// Mock email sending. Returns the shape that `sendEmail` promises.
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() => Promise.resolve({ sent: [], suppressed: [] })),
}));

// Mock email template so we don't need to rebuild HTML in tests.
vi.mock("@/lib/email-templates", () => ({
  complianceAdminSummaryEmail: vi.fn(() => ({
    subject: "Compliance Summary",
    html: "<p>summary</p>",
  })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { checkCertExpiry } from "@/lib/cert-expiry";
import { sendEmail } from "@/lib/email";

const NOW = new Date("2026-03-22T10:00:00Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86400000);
}

function makeCert(overrides: {
  expiryDate: Date;
  serviceId?: string;
  serviceName?: string;
  userActive?: boolean;
}) {
  return {
    id: `cert-${Math.random().toString(36).slice(2, 8)}`,
    expiryDate: overrides.expiryDate,
    serviceId: overrides.serviceId ?? "svc-1",
    user: { active: overrides.userActive ?? true },
    service: {
      id: overrides.serviceId ?? "svc-1",
      name: overrides.serviceName ?? "Centre Alpha",
    },
  };
}

describe("checkCertExpiry (weekly admin digest)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns all zeros when no certs in window", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result).toEqual({
      total: 0,
      expired: 0,
      critical: 0,
      warning: 0,
      upcoming: 0,
      servicesAffected: 0,
      emailsSent: 0,
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("classifies expired / critical / warning / upcoming correctly", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      makeCert({ expiryDate: daysFromNow(-5), serviceId: "svc-1" }),   // expired
      makeCert({ expiryDate: daysFromNow(3), serviceId: "svc-1" }),    // critical
      makeCert({ expiryDate: daysFromNow(10), serviceId: "svc-2" }),   // warning
      makeCert({ expiryDate: daysFromNow(20), serviceId: "svc-2" }),   // upcoming
    ]);
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.expired).toBe(1);
    expect(result.critical).toBe(1);
    expect(result.warning).toBe(1);
    expect(result.upcoming).toBe(1);
    expect(result.total).toBe(4);
    expect(result.servicesAffected).toBe(2);
  });

  it("counts orphaned certs (no active user) in totals — digest still surfaces them", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      makeCert({ expiryDate: daysFromNow(-1), userActive: false }),
    ]);
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.total).toBe(1);
    expect(result.expired).toBe(1);
  });

  it("emails admin / head_office / owner once each", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      makeCert({ expiryDate: daysFromNow(5) }),
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { name: "Admin One", email: "admin@test.com" },
      { name: "Owner", email: "owner@test.com" },
      { name: "HO", email: "ho@test.com" },
    ]);

    const result = await checkCertExpiry();

    expect(result.emailsSent).toBe(3);
    expect(sendEmail).toHaveBeenCalledTimes(3);
    const userFindManyCall = prismaMock.user.findMany.mock.calls[0][0];
    expect(userFindManyCall.where.role.in).toEqual(["owner", "admin", "head_office"]);
    expect(userFindManyCall.where.active).toBe(true);
  });

  it("sends zero admin emails when no admins exist", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      makeCert({ expiryDate: daysFromNow(5) }),
    ]);
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.emailsSent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("collects email errors without crashing", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      makeCert({ expiryDate: daysFromNow(5) }),
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { name: "Admin", email: "admin@test.com" },
    ]);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("SMTP timeout"));

    const result = await checkCertExpiry();

    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]).toContain("SMTP timeout");
    expect(result.emailsSent).toBe(0);
  });

  it("does NOT create UserNotification rows (that's the daily cron's job)", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      makeCert({ expiryDate: daysFromNow(5) }),
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { name: "Admin", email: "admin@test.com" },
    ]);

    await checkCertExpiry();

    expect(prismaMock.userNotification.create).not.toHaveBeenCalled();
  });

  it("does NOT touch ComplianceCertificateAlert (dedup lives with daily cron only)", async () => {
    prismaMock.complianceCertificate.findMany.mockResolvedValue([
      makeCert({ expiryDate: daysFromNow(5) }),
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { name: "Admin", email: "admin@test.com" },
    ]);

    await checkCertExpiry();

    expect(prismaMock.complianceCertificateAlert.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.complianceCertificateAlert.create).not.toHaveBeenCalled();
  });
});
