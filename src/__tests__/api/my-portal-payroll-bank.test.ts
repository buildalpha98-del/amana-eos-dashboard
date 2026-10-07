import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

const saveMainBankAccount = vi.fn((..._args: unknown[]) => Promise.resolve({} as unknown));
vi.mock("@/lib/eh-payroll", () => ({
  isConfigured: () => true,
  saveMainBankAccount: (...a: unknown[]) => saveMainBankAccount(...a),
  EhPayrollError: class extends Error { status = 400; },
}));
const sendEmail = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
const logAuditEvent = vi.fn((..._args: unknown[]) => undefined);
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: (...a: unknown[]) => logAuditEvent(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "rid",
}));

const notifyUsers = vi.fn((..._args: unknown[]) => Promise.resolve(1));
vi.mock("@/lib/notify-user", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));

import { PUT } from "@/app/api/my-portal/payroll/bank/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const body = { accountName: "Amina Yusuf", bsb: "062-000", accountNumber: "12345678" };

describe("PUT /api/my-portal/payroll/bank", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    mockSession({ id: "u1", name: "Amina", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, employmentHeroEmployeeId: 555 } as never);
    saveMainBankAccount.mockResolvedValue({
      account: { id: 1, employeeId: 555, bsb: "062000", accountName: "Amina Yusuf", accountNumber: "12345678", allocatedPercentage: null, fixedAmount: null, allocateBalance: true },
      warning: null,
      previous: { accountNumber: "99998888" },
    });
  });

  it("writes to the caller's OWN EH record, from the session", async () => {
    const res = await PUT(createRequest("PUT", "/api/my-portal/payroll/bank", { body: { ...body, employeeId: 1 } }));
    expect(res.status).toBe(200);
    expect(saveMainBankAccount).toHaveBeenCalledWith(555, {
      accountName: "Amina Yusuf", bsb: "062000", accountNumber: "12345678",
    });
  });

  it("returns only a masked account number", async () => {
    const res = await PUT(createRequest("PUT", "/api/my-portal/payroll/bank", { body }));
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain("12345678");
    expect(json.account.accountNumberMasked).toBe("•••• 678");
  });

  it("audits with masked numbers and emails the account owner", async () => {
    await PUT(createRequest("PUT", "/api/my-portal/payroll/bank", { body }));
    const audit = logAuditEvent.mock.calls[0][0] as { action: string };
    expect(audit.action).toBe("payroll.bank_account_changed");
    expect(JSON.stringify(audit)).not.toContain("12345678");
    expect(JSON.stringify(audit)).not.toContain("99998888");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "u1@test.com", subject: "Your pay account was changed" }));
  });

  it("alerts every owner in-app and by email, with only the last 3 digits", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "o1", email: "director@amanaoshc.com.au" },
    ] as never);
    await PUT(createRequest("PUT", "/api/my-portal/payroll/bank", { body }));
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toMatchObject({ role: "owner", active: true });
    expect(notifyUsers).toHaveBeenCalledWith(expect.anything(), ["o1"], expect.objectContaining({
      type: "payroll_bank_changed",
      link: "/staff/u1",
    }));
    const ownerMail = sendEmail.mock.calls.find((c) => Array.isArray((c[0] as { to: unknown } | undefined)?.to));
    expect(ownerMail?.[0]).toMatchObject({ to: ["director@amanaoshc.com.au"] });
    expect(JSON.stringify(ownerMail)).not.toContain("12345678");
    expect(JSON.stringify(ownerMail)).toContain("678");
  });

  it("still saves when the owner alert fails", async () => {
    prismaMock.user.findMany.mockRejectedValue(new Error("db"));
    const res = await PUT(createRequest("PUT", "/api/my-portal/payroll/bank", { body }));
    expect(res.status).toBe(200);
  });

  it("rejects a bad BSB without calling EH", async () => {
    const res = await PUT(createRequest("PUT", "/api/my-portal/payroll/bank", { body: { ...body, bsb: "12" } }));
    expect(res.status).toBe(400);
    expect(saveMainBankAccount).not.toHaveBeenCalled();
  });

  it("404s for someone not linked to payroll", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, employmentHeroEmployeeId: null } as never);
    const res = await PUT(createRequest("PUT", "/api/my-portal/payroll/bank", { body }));
    expect(res.status).toBe(404);
  });
});
