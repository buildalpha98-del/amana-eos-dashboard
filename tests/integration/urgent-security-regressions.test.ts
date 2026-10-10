/** Real PostgreSQL regressions. All data is created and removed in the test DB. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestService, createTestUser } from "@/lib/test-utils";
import { mockSession } from "../../src/__tests__/helpers/auth-mock";
import { createRequest } from "../../src/__tests__/helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { POST as generate } from "@/app/api/billing/statements/generate/route";
import { PATCH as editStatement } from "@/app/api/billing/statements/[id]/route";
import { POST as manual } from "@/app/api/billing/statements/route";
import { POST as issueStatement } from "@/app/api/billing/statements/[id]/issue/route";
import { POST as voidStatement } from "@/app/api/billing/statements/[id]/void/route";
import { POST as recordPayment } from "@/app/api/billing/payments/route";
import { GET as markOverdue } from "@/app/api/cron/overdue-statements/route";
import { PATCH as acceptDraft } from "@/app/api/ai-drafts/[id]/route";
import { GET as rockDetail } from "@/app/api/rocks/[id]/route";
import { GET as issueDetail } from "@/app/api/issues/[id]/route";
import { GET as projectDetail } from "@/app/api/projects/[id]/route";
import { GET as serviceDetail } from "@/app/api/services/[id]/route";
import { POST as bulkTodos } from "@/app/api/todos/bulk-actions/route";
import { DELETE as deleteTodo } from "@/app/api/todos/[id]/route";
import { PATCH as familyPatch } from "@/app/api/families/[id]/route";
import { getParentSession, signParentJwt, withParentAuth } from "@/lib/parent-auth";
import { authenticateParent } from "@/lib/parent-account";
import { completeParentPasswordReset, createParentPasswordReset, setParentPasswordDirect } from "@/lib/parent-password-reset";
import type { User } from "@prisma/client";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/password-breach-check", () => ({ checkPasswordBreach: vi.fn(async () => 0) }));
vi.mock("@/lib/run-after", () => ({ runAfter: vi.fn() }));
vi.mock("@/lib/notifications/billing", () => ({ sendPaymentReceivedNotification: vi.fn(async () => {}), sendOverdueStatementNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/cron-guard", () => ({ verifyCronSecret: vi.fn(() => null), acquireCronLock: vi.fn(async () => ({ acquired: true, complete: vi.fn(), fail: vi.fn() })) }));

let serviceId: string, childId: string, contactId: string, enrolmentId: string, accountId: string;
let rockId: string, issueId: string, projectId: string, hiddenId: string, publicId: string, coassignedId: string;
let owner: User, member: User, implementer: User;
let hiddenDraftId: string, coassignedDraftId: string;
const email = `security-${Date.now()}@amana-test.local`;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const sessionAs = (user: User) => { _clearUserActiveCache(); mockSession(user); };
const parentHandler = withParentAuth(async (_req, context) => NextResponse.json({ ids: context.parent.enrolmentIds }));
const parentRequest = (token: string) => parentHandler(createRequest("GET", "/api/parent/state", { headers: { cookie: `parent-session=${token}` } }));

// Hold an uncommitted status change until the real route's UPDATE blocks on
// that row. Its earlier read sees the old committed status. No Prisma mocks.
async function acrossStatusChange(id: string, status: "void" | "paid", request: () => Promise<Response>) {
  let release!: () => void, ready!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<void>(resolve => { ready = resolve; });
  const transaction = prisma.$transaction(async tx => {
    await tx.statement.update({ where: { id }, data: { status } });
    ready();
    await gate;
  }, { timeout: 10_000 });
  await locked;
  const pending = request();
  let blocked = false;
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      const [row] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'UPDATE %Statement%'`;
      if (row.count > 0) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } finally {
    release();
  }
  await transaction;
  const response = await pending;
  expect(blocked, "route UPDATE reached the held row before the status change committed").toBe(true);
  return response;
}

beforeAll(async () => {
  // Refuse accidental production usage independently of the test runner config.
  const url = new URL(process.env.DATABASE_URL!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) && !url.pathname.includes("test")) throw new Error("Use a test database");
  serviceId = (await createTestService()).id;
  owner = (await createTestUser("owner", { serviceId })).user;
  member = (await createTestUser("member", { serviceId })).user;
  implementer = (await createTestUser("eos_implementer", { serviceId })).user;
  const room = await prisma.room.create({ data: { serviceId, name: "Afternoons", legacyKey: "asc" } });
  contactId = (await prisma.centreContact.create({ data: { email, serviceId } })).id;
  enrolmentId = (await prisma.enrolmentSubmission.create({ data: {
    serviceId, primaryParent: { email }, children: [], emergencyContacts: [], consents: {}, status: "submitted",
  } })).id;
  childId = (await prisma.child.create({ data: {
    serviceId, enrolmentId, firstName: "Test", surname: "Child", culturalBackground: [], medicalConditions: [],
  } })).id;
  await prisma.booking.create({ data: { serviceId, childId, roomId: room.id, date: new Date("2026-10-05"), sessionType: "asc", status: "confirmed", fee: 30, ccsApplied: 10, gapFee: 20 } });
  accountId = (await prisma.parentAccount.create({ data: { email, passwordHash: "test-unused-hash", emailVerifiedAt: new Date() } })).id;
  rockId = (await prisma.rock.create({ data: { title: "Test rock", quarter: "Q2-FY27", serviceId } })).id;
  issueId = (await prisma.issue.create({ data: { title: "Test issue", serviceId } })).id;
  projectId = (await prisma.project.create({ data: { name: "Test project", serviceId } })).id;
  const base = { serviceId, rockId, issueId, projectId, dueDate: new Date("2026-10-15"), weekOf: new Date("2026-10-12"), createdById: owner.id, assigneeId: owner.id };
  publicId = (await prisma.todo.create({ data: { ...base, title: "Public" } })).id;
  hiddenId = (await prisma.todo.create({ data: { ...base, title: "Private", isPrivate: true } })).id;
  coassignedId = (await prisma.todo.create({ data: { ...base, title: "Coassigned", isPrivate: true, assignees: { create: { userId: member.id } } } })).id;
  hiddenDraftId = (await prisma.aiTaskDraft.create({ data: { todoId: hiddenId, taskType: "admin", title: "Private draft", content: "Private content" } })).id;
  coassignedDraftId = (await prisma.aiTaskDraft.create({ data: { todoId: coassignedId, taskType: "admin", title: "Coassigned draft", content: "Shared content" } })).id;
});
afterAll(async () => {
  if (!serviceId) return;
  await prisma.activityLog.deleteMany({ where: { userId: { in: [owner?.id, member?.id, implementer?.id].filter(Boolean) } } });
  await prisma.todo.deleteMany({ where: { serviceId } });
  await prisma.project.deleteMany({ where: { serviceId } });
  await prisma.issue.deleteMany({ where: { serviceId } });
  await prisma.rock.deleteMany({ where: { serviceId } });
  await prisma.payment.deleteMany({ where: { serviceId } });
  await prisma.statement.deleteMany({ where: { serviceId } });
  await prisma.booking.deleteMany({ where: { serviceId } });
  await prisma.child.deleteMany({ where: { serviceId } });
  await prisma.enrolmentSubmission.deleteMany({ where: { serviceId } });
  await prisma.parentPasswordReset.deleteMany({ where: { email } });
  await prisma.parentAccount.deleteMany({ where: { email } });
  await prisma.user.deleteMany({ where: { id: { in: [owner?.id, member?.id, implementer?.id].filter(Boolean) } } });
  await prisma.service.delete({ where: { id: serviceId } });
  await prisma.$disconnect();
});

describe("concurrent statement creation", () => {
  const generateRequest = (start = "2026-10-01", end = "2026-10-31") => generate(createRequest("POST", "/api/billing/statements/generate", { body: { contactId, serviceId, periodStart: start, periodEnd: end } }));
  const manualRequest = (start = "2026-10-01", end = "2026-10-31") => manual(createRequest("POST", "/api/billing/statements", { body: { contactId, serviceId, periodStart: start, periodEnd: end, lineItems: [{ childId, date: "2026-10-05", sessionType: "asc", description: "Test care", grossFee: 30, ccsHours: 0, ccsRate: 0, ccsAmount: 10, gapAmount: 20 }] } }));
  beforeEach(async () => { sessionAs(owner); await prisma.payment.deleteMany({ where: { serviceId } }); await prisma.statement.deleteMany({ where: { serviceId } }); });
  it("creates one invoice when two overlapping generate requests race", async () => {
    const responses = await Promise.all([generateRequest(), generateRequest("2026-10-05", "2026-10-12")]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map(r => r.json()));
    expect(bodies.filter(b => b.ok)).toHaveLength(1);
    expect(bodies.filter(b => b.reason === "all_billed")).toHaveLength(1);
    expect(await prisma.statement.count({ where: { serviceId } })).toBe(1);
    expect(await prisma.statementLineItem.count({ where: { childId } })).toBe(1);
  });
  it("serialises manual and generated invoices against the same booking", async () => {
    const responses = await Promise.all([manualRequest(), generateRequest("2026-10-05", "2026-10-12")]);
    expect(responses.every(r => r.status < 500)).toBe(true);
    expect(await prisma.statement.count({ where: { serviceId } })).toBe(1);
    expect(await prisma.statementLineItem.count({ where: { childId } })).toBe(1);
  });
  it("rejects a racing manual invoice even if its period differs", async () => {
    const responses = await Promise.all([manualRequest(), manualRequest("2026-10-05", "2026-10-12")]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.statement.count({ where: { serviceId } })).toBe(1);
  });
  const edit = (id: string) => editStatement(createRequest("PATCH", `/api/billing/statements/${id}`, { body: {
    lineItems: [{ childId, date: "2026-10-05", sessionType: "asc", description: "Edited care", grossFee: 30, ccsHours: 0, ccsRate: 0, ccsAmount: 10, gapAmount: 20 }],
  } }), ctx(id));
  it("allows a draft to retain its own existing billed session", async () => {
    const created = await manualRequest();
    expect(created.status).toBe(201);
    expect((await edit((await created.json()).id)).status).toBe(200);
    expect(await prisma.statementLineItem.count({ where: { childId } })).toBe(1);
  });
  it("serialises draft edits against new invoices without losing existing lines on conflict", async () => {
    const draft = await prisma.statement.create({ data: {
      serviceId, contactId, periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-31"), totalFees: 0,
    } });
    const responses = await Promise.all([edit(draft.id), generateRequest()]);
    expect(responses.every(r => r.status < 500)).toBe(true);
    expect([200, 409]).toContain(responses[0].status);
    expect(responses[1].status).toBe(200);
    expect(await prisma.statementLineItem.count({ where: { childId, date: new Date("2026-10-05") } })).toBe(1);
  });
  it("refuses an edit that would duplicate a live invoice and keeps the original draft lines", async () => {
    expect((await generateRequest()).status).toBe(200);
    const room = await prisma.room.findFirstOrThrow({ where: { serviceId, legacyKey: "asc" } });
    const draft = await prisma.statement.create({ data: {
      serviceId, contactId, periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-31"), totalFees: 10,
      lineItems: { create: { childId, date: new Date("2026-10-06"), sessionType: "asc", roomId: room.id, description: "Original", grossFee: 10, gapAmount: 10 } },
    } });
    expect((await edit(draft.id)).status).toBe(409);
    expect(await prisma.statementLineItem.count({ where: { statementId: draft.id, description: "Original" } })).toBe(1);
  });
  it("releases the lock after a rejected writer and permits re-billing a void invoice", async () => {
    const first = await manualRequest(); expect(first.status).toBe(201);
    expect((await manualRequest()).status).toBe(409);
    await prisma.statement.updateMany({ where: { serviceId }, data: { status: "void" } });
    expect((await generateRequest()).status).toBe(200);
    expect(await prisma.statement.count({ where: { serviceId, status: { not: "void" } } })).toBe(1);
  });
  const paymentRequest = (id: string, amount = 20) => recordPayment(createRequest("POST", "/api/billing/payments", { body: { statementId: id, contactId, serviceId, amount, method: "cash" } }));
  it("does not resurrect an invoice when a stale issue races voiding and re-billing", async () => {
    const draft = await (await manualRequest()).json();
    const response = await acrossStatusChange(draft.id, "void", () => issueStatement(createRequest("POST", `/api/billing/statements/${draft.id}/issue`), ctx(draft.id)));
    expect(response.status).toBe(409);
    expect((await generateRequest()).status).toBe(200);
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("void");
    expect(await prisma.statement.count({ where: { serviceId, status: { not: "void" } } })).toBe(1);
  });
  it("rejects payment against a void invoice after it has been re-billed", async () => {
    const draft = await (await manualRequest()).json();
    expect((await voidStatement(createRequest("POST", `/api/billing/statements/${draft.id}/void`), ctx(draft.id))).status).toBe(200);
    expect((await generateRequest()).status).toBe(200);
    expect((await paymentRequest(draft.id)).status).toBe(409);
    expect(await prisma.payment.count({ where: { statementId: draft.id } })).toBe(0);
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("void");
  });
  it("rolls back a payment when its statement is voided after validation", async () => {
    const draft = await (await manualRequest()).json();
    const response = await acrossStatusChange(draft.id, "void", () => paymentRequest(draft.id));
    expect(response.status).toBe(409);
    expect(await prisma.payment.count({ where: { statementId: draft.id } })).toBe(0);
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("void");
  });
  it("does not let a stale overdue scan revive a void invoice", async () => {
    const draft = await (await manualRequest()).json();
    await prisma.statement.update({ where: { id: draft.id }, data: { status: "issued", dueDate: new Date("2000-01-01") } });
    const response = await acrossStatusChange(draft.id, "void", () => markOverdue(createRequest("GET", "/api/cron/overdue-statements")));
    expect(response.status).toBe(200);
    expect((await response.json()).updated).toBe(0);
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("void");
  });
  it("does not let a stale void request overwrite a completed payment", async () => {
    const draft = await (await manualRequest()).json();
    const response = await acrossStatusChange(draft.id, "paid", () => voidStatement(createRequest("POST", `/api/billing/statements/${draft.id}/void`), ctx(draft.id)));
    expect(response.status).toBe(409);
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("paid");
  });
  it("serialises concurrent payments without losing the invoice balance", async () => {
    const draft = await (await manualRequest()).json();
    const responses = await Promise.all([paymentRequest(draft.id, 10), paymentRequest(draft.id, 10)]);
    expect(responses.map(r => r.status)).toEqual([201, 201]);
    expect(await prisma.statement.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "paid", amountPaid: 20, balance: 0 });
  });
});

describe("private ToDos with real nested Prisma reads and writes", () => {
  beforeEach(() => sessionAs(member));
  it("hides private contents while retaining public and coassigned ToDos on all nested surfaces", async () => {
    const responses = await Promise.all([
      rockDetail(createRequest("GET", `/api/rocks/${rockId}`), ctx(rockId)),
      issueDetail(createRequest("GET", `/api/issues/${issueId}`), ctx(issueId)),
      projectDetail(createRequest("GET", `/api/projects/${projectId}`), ctx(projectId)),
      serviceDetail(createRequest("GET", `/api/services/${serviceId}`), ctx(serviceId)),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      const body = await response.json();
      expect((body.todos ?? body.spawnedTodos).map((t: { id: string }) => t.id).sort()).toEqual([publicId, coassignedId].sort());
      expect(JSON.stringify(body)).not.toContain(hiddenId);
    }
  });
  it("does not complete hidden rows in a mixed bulk request", async () => {
    const response = await bulkTodos(createRequest("POST", "/api/todos/bulk-actions", { body: { action: "complete", ids: [publicId, hiddenId, coassignedId] } }));
    expect(response.status).toBe(200);
    expect((await response.json()).updated).toBe(2);
    expect((await prisma.todo.findUniqueOrThrow({ where: { id: hiddenId } })).status).toBe("pending");
    expect((await prisma.todo.findUniqueOrThrow({ where: { id: coassignedId } })).status).toBe("complete");
  });
  it("does not expose or complete another user's private ToDo through AI draft review", async () => {
    sessionAs(implementer);
    const response = await acceptDraft(createRequest("PATCH", `/api/ai-drafts/${hiddenDraftId}`, { body: { status: "accepted" } }), ctx(hiddenDraftId));
    expect(response.status).toBe(404);
    expect((await prisma.todo.findUniqueOrThrow({ where: { id: hiddenId } })).status).toBe("pending");
    expect((await prisma.aiTaskDraft.findUniqueOrThrow({ where: { id: hiddenDraftId } })).status).toBe("ready");
  });
  it("allows a co-assignee to review and complete their own private draft", async () => {
    const response = await acceptDraft(createRequest("PATCH", `/api/ai-drafts/${coassignedDraftId}`, { body: { status: "accepted" } }), ctx(coassignedDraftId));
    expect(response.status).toBe(200);
    expect((await prisma.aiTaskDraft.findUniqueOrThrow({ where: { id: coassignedDraftId } })).status).toBe("accepted");
  });
  it("denies a hidden private deletion even for an EOS role with delete permission", async () => {
    sessionAs(implementer);
    expect((await deleteTodo(createRequest("DELETE", `/api/todos/${hiddenId}`), ctx(hiddenId))).status).toBe(404);
    expect((await prisma.todo.findUniqueOrThrow({ where: { id: hiddenId } })).deleted).toBe(false);
  });
});

describe("live parent session revocation", () => {
  const token = async () => {
    const account = await prisma.parentAccount.findUniqueOrThrow({ where: { id: accountId } });
    return signParentJwt({ email, name: "Test Parent", accountId, sessionVersion: account.sessionVersion, enrolmentIds: [enrolmentId] });
  };
  beforeEach(() => sessionAs(owner));
  it("rejects disabled sessions immediately and keeps them revoked after reactivation", async () => {
    const old = await token(); expect((await parentRequest(old)).status).toBe(200);
    expect((await familyPatch(createRequest("PATCH", `/api/families/${accountId}`, { body: { deactivated: true } }), ctx(accountId))).status).toBe(200);
    expect((await parentRequest(old)).status).toBe(401);
    expect((await familyPatch(createRequest("PATCH", `/api/families/${accountId}`, { body: { deactivated: false } }), ctx(accountId))).status).toBe(200);
    expect((await parentRequest(old)).status).toBe(401);
    expect((await parentRequest(await token())).status).toBe(200);
  });
  it("revokes sessions after both staff-set and token-based password resets", async () => {
    const old = await token();
    await setParentPasswordDirect({ accountId, password: "NewTestPassword-8292!" });
    expect((await parentRequest(old)).status).toBe(401);
    const newer = await token();
    const reset = await createParentPasswordReset(email);
    await completeParentPasswordReset({ token: reset.token, password: "AnotherTestPassword-2391!" });
    expect((await parentRequest(newer)).status).toBe(401);
    expect((await parentRequest(await token())).status).toBe(200);
  });
  it("removes access to an enrolment after its parent email changes", async () => {
    const old = await token();
    await prisma.enrolmentSubmission.update({ where: { id: enrolmentId }, data: { primaryParent: { email: "other@amana-test.local" } } });
    const response = await parentRequest(old);
    expect(response.status).toBe(200);
    expect((await response.json()).ids).toEqual([]);
  });
  it("rejects refreshing an authenticated parent context after password reset", async () => {
    const old = await token();
    const session = await getParentSession(createRequest("GET", "/api/parent/state", { headers: { cookie: `parent-session=${old}` } }));
    expect(session).not.toBeNull();
    await setParentPasswordDirect({ accountId, password: "FreshTestPassword-9123!" });
    await expect(signParentJwt({ ...session!, sessionVersion: session!.sessionVersion ?? 0 })).rejects.toMatchObject({ status: 401 });
  });
  it("binds password authentication to the version read alongside its password hash", async () => {
    const password = "OriginalTestPassword-4732!";
    await setParentPasswordDirect({ accountId, password });
    const authenticated = await authenticateParent(email, password);
    expect(authenticated && "accountId" in authenticated).toBe(true);
    if (!authenticated || !("accountId" in authenticated)) throw new Error("Expected an authenticated account");
    const observed = await prisma.parentAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(authenticated.sessionVersion).toBe(observed.sessionVersion);
    await setParentPasswordDirect({ accountId, password: "ReplacementTestPassword-7924!" });
    await expect(signParentJwt({ ...authenticated, name: "Parent", enrolmentIds: [] })).rejects.toMatchObject({ status: 401 });
  });
});
