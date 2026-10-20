import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/notify-user", () => ({ notifyUsers: vi.fn() }));
vi.mock("@/lib/teams-notify", () => ({ sendTeamsNotification: vi.fn() }));
vi.mock("@/lib/knox/recipients", () => ({ resolveRecipients: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { notifyUsers } from "@/lib/notify-user";
import { sendTeamsNotification } from "@/lib/teams-notify";
import { resolveRecipients } from "@/lib/knox/recipients";
import {
  ESCALATION,
  dispatchLevel,
  postOpsNote,
  recordLink,
  runEscalationSweep,
} from "@/lib/knox/alerts";
import type { RulesResult, TriageSubject } from "@/lib/knox/types";
import type { Recipients as RecipientsT } from "@/lib/knox/recipients";
import type { IncidentRecord } from "@prisma/client";

const notifyMock = vi.mocked(notifyUsers);
const teamsMock = vi.mocked(sendTeamsNotification);
const resolveMock = vi.mocked(resolveRecipients);

const svc = { id: "svc-1", name: "Arkana OSHC", state: "NSW", managerId: null };
const person = (id: string): { id: string; name: string | null; email: string } => ({
  id,
  name: `Name ${id}`,
  email: `${id}@amanaoshc.com.au`,
});

const recipients = (over: Partial<RecipientsT> = {}): RecipientsT => ({
  directors: [person("dir1")],
  stateManagers: [person("sm1"), person("sm2")],
  owners: [person("own1")],
  noDirector: false,
  ...over,
});

const incidentSubject = (): TriageSubject => ({
  type: "incident",
  service: svc,
  childFirstName: "Ali",
  record: {
    id: "inc-1",
    serviceId: "svc-1",
    incidentType: "injury",
    incidentDate: new Date("2026-10-20T03:30:00Z"),
  } as IncidentRecord,
});

const rules = (tier: RulesResult["tier"], over: Partial<RulesResult> = {}): RulesResult => ({
  tier,
  ruleHits: ["ambulance_called"],
  clocks: [],
  ...over,
});

const ENV = ["TEAMS_KNOX_WEBHOOK_URL", "TEAMS_WEBHOOK_URL", "NEXTAUTH_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.TEAMS_KNOX_WEBHOOK_URL = "https://knox.example/hook";
  process.env.TEAMS_WEBHOOK_URL = "https://default.example/hook";
  process.env.NEXTAUTH_URL = "https://eos.example";
  notifyMock.mockReset().mockImplementation((async (_db: unknown, ids: string[]) => ids.length) as never);
  teamsMock.mockReset().mockResolvedValue(true);
  resolveMock.mockReset();
  prismaMock.triageAlert.createMany.mockReset().mockResolvedValue({ count: 0 } as never);
  prismaMock.triageAssessment.findMany.mockReset();
  prismaMock.incidentRecord.findUnique.mockReset();
  prismaMock.complaintRecord.findUnique.mockReset();
  prismaMock.staffIncidentReport.findUnique.mockReset();
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

interface Row {
  assessmentId: string;
  serviceId: string;
  tier: string;
  recipientUserId: string | null;
  channel: string;
  escalationLevel: number;
  delivered: boolean;
}
function rowsWritten(): Row[] {
  return prismaMock.triageAlert.createMany.mock.calls.flatMap(
    (c: unknown[]) => (c[0] as { data: Row[] }).data,
  );
}

const dispatch = (level: 0 | 1 | 2, tier: RulesResult["tier"], r: RecipientsT, extra: object = {}) =>
  dispatchLevel(prismaMock as never, {
    assessmentId: "as-1",
    subject: incidentSubject(),
    rules: rules(tier),
    recipients: r,
    level,
    ...extra,
  });

describe("recordLink", () => {
  it("incident → /incidents?knox=<assessmentId>&incident=<id>; complaint/staff → /knox?subject=…", () => {
    expect(recordLink("incident", "i1", "a1")).toBe("/incidents?knox=a1&incident=i1");
    expect(recordLink("complaint", "c1", "a1")).toBe("/knox?subject=complaint:c1");
    expect(recordLink("staff_incident", "s1", "a1")).toBe("/knox?subject=staff_incident:s1");
  });
});

describe("dispatchLevel", () => {
  it("minor level 0 sends nothing and creates no TriageAlert rows", async () => {
    await dispatch(0, "minor", recipients());
    expect(notifyMock).not.toHaveBeenCalled();
    expect(teamsMock).not.toHaveBeenCalled();
    expect(rowsWritten()).toEqual([]);
  });

  it("moderate level 0 pushes to directors only and writes one push row per director", async () => {
    await dispatch(0, "moderate", recipients({ directors: [person("dir1"), person("dir2")] }));

    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [, ids, content] = notifyMock.mock.calls[0] as unknown as [unknown, string[], Record<string, string>];
    expect(ids).toEqual(["dir1", "dir2"]);
    expect(content.type).toBe("knox_alert");
    expect(content.link).toBe("/incidents?knox=as-1&incident=inc-1");
    expect(teamsMock).not.toHaveBeenCalled();

    const rows = rowsWritten();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.channel === "push" && r.escalationLevel === 0 && r.tier === "moderate")).toBe(true);
    expect(rows.map((r) => r.recipientUserId)).toEqual(["dir1", "dir2"]);
    expect(rows.every((r) => r.delivered)).toBe(true);
    expect(rows[0].assessmentId).toBe("as-1");
    expect(rows[0].serviceId).toBe("svc-1");
  });

  it("serious level 0 pushes to directors + state managers and posts one Teams card to the Knox webhook", async () => {
    await dispatch(0, "serious", recipients());

    const [, ids] = notifyMock.mock.calls[0] as unknown as [unknown, string[]];
    expect(ids).toEqual(["dir1", "sm1", "sm2"]);

    expect(teamsMock).toHaveBeenCalledTimes(1);
    const card = teamsMock.mock.calls[0][0];
    expect(card.webhookUrl).toBe("https://knox.example/hook");
    expect(card.accentColor).toBe("#dc2626");
    expect(card.mentions ?? []).toEqual([]);
    expect(card.facts?.map((f) => f.title)).toEqual(expect.arrayContaining(["Centre", "Type", "When"]));
    expect(card.facts?.find((f) => f.title === "Why flagged")?.value).toBe("Ambulance called");
    const urls = card.actions?.map((a) => a.url);
    expect(urls).toEqual([
      "https://eos.example/incidents?knox=as-1&incident=inc-1",
      "https://eos.example/incidents?incident=inc-1",
    ]);
    expect(card.actions?.map((a) => a.title)).toEqual(["Acknowledge", "Open record"]);

    const rows = rowsWritten();
    expect(rows.filter((r) => r.channel === "push")).toHaveLength(3);
    const teamsRows = rows.filter((r) => r.channel === "teams");
    expect(teamsRows).toHaveLength(1);
    expect(teamsRows[0]).toMatchObject({ recipientUserId: null, escalationLevel: 0, delivered: true, tier: "serious" });
  });

  it("falls back to TEAMS_WEBHOOK_URL when TEAMS_KNOX_WEBHOOK_URL is unset", async () => {
    delete process.env.TEAMS_KNOX_WEBHOOK_URL;
    await dispatch(0, "serious", recipients());
    expect(teamsMock.mock.calls[0][0].webhookUrl).toBe("https://default.example/hook");
  });

  it("complaint cards link Acknowledge and Open record to /knox?subject=", async () => {
    await dispatchLevel(prismaMock as never, {
      assessmentId: "as-2",
      subject: {
        type: "complaint",
        service: svc,
        record: { id: "c1", category: "supervision", receivedAt: new Date("2026-10-20T01:00:00Z") } as never,
      },
      rules: rules("serious", { ruleHits: ["complaint_notifiable"] }),
      recipients: recipients(),
      level: 0,
    });
    const card = teamsMock.mock.calls[0][0];
    expect(card.actions?.map((a) => a.url)).toEqual([
      "https://eos.example/knox?subject=complaint:c1",
      "https://eos.example/knox?subject=complaint:c1",
    ]);
  });

  it("shows clocks as due HH:mm d MMM in Sydney time, or OVERDUE", async () => {
    await dispatchLevel(prismaMock as never, {
      assessmentId: "as-1",
      subject: incidentSubject(),
      rules: rules("serious", {
        clocks: [
          { kind: "parent_24h", dueAt: "2026-12-21T03:05:00.000Z", basis: "Reg 86", overdue: false },
          { kind: "regulator", dueAt: "2020-01-01T00:00:00.000Z", basis: "Reg 176(2)(a)", overdue: true },
        ],
      }),
      recipients: recipients(),
      level: 0,
    });
    const facts = teamsMock.mock.calls[0][0].facts ?? [];
    const parent = facts.find((f) => f.title.includes("Parent"));
    const reg = facts.find((f) => f.title.includes("Regulator"));
    expect(parent?.value).toContain("due 14:05 21 Dec");
    expect(reg?.value).toContain("OVERDUE");
  });

  it("serious level 1 posts a Teams card mentioning owners and pushes owners", async () => {
    await dispatch(1, "serious", recipients({ owners: [person("own1"), person("own2")] }));

    const card = teamsMock.mock.calls[0][0];
    expect(card.mentions).toEqual([
      { email: "own1@amanaoshc.com.au", name: "Name own1" },
      { email: "own2@amanaoshc.com.au", name: "Name own2" },
    ]);
    const [, ids] = notifyMock.mock.calls[0] as unknown as [unknown, string[]];
    expect(ids).toEqual(["own1", "own2"]);

    const rows = rowsWritten();
    expect(rows.every((r) => r.escalationLevel === 1)).toBe(true);
    expect(rows.filter((r) => r.channel === "push").map((r) => r.recipientUserId)).toEqual(["own1", "own2"]);
    expect(rows.filter((r) => r.channel === "teams")).toHaveLength(1);
  });

  it("serious level 2 posts a Teams card mentioning owners again and does not push", async () => {
    await dispatch(2, "serious", recipients());
    expect(teamsMock.mock.calls[0][0].mentions).toHaveLength(1);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(rowsWritten().map((r) => [r.channel, r.escalationLevel])).toEqual([["teams", 2]]);
  });

  it("moderate level 1 pushes to state managers", async () => {
    await dispatch(1, "moderate", recipients());
    const [, ids] = notifyMock.mock.calls[0] as unknown as [unknown, string[]];
    expect(ids).toEqual(["sm1", "sm2"]);
    expect(teamsMock).not.toHaveBeenCalled();
    expect(rowsWritten()).toHaveLength(2);
  });

  it("moderate has no level 2, minor has no escalation", async () => {
    await dispatch(2, "moderate", recipients());
    await dispatch(1, "minor", recipients());
    expect(notifyMock).not.toHaveBeenCalled();
    expect(teamsMock).not.toHaveBeenCalled();
    expect(rowsWritten()).toEqual([]);
  });

  it("delivered=false on the Teams row when sendTeamsNotification returns false", async () => {
    teamsMock.mockResolvedValue(false);
    await dispatch(0, "serious", recipients());
    const teamsRow = rowsWritten().find((r) => r.channel === "teams");
    expect(teamsRow?.delivered).toBe(false);
  });

  it("delivered=false on push rows when notifyUsers creates nothing or throws; Teams still goes out", async () => {
    notifyMock.mockRejectedValue(new Error("db down"));
    await dispatch(0, "serious", recipients());
    expect(teamsMock).toHaveBeenCalledTimes(1);
    const rows = rowsWritten();
    expect(rows.filter((r) => r.channel === "push").every((r) => r.delivered === false)).toBe(true);
    expect(rows.find((r) => r.channel === "teams")?.delivered).toBe(true);
  });

  it("noDirector → state managers take level 0 for moderate AND serious; postOpsNote posts once with the service name", async () => {
    const r = recipients({ directors: [], noDirector: true });

    await dispatch(0, "moderate", r);
    let [, ids] = notifyMock.mock.calls[0] as unknown as [unknown, string[]];
    expect(ids).toEqual(["sm1", "sm2"]);
    expect(teamsMock).toHaveBeenCalledTimes(1); // the ops note only
    expect(teamsMock.mock.calls[0][0].body).toContain("No Director of Service configured for Arkana OSHC");
    expect(teamsMock.mock.calls[0][0].mentions ?? []).toEqual([]);

    teamsMock.mockClear();
    notifyMock.mockClear();
    await dispatch(0, "serious", r);
    [, ids] = notifyMock.mock.calls[0] as unknown as [unknown, string[]];
    expect(ids).toEqual(["sm1", "sm2"]);
    const opsNotes = teamsMock.mock.calls.filter((c) => c[0].body.includes("No Director of Service configured"));
    expect(opsNotes).toHaveLength(1);
  });

  it("no Director AND no State Manager → owners take level 0 (moderate reaches someone) and the ops note says so", async () => {
    const r = recipients({ directors: [], stateManagers: [], noDirector: true });

    await dispatch(0, "moderate", r);
    const [, ids] = notifyMock.mock.calls[0] as unknown as [unknown, string[]];
    expect(ids).toEqual(["own1"]);
    const rows = rowsWritten();
    expect(rows.map((x) => [x.channel, x.recipientUserId])).toEqual([["push", "own1"]]);
    expect(teamsMock).toHaveBeenCalledTimes(1); // the ops note only
    expect(teamsMock.mock.calls[0][0].body).toBe(
      "No Director of Service or State Manager configured for Arkana OSHC. Owners have been alerted instead.",
    );

    teamsMock.mockClear();
    notifyMock.mockClear();
    await dispatch(0, "serious", r);
    expect((notifyMock.mock.calls[0] as unknown as [unknown, string[]])[1]).toEqual(["own1"]);
  });

  it("does not post the no-director note on escalation levels", async () => {
    await dispatch(1, "serious", recipients({ directors: [], noDirector: true }));
    const opsNotes = teamsMock.mock.calls.filter((c) => c[0].body.includes("No Director of Service configured"));
    expect(opsNotes).toHaveLength(0);
  });

  it("includes the model rationale on the card when given", async () => {
    await dispatch(1, "serious", recipients(), { rationale: "Head injury with vomiting." });
    expect(teamsMock.mock.calls[0][0].body).toContain("Head injury with vomiting.");
  });
});

describe("postOpsNote", () => {
  it("posts a plain card to the Knox webhook and never throws", async () => {
    await postOpsNote("Title", "Body");
    expect(teamsMock).toHaveBeenCalledWith({ title: "Title", body: "Body", webhookUrl: "https://knox.example/hook" });

    teamsMock.mockRejectedValue(new Error("boom"));
    await expect(postOpsNote("Title", "Body")).resolves.toBeUndefined();
  });
});

describe("runEscalationSweep", () => {
  const NOW = new Date("2026-10-20T04:00:00Z");
  const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

  interface FakeAlert {
    escalationLevel: number;
    sentAt: Date;
    acknowledgedAt?: Date | null;
  }
  function assessment(id: string, tier: "moderate" | "serious", alerts: FakeAlert[], subjectId = `inc-${id}`) {
    return {
      id,
      tier,
      subjectType: "incident",
      subjectId,
      serviceId: "svc-1",
      ruleHits: ["ambulance_called"],
      clocks: [] as unknown,
      rationale: null as string | null,
      createdAt: alerts.length ? new Date(Math.min(...alerts.map((a) => a.sentAt.getTime()))) : NOW,
      alerts: alerts.map((a) => ({ acknowledgedAt: null, ...a })),
    };
  }
  /** Acknowledged sibling assessments, as the sweep's second query returns them. */
  let acked: Array<{ subjectType: string; subjectId: string; createdAt: Date }> = [];
  type SweepWhere = { alerted?: boolean; OR?: Array<{ subjectType: string; subjectId: string }> };
  function load(...rows: ReturnType<typeof assessment>[]) {
    acked = [];
    // Input-routed: the candidate query filters `alerted`; the acknowledged
    // sibling lookup filters by subject.
    prismaMock.triageAssessment.findMany.mockImplementation((async (args: { where: SweepWhere }) =>
      args.where.alerted
        ? rows
        : acked.filter((r) =>
            (args.where.OR ?? []).some((s) => s.subjectType === r.subjectType && s.subjectId === r.subjectId),
          )) as never);
    prismaMock.incidentRecord.findUnique.mockImplementation((async (args: { where: { id: string } }) => ({
      id: args.where.id,
      serviceId: "svc-1",
      incidentType: "injury",
      incidentDate: minsAgo(30),
      childName: "Ali Smith",
      deleted: false,
      service: svc,
    })) as never);
    resolveMock.mockResolvedValue(recipients());
  }
  const levelsDispatched = () =>
    [...new Set(rowsWritten().map((r) => `${r.assessmentId}:${r.escalationLevel}`))];

  it("ESCALATION constant", () => {
    expect(ESCALATION).toEqual({ moderate: [60], serious: [15, 30] });
  });

  it("queries only alerted assessments without an acknowledged alert", async () => {
    load();
    await runEscalationSweep(prismaMock as never, NOW);
    const arg = prismaMock.triageAssessment.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(arg.where.alerted).toBe(true);
    expect(arg.where.alerts).toEqual({ none: { acknowledgedAt: { not: null } } });
  });

  it("serious unacknowledged 16 min after level 0 → level 1", async () => {
    load(assessment("a", "serious", [{ escalationLevel: 0, sentAt: minsAgo(16) }]));
    const res = await runEscalationSweep(prismaMock as never, NOW);
    expect(res).toEqual({ escalated: 1 });
    expect(levelsDispatched()).toEqual(["a:1"]);
    expect(teamsMock).toHaveBeenCalledTimes(1);
  });

  it("serious 14 min after level 0 → nothing", async () => {
    load(assessment("a", "serious", [{ escalationLevel: 0, sentAt: minsAgo(14) }]));
    const res = await runEscalationSweep(prismaMock as never, NOW);
    expect(res).toEqual({ escalated: 0 });
    expect(rowsWritten()).toEqual([]);
    expect(teamsMock).not.toHaveBeenCalled();
  });

  it("level 1 exists → level 2 only after 30 min cumulative from level 0", async () => {
    // level 1 was sent 5 min ago (late); level 0 was 29 min ago → not yet.
    load(
      assessment("a", "serious", [
        { escalationLevel: 0, sentAt: minsAgo(29) },
        { escalationLevel: 1, sentAt: minsAgo(5) },
      ]),
    );
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 0 });

    load(
      assessment("a", "serious", [
        { escalationLevel: 0, sentAt: minsAgo(31) },
        { escalationLevel: 1, sentAt: minsAgo(5) },
        { escalationLevel: 1, sentAt: minsAgo(5) },
      ]),
    );
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 1 });
    expect(levelsDispatched()).toEqual(["a:2"]);
  });

  it("acknowledged → nothing (even if the query returned it)", async () => {
    load(
      assessment("a", "serious", [
        { escalationLevel: 0, sentAt: minsAgo(40), acknowledgedAt: minsAgo(20) },
        { escalationLevel: 0, sentAt: minsAgo(40) },
      ]),
    );
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 0 });
    expect(rowsWritten()).toEqual([]);
  });

  it("re-triage: an acknowledgement on a NEWER assessment of the same record stops the older ladder", async () => {
    // Moderate A alerted 61 min ago; serious B for the same incident was
    // acknowledged. A's 60-minute ladder must not fire.
    load(assessment("a", "moderate", [{ escalationLevel: 0, sentAt: minsAgo(61) }], "inc-1"));
    acked.push({ subjectType: "incident", subjectId: "inc-1", createdAt: minsAgo(30) });
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 0 });
    expect(rowsWritten()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("an acknowledgement on an OLDER assessment does not stop a later (tier-raising) alert's ladder", async () => {
    load(assessment("b", "serious", [{ escalationLevel: 0, sentAt: minsAgo(16) }], "inc-1"));
    acked.push({ subjectType: "incident", subjectId: "inc-1", createdAt: minsAgo(120) });
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 1 });
    expect(levelsDispatched()).toEqual(["b:1"]);
  });

  it("an acknowledgement on another record never stops this one", async () => {
    load(assessment("a", "serious", [{ escalationLevel: 0, sentAt: minsAgo(16) }], "inc-1"));
    acked.push({ subjectType: "incident", subjectId: "inc-2", createdAt: NOW });
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 1 });
  });

  it("max level reached → nothing", async () => {
    load(
      assessment("a", "serious", [
        { escalationLevel: 0, sentAt: minsAgo(90) },
        { escalationLevel: 1, sentAt: minsAgo(70) },
        { escalationLevel: 2, sentAt: minsAgo(50) },
      ]),
    );
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 0 });
    expect(rowsWritten()).toEqual([]);
  });

  it("moderate escalates once after 60 min to state managers, then never again", async () => {
    load(assessment("m", "moderate", [{ escalationLevel: 0, sentAt: minsAgo(61) }]));
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 1 });
    const [, ids] = notifyMock.mock.calls[0] as unknown as [unknown, string[]];
    expect(ids).toEqual(["sm1", "sm2"]);

    notifyMock.mockClear();
    load(
      assessment("m", "moderate", [
        { escalationLevel: 0, sentAt: minsAgo(200) },
        { escalationLevel: 1, sentAt: minsAgo(140) },
      ]),
    );
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("an empty recipient set writes one marker row and the next sweep does not repeat the level", async () => {
    load(assessment("m", "moderate", [{ escalationLevel: 0, sentAt: minsAgo(61) }]));
    resolveMock.mockResolvedValue(recipients({ stateManagers: [] }));

    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
    const rows = rowsWritten();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      assessmentId: "m",
      channel: "push",
      recipientUserId: null,
      delivered: false,
      escalationLevel: 1,
    });

    // Second sweep: the marker row is now part of the assessment's alerts.
    prismaMock.triageAlert.createMany.mockClear();
    load(
      assessment("m", "moderate", [
        { escalationLevel: 0, sentAt: minsAgo(61) },
        { escalationLevel: 1, sentAt: NOW },
      ]),
    );
    resolveMock.mockResolvedValue(recipients({ stateManagers: [] }));
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 0 });
    expect(rowsWritten()).toEqual([]);
  });

  it("carries the assessment rationale onto escalation cards", async () => {
    const a = assessment("a", "serious", [{ escalationLevel: 0, sentAt: minsAgo(16) }]);
    a.rationale = "Head injury with vomiting.";
    load(a);
    await runEscalationSweep(prismaMock as never, NOW);
    expect(teamsMock.mock.calls[0][0].body).toContain("Head injury with vomiting.");
  });

  it("escalation cards show clocks recomputed from the LIVE record, not the stored snapshot", async () => {
    const a = assessment("a", "serious", [{ escalationLevel: 0, sentAt: minsAgo(16) }]);
    // Stored at level 0: parent notice outstanding.
    a.clocks = [{ kind: "parent_24h", dueAt: minsAgo(-600).toISOString(), basis: "Reg 86", overdue: false }];
    load(a);
    // Since then the family has been told — not a trigger field, so no re-triage.
    prismaMock.incidentRecord.findUnique.mockImplementation((async (args: { where: { id: string } }) => ({
      id: args.where.id,
      serviceId: "svc-1",
      incidentType: "injury",
      incidentDate: minsAgo(30),
      parentNotified: true,
      childName: "Ali Smith",
      deleted: false,
      service: svc,
    })) as never);
    await runEscalationSweep(prismaMock as never, NOW);
    const facts = (teamsMock.mock.calls[0][0].facts ?? []) as Array<{ title: string }>;
    expect(facts.map((f) => f.title)).not.toContain("Parent notice");

    // And a record still waiting on the family does show it.
    teamsMock.mockClear();
    prismaMock.triageAlert.createMany.mockClear();
    load(assessment("b", "serious", [{ escalationLevel: 0, sentAt: minsAgo(16) }]));
    await runEscalationSweep(prismaMock as never, NOW);
    const facts2 = (teamsMock.mock.calls[0][0].facts ?? []) as Array<{ title: string }>;
    expect(facts2.map((f) => f.title)).toContain("Parent notice");
  });

  it("moderate at 59 min → nothing", async () => {
    load(assessment("m", "moderate", [{ escalationLevel: 0, sentAt: minsAgo(59) }]));
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 0 });
  });

  it("skips an assessment whose subject is gone and keeps going", async () => {
    load(
      assessment("gone", "serious", [{ escalationLevel: 0, sentAt: minsAgo(20) }]),
      assessment("ok", "serious", [{ escalationLevel: 0, sentAt: minsAgo(20) }]),
    );
    prismaMock.incidentRecord.findUnique.mockImplementation((async (args: { where: { id: string } }) =>
      args.where.id === "inc-gone"
        ? null
        : { id: args.where.id, serviceId: "svc-1", incidentType: "injury", incidentDate: minsAgo(30), childName: null, deleted: false, service: svc }) as never);
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 1 });
    expect(levelsDispatched()).toEqual(["ok:1"]);
  });

  it("a failure on one assessment does not stop the others", async () => {
    load(
      assessment("bad", "serious", [{ escalationLevel: 0, sentAt: minsAgo(20) }]),
      assessment("ok", "serious", [{ escalationLevel: 0, sentAt: minsAgo(20) }]),
    );
    resolveMock.mockImplementation((async (_db: unknown, service: { id: string }) => {
      void service;
      if (resolveMock.mock.calls.length === 1) throw new Error("db blip");
      return recipients();
    }) as never);
    expect(await runEscalationSweep(prismaMock as never, NOW)).toEqual({ escalated: 1 });
    expect(levelsDispatched()).toEqual(["ok:1"]);
  });
});
