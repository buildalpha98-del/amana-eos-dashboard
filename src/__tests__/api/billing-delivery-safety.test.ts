import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { POST as issue } from "@/app/api/billing/statements/[id]/issue/route";
import { POST as create } from "@/app/api/billing/statements/route";
import { runAfter } from "@/lib/run-after";
import { generateStatementPdf } from "@/lib/billing/statement-pdf";
import { sendStatementIssuedNotification } from "@/lib/notifications/billing";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/run-after", () => ({ runAfter: vi.fn() }));
vi.mock("@/lib/billing/statement-pdf", () => ({ generateStatementPdf: vi.fn(async () => "pdf") }));
vi.mock("@/lib/notifications/billing", () => ({ sendStatementIssuedNotification: vi.fn(async () => {}) }));
const body = { contactId: "family", serviceId: "centre", periodStart: "2026-10-01", periodEnd: "2026-10-31", lineItems: [{ childId: "child", date: "2026-10-05", sessionType: "asc", description: "Care", grossFee: 30, ccsHours: 0, ccsRate: 0, ccsAmount: 0, gapAmount: 30 }] };
beforeEach(() => {
  vi.clearAllMocks(); _clearUserActiveCache();
  mockSession({ id: "admin", name: "Admin", role: "admin" });
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.statement.findFirst.mockResolvedValue(null);
  prismaMock.statementLineItem.findFirst.mockResolvedValue(null);
  prismaMock.child.findMany.mockResolvedValue([{ id: "child" }]);
});
describe("invoice delivery lifecycle", () => {
  it("registers PDF and email with the request lifecycle and sends in order", async () => {
    prismaMock.statement.findUnique.mockResolvedValue({ id: "statement", status: "draft" });
    prismaMock.statement.update.mockResolvedValue({ id: "statement", status: "issued" });
    expect((await issue(createRequest("POST", "/api/billing/statements/statement/issue"), { params: Promise.resolve({ id: "statement" }) })).status).toBe(200);
    expect(runAfter).toHaveBeenCalledTimes(1);
    expect(generateStatementPdf).not.toHaveBeenCalled();
    expect(sendStatementIssuedNotification).not.toHaveBeenCalled();
    await vi.mocked(runAfter).mock.calls[0][0]();
    expect(generateStatementPdf).toHaveBeenCalledWith("statement");
    expect(sendStatementIssuedNotification).toHaveBeenCalledWith("statement");
    expect(vi.mocked(generateStatementPdf).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(sendStatementIssuedNotification).mock.invocationCallOrder[0]);
  });
});
describe("manual invoice overlap guard", () => {
  it("rejects a session already owned by another live invoice", async () => {
    prismaMock.statementLineItem.findFirst.mockResolvedValue({ id: "existing-line" });
    const response = await create(createRequest("POST", "/api/billing/statements", { body }));
    expect(response.status).toBe(409);
    expect(prismaMock.statement.create).not.toHaveBeenCalled();
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it("rejects a child from another service so every writer shares the correct lock", async () => {
    prismaMock.child.findMany.mockResolvedValue([]);
    expect((await create(createRequest("POST", "/api/billing/statements", { body }))).status).toBe(400);
    expect(prismaMock.statement.create).not.toHaveBeenCalled();
  });
});
