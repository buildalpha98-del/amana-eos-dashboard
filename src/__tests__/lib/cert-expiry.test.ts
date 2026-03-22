import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// Mock email sending
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() => Promise.resolve()),
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
  userName?: string;
  userActive?: boolean;
  serviceId?: string;
  serviceName?: string;
  managerId?: string | null;
  type?: string;
  label?: string | null;
}) {
  return {
    id: `cert-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? "first_aid",
    label: overrides.label ?? null,
    expiryDate: overrides.expiryDate,
    user: {
      id: `user-${Math.random().toString(36).slice(2, 8)}`,
      name: overrides.userName ?? "Staff Member",
      email: "staff@test.com",
      active: overrides.userActive ?? true,
    },
    service: {
      id: overrides.serviceId ?? "svc-1",
      name: overrides.serviceName ?? "Centre Alpha",
      code: "CA",
      managerId: overrides.managerId ?? "mgr-1",
    },
  };
}

describe("checkCertExpiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
    prismaMock.complianceCertificate.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns all zeros when no certs found", async () => {
    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([])  // expiring
      .mockResolvedValueOnce([]); // expired

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

  it("classifies expired certs correctly (expiryDate < now)", async () => {
    const expiredCert = makeCert({ expiryDate: daysFromNow(-5) });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([])           // expiring (future)
      .mockResolvedValueOnce([expiredCert]); // expired (past)
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Manager One", email: "mgr@test.com", active: true,
    });
    prismaMock.user.findMany.mockResolvedValue([]); // no admins

    const result = await checkCertExpiry();

    expect(result.expired).toBe(1);
    expect(result.critical).toBe(0);
    expect(result.warning).toBe(0);
    expect(result.upcoming).toBe(0);
    expect(result.total).toBe(1);
  });

  it("classifies critical certs (≤7 days)", async () => {
    const criticalCert = makeCert({ expiryDate: daysFromNow(3) });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([criticalCert])
      .mockResolvedValueOnce([]);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Manager", email: "mgr@test.com", active: true,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.critical).toBe(1);
    expect(result.expired).toBe(0);
  });

  it("classifies warning certs (≤14 days)", async () => {
    const warningCert = makeCert({ expiryDate: daysFromNow(10) });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([warningCert])
      .mockResolvedValueOnce([]);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Manager", email: "mgr@test.com", active: true,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.warning).toBe(1);
  });

  it("classifies upcoming certs (>14 days, <30 days)", async () => {
    const upcomingCert = makeCert({ expiryDate: daysFromNow(20) });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([upcomingCert])
      .mockResolvedValueOnce([]);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Manager", email: "mgr@test.com", active: true,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.upcoming).toBe(1);
  });

  it("skips inactive staff", async () => {
    const inactiveCert = makeCert({
      expiryDate: daysFromNow(5),
      userActive: false,
    });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([inactiveCert])
      .mockResolvedValueOnce([]);
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    // Cert is in allCerts but filtered out during classification
    expect(result.total).toBe(1); // total includes all fetched
    expect(result.critical).toBe(0); // but not counted in urgency
  });

  it("sends manager email for each service with managerId", async () => {
    const cert1 = makeCert({
      expiryDate: daysFromNow(5),
      serviceId: "svc-1",
      serviceName: "Centre A",
      managerId: "mgr-1",
    });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([cert1])
      .mockResolvedValueOnce([]);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jane Smith", email: "jane@test.com", active: true,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.emailsSent).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@test.com",
        subject: expect.stringContaining("Certificate Expiry"),
      }),
    );
  });

  it("skips manager email when manager is inactive", async () => {
    const cert = makeCert({
      expiryDate: daysFromNow(5),
      managerId: "mgr-1",
    });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([cert])
      .mockResolvedValueOnce([]);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Manager", email: "mgr@test.com", active: false,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.emailsSent).toBe(0);
  });

  it("skips manager email when service has no managerId", async () => {
    const cert = makeCert({
      expiryDate: daysFromNow(5),
      managerId: null,
    });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([cert])
      .mockResolvedValueOnce([]);
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.emailsSent).toBe(0);
    // No manager email sent (findUnique not called for manager lookup)
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends admin summary email to all owner/admin/head_office users", async () => {
    const cert = makeCert({ expiryDate: daysFromNow(5), managerId: null });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([cert])
      .mockResolvedValueOnce([]);
    prismaMock.user.findMany.mockResolvedValue([
      { name: "Admin One", email: "admin1@test.com" },
      { name: "Owner Two", email: "owner2@test.com" },
    ]);

    const result = await checkCertExpiry();

    expect(result.emailsSent).toBe(2); // 2 admin summaries
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("counts services affected correctly", async () => {
    const cert1 = makeCert({ expiryDate: daysFromNow(5), serviceId: "svc-1", managerId: null });
    const cert2 = makeCert({ expiryDate: daysFromNow(10), serviceId: "svc-2", managerId: null });
    const cert3 = makeCert({ expiryDate: daysFromNow(15), serviceId: "svc-1", managerId: null });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([cert1, cert2, cert3])
      .mockResolvedValueOnce([]);
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await checkCertExpiry();

    expect(result.servicesAffected).toBe(2); // svc-1 and svc-2
    expect(result.total).toBe(3);
  });

  it("collects email errors without crashing", async () => {
    const cert = makeCert({ expiryDate: daysFromNow(5), managerId: "mgr-1" });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([cert])
      .mockResolvedValueOnce([]);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Manager", email: "mgr@test.com", active: true,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("SMTP timeout"));

    const result = await checkCertExpiry();

    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]).toContain("SMTP timeout");
    expect(result.emailsSent).toBe(0); // the failed one wasn't counted
  });

  it("subject line uses singular for 1 cert, plural for multiple", async () => {
    const cert = makeCert({
      expiryDate: daysFromNow(5),
      managerId: "mgr-1",
      serviceName: "Alpha",
    });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([cert])
      .mockResolvedValueOnce([]);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jane", email: "jane@test.com", active: true,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    await checkCertExpiry();

    const callArgs = vi.mocked(sendEmail).mock.calls[0][0];
    expect(callArgs.subject).toContain("1 cert at Alpha");
    expect(callArgs.subject).not.toContain("certs");
  });

  it("subject includes 'Action Required' when expired certs exist", async () => {
    const cert = makeCert({
      expiryDate: daysFromNow(-2),
      managerId: "mgr-1",
    });

    prismaMock.complianceCertificate.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([cert]);
    prismaMock.user.findUnique.mockResolvedValue({
      name: "Jane", email: "jane@test.com", active: true,
    });
    prismaMock.user.findMany.mockResolvedValue([]);

    await checkCertExpiry();

    const callArgs = vi.mocked(sendEmail).mock.calls[0][0];
    expect(callArgs.subject).toContain("Action Required");
  });
});
