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
import {
  MAX_ATTEMPTS,
  RECONCILE_EVENT_WINDOW_MS,
  RECONCILE_WINDOW_MS,
  STALE_BACKLOG_MS,
  STALE_RUNNING_MS,
  reconcileMissingJobs,
  runTriageJob,
  sweepJobs,
} from "@/lib/knox/worker";
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
/** Alerted assessments from OTHER jobs, seeded per test (they have alert rows). */
let priorAlerted: Record<string, { tier: TriageTier }[]>;
/**
 * Behavioural fake of TriageAssessment + its TriageAlert rows: create/update/
 * findUnique(jobId) hit `store`; a successful dispatchLevel adds alert rows.
 * The dedupe findMany honours `alerts.some` and (if present) `alerted`.
 */
interface StoredAssessment {
  id: string;
  jobId: string;
  subjectId: string;
  tier: TriageTier;
  alerted: boolean;
}
let store: Record<string, StoredAssessment>;
let alertRows: Set<string>;
let nextAssessment: number;
let failAlertedUpdate: boolean;
let shadowMode: boolean;
let enabled: boolean;
let model: AssessmentResult;
let recipients: Recipients;
let throwOnLoad: Set<string>;
/** Subjects that already have an OPEN Knox follow-up to-do card. */
let openTodoCardFor: Set<string>;

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
  store = {};
  alertRows = new Set();
  nextAssessment = 1;
  failAlertedUpdate = false;
  shadowMode = false;
  enabled = true;
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
    async (args: { where: { subjectId: string; alerted?: boolean; alerts?: { some: object } } }) => {
      const w = args.where;
      const own = Object.values(store).filter(
        (a) =>
          a.subjectId === w.subjectId &&
          (w.alerts === undefined || alertRows.has(a.id)) &&
          (w.alerted === undefined || a.alerted === w.alerted),
      );
      return [...(priorAlerted[w.subjectId] ?? []), ...own.map((a) => ({ tier: a.tier }))];
    },
  );
  prismaMock.triageAssessment.findUnique.mockReset().mockImplementation(
    async (args: { where: { jobId: string } }) => {
      const a = Object.values(store).find((x) => x.jobId === args.where.jobId);
      return a ? { id: a.id, alerted: a.alerted } : null;
    },
  );
  prismaMock.triageAssessment.create.mockReset().mockImplementation(
    async (args: { data: StoredAssessment & Record<string, unknown> }) => {
      const id = `asmt-${nextAssessment++}`;
      const d = args.data;
      store[id] = { id, jobId: d.jobId, subjectId: d.subjectId, tier: d.tier, alerted: d.alerted };
      return { id };
    },
  );
  prismaMock.triageAssessment.update.mockReset().mockImplementation(
    async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      if (failAlertedUpdate && args.data.alerted === true && Object.keys(args.data).length === 1) {
        throw new Error("update lost");
      }
      const a = store[args.where.id];
      if (a) {
        if (typeof args.data.alerted === "boolean") a.alerted = args.data.alerted;
        if (typeof args.data.tier === "string") a.tier = args.data.tier as TriageTier;
      }
      return { id: args.where.id };
    },
  );
  prismaMock.triageAssessment.delete.mockReset();
  prismaMock.aiUsage.create.mockReset().mockImplementation(async () => ({ id: "usage-1" }));
  prismaMock.pendingAction.createMany.mockReset().mockImplementation(
    async (args: { data: unknown[] }) => ({ count: args.data.length }),
  );
  openTodoCardFor = new Set();
  prismaMock.pendingAction.findFirst.mockReset().mockImplementation(
    async (args: { where: { subjectId: string; kind: string; proposedBy: string; committedAt: null; dismissedAt: null } }) =>
      args.where.kind === "create_followup_todos" &&
      args.where.proposedBy === "knox" &&
      args.where.committedAt === null &&
      args.where.dismissedAt === null &&
      openTodoCardFor.has(args.where.subjectId)
        ? { id: "open-todo-card" }
        : null,
  );
  prismaMock.pendingAction.updateMany.mockReset().mockImplementation(async () => ({ count: 1 }));
  prismaMock.$transaction.mockClear();

  dispatchMock.mockReset().mockImplementation(async (_db: unknown, args: { assessmentId: string }) => {
    alertRows.add(args.assessmentId);
    return true;
  });
  opsNoteMock.mockReset().mockImplementation(async () => undefined);
  assessMock.mockReset().mockImplementation(async () => model);
  recipientsMock.mockReset().mockImplementation(async () => recipients);
  settingsMock.mockReset().mockImplementation(async () => ({ enabled, shadowMode }));
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
    expect(typeof knox.reconcileMissingJobs).toBe("function");
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

  it("Knox disabled → 'disabled' before claiming: no claim, no load, job stays pending", async () => {
    setup("inc-1", "serious");
    enabled = false;
    expect(await runTriageJob("job-1", NOW)).toBe("disabled");
    expect(prismaMock.triageJob.updateMany).not.toHaveBeenCalled();
    expect(loadMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(jobs["job-1"].status).toBe("pending");
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
    // `alerted` is set BEFORE the push, the same as level 0.
    const flagCall = prismaMock.triageAssessment.update.mock.calls.findIndex(
      (c: [{ data: Record<string, unknown> }]) => c[0].data.alerted === true,
    );
    expect(prismaMock.triageAssessment.update.mock.invocationCallOrder[flagCall]).toBeLessThan(
      dispatchMock.mock.invocationCallOrder[0],
    );
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

  it("exception mid-run after the alert went out: the retry reuses this job's assessment row, re-runs model + cards, and does not re-alert", async () => {
    setup("inc-1", "serious");
    model = modelOk({ followUpTodos: [{ title: "Ring the family", dueInDays: 1 }] });
    prismaMock.pendingAction.createMany.mockImplementation(async () => {
      throw new Error("pool timeout");
    });
    expect(await runTriageJob("job-1", NOW)).toBe("retry");
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(assessMock).toHaveBeenCalledTimes(1);

    prismaMock.pendingAction.createMany.mockImplementation(async (a: { data: unknown[] }) => ({ count: a.data.length }));
    prismaMock.triageAssessment.create.mockClear();
    prismaMock.triageAssessment.update.mockClear();
    jobs["job-1"].status = "pending";

    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(assessMock).toHaveBeenCalledTimes(2);
    expect(prismaMock.pendingAction.createMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.pendingAction.createMany.mock.calls[1][0].data).toEqual([
      expect.objectContaining({ kind: "create_followup_todos", assessmentId: "asmt-1" }),
    ]);
    expect(prismaMock.triageAssessment.delete).not.toHaveBeenCalled();
    expect(prismaMock.triageAssessment.create).not.toHaveBeenCalled();
    // The reused row keeps alerted:true so the escalation sweep still sees it.
    expect(prismaMock.triageAssessment.update.mock.calls[0][0]).toMatchObject({
      where: { id: "asmt-1" },
      data: { tier: "serious", alerted: true, source: "rules_only", modelError: null },
    });
    expect(store["asmt-1"].alerted).toBe(true);
  });

  it("dispatchLevel throws on attempt 1 (no alert rows) → the retry dispatches again", async () => {
    setup("inc-1", "serious");
    dispatchMock.mockImplementation(async () => {
      throw new Error("could not record alert rows");
    });
    expect(await runTriageJob("job-1", NOW)).toBe("retry");
    // The row says alerted, but nothing proves an alert went out.
    expect(store["asmt-1"].alerted).toBe(true);
    expect(alertRows.size).toBe(0);

    dispatchMock.mockImplementation(async (_db: unknown, args: { assessmentId: string }) => {
      alertRows.add(args.assessmentId);
      return true;
    });
    jobs["job-1"].status = "pending";
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).toHaveBeenCalledTimes(2);
    expect(dispatchMock.mock.calls[1][1]).toMatchObject({ assessmentId: "asmt-1", level: 0 });
  });

  it("safety net is sent at most once across retries, whichever write fails", async () => {
    setup("inc-1", "minor", {}, incident("inc-1", { severity: "minor" }));
    model = modelOk({ severityOpinion: "understated", suggestedSeverity: "serious" });

    // Attempt 1: setting `alerted` fails → nothing was pushed.
    failAlertedUpdate = true;
    expect(await runTriageJob("job-1", NOW)).toBe("retry");
    expect(dispatchMock).not.toHaveBeenCalled();

    // Attempt 2: the push goes out, then the final write fails.
    failAlertedUpdate = false;
    prismaMock.pendingAction.createMany.mockImplementation(async () => {
      throw new Error("pool timeout");
    });
    jobs["job-1"].status = "pending";
    expect(await runTriageJob("job-1", NOW)).toBe("retry");
    expect(dispatchMock).toHaveBeenCalledTimes(1);

    // Attempt 3: the alert rows exist — even with the flag forced back to
    // false, the dedupe (keyed on alert rows) must not push again.
    store["asmt-1"].alerted = false;
    prismaMock.pendingAction.createMany.mockImplementation(async (a: { data: unknown[] }) => ({ count: a.data.length }));
    jobs["job-1"].status = "pending";
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it("re-triage supersedes the record's open Knox cards of the kinds it writes, in the same transaction, before the new cards", async () => {
    setup("inc-1", "moderate", {}, incident("inc-1", { severity: "minor" }));
    model = modelOk({
      severityOpinion: "understated",
      suggestedSeverity: "serious",
      followUpTodos: [{ title: "Ring the family", dueInDays: 1 }],
    });
    expect(await runTriageJob("job-1", NOW)).toBe("done");

    expect(prismaMock.pendingAction.updateMany).toHaveBeenCalledTimes(1);
    const sup = prismaMock.pendingAction.updateMany.mock.calls[0][0];
    expect(sup).toEqual({
      where: {
        subjectType: "incident",
        subjectId: "inc-1",
        proposedBy: "knox",
        committedAt: null,
        dismissedAt: null,
        expiresAt: { gt: NOW },
        // The to-do kind is never superseded (an open one blocks a new one instead).
        kind: { in: ["set_severity"] },
      },
      data: { dismissedAt: NOW, dismissReason: "superseded" },
    });
    expect(prismaMock.pendingAction.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.pendingAction.createMany.mock.invocationCallOrder[0],
    );
    expect(cardRows().map((c: Record<string, unknown>) => c.kind)).toEqual(["set_severity", "create_followup_todos"]);
  });

  it("never writes a second follow-up to-do card while one is open for the record", async () => {
    setup("inc-1", "moderate");
    openTodoCardFor.add("inc-1");
    model = modelOk({ followUpTodos: [{ title: "Ring the family", dueInDays: 1 }] });
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(prismaMock.pendingAction.createMany).not.toHaveBeenCalled();
    expect(prismaMock.pendingAction.updateMany).not.toHaveBeenCalled();

    // Another record with no open to-do card gets one.
    jobs["job-2"] = job("job-2", "inc-2");
    subjects["inc-2"] = incident("inc-2");
    tiers["inc-2"] = "moderate";
    expect(await runTriageJob("job-2", NOW)).toBe("done");
    expect(cardRows().map((c: Record<string, unknown>) => c.kind)).toEqual(["create_followup_todos"]);
  });

  it("writes no supersede when there are no new cards", async () => {
    setup("inc-1", "moderate");
    expect(await runTriageJob("job-1", NOW)).toBe("done");
    expect(prismaMock.pendingAction.updateMany).not.toHaveBeenCalled();
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
  const due = (ids: string[]) =>
    prismaMock.triageJob.findMany.mockImplementation(async (args: { take: number }) =>
      ids.map((id) => ({ id })).slice(0, args.take),
    );
  const runningCount = (n: number) =>
    prismaMock.triageJob.updateMany.mockImplementation(
      async (args: { where: { id?: string; status: string }; data: { attempts?: { increment: number } } }) => {
        if (args.where.status === "running") return { count: n };
        const j = args.where.id ? jobs[args.where.id] : undefined;
        if (!j || j.status !== "pending") return { count: 0 };
        j.status = "running";
        j.attempts += args.data.attempts?.increment ?? 0;
        return { count: 1 };
      },
    );
  const claimedIds = () =>
    prismaMock.triageJob.updateMany.mock.calls
      .map((c: [{ where: { id?: string } }]) => c[0].where.id)
      .filter(Boolean);

  it("sweepJobs processes at most `limit` pending jobs with scheduledFor <= now, oldest first", async () => {
    jobs["job-a"] = job("job-a", "inc-a");
    jobs["job-b"] = job("job-b", "inc-b", { status: "running" }); // lost the claim race
    jobs["job-c"] = job("job-c", "inc-c");
    subjects["inc-a"] = incident("inc-a");
    subjects["inc-c"] = incident("inc-c");
    tiers["inc-a"] = "minor";
    tiers["inc-c"] = "minor";
    throwOnLoad.add("inc-c");
    runningCount(0);
    due(["job-a", "job-b", "job-c"]);

    expect(await sweepJobs(NOW, { limit: 3 })).toEqual({ processed: 2, reaped: 0 });
    expect(prismaMock.triageJob.findMany).toHaveBeenCalledWith({
      where: { status: "pending", scheduledFor: { lte: NOW } },
      orderBy: { scheduledFor: "asc" },
      take: 3,
      select: { id: true },
    });
    expect(claimedIds()).toEqual(["job-a", "job-b", "job-c"]);

    prismaMock.triageJob.findMany.mockClear();
    await sweepJobs(NOW);
    expect(prismaMock.triageJob.findMany.mock.calls[0][0].take).toBe(10);
  });

  it("reaps jobs stuck in running past STALE_RUNNING_MS back to pending before pulling due jobs", async () => {
    runningCount(2);
    due([]);
    expect(STALE_RUNNING_MS).toBe(10 * 60 * 1000);
    expect(await sweepJobs(NOW)).toEqual({ processed: 0, reaped: 2 });
    expect(prismaMock.triageJob.updateMany).toHaveBeenCalledWith({
      where: { status: "running", startedAt: { lt: new Date(NOW.getTime() - STALE_RUNNING_MS) } },
      data: { status: "pending", scheduledFor: NOW, lastError: "reaped: stale running" },
    });
    expect(prismaMock.triageJob.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.triageJob.findMany.mock.invocationCallOrder[0],
    );
  });

  it("a reaped job is picked up and run in the same sweep", async () => {
    jobs["job-a"] = job("job-a", "inc-a", { status: "running", attempts: 1 });
    subjects["inc-a"] = incident("inc-a");
    tiers["inc-a"] = "minor";
    prismaMock.triageJob.updateMany.mockImplementation(
      async (args: { where: { id?: string; status: string }; data: { attempts?: { increment: number } } }) => {
        if (args.where.status === "running") {
          jobs["job-a"].status = "pending";
          return { count: 1 };
        }
        const j = jobs[args.where.id ?? ""];
        if (!j || j.status !== "pending") return { count: 0 };
        j.status = "running";
        j.attempts += args.data.attempts?.increment ?? 0;
        return { count: 1 };
      },
    );
    due(["job-a"]);
    expect(await sweepJobs(NOW)).toEqual({ processed: 1, reaped: 1 });
    expect(jobUpdates()).toContainEqual({ status: "done", finishedAt: expect.any(Date) });
  });

  it("stops pulling new jobs once the time budget is spent (budget 0 → exactly one job)", async () => {
    for (const k of ["a", "b", "c"]) {
      jobs[`job-${k}`] = job(`job-${k}`, `inc-${k}`);
      subjects[`inc-${k}`] = incident(`inc-${k}`);
      tiers[`inc-${k}`] = "minor";
    }
    runningCount(0);
    due(["job-a", "job-b", "job-c"]);
    expect(await sweepJobs(NOW, { budgetMs: 0 })).toEqual({ processed: 1, reaped: 0 });
    expect(claimedIds()).toEqual(["job-a"]);
    expect(jobs["job-b"].status).toBe("pending");
  });

  it("returns early while Knox is disabled: no reap, no pull", async () => {
    enabled = false;
    expect(await sweepJobs(NOW)).toEqual({ processed: 0, reaped: 0 });
    expect(prismaMock.triageJob.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.triageJob.findMany).not.toHaveBeenCalled();
  });

  it("one job throwing does not stop the rest", async () => {
    jobs["job-a"] = job("job-a", "inc-a");
    jobs["job-b"] = job("job-b", "inc-b");
    subjects["inc-b"] = incident("inc-b");
    tiers["inc-b"] = "minor";
    due(["job-a", "job-b"]);
    prismaMock.triageJob.updateMany.mockImplementation(async (args: { where: { id?: string; status: string } }) => {
      if (args.where.status === "running") return { count: 0 };
      if (args.where.id === "job-a") throw new Error("claim failed");
      return { count: 1 };
    });
    expect(await sweepJobs(NOW)).toEqual({ processed: 1, reaped: 0 });
  });
});

describe("reconcileMissingJobs", () => {
  /** Register rows created in the window, per register; and subjects that already have ANY job. */
  let rows: Record<"incident" | "complaint" | "staff_incident", Array<{ id: string; serviceId: string }>>;
  let withJob: Set<string>;
  let created: Array<Record<string, unknown>>;

  beforeEach(() => {
    rows = { incident: [], complaint: [], staff_incident: [] };
    withJob = new Set();
    created = [];
    prismaMock.incidentRecord.findMany.mockReset().mockImplementation(async () => rows.incident);
    prismaMock.complaintRecord.findMany.mockReset().mockImplementation(async () => rows.complaint);
    prismaMock.staffIncidentReport.findMany.mockReset().mockImplementation(async () => rows.staff_incident);
    prismaMock.triageJob.findMany.mockReset().mockImplementation(
      async (args: { where: { subjectType: string; subjectId: { in: string[] } } }) =>
        args.where.subjectId.in.filter((id) => withJob.has(`${args.where.subjectType}:${id}`)).map((subjectId) => ({ subjectId })),
    );
    prismaMock.triageJob.findFirst.mockReset().mockImplementation(async () => null);
    prismaMock.triageJob.create.mockReset().mockImplementation(async (args: { data: Record<string, unknown> }) => {
      created.push(args.data);
      return { id: `job-new-${created.length}` };
    });
  });

  it("queues a `sweep` job for a register row that has no TriageJob at all", async () => {
    rows.incident = [{ id: "inc-lost", serviceId: "svc-1" }];
    rows.complaint = [{ id: "c-lost", serviceId: "svc-2" }];
    rows.staff_incident = [{ id: "s-lost", serviceId: "svc-3" }];
    expect(await reconcileMissingJobs(prismaMock as never, NOW)).toEqual({ reconciled: 3 });
    expect(created).toEqual([
      { subjectType: "incident", subjectId: "inc-lost", serviceId: "svc-1", reason: "sweep" },
      { subjectType: "complaint", subjectId: "c-lost", serviceId: "svc-2", reason: "sweep" },
      { subjectType: "staff_incident", subjectId: "s-lost", serviceId: "svc-3", reason: "sweep" },
    ]);
  });

  it("leaves a row alone when it has any job (whatever its status)", async () => {
    rows.incident = [
      { id: "inc-ok", serviceId: "svc-1" },
      { id: "inc-lost", serviceId: "svc-1" },
    ];
    withJob.add("incident:inc-ok");
    // Same id in another register is a different subject.
    withJob.add("complaint:inc-lost");
    expect(await reconcileMissingJobs(prismaMock as never, NOW)).toEqual({ reconciled: 1 });
    expect(created.map((c) => c.subjectId)).toEqual(["inc-lost"]);
  });

  it("looks back 6 hours by createdAt, bounds each register at 200, skips deleted incidents and old events", async () => {
    await reconcileMissingJobs(prismaMock as never, NOW);
    const since = new Date(NOW.getTime() - RECONCILE_WINDOW_MS);
    const eventSince = new Date(NOW.getTime() - RECONCILE_EVENT_WINDOW_MS);
    expect(RECONCILE_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
    const inc = prismaMock.incidentRecord.findMany.mock.calls[0][0];
    expect(inc.where).toEqual({ createdAt: { gte: since }, deleted: false, incidentDate: { gte: eventSince } });
    expect(inc.take).toBe(200);
    expect(prismaMock.complaintRecord.findMany.mock.calls[0][0].where).toEqual({
      createdAt: { gte: since },
      receivedAt: { gte: eventSince },
    });
    expect(prismaMock.staffIncidentReport.findMany.mock.calls[0][0].where).toEqual({
      createdAt: { gte: since },
      occurredAt: { gte: eventSince },
    });
    // Nothing to reconcile → no job lookups, no inserts.
    expect(prismaMock.triageJob.findMany).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });

  it("a failed enqueue is not counted", async () => {
    rows.incident = [{ id: "inc-lost", serviceId: "svc-1" }];
    prismaMock.triageJob.create.mockImplementation(async () => {
      throw new Error("insert failed");
    });
    expect(await reconcileMissingJobs(prismaMock as never, NOW)).toEqual({ reconciled: 0 });
  });
});
