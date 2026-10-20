import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/knox/alerts", () => ({
  dispatchLevel: vi.fn(),
  postOpsNote: vi.fn(),
  runEscalationSweep: vi.fn(),
}));
vi.mock("@/lib/knox/assess", () => ({ assessWithModel: vi.fn() }));
vi.mock("@/lib/knox/recipients", () => ({ resolveRecipients: vi.fn() }));
vi.mock("@/lib/knox/settings", () => ({ getKnoxSettings: vi.fn() }));
vi.mock("@/lib/knox/load-subject", () => ({ loadSubject: vi.fn() }));
vi.mock("@/lib/knox/rules", () => ({ evaluateRules: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// Cards run REAL (src/lib/knox/cards.ts is pure): the safety-net test asserts
// the set_severity card the real builder proposes.

import type { IncidentRecord, TriageTier } from "@prisma/client";
import { dispatchLevel, postOpsNote } from "@/lib/knox/alerts";
import { assessWithModel, type AssessmentResult, type ModelAssessment } from "@/lib/knox/assess";
import { resolveRecipients, type Recipients } from "@/lib/knox/recipients";
import { getKnoxSettings } from "@/lib/knox/settings";
import { loadSubject } from "@/lib/knox/load-subject";
import { evaluateRules } from "@/lib/knox/rules";
import type { RulesResult, TriageSubject } from "@/lib/knox/types";
import { MAX_ATTEMPTS, STALE_BACKLOG_MS, runTriageJob, sweepJobs } from "@/lib/knox/worker";
import * as knox from "@/lib/knox";

const dispatchMock = vi.mocked(dispatchLevel);
const opsNoteMock = vi.mocked(postOpsNote);
const assessMock = vi.mocked(assessWithModel);
const recipientsMock = vi.mocked(resolveRecipients);
const settingsMock = vi.mocked(getKnoxSettings);
const loadMock = vi.mocked(loadSubject);
const rulesMock = vi.mocked(evaluateRules);

const NOW = new Date("2026-10-20T04:00:00Z");
const MIN = 60_000;
const service = { id: "svc-1", name: "Arkana OSHC", state: "NSW", managerId: "u-dir" };

// ── Scenario state (reset per test; every mock routes on its input) ──────

interface JobRow {
  id: string;
  subjectType: "incident" | "complaint" | "staff_incident";
  subjectId: string;
  serviceId: string;
  status: string;
  attempts: number;
  createdAt: Date;
}

let jobs: Record<string, JobRow>;
let subjects: Record<string, TriageSubject | null>;
let tiers: Record<string, TriageTier>;
let priorAlerted: Record<string, { tier: TriageTier }[]>;
let existingForJob: Record<string, { id: string; alerted: boolean }>;
let shadowMode: boolean;
let model: AssessmentResult;
let recipients: Recipients;
let throwOnLoad: Set<string>;

const incident = (id: string, over: Partial<IncidentRecord> = {}): TriageSubject => ({
  type: "incident",
  service,
  childFirstName: "Ali",
  record: { id, serviceId: "svc-1", severity: "minor", reportableToAuthority: false, ...over } as IncidentRecord,
});

const job = (id: string, subjectId: string, over: Partial<JobRow> = {}): JobRow => ({
  id,
  subjectType: "incident",
  subjectId,
  serviceId: "svc-1",
  status: "pending",
  attempts: 0,
  createdAt: new Date(NOW.getTime() - 5 * MIN),
  ...over,
});

const modelData = (over: Partial<ModelAssessment> = {}): ModelAssessment => ({
  severityOpinion: "agrees",
  rationale: "Looks right.",
  missingFields: ["witnesses"],
  followUpTodos: [],
  ...over,
});

const modelOk = (over: Partial<ModelAssessment> = {}): AssessmentResult => ({
  ok: true,
  data: modelData(over),
  modelId: "claude-test",
  inputTokens: 1200,
  outputTokens: 300,
  durationMs: 4200,
});

function setup(subjectId: string, tier: TriageTier, jobOver: Partial<JobRow> = {}, subject?: TriageSubject) {
  jobs["job-1"] = job("job-1", subjectId, jobOver);
  subjects[subjectId] = subject ?? incident(subjectId);
  tiers[subjectId] = tier;
}

const jobUpdates = () =>
  prismaMock.triageJob.update.mock.calls.map((c: [{ data: Record<string, unknown> }]) => c[0].data);
const assessmentCreates = () =>
  prismaMock.triageAssessment.create.mock.calls.map((c: [{ data: Record<string, unknown> }]) => c[0].data);
const assessmentUpdates = () =>
  prismaMock.triageAssessment.update.mock.calls.map((c: [{ data: Record<string, unknown> }]) => c[0].data);
const cardRows = () =>
  prismaMock.pendingAction.createMany.mock.calls.flatMap(
    (c: [{ data: Record<string, unknown>[] }]) => c[0].data,
  );

beforeEach(() => {
  jobs = {};
  subjects = {};
  tiers = {};
  priorAlerted = {};
  existingForJob = {};
  shadowMode = false;
  model = modelOk();
  throwOnLoad = new Set();
  recipients = {
    directors: [{ id: "u-dir", name: "Dir", email: "dir@amanaoshc.com.au" }],
    stateManagers: [{ id: "u-sm", name: "SM", email: "sm@amanaoshc.com.au" }],
    owners: [],
    noDirector: false,
  };

  prismaMock.triageJob.updateMany.mockReset().mockImplementation(
    async (args: { where: { id: string; status: string }; data: { attempts?: { increment: number } } }) => {
      const j = jobs[args.where.id];
      if (!j || args.where.status !== "pending" || j.status !== "pending") return { count: 0 };
      j.status = "running";
      j.attempts += args.data.attempts?.increment ?? 0;
      return { count: 1 };
    },
  );
  prismaMock.triageJob.findUnique.mockReset().mockImplementation(
    async (args: { where: { id: string } }) => (jobs[args.where.id] ? { ...jobs[args.where.id] } : null),
  );
  prismaMock.triageJob.update.mockReset().mockImplementation(
    async (args: { where: { id: string }; data: Record<string, unknown> }) => ({ id: args.where.id, ...args.data }),
  );
  prismaMock.triageJob.findMany.mockReset().mockImplementation(async () => []);
  prismaMock.triageAssessment.findMany.mockReset().mockImplementation(
    async (args: { where: { subjectId: string } }) => priorAlerted[args.where.subjectId] ?? [],
  );
  prismaMock.triageAssessment.findUnique.mockReset().mockImplementation(
    async (args: { where: { jobId: string } }) => existingForJob[args.where.jobId] ?? null,
  );
  prismaMock.triageAssessment.create.mockReset().mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({ id: "asmt-1", ...args.data }),
  );
  prismaMock.triageAssessment.update.mockReset().mockImplementation(
    async (args: { where: { id: string }; data: Record<string, unknown> }) => ({ id: args.where.id, ...args.data }),
  );
  prismaMock.triageAssessment.delete.mockReset();
  prismaMock.aiUsage.create.mockReset().mockImplementation(async () => ({ id: "usage-1" }));
  prismaMock.pendingAction.createMany.mockReset().mockImplementation(
    async (args: { data: unknown[] }) => ({ count: args.data.length }),
  );
  prismaMock.$transaction.mockClear();

  dispatchMock.mockReset().mockImplementation(async () => true);
  opsNoteMock.mockReset().mockImplementation(async () => undefined);
  assessMock.mockReset().mockImplementation(async () => model);
  recipientsMock.mockReset().mockImplementation(async () => recipients);
  settingsMock.mockReset().mockImplementation(async () => ({ enabled: true, shadowMode }));
  loadMock.mockReset().mockImplementation(async (_db: unknown, _type: unknown, id: string) => {
    if (throwOnLoad.has(id)) throw new Error("db blip");
    return subjects[id] ?? null;
  });
  rulesMock.mockReset().mockImplementation(
    (s: TriageSubject): RulesResult => ({ tier: tiers[s.record.id], ruleHits: ["rule_x"], clocks: [] }),
  );
});

describe("constants", () => {
  it("exports the backlog window and attempt ceiling", () => {
    expect(STALE_BACKLOG_MS).toBe(24 * 60 * 60 * 1000);
    expect(MAX_ATTEMPTS).toBe(3);
  });

  it("index re-exports the public worker surface", () => {
    expect(typeof knox.enqueueTriage).toBe("function");
    expect(typeof knox.runTriageJob).toBe("function");
    expect(typeof knox.sweepJobs).toBe("function");
    expect(typeof knox.runEscalationSweep).toBe("function");
  });
});

describe("runTriageJob", () => {
  it("claim: updateMany where {id,status:pending} count 0 → 'not_claimed' and nothing else runs", async () => {
    setup("inc-1", "serious", { status: "running" });
    expect(await runTriageJob("job-1", NOW)).toBe("not_claimed");
    expect(prismaMock.triageJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "pending" },
      data: { status: "running", startedAt: NOW, attempts: { increment: 1 } },
    });
    expect(loadMock).not.toHaveBeenCalled();
    expect(prismaMock.triageAssessment.create).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(assessMock).not.toHaveBeenCalled();
    expect(prismaMock.triageJob.update).not.toHaveBeenCalled();
  });

  it("missing/deleted subject → job skipped", async () => {
    jobs["job-1"] = job("job-1", "inc-gone");
    expect(await runTriageJob("job-1", NOW)).toBe("skipped");
    expect(jobUpdates()).toEqual([{ status: "skipped", finishedAt: NOW }]);
    expect(prismaMock.triageAssessment.create).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(assessMock).not.toHaveBeenCalled();
  });

  it("dispatches level 0 alerts BEFORE assessWithModel resolves (order of mock calls)", async () => {
    setup("inc-1", "serious");
    let release: (r: AssessmentResult) => void = () => {};
    assessMock.mockImplementation(() => new Promise<AssessmentResult>((res) => (release = res)));

    const run = runTriageJob("job-1", NOW);
    await vi.waitFor(() => expect(assessMock).toHaveBeenCalled());
    // The model is still pending, and the alert is already out.
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const createOrder = prismaMock.triageAssessment.create.mock.invocationCallOrder[0];
    const dispatchOrder = dispatchMock.mock.invocationCallOrder[0];
    const modelOrder = assessMock.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(dispatchOrder);
    expect(dispatchOrder).toBeLessThan(modelOrder);

    release(modelOk());
    expect(await run).toBe("done");

    // The db is the top-level client (a Proxy in tests, so compared by identity).
    expect(dispatchMock.mock.calls[0][0]).toBe(prismaMock);
    expect(recipientsMock.mock.calls[0][0]).toBe(prismaMock);
    expect(dispatchMock).toHaveBeenCalledWith(expect.anything(), {
      assessmentId: "asmt-1",
      subject: subjects["inc-1"],
      rules: { tier: "serious", ruleHits: ["rule_x"], clocks: [] },
      recipients,
      level: 0,
    });
    expect(recipientsMock).toHaveBeenCalledWith(expect.anything(), service);
    expect(assessmentCreates()[0]).toEqual({
      jobId: "job-1",
      subjectType: "incident",
      subjectId: "inc-1",
      serviceId: "svc-1",
      tier: "serious",
      ruleHits: ["rule_x"],
      clocks: [],
      alerted: true,
      source: "rules_only",
    });
    expect(assessmentUpdates()).toContainEqual(
      expect.objectContaining({
        source: "rules_and_model",
        modelId: "claude-test",
        severityOpinion: "agrees",
        rationale: "Looks right.",
        missingFields: ["witnesses"],
        aiUsageId: "usage-1",
      }),
    );
    expect(jobUpdates()).toContainEqual({ status: "done", finishedAt: NOW });
  });

  it("dispatchLevel returning false (nobody to tell) is not a failure", async () => {
    setup("inc-1", "moderate");
    dispatchMock.mockImplementation(async () => false);
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(jobUpdates()).toContainEqual({ status: "done", finishedAt: NOW });
    expect(assessmentCreates()[0].alerted).toBe(true);
  });

  it("model failure → assessment source rules_only with modelError, job done, alerts already sent", async () => {
    setup("inc-1", "serious");
    model = { ok: false, error: "Model assessment timed out after 20000ms" };
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock.mock.invocationCallOrder[0]).toBeLessThan(assessMock.mock.invocationCallOrder[0]);
    expect(assessmentCreates()[0].source).toBe("rules_only");
    const updates = assessmentUpdates();
    expect(updates).toContainEqual({ modelError: "Model assessment timed out after 20000ms" });
    expect(updates.some((u: Record<string, unknown>) => u.source === "rules_and_model")).toBe(false);
    expect(prismaMock.aiUsage.create).not.toHaveBeenCalled();
    expect(jobUpdates()).toContainEqual({ status: "done", finishedAt: NOW });
  });

  it("shadow mode → no dispatch, no cards, alerted:false, assessment still written", async () => {
    shadowMode = true;
    setup("inc-1", "serious", {}, incident("inc-1", { severity: "minor" }));
    model = modelOk({ severityOpinion: "understated", suggestedSeverity: "serious", followUpTodos: [{ title: "Call parent", dueInDays: 1 }] });
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(recipientsMock).not.toHaveBeenCalled();
    expect(prismaMock.pendingAction.createMany).not.toHaveBeenCalled();
    expect(assessmentCreates()[0]).toMatchObject({ alerted: false, tier: "serious" });
    // The model still runs in shadow mode so its output can be evaluated.
    expect(assessmentUpdates()).toContainEqual(expect.objectContaining({ source: "rules_and_model" }));
    expect(assessmentUpdates().some((u: Record<string, unknown>) => u.alerted === true)).toBe(false);
  });

  it("silent re-triage: prior assessment ≤24h with tier >= new tier and alerted → no dispatch, alerted:false", async () => {
    setup("inc-1", "moderate");
    priorAlerted["inc-1"] = [{ tier: "serious" }];
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(assessmentCreates()[0].alerted).toBe(false);
    expect(prismaMock.triageAssessment.findMany).toHaveBeenCalledWith({
      where: {
        subjectType: "incident",
        subjectId: "inc-1",
        alerted: true,
        createdAt: { gte: new Date(NOW.getTime() - STALE_BACKLOG_MS) },
        alerts: { some: {} },
      },
      select: { tier: true },
    });
  });

  it("silent re-triage compares against the HIGHEST prior tier, not the latest", async () => {
    setup("inc-1", "serious");
    priorAlerted["inc-1"] = [{ tier: "minor" }, { tier: "serious" }];
    await runTriageJob("job-1", NOW);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("raising re-triage: prior moderate, new serious → dispatch", async () => {
    setup("inc-1", "serious");
    priorAlerted["inc-1"] = [{ tier: "moderate" }];
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(assessmentCreates()[0].alerted).toBe(true);
  });

  it("minor tier with an agreeing model → no dispatch, alerted:false (minor never alerts)", async () => {
    setup("inc-1", "minor");
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(assessmentCreates()[0].alerted).toBe(false);
  });

  it("second safety net: rules minor + model understated→serious → moderate dispatch to directors + set_severity card", async () => {
    setup("inc-1", "minor", {}, incident("inc-1", { severity: "minor" }));
    model = modelOk({ severityOpinion: "understated", suggestedSeverity: "serious", rationale: "Head knock." });
    expect(await runTriageJob("job-1", NOW)).toBe("done");

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const args = dispatchMock.mock.calls[0][1];
    expect(args.level).toBe(0);
    expect(args.rules.tier).toBe("moderate");
    expect(args.rules.ruleHits).toEqual(["rule_x"]);
    expect(args.assessmentId).toBe("asmt-1");
    expect(args.recipients).toBe(recipients);
    expect(args.rationale).toBe("Head knock.");
    // The model ran first: this net depends on its opinion.
    expect(assessMock.mock.invocationCallOrder[0]).toBeLessThan(dispatchMock.mock.invocationCallOrder[0]);

    expect(assessmentCreates()[0]).toMatchObject({ tier: "minor", alerted: false });
    expect(assessmentUpdates()).toContainEqual({ alerted: true });
    expect(cardRows()).toContainEqual(
      expect.objectContaining({ kind: "set_severity", payload: { severity: "serious" }, assessmentId: "asmt-1" }),
    );
  });

  it("second safety net does not fire in shadow mode, for reportable→moderate opinions it does", async () => {
    shadowMode = true;
    setup("inc-1", "minor");
    model = modelOk({ severityOpinion: "understated", suggestedSeverity: "reportable" });
    await runTriageJob("job-1", NOW);
    expect(dispatchMock).not.toHaveBeenCalled();

    shadowMode = false;
    jobs["job-1"].status = "pending";
    await runTriageJob("job-1", NOW);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it("second safety net ignores understated→moderate and is silenced by a prior alert", async () => {
    setup("inc-1", "minor");
    model = modelOk({ severityOpinion: "understated", suggestedSeverity: "moderate" });
    await runTriageJob("job-1", NOW);
    expect(dispatchMock).not.toHaveBeenCalled();

    model = modelOk({ severityOpinion: "understated", suggestedSeverity: "serious" });
    priorAlerted["inc-1"] = [{ tier: "minor" }];
    jobs["job-1"].status = "pending";
    await runTriageJob("job-1", NOW);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("stale backlog: job createdAt older than STALE_BACKLOG_MS → alerted:false regardless", async () => {
    setup("inc-1", "serious", { createdAt: new Date(NOW.getTime() - STALE_BACKLOG_MS - MIN) });
    model = modelOk({ severityOpinion: "understated", suggestedSeverity: "reportable" });
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(assessmentCreates()[0].alerted).toBe(false);
  });

  it("exception after claim: attempts<3 → status pending, scheduledFor = now + 2^attempts min; attempts==3 → failed + postOpsNote('Knox could not assess …')", async () => {
    setup("inc-1", "serious");
    throwOnLoad.add("inc-1");

    expect(await runTriageJob("job-1", NOW)).toBe("retry");
    expect(jobUpdates().at(-1)).toEqual({
      status: "pending",
      scheduledFor: new Date(NOW.getTime() + 2 * MIN),
      lastError: "db blip",
    });
    jobs["job-1"].status = "pending";

    expect(await runTriageJob("job-1", NOW)).toBe("retry");
    expect(jobUpdates().at(-1)).toMatchObject({ scheduledFor: new Date(NOW.getTime() + 4 * MIN) });
    jobs["job-1"].status = "pending";
    expect(opsNoteMock).not.toHaveBeenCalled();

    expect(await runTriageJob("job-1", NOW)).toBe("failed");
    expect(jobUpdates().at(-1)).toEqual({ status: "failed", finishedAt: NOW, lastError: "db blip" });
    expect(opsNoteMock).toHaveBeenCalledTimes(1);
    const [title, body] = opsNoteMock.mock.calls[0];
    expect(title).toMatch(/^Knox could not assess/);
    expect(body).toContain("incident");
    expect(body).toContain("svc-1");
    expect(body).toContain("db blip");
  });

  it("exception mid-run after the alert went out: the retry reuses this job's assessment row and does not re-alert", async () => {
    setup("inc-1", "serious");
    prismaMock.aiUsage.create.mockImplementation(async () => ({ id: "usage-1" }));
    prismaMock.pendingAction.createMany.mockImplementation(async () => {
      throw new Error("pool timeout");
    });
    model = modelOk({ followUpTodos: [{ title: "Ring the family", dueInDays: 1 }] });
    expect(await runTriageJob("job-1", NOW)).toBe("retry");
    expect(dispatchMock).toHaveBeenCalledTimes(1);

    // Second attempt: the first attempt's row (alerted, with alert rows) exists.
    existingForJob["job-1"] = { id: "asmt-1", alerted: true };
    priorAlerted["inc-1"] = [{ tier: "serious" }];
    prismaMock.pendingAction.createMany.mockImplementation(async (a: { data: unknown[] }) => ({ count: a.data.length }));
    prismaMock.triageAssessment.create.mockClear();
    prismaMock.triageAssessment.update.mockClear();
    jobs["job-1"].status = "pending";

    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.triageAssessment.delete).not.toHaveBeenCalled();
    expect(prismaMock.triageAssessment.create).not.toHaveBeenCalled();
    // The reused row keeps alerted:true so the escalation sweep still sees it.
    expect(prismaMock.triageAssessment.update.mock.calls[0][0]).toMatchObject({
      where: { id: "asmt-1" },
      data: { tier: "serious", alerted: true, source: "rules_only", modelError: null },
    });
  });

  it("recipients.noDirector is passed through to dispatchLevel unchanged (the ops note is dispatch's job, not the worker's)", async () => {
    setup("inc-1", "moderate");
    recipients = { directors: [], stateManagers: recipients.stateManagers, owners: [], noDirector: true };
    await runTriageJob("job-1", NOW);
    expect(dispatchMock.mock.calls[0][1].recipients).toBe(recipients);
    expect(opsNoteMock).not.toHaveBeenCalled();
  });

  it("AiUsage row written with section 'knox', userId null, metadata.assessmentId", async () => {
    setup("inc-1", "moderate");
    await runTriageJob("job-1", NOW);
    expect(prismaMock.aiUsage.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        section: "knox",
        model: "claude-test",
        inputTokens: 1200,
        outputTokens: 300,
        durationMs: 4200,
        metadata: { assessmentId: "asmt-1", subjectType: "incident", subjectId: "inc-1", serviceId: "svc-1" },
      },
      select: { id: true },
    });
  });

  it("an AiUsage write failure is logged, not fatal", async () => {
    setup("inc-1", "moderate");
    prismaMock.aiUsage.create.mockImplementation(async () => {
      throw new Error("usage table locked");
    });
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(assessmentUpdates()).toContainEqual(expect.objectContaining({ source: "rules_and_model", aiUsageId: null }));
  });
});

describe("sweepJobs", () => {
  it("sweepJobs processes at most `limit` pending jobs with scheduledFor <= now, oldest first", async () => {
    jobs["job-a"] = job("job-a", "inc-a");
    jobs["job-b"] = job("job-b", "inc-b", { status: "running" }); // lost the claim race
    jobs["job-c"] = job("job-c", "inc-c");
    subjects["inc-a"] = incident("inc-a");
    subjects["inc-c"] = incident("inc-c");
    tiers["inc-a"] = "minor";
    tiers["inc-c"] = "minor";
    throwOnLoad.add("inc-c");
    prismaMock.triageJob.findMany.mockImplementation(async (args: { take: number }) =>
      [{ id: "job-a" }, { id: "job-b" }, { id: "job-c" }].slice(0, args.take),
    );

    expect(await sweepJobs(NOW, 3)).toEqual({ processed: 2 });
    expect(prismaMock.triageJob.findMany).toHaveBeenCalledWith({
      where: { status: "pending", scheduledFor: { lte: NOW } },
      orderBy: { scheduledFor: "asc" },
      take: 3,
      select: { id: true },
    });
    const claimed = prismaMock.triageJob.updateMany.mock.calls.map((c: [{ where: { id: string } }]) => c[0].where.id);
    expect(claimed).toEqual(["job-a", "job-b", "job-c"]);

    prismaMock.triageJob.findMany.mockClear();
    await sweepJobs(NOW);
    expect(prismaMock.triageJob.findMany.mock.calls[0][0].take).toBe(25);
  });

  it("one job throwing does not stop the rest", async () => {
    jobs["job-a"] = job("job-a", "inc-a");
    jobs["job-b"] = job("job-b", "inc-b");
    subjects["inc-b"] = incident("inc-b");
    tiers["inc-b"] = "minor";
    prismaMock.triageJob.findMany.mockImplementation(async () => [{ id: "job-a" }, { id: "job-b" }]);
    prismaMock.triageJob.updateMany.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === "job-a") throw new Error("claim failed");
      return { count: 1 };
    });
    expect(await sweepJobs(NOW)).toEqual({ processed: 1 });
  });
});
