import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/knox/recipients", () => ({ resolveRecipients: vi.fn() }));
vi.mock("@/lib/knox/enqueue", () => ({ enqueueTriage: vi.fn() }));
vi.mock("@/lib/incidents/update-incident-record", async () => {
  const actual = await vi.importActual<typeof import("@/lib/incidents/update-incident-record")>(
    "@/lib/incidents/update-incident-record",
  );
  return { ...actual, updateIncidentRecord: vi.fn() };
});
vi.mock("@/lib/complaints/update-complaint-record", async () => {
  const actual = await vi.importActual<typeof import("@/lib/complaints/update-complaint-record")>(
    "@/lib/complaints/update-complaint-record",
  );
  return { ...actual, updateComplaintRecord: vi.fn() };
});
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { resolveRecipients } from "@/lib/knox/recipients";
import { enqueueTriage } from "@/lib/knox/enqueue";
import { updateIncidentRecord } from "@/lib/incidents/update-incident-record";
import { updateComplaintRecord } from "@/lib/complaints/update-complaint-record";
import {
  CARD_TTL_MS,
  PendingActionGone,
  PendingActionHidden,
  approvePendingAction,
  buildCards,
  dismissPendingAction,
  toPendingActionCreate,
} from "@/lib/knox/actions";
import { getWeekStart } from "@/lib/utils";
import type { RulesResult, TriageSubject } from "@/lib/knox/types";
import type { ModelAssessment } from "@/lib/knox/assess";
import type { PrismaClient } from "@prisma/client";

const db = prismaMock as unknown as PrismaClient;
const resolveMock = vi.mocked(resolveRecipients);
const enqueueMock = vi.mocked(enqueueTriage);
const updateIncidentMock = vi.mocked(updateIncidentRecord);
const updateComplaintMock = vi.mocked(updateComplaintRecord);

const NOW = new Date("2026-10-20T03:00:00.000Z"); // Tuesday
const svc = { id: "svc-1", name: "Arkana OSHC", state: "NSW", managerId: null };

const incident = (over: Record<string, unknown> = {}): TriageSubject =>
  ({
    type: "incident",
    service: svc,
    childFirstName: "Ali",
    record: {
      id: "inc-1",
      serviceId: "svc-1",
      severity: "minor",
      reportableToAuthority: false,
      seriousIncidentCategory: null,
      becameAwareAt: null,
      ...over,
    },
  }) as unknown as TriageSubject;

const complaint = (over: Record<string, unknown> = {}): TriageSubject =>
  ({
    type: "complaint",
    service: svc,
    record: {
      id: "cmp-1",
      serviceId: "svc-1",
      notifiable: false,
      becameAwareAt: null,
      category: "other",
      status: "new",
      ...over,
    },
  }) as unknown as TriageSubject;

const staffIncident = (): TriageSubject =>
  ({
    type: "staff_incident",
    service: svc,
    record: { id: "stf-1", serviceId: "svc-1", severity: "serious", reportableToAuthority: true },
  }) as unknown as TriageSubject;

const rules = (over: Partial<RulesResult> = {}): RulesResult => ({
  tier: "moderate",
  ruleHits: [],
  clocks: [],
  ...over,
});

const model = (over: Partial<ModelAssessment> = {}): ModelAssessment => ({
  severityOpinion: "agrees",
  rationale: "Because.",
  missingFields: [],
  followUpTodos: [],
  ...over,
});

const kinds = (cards: { kind: string }[]) => cards.map((c) => c.kind);

describe("buildCards", () => {
  it("set_severity only when model says understated AND suggested > stated; never lower", () => {
    const up = buildCards({
      subject: incident({ severity: "minor" }),
      rules: rules(),
      model: model({ severityOpinion: "understated", suggestedSeverity: "serious" }),
      now: NOW,
    });
    expect(up).toHaveLength(1);
    expect(up[0]).toMatchObject({
      kind: "set_severity",
      payload: { severity: "serious" },
      summary: "Severity: minor → serious",
      rationale: "Because.",
    });

    const lower = buildCards({
      subject: incident({ severity: "serious" }),
      rules: rules(),
      model: model({ severityOpinion: "understated", suggestedSeverity: "moderate" }),
      now: NOW,
    });
    expect(kinds(lower)).not.toContain("set_severity");

    const same = buildCards({
      subject: incident({ severity: "serious" }),
      rules: rules(),
      model: model({ severityOpinion: "understated", suggestedSeverity: "serious" }),
      now: NOW,
    });
    expect(kinds(same)).not.toContain("set_severity");

    const agrees = buildCards({
      subject: incident({ severity: "minor" }),
      rules: rules(),
      model: model({ severityOpinion: "agrees", suggestedSeverity: "serious" }),
      now: NOW,
    });
    expect(kinds(agrees)).not.toContain("set_severity");

    const noModel = buildCards({ subject: incident(), rules: rules(), model: null, now: NOW });
    expect(noModel).toEqual([]);
  });

  it("mark_reportable when tier serious, not yet reportable, and model gives a valid category", () => {
    const cards = buildCards({
      subject: incident(),
      rules: rules({ tier: "serious" }),
      model: model({ suggestedCategory: "serious_injury" }),
      now: NOW,
    });
    const card = cards.find((c) => c.kind === "mark_reportable");
    expect(card).toBeDefined();
    expect(card!.payload).toEqual({
      reportableToAuthority: true,
      seriousIncidentCategory: "serious_injury",
      becameAwareAt: NOW.toISOString(),
    });
    expect(card!.summary).toBe("Mark reportable to the regulator (serious injury)");
    expect(card!.payload).not.toHaveProperty("shareWithParent");

    const already = buildCards({
      subject: incident({ reportableToAuthority: true }),
      rules: rules({ tier: "serious" }),
      model: model({ suggestedCategory: "serious_injury" }),
      now: NOW,
    });
    expect(kinds(already)).not.toContain("mark_reportable");

    const notSerious = buildCards({
      subject: incident(),
      rules: rules({ tier: "moderate" }),
      model: model({ suggestedCategory: "serious_injury" }),
      now: NOW,
    });
    expect(kinds(notSerious)).not.toContain("mark_reportable");
  });

  it("no mark_reportable without a category", () => {
    const none = buildCards({
      subject: incident(),
      rules: rules({ tier: "serious" }),
      model: model(),
      now: NOW,
    });
    expect(kinds(none)).not.toContain("mark_reportable");

    const noModel = buildCards({
      subject: incident(),
      rules: rules({ tier: "serious" }),
      model: null,
      now: NOW,
    });
    expect(kinds(noModel)).not.toContain("mark_reportable");

    const bogus = buildCards({
      subject: incident(),
      rules: rules({ tier: "serious" }),
      model: model({ suggestedCategory: "made_up_category" }),
      now: NOW,
    });
    expect(kinds(bogus)).not.toContain("mark_reportable");
  });

  it("mark_notifiable for a complaint_sensitive hit or an understated opinion, when !notifiable", () => {
    const sensitive = buildCards({
      subject: complaint(),
      rules: rules({ ruleHits: ["complaint_sensitive"] }),
      model: null,
      now: NOW,
    });
    expect(sensitive).toHaveLength(1);
    expect(sensitive[0]).toMatchObject({
      kind: "mark_notifiable",
      payload: {
        notifiable: true,
        notifiableReason: "law_contravention",
        becameAwareAt: NOW.toISOString(),
      },
    });
    expect(sensitive[0].payload).not.toHaveProperty("shareWithParent");

    const understated = buildCards({
      subject: complaint(),
      rules: rules(),
      model: model({ severityOpinion: "understated", suggestedCategory: "serious_injury" }),
      now: NOW,
    });
    expect(understated[0]).toMatchObject({
      kind: "mark_notifiable",
      payload: { notifiableReason: "serious_incident" },
      summary: "Mark complaint notifiable (serious incident)",
    });

    const already = buildCards({
      subject: complaint({ notifiable: true }),
      rules: rules({ ruleHits: ["complaint_sensitive"] }),
      model: null,
      now: NOW,
    });
    expect(kinds(already)).not.toContain("mark_notifiable");

    const neither = buildCards({ subject: complaint(), rules: rules(), model: model(), now: NOW });
    expect(kinds(neither)).not.toContain("mark_notifiable");
  });

  it("mark_notifiable keeps an existing becameAwareAt", () => {
    const earlier = new Date("2026-10-18T22:00:00.000Z");
    const cards = buildCards({
      subject: complaint({ becameAwareAt: earlier }),
      rules: rules({ ruleHits: ["complaint_sensitive"] }),
      model: null,
      now: NOW,
    });
    expect(cards[0].payload.becameAwareAt).toBe(earlier.toISOString());
  });

  it("create_followup_todos with model todos; staff_incident gets ONLY this kind", () => {
    const m = model({
      severityOpinion: "understated",
      suggestedSeverity: "reportable",
      suggestedCategory: "serious_injury",
      followUpTodos: [
        { title: "Call the family", dueInDays: 1 },
        { title: "Review supervision", dueInDays: 7 },
      ],
    });
    const staff = buildCards({
      subject: staffIncident(),
      rules: rules({ tier: "serious", ruleHits: ["staff_notifiable", "complaint_sensitive"] }),
      model: m,
      now: NOW,
    });
    expect(staff).toHaveLength(1);
    expect(staff[0]).toMatchObject({
      kind: "create_followup_todos",
      summary: "Create 2 follow-up to-dos",
      payload: {
        todos: [
          { title: "Call the family", dueInDays: 1 },
          { title: "Review supervision", dueInDays: 7 },
        ],
      },
    });

    const one = buildCards({
      subject: incident(),
      rules: rules(),
      model: model({ followUpTodos: [{ title: "Call the family", dueInDays: 3 }] }),
      now: NOW,
    });
    expect(one[0].summary).toBe("Create 1 follow-up to-do");

    expect(
      buildCards({ subject: staffIncident(), rules: rules(), model: model(), now: NOW }),
    ).toEqual([]);
  });
});

describe("toPendingActionCreate", () => {
  it("maps a card to a PendingAction row with a 72h expiry", () => {
    const [card] = buildCards({
      subject: incident({ severity: "minor" }),
      rules: rules(),
      model: model({ severityOpinion: "understated", suggestedSeverity: "serious" }),
      now: NOW,
    });
    const row = toPendingActionCreate(card, {
      assessmentId: "asm-1",
      subjectType: "incident",
      subjectId: "inc-1",
      serviceId: "svc-1",
      now: NOW,
    });
    expect(row).toEqual({
      proposedBy: "knox",
      kind: "set_severity",
      payload: { severity: "serious" },
      summary: "Severity: minor → serious",
      rationale: "Because.",
      assessmentId: "asm-1",
      subjectType: "incident",
      subjectId: "inc-1",
      serviceId: "svc-1",
      expiresAt: new Date(NOW.getTime() + CARD_TTL_MS),
    });
    expect(CARD_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });
});

// ── Executors ───────────────────────────────────────────────────────

const actor = { id: "user-1", role: "owner", serviceIds: null as string[] | null };

type CardRow = Record<string, unknown>;
const cardRow = (over: CardRow = {}): CardRow => ({
  id: "card-1",
  proposedBy: "knox",
  userId: null,
  serviceId: "svc-1",
  kind: "set_severity",
  subjectType: "incident",
  subjectId: "inc-1",
  payload: { severity: "serious" },
  summary: "Severity: minor → serious",
  rationale: "Because.",
  assessmentId: "asm-1",
  expiresAt: new Date(NOW.getTime() + 3_600_000),
  committedAt: null,
  dismissedAt: null,
  resultId: null,
  ...over,
});

function seed(card: CardRow | null, extra: { incidentSeverity?: string } = {}) {
  prismaMock.pendingAction.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
    card && args.where.id === card.id ? card : null,
  );
  prismaMock.pendingAction.updateMany.mockImplementation(async () => ({ count: 1 }));
  prismaMock.pendingAction.update.mockImplementation(async () => ({}));
  prismaMock.activityLog.create.mockImplementation(async () => ({}));
  prismaMock.incidentRecord.findUnique.mockImplementation(async () => ({
    id: "inc-1",
    severity: extra.incidentSeverity ?? "minor",
  }));
  prismaMock.complaintRecord.findUnique.mockImplementation(async () => ({
    notifiable: false,
    becameAwareAt: null,
  }));
  prismaMock.service.findUnique.mockImplementation(async () => svc);
  let n = 0;
  prismaMock.todo.create.mockImplementation(async () => ({ id: `todo-${++n}` }));
}

describe("approvePendingAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateIncidentMock.mockImplementation((async () => ({ id: "inc-1" })) as never);
    updateComplaintMock.mockImplementation((async () => ({ id: "cmp-1" })) as never);
    enqueueMock.mockImplementation(async () => "job-9");
    resolveMock.mockImplementation(async () => ({
      directors: [{ id: "dir-1", name: "D", email: "d@x" }],
      stateManagers: [{ id: "sm-1", name: "S", email: "s@x" }],
      owners: [],
      noDirector: false,
    }));
  });

  it("re-validates, writes through the helper, stamps the card, logs knox.approved, re-enqueues", async () => {
    seed(cardRow());
    const out = await approvePendingAction(db, "card-1", actor, NOW);

    expect(updateIncidentMock).toHaveBeenCalledTimes(1);
    expect(updateIncidentMock.mock.calls[0][1]).toBe("inc-1");
    expect(updateIncidentMock.mock.calls[0][2]).toEqual({ severity: "serious" });
    expect(updateIncidentMock.mock.calls[0][3]).toEqual({ id: "user-1" });

    expect(prismaMock.pendingAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "card-1", committedAt: null, dismissedAt: null }),
        data: { committedAt: NOW, committedById: "user-1" },
      }),
    );
    expect(prismaMock.pendingAction.update).toHaveBeenCalledWith({
      where: { id: "card-1" },
      data: { resultId: "inc-1" },
    });
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        action: "knox.approved",
        entityType: "PendingAction",
        entityId: "card-1",
        details: expect.objectContaining({
          kind: "set_severity",
          summary: "Severity: minor → serious",
          assessmentId: "asm-1",
          resultId: "inc-1",
        }),
      },
    });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0][1]).toEqual({
      subjectType: "incident",
      subjectId: "inc-1",
      serviceId: "svc-1",
      reason: "updated",
    });
    expect(out).toEqual({ resultId: "inc-1", jobId: "job-9" });
  });

  it("a tampered payload fails validation and writes nothing", async () => {
    for (const payload of [
      { severity: 5 },
      { severity: "catastrophic" },
      { severity: "serious", shareWithParent: true },
      { severity: "serious", description: "rewritten" },
    ]) {
      vi.clearAllMocks();
      seed(cardRow({ payload }));
      await expect(approvePendingAction(db, "card-1", actor, NOW)).rejects.toMatchObject({
        status: 400,
      });
      expect(updateIncidentMock).not.toHaveBeenCalled();
      expect(prismaMock.pendingAction.updateMany).not.toHaveBeenCalled();
      expect(enqueueMock).not.toHaveBeenCalled();
    }
  });

  it("set_severity never lowers a severity that has risen since the card was proposed", async () => {
    seed(cardRow({ payload: { severity: "serious" } }), { incidentSeverity: "reportable" });
    await expect(approvePendingAction(db, "card-1", actor, NOW)).rejects.toMatchObject({
      status: 409,
    });
    expect(updateIncidentMock).not.toHaveBeenCalled();
  });

  it("mark_reportable writes the reportable patch and re-enqueues", async () => {
    const payload = {
      reportableToAuthority: true,
      seriousIncidentCategory: "serious_injury",
      becameAwareAt: NOW.toISOString(),
    };
    seed(cardRow({ kind: "mark_reportable", payload }));
    const out = await approvePendingAction(db, "card-1", actor, NOW);
    expect(updateIncidentMock.mock.calls[0][2]).toEqual(payload);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(out.jobId).toBe("job-9");
  });

  it("mark_notifiable goes through updateComplaintRecord with the stored existing state", async () => {
    const payload = {
      notifiable: true,
      notifiableReason: "law_contravention",
      becameAwareAt: NOW.toISOString(),
    };
    seed(cardRow({ kind: "mark_notifiable", subjectType: "complaint", subjectId: "cmp-1", payload }));
    const out = await approvePendingAction(db, "card-1", actor, NOW);
    expect(updateComplaintMock).toHaveBeenCalledTimes(1);
    const args = updateComplaintMock.mock.calls[0];
    expect(args[1]).toBe("cmp-1");
    expect(args[2]).toEqual(payload);
    expect(args[3]).toEqual({ id: "user-1" });
    expect(args[4]).toEqual({ notifiable: false, becameAwareAt: null });
    expect(enqueueMock.mock.calls[0][1]).toEqual({
      subjectType: "complaint",
      subjectId: "cmp-1",
      serviceId: "svc-1",
      reason: "updated",
    });
    expect(out).toEqual({ resultId: "cmp-1", jobId: "job-9" });
  });

  it("a helper rule violation propagates and leaves enqueue untouched", async () => {
    seed(
      cardRow({
        kind: "mark_notifiable",
        subjectType: "complaint",
        subjectId: "cmp-1",
        payload: { notifiable: true, notifiableReason: "law_contravention", becameAwareAt: NOW.toISOString() },
      }),
    );
    const boom = Object.assign(new Error("needs a reason"), { status: 400 });
    updateComplaintMock.mockImplementation((async () => {
      throw boom;
    }) as never);
    await expect(approvePendingAction(db, "card-1", actor, NOW)).rejects.toBe(boom);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });

  it("expired, committed, dismissed or lost-race cards are Gone", async () => {
    seed(cardRow({ expiresAt: new Date(NOW.getTime() - 1) }));
    await expect(approvePendingAction(db, "card-1", actor, NOW)).rejects.toBeInstanceOf(
      PendingActionGone,
    );

    seed(cardRow({ expiresAt: NOW }));
    await expect(approvePendingAction(db, "card-1", actor, NOW)).rejects.toBeInstanceOf(
      PendingActionGone,
    );

    seed(cardRow({ committedAt: new Date(NOW.getTime() - 1000) }));
    await expect(approvePendingAction(db, "card-1", actor, NOW)).rejects.toBeInstanceOf(
      PendingActionGone,
    );

    seed(cardRow({ dismissedAt: new Date(NOW.getTime() - 1000) }));
    await expect(approvePendingAction(db, "card-1", actor, NOW)).rejects.toBeInstanceOf(
      PendingActionGone,
    );

    // Another approver claimed it between our read and our claim.
    seed(cardRow());
    prismaMock.pendingAction.updateMany.mockImplementation(async () => ({ count: 0 }));
    await expect(approvePendingAction(db, "card-1", actor, NOW)).rejects.toBeInstanceOf(
      PendingActionGone,
    );
    expect(updateIncidentMock).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("out of scope or unknown cards are Hidden", async () => {
    seed(cardRow());
    await expect(
      approvePendingAction(db, "card-1", { ...actor, serviceIds: ["svc-2"] }, NOW),
    ).rejects.toBeInstanceOf(PendingActionHidden);
    await expect(
      approvePendingAction(db, "card-1", { ...actor, serviceIds: [] }, NOW),
    ).rejects.toBeInstanceOf(PendingActionHidden);
    await expect(approvePendingAction(db, "nope", actor, NOW)).rejects.toBeInstanceOf(
      PendingActionHidden,
    );

    // a scoped actor never learns an out-of-scope card was expired
    seed(cardRow({ expiresAt: new Date(NOW.getTime() - 1) }));
    await expect(
      approvePendingAction(db, "card-1", { ...actor, serviceIds: ["svc-2"] }, NOW),
    ).rejects.toBeInstanceOf(PendingActionHidden);

    // in scope proceeds
    seed(cardRow());
    await expect(
      approvePendingAction(db, "card-1", { ...actor, serviceIds: ["svc-1", "svc-2"] }, NOW),
    ).resolves.toMatchObject({ resultId: "inc-1" });
    expect(updateIncidentMock).toHaveBeenCalledTimes(1);
  });

  it("create_followup_todos makes one Todo per item and does not re-enqueue", async () => {
    seed(
      cardRow({
        kind: "create_followup_todos",
        payload: {
          todos: [
            { title: "Call the family", dueInDays: 1 },
            { title: "Review supervision", dueInDays: 7 },
          ],
        },
      }),
    );
    const out = await approvePendingAction(db, "card-1", actor, NOW);

    expect(prismaMock.todo.create).toHaveBeenCalledTimes(2);
    const first = prismaMock.todo.create.mock.calls[0][0].data;
    const dueFirst = new Date(NOW.getTime() + 1 * 86_400_000);
    expect(first).toMatchObject({
      title: "Call the family",
      dueDate: dueFirst,
      weekOf: getWeekStart(dueFirst),
      assigneeId: "dir-1",
      serviceId: "svc-1",
      createdById: "user-1",
      status: "pending",
    });
    const second = prismaMock.todo.create.mock.calls[1][0].data;
    const dueSecond = new Date(NOW.getTime() + 7 * 86_400_000);
    expect(second.dueDate).toEqual(dueSecond);
    expect(second.weekOf).toEqual(getWeekStart(dueSecond));
    expect(resolveMock.mock.calls[0][1]).toEqual(svc);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(out).toEqual({ resultId: "todo-1", jobId: null });
    expect(updateIncidentMock).not.toHaveBeenCalled();
  });

  it("todo assignee falls back to the first state manager, then to nobody", async () => {
    const payload = { todos: [{ title: "Call the family", dueInDays: 1 }] };
    resolveMock.mockImplementation(async () => ({
      directors: [],
      stateManagers: [{ id: "sm-1", name: "S", email: "s@x" }],
      owners: [],
      noDirector: true,
    }));
    seed(cardRow({ kind: "create_followup_todos", payload }));
    await approvePendingAction(db, "card-1", actor, NOW);
    expect(prismaMock.todo.create.mock.calls[0][0].data.assigneeId).toBe("sm-1");

    vi.clearAllMocks();
    resolveMock.mockImplementation(async () => ({
      directors: [],
      stateManagers: [],
      owners: [],
      noDirector: true,
    }));
    seed(cardRow({ kind: "create_followup_todos", payload }));
    await approvePendingAction(db, "card-1", actor, NOW);
    expect(prismaMock.todo.create.mock.calls[0][0].data.assigneeId).toBeNull();
  });

  it("a malformed todo payload is rejected", async () => {
    seed(
      cardRow({
        kind: "create_followup_todos",
        payload: { todos: [{ title: "x", dueInDays: 400 }] },
      }),
    );
    await expect(approvePendingAction(db, "card-1", actor, NOW)).rejects.toMatchObject({
      status: 400,
    });
    expect(prismaMock.todo.create).not.toHaveBeenCalled();
  });
});

describe("dismissPendingAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stamps dismissedAt/By/reason and logs knox.dismissed", async () => {
    seed(cardRow());
    await dismissPendingAction(db, "card-1", { id: "user-1", serviceIds: null }, "Not needed", NOW);
    expect(prismaMock.pendingAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "card-1", committedAt: null, dismissedAt: null }),
        data: { dismissedAt: NOW, dismissedById: "user-1", dismissReason: "Not needed" },
      }),
    );
    expect(prismaMock.activityLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        action: "knox.dismissed",
        entityType: "PendingAction",
        entityId: "card-1",
        details: expect.objectContaining({
          kind: "set_severity",
          summary: "Severity: minor → serious",
          assessmentId: "asm-1",
          reason: "Not needed",
        }),
      },
    });
    expect(updateIncidentMock).not.toHaveBeenCalled();
  });

  it("is Gone when already actioned or expired, Hidden when out of scope", async () => {
    seed(cardRow({ committedAt: new Date(NOW.getTime() - 1000) }));
    await expect(
      dismissPendingAction(db, "card-1", { id: "user-1", serviceIds: null }, undefined, NOW),
    ).rejects.toBeInstanceOf(PendingActionGone);

    seed(cardRow({ expiresAt: new Date(NOW.getTime() - 1) }));
    await expect(
      dismissPendingAction(db, "card-1", { id: "user-1", serviceIds: null }, undefined, NOW),
    ).rejects.toBeInstanceOf(PendingActionGone);

    seed(cardRow());
    await expect(
      dismissPendingAction(db, "card-1", { id: "user-1", serviceIds: ["svc-2"] }, undefined, NOW),
    ).rejects.toBeInstanceOf(PendingActionHidden);

    seed(cardRow());
    prismaMock.pendingAction.updateMany.mockImplementation(async () => ({ count: 0 }));
    await expect(
      dismissPendingAction(db, "card-1", { id: "user-1", serviceIds: null }, undefined, NOW),
    ).rejects.toBeInstanceOf(PendingActionGone);
    expect(prismaMock.activityLog.create).not.toHaveBeenCalled();
  });
});
