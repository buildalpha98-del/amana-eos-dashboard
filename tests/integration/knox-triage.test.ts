/**
 * Integration test: Knox incident triage, end to end on a real database.
 *
 * POST /api/incidents (as the centre's Director of Service) → TriageJob →
 * runTriageJob → serious assessment, alerted, push alerts to the director and
 * the state manager, a Teams row recorded as undelivered (no webhook) →
 * acknowledge route stamps every row → the escalation sweep, 20 minutes on,
 * has nothing left to escalate. Then a re-triage (the director records the
 * ambulance) writes a silenced second assessment, and acknowledging via that
 * LATEST assessment stamps the first assessment's alerts too. Finally the
 * tick's reconciliation pass queues a job for a record that never got one.
 *
 * Mocked: only the model provider (rejects, so the assessment is rules-only
 * with no network call), the rate limiter, and `runAfter` (the job is started
 * explicitly below rather than after the response). The session is the
 * standard `mockSession` helper. Requires a test database (see .env.test).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestService, createTestUser } from "@/lib/test-utils";
import { mockSession } from "../../src/__tests__/helpers/auth-mock";
import { createRequest } from "../../src/__tests__/helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { _clearOrgSettingsCache } from "@/lib/org-settings";
import { reconcileMissingJobs, runTriageJob, runEscalationSweep } from "@/lib/knox";
import { POST as createIncident } from "@/app/api/incidents/route";
import { PATCH as patchIncident } from "@/app/api/incidents/[id]/route";
import { POST as acknowledge } from "@/app/api/knox/assessments/[id]/ack/route";
import { Prisma, type Service, type User } from "@prisma/client";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/run-after", () => ({ runAfter: vi.fn() }));
vi.mock("@/lib/ai-provider", () => ({
  generateStructured: vi.fn(async () => {
    throw new Error("no model in integration tests");
  }),
}));

let service: Service;
let director: User;
let stateManager: User;
// The org-settings row as found before the test touched it (restored in afterAll).
let prevOrg: { config: Prisma.JsonValue | null; updatedById: string | null } | null | undefined;
const savedEnv = {
  knox: process.env.TEAMS_KNOX_WEBHOOK_URL,
  teams: process.env.TEAMS_WEBHOOK_URL,
};
let guardPassed = false;
let incidentId = "";
let assessmentId = "";

beforeAll(async () => {
  // Guard first: this test writes users, a service and the org config.
  const db = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(db.hostname) || !db.pathname.endsWith("_test")) throw new Error("Requires an isolated local test database");
  guardPassed = true;

  // No webhook anywhere: the Teams row must record delivered:false.
  delete process.env.TEAMS_KNOX_WEBHOOK_URL;
  delete process.env.TEAMS_WEBHOOK_URL;

  service = await createTestService({ state: "NSW" });
  const d = await createTestUser("member", { serviceId: service.id });
  const s = await createTestUser("head_office", { state: "NSW" });
  director = d.user;
  stateManager = s.user;
  await prisma.service.update({ where: { id: service.id }, data: { managerId: director.id } });

  // Knox live (not shadow) for this test.
  prevOrg = await prisma.orgSettings.findUnique({
    where: { id: "singleton" },
    select: { config: true, updatedById: true },
  });
  await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", config: { knox: { enabled: true, shadowMode: false } } },
    update: { config: { knox: { enabled: true, shadowMode: false } } },
  });
  _clearOrgSettingsCache();
});

afterAll(async () => {
  // Never write (not even empty deletes) to a database the guard rejected.
  if (!guardPassed) return;
  if (savedEnv.knox !== undefined) process.env.TEAMS_KNOX_WEBHOOK_URL = savedEnv.knox;
  if (savedEnv.teams !== undefined) process.env.TEAMS_WEBHOOK_URL = savedEnv.teams;

  const ids = [director?.id, stateManager?.id].filter((x): x is string => !!x);
  if (service) {
    await prisma.triageAlert.deleteMany({ where: { serviceId: service.id } });
    await prisma.triageAssessment.deleteMany({ where: { serviceId: service.id } });
    await prisma.triageJob.deleteMany({ where: { serviceId: service.id } });
    await prisma.pendingAction.deleteMany({ where: { serviceId: service.id } });
    await prisma.incidentRecord.deleteMany({ where: { serviceId: service.id } });
    await prisma.service.update({ where: { id: service.id }, data: { managerId: null } });
  }
  await prisma.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userNotification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  if (service) await prisma.service.delete({ where: { id: service.id } });
  // Only touch org settings if beforeAll got as far as reading them.
  if (prevOrg === null) {
    await prisma.orgSettings.deleteMany({ where: { id: "singleton" } });
  } else if (prevOrg) {
    await prisma.orgSettings.update({
      where: { id: "singleton" },
      data: {
        config: prevOrg.config ?? Prisma.JsonNull,
        updatedById: prevOrg.updatedById,
      },
    });
  }
  _clearOrgSettingsCache();
  await prisma.$disconnect();
});

describe("Knox triage flow", () => {
  it("a serious incident is triaged and alerts the director, state manager and Teams", async () => {
    _clearUserActiveCache();
    mockSession(director);

    const res = await createIncident(
      createRequest("POST", "/api/incidents", {
        body: {
          serviceId: service.id,
          incidentDate: new Date().toISOString(),
          childName: "Ayla Test",
          incidentType: "injury",
          severity: "serious",
          description: "Fell from the climbing frame; ambulance attended.",
        },
      }),
    );
    expect(res.status).toBe(201);
    incidentId = (await res.json()).id;

    const job = await prisma.triageJob.findFirstOrThrow({
      where: { subjectType: "incident", subjectId: incidentId },
    });
    expect(job.status).toBe("pending");

    expect(await runTriageJob(job.id)).toBe("done");

    const done = await prisma.triageJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe("done");

    const assessment = await prisma.triageAssessment.findUniqueOrThrow({ where: { jobId: job.id } });
    assessmentId = assessment.id;
    expect(assessment.tier).toBe("serious");
    expect(assessment.alerted).toBe(true);
    expect(assessment.source).toBe("rules_only");

    const alerts = await prisma.triageAlert.findMany({ where: { assessmentId } });
    const push = alerts.filter((a) => a.channel === "push" && a.escalationLevel === 0);
    expect(push.map((a) => a.recipientUserId).sort()).toEqual([director.id, stateManager.id].sort());

    const teams = alerts.filter((a) => a.channel === "teams");
    expect(teams).toHaveLength(1);
    expect(teams[0].delivered).toBe(false);
    expect(alerts.every((a) => a.acknowledgedAt === null)).toBe(true);
  });

  it("acknowledging stamps every alert row, and nothing escalates afterwards", async () => {
    _clearUserActiveCache();
    mockSession(director);

    const res = await acknowledge(
      createRequest("POST", `/api/knox/assessments/${assessmentId}/ack`),
      { params: Promise.resolve({ id: assessmentId }) },
    );
    expect(res.status).toBe(200);

    const alerts = await prisma.triageAlert.findMany({ where: { assessmentId } });
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.acknowledgedAt).not.toBeNull();
      expect(a.acknowledgedById).toBe(director.id);
    }

    const sweep = await runEscalationSweep(prisma, new Date(Date.now() + 20 * 60_000));
    expect(sweep).toEqual({ escalated: 0 });
  });

  it("re-triage then acknowledge via the LATEST assessment: both assessments' rows stamped, nothing escalates", async () => {
    _clearUserActiveCache();
    mockSession(director);

    const created = await createIncident(
      createRequest("POST", "/api/incidents", {
        body: {
          serviceId: service.id,
          incidentDate: new Date().toISOString(),
          childName: "Hassan, Omar",
          incidentType: "injury",
          severity: "serious",
          description: "Head knock in the playground.",
        },
      }),
    );
    expect(created.status).toBe(201);
    const id = (await created.json()).id as string;
    const jobA = await prisma.triageJob.findFirstOrThrow({ where: { subjectType: "incident", subjectId: id } });
    expect(await runTriageJob(jobA.id)).toBe("done");
    const a = await prisma.triageAssessment.findUniqueOrThrow({ where: { jobId: jobA.id } });
    expect(a.alerted).toBe(true);

    // The director records the ambulance: a trigger field, so Knox re-triages.
    const patched = await patchIncident(
      createRequest("PATCH", `/api/incidents/${id}`, { body: { ambulanceCalled: true } }),
      { params: Promise.resolve({ id }) },
    );
    expect(patched.status).toBe(200);
    const jobB = await prisma.triageJob.findFirstOrThrow({
      where: { subjectType: "incident", subjectId: id, id: { not: jobA.id } },
    });
    expect(await runTriageJob(jobB.id)).toBe("done");
    const b = await prisma.triageAssessment.findUniqueOrThrow({ where: { jobId: jobB.id } });
    // Same tier within 24 h: silenced, no alert rows of its own.
    expect(b.alerted).toBe(false);
    expect(await prisma.triageAlert.count({ where: { assessmentId: b.id } })).toBe(0);

    const ack = await acknowledge(createRequest("POST", `/api/knox/assessments/${b.id}/ack`), {
      params: Promise.resolve({ id: b.id }),
    });
    expect(ack.status).toBe(200);

    const rowsA = await prisma.triageAlert.findMany({ where: { assessmentId: a.id } });
    expect(rowsA.length).toBeGreaterThan(0);
    expect(rowsA.every((r) => r.acknowledgedAt !== null && r.acknowledgedById === director.id)).toBe(true);

    const sweep = await runEscalationSweep(prisma, new Date(Date.now() + 20 * 60_000));
    expect(sweep).toEqual({ escalated: 0 });
    expect(await prisma.triageAlert.count({ where: { assessmentId: a.id, escalationLevel: { gt: 0 } } })).toBe(0);
  });

  it("reconciliation queues a `sweep` job for a record that never got one, and leaves triaged records alone", async () => {
    // Written behind Knox's back: no triggerTriage, so no job.
    const lost = await prisma.incidentRecord.create({
      data: {
        serviceId: service.id,
        incidentDate: new Date(),
        childName: "Lost Record",
        incidentType: "injury",
        severity: "serious",
        description: "Enqueue failed after the insert.",
        createdById: director.id,
      },
    });
    const before = await prisma.triageJob.count({ where: { subjectType: "incident", subjectId: incidentId } });

    const { reconciled } = await reconcileMissingJobs(prisma, new Date());
    expect(reconciled).toBeGreaterThanOrEqual(1);

    const jobs = await prisma.triageJob.findMany({ where: { subjectType: "incident", subjectId: lost.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].reason).toBe("sweep");
    expect(jobs[0].status).toBe("pending");
    // The incident from the first test already had a job: untouched.
    expect(await prisma.triageJob.count({ where: { subjectType: "incident", subjectId: incidentId } })).toBe(before);
  });
});
