import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTestService, createTestUser } from "@/lib/test-utils";
import { mockSession } from "../../src/__tests__/helpers/auth-mock";
import { createRequest } from "../../src/__tests__/helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { POST as issue } from "@/app/api/billing/statements/[id]/issue/route";
import { GET as detail } from "@/app/api/billing/statements/[id]/route";
import { POST as retry } from "@/app/api/billing/statements/[id]/delivery/retry/route";
import { processStatementDelivery, retryStatementDelivery, DELIVERY_RETRY_WINDOW_MS } from "@/lib/billing/statement-delivery";
import { sendEmail } from "@/lib/email";
import { generateStatementPdf } from "@/lib/billing/statement-pdf";
import { runAfter } from "@/lib/run-after";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/run-after", () => ({ runAfter: vi.fn() }));
vi.mock("@/lib/email", () => ({ FROM_EMAIL: "Amana <sender@example.test>", sendEmail: vi.fn() }));
vi.mock("@/lib/billing/statement-pdf", () => ({ generateStatementPdf: vi.fn() }));

let serviceId: string, contactId: string, id: string;
let owner: User, member: User;
const statements: string[] = [], users: string[] = [];
const ctx = () => ({ params: Promise.resolve({ id }) });
const job = () => prisma.statementDelivery.findUniqueOrThrow({ where: { statementId: id } });
const issueRequest = () => issue(createRequest("POST", `/api/billing/statements/${id}/issue`), ctx());
const activate = async () => { expect((await issueRequest()).status).toBe(200); };
const transient = () => vi.mocked(sendEmail).mockResolvedValueOnce({ sent: [], suppressed: [], failed: { name: "rate_limit_exceeded", message: "Synthetic transient", statusCode: 429 } });

beforeAll(async () => {
  const db = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(db.hostname) || !db.pathname.endsWith("_test")) throw new Error("Requires an isolated local test database");
  serviceId = (await createTestService()).id;
  contactId = (await prisma.centreContact.create({ data: { serviceId, email: "synthetic@example.test", firstName: "Parent <script>" } })).id;
  owner = (await createTestUser("owner")).user; users.push(owner.id);
  member = (await createTestUser("member", { serviceId })).user; users.push(member.id);
});
beforeEach(async () => {
  vi.clearAllMocks(); _clearUserActiveCache(); mockSession(owner);
  vi.stubEnv("RESEND_API_KEY", "synthetic-no-real-send");
  vi.stubEnv("FIELD_ENCRYPTION_KEY", "1".repeat(64));
  await prisma.centreContact.update({ where: { id: contactId }, data: { email: "synthetic@example.test", firstName: "Parent <script>" } });
  vi.mocked(sendEmail).mockResolvedValue({ sent: ["synthetic@example.test"], suppressed: [], messageId: "provider-synthetic" });
  vi.mocked(generateStatementPdf).mockResolvedValue("https://synthetic.example.test/statement.pdf");
  id = (await prisma.statement.create({ data: { serviceId, contactId, periodStart: new Date("2026-10-05"), periodEnd: new Date("2026-10-09"), totalFees: 30, gapFee: 20, balance: 20 } })).id;
  statements.push(id);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma.notificationLog.deleteMany({ where: { relatedId: { in: statements } } });
  await prisma.activityLog.deleteMany({ where: { entityId: { in: statements } } });
  await prisma.statement.deleteMany({ where: { id: { in: statements } } });
  await prisma.centreContact.deleteMany({ where: { id: contactId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.service.deleteMany({ where: { id: serviceId } });
});

describe("durable invoice delivery against PostgreSQL", () => {
  it("atomically issues one invoice and tracks provider acceptance with an encrypted escaped snapshot", async () => {
    await activate();
    expect((await job()).status).toBe("pending"); expect(sendEmail).not.toHaveBeenCalled();
    expect(runAfter).toHaveBeenCalledTimes(1);
    await processStatementDelivery(id);
    const saved = await job();
    expect(saved).toMatchObject({ status: "sent", providerMessageId: "provider-synthetic", leaseToken: null });
    expect(saved.emailPayload).toMatch(/^enc:/); expect(saved.emailPayload).not.toContain("synthetic@example.test");
    expect(vi.mocked(sendEmail).mock.calls[0][0].html).toContain("Parent &lt;script&gt;");
    expect(vi.mocked(sendEmail).mock.calls[0][1]?.idempotencyKey).toBe(`statement-issued/${saved.id}`);
    expect(await prisma.statement.findUnique({ where: { id }, select: { pdfUrl: true } })).toEqual({ pdfUrl: saved.pdfUrl });
  });
  it("concurrent issue requests create exactly one durable job", async () => {
    const responses = await Promise.all([issueRequest(), issueRequest()]);
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    expect(responses.every(r => [200, 400, 409].includes(r.status))).toBe(true);
    expect(await prisma.statementDelivery.count({ where: { statementId: id } })).toBe(1);
  });
  it("rolls back issuance when its delivery job cannot be persisted", async () => {
    await prisma.$executeRawUnsafe('ALTER TABLE "StatementDelivery" ADD CONSTRAINT delivery_test_reject_insert CHECK (false) NOT VALID');
    try { expect((await issueRequest()).status).toBe(500); }
    finally { await prisma.$executeRawUnsafe('ALTER TABLE "StatementDelivery" DROP CONSTRAINT delivery_test_reject_insert'); }
    expect((await prisma.statement.findUniqueOrThrow({ where: { id } })).status).toBe("draft");
    expect(await prisma.statementDelivery.count({ where: { statementId: id } })).toBe(0);
    expect(runAfter).not.toHaveBeenCalled();
  });
  it("concurrent workers share a single claim", async () => {
    await activate(); await Promise.all([processStatementDelivery(id), processStatementDelivery(id)]);
    expect(sendEmail).toHaveBeenCalledTimes(1); expect(generateStatementPdf).toHaveBeenCalledTimes(1);
  });
  it("retries the identical frozen message after contact changes without regenerating the PDF", async () => {
    await activate(); transient(); await processStatementDelivery(id);
    const before = await job(), payload = vi.mocked(sendEmail).mock.calls[0][0];
    await prisma.centreContact.update({ where: { id: contactId }, data: { email: "changed@example.test", firstName: "Changed" } });
    await prisma.statement.update({ where: { id }, data: { status: "paid" } });
    await retryStatementDelivery(id, owner.id); await processStatementDelivery(id);
    const after = await job();
    expect(after.status).toBe("sent"); expect(after.firstSendStartedAt).toEqual(before.firstSendStartedAt);
    expect(vi.mocked(sendEmail).mock.calls[1][0]).toEqual(payload);
    expect(vi.mocked(sendEmail).mock.calls[1][1]?.idempotencyKey).toBe(vi.mocked(sendEmail).mock.calls[0][1]?.idempotencyKey);
    expect(generateStatementPdf).toHaveBeenCalledTimes(1);
    expect(await prisma.activityLog.count({ where: { entityId: id, action: "retry_statement_delivery" } })).toBe(1);
  });
  it("keeps known acceptance when notification logging fails", async () => {
    await activate();
    await prisma.$executeRawUnsafe('ALTER TABLE "NotificationLog" ADD CONSTRAINT delivery_test_reject_log CHECK (false) NOT VALID');
    try { await processStatementDelivery(id); }
    finally { await prisma.$executeRawUnsafe('ALTER TABLE "NotificationLog" DROP CONSTRAINT delivery_test_reject_log'); }
    expect((await job()).status).toBe("sent"); await processStatementDelivery(id); expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it("recovers accepted-send/database-write uncertainty using the same key and timestamp", async () => {
    await activate();
    await prisma.$executeRawUnsafe('ALTER TABLE "StatementDelivery" ADD CONSTRAINT delivery_test_reject_sent CHECK (status <> \'sent\') NOT VALID');
    try { await processStatementDelivery(id); }
    finally { await prisma.$executeRawUnsafe('ALTER TABLE "StatementDelivery" DROP CONSTRAINT delivery_test_reject_sent'); }
    const before = await job(); expect(before.status).toBe("processing"); expect(before.firstSendStartedAt).not.toBeNull();
    await prisma.statementDelivery.update({ where: { statementId: id }, data: { leaseExpiresAt: new Date(0) } });
    await processStatementDelivery(id);
    expect((await job()).status).toBe("sent"); expect((await job()).firstSendStartedAt).toEqual(before.firstSendStartedAt);
    expect(vi.mocked(sendEmail).mock.calls[1][0]).toEqual(vi.mocked(sendEmail).mock.calls[0][0]);
    expect(vi.mocked(sendEmail).mock.calls[1][1]?.idempotencyKey).toBe(vi.mocked(sendEmail).mock.calls[0][1]?.idempotencyKey);
  });
  it("fences stale PDF uploads and workers after lease recovery", async () => {
    await activate();
    let release!: (url: string) => void, started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    vi.mocked(generateStatementPdf).mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
    const stale = processStatementDelivery(id); await waiting;
    await prisma.statementDelivery.update({ where: { statementId: id }, data: { leaseExpiresAt: new Date(0) } });
    await processStatementDelivery(id);
    release("https://synthetic.example.test/stale.pdf"); await stale;
    expect((await job()).pdfUrl).toBe("https://synthetic.example.test/statement.pdf");
    expect((await prisma.statement.findUniqueOrThrow({ where: { id } })).pdfUrl).toBe("https://synthetic.example.test/statement.pdf");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it.each(["paid", "overdue", "unpaid", "void", "draft"] as const)("handles %s transitions without reviving invoices", async status => {
    await activate(); await prisma.statement.update({ where: { id }, data: { status } }); await processStatementDelivery(id);
    expect((await job()).status).toBe(["draft", "void"].includes(status) ? "cancelled" : "sent");
    expect(sendEmail).toHaveBeenCalledTimes(["draft", "void"].includes(status) ? 0 : 1);
    expect((await prisma.statement.findUniqueOrThrow({ where: { id } })).status).toBe(status);
  });
  it.each([false, true])("respects the conservative resend deadline (expired=%s)", async expired => {
    await activate(); transient(); await processStatementDelivery(id);
    const first = new Date(Date.now() - DELIVERY_RETRY_WINDOW_MS + (expired ? -1 : 60_000));
    await prisma.statementDelivery.update({ where: { statementId: id }, data: { firstSendStartedAt: first, nextAttemptAt: new Date(0) } });
    if (expired) await expect(retryStatementDelivery(id, owner.id)).rejects.toMatchObject({ status: 409 });
    await processStatementDelivery(id);
    expect((await job()).status).toBe(expired ? "needs_review" : "sent");
    expect(sendEmail).toHaveBeenCalledTimes(expired ? 1 : 2); expect((await job()).firstSendStartedAt).toEqual(first);
  });
  it("does not report suppression as success or blindly retry it", async () => {
    await activate(); vi.mocked(sendEmail).mockResolvedValueOnce({ sent: [], suppressed: ["synthetic@example.test"] });
    await processStatementDelivery(id); expect((await job()).status).toBe("needs_review");
    await expect(retryStatementDelivery(id, owner.id)).rejects.toMatchObject({ status: 409 });
  });
  it("shows reconciliation after exhausted retries expire without another scheduled attempt", async () => {
    await activate();
    await prisma.statementDelivery.update({ where: { statementId: id }, data: { attemptCount: 4 } });
    transient(); await processStatementDelivery(id);
    expect(await job()).toMatchObject({ status: "failed", attemptCount: 5, nextAttemptAt: null });
    await prisma.statementDelivery.update({ where: { statementId: id }, data: { firstSendStartedAt: new Date(Date.now() - DELIVERY_RETRY_WINDOW_MS - 1) } });
    const response = await detail(createRequest("GET", `/api/billing/statements/${id}`), ctx());
    expect((await response.json()).delivery).toMatchObject({ status: "needs_review", errorCode: "RETRY_WINDOW_EXPIRED", canRetry: false, nextAttemptAt: null });
    await expect(retryStatementDelivery(id, owner.id)).rejects.toMatchObject({ status: 409 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it("blocks a missing recipient before attempting the provider", async () => {
    await activate(); await prisma.centreContact.update({ where: { id: contactId }, data: { email: "" } });
    await processStatementDelivery(id); expect((await job()).lastErrorCode).toBe("MISSING_RECIPIENT"); expect(sendEmail).not.toHaveBeenCalled();
  });
  it("authorizes retries and rejects cross-origin/missing-origin requests", async () => {
    await activate(); transient(); await processStatementDelivery(id);
    const request = (origin?: string) => createRequest("POST", `/api/billing/statements/${id}/delivery/retry`, { headers: origin ? { origin } : {} });
    mockSession(member); expect((await retry(request("http://localhost:3000"), ctx())).status).toBe(403);
    mockSession(owner); expect((await retry(request("https://foreign.example.test"), ctx())).status).toBe(403);
    expect((await retry(request(), ctx())).status).toBe(403);
    expect((await retry(request("http://localhost:3000"), ctx())).status).toBe(202);
    expect((await retry(request("http://localhost:3000"), ctx())).status).toBe(409);
  });
  it("returns safe delivery state without snapshot or lease secrets", async () => {
    await activate(); await processStatementDelivery(id);
    const response = await detail(createRequest("GET", `/api/billing/statements/${id}`), ctx());
    expect(response.status).toBe(200); const data = await response.json();
    expect(data.delivery.status).toBe("sent"); expect(data.delivery.canRetry).toBe(false);
    expect(JSON.stringify(data)).not.toContain("emailPayload"); expect(JSON.stringify(data)).not.toContain("leaseToken");
    expect(JSON.stringify(data)).not.toContain("firstSendStartedAt");
  });
});
